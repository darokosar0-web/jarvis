# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Jarvis** is a personalized AI command centre dashboard for Daro Kosar. It combines a modern web frontend with a serverless backend to provide an intelligent assistant that knows Daro's business, projects, and tech stack.

### Key Features
- **AI Chat**: Claude-powered conversations with persistent memory and context awareness
- **Voice I/O**: Browser native text-to-speech (responses) and speech-to-text (input)
- **Web Search**: Real-time information retrieval via Brave Search API
- **Persistent Memory**: Conversation history and facts stored in Upstash Redis
- **Task Management**: Todos with persistence
- **Email Integration**: Gmail read/send (OAuth)
- **Web Search Results**: Automatic detection of questions needing web search

## Architecture

### Technology Stack
- **Frontend**: Vanilla JavaScript (no frameworks), HTML5, CSS3. Deployed as static files on Vercel.
- **Backend**: Node.js serverless functions on Vercel (`api/*.js`)
- **Database**: Upstash Redis REST API (cloud key-value store)
- **AI Models**: Claude API (primary), Google Generative AI (fallback), Groq (available)
- **APIs**: Brave Search (web), ElevenLabs (TTS), Google Gmail OAuth

### Project Structure
```
jarvis/
├── index.html              # Single HTML file with all chat UI structure
├── app.js                  # All frontend logic (500+ lines, single file)
├── style.css              # All styling (futuristic terminal aesthetic)
├── api/
│   ├── claude.js          # Main Claude API handler + web search + system prompt
│   ├── memory.js          # Conversation memory management (Redis)
│   ├── todos.js           # Task list CRUD operations
│   ├── elevenlabs-tts.js  # Text-to-speech proxy
│   ├── brave-search.js    # Web search (internal endpoint)
│   ├── gmail.js           # Gmail read/send
│   ├── gmail-auth.js      # Gmail OAuth initiation
│   └── gmail-callback.js  # Gmail OAuth callback
├── vercel.json            # Serverless function config + timeout settings
├── package.json           # Dependencies (minimal)
├── .env.example           # Environment variable template
└── VOICE_FEATURES.md      # Voice implementation documentation
```

## Memory System

The memory architecture operates on three layers (all stored in Redis):

1. **Summary** (`jarvis:summary`): Rolling conversation context built from every 8 messages
2. **Recent** (`jarvis:recent`): Last 4 messages only (sent to Claude for immediate context)
3. **Facts** (`jarvis:facts`): Extracted facts about Daro (manually added via Jarvis)

**Key Points:**
- Memory is loaded from Redis on frontend init (`/api/memory` GET)
- Sent to Claude on each request inside `buildSystemPrompt()`
- Saved to Redis after each message (`/api/memory` POST)
- Uses beacon API for graceful unload saves
- Can be cleared via "Clear Memory" button (also stored in CLAUDE.md as user preference)

## System Prompt & Personalization

The core system prompt is hardcoded in `api/claude.js:SYSTEM_PROMPT`. It includes:
- **WHO JARVIS IS**: Personal AI advisor, not generic chatbot
- **WHO DARO IS**: Age, location, background, current goals (AI agency: 20 clients × £500/mo in 60 days)
- **DARO'S STACK**: Every tool/API he uses (n8n, Playwright, Claw agent, etc.)
- **PERSONALITY**: Sharp, direct, no fluff, revenue-focused

**To update personality or context**, edit the `SYSTEM_PROMPT` constant. It's embedded fresh into every request via `buildSystemPrompt()`.

## Frontend Architecture (app.js)

The entire frontend is a single 700+ line JavaScript file organized by feature:

| Section | Responsibility |
|---------|---|
| **LOGIN** | Session auth (password in sessionStorage, checked on init) |
| **CLOCK** | Real-time clock/date display updated every 1s |
| **WEATHER** | Open-meteo API (hardcoded to Swansea coords) |
| **NOTES** | localStorage-backed notes with auto-save |
| **MEMORY** | Redis integration: load/save/display memory badge |
| **VOICE** | Speech Synthesis (TTS) and Speech Recognition (STT) |
| **CHAT** | Message history, streaming, rendering, send logic |
| **TODOS** | Todo CRUD with optimistic updates |
| **JARVIS CALL** | Streaming handler for `/api/claude` responses |

