/* Desmos Offline: an app shell around the Desmos calculators (Graphing, 3D, Geometry, Scientific,
   Four Function). Files, autosave, the graph list and dark mode live here; the calculators are Desmos's own. */
(() => {
  const $ = (id) => document.getElementById(id);
  const host = window.host;
  const els = {
    calc: $('calc'), title: $('title'), status: $('status'), drawer: $('drawer'), scrim: $('scrim'),
    list: $('graphList'), search: $('search'), exportMenu: $('exportMenu'), toast: $('toast'),
    linkBox: $('linkBox'), linkInput: $('linkInput'), linkErr: $('linkErr'),
    kindBtn: $('kindBtn'), kindMenu: $('kindMenu'), exportBtn: $('exportBtn'), saveBtn: $('saveBtn'),
  };

  if (typeof Desmos === 'undefined') {
    document.body.innerHTML = '<div class="missing"><h1>Calculator files missing</h1>' +
      '<p>Run <code>npm run setup</code> in the app folder once (it needs internet) to download the Desmos calculator, then reopen the app.</p></div>';
    return;
  }

  // Every calculator the Desmos API offers. `untitled` is the default title, `shots` whether it can export pictures.
  const KINDS = {
    graphing: {
      label: 'Graphing', untitled: 'Untitled Graph', shots: true,
      make: (el) => Desmos.GraphingCalculator(el, {
        keypad: true, expressions: true, settingsMenu: true, zoomButtons: true, expressionsTopbar: true,
        border: false, links: true, pasteGraphLink: false, images: true, folders: true, notes: true,
        sliders: true, showResetButtonOnGraphpaper: true, imageUploadCallback: Desmos.imageFileToDataURL,
      }),
    },
    '3d': {
      label: '3D', untitled: 'Untitled 3D Graph', shots: true,
      make: (el) => Desmos.Calculator3D(el, {
        keypad: true, expressions: true, settingsMenu: true, zoomButtons: true, expressionsTopbar: true,
        border: false, links: true, pasteGraphLink: false, images: true, folders: true, notes: true,
        imageUploadCallback: Desmos.imageFileToDataURL,
      }),
    },
    geometry: {
      label: 'Geometry', untitled: 'Untitled Construction', shots: true,
      make: (el) => Desmos.Geometry(el, { border: false, links: true, pasteGraphLink: false }),
    },
    scientific: {
      label: 'Scientific', untitled: 'Untitled Scientific', shots: false,
      make: (el) => Desmos.ScientificCalculator(el, { border: false, links: true }),
    },
    fourfunction: {
      label: 'Four Function', untitled: 'Untitled Four Function', shots: false,
      make: (el) => Desmos.FourFunctionCalculator(el, { border: false, links: true }),
    },
  };

  let prefs = {};
  let kind = 'graphing';
  let calculator = null;
  let blank = '';            // the empty state of the current calculator, to skip saving untouched new graphs
  let currentId = null;      // file name of the open graph, null until first save
  let loading = false;       // true while we setState, so that change events don't count as edits
  let saveTimer = null;
  let dirty = false;
  let dark = false;
  let noEvents = false;      // calculators that cannot report changes get saved on blur and close instead

  const contentOf = (s) => JSON.stringify(s && s.expressions ? s.expressions : s);

  // Build (or rebuild) the calculator for a kind. Only rebuilt when the kind changes.
  function useKind(k) {
    if (!KINDS[k]) k = 'graphing';
    if (calculator && k === kind) return;
    if (calculator) { try { calculator.destroy(); } catch {} }
    els.calc.innerHTML = '';
    const mount = document.createElement('div'); mount.className = 'mount'; els.calc.append(mount);
    kind = k;
    calculator = KINDS[k].make(mount);
    blank = contentOf(calculator.getState());
    noEvents = false;
    try { calculator.observeEvent('change', scheduleSave); } catch { noEvents = true; }
    els.kindBtn.firstChild.textContent = KINDS[k].label + ' ';
    els.exportBtn.disabled = !KINDS[k].shots;
    els.exportBtn.title = KINDS[k].shots ? 'Export image (Ctrl+Shift+E)' : 'This calculator has no picture export';
    for (const b of els.kindMenu.querySelectorAll('button')) b.classList.toggle('on', b.dataset.kind === k);
    applyTheme();
  }

  // ---------- helpers ----------
  function toast(msg, ms = 2600) {
    els.toast.textContent = msg; els.toast.hidden = false;
    clearTimeout(toast.t); toast.t = setTimeout(() => (els.toast.hidden = true), ms);
  }
  // Like desmos.com: the Save button is grey while everything is saved and lights up while a change is pending.
  function setStatus(s) {
    els.saveBtn.disabled = s === 'Saved' || s === '';
    els.saveBtn.textContent = s === 'Saving…' ? 'Saving…' : 'Save';
    els.status.textContent = s === 'Not saved' ? 'Not saved' : '';
  }
  els.saveBtn.addEventListener('click', () => { dirty = true; saveNow(); });
  const untitled = () => KINDS[kind].untitled;
  function titleText() { return els.title.value.trim() || untitled(); }
  function isBlank() { try { return contentOf(calculator.getState()) === blank; } catch { return false; } }
  function ago(ms) {
    const s = (Date.now() - ms) / 1000;
    if (s < 60) return 'just now';
    if (s < 3600) return `${Math.floor(s / 60)} min ago`;
    if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
    return new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  }
  function thumbnail() {
    if (kind !== 'graphing') return Promise.resolve(null);
    try { return Promise.resolve(calculator.screenshot({ width: 180, height: 120, targetPixelRatio: 1, showLabels: false })); }
    catch { return Promise.resolve(null); }
  }

  // ---------- saving ----------
  function scheduleSave() {
    if (loading) return;
    dirty = true; setStatus('Saving…');
    clearTimeout(saveTimer); saveTimer = setTimeout(saveNow, 600);
  }
  async function saveNow() {
    clearTimeout(saveTimer);
    if (!dirty) return;
    if (!currentId && isBlank() && titleText() === untitled()) { dirty = false; setStatus(''); return; }
    dirty = false;
    try {
      currentId = await host.write({ id: currentId, kind, title: titleText(), state: calculator.getState(), thumbnail: await thumbnail() });
      setStatus('Saved');
      if (!els.drawer.hidden) renderList();
    } catch (e) { dirty = true; setStatus('Not saved'); toast('Could not save: ' + e.message, 5000); }
  }

  function load(doc, id, k) {
    useKind((doc && doc.kind) || k || kind);
    loading = true;
    try {
      if (doc && doc.state) calculator.setState(doc.state, { allowUndo: false });
      else if (calculator.setBlank) calculator.setBlank();
    } catch (e) { toast('Part of that graph could not be loaded: ' + e.message, 5000); }
    finally { setTimeout(() => { loading = false; }, 50); } // Desmos fires change events after a tick
    try { calculator.clearHistory?.(); } catch {}
    currentId = id || null;
    els.title.value = (doc && doc.title) || untitled();
    fitTitle();
    dirty = false; setStatus(id ? 'Saved' : '');
    host.setPrefs({ lastGraph: currentId, kind });
  }

  async function openGraph(id) {
    await saveNow();
    try { load(await host.read(id), id); closeDrawer(); }
    catch (e) { toast('Could not open that graph: ' + e.message, 5000); }
  }
  async function newGraph(k) { await saveNow(); load(null, null, typeof k === 'string' ? k : kind); closeDrawer(); try { calculator.focusFirstExpression?.(); } catch {} }
  async function adopt(doc) {
    // A graph brought in from a file or link becomes a new local graph.
    await saveNow(); load(doc, null); dirty = true; await saveNow(); closeDrawer();
    toast(`Saved "${titleText()}" to your graphs`);
  }

  // The title box hugs its text, so Save sits right after it like on desmos.com.
  function fitTitle() { els.title.style.width = `calc(${Math.min(Math.max(els.title.value.length, 6), 40)}ch + 16px)`; }
  els.title.addEventListener('input', fitTitle);
  els.title.addEventListener('input', scheduleSave);
  els.title.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === 'Escape') els.title.blur(); });
  els.title.addEventListener('blur', () => { if (!els.title.value.trim()) els.title.value = untitled(); saveNow(); });
  window.addEventListener('beforeunload', () => { if (noEvents) dirty = true; saveNow(); });
  window.addEventListener('blur', () => { if (noEvents && !loading) dirty = true; saveNow(); });

  // ---------- calculator switcher ----------
  for (const [k, v] of Object.entries(KINDS)) {
    const b = document.createElement('button'); b.dataset.kind = k; b.textContent = v.label;
    b.addEventListener('click', () => { els.kindMenu.hidden = true; if (k !== kind) newGraph(k); });
    els.kindMenu.append(b);
  }
  els.kindBtn.addEventListener('click', (e) => { e.stopPropagation(); els.kindMenu.hidden = !els.kindMenu.hidden; els.exportMenu.hidden = true; });

  // ---------- graph list ----------
  let listCache = [];
  async function renderList() {
    listCache = await host.list();
    const q = els.search.value.trim().toLowerCase();
    const items = listCache.filter((g) => !q || g.title.toLowerCase().includes(q) || (KINDS[g.kind]?.label || '').toLowerCase().includes(q));
    els.list.innerHTML = '';
    if (!items.length) {
      const li = document.createElement('li'); li.className = 'empty';
      li.textContent = q ? 'No graphs match.' : 'No saved graphs yet. Start graphing and it saves by itself.';
      els.list.append(li); return;
    }
    for (const g of items) {
      const li = document.createElement('li');
      if (g.id === currentId) li.classList.add('current');
      let img;
      if (g.thumb) img = Object.assign(document.createElement('img'), { src: g.thumb, alt: '' });
      else { img = document.createElement('div'); img.className = 'noimg'; img.textContent = KINDS[g.kind]?.label || ''; }
      const meta = document.createElement('div'); meta.className = 'meta';
      const name = document.createElement('div'); name.className = 'name'; name.textContent = g.title;
      const when = document.createElement('div'); when.className = 'when';
      when.textContent = (g.kind && g.kind !== 'graphing' ? KINDS[g.kind]?.label + ' · ' : '') + ago(g.mtime);
      meta.append(name, when);
      const del = document.createElement('button'); del.className = 'del'; del.title = 'Move to Trash'; del.textContent = '✕';
      del.addEventListener('click', async (e) => {
        e.stopPropagation();
        await host.trash(g.id);
        if (g.id === currentId) load(null, null);
        toast(`Moved "${g.title}" to the Trash`);
        renderList();
      });
      li.append(img, meta, del);
      li.addEventListener('click', () => openGraph(g.id));
      els.list.append(li);
    }
  }
  function openDrawer() { els.drawer.hidden = false; els.scrim.hidden = false; els.search.value = ''; renderList(); setTimeout(() => els.search.focus(), 0); }
  function closeDrawer() { els.drawer.hidden = true; els.scrim.hidden = true; }
  $('menuBtn').addEventListener('click', () => (els.drawer.hidden ? openDrawer() : closeDrawer()));
  els.scrim.addEventListener('click', closeDrawer);
  els.search.addEventListener('input', renderList);
  els.search.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { const first = listCache.find((g) => g.title.toLowerCase().includes(els.search.value.trim().toLowerCase())); if (first) openGraph(first.id); }
    if (e.key === 'Escape') closeDrawer();
  });
  $('dNew').addEventListener('click', () => newGraph());
  $('newBtn').addEventListener('click', () => newGraph());
  $('dFolder').addEventListener('click', () => host.reveal(currentId));
  $('dImportFile').addEventListener('click', async () => {
    try { const d = await host.importFile(); if (d) adopt(d); } catch (e) { toast('Could not read that file: ' + e.message, 5000); }
  });

  // ---------- desmos.com link ----------
  $('dImportLink').addEventListener('click', () => { closeDrawer(); els.linkErr.textContent = ''; els.linkInput.value = ''; els.linkBox.hidden = false; els.linkInput.focus(); });
  $('linkCancel').addEventListener('click', () => (els.linkBox.hidden = true));
  async function goLink() {
    els.linkErr.textContent = 'Fetching…';
    try { const d = await host.importLink(els.linkInput.value); els.linkBox.hidden = true; adopt(d); }
    catch (e) { els.linkErr.textContent = String(e.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, ''); }
  }
  $('linkGo').addEventListener('click', goLink);
  els.linkInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') goLink(); if (e.key === 'Escape') els.linkBox.hidden = true; });

  // ---------- export ----------
  els.exportBtn.addEventListener('click', (e) => { e.stopPropagation(); els.exportMenu.hidden = !els.exportMenu.hidden; els.kindMenu.hidden = true; });
  document.addEventListener('click', () => { els.exportMenu.hidden = true; els.kindMenu.hidden = true; });
  els.exportMenu.addEventListener('click', (e) => { const k = e.target.dataset.export; if (k) doExport(k); });
  function doExport(how) {
    els.exportMenu.hidden = true;
    if (!KINDS[kind].shots) return toast('This calculator has no picture export.');
    const r = els.calc.getBoundingClientRect();
    const opts = { width: Math.round(r.width) || 1200, height: Math.round(r.height) || 800, targetPixelRatio: how === 'png-hi' ? 3 : 2, preserveAxisNumbers: true };
    if (how === 'svg') {
      if (kind !== 'graphing') return toast('Vector (SVG) export is only for 2D graphs. Use a picture instead.');
      opts.format = 'svg';
    }
    calculator.asyncScreenshot(opts, async (data) => {
      if (how === 'clip') {
        const blob = await (await fetch(data)).blob();
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        return toast('Picture copied. Paste it anywhere.');
      }
      const where = await host.exportImage({ dataUrl: data, name: titleText(), ext: how === 'svg' ? 'svg' : 'png' });
      if (where) toast('Saved picture to ' + where.replace(/^\/home\/[^/]+/, '~'));
    });
  }

  // ---------- dark mode ----------
  function applyTheme() {
    document.body.classList.toggle('dark', dark);
    if (!calculator) return;
    // Graphing and 3D have a proper dark mode (invertedColors); the others get a CSS colour inversion instead.
    const native = kind === 'graphing' || kind === '3d';
    if (native) { try { calculator.updateSettings({ invertedColors: dark }); } catch {} }
    els.calc.classList.toggle('invert', dark && !native);
  }
  $('themeBtn').addEventListener('click', () => { dark = !dark; applyTheme(); host.setPrefs({ theme: dark ? 'dark' : 'light' }); });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
    if (!prefs.theme || prefs.theme === 'system') { dark = e.matches; applyTheme(); }
  });

  // ---------- keyboard ----------
  document.addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    if (!(e.ctrlKey || e.metaKey)) { if (k === 'escape') { closeDrawer(); els.exportMenu.hidden = true; els.kindMenu.hidden = true; } return; }
    if (k === 'n' && !e.shiftKey) { e.preventDefault(); newGraph(); }
    else if (k === 'o') { e.preventDefault(); els.drawer.hidden ? openDrawer() : closeDrawer(); }
    else if (k === 's') { e.preventDefault(); dirty = true; saveNow().then(() => toast('Saved')); }
    else if (k === 'e' && e.shiftKey) { e.preventDefault(); doExport('png'); }
    else if (k === 'd' && e.shiftKey) { e.preventDefault(); $('themeBtn').click(); }
  }, true);

  // ---------- start ----------
  (async () => {
    prefs = await host.getPrefs();
    dark = prefs.theme === 'dark' || ((!prefs.theme || prefs.theme === 'system') && await host.systemDark());
    if (prefs.lastGraph) {
      try { load(await host.read(prefs.lastGraph), prefs.lastGraph); return; } catch {}
    }
    load(null, null, prefs.kind || 'graphing');
  })();

  window.__desmosOffline = { get calculator() { return calculator; }, get kind() { return kind; }, saveNow, newGraph, get currentId() { return currentId; } }; // for testing
})();
