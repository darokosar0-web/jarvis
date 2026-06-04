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
    const { text } = req.body;

    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      console.error('Invalid text input: empty or not a string');
      Object.entries(headers).forEach(([key, value]) => {
        res.setHeader(key, value);
      });
      res.status(400).json({ error: 'Text required' });
      return;
    }

    const apiKey = process.env.ELEVENLABS_API_KEY;

    console.log('=== ElevenLabs TTS Function Debug ===');
    console.log('Environment variables available:', Object.keys(process.env).length);

    const envKeys = Object.keys(process.env).filter(k => k.includes('ELEVEN') || k.includes('API') || k.includes('KEY'));
    console.log('Relevant env vars found:', envKeys);

    console.log('ELEVENLABS_API_KEY exists:', !!apiKey);
    if (apiKey) {
      console.log('API Key length:', apiKey.length);
      console.log('API Key starts with:', apiKey.substring(0, 10) + '...');
    }

    if (!apiKey || apiKey.trim().length === 0) {
      console.error('ELEVENLABS_API_KEY is not set or is empty');
      Object.entries(headers).forEach(([key, value]) => {
        res.setHeader(key, value);
      });
      res.status(500).json({
        error: 'ElevenLabs API key not configured in environment variables',
        debug: 'ELEVENLABS_API_KEY environment variable is missing or empty'
      });
      return;
    }

    const voiceId = 'mZ8K1MPRiT5wDQaasg3i';
    const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`;

    console.log('Calling ElevenLabs API:', url);
    console.log('Request text length:', text.trim().length);
    console.log('Using voice ID:', voiceId);
    console.log('Using model: eleven_turbo_v2');
    console.log('API Key format check - starts with:', apiKey.substring(0, 5) + '...');

    const requestBody = {
      text: text.trim(),
      model_id: 'eleven_turbo_v2',
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.75,
      },
      output_format: 'mp3_22050_32',
    };

    console.log('Request body keys:', Object.keys(requestBody));

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
    console.log('ElevenLabs response content-type:', ttsResponse.headers.get('content-type'));

    if (!ttsResponse.ok) {
      let errorBody = '';
      let errorJson = null;
      try {
        errorBody = await ttsResponse.text();
        // Try to parse as JSON for better readability
        try {
          errorJson = JSON.parse(errorBody);
        } catch (parseErr) {
          // Not JSON, will use raw text
        }
      } catch (e) {
        errorBody = 'Could not read error response';
      }

      console.error('═══════════════════════════════════════');
      console.error('❌ ElevenLabs API ERROR');
      console.error('═══════════════════════════════════════');
      console.error('Status:', ttsResponse.status, ttsResponse.statusText);
      console.error('URL:', url);
      console.error('Voice ID:', voiceId);
      console.error('Model:', 'eleven_turbo_v2');
      console.error('API Key (starts):', apiKey.substring(0, 5) + '...');
      console.error('─────────────────────────────────────');

      if (errorJson) {
        console.error('Error Response (JSON):');
        console.error(JSON.stringify(errorJson, null, 2));
      } else {
        console.error('Error Response (Raw):');
        console.error(errorBody);
      }
      console.error('═══════════════════════════════════════');

      Object.entries(headers).forEach(([key, value]) => {
        res.setHeader(key, value);
      });

      if (ttsResponse.status === 401) {
        console.error('❌ Authentication failed - API key is invalid, expired, or incorrect');
        res.status(500).json({
          error: 'Invalid ElevenLabs API key',
          debug: `Got 401 from ElevenLabs - key may be expired or incorrect. Key length: ${apiKey.length}. Check that ELEVENLABS_API_KEY is set correctly in Vercel environment variables.`,
          fullError: errorJson || errorBody
        });
        return;
      }
      if (ttsResponse.status === 404) {
        console.error('❌ Voice ID not found - voice may not exist or be available in your plan');
        res.status(500).json({
          error: 'Voice not found',
          debug: `Got 404 from ElevenLabs - voice ID '${voiceId}' may not exist or be unavailable in your plan. Try using a standard voice like 'Rachel' or 'Adam'.`,
          fullError: errorJson || errorBody
        });
        return;
      }
      if (ttsResponse.status === 429) {
        console.warn('⚠️ Rate limited by ElevenLabs');
        res.status(429).json({
          error: 'Rate limit exceeded - try again later',
          fullError: errorJson || errorBody
        });
        return;
      }

      res.status(502).json({
        error: `ElevenLabs service error: ${ttsResponse.status}`,
        statusText: ttsResponse.statusText,
        fullError: errorJson || errorBody,
        debug: `Check API key validity and voice ID. Status: ${ttsResponse.status} ${ttsResponse.statusText}`
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
