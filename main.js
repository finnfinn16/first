const { app, BrowserWindow, Tray, Menu, ipcMain, Notification, nativeImage, screen } = require('electron');
const path = require('path');
const fs = require('fs');

let win = null;
let tray = null;
let trayMenu = null;
let isPinned = false;
let isQuitting = false;

const MODE_LABEL = { work: '专注', shortBreak: '短休息', longBreak: '长休息' };
const DEFAULT_CONFIG = { work: 25, shortBreak: 5, longBreak: 15, longBreakEvery: 4, autoStartNext: true };

// —— 持久化 ——
const userData = () => app.getPath('userData');
const configFile = () => path.join(userData(), 'config.json');
const statsFile = () => path.join(userData(), 'stats.json');

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function readJSON(p, fb) { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return fb; } }
function writeJSON(p, o) { try { fs.writeFileSync(p, JSON.stringify(o, null, 2)); } catch (e) { console.error(e); } }

let config = { ...DEFAULT_CONFIG, ...readJSON(configFile(), {}) };
let stats = readJSON(statsFile(), { date: today(), count: 0 });
if (stats.date !== today()) stats = { date: today(), count: 0 };

// —— 计时器状态 ——
let mode = 'work';        // work | shortBreak | longBreak
let status = 'idle';      // idle | running | paused
let total = config.work * 60;
let remaining = total;
let completed = stats.count; // 今日完成的番茄数
let timer = null;
let endTime = 0;

function durationOf(m) {
  return ({ work: config.work, shortBreak: config.shortBreak, longBreak: config.longBreak }[m]) * 60;
}
function stopTimer() { if (timer) { clearInterval(timer); timer = null; } }

function getState() {
  return {
    mode, status, remaining, total, completed,
    cycle: completed % config.longBreakEvery,
    longBreakEvery: config.longBreakEvery,
    isPinned,
  };
}
function fmt(s) { return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; }

function broadcast() {
  if (win && !win.isDestroyed()) win.webContents.send('state:update', getState());
  updateTray();
}

// —— 控制 ——
function startTimer() {
  if (status === 'running') return;
  endTime = Date.now() + remaining * 1000;
  status = 'running';
  timer = setInterval(tick, 1000);
  tick();
}
function pauseTimer() {
  if (status !== 'running') return;
  remaining = Math.max(0, Math.ceil((endTime - Date.now()) / 1000));
  status = 'paused';
  stopTimer();
  broadcast();
}
function resetTimer() {
  remaining = total;
  status = 'idle';
  stopTimer();
  broadcast();
}
function setMode(m) {
  mode = m;
  total = durationOf(m);
  remaining = total;
  status = 'idle';
  stopTimer();
}
function nextModeAfter(finished) {
  if (finished === 'work') return completed % config.longBreakEvery === 0 ? 'longBreak' : 'shortBreak';
  return 'work';
}
function skipTimer() {
  setMode(mode === 'work' ? 'shortBreak' : 'work');
  if (config.autoStartNext) startTimer();
  broadcast();
}

function tick() {
  remaining = Math.max(0, Math.ceil((endTime - Date.now()) / 1000));
  if (remaining <= 0) { completePhase(); return; }
  broadcast();
}
function completePhase() {
  stopTimer();
  const finished = mode;
  if (finished === 'work') {
    completed += 1;
    stats = { date: today(), count: completed };
    writeJSON(statsFile(), stats);
  }
  const next = nextModeAfter(finished);
  notify(finished, next);
  setMode(next);
  if (config.autoStartNext) startTimer();
  broadcast();
  if (win && !win.isDestroyed()) win.webContents.send('phase:complete', { finished, next });
}

function notify(finished, next) {
  if (!Notification.isSupported()) return;
  const title = finished === 'work' ? '🍅 专注完成！' : '⏰ 休息结束';
  const body = finished === 'work' ? `干得漂亮！休息一下吧，接下来是${MODE_LABEL[next]}。` : '休息好了，回到专注吧！';
  new Notification({ title, body }).show();
}

// —— 窗口 ——
function createWindow() {
  const { workArea } = screen.getPrimaryDisplay();
  win = new BrowserWindow({
    width: 320, height: 440,
    x: workArea.x + workArea.width - 320 - 16,
    y: workArea.y + 24,
    frame: false, transparent: true, resizable: false, hasShadow: true,
    alwaysOnTop: false, show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.once('ready-to-show', () => win.show());
  win.on('close', (e) => { if (!isQuitting) { e.preventDefault(); win.hide(); } });
}
function showWindow() { if (win) { win.show(); win.focus(); } }

function togglePin() {
  isPinned = !isPinned;
  if (win) win.setAlwaysOnTop(isPinned, 'floating');
  broadcast();
}

// —— 菜单栏 ——
function createTray() {
  const icon = nativeImage.createFromPath(path.join(__dirname, 'assets', 'tray.png'));
  tray = new Tray(icon);
  tray.on('click', () => { if (win && win.isVisible()) win.hide(); else showWindow(); });
  tray.on('right-click', () => { if (trayMenu) tray.popUpContextMenu(trayMenu); });
}
function updateTray() {
  if (!tray) return;
  tray.setTitle(status === 'idle' ? '' : fmt(remaining));
  tray.setToolTip(`番茄钟 · ${MODE_LABEL[mode]} · ${fmt(remaining)}`);
  trayMenu = Menu.buildFromTemplate([
    { label: `${MODE_LABEL[mode]} · ${fmt(remaining)}`, enabled: false },
    { type: 'separator' },
    status === 'running' ? { label: '暂停', click: pauseTimer } : { label: '开始', click: startTimer },
    { label: '重置', click: resetTimer },
    { label: '跳过', click: skipTimer },
    { type: 'separator' },
    { label: isPinned ? '取消置顶' : '置顶', click: togglePin },
    { label: '退出', click: () => { isQuitting = true; app.quit(); } },
  ]);
}

// —— IPC ——
function registerIpc() {
  ipcMain.handle('get-state', () => getState());
  ipcMain.handle('get-config', () => config);
  ipcMain.handle('config:set', (_e, cfg) => {
    config = { ...DEFAULT_CONFIG, ...cfg };
    writeJSON(configFile(), config);
    if (status === 'idle') { total = durationOf(mode); remaining = total; }
    broadcast();
    return config;
  });
  ipcMain.on('control:start', startTimer);
  ipcMain.on('control:pause', pauseTimer);
  ipcMain.on('control:reset', resetTimer);
  ipcMain.on('control:skip', skipTimer);
  ipcMain.on('window:close', () => { if (win) win.hide(); });
  ipcMain.on('window:toggle-pin', togglePin);
}

app.whenReady().then(() => {
  registerIpc();
  createWindow();
  createTray();
  broadcast();
});
app.on('window-all-closed', () => { /* 常驻菜单栏，不退出 */ });
app.on('activate', showWindow);
