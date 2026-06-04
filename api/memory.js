import Anthropic from '@anthropic-ai/sdk';
import { Redis } from '@upstash/redis';

const MEMORY_KEY = 'daro-memory';

if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
  console.warn('[memory] Upstash Redis environment variables not configured');
}

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL || '',
  token: process.env.UPSTASH_REDIS_REST_TOKEN || '',
});

function parseRedisValue(value) {
  if (!value) return null;
  if (typeof value === 'object') return value;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      console.warn('[memory] Failed to parse Redis value:', value.substring(0, 100));
      return null;
    }
  }
  return null;
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

export default async (req, res) => {
  // Set CORS headers
  Object.entries(corsHeaders).forEach(([key, value]) => {
    res.setHeader(key, value);
  });

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // GET — load persisted memory
  if (req.method === 'GET') {
    try {
      const stored = await redis.get(MEMORY_KEY);
      console.log('[memory] Redis returned:', stored ? `${typeof stored} (${stored.toString ? stored.toString().substring(0, 50) : 'N/A'})` : 'null');
      const memory = parseRedisValue(stored);
      console.log('[memory] GET ok — sessions:', memory?.sessionCount ?? 0, '— summary:', memory?.summary ? 'YES' : 'NO');
      res.status(200).json(memory || { sessions: [], summary: null });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error('[memory] GET failed:', errorMsg);
      res.status(200).json({ sessions: [], summary: null, _error: errorMsg });
    }
    return;
  }

  // POST — summarise conversation and persist
  if (req.method === 'POST') {
    try {
      const { messages } = req.body;

      if (!Array.isArray(messages) || messages.length < 2) {
        console.log('[memory] Skipping — too few messages:', messages?.length);
        res.status(200).json({ skipped: true });
        return;
      }

      console.log('[memory] Processing POST with', messages.length, 'messages');

      const convText = messages
        .map(m => `${m.role === 'assistant' ? 'Jarvis' : 'Daro'}: ${m.content}`)
        .join('\n\n');

      if (messages.length >= 6) {
        const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

        // Comprehensive session summary capturing all details
        const sessionRes = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 300,
        messages: [{
          role: 'user',
          content: `Extract and summarize EVERYTHING important from this conversation with Daro. Capture:
- PERSONAL DETAILS (mood, challenges, personal life updates, preferences, interests)
- BUSINESS (clients, ideas, strategies, pricing, goals, targets)
- DECISIONS made during this conversation
- ACTION ITEMS and next steps
- KEY INSIGHTS about Daro's thinking or priorities
- Any preferences or patterns in how Daro likes to work

Be specific and concrete. Include numbers, names, and dates where mentioned. This will be used to recall context in future conversations.\n\n${convText}`,
        }],
      });

      const sessionSummary = sessionRes.content[0].text;
      const now = new Date().toISOString();

      // Load existing memory
      let memory = { sessions: [], summary: null };
      try {
        const stored = await redis.get(MEMORY_KEY);
        const parsed = parseRedisValue(stored);
        if (parsed) memory = parsed;
      } catch (e) {
        const errorMsg = e instanceof Error ? e.message : String(e);
        console.warn('[memory] Could not read existing memory:', errorMsg);
      }

      memory.sessions = [
        { date: now, summary: sessionSummary },
        ...memory.sessions,
      ];

      // Rebuild overall profile
      const sessionsText = memory.sessions
        .map(s => `[${new Date(s.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}] ${s.summary}`)
        .join('\n');

      const profileRes = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 500,
        messages: [{
          role: 'user',
          content: `From these session summaries, create a comprehensive living profile of Daro. Organize into these sections:

PERSONAL PROFILE
- Personality traits, mood patterns, communication style
- Personal life situation, challenges, and concerns
- Values, motivations, what drives him
- Preferences (how he likes to work, communicate, be advised)

BUSINESS PROFILE
- Current business status and stage
- Clients (names, details, status)
- Revenue, pricing, targets, goals
- Services offered and ideas being explored
- Recent pivots or changes in strategy

CURRENT FOCUS & MOMENTUM
- What's he most focused on right now
- Active projects and timelines
- Recent wins or challenges
- What he needs help with most

ACTION ITEMS & NEXT STEPS
- Outstanding action items from conversations
- Decisions that need making
- Things to follow up on

KEY PATTERNS & INSIGHTS
- Recurring themes or concerns
- Decision-making style
- Learning and adaptation patterns

Be specific with names, numbers, dates. This profile should feel like you know Daro well.\n\n${sessionsText}`,
        }],
      });

      memory.summary = profileRes.content[0].text;
      memory.lastUpdated = now;
      memory.sessionCount = memory.sessions.length;
      memory.lastUpdated = now;
      memory.sessionCount = memory.sessions.length;

        await redis.set(MEMORY_KEY, JSON.stringify(memory));
        console.log('[memory] Saved — total sessions:', memory.sessionCount);

        res.status(200).json({ success: true, sessions: memory.sessionCount });
      } else {
        console.log('[memory] Too few messages (' + messages.length + ') — saving raw conversation without summarizing');
        let memory = { sessions: [], summary: null };
        try {
          const stored = await redis.get(MEMORY_KEY);
          const parsed = parseRedisValue(stored);
          if (parsed) memory = parsed;
        } catch (e) {
          const errorMsg = e instanceof Error ? e.message : String(e);
          console.warn('[memory] Could not read existing memory:', errorMsg);
        }

        memory.sessions = [
          { date: new Date().toISOString(), summary: `[Raw conversation - ${messages.length} messages]` },
          ...memory.sessions,
        ];

        await redis.set(MEMORY_KEY, JSON.stringify(memory));
        console.log('[memory] Saved raw conversation without summarizing');
        res.status(200).json({ skipped: true, reason: 'Too few messages for summarization' });
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error('[memory] POST failed:', errorMsg);
      res.status(500).json({ error: errorMsg });
    }
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
};
