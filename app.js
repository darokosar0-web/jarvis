/* ===== LOGIN AUTHENTICATION ===== */
function initLogin() {
  const loginContainer = document.getElementById('login-container');
  const dashboardContainer = document.getElementById('dashboard-container');
  const loginForm = document.getElementById('login-form');
  const passwordInput = document.getElementById('password-input');
  const loginError = document.getElementById('login-error');
  const correctPassword = window.JARVIS_PASSWORD;

  // Check if already logged in
  if (sessionStorage.getItem('jarvis-authenticated')) {
    loginContainer.style.display = 'none';
    dashboardContainer.style.display = 'flex';
    return;
  }

  // Show login page
  loginContainer.style.display = 'flex';
  dashboardContainer.style.display = 'none';
  passwordInput.focus();

  loginForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const enteredPassword = passwordInput.value.trim();

    if (enteredPassword === correctPassword) {
      sessionStorage.setItem('jarvis-authenticated', 'true');
      loginError.style.display = 'none';
      loginContainer.style.display = 'none';
      dashboardContainer.style.display = 'flex';
      passwordInput.value = '';
      initJarvis();
    } else {
      loginError.textContent = 'INCORRECT ACCESS CODE. TRY AGAIN.';
      loginError.style.display = 'block';
      passwordInput.value = '';
      passwordInput.focus();
    }
  });
}

/* ===== CLOCK ===== */
function updateClock() {
  const now = new Date();

  document.getElementById('clock-time').textContent = now.toLocaleTimeString('en-GB', {
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  });

  document.getElementById('clock-date').textContent = now.toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  }).toUpperCase();
}

setInterval(updateClock, 1000);
updateClock();

/* ===== WEATHER ===== */
const WEATHER_DESCRIPTIONS = {
  0: 'Clear Sky',       1: 'Mainly Clear',   2: 'Partly Cloudy', 3: 'Overcast',
  45: 'Fog',            48: 'Freezing Fog',
  51: 'Light Drizzle',  53: 'Drizzle',        55: 'Heavy Drizzle',
  61: 'Light Rain',     63: 'Rain',           65: 'Heavy Rain',
  71: 'Light Snow',     73: 'Snow',           75: 'Heavy Snow',
  80: 'Light Showers',  81: 'Showers',        82: 'Heavy Showers',
  95: 'Thunderstorm',   96: 'Storm + Hail',   99: 'Heavy Storm',
};

const WEATHER_ICONS = {
  0: '☀️',  1: '🌤️', 2: '⛅', 3: '☁️',
  45: '🌫️', 48: '🌫️',
  51: '🌦️', 53: '🌦️', 55: '🌧️',
  61: '🌧️', 63: '🌧️', 65: '🌧️',
  71: '🌨️', 73: '🌨️', 75: '❄️',
  80: '🌦️', 81: '🌧️', 82: '⛈️',
  95: '⛈️', 96: '⛈️', 99: '⛈️',
};

async function fetchWeather() {
  try {
    const url =
      'https://api.open-meteo.com/v1/forecast' +
      '?latitude=51.6214&longitude=-3.9436' +
      '&current=temperature_2m,relative_humidity_2m,apparent_temperature,weathercode,windspeed_10m' +
      '&timezone=Europe%2FLondon';

    const res = await fetch(url);
    if (!res.ok) throw new Error('API error');
    const data = await res.json();
    const cur = data.current;
    const code = cur.weathercode;

    document.getElementById('weather-icon').textContent     = WEATHER_ICONS[code] ?? '🌡️';
    document.getElementById('weather-temp').textContent     = `${Math.round(cur.temperature_2m)}°C`;
    document.getElementById('weather-desc').textContent     = WEATHER_DESCRIPTIONS[code] ?? 'Unknown';
    document.getElementById('weather-wind').textContent     = `${Math.round(cur.windspeed_10m)} km/h`;
    document.getElementById('weather-humidity').textContent = `${cur.relative_humidity_2m}%`;
    document.getElementById('weather-feels').textContent    = `${Math.round(cur.apparent_temperature)}°C`;
  } catch {
    document.getElementById('weather-desc').textContent = 'Unavailable';
  }
}

