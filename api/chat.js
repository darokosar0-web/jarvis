const SYSTEM_PROMPT = `You are J.A.R.V.I.S. (Just A Rather Very Intelligent System), a sophisticated personal AI assistant. You are efficient, knowledgeable, and professional — capable of helping with research, writing, coding, mathematics, planning, and general questions across all domains.

Keep responses concise and direct unless the user explicitly asks for detail or an extended explanation. Use clear, precise language with a slightly formal but approachable tone. If you are unsure about something, say so clearly rather than guessing.

You are running inside a personal dashboard interface. The user may ask you anything.`;

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}

export default async (req, res) => {
  const headers = corsHeaders();

  if (req.method === 'OPTIONS') {
    res.status(204);
    Object.entries(headers).forEach(([key, value]) => {
      res.setHeader(key, value);
    });
    res.end();
    return;
  }

  if (req.method !== 'POST') {
    Object.entries(headers).forEach(([key, value]) => {
      res.setHeader(key, value);
    });
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('ANTHROPIC_API_KEY is not set');
    Object.entries(headers).forEach(([key, value]) => {
      res.setHeader(key, value);
    });
    res.status(500).json({ error: 'Server configuration error' });
    return;
  }

  let messages;
  try {
    ({ messages } = req.body);
    if (!Array.isArray(messages) || messages.length === 0) throw new Error('Invalid messages');
  } catch {
    Object.entries(headers).forEach(([key, value]) => {
      res.setHeader(key, value);
    });
    res.status(400).json({ error: 'Invalid request body' });
    return;
  }

  const sanitised = messages
    .slice(-20)
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .map((m) => ({ role: m.role, content: String(m.content).slice(0, 4000) }));

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        messages: sanitised,
      }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      console.error('Anthropic API error:', response.status, errBody);
      Object.entries(headers).forEach(([key, value]) => {
        res.setHeader(key, value);
      });
      res.status(502).json({ error: 'Upstream API error' });
      return;
    }

    const data = await response.json();
    const reply = data?.content?.[0]?.text ?? '';
    Object.entries(headers).forEach(([key, value]) => {
      res.setHeader(key, value);
    });
    res.setHeader('Content-Type', 'application/json');
    res.status(200).json({ reply });
  } catch (err) {
    console.error('Function error:', err);
    Object.entries(headers).forEach(([key, value]) => {
      res.setHeader(key, value);
    });
    res.status(500).json({ error: 'Internal server error' });
  }
};
