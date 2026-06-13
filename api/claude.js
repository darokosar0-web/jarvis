import { GoogleGenerativeAI } from '@google/generative-ai';
import { google } from 'googleapis';
import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

const SYSTEM_PROMPT = `I am JARVIS, Daro Kosar's personal AI advisor. Not a generic chatbot—I'm built specifically to know Daro and drive his business forward.

WHO I AM: I'm Jarvis, your AI command centre. I have access to your emails, tasks, and full tech stack. I think like your business advisor—sharp, direct, focused on revenue.

WHO DARO IS: Daro Kosar, 25, Swansea, Wales. Barber, personal trainer, entrepreneur. Street smart, hands-on, learns by doing. Hates fluff. Building an AI automation agency—target: 20 clients x £500/month in 60 days (started June 7 2026). Currently: 0 paying clients.

DARO'S PROJECTS: Jarvis (this AI dashboard, live), Mo's Barbers chatbot (first client, not yet invoiced), N8n automation (Trend Spotter & Script Generator), OpenClaw agent (running locally).

DARO'S STACK: Vercel, Node.js, Upstash Redis, Claude API, Brave Search, ElevenLabs, n8n, Claw agent (Playwright + Brave MCP), Gemini API, Obsidian.

MY PERSONALITY: Sharp. Direct. No corporate fluff. I know Daro—never ask basic questions. I push toward revenue-generating actions. I'm a no-nonsense business advisor who knows his full tech stack. Concise unless detail is requested. No excessive emojis.

WHAT I CAN DO: Read and summarize emails. Send emails. Get full email content. Access todos. Search the web. Always remember I'm Jarvis, not a generic AI.`;

function buildSystemPrompt(memory, todos) {
  let prompt = SYSTEM_PROMPT;
  const parts = [];

  if (todos && Array.isArray(todos) && todos.length > 0) {
    const openTodos = todos.filter(t => !t.done);
    const doneTodos = todos.filter(t => t.done);

    let todoList = '';
    if (openTodos.length > 0) {
      todoList += '🔴 OPEN TASKS:\n' + openTodos.map((t, i) => `  ${i + 1}. ${t.text}`).join('\n');
    }
    if (doneTodos.length > 0) {
      todoList += (openTodos.length > 0 ? '\n\n' : '') + '✅ COMPLETED:\n' + doneTodos.map((t, i) => `  ${i + 1}. ${t.text}`).join('\n');
    }
    parts.push(`DARO'S TASK LIST:\n${todoList}`);
  } else {
    parts.push(`DARO'S TASK LIST:\n(No tasks yet)`);
  }

  if (memory?.summary) {
    parts.push(`CONVERSATION HISTORY:\n${memory.summary}`);
  }

  if (memory?.facts?.length > 0) {
    parts.push(`KNOWN FACTS ABOUT DARO:\n${memory.facts.map(f => `- ${f}`).join('\n')}`);
  }

  if (parts.length > 0) {
    prompt += `\n\n===== CONTEXT =====\n${parts.join('\n\n')}\n===================`;
  }

  return prompt;
}

async function searchWeb(query) {
  try {
    const response = await fetch('https://jarvis-sand-two.vercel.app/api/brave-search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
    });
    const data = await response.json();
    return response.ok ? { results: data.results } : { error: data.error };
  } catch (err) {
    console.error('[search] Error:', err);
    return { error: 'Search failed' };
  }
}

function needsSearch(text) {
  const searchPatterns = [
    /news|latest|recent|update/i,
    /who (is|are|won|leads)/i,
    /what (is|are|happened|did)/i,
    /score|result|match|game/i,
    /weather|forecast/i,
    /search|look up|find|google/i,
    /price of|cost of|how much/i,
    /when (is|does|did)/i,
  ];
  return searchPatterns.some(p => p.test(text));
}

