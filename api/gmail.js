import { google } from 'googleapis';
import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

async function getAuthenticatedClient() {
  const tokensData = await redis.get('gmail:tokens');
  if (!tokensData) {
    throw new Error('Gmail not connected. Visit /api/gmail-auth to authorize.');
  }

  // Parse tokens - handle both string and object returns from Redis
  let tokens;
  if (typeof tokensData === 'string') {
    tokens = JSON.parse(tokensData);
  } else {
    tokens = tokensData;
  }

  const oauth2Client = new google.auth.OAuth2(
    process.env.GMAIL_CLIENT_ID,
    process.env.GMAIL_CLIENT_SECRET,
    process.env.GMAIL_CALLBACK_URL || 'https://jarvis-sand-two.vercel.app/api/gmail-callback'
  );

  oauth2Client.setCredentials(tokens);

  // Refresh token if needed
  if (tokens.expiry_date && tokens.expiry_date < Date.now()) {
    const { credentials } = await oauth2Client.refreshAccessToken();
    // Store only serializable token fields
    const tokenData = {
      access_token: credentials.access_token,
      refresh_token: credentials.refresh_token || tokens.refresh_token,
      expiry_date: credentials.expiry_date,
      token_type: credentials.token_type,
      scope: credentials.scope,
    };
    await redis.set('gmail:tokens', JSON.stringify(tokenData), { ex: 86400 * 365 });
  }

  return google.gmail({ version: 'v1', auth: oauth2Client });
}

async function listEmails(maxResults = 10, query = '') {
  try {
    const gmail = await getAuthenticatedClient();

    const response = await gmail.users.messages.list({
      userId: 'me',
      maxResults,
      q: query,
    });

    const messages = response.data.messages || [];

    if (messages.length === 0) {
      return { emails: [] };
    }

    const emails = await Promise.all(
      messages.map(async (msg) => {
        const msgData = await gmail.users.messages.get({
          userId: 'me',
          id: msg.id,
          format: 'full',
        });

        const headers = msgData.data.payload?.headers || [];
        const subject = headers.find(h => h.name === 'Subject')?.value || '(No subject)';
        const from = headers.find(h => h.name === 'From')?.value || '(Unknown sender)';
        const date = headers.find(h => h.name === 'Date')?.value || '';

        let body = '';
        const payload = msgData.data.payload;

        if (payload?.parts) {
          const textPart = payload.parts.find(p => p.mimeType === 'text/plain');
          if (textPart?.body?.data) {
            body = Buffer.from(textPart.body.data, 'base64').toString('utf-8').substring(0, 500);
          }
        } else if (payload?.body?.data) {
          body = Buffer.from(payload.body.data, 'base64').toString('utf-8').substring(0, 500);
        }

        return {
          id: msg.id,
          from,
          subject,
          date,
          snippet: body || msgData.data.snippet || '(No preview)',
        };
      })
    );

    return { emails };
  } catch (err) {
    console.error('[gmail] List error:', err);
    throw new Error(`Failed to read emails: ${err.message}`);
  }
}

async function sendEmail(to, subject, body) {
  try {
    const gmail = await getAuthenticatedClient();

    const email = [
      `To: ${to}`,
      `Subject: ${subject}`,
      'Content-Type: text/plain; charset="UTF-8"',
      'MIME-Version: 1.0',
      '',
      body,
    ].join('\r\n');

    const encodedMessage = Buffer.from(email).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');

    const response = await gmail.users.messages.send({
      userId: 'me',
      requestBody: {
        raw: encodedMessage,
      },
    });

    return {
      success: true,
      messageId: response.data.id,
      to,
      subject,
    };
  } catch (err) {
    console.error('[gmail] Send error:', err);
    throw new Error(`Failed to send email: ${err.message}`);
  }
}

export default async (req, res) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  Object.entries(corsHeaders).forEach(([k, v]) => res.setHeader(k, v));

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const { action, maxResults, query, to, subject, body } = req.body;

    if (action === 'list') {
      const result = await listEmails(maxResults || 10, query || '');
      res.json(result);
    } else if (action === 'send') {
      const result = await sendEmail(to, subject, body);
      res.json(result);
    } else {
      res.status(400).json({ error: 'Invalid action. Use "list" or "send".' });
    }
  } catch (err) {
    console.error('[gmail] API error:', err);
    res.status(500).json({ error: err.message });
  }
};
