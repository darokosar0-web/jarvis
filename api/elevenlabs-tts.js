function stripMarkdown(text) {
  return text
    .replace(/\*\*\*(.*?)\*\*\*/g, '$1')  // ***text*** → text
    .replace(/\*\*(.*?)\*\*/g, '$1')      // **text** → text
    .replace(/__(.*?)__/g, '$1')          // __text__ → text
    .replace(/\*(.*?)\*/g, '$1')          // *text* → text
    .replace(/_(.*?)_/g, '$1')            // _text_ → text
    .replace(/~~(.*?)~~/g, '$1')          // ~~text~~ → text
    .replace(/```[\s\S]*?```/g, '')       // ```code``` → remove
    .replace(/`(.*?)`/g, '$1')            // `code` → code
    .replace(/\[(.*?)\]\(.*?\)/g, '$1')   // [text](url) → text
    .replace(/^#+\s+/gm, '')              // # Header → Header
    .replace(/^[\s]*[-*+]\s+/gm, '')      // - item → item
    .replace(/^[\s]*\d+\.\s+/gm, '')      // 1. item → item
    .replace(/^>\s+/gm, '')               // > quote → quote
    .replace(/<[^>]*>/g, '')              // <tag> → remove
    .replace(/\s+/g, ' ')                 // multiple spaces → single
    .trim();
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
    let { text } = req.body;
    text = stripMarkdown(text);

    // Trim to first 2 sentences
    const sentences = text.split('. ');
    text = sentences.slice(0, 2).join('. ');

    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      console.error('Invalid text input: empty or not a string');
      Object.entries(headers).forEach(([key, value]) => {
        res.setHeader(key, value);
      });
      res.status(400).json({ error: 'Text required' });
      return;
    }

    const apiKey = process.env.ELEVENLABS_API_KEY;

    if (!apiKey || apiKey.trim().length === 0) {
      console.error('ELEVENLABS_API_KEY is not set or is empty');
      Object.entries(headers).forEach(([key, value]) => {
        res.setHeader(key, value);
      });
      res.status(500).json({
        error: 'ElevenLabs API key not configured in environment variables',
      });
      return;
    }

    const voiceId = 'jRAAK67SEFE9m7ci5DhD';
    const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`;

    console.log('Calling ElevenLabs API:', url);
    console.log('Request text length:', text.trim().length);

    const requestBody = {
      text: text.trim(),
      model_id: 'eleven_turbo_v2',
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.75,
      },
      output_format: 'mp3_22050_32',
    };

    const ttsResponse = await fetch(url, {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey.trim(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    console.log('ElevenLabs response status:', ttsResponse.status);
    console.log('ElevenLabs response ok:', ttsResponse.ok);

    if (!ttsResponse.ok) {
      let errorBody = '';
      try {
        errorBody = await ttsResponse.text();
      } catch (e) {
        errorBody = 'Could not read error response';
      }

      console.error('❌ ElevenLabs API error:', ttsResponse.status, errorBody);
      Object.entries(headers).forEach(([key, value]) => {
        res.setHeader(key, value);
      });
      res.status(ttsResponse.status).json({
        error: `ElevenLabs service error: ${ttsResponse.status}`,
        details: errorBody
      });
      return;
    }

    const buffer = await ttsResponse.arrayBuffer();
    console.log('✓ Audio buffer received:', buffer.byteLength, 'bytes');

    const base64 = Buffer.from(buffer).toString('base64');
    console.log('✓ Base64 encoded:', base64.length, 'characters');

    if (!base64 || base64.length === 0) {
      throw new Error('Failed to encode audio to base64');
    }

    const audioUrl = `data:audio/mpeg;base64,${base64}`;

    console.log('✓✓ SUCCESS - Audio URL generated');
    Object.entries(headers).forEach(([key, value]) => {
      res.setHeader(key, value);
    });
    res.status(200).json({ audioUrl });
  } catch (err) {
    console.error('❌ Uncaught error in elevenlabs-tts function:');
    console.error('Error message:', err.message);
    console.error('Error stack:', err.stack);

    const headers = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Content-Type': 'application/json',
    };
    Object.entries(headers).forEach(([key, value]) => {
      res.setHeader(key, value);
    });
    res.status(500).json({
      error: 'Failed to generate speech',
      debug: err.message
    });
  }
};