// Gmail helper functions
async function getGmailClient() {
  const tokensData = await redis.get('gmail:tokens');
  if (!tokensData) {
    throw new Error('Gmail not connected. Visit /api/gmail-auth to authorize.');
  }

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

  if (tokens.expiry_date && tokens.expiry_date < Date.now()) {
    const { credentials } = await oauth2Client.refreshAccessToken();
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

async function readEmails(limit = 10, query = '') {
  try {
    const gmail = await getGmailClient();
    const response = await gmail.users.messages.list({
      userId: 'me',
      maxResults: limit,
      q: query,
    });

    const messages = response.data.messages || [];

    if (messages.length === 0) {
      return JSON.stringify({ emails: [] });
    }

    const emails = [];
    for (let i = 0; i < messages.length; i += 5) {
      const batch = messages.slice(i, i + 5);
      const batchResults = await Promise.all(
        batch.map(async (msg) => {
          try {
            const msgData = await gmail.users.messages.get({
              userId: 'me',
              id: msg.id,
              format: 'metadata',
              metadataHeaders: ['From', 'Subject', 'Date'],
            });

            const headers = msgData.data.payload.headers;
            return {
              id: msg.id,
              from: headers.find(h => h.name === 'From')?.value || '',
              subject: headers.find(h => h.name === 'Subject')?.value || '',
              date: headers.find(h => h.name === 'Date')?.value || '',
            };
          } catch (err) {
            console.error('[readEmails] Error fetching message:', err);
            return null;
          }
        })
      );
      emails.push(...batchResults.filter(e => e));
    }

    return JSON.stringify({ emails });
  } catch (err) {
    console.error('[readEmails] Error:', err);
    return JSON.stringify({ error: err.message });
  }
}

async function getEmailContent(emailId) {
  try {
    const gmail = await getGmailClient();
    const msg = await gmail.users.messages.get({
      userId: 'me',
      id: emailId,
      format: 'full',
    });

    const headers = msg.data.payload.headers;
    const from = headers.find(h => h.name === 'From')?.value || '';
    const subject = headers.find(h => h.name === 'Subject')?.value || '';

    let body = '';
    if (msg.data.payload.parts) {
      const textPart = msg.data.payload.parts.find(p => p.mimeType === 'text/plain');
      if (textPart && textPart.body.data) {
        body = Buffer.from(textPart.body.data, 'base64').toString('utf-8');
      }
    } else if (msg.data.payload.body.data) {
      body = Buffer.from(msg.data.payload.body.data, 'base64').toString('utf-8');
    }

    return JSON.stringify({ id: emailId, from, subject, body });
  } catch (err) {
    console.error('[getEmailContent] Error:', err);
    return JSON.stringify({ error: err.message });
  }
}

async function addTodo(text) {
  try {
    const todos = await redis.get('jarvis:todos');
    let todoList = Array.isArray(todos) ? todos : typeof todos === 'string' ? JSON.parse(todos) : [];

    const newTodo = {
      id: 'todo-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9),
      text,
      done: false,
      created: new Date().toISOString(),
    };

    todoList.push(newTodo);
    await redis.set('jarvis:todos', JSON.stringify(todoList));

    return JSON.stringify({ success: true, todo: newTodo });
  } catch (err) {
    console.error('[addTodo] Error:', err);
    return JSON.stringify({ error: err.message });
  }
}

async function getTodos() {
  try {
    const todos = await redis.get('jarvis:todos');
    let todoList = [];

    if (typeof todos === 'string') {
      try {
        todoList = JSON.parse(todos);
      } catch {
        todoList = [];
      }
    } else if (Array.isArray(todos)) {
      todoList = todos;
    }

    if (todoList.length > 0) {
      const seen = new Set();
      todoList = todoList.filter(t => {
        if (!t.id || !t.text || seen.has(t.id)) return false;
        seen.add(t.id);
        return true;
      });
    }

    return JSON.stringify({ todos: todoList });
  } catch (err) {
    console.error('[getTodos] Error:', err);
    return JSON.stringify({ error: err.message });
  }
}

export default async (req, res) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  Object.entries(corsHeaders).forEach(([k, v]) => res.setHeader(k, v));

  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

  try {
    let { messages, memory, todos } = req.body;

    if (!Array.isArray(messages) || messages.length === 0) {
      res.status(400).json({ error: 'Invalid messages' });
      return;
    }

    // Fetch todos from Redis if not provided
    if (!todos || !Array.isArray(todos) || todos.length === 0) {
      try {
        const storedTodos = await redis.get('jarvis:todos');
        if (typeof storedTodos === 'string') {
          try {
            const parsed = JSON.parse(storedTodos);
            todos = Array.isArray(parsed) ? parsed : [];
          } catch {
            todos = [];
          }
        } else if (Array.isArray(storedTodos)) {
          todos = storedTodos;
        } else {
          todos = [];
        }

        if (todos.length > 0) {
          const seen = new Set();
          todos = todos.filter(t => {
            if (!t.id || !t.text || seen.has(t.id)) return false;
            seen.add(t.id);
            return true;
          });
        }

        console.log('[claude] Fetched and cleaned', todos.length, 'todos from Redis');
      } catch (err) {
        console.error('[claude] Error fetching todos:', err);
        todos = [];
      }
    }

    // Initialize Gemini client
    const apiKey = (process.env.GEMINI_API_KEY || '').replace(/^﻿/, '').trim();
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY not set');
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.0-flash',
      systemInstruction: buildSystemPrompt(memory, todos),
    });

    console.log('[claude] Initialized Gemini with model: gemini-2.0-flash');

    // Build messages for Gemini API
    const systemPrompt = buildSystemPrompt(memory, todos);
    let conversationHistory = [];

    // Add recent memory if available
    if (memory?.recent?.length > 0) {
      conversationHistory = memory.recent.map(msg => ({
        role: msg.role === 'user' ? 'user' : 'model',
        parts: [{ text: typeof msg.content === 'string' ? msg.content : String(msg.content) }]
      })).slice(-10);
    }

    // Get last user message
    const lastUserMessage = messages[messages.length - 1];
    const messageText = typeof lastUserMessage?.content === 'string' ? lastUserMessage.content : '';

    // Web search injection
    let searchContext = '';
    if (messageText && needsSearch(messageText)) {
      console.log('[search] Searching:', messageText);
      const result = await searchWeb(messageText);
      if (result.results?.length > 0) {
        searchContext = `\n\n[WEB SEARCH RESULTS]\n${result.results.slice(0, 5).map(r => `- ${r.title}: ${r.url}`).join('\n')}`;
      }
    }

    // Prepare final user message with search context
    const userMessageContent = messageText + searchContext;

    // Set up streaming response
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // Send initial connection message
    res.write('data: [CONNECTED]\n\n');

    try {
      // Use streaming with Gemini
      const stream = await model.generateContentStream({
        contents: [
          ...conversationHistory,
          {
            role: 'user',
            parts: [{ text: userMessageContent }]
          }
        ],
        generationConfig: {
          temperature: 1,
          topP: 0.95,
          topK: 40,
          maxOutputTokens: 8192,
          thinkingConfig: {
            thinkingBudget: 0
          }
        }
      });

      let fullText = '';

      for await (const chunk of stream.stream) {
        if (chunk.candidates?.[0]?.content?.parts?.[0]?.text) {
          const text = chunk.candidates[0].content.parts[0].text;
          fullText += text;
          res.write(`data: ${JSON.stringify({ text })}\n\n`);
        }
      }

      // Send completion marker
      res.write('data: [DONE]\n\n');
      res.end();

      console.log('[claude] Stream completed, tokens used:', fullText.length / 4);

    } catch (streamErr) {
      console.error('[claude] Streaming error:', streamErr);
      res.write(`data: ${JSON.stringify({ text: `Error: ${streamErr.message}` })}\n\n`);
      res.write('data: [DONE]\n\n');
      res.end();
    }

  } catch (error) {
    console.error('[claude] Error:', error);
    res.setHeader('Content-Type', 'application/json');
    res.status(500).json({ error: error.message });
  }
};
