// Desmos Offline (unofficial): the Desmos calculators in a desktop window, with no internet needed.
// Graphs are plain JSON files in GRAPH_DIR. The renderer never touches the disk directly; it asks
// this process through the small API in preload.js.
const { app, BrowserWindow, ipcMain, shell, dialog, nativeTheme, session } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

app.setName('Desmos Offline');
app.setPath('userData', path.join(app.getPath('appData'), 'desmos-offline'));
const PREFS = path.join(app.getPath('userData'), 'prefs.json');
// Where graphs are kept: DESMOS_GRAPH_DIR, else "graphDir" in prefs.json, else ~/Documents/Desmos Graphs.
const GRAPH_DIR = process.env.DESMOS_GRAPH_DIR || readPrefs().graphDir || path.join(app.getPath('documents'), 'Desmos Graphs');

function readPrefs() {
  try { return JSON.parse(fs.readFileSync(PREFS, 'utf8')); } catch { return {}; }
}
function writePrefs(p) {
  fs.mkdirSync(path.dirname(PREFS), { recursive: true });
  fs.writeFileSync(PREFS, JSON.stringify(p, null, 2));
}

// A graph id is its file name without ".json". Only names made of safe characters are accepted,
// so the renderer can never point at a file outside GRAPH_DIR.
function fileFor(id) {
  if (typeof id !== 'string' || !/^[\w\- .()]+$/.test(id) || id.startsWith('.')) throw new Error('bad graph id');
  return path.join(GRAPH_DIR, id + '.json');
}
function safeName(title) {
  const base = (title || 'Untitled').replace(/[^\w\- .()]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || 'Untitled';
  return base.replace(/^\.+/, '');
}
function uniqueId(title, exceptId) {
  const base = safeName(title);
  let id = base, n = 2;
  while (id !== exceptId && fs.existsSync(path.join(GRAPH_DIR, id + '.json'))) id = `${base} (${n++})`;
  return id;
}
function atomicWrite(file, text) {
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, text);
  fs.renameSync(tmp, file);
}

ipcMain.handle('graphs:list', () => {
  fs.mkdirSync(GRAPH_DIR, { recursive: true });
  return fs.readdirSync(GRAPH_DIR)
    .filter(f => f.endsWith('.json'))
    .map(f => {
      const file = path.join(GRAPH_DIR, f);
      let title = f.slice(0, -5), thumb = null, kind = 'graphing';
      try { const d = JSON.parse(fs.readFileSync(file, 'utf8')); title = d.title || title; thumb = d.thumbnail || null; kind = d.kind || kind; } catch {}
      return { id: f.slice(0, -5), title, thumb, kind, mtime: fs.statSync(file).mtimeMs };
    })
    .sort((a, b) => b.mtime - a.mtime);
});

ipcMain.handle('graphs:read', (_e, id) => JSON.parse(fs.readFileSync(fileFor(id), 'utf8')));

// Save a graph. If the title changed, the file is renamed to match it, and the new id is returned.
ipcMain.handle('graphs:write', (_e, { id, kind, title, state, thumbnail }) => {
  fs.mkdirSync(GRAPH_DIR, { recursive: true });
  let newId = id && fs.existsSync(fileFor(id)) ? id : uniqueId(title);
  if (id && safeName(title) !== safeName(id.replace(/ \(\d+\)$/, ''))) {
    newId = uniqueId(title, id);
    if (newId !== id && fs.existsSync(fileFor(id))) fs.renameSync(fileFor(id), fileFor(newId));
  }
  const doc = { app: 'desmos-offline', version: 2, kind: kind || 'graphing', title: title || 'Untitled', savedAt: new Date().toISOString(), thumbnail: thumbnail || null, state };
  atomicWrite(fileFor(newId), JSON.stringify(doc));
  const p = readPrefs(); p.lastGraph = newId; writePrefs(p);
  return newId;
});

// Delete = move to the system Trash, never a permanent delete.
ipcMain.handle('graphs:trash', async (_e, id) => { await shell.trashItem(fileFor(id)); return true; });
ipcMain.handle('graphs:reveal', (_e, id) => { if (id) shell.showItemInFolder(fileFor(id)); else shell.openPath(GRAPH_DIR); });
ipcMain.handle('graphs:dir', () => GRAPH_DIR);

ipcMain.handle('prefs:get', () => readPrefs());
ipcMain.handle('prefs:set', (_e, patch) => { const p = { ...readPrefs(), ...patch }; writePrefs(p); return p; });
ipcMain.handle('theme:system', () => nativeTheme.shouldUseDarkColors);

