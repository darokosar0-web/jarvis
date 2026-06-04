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

function extractKeyInfo(messages) {
  const text = messages.map(m => typeof m.content === 'string' ? m.content : '').join(' ');
  const info = {
    mentions: [],
    numbers: [],
    keywords: []
  };

  // Extract numbers and money
  const numbers = text.match(/£[\d,]+|\d+%|\d+ clients?|\d+ days?/gi) || [];
  info.numbers = [...new Set(numbers)].slice(0, 10);

  // Extract capitalized names/places
  const names = text.match(/\b[A-Z][a-z]+(?:\s[A-Z][a-z]+)?\b/g) || [];
  info.mentions = [...new Set(names)].slice(0, 10);

  // Extract action words
  const actions = text.match(/\b(need to|going to|will|should|must|plan to|want to)\s+\w+/gi) || [];
  info.keywords = [...new Set(actions)].slice(0, 5);

  return info;
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

  // GET — load persisted session data
  if (req.method === 'GET') {
    try {
      const stored = await redis.get(MEMORY_KEY);
      console.log('[memory] Redis returned:', stored ? `${typeof stored}` : 'null');
      const sessionData = parseRedisValue(stored);
      console.log('[memory] GET ok — data found:', sessionData ? 'YES' : 'NO');
      res.status(200).json(sessionData || { messages: [], keyInfo: { mentions: [], numbers: [], keywords: [] } });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error('[memory] GET failed:', errorMsg);
      res.status(200).json({ messages: [], keyInfo: { mentions: [], numbers: [], keywords: [] }, _error: errorMsg });
    }
    return;
  }

  // POST — save conversation and extract key info
  if (req.method === 'POST') {
    try {
      const { messages } = req.body;

      if (!Array.isArray(messages) || messages.length < 2) {
        console.log('[memory] Skipping — too few messages:', messages?.length);
        res.status(200).json({ skipped: true });
        return;
      }

      console.log('[memory] Processing POST with', messages.length, 'messages');

      const now = new Date().toISOString();
      const lastTenMessages = messages.slice(-10);
      const keyInfo = extractKeyInfo(messages);

      const sessionData = {
        date: now,
        messageCount: messages.length,
        messages: lastTenMessages,
        keyInfo: keyInfo
      };

      await redis.set(MEMORY_KEY, JSON.stringify(sessionData));
      console.log('[memory] Saved conversation data:', messages.length, 'messages');

      res.status(200).json({ success: true, saved: sessionData });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error('[memory] POST failed:', errorMsg);
      res.status(500).json({ error: errorMsg });
    }
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
};
