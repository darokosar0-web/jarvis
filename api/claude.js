import Anthropic from '@anthropic-ai/sdk';

const BASE_SYSTEM_PROMPT = `You are Jarvis, the personal AI advisor and trusted partner for Daro Hassani, 25, from Swansea, Wales. Daro is a barber and personal trainer turned AI automation agency founder. He is hardworking, resilient, straightforward and down to earth. No fluff or corporate speak — talk to him straight like a trusted advisor and friend.

DARO'S SITUATION:
- Building an AI automation agency that serves any business that needs it
- Goes where the money is — whatever niche is trending and profitable
- Currently building from the ground up with limited runway
- Big vision but pragmatic — follows what works, not what he planned
- Balances ambition with the reality of his current situation

DARO'S CHARACTER:
- Hardworking and resilient — bounces back from setbacks
- Straightforward and down to earth — dislikes corporate nonsense
- Big vision but knows he has to start somewhere
- Open minded — adapts strategy based on what's working
- Values real results over theoretical perfection

YOUR ROLE AS JARVIS:
You are Daro's:
- Business advisor and strategist
- Accountability coach and sounding board
- Trend spotter and opportunity identifier
- Honest feedback provider who pushes when he doubts himself
- Career and life mentor who understands both his ambitions and constraints

YOUR RESPONSIBILITIES:
- Help spot trends and opportunities in any niche (what's hot and profitable)
- Draft pitches, emails, strategies, proposals
- Help identify which businesses are easiest to sell AI automation to
- Advise on pricing, packaging and upselling strategies
- Think like a hungry entrepreneur — always looking for the next opportunity
- Know the AI tools landscape: n8n, Make, Zapier, Claude, GPT, Midjourney, ElevenLabs, HeyGen
- Push him when he doubts himself, keep him focused but flexible
- Be straight with him — no sugar coating, real talk
- Show genuine interest in his life and progress, not just transactions
- Follow up on previous decisions and action items
- Remember personal details and show you care about his wellbeing

CORE PHILOSOPHY:
- Never let him quit on his vision
- Always be honest and direct
- Use memory from previous conversations to build genuine continuity
- Show you understand both his business goals AND personal context
- Be his advisor, not just an AI tool

YOU HAVE ACCESS TO WEB SEARCH:
- Use web_search when you need current information about:
  - AI trends, news, and developments
  - Market opportunities and competitive landscape
  - Tool pricing, features, and availability
  - Any "current", "latest", "today" questions
- Cite sources with URLs when using search results`;

function buildSystemPrompt(memory) {
  if (!memory || !memory.summary) return BASE_SYSTEM_PROMPT;

  if (memory && memory.messages && !memory.summary) {
    const recentMessages = memory.messages
      .slice(-6)
      .map(m => `${m.role}: ${typeof m.content === 'string' ? m.content : ''}`)
      .join('\n');
    const keywords = memory.keyInfo?.keywords ? memory.keyInfo.keywords.join(', ') : '';
    const numbers = memory.keyInfo?.numbers ? memory.keyInfo.numbers.join(', ') : '';
    const mentions = memory.keyInfo?.mentions ? memory.keyInfo.mentions.join(', ') : '';
    return BASE_SYSTEM_PROMPT + `
===== MEMORY FROM PREVIOUS CONVERSATIONS =====
Recent messages:
${recentMessages}
Key numbers mentioned: ${numbers}
People/places mentioned: ${mentions}
Action items: ${keywords}
==============================================`;
  }

  const truncateSummary = (text, maxChars = 200) => {
    if (!text) return '';
    return text.length > maxChars ? text.substring(0, maxChars) + '...' : text;
  };

  const last2Sessions = memory.sessions ? memory.sessions.slice(0, 2) : [];
  const sessionsSummary = last2Sessions
    .map((session, index) => {
      const date = new Date(session.date).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
      const summary = truncateSummary(session.summary, 200);
      return `Session ${last2Sessions.length - index}: ${date}\n${summary}`;
    })
    .join('\n\n');

  return BASE_SYSTEM_PROMPT + `

===== MEMORY FROM PREVIOUS CONVERSATIONS (Last 3 Sessions) =====
${sessionsSummary}

${memory.sessionCount ? `Total conversations: ${memory.sessionCount}` : ''}
========================================================

IMPORTANT MEMORY USAGE GUIDELINES:
- Reference specific details from memory naturally (names, clients, numbers, decisions)
- Ask follow-up questions on previous topics to show you remember and care about continuity
- Proactively remind him of action items or commitments made in past conversations
- Show understanding of his personal situation, mood, and communication style
- Reference patterns you've noticed in his thinking and decision-making
- Use this memory to be more strategic and personalized in your advice
- Don't treat memory as a checklist to read — weave it into natural conversation

Remember: You know Daro well from multiple previous conversations. Act like a trusted advisor who understands both his business and personal context.`;
}

const TOOLS = [
  {
    name: 'web_search',
    description: 'Search the web for current information about news, trends, events, and recent developments. Use this when you need live data or current information.',
    input_schema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'The search query to find information about',
        },
      },
      required: ['query'],
    },
  },
];

