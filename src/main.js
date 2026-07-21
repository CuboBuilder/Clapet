const { ipcRenderer } = require('electron');

document.addEventListener('contextmenu', (e) => e.preventDefault());

document.addEventListener('keydown', (e) => {
  if (e.key === 'F12' ||
      ((e.ctrlKey || e.metaKey) && e.shiftKey &&
       (e.key === 'I' || e.key === 'J' || e.key === 'C'))) {
    e.preventDefault();
  }
});

Object.defineProperty(navigator, 'userAgent', {
  get: () => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  configurable: false,
});
Object.defineProperty(navigator, 'appVersion', {
  get: () => '5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  configurable: false,
});
Object.defineProperty(navigator, 'platform', {
  get: () => 'Win32',
  configurable: false,
});

if (typeof process !== 'undefined' && process.versions) {
  delete process.versions.electron;
}
if (typeof process !== 'undefined') {
  delete process.type;
}

window.addEventListener('error', (e) => {
  console.error('RENDERER ERROR:', e.error ? e.error.stack || e.error.message : e.message);
});

// --- Drag handling ---
let dragStartX = 0;
let dragStartY = 0;
let isDragging = false;
let hasMoved = false;
const DRAG_THRESHOLD = 3;

const container = document.getElementById('pet-container');

container.addEventListener('mousedown', (e) => {
  try {
    if (e.button !== 0) return;
    setState(PET_STATES.IDLE);
    dragStartX = e.screenX;
    dragStartY = e.screenY;
    isDragging = true;
    hasMoved = false;
    container.style.cursor = 'grabbing';
    container.classList.add('dragging');
    eyeGroup.style.opacity = '0';
    eyeGroup.classList.add('eye-hidden');
    glasses.style.opacity = '0';
    glasses.classList.add('eye-hidden');
    grabEyes.style.opacity = '1';
    grabEyes.classList.remove('eye-hidden');
    if (wanderEnabled) pauseWander();
    ipcRenderer.send('start-drag');
  } catch (err) { console.error('mousedown error:', err); }
});

document.addEventListener('mousemove', (e) => {
  if (!isDragging) return;
  const deltaX = e.screenX - dragStartX;
  const deltaY = e.screenY - dragStartY;
  const dist = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

  if (dist > DRAG_THRESHOLD) {
    hasMoved = true;
    ipcRenderer.send('move-window', { deltaX, deltaY });
    dragStartX = e.screenX;
    dragStartY = e.screenY;
  }
});

document.addEventListener('mouseup', () => {
  if (isDragging) {
    container.style.cursor = 'default';
    isDragging = false;
    hasMoved = false;
    container.classList.remove('dragging');
    grabEyes.style.opacity = '0';
    grabEyes.classList.add('eye-hidden');
    eyeGroup.style.opacity = '1';
    eyeGroup.classList.remove('eye-hidden');
    ipcRenderer.send('end-drag');
    if (wanderEnabled) {
      getCurrentPos().then(pos => { if (pos) wanderPos = { x: pos.x, y: pos.y }; });
      resumeWander();
    }
  }
});

// --- Animation states ---
const PET_STATES = {
  IDLE: 'idle',
  THINKING: 'thinking',
  HAPPY: 'happy',
  SLEEP: 'sleep',
  WALKING: 'walking',
};

const eyeLeft = document.getElementById('eye-rect-left');
const eyeRight = document.getElementById('eye-rect-right');
const eyeGroup = document.querySelector('.eye-group');
const grabEyes = document.getElementById('grab-eyes');
const thinkEyes = document.getElementById('think-eyes');
const happyEyes = document.getElementById('happy-eyes');
const glasses = document.getElementById('glasses');
const mouth = document.getElementById('mouth');
const mouthPath = document.querySelector('#mouth path');
const thoughtBubble = document.getElementById('thought-bubble');
const thoughtText = document.getElementById('thought-text');
const leftPaw = document.getElementById('left-paw');

const EYE_BASES = {
  left: { x: 73, y: 135, w: 30, h: 20 },
  right: { x: 119, y: 135, w: 30, h: 20 },
};
const EYE_MAX_MOVE = 12;

let currentState = 'idle';
let idleTimer = null;
let sleepInterval = null;
let chewInterval = null;
let eyeRafRunning = false;

function setState(state) {
  if (currentState === PET_STATES.SLEEP && state !== PET_STATES.SLEEP) {
    clearInterval(sleepInterval);
    sleepInterval = null;
  }
  if (currentState === PET_STATES.HAPPY && state !== PET_STATES.HAPPY) {
    stopChewing();
  }
  currentState = state;
  container.className = 'state-' + state;
  resetIdleTimer();
  if (state === PET_STATES.SLEEP) {
    thoughtBubble.classList.add('hidden');
  }

  [eyeGroup, grabEyes, thinkEyes, happyEyes, glasses, mouth].forEach(el => {
    el.style.opacity = '0';
    el.classList.add('eye-hidden');
  });

  if (state === PET_STATES.IDLE) {
    eyeGroup.style.opacity = '1';
    eyeGroup.classList.remove('eye-hidden');
    if (!eyeRafRunning) {
      eyeRafRunning = true;
      requestAnimationFrame(updateEyesSmooth);
    }
  } else if (state === PET_STATES.THINKING) {
    thinkEyes.style.opacity = '1';
    thinkEyes.classList.remove('eye-hidden');
    glasses.style.opacity = '1';
    glasses.classList.remove('eye-hidden');
  } else if (state === PET_STATES.HAPPY) {
    happyEyes.style.opacity = '1';
    happyEyes.classList.remove('eye-hidden');
    mouth.style.opacity = '1';
    mouth.classList.remove('eye-hidden');
  } else if (state === PET_STATES.WALKING) {
    eyeGroup.style.opacity = '1';
    eyeGroup.classList.remove('eye-hidden');
    if (!eyeRafRunning) {
      eyeRafRunning = true;
      requestAnimationFrame(updateEyesSmooth);
    }
  }
}

