import { Redis } from '@upstash/redis';
import Anthropic from '@anthropic-ai/sdk';

if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
  console.warn('[memory] Upstash Redis environment variables not configured');
}

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL || '',
  token: process.env.UPSTASH_REDIS_REST_TOKEN || '',
});

// Redis keys
const KEYS = {
  summary:  'jarvis:summary',   // rolling conversation summary
  recent:   'jarvis:recent',    // last 4 messages only
  facts:    'jarvis:facts',     // extracted facts about Daro
};

function parse(value) {
  if (!value) return null;
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch { return null; }
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

export default async (req, res) => {
  Object.entries(corsHeaders).forEach(([k, v]) => res.setHeader(k, v));

  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  // GET — load all memory layers
  if (req.method === 'GET') {
    try {
      const [summary, recent, facts] = await Promise.all([
        redis.get(KEYS.summary),
        redis.get(KEYS.recent),
        redis.get(KEYS.facts),
      ]);

      res.status(200).json({
        summary: parse(summary) || '',
        recent:  parse(recent)  || [],
        facts:   parse(facts)   || [],
      });
    } catch (err) {
      console.error('[memory] GET failed:', err.message);
      res.status(200).json({ summary: '', recent: [], facts: [] });
    }
    return;
  }

  // POST — save latest messages, summarise if needed
  if (req.method === 'POST') {
    try {
      const { messages } = req.body;
      if (!Array.isArray(messages) || messages.length < 2) {
        res.status(200).json({ skipped: true }); return;
      }

      // Always keep only last 4 messages in recent
      const recentMessages = messages
        .filter(m => m.role === 'user' || m.role === 'assistant')
        .slice(-4);

      await redis.set(KEYS.recent, JSON.stringify(recentMessages));

      // Summarise every 8 messages to keep context flat
      if (messages.length > 0 && messages.length % 8 === 0) {
        console.log('[memory] Triggering summarisation at', messages.length, 'messages');

        const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

        const existingSummary = parse(await redis.get(KEYS.summary)) || '';

        const toSummarise = messages
          .filter(m => m.role === 'user' || m.role === 'assistant')
          .slice(-8)
          .map(m => `${m.role === 'user' ? 'Daro' : 'Jarvis'}: ${typeof m.content === 'string' ? m.content : ''}`)
          .join('\n');

        const summaryResponse = await client.messages.create({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 300,
          messages: [{
            role: 'user',
            content: `Summarise this conversation in 3-5 bullet points. Focus on decisions made, things Daro wants to build, problems solved, and any facts about his business. Be concise.

${existingSummary ? `Previous summary:\n${existingSummary}\n\n` : ''}New messages:
${toSummarise}

Reply with bullet points only. No intro text.`
          }]
        });

        const newSummary = summaryResponse.content[0]?.text || '';
        await redis.set(KEYS.summary, JSON.stringify(newSummary));
        console.log('[memory] Summary updated');
      }

      // Extract facts from the last user message
      const lastUserMsg = messages.filter(m => m.role === 'user').slice(-1)[0];
      if (lastUserMsg && typeof lastUserMsg.content === 'string') {
        const existingFacts = parse(await redis.get(KEYS.facts)) || [];
        const factPatterns = [
          /my (?:new )?client is ([^.!?]+)/i,
          /i(?:'ve| have) (?:got|signed|closed) ([^.!?]+)/i,
          /i(?:'m| am) working on ([^.!?]+)/i,
          /i want to ([^.!?]+)/i,
          /i need to ([^.!?]+)/i,
        ];

        const newFacts = [];
        for (const pattern of factPatterns) {
          const match = lastUserMsg.content.match(pattern);
          if (match) {
            const fact = match[0].trim();
            if (!existingFacts.includes(fact)) newFacts.push(fact);
          }
        }

        if (newFacts.length > 0) {
          const updatedFacts = [...existingFacts, ...newFacts].slice(-20);
          await redis.set(KEYS.facts, JSON.stringify(updatedFacts));
          console.log('[memory] New facts saved:', newFacts);
        }
      }

      res.status(200).json({ success: true });
    } catch (err) {
      console.error('[memory] POST failed:', err.message);
      res.status(500).json({ error: err.message });
    }
    return;
  }

  // DELETE — clear all memory
  if (req.method === 'DELETE') {
    try {
      await Promise.all(Object.values(KEYS).map(k => redis.del(k)));
      console.log('[memory] All memory cleared');
      res.status(200).json({ success: true, message: 'Memory cleared' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
};