fetchWeather();
setInterval(fetchWeather, 30 * 60 * 1000);

/* ===== NOTES ===== */
const notesArea = document.getElementById('notes-area');
const saveBtn   = document.getElementById('save-notes');

notesArea.value = localStorage.getItem('jarvis-notes') ?? '';

let autoSaveTimer;

function saveNotes() {
  localStorage.setItem('jarvis-notes', notesArea.value);
  saveBtn.textContent = 'SAVED ✓';
  saveBtn.classList.add('saved');
  clearTimeout(autoSaveTimer);
  autoSaveTimer = setTimeout(() => {
    saveBtn.textContent = 'SAVE';
    saveBtn.classList.remove('saved');
  }, 2000);
}

saveBtn.addEventListener('click', saveNotes);
notesArea.addEventListener('keydown', (e) => {
  if (e.ctrlKey && e.key === 's') { e.preventDefault(); saveNotes(); }
});
notesArea.addEventListener('input', () => {
  clearTimeout(autoSaveTimer);
  autoSaveTimer = setTimeout(saveNotes, 1500);
});

/* ===== MEMORY ===== */
let memory = null;
let todos = [];

async function loadMemory() {
  try {
    const res = await fetch('/api/memory');
    if (!res.ok) {
      console.warn('[memory] GET failed:', res.status);
      return;
    }
    const data = await res.json();
    console.log('[memory] Loaded:', data);
    if (data && (data.summary || (data.sessions && data.sessions.length > 0) || (data.messages && data.messages.length > 0))) {
      memory = data;
      showMemoryBadge(data);
      console.log('[memory] Using memory in session');
    } else {
      console.log('[memory] No previous sessions found');
    }
  } catch (err) {
    console.error('[memory] Load error:', err);
  }
}
async function loadTodos() {
  try {
    const res = await fetch('/api/todos');
    const data = await res.json();
    todos = data.todos || [];
    console.log('[todos] Loaded:', todos.length, 'items');
  } catch (err) {
    console.error('[todos] Load failed:', err);
  }
}

function showMemoryBadge(data) {
  const badge = document.getElementById('memory-badge');
  const info  = document.getElementById('memory-info');
  if (!badge) return;
  const count = data.sessionCount || (data.sessions && data.sessions.length) || 0;
  info.textContent = `${count} SESSION${count !== 1 ? 'S' : ''} REMEMBERED`;
  badge.style.display = 'flex';
}

async function saveMemory() {
  if (history.length < 2) return;
  try {
    console.log('[memory] Saving after message:', history.length);
    await fetch('/api/memory', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: history }),
    });
  } catch (err) {
    console.error('[memory] Save failed:', err);
  }
}

function saveMemoryBeacon() {
  if (history.length < 4) return;
  try {
    const blob = new Blob([JSON.stringify({ messages: history })], { type: 'application/json' });
    navigator.sendBeacon('/api/memory', blob);
  } catch { /* silent */ }
}

window.addEventListener('beforeunload', saveMemoryBeacon);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') saveMemoryBeacon();
});

/* ===== AI CHAT ===== */
const chatMessages = document.getElementById('chat-messages');
const chatInput    = document.getElementById('chat-input');
const sendBtn      = document.getElementById('send-btn');
const micBtn       = document.getElementById('mic-btn');
const imageBtn     = document.getElementById('image-btn');
const imageInput   = document.getElementById('image-input');

let history = [];
let busy    = false;
let selectedImage = null;

/* ===== VOICE ===== */
let voiceEnabled = false;
let isListening = false;
let currentUtterance = null;
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

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

function splitIntoChunks(text) {
  const chunks = [];

  // Split by newlines to create logical lines
  const lines = text.split(/\n+/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Check if this is a list item (bullet or numbered)
    const isListItem = /^[-*+]\s+/.test(trimmed) || /^\d+\.\s+/.test(trimmed);

    // Split each line into sentences
    const sentences = trimmed.match(/[^.!?]*[.!?]+/g) || [trimmed];

    for (const sentence of sentences) {
      const text = sentence.trim();
      if (text) {
        chunks.push({ text, isListItem });
      }
    }
  }

  return chunks;
}

