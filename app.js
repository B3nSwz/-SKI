'use strict';

// ---------------------------------------------------------------------------
// $SKI – Hundekopf-Sticker auf eigene Fotos setzen
// Köpfe werden in normierten Koordinaten gespeichert:
//   x, y  -> Mittelpunkt als Anteil von Bildbreite/-höhe (0..1)
//   size  -> Kopfbreite als Anteil der kürzeren Bildseite
//   rot   -> Drehung in Grad (-180..180)
//   flip  -> horizontal gespiegelt
// So bleiben die Köpfe auch beim Wechsel des Fotos an sinnvoller Stelle.
// ---------------------------------------------------------------------------

const MAX_SIDE = 4096; // Obergrenze für die Bildgröße (Speicher auf Mobilgeräten)

const $ = (id) => document.getElementById(id);
const canvas = $('canvas');
const ctx = canvas.getContext('2d');
const ui = {
  file: $('fileInput'), save: $('saveBtn'), add: $('addBtn'), flip: $('flipBtn'),
  dup: $('dupBtn'), front: $('frontBtn'), del: $('delBtn'),
  size: $('sizeRange'), sizeOut: $('sizeOut'), rot: $('rotRange'), rotOut: $('rotOut'),
  empty: $('empty'), stage: $('stage'),
};

const state = {
  bg: null,      // Canvas mit dem hochgeladenen Foto
  heads: [],
  sel: -1,
};

// ---------- Kopf-Grafik + Alphamaske für exaktes Antippen ----------------------
const headImg = new Image();
let headAlpha = null;
headImg.onload = () => {
  const c = document.createElement('canvas');
  c.width = headImg.naturalWidth;
  c.height = headImg.naturalHeight;
  const cx = c.getContext('2d');
  cx.drawImage(headImg, 0, 0);
  try { headAlpha = cx.getImageData(0, 0, c.width, c.height).data; } catch { headAlpha = null; }
  render();
};
headImg.src = 'assets/head.png';
const headAspect = () => headImg.naturalHeight / headImg.naturalWidth || 1.4;

// ---------- Ansicht (Bild in Canvas einpassen) --------------------------------
let view = { s: 1, ox: 0, oy: 0, dpr: 1, cw: 0, ch: 0 };

function resize() {
  const r = ui.stage.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  canvas.width = Math.round(r.width * dpr);
  canvas.height = Math.round(r.height * dpr);
  view.dpr = dpr; view.cw = r.width; view.ch = r.height;
  layout();
  render();
}

function layout() {
  if (!state.bg) return;
  const pad = 8;
  const bw = state.bg.width, bh = state.bg.height;
  const s = Math.min((view.cw - pad * 2) / bw, (view.ch - pad * 2) / bh);
  view.s = s;
  view.ox = (view.cw - bw * s) / 2;
  view.oy = (view.ch - bh * s) / 2;
}

// Bildschirm (CSS-Pixel im Canvas) -> Bildpixel
function toImage(px, py) {
  return { x: (px - view.ox) / view.s, y: (py - view.oy) / view.s };
}

// ---------- Geometrie eines Kopfes in Bildpixeln --------------------------------
function geom(h, bw = state.bg.width, bh = state.bg.height) {
  const w = h.size * Math.min(bw, bh);
  return { cx: h.x * bw, cy: h.y * bh, w, h: w * headAspect(), rad: (h.rot * Math.PI) / 180 };
}

function drawHead(c, h, bw, bh) {
  const g = geom(h, bw, bh);
  c.save();
  c.translate(g.cx, g.cy);
  c.rotate(g.rad);
  if (h.flip) c.scale(-1, 1);
  c.drawImage(headImg, -g.w / 2, -g.h / 2, g.w, g.h);
  c.restore();
}

// ---------- Zeichnen -----------------------------------------------------------
let rafPending = false;
function render() {
  if (rafPending) return;
  rafPending = true;
  requestAnimationFrame(() => { rafPending = false; draw(); });
}

