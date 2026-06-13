import { google } from 'googleapis';
import { Redis } from '@upstash/redis';

const oauth2Client = new google.auth.OAuth2(
  process.env.GMAIL_CLIENT_ID,
  process.env.GMAIL_CLIENT_SECRET,
  process.env.GMAIL_CALLBACK_URL || 'https://jarvis-sand-two.vercel.app/api/gmail-callback'
);

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

export default async (req, res) => {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { code, error } = req.query;

  if (error) {
    res.setHeader('Content-Type', 'text/html');
    return res.status(400).send(`
      <html>
        <body style="font-family: Arial; padding: 20px; text-align: center;">
          <h1>Gmail Auth Failed</h1>
          <p>Error: ${error}</p>
          <a href="/">Go back to Jarvis</a>
        </body>
      </html>
    `);
  }

  if (!code) {
    return res.status(400).json({ error: 'No authorization code provided' });
  }

  try {
    const { tokens } = await oauth2Client.getToken(code);

    // Store only serializable token fields in Redis
    const tokenData = {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expiry_date: tokens.expiry_date,
      token_type: tokens.token_type,
      scope: tokens.scope,
    };

    await redis.set('gmail:tokens', JSON.stringify(tokenData), { ex: 86400 * 365 });

    console.log('[gmail] Tokens stored in Redis');

    res.setHeader('Content-Type', 'text/html');
    return res.status(200).send(`
      <html>
        <body style="font-family: Arial; padding: 40px; text-align: center; background: #0d2137; color: #a0c4e8;">
          <h1>✓ Gmail Connected</h1>
          <p>You can now ask Jarvis to read and send emails.</p>
          <p style="margin-top: 20px;">
            <a href="/" style="color: #1a8ac8; text-decoration: none; font-weight: bold;">← Back to Jarvis</a>
          </p>
        </body>
      </html>
    `);
  } catch (err) {
    console.error('[gmail] Token exchange error:', err);
    res.setHeader('Content-Type', 'text/html');
    res.status(500).send(`
      <html>
        <body style="font-family: Arial; padding: 20px; text-align: center;">
          <h1>Error</h1>
          <p>Failed to exchange code for token: ${err.message}</p>
          <a href="/">Go back to Jarvis</a>
        </body>
      </html>
    `);
  }
};