function resetIdleTimer() {
  clearTimeout(idleTimer);
  leftPaw.setAttribute('transform', '');
  if (currentState === PET_STATES.IDLE) {
    idleTimer = setTimeout(() => {
      if (currentState === PET_STATES.IDLE) {
        startPawWave();
      }
    }, 60000);
  }
}

function startPawWave() {
  try {
    const cx = 42, cy = 142;
    const keyframes = [
      { angle: 0, t: 0 },
      { angle: 60, t: 0.35 },
      { angle: -10, t: 0.55 },
      { angle: 40, t: 0.75 },
      { angle: 0, t: 1 },
    ];
    const duration = 1400;
    let start = null;

    function easeInOut(t) {
      return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
    }

    function frame(now) {
      if (!start) start = now;
      const elapsed = now - start;
      const p = Math.min(elapsed / duration, 1);

      let i = 0;
      while (i < keyframes.length - 1 && keyframes[i + 1].t <= p) i++;
      if (i >= keyframes.length - 1) {
        leftPaw.setAttribute('transform', '');
        resetIdleTimer();
        return;
      }
      const a = keyframes[i], b = keyframes[i + 1];
      const local = (p - a.t) / (b.t - a.t);
      const angle = a.angle + (b.angle - a.angle) * easeInOut(local);
      leftPaw.setAttribute('transform', `rotate(${angle.toFixed(1)}, ${cx}, ${cy})`);
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  } catch (err) { console.error('wave error:', err); }
}
function wakeUp() {
  if (currentState === PET_STATES.SLEEP) {
    setState(PET_STATES.IDLE);
    resetLegs();
  }
}

// --- Eye tracking (black rectangles move on body, global cursor) ---
const BODY_BOUNDS = { x1: 45, y1: 100, x2: 175, y2: 190 };

let targetX = 0, targetY = 0;
let currentEyeX = 0, currentEyeY = 0;

ipcRenderer.on('cursor-move', (e, { clientX, clientY }) => {
  targetX = clientX;
  targetY = clientY;
});

function lerp(a, b, t) { return a + (b - a) * t; }

function updateEyesSmooth() {
  if (currentState !== PET_STATES.IDLE && currentState !== PET_STATES.WALKING) { eyeRafRunning = false; return; }

  const rect = container.getBoundingClientRect();
  const centerX = rect.width / 2;
  const centerY = rect.height / 2;

  let dx = targetX - centerX;
  let dy = targetY - centerY;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist > 0) { dx /= dist; dy /= dist; }

  const targetMoveX = dx * EYE_MAX_MOVE;
  const targetMoveY = dy * EYE_MAX_MOVE * 2;

  currentEyeX = lerp(currentEyeX, targetMoveX, 0.15);
  currentEyeY = lerp(currentEyeY, targetMoveY, 0.15);

  let lx = EYE_BASES.left.x + currentEyeX;
  let ly = EYE_BASES.left.y + currentEyeY;
  let rx = EYE_BASES.right.x + currentEyeX;
  let ry = EYE_BASES.right.y + currentEyeY;

  const ew = EYE_BASES.left.w;
  const eh = EYE_BASES.left.h;

  lx = Math.max(BODY_BOUNDS.x1, Math.min(BODY_BOUNDS.x2 - ew, lx));
  ly = Math.max(BODY_BOUNDS.y1, Math.min(BODY_BOUNDS.y2 - eh, ly));
  rx = Math.max(BODY_BOUNDS.x1 + (EYE_BASES.right.x - EYE_BASES.left.x), Math.min(BODY_BOUNDS.x2 - ew, rx));
  ry = Math.max(BODY_BOUNDS.y1, Math.min(BODY_BOUNDS.y2 - eh, ry));

  eyeLeft.setAttribute('x', lx);
  eyeLeft.setAttribute('y', ly);
  eyeRight.setAttribute('x', rx);
  eyeRight.setAttribute('y', ry);

  requestAnimationFrame(updateEyesSmooth);
}

// --- Click reactions ---
const radialMenu = document.getElementById('radial-menu');
const walkBtn = document.getElementById('walk-btn');

function positionRadialButtons() {
  const buttons = radialMenu.querySelectorAll('.radial-btn:not(.hidden)');
  const count = buttons.length;
  if (!count) return;
  const w = radialMenu.offsetWidth;
  const h = radialMenu.offsetHeight;
  const cx = w / 2;
  const cy = h / 2;
  const radius = 72;
  const startAngle = -90;
  buttons.forEach((btn, i) => {
    const angle = startAngle + (360 / count) * i;
    const rad = (angle * Math.PI) / 180;
    btn.style.left = (cx + radius * Math.cos(rad)) + 'px';
    btn.style.top = (cy + radius * Math.sin(rad)) + 'px';
    btn.style.transitionDelay = (i * 0.035) + 's';
  });
}

function showMenu() {
  radialMenu.classList.remove('hidden');
  positionRadialButtons();
  requestAnimationFrame(() => {
    radialMenu.classList.add('visible');
  });
  thoughtBubble.classList.add('hidden');
}

function hideMenu(immediate) {
  radialMenu.classList.remove('visible');
  const buttons = radialMenu.querySelectorAll('.radial-btn');
  buttons.forEach(b => b.style.transitionDelay = '0s');
  if (immediate) radialMenu.classList.add('hidden');
  else setTimeout(() => { if (!radialMenu.classList.contains('visible')) radialMenu.classList.add('hidden'); }, 250);
}