function draw() {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!state.bg) return;
  ctx.setTransform(view.dpr * view.s, 0, 0, view.dpr * view.s, view.dpr * view.ox, view.dpr * view.oy);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(state.bg, 0, 0);
  if (headImg.complete && headImg.naturalWidth) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, state.bg.width, state.bg.height);
    ctx.clip(); // Vorschau = exportiertes Bild
    state.heads.forEach((h) => drawHead(ctx, h, state.bg.width, state.bg.height));
    ctx.restore();
  }
  // Auswahlrahmen
  const h = state.heads[state.sel];
  if (h) {
    const g = geom(h);
    const lw = 2 / view.s;
    ctx.save();
    ctx.translate(g.cx, g.cy);
    ctx.rotate(g.rad);
    ctx.lineWidth = lw;
    ctx.setLineDash([8 / view.s, 6 / view.s]);
    ctx.strokeStyle = '#fff';
    ctx.strokeRect(-g.w / 2, -g.h / 2, g.w, g.h);
    ctx.lineDashOffset = 7 / view.s;
    ctx.strokeStyle = '#e85d24';
    ctx.strokeRect(-g.w / 2, -g.h / 2, g.w, g.h);
    ctx.restore();
  }
}

// ---------- Trefferprüfung (berücksichtigt Transparenz) ------------------------
function hitTest(ix, iy) {
  for (let i = state.heads.length - 1; i >= 0; i--) {
    const h = state.heads[i];
    const g = geom(h);
    const dx = ix - g.cx, dy = iy - g.cy;
    const cos = Math.cos(-g.rad), sin = Math.sin(-g.rad);
    let lx = dx * cos - dy * sin;
    const ly = dx * sin + dy * cos;
    if (h.flip) lx = -lx;
    const u = lx / g.w + 0.5, v = ly / g.h + 0.5;
    if (u < 0 || u > 1 || v < 0 || v > 1) continue;
    if (!headAlpha) return i;
    const nw = headImg.naturalWidth, nh = headImg.naturalHeight;
    // kleine Toleranz: Umgebung prüfen, damit auch Ränder gut greifbar sind
    const r = Math.max(2, Math.round(12 / (view.s * g.w / nw)));
    const px = Math.floor(u * nw), py = Math.floor(v * nh);
    for (let oy = -r; oy <= r; oy += Math.max(1, r >> 1)) {
      for (let ox = -r; ox <= r; ox += Math.max(1, r >> 1)) {
        const qx = px + ox, qy = py + oy;
        if (qx < 0 || qy < 0 || qx >= nw || qy >= nh) continue;
        if (headAlpha[(qy * nw + qx) * 4 + 3] > 40) return i;
      }
    }
  }
  return -1;
}

// ---------- UI-Zustand ---------------------------------------------------------
function syncUI() {
  const hasBg = !!state.bg;
  const h = state.heads[state.sel];
  ui.empty.classList.toggle('hidden', hasBg);
  ui.add.disabled = !hasBg;
  ui.save.disabled = !hasBg;
  [ui.flip, ui.dup, ui.front, ui.del, ui.size, ui.rot].forEach((el) => { el.disabled = !h; });
  if (h) {
    const pct = Math.round(h.size * 100);
    ui.size.value = pct;
    ui.sizeOut.textContent = pct + '%';
    const deg = Math.round(h.rot);
    ui.rot.value = deg;
    ui.rotOut.textContent = deg + '°';
  }
}

function select(i) {
  state.sel = i;
  syncUI();
  render();
}

// ---------- Foto laden ---------------------------------------------------------
ui.file.addEventListener('change', async () => {
  const f = ui.file.files && ui.file.files[0];
  ui.file.value = '';
  if (!f) return;
  try {
    let src;
    if ('createImageBitmap' in window) {
      try { src = await createImageBitmap(f, { imageOrientation: 'from-image' }); } catch { src = null; }
    }
    if (!src) src = await loadImageElement(f);
    const sw = src.width, sh = src.height;
    const k = Math.min(1, MAX_SIDE / Math.max(sw, sh));
    const c = document.createElement('canvas');
    c.width = Math.round(sw * k);
    c.height = Math.round(sh * k);
    const cx = c.getContext('2d');
    cx.imageSmoothingQuality = 'high';
    cx.drawImage(src, 0, 0, c.width, c.height);
    if (src.close) src.close();
    state.bg = c;
    if (state.heads.length === 0) addHead();
    layout();
    syncUI();
    render();
  } catch (e) {
    alert(t('loadErr'));
    console.error(e);
  }
});

