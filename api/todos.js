const { Redis } = require('@upstash/redis');

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

const TODO_KEY = 'jarvis:todos';

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');

  try {
    if (req.method === 'GET') {
      const todos = await redis.get(TODO_KEY) || [];
      return res.status(200).json({ todos });
    }

    if (req.method === 'POST') {
      const { text } = req.body;
      if (!text) return res.status(400).json({ error: 'text required' });
      const todos = await redis.get(TODO_KEY) || [];
      const newTodo = { id: Date.now().toString(), text, done: false, createdAt: new Date().toISOString() };
      todos.push(newTodo);
      await redis.set(TODO_KEY, todos);
      return res.status(200).json({ todo: newTodo, todos });
    }

    if (req.method === 'DELETE') {
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: 'id required' });
      const todos = await redis.get(TODO_KEY) || [];
      const filtered = todos.filter(t => t.id !== id);
      await redis.set(TODO_KEY, filtered);
      return res.status(200).json({ todos: filtered });
    }

    if (req.method === 'PATCH') {
      const { id } = req.query;
      const todos = await redis.get(TODO_KEY) || [];
      const updated = todos.map(t => t.id === id ? { ...t, done: !t.done } : t);
      await redis.set(TODO_KEY, updated);
      return res.status(200).json({ todos: updated });
    }

    return res.status(405).json({ error: 'Method not allowed' });

  } catch (err) {
    console.error('todos error:', err);
    return res.status(500).json({ error: err.message });
  }
};