document.addEventListener('click', (e) => {
  if (hasMoved) return;

  if (radialMenu.classList.contains('visible')) {
    hideMenu();
    return;
  }

  if (container.contains(e.target)) {
    wakeUp();
  }
});

container.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  if (hasMoved) return;
  if (currentState !== PET_STATES.IDLE && currentState !== PET_STATES.WALKING) return;
  showMenu();
});

radialMenu.addEventListener('click', (e) => {
  e.stopPropagation();
  const item = e.target.closest('.radial-btn');
  if (!item) return;

  const action = item.dataset.action;
  hideMenu();

  switch (action) {
    case 'think':
      thoughtBubble.classList.remove('hidden');
      thoughtText.textContent = '...';
      setState(PET_STATES.THINKING);
      spawnParticles(['?', '?', '¿'], 5, '#8ab4f8', { spread: 40, riseDistance: 130 });
      setTimeout(() => {
        thoughtBubble.classList.add('hidden');
        if (currentState === PET_STATES.THINKING) setState(PET_STATES.IDLE);
      }, 6000);
      break;
    case 'happy':
      setState(PET_STATES.HAPPY);
      spawnParticles(['★', '✦', '♥', '✧'], 12, '#FFD700', { spread: 70, riseDistance: 150, sizeRange: [16, 28] });
      setTimeout(() => setState(PET_STATES.IDLE), 1500);
      break;
    case 'sleep':
      setState(PET_STATES.SLEEP);
      sleepInterval = setInterval(() => {
        const z = ['z', 'Z', 'z'];
        spawnParticles(z, 1, '#a8c8ff', { spread: 50, riseDistance: 100, sizeRange: [14, 22], startY: 'bottom' });
      }, 400);
      break;
    case 'feed':
      spawnCookie();
      break;
    case 'settings':
      showSettings();
      break;
    case 'ask':
      showAskInput();
      break;
    case 'walk-toggle':
      toggleWander();
      break;
  }
});

// --- Floating typing letters ---
const floatContainer = document.getElementById('float-text-container');
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

document.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  if (currentState === PET_STATES.SLEEP) return;
  if (!askInputContainer.classList.contains('hidden') && askInputContainer.contains(e.target)) {
    spawnFloatLetter(e.key);
  }
});

function spawnFloatLetter(key) {
  const charMap = {
    ' ': '␣',
    'SPACE': '␣',
    'ENTER': '↵',
    'TAB': '⇥',
    'BACKSPACE': '⌫',
    'SHIFT': '⇧',
    'CONTROL': '⌃',
    'ALT': '⌥',
    'CAPS LOCK': '⇪',
    'DELETE': '⌦',
    'ESCAPE': '⎋',
  };

  const upper = key.toUpperCase();
  let display = upper;
  if (display.length === 1 && LETTERS.includes(display)) {
  } else if (charMap[display]) {
    display = charMap[display];
  } else if (display.length > 1 || display === '') {
    return;
  }

  const el = document.createElement('div');
  el.className = 'float-letter';
  el.textContent = display;

  const w = floatContainer.offsetWidth || 220;
  const margin = 30;
  const x = margin + Math.random() * Math.max(1, w - margin * 2);
  el.style.left = x + 'px';
  el.style.fontSize = (14 + Math.random() * 8) + 'px';

  floatContainer.appendChild(el);
  setTimeout(() => { if (el.parentNode) el.remove(); }, 1400);
}

// --- Particle system ---
function spawnParticles(chars, count, color, opts = {}) {
  const { spread = 40, riseDistance = 120, sizeRange = [12, 22], startY = 'center' } = opts;
  const w = floatContainer.offsetWidth || 220;
  const margin = 20;

  const yPos = startY === 'bottom' ? '15%' : startY === 'top' ? '75%' : '45%';

  for (let i = 0; i < count; i++) {
    const el = document.createElement('div');
    el.className = 'particle';
    el.textContent = chars[Math.floor(Math.random() * chars.length)];
    el.style.color = color;
    el.style.textShadow = `0 0 10px ${color}66, 0 0 30px ${color}33`;
    el.style.bottom = yPos;
    const x = margin + Math.random() * Math.max(1, w - margin * 2);
    el.style.left = x + 'px';
    const size = sizeRange[0] + Math.random() * (sizeRange[1] - sizeRange[0]);
    el.style.fontSize = size + 'px';
    el.style.setProperty('--rise', riseDistance + 'px');
    el.style.setProperty('--drift', (Math.random() - 0.5) * spread * 0.5 + 'px');
    el.style.animationDuration = (1 + Math.random() * 0.5) + 's';
    floatContainer.appendChild(el);
    setTimeout(() => { if (el.parentNode) el.remove(); }, 1800);
  }
}

function spawnCookie() {
  const el = document.createElement('div');
  el.className = 'cookie-fly';
  el.textContent = '🍪';
  floatContainer.appendChild(el);

  setTimeout(() => {
    if (el.parentNode) el.remove();

    setState(PET_STATES.HAPPY);
    startChewing();

    thoughtBubble.classList.remove('hidden');
    thoughtText.textContent = 'Yummy! 🍪';
    spawnParticles(['♥', '♥', '❤'], 6, '#ff6b8a', { spread: 50, riseDistance: 120, sizeRange: [16, 24] });

    setTimeout(() => {
      stopChewing();
      thoughtBubble.classList.add('hidden');
      setState(PET_STATES.IDLE);
    }, 10000);
  }, 600);
}

// --- Chewing animation ---
const MOUTH_CLOSED = "M 100 164 Q 110 168, 120 164";
const MOUTH_OPEN   = "M 100 165 Q 110 178, 120 165";

function startChewing() {
  let open = false;
  chewInterval = setInterval(() => {
    open = !open;
    mouthPath.setAttribute('d', open ? MOUTH_OPEN : MOUTH_CLOSED);
  }, 180);
}

