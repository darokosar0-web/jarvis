#!/usr/bin/env node

/*
 * Jarvis end-to-end monitor (Playwright).
 *
 * Drives the live site in a real Chromium browser exactly like a user would:
 *   1. Open Jarvis
 *   2. Log in with the access code
 *   3. Send a test message
 *   4. Wait for the streamed reply and validate it
 *   5. Close the browser
 *
 * On ANY failure it sends a Telegram alert (with a screenshot if one was
 * captured) and exits non-zero. On success it exits 0.
 *
 * Run:  node monitor.js
 * Requires the Chromium browser binary:  npx playwright install chromium
 */

const fs = require('fs');
const https = require('https');
const path = require('path');

try { require('dotenv').config({ path: path.join(__dirname, '.env') }); } catch { /* dotenv optional */ }

const { chromium } = require('playwright');

// ---- Config (env overrides, with sensible defaults) -------------------------
const URL            = process.env.JARVIS_URL      || 'https://jarvis-sand-two.vercel.app';
const PASSWORD       = process.env.JARVIS_PASSWORD || '1275';
const TEST_MESSAGE   = 'ping — automated monitor check, reply with one short sentence';
const TG_BOT_TOKEN   = process.env.TELEGRAM_BOT_TOKEN;
const TG_CHAT_ID     = process.env.TELEGRAM_CHAT_ID || '7604917494';
const LOG_FILE       = process.env.JARVIS_MONITOR_LOG || 'C:\\Users\\shara\\Desktop\\jarvis-monitor.log';
const SHOT_FILE      = path.join(__dirname, 'monitor-failure.png');

// Per-step timeouts (ms)
const NAV_TIMEOUT    = 30000;  // page load
const LOGIN_TIMEOUT  = 15000;  // dashboard appears after auth
const REPLY_TIMEOUT  = 60000;  // model finishes streaming its answer

function timestamp() {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

function log(status, details) {
  const line = `[${timestamp()}] STATUS: ${status} - ${details}\n`;
  try { fs.appendFileSync(LOG_FILE, line, 'utf-8'); } catch { /* best effort */ }
  console.log(line.trim());
}

// ---- Telegram alerting ------------------------------------------------------
function tgRequest(method, payload, isMultipart, parts) {
  return new Promise((resolve) => {
    if (!TG_BOT_TOKEN) {
      console.error('TELEGRAM_BOT_TOKEN not set — cannot send alert.');
      return resolve(false);
    }

    let body, headers;
    if (isMultipart) {
      ({ body, headers } = parts);
    } else {
      body = Buffer.from(JSON.stringify(payload), 'utf-8');
      headers = { 'Content-Type': 'application/json', 'Content-Length': body.length };
    }

    const req = https.request({
      hostname: 'api.telegram.org',
      path: `/bot${TG_BOT_TOKEN}/${method}`,
      method: 'POST',
      headers,
      timeout: 15000,
    }, (res) => {
      res.on('data', () => {});
      res.on('end', () => resolve(res.statusCode === 200));
    });

    req.on('error', (e) => { console.error('Telegram error:', e.message); resolve(false); });
    req.on('timeout', () => { req.destroy(); console.error('Telegram timeout'); resolve(false); });
    req.write(body);
    req.end();
  });
}

function sendTelegramText(text) {
  return tgRequest('sendMessage', { chat_id: TG_CHAT_ID, text, parse_mode: 'Markdown' });
}

// Send the failure screenshot as a photo with the details as caption.
function sendTelegramPhoto(filePath, caption) {
  const boundary = '----jarvismon' + Date.now();
  const file = fs.readFileSync(filePath);

  const pre =
    `--${boundary}\r\nContent-Disposition: form-data; name="chat_id"\r\n\r\n${TG_CHAT_ID}\r\n` +
    `--${boundary}\r\nContent-Disposition: form-data; name="caption"\r\n\r\n${caption}\r\n` +
    `--${boundary}\r\nContent-Disposition: form-data; name="photo"; filename="failure.png"\r\n` +
    `Content-Type: image/png\r\n\r\n`;
  const post = `\r\n--${boundary}--\r\n`;

  const body = Buffer.concat([Buffer.from(pre, 'utf-8'), file, Buffer.from(post, 'utf-8')]);
  const headers = {
    'Content-Type': `multipart/form-data; boundary=${boundary}`,
    'Content-Length': body.length,
  };
  return tgRequest('sendPhoto', null, true, { body, headers });
}

async function alert(details, hasScreenshot) {
  const caption = `🚨 *Jarvis Monitor FAIL* 🚨\n\n*Details:* ${details}\n*Time:* ${timestamp()}\n*URL:* ${URL}`;
  let sent = false;
  if (hasScreenshot && fs.existsSync(SHOT_FILE)) {
    sent = await sendTelegramPhoto(SHOT_FILE, caption);
  }
  if (!sent) {
    await sendTelegramText(caption);
  }
}

// ---- The monitor run --------------------------------------------------------
async function run() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.setDefaultTimeout(LOGIN_TIMEOUT);

  try {
    // 1. Open Jarvis
    await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT });

    // 2. Log in
    await page.waitForSelector('#password-input', { state: 'visible', timeout: NAV_TIMEOUT });
    await page.fill('#password-input', PASSWORD);
    await page.click('.login-btn');

    // Dashboard must appear (wrong password keeps the login form up and shows an error)
    try {
      await page.waitForSelector('#chat-input', { state: 'visible', timeout: LOGIN_TIMEOUT });
    } catch {
      const errVisible = await page.isVisible('#login-error').catch(() => false);
      const errText = errVisible ? (await page.textContent('#login-error')).trim() : '';
      throw new Error(`Login failed — dashboard never appeared${errText ? ` (page said: "${errText}")` : ''}`);
    }

    // 3. Send a test message
    await page.fill('#chat-input', TEST_MESSAGE);
    await page.click('#send-btn');

    // The send button disables while busy, then re-enables when the reply is done.
    await page.waitForSelector('#send-btn:disabled', { timeout: 5000 }).catch(() => {
      throw new Error('Send button never disabled — message may not have been sent');
    });
    await page.waitForSelector('#send-btn:not(:disabled)', { timeout: REPLY_TIMEOUT });

    // 4. Validate the reply (last Jarvis bubble)
    const bubbles = page.locator('.message.jarvis .msg-bubble');
    const count = await bubbles.count();
    if (count === 0) throw new Error('No Jarvis response bubble rendered');

    const reply = (await bubbles.last().innerText()).trim();

    if (!reply) {
      throw new Error('Jarvis reply is empty');
    }
    if (/^[.…\s]*$/.test(reply)) {
      throw new Error('Jarvis reply never streamed past the typing indicator');
    }
    if (/Connection error/i.test(reply)) {
      throw new Error(`Jarvis returned the connection-error fallback: "${reply}"`);
    }
    // The app renders backend/API failures as the bubble text rather than throwing,
    // so an "Error:"-shaped reply is a real outage, not a valid answer.
    if (/\bError:|GoogleGenerativeAI|API error|error fetching/i.test(reply)) {
      throw new Error(`Jarvis reply contains a backend error: "${reply.slice(0, 200)}"`);
    }
    if (reply.length < 3) {
      throw new Error(`Jarvis reply suspiciously short: "${reply}"`);
    }

    // 5. Done — success
    const preview = reply.replace(/\s+/g, ' ').slice(0, 120);
    const details = `Logged in, sent test, got valid reply (${reply.length} chars): ${preview}`;
    log('PASS', details);
    await browser.close();
    return { ok: true, status: 'PASS', details };

  } catch (err) {
    // Capture a screenshot of whatever state we failed in, for the alert.
    let shot = false;
    try {
      await page.screenshot({ path: SHOT_FILE, fullPage: true });
      shot = true;
    } catch { /* ignore screenshot failure */ }

    await browser.close().catch(() => {});

    log('FAIL', err.message);
    await alert(err.message, shot);
    return { ok: false, status: 'FAIL', details: err.message, screenshot: shot };
  }
}