async function speakMessage(text) {
  if (!voiceEnabled || !text) return;

  stopSpeaking();
  updateVoiceIndicator('speaking');

  try {
    const cleanText = stripMarkdown(text);
    const chunks = splitIntoChunks(cleanText);

    if (chunks.length === 0) return;

    const audio = document.getElementById('tts-audio');
    if (!audio) {
      console.warn('Audio element not found');
      speakWithBrowser(text);
      return;
    }

    const audioQueue = [];

    // Fetch audio for all chunks first
    for (const chunk of chunks) {
      const response = await fetch('/api/elevenlabs-tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: chunk.text }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `API error: ${response.status}`);
      }

      const { audioUrl } = await response.json();
      audioQueue.push({ audioUrl, isListItem: chunk.isListItem });
    }

    // Play audio queue sequentially with 400ms gaps
    let currentIndex = 0;
    let playbackTimeout = null;

    const scheduleNext = (delayMs = 400) => {
      if (playbackTimeout) clearTimeout(playbackTimeout);
      playbackTimeout = setTimeout(playNext, delayMs);
    };

    const playNext = () => {
      if (currentIndex >= audioQueue.length) {
        updateVoiceIndicator(null);
        currentUtterance = null;
        return;
      }

      const { audioUrl } = audioQueue[currentIndex];
      currentIndex++;

      audio.src = audioUrl;
      audio.onended = () => scheduleNext(400);
      audio.onerror = () => {
        console.warn('Audio playback error');
        scheduleNext(400);
      };

      currentUtterance = { type: 'audio', element: audio };
      audio.play().catch(() => {
        console.warn('Audio play failed');
        scheduleNext(400);
      });
    };

    playNext();
  } catch (err) {
    console.error('TTS error:', err.message || err);
    speakWithBrowser(text);
  }
}

function speakWithBrowser(text) {
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 0.95;
  utterance.pitch = 1.0;
  utterance.volume = 1.0;
  utterance.lang = 'en-US';
  utterance.onend = () => { currentUtterance = null; updateVoiceIndicator(null); };
  utterance.onerror = () => updateVoiceIndicator(null);
  currentUtterance = { type: 'utterance', object: utterance };
  speechSynthesis.speak(utterance);
  updateVoiceIndicator('speaking');
}

function stopSpeaking() {
  if (!currentUtterance) return;
  if (currentUtterance.type === 'audio') {
    currentUtterance.element.pause();
    currentUtterance.element.currentTime = 0;
  } else {
    speechSynthesis.cancel();
  }
  currentUtterance = null;
  updateVoiceIndicator(null);
}

function startListening() {
  if (!SpeechRecognition) { alert('Speech recognition not supported'); return; }
  if (isListening) return;

  const recognition = new SpeechRecognition();
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.lang = 'en-US';

  recognition.onstart = () => { isListening = true; updateVoiceIndicator('listening'); micBtn?.classList.add('mic-active'); };
  recognition.onresult = (event) => {
    let transcript = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      if (event.results[i].isFinal) transcript = event.results[i][0].transcript;
    }
    if (transcript) chatInput.value = transcript;
  };
  recognition.onend = () => { isListening = false; updateVoiceIndicator(null); micBtn?.classList.remove('mic-active'); };
  recognition.onerror = () => { isListening = false; updateVoiceIndicator(null); micBtn?.classList.remove('mic-active'); };
  recognition.start();
}

function updateVoiceIndicator(state) {
  const badge = document.querySelector('.voice-badge');
  if (!badge) return;
  if (state === 'listening') { badge.textContent = '🎤 LISTENING...'; badge.classList.add('active'); }
  else if (state === 'speaking') { badge.textContent = '🔊 SPEAKING...'; badge.classList.add('active'); }
  else { badge.classList.remove('active'); }
}

/* ===== IMAGE UPLOAD ===== */
function displaySelectedImage(base64, filename) {
  if (!selectedImage) {
    selectedImage = { base64, filename };
    imageBtn.classList.add('image-selected');
    imageBtn.title = `Image selected: ${filename}`;
  }
}

function clearSelectedImage() {
  selectedImage = null;
  imageInput.value = '';
  imageBtn.classList.remove('image-selected');
  imageBtn.title = 'Upload image';
}