function loadImageElement(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = (e) => { URL.revokeObjectURL(url); reject(e); };
    img.src = url;
  });
}

// ---------- Aktionen -----------------------------------------------------------
function addHead() {
  const n = state.heads.length;
  const off = (n % 6) * 0.04;
  state.heads.push({ x: 0.5 + off, y: 0.5 + off, size: 0.35, rot: 0, flip: false });
  select(state.heads.length - 1);
}

ui.add.addEventListener('click', addHead);

ui.flip.addEventListener('click', () => {
  const h = state.heads[state.sel];
  if (!h) return;
  h.flip = !h.flip;
  render();
});

ui.dup.addEventListener('click', () => {
  const h = state.heads[state.sel];
  if (!h) return;
  state.heads.push({ ...h, x: Math.min(0.97, h.x + 0.05), y: Math.min(0.97, h.y + 0.05) });
  select(state.heads.length - 1);
});

ui.front.addEventListener('click', () => {
  const h = state.heads[state.sel];
  if (!h) return;
  state.heads.splice(state.sel, 1);
  state.heads.push(h);
  select(state.heads.length - 1);
});

ui.del.addEventListener('click', () => {
  if (state.sel < 0) return;
  state.heads.splice(state.sel, 1);
  select(-1);
});

ui.size.addEventListener('input', () => {
  const h = state.heads[state.sel];
  if (!h) return;
  h.size = ui.size.value / 100;
  ui.sizeOut.textContent = ui.size.value + '%';
  render();
});

ui.rot.addEventListener('input', () => {
  const h = state.heads[state.sel];
  if (!h) return;
  let v = +ui.rot.value;
  if (Math.abs(v) <= 2) v = 0; // leicht auf 0° einrasten
  h.rot = v;
  ui.rotOut.textContent = v + '°';
  render();
});

// Doppeltipp auf Regler-Beschriftung setzt zurück
$('sizeOut').addEventListener('dblclick', () => { ui.size.value = 35; ui.size.dispatchEvent(new Event('input')); });
$('rotOut').addEventListener('dblclick', () => { ui.rot.value = 0; ui.rot.dispatchEvent(new Event('input')); });

// ---------- Touch / Maus: verschieben, Pinch-Zoom, Zwei-Finger-Drehen ----------
const pointers = new Map();
let gesture = null;

function localPoint(e) {
  const r = canvas.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
}

function startGesture() {
  const h = state.heads[state.sel];
  const pts = [...pointers.values()];
  if (!h || !state.bg) { gesture = null; return; }
  const bw = state.bg.width, bh = state.bg.height;
  if (pts.length === 1) {
    const p = toImage(pts[0].x, pts[0].y);
    gesture = { type: 'drag', dx: h.x * bw - p.x, dy: h.y * bh - p.y };
  } else if (pts.length >= 2) {
    const [a, b] = pts;
    const mid = toImage((a.x + b.x) / 2, (a.y + b.y) / 2);
    gesture = {
      type: 'pinch',
      dist: Math.hypot(b.x - a.x, b.y - a.y) || 1,
      ang: Math.atan2(b.y - a.y, b.x - a.x),
      size: h.size, rot: h.rot,
      dx: h.x * bw - mid.x, dy: h.y * bh - mid.y,
    };
  }
}

function normRot(d) {
  d = ((d + 180) % 360 + 360) % 360 - 180;
  return d;
}

canvas.addEventListener('pointerdown', (e) => {
  if (!state.bg) return;
  canvas.setPointerCapture(e.pointerId);
  const p = localPoint(e);
  pointers.set(e.pointerId, p);
  if (pointers.size === 1) {
    const ip = toImage(p.x, p.y);
    const hit = hitTest(ip.x, ip.y);
    if (hit !== state.sel) select(hit);
  }
  startGesture();
});