function stopChewing() {
  clearInterval(chewInterval);
  chewInterval = null;
  mouthPath.setAttribute('d', "M 100 164 Q 110 172, 120 164");
}

// --- AI Chat Module ---
async function fetchWithTimeout(url, opts, ms = 30000) {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { ...opts, signal: ctrl.signal });
    return res;
  } finally {
    clearTimeout(id);
  }
}

const PROVIDERS = {
  openai: {
    name: 'OpenAI', baseURL: 'https://api.openai.com/v1',
    defaultModels: [
      { id: 'gpt-4o', name: 'GPT-4o' },
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini' },
      { id: 'gpt-4-turbo', name: 'GPT-4 Turbo' },
    ],
    listModels: async (baseURL, key) => {
      const res = await fetchWithTimeout(`${baseURL}/models`, {
        headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' }
      });
      if (!res.ok) { const err = await res.text(); throw new Error(`HTTP ${res.status}: ${err}`); }
      const data = await res.json();
      return data.data.map(m => ({ id: m.id, name: m.id }));
    },
    sendMessage: async (baseURL, key, model, text) => {
      const res = await fetchWithTimeout(`${baseURL}/chat/completions`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, messages: [{ role: 'user', content: text }], max_tokens: 1024 })
      });
      if (!res.ok) { const err = await res.text(); throw new Error(`HTTP ${res.status}: ${err}`); }
      const data = await res.json();
      return data.choices[0].message.content;
    }
  },
  groq: {
    name: 'Groq', baseURL: 'https://api.groq.com/openai/v1',
    defaultModels: [
      { id: 'mixtral-8x7b-32768', name: 'Mixtral 8x7B' },
      { id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B' },
      { id: 'llama-3.1-8b-instant', name: 'Llama 3.1 8B' },
      { id: 'gemma2-9b-it', name: 'Gemma 2 9B' },
    ],
    listModels: async (baseURL, key) => {
      const res = await fetchWithTimeout(`${baseURL}/models`, {
        headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' }
      });
      if (!res.ok) { const err = await res.text(); throw new Error(`HTTP ${res.status}: ${err}`); }
      const data = await res.json();
      return data.data.map(m => ({ id: m.id, name: m.id }));
    },
    sendMessage: async (baseURL, key, model, text) => {
      const res = await fetchWithTimeout(`${baseURL}/chat/completions`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, messages: [{ role: 'user', content: text }], max_tokens: 1024 })
      });
      if (!res.ok) { const err = await res.text(); throw new Error(`HTTP ${res.status}: ${err}`); }
      const data = await res.json();
      return data.choices[0].message.content;
    }
  },
  openrouter: {
    name: 'OpenRouter', baseURL: 'https://openrouter.ai/api/v1',
    defaultModels: [
      { id: 'openrouter/auto', name: 'Auto (best model)' },
    ],
    listModels: async (baseURL, key) => {
      const res = await fetchWithTimeout(`${baseURL}/models`, {
        headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' }
      });
      if (!res.ok) { const err = await res.text(); throw new Error(`HTTP ${res.status}: ${err}`); }
      const data = await res.json();
      return data.data.map(m => ({ id: m.id, name: m.name || m.id }));
    },
    sendMessage: async (baseURL, key, model, text) => {
      const res = await fetchWithTimeout(`${baseURL}/chat/completions`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, messages: [{ role: 'user', content: text }], max_tokens: 1024 })
      });
      if (!res.ok) { const err = await res.text(); throw new Error(`HTTP ${res.status}: ${err}`); }
      const data = await res.json();
      return data.choices[0].message.content;
    }
  },
  anthropic: {
    name: 'Anthropic', baseURL: 'https://api.anthropic.com/v1',
    defaultModels: [
      { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4' },
      { id: 'claude-haiku-3-20250313', name: 'Claude Haiku 3' },
    ],
    listModels: async (baseURL, key) => {
      try {
        const res = await fetchWithTimeout(`${baseURL}/models`, {
          headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' }
        });
        if (!res.ok) throw new Error('not supported');
        const data = await res.json();
        return data.data.map(m => ({ id: m.id, name: m.display_name || m.id }));
      } catch (e) { return null; }
    },
    sendMessage: async (baseURL, key, model, text) => {
      const res = await fetchWithTimeout(`${baseURL}/messages`, {
        method: 'POST',
        headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, max_tokens: 1024, messages: [{ role: 'user', content: text }] })
      });
      if (!res.ok) { const err = await res.text(); throw new Error(`HTTP ${res.status}: ${err}`); }
      const data = await res.json();
      return data.content[0].text;
    }
  },
  gemini: {
    name: 'Gemini', baseURL: 'https://generativelanguage.googleapis.com/v1beta',
    defaultModels: [
      { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash' },
      { id: 'gemini-2.0-flash-lite', name: 'Gemini 2.0 Flash Lite' },
      { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash' },
      { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro' },
    ],
    listModels: async (baseURL, key) => {
      const res = await fetchWithTimeout(`${baseURL}/models?key=${key}`, {
        headers: { 'Content-Type': 'application/json' }
      });
      if (!res.ok) { const err = await res.text(); throw new Error(`HTTP ${res.status}: ${err}`); }
      const data = await res.json();
      return data.models
        .filter(m => m.name.includes('gemini'))
        .map(m => ({ id: m.name.replace('models/', ''), name: m.displayName || m.name.replace('models/', '') }));
    },
    sendMessage: async (baseURL, key, model, text) => {
      const res = await fetchWithTimeout(`${baseURL}/models/${model}:generateContent?key=${key}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text }] }] })
      });
      if (!res.ok) { const err = await res.text(); throw new Error(`HTTP ${res.status}: ${err}`); }
      const data = await res.json();
      return data.candidates[0].content.parts[0].text;
    }
  },
  deepseek: {
    name: 'DeepSeek', baseURL: 'https://api.deepseek.com/v1',
    defaultModels: [
      { id: 'deepseek-chat', name: 'DeepSeek Chat' },
      { id: 'deepseek-reasoner', name: 'DeepSeek Reasoner' },
    ],
    listModels: async (baseURL, key) => {
      const res = await fetchWithTimeout(`${baseURL}/models`, {
        headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' }
      });
      if (!res.ok) { const err = await res.text(); throw new Error(`HTTP ${res.status}: ${err}`); }
      const data = await res.json();
      return data.data.map(m => ({ id: m.id, name: m.id }));
    },
    sendMessage: async (baseURL, key, model, text) => {
      const res = await fetchWithTimeout(`${baseURL}/chat/completions`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, messages: [{ role: 'user', content: text }], max_tokens: 4096 })
      });
      if (!res.ok) { const err = await res.text(); throw new Error(`HTTP ${res.status}: ${err}`); }
      const data = await res.json();
      return data.choices[0].message.content;
    }
  },
  mistral: {
    name: 'Mistral', baseURL: 'https://api.mistral.ai/v1',
    defaultModels: [
      { id: 'mistral-large-latest', name: 'Mistral Large' },
      { id: 'mistral-small-latest', name: 'Mistral Small' },
      { id: 'open-mistral-nemo', name: 'Mistral Nemo' },
    ],
    listModels: async (baseURL, key) => {
      const res = await fetchWithTimeout(`${baseURL}/models`, {
        headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' }
      });
      if (!res.ok) { const err = await res.text(); throw new Error(`HTTP ${res.status}: ${err}`); }
      const data = await res.json();
      return data.data.map(m => ({ id: m.id, name: m.id }));
    },
    sendMessage: async (baseURL, key, model, text) => {
      const res = await fetchWithTimeout(`${baseURL}/chat/completions`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, messages: [{ role: 'user', content: text }], max_tokens: 4096 })
      });
      if (!res.ok) { const err = await res.text(); throw new Error(`HTTP ${res.status}: ${err}`); }
      const data = await res.json();
      return data.choices[0].message.content;
    }
  },
  together: {
    name: 'Together AI', baseURL: 'https://api.together.xyz/v1',
    defaultModels: [
      { id: 'mistralai/Mixtral-8x7B-Instruct-v0.1', name: 'Mixtral 8x7B' },
      { id: 'meta-llama/Llama-3.3-70B-Instruct-Turbo', name: 'Llama 3.3 70B' },
      { id: 'deepseek-ai/DeepSeek-V3', name: 'DeepSeek V3' },
    ],
    listModels: async (baseURL, key) => {
      const res = await fetchWithTimeout(`${baseURL}/models`, {
        headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' }
      });
      if (!res.ok) { const err = await res.text(); throw new Error(`HTTP ${res.status}: ${err}`); }
      const data = await res.json();
      return data.map(m => ({ id: m.id, name: m.name || m.id }));
    },
    sendMessage: async (baseURL, key, model, text) => {
      const res = await fetchWithTimeout(`${baseURL}/chat/completions`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, messages: [{ role: 'user', content: text }], max_tokens: 4096 })
      });
      if (!res.ok) { const err = await res.text(); throw new Error(`HTTP ${res.status}: ${err}`); }
      const data = await res.json();
      return data.choices[0].message.content;
    }
  },
  perplexity: {
    name: 'Perplexity', baseURL: 'https://api.perplexity.ai',
    defaultModels: [
      { id: 'sonar-pro', name: 'Sonar Pro' },
      { id: 'sonar', name: 'Sonar' },
    ],
    listModels: async (baseURL, key) => {
      const res = await fetchWithTimeout(`${baseURL}/models`, {
        headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' }
      });
      if (!res.ok) { const err = await res.text(); throw new Error(`HTTP ${res.status}: ${err}`); }
      const data = await res.json();
      return data.data.map(m => ({ id: m.id, name: m.id }));
    },
    sendMessage: async (baseURL, key, model, text) => {
      const res = await fetchWithTimeout(`${baseURL}/chat/completions`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, messages: [{ role: 'user', content: text }], max_tokens: 4096 })
      });
      if (!res.ok) { const err = await res.text(); throw new Error(`HTTP ${res.status}: ${err}`); }
      const data = await res.json();
      return data.choices[0].message.content;
    }
  },
  xai: {
    name: 'xAI (Grok)', baseURL: 'https://api.x.ai/v1',
    defaultModels: [
      { id: 'grok-2-latest', name: 'Grok 2' },
      { id: 'grok-beta', name: 'Grok Beta' },
    ],
    listModels: async (baseURL, key) => {
      const res = await fetchWithTimeout(`${baseURL}/models`, {
        headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' }
      });
      if (!res.ok) { const err = await res.text(); throw new Error(`HTTP ${res.status}: ${err}`); }
      const data = await res.json();
      return data.data.map(m => ({ id: m.id, name: m.id }));
    },
    sendMessage: async (baseURL, key, model, text) => {
      const res = await fetchWithTimeout(`${baseURL}/chat/completions`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, messages: [{ role: 'user', content: text }], max_tokens: 4096 })
      });
      if (!res.ok) { const err = await res.text(); throw new Error(`HTTP ${res.status}: ${err}`); }
      const data = await res.json();
      return data.choices[0].message.content;
    }
  },
  github: {
    name: 'GitHub Models', baseURL: 'https://models.inference.ai.azure.com',
    defaultModels: [
      { id: 'gpt-4o', name: 'GPT-4o' },
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini' },
      { id: 'gpt-4-turbo', name: 'GPT-4 Turbo' },
      { id: 'gpt-4', name: 'GPT-4' },
    ],
    listModels: async (baseURL, key) => {
      const res = await fetchWithTimeout(`${baseURL}/models`, {
        headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' }
      });
      if (!res.ok) { const err = await res.text(); throw new Error(`HTTP ${res.status}: ${err}`); }
      const data = await res.json();
      return data.data.map(m => ({ id: m.id, name: m.id }));
    },
    sendMessage: async (baseURL, key, model, text) => {
      const res = await fetchWithTimeout(`${baseURL}/chat/completions`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, messages: [{ role: 'user', content: text }], max_tokens: 4096 })
      });
      if (!res.ok) { const err = await res.text(); throw new Error(`HTTP ${res.status}: ${err}`); }
      const data = await res.json();
      return data.choices[0].message.content;
    }
  },
  custom: {
    name: 'Custom', baseURL: '',
    defaultModels: [
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini (fallback)' },
    ],
    listModels: async (baseURL, key) => {
      if (!baseURL) throw new Error('No base URL');
      const res = await fetchWithTimeout(`${baseURL}/models`, {
        headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' }
      });
      if (!res.ok) { const err = await res.text(); throw new Error(`HTTP ${res.status}: ${err}`); }
      const data = await res.json();
      return (data.data || data.models || []).map(m => ({ id: m.id || m.name, name: m.id || m.name }));
    },
    sendMessage: async (baseURL, key, model, text) => {
      const res = await fetchWithTimeout(`${baseURL}/chat/completions`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, messages: [{ role: 'user', content: text }], max_tokens: 4096 })
      });
      if (!res.ok) { const err = await res.text(); throw new Error(`HTTP ${res.status}: ${err}`); }
      const data = await res.json();
      return data.choices[0].message.content;
    }
  }
};

let currentProvider = 'openai';
let savedKey = '';
let verifiedModel = '';

const settingsPanel = document.getElementById('settings-panel');
const providerSelect = document.getElementById('provider-select');
const apiKeyInput = document.getElementById('api-key-input');
const verifyBtn = document.getElementById('verify-key-btn');
const keyStatus = document.getElementById('key-status');
const modelRow = document.getElementById('model-row');
const modelSelect = document.getElementById('model-select');
const settingsCloseBtn = document.getElementById('settings-close-btn');
const askInputContainer = document.getElementById('ask-input-container');
const askInput = document.getElementById('ask-input');
const askSendBtn = document.getElementById('ask-send-btn');
const messageWindow = document.getElementById('message-window');
const messageContent = document.getElementById('message-content');
const askMenuItem = document.querySelector('.ask-item');
const customUrlRow = document.getElementById('custom-url-row');
const customUrlInput = document.getElementById('custom-url-input');
const modelInput = document.getElementById('model-input');

try {
  const saved = localStorage.getItem('pet_ai_settings');
  if (saved) {
    const s = JSON.parse(saved);
    if (s.provider) { currentProvider = s.provider; providerSelect.value = currentProvider; }
    if (s.key) { savedKey = s.key; apiKeyInput.value = s.key; }
    if (s.model) { verifiedModel = s.model; }
    if (s.customUrl) { customUrlInput.value = s.customUrl; }
  }
  if (currentProvider === 'custom') customUrlRow.style.display = 'flex';
  if (verifiedModel && savedKey) askMenuItem.classList.remove('hidden');
} catch (e) {}

function saveSettings() {
  try {
    localStorage.setItem('pet_ai_settings', JSON.stringify({
      provider: currentProvider, key: savedKey, model: verifiedModel, customUrl: customUrlInput.value.trim(),
    }));
  } catch (e) {}
}

function showSettings() {
  settingsPanel.classList.remove('hidden');
  if (verifiedModel) { modelRow.style.display = 'flex'; askMenuItem.classList.remove('hidden'); }
}

function hideSettings() {
  settingsPanel.classList.add('hidden');
}

providerSelect.addEventListener('change', () => {
  currentProvider = providerSelect.value;
  customUrlRow.style.display = currentProvider === 'custom' ? 'flex' : 'none';
  modelRow.style.display = 'none';
  modelInput.style.display = 'none';
  keyStatus.textContent = '';
  verifiedModel = '';
  saveSettings();
});

verifyBtn.addEventListener('click', async () => {
  const key = apiKeyInput.value.trim();
  if (!key) { keyStatus.textContent = 'Enter an API key'; keyStatus.style.color = '#ff6b6b'; return; }

  let baseURL = PROVIDERS[currentProvider].baseURL;
  if (currentProvider === 'custom') {
    baseURL = customUrlInput.value.trim();
    if (!baseURL) { keyStatus.textContent = 'Enter a Base URL'; keyStatus.style.color = '#ff6b6b'; return; }
  }

  verifyBtn.disabled = true;
  keyStatus.textContent = 'Verifying...';
  keyStatus.style.color = '#aaa';
  savedKey = key;
  modelSelect.innerHTML = '';
  modelInput.style.display = 'none';

  let models = null;
  try {
    const prov = currentProvider === 'custom'
      ? { listModels: PROVIDERS.custom.listModels }
      : PROVIDERS[currentProvider];
    models = await prov.listModels(baseURL, key);
    modelInput.style.display = 'none';
  } catch (e) {
    console.warn('List models failed:', e.message);
    if (currentProvider === 'custom') {
      modelInput.style.display = 'block';
      modelInput.value = verifiedModel || '';
    }
  }
  const list = (models && models.length > 0) ? models : PROVIDERS[currentProvider].defaultModels;
  list.forEach(m => {
    const opt = document.createElement('option');
    opt.value = m.id;
    opt.textContent = m.name || m.id;
    modelSelect.appendChild(opt);
  });
  modelRow.style.display = 'flex';
  if (verifiedModel && list.some(m => m.id === verifiedModel)) modelSelect.value = verifiedModel;
  keyStatus.textContent = models ? '\u2713 Verified! Select model and close.' : (currentProvider === 'custom' ? '\u26a0 Model list unavailable. Enter model name below.' : '\u26a0 Using default models. Select and close.');
  keyStatus.style.color = models ? '#4caf50' : '#ffa500';
  askMenuItem.classList.remove('hidden');
  saveSettings();
  verifyBtn.disabled = false;
});

apiKeyInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') verifyBtn.click(); });

settingsCloseBtn.addEventListener('click', () => {
  if (modelRow.style.display !== 'none') {
    verifiedModel = modelInput.style.display !== 'none' ? modelInput.value.trim() : modelSelect.value;
    saveSettings();
  }
  hideSettings();
});

function showAskInput() {
  askInputContainer.classList.remove('hidden');
  setTimeout(() => askInput.focus(), 50);
}

function hideAskInput() {
  askInputContainer.classList.add('hidden');
  askInput.value = '';
}

askSendBtn.addEventListener('click', () => {
  const text = askInput.value.trim();
  if (text) sendChatMessage(text);
});

askInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { const text = askInput.value.trim(); if (text) sendChatMessage(text); }
});

askInputContainer.addEventListener('mousedown', (e) => e.stopPropagation());

function showMessage(msg) {
  messageContent.textContent = msg;
  messageWindow.classList.add('show');
}

function hideMessage() {
  messageWindow.classList.remove('show');
}

messageWindow.addEventListener('mousedown', (e) => e.stopPropagation());
messageWindow.addEventListener('click', (e) => {
  e.stopPropagation();
  hideMessage();
});

async function sendChatMessage(text) {
  let baseURL = PROVIDERS[currentProvider].baseURL;
  if (currentProvider === 'custom') baseURL = customUrlInput.value.trim() || baseURL;

  const model = modelInput.style.display !== 'none' ? modelInput.value.trim() : (modelSelect.value || verifiedModel);
  if (!model) { showMessage('No model selected. Open Settings.'); return; }
  if (!savedKey) { showMessage('No API key configured. Open Settings.'); return; }
  if (!baseURL) { showMessage('No Base URL configured. Open Settings.'); return; }

  hideAskInput();
  showMessage('Thinking...');

  try {
    const response = await PROVIDERS[currentProvider].sendMessage(baseURL, savedKey, model, text);
    showMessage(response || '(empty response)');
  } catch (e) {
    showMessage('Error: ' + (e.message || 'Failed'));
  }
}

// --- Wander Mode (Auto Walk) ---
let wanderEnabled = false;
let wanderActive = false;
let wanderTarget = null;
let wanderSpeed = 2;
let wanderRaf = null;
let aiThinking = false;
let walkingPhase = 0;
let screenInfo = { width: 1920, height: 1080 };
let wanderPaused = false;
let wanderPos = null; // local position tracking
let posSyncCounter = 0;
let pickingTarget = false;
let restFrames = 0;

function getScreenInfo() {
  ipcRenderer.invoke('get-screen-info').then(info => {
    if (info) screenInfo = info;
  });
}

async function getCurrentPos() {
  try {
    return await ipcRenderer.invoke('get-window-position');
  } catch (e) {
    return null;
  }
}

function resetLegs() {
  ['leg-fl', 'leg-bl', 'leg-fr', 'leg-br'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.setAttribute('transform', '');
  });
}

function updateWalkLabel() {
  if (walkBtn) walkBtn.classList.toggle('active', wanderEnabled);
}

async function toggleWander() {
  wanderEnabled = !wanderEnabled;
  localStorage.setItem('pet_wander', wanderEnabled ? '1' : '0');
  updateWalkLabel();
  if (wanderEnabled) {
    if (currentState === PET_STATES.SLEEP) setState(PET_STATES.IDLE);
    await startWander();
  } else {
    stopWander();
  }
}

async function startWander() {
  wanderActive = true;
  wanderPaused = false;
  restFrames = 0;
  pickingTarget = false;
  getScreenInfo();
  const pos = await getCurrentPos();
  if (pos) wanderPos = { x: pos.x, y: pos.y };
  await pickNextTarget();
  if (wanderRaf) cancelAnimationFrame(wanderRaf);
  wanderLoop();
}

function stopWander() {
  wanderActive = false;
  wanderPaused = false;
  wanderTarget = null;
  wanderPos = null;
  aiThinking = false;
  pickingTarget = false;
  restFrames = 0;
  if (wanderRaf) cancelAnimationFrame(wanderRaf);
  wanderRaf = null;
  walkingPhase = 0;
  resetLegs();
  if (currentState === PET_STATES.WALKING) setState(PET_STATES.IDLE);
}

function pauseWander() {
  wanderPaused = true;
  resetLegs();
}

function resumeWander() {
  if (!wanderEnabled || !wanderActive) return;
  wanderPaused = false;
  if (!wanderRaf) wanderLoop();
}

function updateWalkAnimation(phase) {
  const s = Math.sin(phase);
  const lift1 = Math.max(0, s) * 5;
  const lift2 = Math.max(0, -s) * 5;

  const legFL = document.getElementById('leg-fl');
  const legBL = document.getElementById('leg-bl');
  const legFR = document.getElementById('leg-fr');
  const legBR = document.getElementById('leg-br');

  if (legFL) legFL.setAttribute('transform', `translate(0, ${-lift1})`);
  if (legBR) legBR.setAttribute('transform', `translate(0, ${-lift1})`);
  if (legBL) legBL.setAttribute('transform', `translate(0, ${-lift2})`);
  if (legFR) legFR.setAttribute('transform', `translate(0, ${-lift2})`);
}

function wanderLoop() {
  if (!wanderActive || wanderPaused || aiThinking) {
    if (currentState === PET_STATES.WALKING) setState(PET_STATES.IDLE);
    wanderRaf = requestAnimationFrame(wanderLoop);
    return;
  }

  if (currentState === PET_STATES.SLEEP) {
    wanderRaf = requestAnimationFrame(wanderLoop);
    return;
  }

  if (restFrames > 0) {
    if (currentState === PET_STATES.WALKING) setState(PET_STATES.IDLE);
    restFrames--;
    wanderRaf = requestAnimationFrame(wanderLoop);
    return;
  }

  if (!wanderTarget && !pickingTarget) {
    pickingTarget = true;
    pickNextTarget().then(() => { pickingTarget = false; }).catch(() => { pickingTarget = false; });
    wanderRaf = requestAnimationFrame(wanderLoop);
    return;
  }
  if (pickingTarget) {
    if (currentState === PET_STATES.WALKING) setState(PET_STATES.IDLE);
    wanderRaf = requestAnimationFrame(wanderLoop);
    return;
  }

  if (!settingsPanel.classList.contains('hidden') || !askInputContainer.classList.contains('hidden')) {
    wanderPaused = true;
    resetLegs();
    wanderRaf = requestAnimationFrame(wanderLoop);
    return;
  }

  if (!wanderPos) {
    getCurrentPos().then(pos => {
      if (pos) wanderPos = { x: pos.x, y: pos.y };
      wanderRaf = requestAnimationFrame(wanderLoop);
    });
    return;
  }

  const dx = wanderTarget.x - wanderPos.x;
  const dy = wanderTarget.y - wanderPos.y;
  const dist = Math.sqrt(dx * dx + dy * dy);

  if (dist < 8) {
    wanderTarget = null;
    restFrames = 3; // minimal gap between targets
    wanderRaf = requestAnimationFrame(wanderLoop);
    return;
  }

  const step = Math.min(wanderSpeed, dist);
  let stepX = (dx / dist) * step;
  let stepY = (dy / dist) * step;

  const absX = Math.abs(stepX), absY = Math.abs(stepY);
  if (dist >= 1) {
    if (absX < 0.5 && absY < 0.5) {
      if (absX >= absY) stepX = Math.sign(dx);
      else stepY = Math.sign(dy);
    } else {
      stepX = Math.round(stepX);
      stepY = Math.round(stepY);
      if (stepX === 0 && stepY === 0) {
        if (absX >= absY) stepX = Math.sign(dx);
        else stepY = Math.sign(dy);
      }
    }
  }

  const newX = wanderPos.x + stepX;
  const newY = wanderPos.y + stepY;
  ipcRenderer.invoke('set-window-pos', { x: Math.round(newX), y: Math.round(newY) }).catch(() => {});
  wanderPos.x = newX;
  wanderPos.y = newY;

  walkingPhase += 0.12;
  updateWalkAnimation(walkingPhase);
  if (currentState === PET_STATES.IDLE || currentState === PET_STATES.WALKING) {
    setState(PET_STATES.WALKING);
  }

  wanderRaf = requestAnimationFrame(wanderLoop);
}

function randomTarget() {
  const margin = 150;
  const x = margin + Math.random() * (screenInfo.width - margin * 2);
  const y = margin + Math.random() * (screenInfo.height - margin * 2 - 50);
  wanderTarget = { x: Math.round(x), y: Math.round(y) };
}

async function pickNextTarget() {
  if (!savedKey || !verifiedModel) {
    randomTarget();
    return;
  }

  aiThinking = true;
  if (!wanderPos) {
    const pos = await getCurrentPos();
    if (!pos) { aiThinking = false; randomTarget(); return; }
    wanderPos = { x: pos.x, y: pos.y };
  }

  thoughtBubble.classList.remove('hidden');
  thoughtText.textContent = 'Where to go...';

  try {
    let baseURL = PROVIDERS[currentProvider].baseURL;
    if (currentProvider === 'custom') baseURL = customUrlInput.value.trim() || baseURL;

    const prompt = `You are a cute desktop pet on a ${screenInfo.width}x${screenInfo.height} screen at position (${Math.round(wanderPos.x)}, ${Math.round(wanderPos.y)}). Choose a fun destination to walk to. Reply ONLY with two numbers: x y. Stay at least 120px from edges (X: 120-${screenInfo.width - 120}, Y: 120-${screenInfo.height - 120}). Be random and playful!`;

    const response = await PROVIDERS[currentProvider].sendMessage(baseURL, savedKey, verifiedModel, prompt);

    const nums = response.match(/-?\d+/g);
    if (nums && nums.length >= 2) {
      let tx = parseInt(nums[0]);
      let ty = parseInt(nums[1]);
      tx = Math.max(100, Math.min(screenInfo.width - 100, tx));
      ty = Math.max(100, Math.min(screenInfo.height - 75, ty));
      wanderTarget = { x: tx, y: ty };
    } else {
      randomTarget();
    }
  } catch (e) {
    randomTarget();
  }

  thoughtBubble.classList.add('hidden');
  aiThinking = false;
  if (wanderActive && !wanderPaused && currentState === PET_STATES.IDLE) {
    setState(PET_STATES.WALKING);
  }
}

// --- Init ---
container.addEventListener('mouseenter', () => {
  if (currentState === PET_STATES.SLEEP) return;
  resetIdleTimer();
  wakeUp();
});

setState(PET_STATES.IDLE);

try {
  const wanderSaved = localStorage.getItem('pet_wander');
  if (wanderSaved === '1') {
    wanderEnabled = true;
    updateWalkLabel();
    setTimeout(() => { if (wanderEnabled) startWander(); }, 500);
  }
} catch (e) {}
updateWalkLabel();
