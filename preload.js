const { contextBridge, ipcRenderer } = require('electron');
const call = (ch) => (...a) => ipcRenderer.invoke(ch, ...a);

contextBridge.exposeInMainWorld('host', {
  list: call('graphs:list'),
  read: call('graphs:read'),
  write: call('graphs:write'),
  trash: call('graphs:trash'),
  reveal: call('graphs:reveal'),
  dir: call('graphs:dir'),
  getPrefs: call('prefs:get'),
  setPrefs: call('prefs:set'),
  systemDark: call('theme:system'),
  exportImage: call('export:image'),
  importFile: call('import:file'),
  importLink: call('import:link'),
});