canvas.addEventListener('pointermove', (e) => {
  if (!pointers.has(e.pointerId)) return;
  pointers.set(e.pointerId, localPoint(e));
  const h = state.heads[state.sel];
  if (!gesture || !h) return;
  const bw = state.bg.width, bh = state.bg.height;
  const pts = [...pointers.values()];
  if (gesture.type === 'drag' && pts.length === 1) {
    const p = toImage(pts[0].x, pts[0].y);
    h.x = (p.x + gesture.dx) / bw;
    h.y = (p.y + gesture.dy) / bh;
  } else if (gesture.type === 'pinch' && pts.length >= 2) {
    const [a, b] = pts;
    const dist = Math.hypot(b.x - a.x, b.y - a.y);
    const ang = Math.atan2(b.y - a.y, b.x - a.x);
    const size = Math.max(0.05, Math.min(2, gesture.size * (dist / gesture.dist)));
    const k = size / gesture.size;
    const da = ang - gesture.ang;
    h.size = size;
    h.rot = normRot(gesture.rot + (da * 180) / Math.PI);
    // Abstand Kopf <-> Fingermitte mitskalieren und -drehen
    const cos = Math.cos(da), sin = Math.sin(da);
    const mid = toImage((a.x + b.x) / 2, (a.y + b.y) / 2);
    h.x = (mid.x + k * (gesture.dx * cos - gesture.dy * sin)) / bw;
    h.y = (mid.y + k * (gesture.dx * sin + gesture.dy * cos)) / bh;
  }
  syncUI();
  render();
});

function endPointer(e) {
  pointers.delete(e.pointerId);
  startGesture();
}
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);

// Mausrad (Desktop): Größe, mit Shift: Drehung
canvas.addEventListener('wheel', (e) => {
  const h = state.heads[state.sel];
  if (!h) return;
  e.preventDefault();
  if (e.shiftKey) h.rot = normRot(h.rot + Math.sign(e.deltaY) * 3);
  else h.size = Math.max(0.05, Math.min(2, h.size * (e.deltaY < 0 ? 1.05 : 1 / 1.05)));
  syncUI();
  render();
}, { passive: false });

// Tastatur (Desktop)
window.addEventListener('keydown', (e) => {
  if (state.sel < 0 || e.target.tagName === 'INPUT') return;
  if (e.key === 'Delete' || e.key === 'Backspace') { ui.del.click(); e.preventDefault(); }
});

// ---------- Speichern / Teilen -------------------------------------------------
ui.save.addEventListener('click', async () => {
  if (!state.bg) return;
  const c = document.createElement('canvas');
  c.width = state.bg.width;
  c.height = state.bg.height;
  const cx = c.getContext('2d');
  cx.imageSmoothingQuality = 'high';
  cx.drawImage(state.bg, 0, 0);
  state.heads.forEach((h) => drawHead(cx, h, c.width, c.height));
  const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.92));
  if (!blob) { alert(t('saveErr')); return; }
  const ts = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
  const name = `SKI-${ts}.jpg`;
  const file = new File([blob], name, { type: 'image/jpeg' });

  // Auf dem Handy: Teilen-Menü (dort „Bild sichern“ / „In Galerie speichern“)
  if (navigator.canShare && navigator.canShare({ files: [file] }) && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) {
    try { await navigator.share({ files: [file], title: '$SKI' }); return; }
    catch (err) { if (err && err.name === 'AbortError') return; }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
});

// ---------- Sprache -------------------------------------------------------------
// Standard: Englisch. Beim ersten Öffnen wird die Sprache abgefragt und gemerkt;
// über den 🌐-Button lässt sie sich jederzeit ändern.
const LANG_KEY = 'ski-lang';
let lang = 'en';

function t(key) {
  return (I18N[lang] && I18N[lang][key]) || I18N.en[key] || key;
}

