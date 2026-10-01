const vscode = require('vscode');
const fs = require('fs');
const path = require('path');

const STATE_KEY = 'catStopper.pomodoro';
const EXT_ID = 'local.cat-stopper';

let context;
let statusBar;
let panel;
let settingsSince = 0;
let tooltipKey = '';
let state = { phase: 'work', endsAt: 0, pausedLeft: 0, warned: false, count: 0, long: false };

function config() {
  const c = vscode.workspace.getConfiguration('catStopper');
  return {
    work: c.get('workMinutes', 25),
    shortBreak: c.get('breakMinutes', 5),
    longBreak: c.get('longBreakMinutes', 15),
    every: Math.max(1, c.get('sessionsBeforeLongBreak', 4)),
    warn: c.get('warnSecondsBefore', 60),
  };
}

function load() {
  const saved = context.globalState.get(STATE_KEY);
  if (saved) state = { ...state, ...saved };
  if (!state.pausedLeft && state.endsAt <= Date.now()) startWork(true);
}

function save() {
  context.globalState.update(STATE_KEY, state);
}

function paused() {
  return state.pausedLeft > 0;
}

function leftSeconds() {
  return paused() ? state.pausedLeft / 1000 : (state.endsAt - Date.now()) / 1000;
}

function clock(totalSeconds) {
  const s = Math.max(0, Math.ceil(totalSeconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function startWork(silent, keepCount = true) {
  state = {
    phase: 'work',
    endsAt: Date.now() + config().work * 60000,
    pausedLeft: 0,
    warned: false,
    count: keepCount ? state.count : 0,
    long: false,
  };
  save();
  if (panel) panel.dispose();
  if (!silent) vscode.window.showInformationMessage('Focus time. Work session started.');
}

function startBreak() {
  const cfg = config();
  const count = state.phase === 'work' ? state.count + 1 : state.count;
  const long = count >= cfg.every;
  state = {
    phase: 'break',
    endsAt: Date.now() + (long ? cfg.longBreak : cfg.shortBreak) * 60000,
    pausedLeft: 0,
    warned: false,
    count: long ? 0 : count,
    long,
  };
  save();
  vscode.commands.executeCommand('workbench.action.closeSidebar');
  vscode.commands.executeCommand('workbench.action.closePanel');
  showCat();
}

function togglePause() {
  if (state.phase === 'break') return;
  if (paused()) {
    state.endsAt = Date.now() + state.pausedLeft;
    state.pausedLeft = 0;
  } else {
    state.pausedLeft = Math.max(1, state.endsAt - Date.now());
  }
  save();
}

async function openSettings() {
  settingsSince = Date.now();
  await vscode.commands.executeCommand('workbench.action.openSettings', `@ext:${EXT_ID}`);
}

function settingsOpen() {
  if (!settingsSince) return false;
  const age = Date.now() - settingsSince;
  if (age < 3000) return true;
  const tab = vscode.window.tabGroups.activeTabGroup.activeTab;
  const onSettings = !!tab
    && !(tab.input instanceof vscode.TabInputText)
    && !(tab.input instanceof vscode.TabInputWebview)
    && /settings/i.test(tab.label);
  if (!onSettings || age > 10 * 60 * 1000) {
    settingsSince = 0;
    return false;
  }
  return true;
}

function setTooltip(key, lines) {
  if (key === tooltipKey) return;
  tooltipKey = key;
  const md = new vscode.MarkdownString(lines.join('\n\n'));
  md.isTrusted = { enabledCommands: ['catStopper.openSettings', 'catStopper.togglePause', 'catStopper.skipBreak', 'catStopper.startBreak', 'catStopper.reset'] };
  statusBar.tooltip = md;
}

function tick() {
  const cfg = config();
  const left = leftSeconds();
  const isBreak = state.phase === 'break';
  const round = `Pomodoro ${Math.min(state.count + (isBreak ? 0 : 1), cfg.every)} of ${cfg.every}`;
  const settingsLink = '[$(gear) Timer settings](command:catStopper.openSettings)';

  if (paused()) {
    statusBar.text = `$(debug-pause) ${clock(left)}`;
    statusBar.backgroundColor = undefined;
    setTooltip('paused', [
      `**Cat Stopper** · paused · ${round}`,
      '[$(play) Resume](command:catStopper.togglePause) · [$(debug-restart) Restart](command:catStopper.reset)',
      settingsLink,
    ]);
    return;
  }

  if (left <= 0) {
    if (isBreak) {
      startWork();
      vscode.window.showInformationMessage('Break is over. Back to work!');
    } else {
      startBreak();
    }
    return tick();
  }

  if (isBreak) {
    statusBar.text = `$(coffee) ${state.long ? 'Long break' : 'Break'} ${clock(left)}`;
    statusBar.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
    setTooltip('break' + state.long, [
      `**Cat Stopper** · ${state.long ? 'long break' : 'break'}`,
      '[$(debug-step-over) Skip break](command:catStopper.skipBreak)',
      settingsLink,
    ]);
    if (vscode.window.state.focused) {
      if (!panel) showCat();
      else if (!panel.active && !settingsOpen()) panel.reveal(vscode.ViewColumn.One, false);
    }
    return;
  }

  statusBar.text = `$(clock) ${clock(left)}`;
  statusBar.backgroundColor = left <= cfg.warn
    ? new vscode.ThemeColor('statusBarItem.warningBackground')
    : undefined;
  setTooltip('work', [
    `**Cat Stopper** · focus time · ${round}`,
    '[$(debug-pause) Pause](command:catStopper.togglePause) · [$(coffee) Break now](command:catStopper.startBreak) · [$(debug-restart) Restart](command:catStopper.reset)',
    settingsLink,
  ]);
  if (!state.warned && cfg.warn > 0 && left <= cfg.warn) {
    state.warned = true;
    save();
    vscode.window.showWarningMessage(`Meow! Break in ${clock(left)}.`);
  }
}

function pickVideo() {
  const file = path.join(context.extensionPath, 'media', 'cat2.mp4');
  try {
    return 'data:video/mp4;base64,' + fs.readFileSync(file).toString('base64');
  } catch (e) {
    return undefined;
  }
}

function showCat() {
  if (panel) {
    panel.reveal(vscode.ViewColumn.One, false);
    return;
  }
  panel = vscode.window.createWebviewPanel(
    'catStopper',
    'Cat Stopper',
    vscode.ViewColumn.One,
    { enableScripts: true }
  );
  panel.webview.html = catHtml();
  panel.webview.onDidReceiveMessage((m) => {
    if (m === 'skip') startWork();
    if (m === 'settings') openSettings();
  });
  panel.onDidDispose(() => {
    panel = undefined;
    if (state.phase === 'break' && !paused()) setTimeout(showCat, 1500);
  });
}

function catHtml() {
  const video = pickVideo();
  const visual = video
    ? `<video id="v" src="${video}" autoplay loop muted playsinline style="display:none"></video>
<canvas id="c" style="width:100%;height:100%;object-fit:contain"></canvas>`
    : '<div style="font-size:200px;text-align:center">🐱</div>';
  return `<!DOCTYPE html>
<html><body style="margin:0;height:100vh;overflow:hidden;font-family:sans-serif;position:relative">
<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center">${visual}</div>
<div id="t" style="position:absolute;left:6vw;top:50%;transform:translateY(-50%);font-size:min(18vw,220px);font-weight:800;text-shadow:0 4px 24px rgba(0,0,0,.5);color:#fff;mix-blend-mode:normal"></div>
<div style="position:absolute;top:4vh;width:100%;text-align:center;font-size:24px;font-weight:600">Break time! Go touch some grass 🌱, breathe fresh air 🌬️ and watch the trees 🌳</div>
<div style="position:absolute;bottom:3vh;right:3vw;display:flex;gap:8px;opacity:.6"><button id="settings">⚙ Settings</button><button id="skip">Skip break</button></div>
<div style="position:absolute;bottom:3vh;left:3vw;opacity:.7;font-size:16px">${state.long ? 'Long break' : 'Short break'}</div>
<script>
const vscode = acquireVsCodeApi();
const CROP_BOTTOM = 0;
const end = ${state.endsAt};
document.getElementById('skip').onclick = () => vscode.postMessage('skip');
document.getElementById('settings').onclick = () => vscode.postMessage('settings');
function left() {
  const s = Math.max(0, Math.ceil((end - Date.now()) / 1000));
  document.getElementById('t').textContent = Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
}
left(); setInterval(left, 250);
const v = document.getElementById('v');
const c = document.getElementById('c');
if (v && c) {
  const ctx = c.getContext('2d', { willReadFrequently: true });
  let t0 = 0, seeking = false;
  v.addEventListener('loadeddata', () => { c.width = v.videoWidth; c.height = Math.max(1, v.videoHeight - CROP_BOTTOM); v.pause(); t0 = performance.now(); step(); });
  v.addEventListener('seeked', () => { seeking = false; draw(); });
  function step() {
    if (!seeking) {
      const dur = v.duration;
      const p = ((performance.now() - t0) / 1000) % (2 * dur);
      const t = p < dur ? p : 2 * dur - p;
      seeking = true;
      v.currentTime = Math.min(Math.max(t, 0), dur - 0.01);
    }
    requestAnimationFrame(step);
  }
  function draw() {
    ctx.drawImage(v, 0, 0, c.width, c.height, 0, 0, c.width, c.height);
    const img = ctx.getImageData(0, 0, c.width, c.height);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i], g = d[i + 1], b = d[i + 2];
      const dom = g - Math.max(r, b);
      if (dom > 60) { d[i + 3] = 0; }
      else if (dom > 20) { d[i + 3] = 255 * (60 - dom) / 40; d[i + 1] = Math.max(r, b); }
    }
    ctx.putImageData(img, 0, 0);
  }
}
</script>
</body></html>`;
}

function activate(ctx) {
  context = ctx;
  load();

  statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 1000);
  statusBar.command = 'catStopper.togglePause';
  statusBar.show();

  const interval = setInterval(tick, 1000);

  ctx.subscriptions.push(
    statusBar,
    { dispose: () => { clearInterval(interval); save(); } },
    vscode.window.onDidChangeWindowState((s) => {
      if (s.focused && state.phase === 'break') showCat();
    }),
    vscode.window.onDidChangeActiveTextEditor(() => {
      if (state.phase === 'break' && !settingsOpen()) showCat();
    }),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('catStopper') && state.phase === 'work') startWork(true);
    }),
    vscode.commands.registerCommand('catStopper.openSettings', openSettings),
    vscode.commands.registerCommand('catStopper.togglePause', togglePause),
    vscode.commands.registerCommand('catStopper.startWork', () => startWork()),
    vscode.commands.registerCommand('catStopper.startBreak', startBreak),
    vscode.commands.registerCommand('catStopper.skipBreak', () => startWork()),
    vscode.commands.registerCommand('catStopper.reset', () => startWork(true, false))
  );

  tick();
}

function deactivate() {
  if (context) save();
}

module.exports = { activate, deactivate };