### Key Variables
- `history`: Array of `{role, content}` messages (user/assistant)
- `memory`: Object from Redis with `{summary, recent, facts}`
- `todos`: Array of `{id, text, done}`
- `voiceEnabled`: TTS toggle state
- `selectedImage`: Currently attached image (base64 + filename)

## API Endpoints

### `/api/claude` (POST)
**Purpose:** Main chat endpoint  
**Input:** `{ messages, memory, todos, image? }`  
**Output:** Server-Sent Events (SSE) stream of JSON chunks OR plain JSON (if web search used)  
**Behavior:**
- Builds system prompt with memory + todos context
- Auto-detects if query needs web search (patterns: "news", "latest", "who is", etc.)
- If search needed: performs search, includes results, returns JSON
- Otherwise: streams Claude response as SSE (`data: {...}` lines)
- Can emit `{todoAdded: {...}}` chunks to trigger client-side todo add
- Max duration: 60 seconds

### `/api/memory` (GET / POST / DELETE)
**GET:** Returns `{summary, recent, facts}` from Redis  
**POST:** Saves messages, triggers summarization every 8 messages  
**DELETE:** Clears all memory  
**Max duration:** 15 seconds

### `/api/todos` (GET / POST / PATCH / DELETE)
**GET:** Returns `{todos: [...]}`  
**POST:** Adds todo (body: `{text}`)  
**PATCH:** Toggles done status (query: `?id=`)  
**DELETE:** Removes todo (query: `?id=`)  
**Max duration:** 10 seconds

### `/api/elevenlabs-tts` (POST)
**Purpose:** Proxy to ElevenLabs API  
**Input:** `{text}`  
**Output:** `{audioUrl}` (signed URL to audio blob)  
**Falls back:** To browser SpeechSynthesis if API fails  
**Max duration:** 20 seconds

### `/api/brave-search` (POST, internal only)
**Input:** `{query}`  
**Output:** `{results: [{url, title, description}, ...]}`  
**Max duration:** 15 seconds

## Commonly Used Commands

### Local Development (Windows)
```bash
# Install dependencies
npm install

# Run local server (not built-in — use Vercel CLI or static server)
# Option 1: Use Vercel CLI
vercel dev              # Runs on http://localhost:3000

# Option 2: Use Python/Node simple server (frontend only, no API)
npx http-server -p 8080  # Frontend only, API calls will fail

# Environment: Copy and fill .env.example
copy .env.example .env  # Edit .env with API keys
```

### Build & Deploy
```bash
# Vercel handles builds automatically
# To test build locally:
vercel build           # Creates .vercel/output

# Deploy to production
vercel --prod          # Must have Vercel CLI logged in

# Deploy specific branch/environment
vercel --prod --env production
```

### Testing
There's a Playwright dev dependency but no test suite yet. To add tests:
```bash
# Run Playwright tests (when added)
npx playwright test
npx playwright test --ui          # Interactive mode
npx playwright test --debug       # Step through
```

## Environment Variables