imageBtn?.addEventListener('click', () => imageInput.click());
imageInput?.addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  if (!file.type.startsWith('image/')) { alert('Please select an image file'); imageInput.value = ''; return; }
  const reader = new FileReader();
  reader.onload = (event) => {
    const base64 = event.target?.result?.split(',')[1];
    if (base64) displaySelectedImage(base64, file.name);
  };
  reader.readAsDataURL(file);
});

function escHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function renderText(text) {
  return escHtml(text)
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/\n/g, '<br>');
}

function appendMessage(role, content) {
  const wrap = document.createElement('div');
  wrap.className = `message ${role}`;

  const avatar = document.createElement('div');
  avatar.className = 'msg-avatar';
  avatar.textContent = role === 'jarvis' ? 'J' : 'D';

  const bubble = document.createElement('div');
  bubble.className = 'msg-bubble';
  bubble.innerHTML = content ? renderText(content) : '<span class="typing-dot"></span><span class="typing-dot"></span><span class="typing-dot"></span>';

  wrap.appendChild(avatar);
  wrap.appendChild(bubble);
  chatMessages.appendChild(wrap);
  chatMessages.scrollTop = chatMessages.scrollHeight;

  return wrap;
}
/* ===== TODOS ===== */
function renderTodos() {
  const list = document.getElementById('todo-list');
  const empty = document.getElementById('todo-empty');
  if (!list) return;

  list.querySelectorAll('.todo-item').forEach(el => el.remove());

  if (todos.length === 0) {
    if (empty) empty.style.display = 'block';
    return;
  }

  if (empty) empty.style.display = 'none';

  todos.forEach(todo => {
    const item = document.createElement('div');
    item.className = 'todo-item';
    item.style.cssText = 'display:flex; align-items:center; gap:8px; padding:6px 12px; border-bottom:1px solid #0d2137;';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = todo.done;
    checkbox.style.cssText = 'cursor:pointer; accent-color:#1a8ac8;';
    checkbox.addEventListener('change', async () => {
      await fetch(`/api/todos?id=${todo.id}`, { method: 'PATCH' });
      todo.done = !todo.done;
      renderTodos();
    });

    const label = document.createElement('span');
    label.textContent = todo.text;
    label.style.cssText = `flex:1; font-size:12px; color:${todo.done ? '#4a6a8a' : '#a0c4e8'}; text-decoration:${todo.done ? 'line-through' : 'none'};`;

    const del = document.createElement('button');
    del.textContent = '×';
    del.style.cssText = 'background:none; border:none; color:#4a6a8a; cursor:pointer; font-size:16px; line-height:1; padding:0;';
    del.addEventListener('click', async () => {
      await fetch(`/api/todos?id=${todo.id}`, { method: 'DELETE' });
      todos = todos.filter(t => t.id !== todo.id);
      renderTodos();
    });

    item.appendChild(checkbox);
    item.appendChild(label);
    item.appendChild(del);
    list.appendChild(item);
  });
}

document.getElementById('todo-add-btn')?.addEventListener('click', async () => {
  const input = document.getElementById('todo-input');
  const text = input?.value.trim();
  if (!text) return;
  const res = await fetch('/api/todos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  const data = await res.json();
  todos.push(data.todo);
  renderTodos();
  input.value = '';
});

document.getElementById('todo-input')?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') document.getElementById('todo-add-btn')?.click();
});
function removeTyping() {
  const el = document.getElementById('typing-indicator');
  if (el) el.remove();
}

/* ===== CALL JARVIS WITH STREAMING ===== */
async function callJarvis(messages, onChunk) {
  console.log('[jarvis] Sending request with memory:', memory ? 'YES' : 'NO');
  const res = await fetch('/api/claude', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages, memory, todos }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const contentType = res.headers.get('content-type') || '';

  // Web search = normal JSON response
  if (contentType.includes('application/json') && !contentType.includes('text/event-stream')) {
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    return data.content;
  }

  // Normal message = streaming
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let fullText = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value);
    const lines = chunk.split('\n');

    for (const line of lines) {
  if (line.startsWith('data: ') && line !== 'data: [DONE]') {
    try {
      const parsed = JSON.parse(line.slice(6));

      if (parsed.todoAdded) {
        todos.push(parsed.todoAdded);
        renderTodos();
        continue;
      }

      const { text } = parsed;
      fullText += text;
      if (onChunk) onChunk(fullText);
    } catch {}
  }
}
  }

  return fullText;
}