// ---- HTTP server ------------------------------------------------------------
// Exposes the monitor over HTTP so it can be triggered on demand:
//   GET /run-monitor → runs run() once and returns its result as JSON.
const http = require('http');

const SERVER_PORT = Number(process.env.MONITOR_PORT) || 3001;
let running = false; // guard against overlapping runs (shared screenshot file)

function startServer() {
  const server = http.createServer(async (req, res) => {
    if (req.method === 'GET' && req.url === '/run-monitor') {
      if (running) {
        res.writeHead(409, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'A monitor run is already in progress' }));
        return;
      }
      running = true;
      try {
        const result = await run();
        res.writeHead(result.ok ? 200 : 500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ...result, time: timestamp() }));
      } catch (err) {
        // Anything run() itself couldn't catch (e.g. browser failed to launch).
        log('FAIL', `Monitor crashed: ${err.message}`);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, status: 'FAIL', details: `Monitor crashed: ${err.message}`, time: timestamp() }));
      } finally {
        running = false;
      }
      return;
    }
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: 'Not found' }));
  });

  server.listen(SERVER_PORT, () => {
    console.log(`Jarvis monitor server listening on http://localhost:${SERVER_PORT} (GET /run-monitor)`);
  });
}

// ---- Entrypoint -------------------------------------------------------------
// `node monitor.js --server` starts the HTTP server; plain `node monitor.js`
// keeps the original one-shot CLI behaviour (run once, exit 0/1).
if (process.argv.includes('--server') || process.argv.includes('serve')) {
  startServer();
} else {
  run()
    .then((result) => process.exit(result.ok ? 0 : 1))
    .catch(async (err) => {
      // Catch anything outside the try (e.g. browser failed to launch).
      log('FAIL', `Monitor crashed: ${err.message}`);
      await alert(`Monitor crashed before it could run: ${err.message}`, false);
      process.exit(1);
    });
}
