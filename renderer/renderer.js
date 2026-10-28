const api = window.pomodoro;
let current = null;

const MODE_LABEL = { work: '专注', shortBreak: '短休息', longBreak: '长休息' };
const MODE_ACCENT = { work: '#e85a50', shortBreak: '#587c90', longBreak: '#8f9da4' };
const MODE_ACCENT_RGB = { work: '232, 90, 80', shortBreak: '88, 124, 144', longBreak: '143, 157, 164' };

const $ = (id) => document.getElementById(id);
const els = {
  mode: $('modeLabel'), time: $('time'), ring: $('ringFg'), dots: $('dots'),
  start: $('startBtn'), reset: $('resetBtn'), skip: $('skipBtn'),
  today: $('todayCount'), pin: $('pinBtn'), settingsBtn: $('settingsBtn'), close: $('closeBtn'),
  settings: $('settingsPanel'), settingsClose: $('settingsClose'),
  work: $('workInput'), short: $('shortInput'), long: $('longInput'),
  interval: $('intervalInput'), autoNext: $('autoNext'), save: $('saveSettings'),
};

const CIRC = 2 * Math.PI * 88; // 与 SVG r=88 对应

function fmt(s) { return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; }

function render(s) {
  current = s;
  document.documentElement.style.setProperty('--accent', MODE_ACCENT[s.mode]);
  document.documentElement.style.setProperty('--accent-rgb', MODE_ACCENT_RGB[s.mode]);
  els.mode.textContent = MODE_LABEL[s.mode];
  els.time.textContent = fmt(s.remaining);
  els.ring.style.strokeDashoffset = CIRC * (1 - (s.total ? s.remaining / s.total : 0));
  els.start.textContent = s.status === 'running' ? '暂停' : (s.status === 'paused' ? '继续' : '开始');
  els.pin.textContent = s.isPinned ? '📍' : '📌';
  els.today.textContent = `今日 🍅 × ${s.completed}`;
  renderDots(s);
}

function renderDots(s) {
  const n = s.longBreakEvery;
  els.dots.innerHTML = '';
  for (let i = 0; i < n; i++) {
    const d = document.createElement('span');
    d.className = 'dot' + (i < s.cycle ? ' filled' : '');
    els.dots.appendChild(d);
  }
}

// —— 控制 ——
els.start.addEventListener('click', () => {
  if (current && current.status === 'running') api.pause(); else api.start();
});
els.reset.addEventListener('click', () => api.reset());
els.skip.addEventListener('click', () => api.skip());
els.close.addEventListener('click', () => api.closeWindow());
els.pin.addEventListener('click', () => api.togglePin());

// —— 设置 ——
els.settingsBtn.addEventListener('click', openSettings);
els.settingsClose.addEventListener('click', closeSettings);
els.settings.addEventListener('click', (e) => { if (e.target === els.settings) closeSettings(); });
els.save.addEventListener('click', saveSettings);

async function openSettings() {
  const cfg = await api.getConfig();
  els.work.value = cfg.work;
  els.short.value = cfg.shortBreak;
  els.long.value = cfg.longBreak;
  els.interval.value = cfg.longBreakEvery;
  els.autoNext.checked = cfg.autoStartNext;
  els.settings.classList.add('open');
}
function closeSettings() { els.settings.classList.remove('open'); }

function clampInt(v, min, max, def) {
  const n = parseInt(v, 10);
  if (Number.isNaN(n)) return def;
  return Math.min(max, Math.max(min, n));
}
async function saveSettings() {
  await api.setConfig({
    work: clampInt(els.work.value, 1, 120, 25),
    shortBreak: clampInt(els.short.value, 1, 60, 5),
    longBreak: clampInt(els.long.value, 1, 120, 15),
    longBreakEvery: clampInt(els.interval.value, 1, 12, 4),
    autoStartNext: els.autoNext.checked,
  });
  closeSettings();
}

// —— 提示音 ——
let audioCtx;
function playChime() {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const now = audioCtx.currentTime;
    [880, 1108, 1318].forEach((freq, i) => {
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.type = 'sine'; o.frequency.value = freq;
      const t = now + i * 0.14;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.2, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
      o.connect(g); g.connect(audioCtx.destination);
      o.start(t); o.stop(t + 0.55);
    });
  } catch (e) { /* 忽略音频失败 */ }
}

// —— 初始化 ——
(async function init() {
  render(await api.getState());
})();
api.onUpdate(render);
api.onPhaseComplete(playChime);
