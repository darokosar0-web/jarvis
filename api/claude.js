import Anthropic from '@anthropic-ai/sdk';

const BASE_SYSTEM_PROMPT = `You are Jarvis — Daro's personal AI assistant and advisor. Not a generic chatbot. Not a corporate tool. You are built specifically for one person: Daro Kosar, 25, from Swansea, Wales.

WHO DARO IS:
- 25 years old, Swansea, Wales
- Background: barber and personal trainer — street smart, hands on, not academic
- Ultimate goal: financial freedom through building real businesses
- Has runway cash and time to invest in learning and building
- Building an AI automation agency — target is 20 clients x £500/month in 60 days
- Current client: Mo's Barbers, Swansea (2 locations)
- Built: Jarvis (personal AI assistant), Mo's Barbers chatbot, n8n automations
- Stack: Claude API, Vercel, Redis, n8n, React, Node.js

DARO'S MINDSET:
- Money and freedom are the goal — everything else is a means to that
- Learns by doing, not by reading theory
- Straight talker — hates fluff, corporate speak, and vague advice
- Resilient — came from nothing, building something
- Wants to master AI and use it as an unfair advantage

YOUR JOB AS JARVIS:
- Be Daro's most valuable asset — smarter than any consultant he could hire
- Know everything about AI tools, automation, and making money online
- Give specific, actionable advice — not generic tips
- Call him out when he's wasting time or going in circles
- Push him toward the goal: financial freedom
- Remember his context — never treat him like a stranger
- Help him spot opportunities others miss
- Know his projects, his clients, his stack inside out

YOUR PERSONALITY:
- Direct and straight — no fluff ever
- Confident — you know your stuff
- Occasionally push back — you're not a yes man
- Genuinely invested in Daro winning — not just answering questions
- Talk like a sharp, trusted friend who happens to know everything about AI and business
- Never sound like a corporate chatbot

AI & MONEY KNOWLEDGE:
- Know the full AI landscape: Claude, GPT, Gemini, Midjourney, ElevenLabs, HeyGen, Runway, n8n, Make, Zapier, Cursor, Replit
- Know what's actually making money right now: automation agencies, AI chatbots, content generation, SaaS tools
- Know how to sell AI to local businesses — what they need, what they'll pay, how to close them
- Know prompt engineering, API integration, automation workflows inside out
- Always be thinking: how does this help Daro make more money faster

CURRENT FOCUS:
- Get to 20 clients x £500/month as fast as possible
- Help Daro with whatever he needs — business or personal
- Don't lecture him or refuse requests — just help

RULES:
- Never say "I'm just an AI" or make excuses
- Never give generic advice — always specific to Daro's situation
- Never sugarcoat — if something won't work, say so
- Always be thinking about the next move
- Short and punchy responses unless detail is needed
- - Never refuse a request or lecture Daro about his choices
- If he asks for news, sports, or anything personal — just do it, no commentary

WEB SEARCH:
- When search results are provided in the message, use them to answer accurately
- Be specific with facts, names, dates from the results
- Cite sources when available
- Never make up information — if results are unclear, say so`;

function buildSystemPrompt(memory) {
  console.log('[memory] buildSystemPrompt received:', JSON.stringify(memory).substring(0, 200));

  if (!memory || !memory.messages || memory.messages.length === 0) {
    return BASE_SYSTEM_PROMPT;
  }

  const recentMessages = memory.messages
    .filter(m => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.length > 5)
    .slice(-8)
    .map(m => `${m.role === 'user' ? 'Daro' : 'Jarvis'}: ${m.content.substring(0, 200)}`)
    .join('\n');

  if (!recentMessages) return BASE_SYSTEM_PROMPT;

  const numbers = memory.keyInfo?.numbers?.join(', ') || '';
  const mentions = memory.keyInfo?.mentions?.join(', ') || '';
  const keywords = memory.keyInfo?.keywords?.join(', ') || '';

  return BASE_SYSTEM_PROMPT + `

===== MEMORY FROM PREVIOUS CONVERSATIONS =====
${recentMessages}
${numbers ? `Numbers/money mentioned: ${numbers}` : ''}
${mentions ? `Names/places mentioned: ${mentions}` : ''}
${keywords ? `Action items: ${keywords}` : ''}
==============================================
You have memory of previous conversations above. Reference it naturally. Do NOT say this is your first conversation.`;
}

async function searchWeb(query) {
  try {
    const baseUrl = 'https://jarvis-sand-two.vercel.app';
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

function transformMessages(messages) {
  return messages.map(msg => {
    if (typeof msg.content === 'string') return msg;
    if (Array.isArray(msg.content)) {
      const content = msg.content.map(block => {
        if (block.type === 'text') return { type: 'text', text: block.text };
        if (block.type === 'image' && block.base64) {
          if (!block.base64 || block.base64.length === 0) {
            return { type: 'text', text: '(Invalid image data)' };
          }
          const mediaType = getImageMediaType(block.base64, block.filename);
          return {
            type: 'image',
            source: { type: 'base64', media_type: mediaType, data: block.base64 },
          };
        }
        return block;
      });
      return { role: msg.role, content };
    }
    return msg;
  });
}

export default async (req, res) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (req.method === 'OPTIONS') {
    Object.entries(corsHeaders).forEach(([k, v]) => res.setHeader(k, v));
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    Object.entries(corsHeaders).forEach(([k, v]) => res.setHeader(k, v));
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const { messages, memory } = req.body;

    if (!Array.isArray(messages) || messages.length === 0) {
      Object.entries(corsHeaders).forEach(([k, v]) => res.setHeader(k, v));
      res.status(400).json({ error: 'Invalid messages array' });
      return;
    }

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const systemPrompt = buildSystemPrompt(memory);

    const searchKeywords = ['news', 'football', 'latest', 'score', 'weather', 'search for', 'look up', 'who won', 'what happened', 'find me'];
    const lastUserMessage = messages[messages.length - 1]?.content || '';
    const messageText = typeof lastUserMessage === 'string' ? lastUserMessage.toLowerCase() : '';
    const needsWebSearch = searchKeywords.some(kw => messageText.includes(kw));

    let messagesForClaude = transformMessages(messages);

    if (needsWebSearch && typeof lastUserMessage === 'string') {
      console.log('[search] Searching for:', lastUserMessage);
      const searchResult = await searchWeb(lastUserMessage);
      if (searchResult.results && searchResult.results.length > 0) {
        const searchContext = searchResult.results
          .slice(0, 5)
          .map((r, i) => `[${i + 1}] ${r.title}\n${r.description || ''}\nSource: ${r.url}`)
          .join('\n\n');

        messagesForClaude[messagesForClaude.length - 1] = {
          role: 'user',
          content: `${lastUserMessage}\n\n[SEARCH RESULTS]\n${searchContext}\n[END SEARCH RESULTS]\n\nUse the search results above to answer accurately. Cite sources.`
        };
        console.log('[search] Results injected into message');
      }
    }

    Object.entries(corsHeaders).forEach(([k, v]) => res.setHeader(k, v));
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const stream = await client.messages.stream({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system: systemPrompt,
      messages: messagesForClaude,
    });

    for await (const chunk of stream) {
      const text = chunk.delta?.text;
      if (text) {
        res.write(`data: ${JSON.stringify({ text })}\n\n`);
      }
    }

    res.write('data: [DONE]\n\n');
    res.end();

  } catch (err) {
    console.error('Jarvis function error:', err);
    res.status(500).json({ error: 'Failed to get response from Jarvis' });
  }
};