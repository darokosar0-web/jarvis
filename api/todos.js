const { Redis } = require('@upstash/redis');

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

const TODO_KEY = 'jarvis:todos';

// Helper to safely parse todos from Redis
async function getTodosFromRedis() {
  try {
    const data = await redis.get(TODO_KEY);
    console.log('[todos] Read from Redis:', typeof data, Array.isArray(data) ? `array(${data.length})` : data);

    if (!data) {
      console.log('[todos] No data found, returning empty array');
      return [];
    }

    // Handle both string and array returns from Redis
    if (typeof data === 'string') {
      try {
        const parsed = JSON.parse(data);
        if (!Array.isArray(parsed)) {
          console.log('[todos] Parsed data is not an array:', typeof parsed);
          return [];
        }
        console.log('[todos] Parsed string, got', parsed.length, 'todos');
        return parsed;
      } catch (e) {
        console.error('[todos] Failed to parse JSON:', e.message);
        return [];
      }
    }

    // If it's already an array, return it
    if (Array.isArray(data)) {
      console.log('[todos] Data is already an array with', data.length, 'items');
      return data;
    }

    console.log('[todos] Unexpected data type:', typeof data);
    return [];
  } catch (err) {
    console.error('[todos] Error reading todos:', err);
    return [];
  }
}

// Helper to save todos to Redis
async function saveTodosToRedis(todos) {
  try {
    if (!Array.isArray(todos)) {
      console.error('[todos] ERROR: Attempting to save non-array:', typeof todos);
      throw new Error('Todos must be an array');
    }

    const jsonStr = JSON.stringify(todos);
    console.log('[todos] Saving', todos.length, 'todos to Redis');

    await redis.set(TODO_KEY, jsonStr);

    console.log('[todos] Saved successfully');
    return true;
  } catch (err) {
    console.error('[todos] Error saving todos:', err);
    throw err;
  }
}

// Helper to clean and deduplicate todos
function cleanTodos(todos) {
  const seen = new Set();
  const cleaned = [];

  for (const t of todos) {
    // Skip invalid todos
    if (!t || !t.id || !t.text) {
      console.log('[todos] Skipping invalid todo:', t);
      continue;
    }

    // Skip duplicates (keep first occurrence)
    if (seen.has(t.id)) {
      console.log('[todos] Skipping duplicate todo ID:', t.id);
      continue;
    }

    seen.add(t.id);
    cleaned.push(t);
  }

  if (cleaned.length !== todos.length) {
    console.log('[todos] Cleaned', todos.length, 'todos down to', cleaned.length);
  }

  return cleaned;
}

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');

  try {
    if (req.method === 'GET') {
      let todos = await getTodosFromRedis();
      todos = cleanTodos(todos);

      console.log('[todos] GET: Returning', todos.length, 'todos');
      return res.status(200).json({ todos });
    }

    if (req.method === 'POST') {
      const { text } = req.body;
      if (!text) return res.status(400).json({ error: 'text required' });

      let todos = await getTodosFromRedis();
      todos = cleanTodos(todos);

      const newTodo = { id: Date.now().toString(), text, done: false, createdAt: new Date().toISOString() };
      todos.push(newTodo);

      console.log('[todos] POST: Added new todo, total now:', todos.length);
      await saveTodosToRedis(todos);
      return res.status(200).json({ todo: newTodo, todos });
    }

    if (req.method === 'DELETE') {
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: 'id required' });

      let todos = await getTodosFromRedis();
      todos = cleanTodos(todos);

      const beforeCount = todos.length;
      todos = todos.filter(t => t.id !== id);
      const afterCount = todos.length;

      console.log('[todos] DELETE:', id, 'deleted', beforeCount - afterCount, 'todos, remaining:', afterCount);

      await saveTodosToRedis(todos);
      return res.status(200).json({ todos });
    }

    if (req.method === 'PATCH') {
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: 'id required' });

      let todos = await getTodosFromRedis();
      todos = cleanTodos(todos);

      const updated = todos.map(t => t.id === id ? { ...t, done: !t.done } : t);
      const found = updated.some(t => t.id === id);

      if (!found) {
        console.log('[todos] PATCH: Todo ID not found:', id);
        return res.status(404).json({ error: 'Todo not found' });
      }

      console.log('[todos] PATCH:', id, 'toggled');
      await saveTodosToRedis(updated);
      return res.status(200).json({ todos: updated });
    }

    return res.status(405).json({ error: 'Method not allowed' });

  } catch (err) {
    console.error('[todos] ERROR:', err);
    return res.status(500).json({ error: err.message });
  }
};