async function searchWeb(query) {
  try {
    const baseUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000';
    const url = `${baseUrl}/api/brave-search`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
    });

    if (!response.ok) {
      const data = await response.json();
      console.error('Search error:', data.error);
      return { error: data.error || 'Search failed' };
    }

    const data = await response.json();
    return { results: data.results };
  } catch (err) {
    console.error('Search function error:', err);
    return { error: 'Failed to execute search' };
  }
}

export default async (req, res) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };

  if (req.method === 'OPTIONS') {
    Object.entries(headers).forEach(([key, value]) => {
      res.setHeader(key, value);
    });
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    Object.entries(headers).forEach(([key, value]) => {
      res.setHeader(key, value);
    });
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    console.log('[timer] Request started:', Date.now());
    const { messages, memory } = req.body;

    if (!Array.isArray(messages) || messages.length === 0) {
      Object.entries(headers).forEach(([key, value]) => {
        res.setHeader(key, value);
      });
      res.status(400).json({ error: 'Invalid messages array' });
      return;
    }

    console.log('[timer] Fetching memory:', Date.now());
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const systemPrompt = buildSystemPrompt(memory);
    console.log('[timer] Memory done:', Date.now());

    console.log('[claude] Memory received:', memory ? 'YES' : 'NO', memory?.sessionCount ? `(${memory.sessionCount} sessions)` : '');
    console.log('[claude] System prompt includes memory:', systemPrompt.includes('MEMORY FROM PREVIOUS SESSIONS'));

    const searchKeywords = ['search', 'find', 'look up', 'latest', 'news', 'current'];
    const lastUserMessage = messages[messages.length - 1]?.content || '';
    const messageText = typeof lastUserMessage === 'string' ? lastUserMessage.toLowerCase() : '';
    const shouldUseTools = searchKeywords.some(keyword => messageText.includes(keyword));
    const toolsToUse = shouldUseTools ? TOOLS : [];

    // Helper function to detect image media type from base64
    function getImageMediaType(base64, filename = '') {
      if (!base64) return 'image/jpeg';

      const header = base64.substring(0, 12);
      if (header.startsWith('/9j/')) return 'image/jpeg';
      if (header.startsWith('iVBORw0KGgo')) return 'image/png';
      if (header.startsWith('R0lGODlh')) return 'image/gif';
      if (header.startsWith('UklGRi')) return 'image/webp';

      if (filename.endsWith('.png')) return 'image/png';
      if (filename.endsWith('.gif')) return 'image/gif';
      if (filename.endsWith('.webp')) return 'image/webp';

      return 'image/jpeg';
    }

    // Transform messages to Claude API format, handling image content
    let messagesForClaude = messages.map(msg => {
      if (typeof msg.content === 'string') {
        return msg;
      }
      if (Array.isArray(msg.content)) {
        const content = msg.content.map(block => {
          if (block.type === 'text') {
            return { type: 'text', text: block.text };
          }
          if (block.type === 'image' && block.base64) {
            if (!block.base64 || block.base64.length === 0) {
              console.warn('[claude] Empty base64 image data received');
              return { type: 'text', text: '(Invalid image data)' };
            }

            const mediaType = getImageMediaType(block.base64, block.filename);
            console.log('[claude] Processing image:', block.filename || 'unnamed', 'type:', mediaType, 'size:', block.base64.length);

            return {
              type: 'image',
              source: {
                type: 'base64',
                media_type: mediaType,
                data: block.base64,
              },
            };
          }
          return block;
        });
        return { role: msg.role, content };
      }
      return msg;
    });
    console.log('[timer] Calling Claude:', Date.now());
    let response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system: systemPrompt,
      tools: toolsToUse,
      messages: messagesForClaude,
    });

    const maxIterations = 2;
    let iteration = 0;

    while (response.stop_reason === 'tool_use' && iteration < maxIterations) {
      iteration++;

      const toolUseBlocks = response.content.filter(block => block.type === 'tool_use');
      if (toolUseBlocks.length === 0) break;

      const toolResults = [];
      for (const toolUseBlock of toolUseBlocks) {
        let toolResult;
        if (toolUseBlock.name === 'web_search') {
          const searchResult = await searchWeb(toolUseBlock.input.query);
          if (searchResult.error) {
            toolResult = `Search error: ${searchResult.error}`;
          } else {
            toolResult = JSON.stringify({
              count: searchResult.results.length,
              results: searchResult.results,
            });
          }
        } else {
          toolResult = `Unknown tool: ${toolUseBlock.name}`;
        }

        toolResults.push({
          type: 'tool_result',
          tool_use_id: toolUseBlock.id,
          content: toolResult,
        });
      }

      messagesForClaude = [
        ...messagesForClaude,
        { role: 'assistant', content: response.content },
        {
          role: 'user',
          content: toolResults,
        },
      ];

      response = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        system: systemPrompt,
        tools: toolsToUse,
        messages: messagesForClaude,
      });
    }

    const textBlock = response.content.find(block => block.type === 'text');
    const content = textBlock ? textBlock.text : 'No response generated';

    console.log('[timer] Done:', Date.now());
    Object.entries(headers).forEach(([key, value]) => {
      res.setHeader(key, value);
    });
    res.status(200).json({ content });
  } catch (err) {
    console.error('Jarvis function error:', err);
    Object.entries(headers).forEach(([key, value]) => {
      res.setHeader(key, value);
    });
    res.status(500).json({ error: 'Failed to get response from Jarvis' });
  }
};