// Export a picture: the renderer hands over a data URL, we ask where to put it.
ipcMain.handle('export:image', async (e, { dataUrl, name, ext }) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  const { canceled, filePath } = await dialog.showSaveDialog(win, {
    defaultPath: path.join(app.getPath('pictures'), `${safeName(name)}.${ext}`),
    filters: [ext === 'svg' ? { name: 'SVG image', extensions: ['svg'] } : { name: 'PNG image', extensions: ['png'] }],
  });
  if (canceled || !filePath) return null;
  // Desmos returns SVG as plain markup and PNG as a base64 data URL.
  const data = ext === 'svg'
    ? (dataUrl.startsWith('<') ? dataUrl : decodeURIComponent(dataUrl.replace(/^data:image\/svg\+xml[^,]*,/, '')))
    : Buffer.from(dataUrl.split(',')[1], 'base64');
  fs.writeFileSync(filePath, data);
  return filePath;
});

// Open a graph file from anywhere (for example one someone sent you).
ipcMain.handle('import:file', async (e) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  const { canceled, filePaths } = await dialog.showOpenDialog(win, {
    properties: ['openFile'], filters: [{ name: 'Graph', extensions: ['json'] }],
  });
  if (canceled || !filePaths[0]) return null;
  const d = JSON.parse(fs.readFileSync(filePaths[0], 'utf8'));
  return d.state ? d : { kind: 'graphing', title: path.basename(filePaths[0], '.json'), state: d };
});

// Bring in a desmos.com graph link (needs internet). The only network request the app ever makes.
ipcMain.handle('import:link', async (_e, link) => {
  // desmos.com/calculator/<id> (2D), /3d/<id> and /geometry/<id>; a bare id is treated as 2D.
  const s = String(link).trim();
  const m = s.match(/desmos\.com\/(calculator|3d|geometry)\/([a-z0-9]+)/i) || ['', 'calculator', (s.match(/^([a-z0-9]{6,})$/i) || [])[1]];
  if (!m[2]) throw new Error('That is not a desmos.com graph link.');
  const kind = { calculator: 'graphing', '3d': '3d', geometry: 'geometry' }[m[1].toLowerCase()];
  // Node's own fetch, so the page's offline block does not apply to this one deliberate request.
  const get = async (url) => {
    let res;
    try { res = await fetch(url, { headers: { Accept: 'application/json' } }); }
    catch { throw new Error('Could not reach desmos.com. This step needs internet.'); }
    if (!res.ok) throw new Error(res.status === 404 ? 'No graph found at that link.' : `desmos.com answered ${res.status}.`);
    return res.json();
  };
  const d = await get(`https://www.desmos.com/${m[1].toLowerCase()}/${m[2]}`);
  let state = d.state;
  // Newer graphs keep their content at a separate stateUrl on desmos.com.
  if (!state && d.stateUrl && /^https:\/\/([a-z0-9-]+\.)*desmos\.com\//.test(d.stateUrl)) state = await get(d.stateUrl);
  if (!state || !state.expressions) throw new Error('No graph found at that link.');
  return { kind, title: d.title || 'Imported graph', state };
});

function createWindow() {
  const p = readPrefs();
  const win = new BrowserWindow({
    width: p.bounds?.width || 1400, height: p.bounds?.height || 900,
    title: 'Desmos Offline', backgroundColor: '#ffffff', autoHideMenuBar: true,
    icon: path.join(__dirname, 'app', 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true, spellcheck: false },
  });
  win.setMenuBarVisibility(false);
  win.on('close', () => { const q = readPrefs(); q.bounds = win.getBounds(); writePrefs(q); });
  // Links inside notes open in the normal browser, never inside the app.
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (ev, url) => { if (!url.startsWith('file:')) { ev.preventDefault(); if (/^https?:/.test(url)) shell.openExternal(url); } });
  win.loadFile(path.join(__dirname, 'app', 'index.html'));
  return win;
}

app.whenReady().then(() => {
  // Offline by design: the page may only load its own local files.
  session.defaultSession.webRequest.onBeforeRequest((details, cb) => {
    const ok = /^(file|data|blob|devtools|chrome-extension):/.test(details.url);
    cb({ cancel: !ok });
  });
  session.defaultSession.setPermissionRequestHandler((_wc, perm, cb) => cb(perm === 'clipboard-sanitized-write' || perm === 'clipboard-read'));
  createWindow();
});

// One window: launching again just brings the open window forward.
if (!app.requestSingleInstanceLock()) app.quit();
else app.on('second-instance', () => { const w = BrowserWindow.getAllWindows()[0]; if (w) { if (w.isMinimized()) w.restore(); w.focus(); } });
app.on('window-all-closed', () => app.quit());