function escapeHtml(s) {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function applyLanguage(code) {
  lang = I18N[code] ? code : 'en';
  const meta = LANGS.find((l) => l.code === lang);
  document.documentElement.lang = lang;
  document.documentElement.dir = meta ? meta.dir : 'ltr';
  document.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
  document.querySelectorAll('[data-i18n-title]').forEach((el) => {
    el.title = t(el.dataset.i18nTitle);
    el.setAttribute('aria-label', el.title);
  });
  const bold = (k) => `<b>${escapeHtml(k)}</b>`;
  $('empty1').innerHTML = escapeHtml(t('empty1')).replace('{photo}', bold(t('photo')));
  $('empty2').innerHTML = escapeHtml(t('empty2')).replace('{head}', bold('+ ' + t('head')));
  $('langTitle').textContent = t('pick');
  renderLangList();
}

function renderLangList() {
  const list = $('langList');
  list.innerHTML = '';
  LANGS.forEach((l) => {
    const b = document.createElement('button');
    b.className = 'btn' + (l.code === lang ? ' current' : '');
    b.lang = l.code;
    b.dir = l.dir;
    b.innerHTML = `<span>${escapeHtml(l.name)}</span><small dir="ltr">${escapeHtml(l.en)}</small>`;
    b.addEventListener('click', () => {
      try { localStorage.setItem(LANG_KEY, l.code); } catch {}
      applyLanguage(l.code);
      $('langDialog').classList.add('hidden');
    });
    list.appendChild(b);
  });
}

$('langBtn').addEventListener('click', () => {
  renderLangList();
  $('langDialog').classList.remove('hidden');
});

let savedLang = null;
try { savedLang = localStorage.getItem(LANG_KEY); } catch {}
applyLanguage(savedLang || 'en');
if (!savedLang) $('langDialog').classList.remove('hidden');

// ---------- App installieren -----------------------------------------------------
// Android/Chrome/Edge/Samsung: echter Installationsdialog über "beforeinstallprompt".
// iOS (Apple erlaubt keine Installation per Knopfdruck) und übrige Browser:
// Schritt-für-Schritt-Anleitung.
const installBtn = $('installBtn');
let deferredPrompt = null;

const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
const isIOS = () =>
  /iPhone|iPad|iPod/i.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); // iPadOS meldet sich als Mac

const SHARE_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
  'stroke-linecap="round" stroke-linejoin="round" aria-label="Share"><path d="M12 3v12"/>' +
  '<path d="M8 7l4-4 4 4"/><path d="M7 10H5v11h14V10h-2"/></svg>';

function updateInstallButton() {
  installBtn.classList.toggle('hidden', isStandalone());
}

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  updateInstallButton();
});

window.addEventListener('appinstalled', () => {
  deferredPrompt = null;
  installBtn.classList.add('hidden');
});

function showInstallHelp() {
  const ios = isIOS();
  const keys = ios ? ['ios1', 'ios2', 'ios3'] : ['and1', 'and2', 'and3'];
  $('installTitle').textContent = t(ios ? 'iosTitle' : 'andTitle');
  $('installSteps').innerHTML = keys
    .map((k) => '<li>' + escapeHtml(t(k)).replace('{share}', SHARE_ICON) + '</li>')
    .join('');
  $('installNote').textContent = ios ? t('iosNote') : '';
  $('installOk').textContent = t('ok');
  $('installDialog').classList.remove('hidden');
}

installBtn.addEventListener('click', async () => {
  if (deferredPrompt) {
    const p = deferredPrompt;
    deferredPrompt = null; // ein Prompt kann nur einmal benutzt werden
    p.prompt();
    try {
      const choice = await p.userChoice;
      if (choice && choice.outcome === 'accepted') installBtn.classList.add('hidden');
    } catch {}
    return;
  }
  showInstallHelp();
});

$('installOk').addEventListener('click', () => $('installDialog').classList.add('hidden'));
$('installDialog').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) e.currentTarget.classList.add('hidden');
});
window.matchMedia('(display-mode: standalone)').addEventListener?.('change', updateInstallButton);
updateInstallButton();

// ---------- Start --------------------------------------------------------------
new ResizeObserver(resize).observe(ui.stage);
resize();
syncUI();

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