/* ===== SEND MESSAGE ===== */
async function sendMessage() {
  const text = chatInput.value.trim();
  if ((!text && !selectedImage) || busy) return;

  chatInput.value = '';
  busy = true;
  sendBtn.disabled = true;

  appendMessage('user', text || '(Image sent)');

  let messageContent = text;
  if (selectedImage) {
    messageContent = [
      { type: 'text', text: text || '(No text)' },
      { type: 'image', base64: selectedImage.base64, filename: selectedImage.filename },
    ];
  }

  history.push({ role: 'user', content: messageContent });

  // Create streaming bubble immediately
  const streamBubble = appendMessage('jarvis', '...');

  try {
  const reply = await callJarvis(history, (partial) => {
      streamBubble.querySelector('.msg-bubble').innerHTML = renderText(partial);
      chatMessages.scrollTop = chatMessages.scrollHeight;
    });

    // Final render
    streamBubble.querySelector('.msg-bubble').innerHTML = renderText(reply);
    speakMessage(reply);
    history.push({ role: 'assistant', content: reply });
    clearSelectedImage();
    await saveMemory();
  } catch (err) {
    streamBubble.querySelector('.msg-bubble').innerHTML = 'Connection error. Check your API key is set in Vercel environment variables.';
    console.error('Jarvis error:', err);
  } finally {
    busy = false;
    sendBtn.disabled = false;
    chatInput.focus();
  }
}

sendBtn.addEventListener('click', sendMessage);
chatInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
});
micBtn?.addEventListener('click', startListening);

const ttsToggleBtn = document.getElementById('tts-toggle-btn');
ttsToggleBtn?.addEventListener('click', () => {
  voiceEnabled = !voiceEnabled;
  const emoji = voiceEnabled ? '🔊' : '🔇';
  ttsToggleBtn.textContent = emoji;
  ttsToggleBtn.title = `Toggle TTS (currently ${voiceEnabled ? 'ON' : 'OFF'})`;
});

/* ===== INIT ===== */
function warmupTTS() {
  fetch('/api/elevenlabs-tts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: 'hello' }),
  }).catch(() => {});
}

async function initJarvis() {
  appendMessage('jarvis', '');

  warmupTTS();

  await loadMemory();
  await loadTodos();

  const hasMemory = memory && memory.summary;
  const greetContent = hasMemory
    ? 'Greet Daro. Acknowledge something specific from memory. Ask what he needs today. Under 3 sentences, sharp.'
    : 'Greet Daro. You know who he is — 25, Swansea, building an AI agency, chasing financial freedom. Be sharp, direct, under 3 sentences. Ask what he needs today.';

  const initMessages = [{ role: 'user', content: greetContent }];

  try {
    const greeting = await callJarvis(initMessages, (partial) => {
      const bubbles = chatMessages.querySelectorAll('.msg-bubble');
      const last = bubbles[bubbles.length - 1];
      if (last) last.innerHTML = renderText(partial);
    });

    const bubbles = chatMessages.querySelectorAll('.msg-bubble');
    const last = bubbles[bubbles.length - 1];
    if (last) last.innerHTML = renderText(greeting);

    history = [
      { role: 'user', content: greetContent },
      { role: 'assistant', content: greeting },
    ];
  } catch {
    const bubbles = chatMessages.querySelectorAll('.msg-bubble');
    const last = bubbles[bubbles.length - 1];
    if (last) last.innerHTML = 'Jarvis online. What do you need, Daro?';
  }
document.getElementById('clear-memory-btn')?.addEventListener('click', async () => {
  if (!confirm('Clear all Jarvis memory?')) return;
  await fetch('/api/memory', { method: 'DELETE' });
  memory = null;
  const badge = document.getElementById('memory-badge');
  if (badge) badge.style.display = 'none';
  alert('Memory cleared.');
});
}

// Initialize login first, then Jarvis
document.addEventListener('DOMContentLoaded', initLogin);