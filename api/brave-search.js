export default async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const { query } = req.body;

    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.status(400).json({ error: 'Query required' });
      return;
    }

    const apiKey = process.env.BRAVE_API_KEY;
    if (!apiKey) {
      console.error('BRAVE_API_KEY is not set');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.status(500).json({ error: 'Search service not configured' });
      return;
    }

    const searchUrl = new URL('https://api.search.brave.com/res/v1/web/search');
    searchUrl.searchParams.set('q', query.trim());
    searchUrl.searchParams.set('count', '5');

    const response = await fetch(searchUrl.toString(), {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'X-Subscription-Token': apiKey,
      },
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error('Brave Search API error:', response.status, errorBody);
      res.setHeader('Access-Control-Allow-Origin', '*');
      if (response.status === 401) {
        res.status(500).json({ error: 'Invalid search API key' });
        return;
      }
      if (response.status === 429) {
        res.status(429).json({ error: 'Search rate limit exceeded' });
        return;
      }
      res.status(502).json({ error: 'Search service error' });
      return;
    }

    const data = await response.json();
    const results = (data.web?.results || []).slice(0, 5).map(result => ({
      title: result.title || '',
      url: result.url || '',
      description: result.description || '',
      snippet: result.snippet || '',
    }));

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(200).json({ results });
  } catch (err) {
    console.error('Brave Search function error:', err);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(500).json({ error: 'Internal server error' });
  }
};