**Required** (app won't start without these):
- `ANTHROPIC_API_KEY` — Claude API key

**Strongly Recommended**:
- `JARVIS_PASSWORD` — Login password (if not set, no auth)
- `UPSTASH_REDIS_REST_URL` — Redis connection
- `UPSTASH_REDIS_REST_TOKEN` — Redis auth

**Optional** (graceful fallback if missing):
- `BRAVE_API_KEY` — Web search
- `ELEVENLABS_API_KEY` — TTS (fallback to browser SpeechSynthesis)
- `GMAIL_CLIENT_ID` / `GMAIL_CLIENT_SECRET` / `GMAIL_CALLBACK_URL` — Gmail OAuth

**Set on Vercel** via:
- Dashboard: Settings → Environment Variables
- CLI: `vercel env add VARIABLE_NAME`
- Check with: `vercel env list`

## Key Code Patterns

### Streaming Response Handling
The frontend expects either:
1. **SSE stream** (normal chat): `Content-Type: text/event-stream` with `data: {...}` lines
2. **Plain JSON** (web search): `Content-Type: application/json` with `{content, error}`

See `callJarvis()` in app.js for how it detects and handles both.

### Redis Helpers
All Redis operations use Upstash REST API (not TCP). Always check for falsy values:
```js
const data = await redis.get(key);
if (!data) { /* use default */ }
if (typeof data === 'string') data = JSON.parse(data);
```

### System Prompt Construction
The prompt is rebuilt fresh on every request:
```js
const systemPrompt = buildSystemPrompt(memory, todos);
```
This ensures todos and memory are always current. **Do not cache or reuse the system prompt.**

### Voice Limitations
- **TTS**: Browser SpeechSynthesis is limited to ~1000 chars. For longer responses, use ElevenLabs API via `/api/elevenlabs-tts`.
- **STT**: Speech Recognition API is disabled in private/incognito mode.
- **Fallback**: If ElevenLabs fails, app automatically uses browser SpeechSynthesis.

## Important Constraints

1. **Frontend is single-file vanilla JS** — No build step, no bundler. All logic in `app.js`, all CSS in `style.css`.
2. **Stateless backend** — Each API call is independent. State is in Redis or sessionStorage.
3. **Cold starts** — Vercel serverless functions have cold start latency (~1s first call).
4. **Streaming SSE** — Must use proper SSE format: `data: {json}\n\n`
5. **CORS** — All API endpoints have `Access-Control-Allow-Origin: *` set.
6. **Password stored client-side** — `JARVIS_PASSWORD` env var is injected into HTML as `window.JARVIS_PASSWORD`. This is intentional (single user, personal dashboard).
7. **No test suite** — Only Playwright dev dep. Tests would need to hit real Vercel functions or mock them.

## Debugging Tips

### Console Logging
- Frontend: Open DevTools (F12) → Console tab. Look for `[memory]`, `[jarvis]`, `[todos]` prefixes.
- Backend: Use `vercel logs` or check Vercel dashboard → Function Logs tab.

### Common Issues
| Problem | Check |
|---------|-------|
| Chat not responding | API key set? Redis connected? |
| Memory not saving | Redis env vars correct? |
| Voice not working | Browser supports Web Speech API? Microphone permission granted? |
| Web search not triggered | Query matches `needsSearch()` patterns? |
| TTS cutting off | Use ElevenLabs API instead of browser fallback? |

### Redis Debugging
```bash
# View keys (requires Upstash dashboard or CLI)
# https://console.upstash.com → Select database → Data

# Check recent memory
# Should see keys like: jarvis:summary, jarvis:recent, jarvis:facts
```

## Performance Notes

- **Frontend load**: ~50KB (HTML + CSS + JS uncompressed, one request)
- **API response**: ~500ms average (100ms Claude, rest is overhead)
- **Streaming**: Chunks arrive every ~100ms
- **Memory bandwidth**: Minimal (Redis queries are <1KB)
- **Voice**: Local browser APIs, no server overhead

## Voice Features

Voice I/O (TTS + STT) is fully implemented. See [VOICE_FEATURES.md](VOICE_FEATURES.md) for:
- Feature overview
- Testing procedures
- Browser compatibility
- Troubleshooting

Key points:
- TTS: Auto-speaks responses (toggleable via button)
- STT: Mic button (🎤) records voice and populates chat input
- Fallback: Browser SpeechSynthesis if ElevenLabs unavailable
- No server-side voice processing (pure client-side)

## Deployment Notes

- **Hosting**: Vercel (static + serverless)
- **Domain**: `https://jarvis-sand-two.vercel.app`
- **CI/CD**: Auto-deploys on git push (configured in Vercel)
- **Env vars**: Set in Vercel dashboard, not in `.env` file
- **Secrets**: Never commit `.env` — use Vercel dashboard only

## Future Improvements (Out of Scope)

- [ ] Multi-user support (currently single-user: Daro)
- [ ] Test suite (Playwright e2e tests)
- [ ] Rate limiting / quota management
- [ ] Error recovery / retry logic
- [ ] Analytics / usage tracking
- [ ] Voice command macros (e.g., "Hey Jarvis, add to todos")
- [ ] Code syntax highlighting in chat
