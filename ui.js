// Gemeinsame Bausteine für alle Seiten: Icons, Menü, Hinweis-Toast, Auftrag an den yt-dlp-Helfer,
// Kopie eines nativen Knopfs und die Zuschnitt-Leiste.
// Alles ohne innerHTML gebaut: YouTube erzwingt Trusted Types und würde innerHTML blockieren.
const ICON = 'M11 3h2v11.17l3.59-3.58L18 12l-6 6-6-6 1.41-1.41L11 14.17V3zM4 19h16v2H4v-2z';
const SCISSORS = 'M9.64 7.64c.23-.5.36-1.05.36-1.64 0-2.21-1.79-4-4-4S2 3.79 2 6s1.79 4 4 4c.59 0 1.14-.13 1.64-.36L10 12l-2.36 2.36C7.14 14.13 6.59 14 6 14c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4c0-.59-.13-1.14-.36-1.64L12 14l7 7h3v-1L9.64 7.64zM6 8c-1.1 0-2-.89-2-2s.9-2 2-2 2 .89 2 2-.9 2-2 2zm0 12c-1.1 0-2-.89-2-2s.9-2 2-2 2 .89 2 2-.9 2-2 2zm6-7.5c-.28 0-.5-.22-.5-.5s.22-.5.5-.5.5.22.5.5-.22.5-.5.5zM19 3l-6 6 2 2 7-7V3z';
let menu = null;

function svgIcon(d) {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'currentColor');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(NS, 'path');
  path.setAttribute('d', d);
  svg.appendChild(path);
  return svg;
}

function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  el.append(...kids);
  return el;
}

function toast(text, ms = 3000) {
  const el = document.createElement('div');
  el.className = 'xvd-toast';
  el.textContent = text;
  document.body.appendChild(el);
  if (ms) setTimeout(() => el.remove(), ms);
  return el;
}

function closeMenu() {
  menu?.remove();
  menu = null;
}

// items: [[iconPath, label, run], ...]
function openMenu(btn, items) {
  closeMenu();
  menu = document.createElement('div');
  menu.className = 'xvd-menu';
  menu.owner = btn;
  menu.setAttribute('role', 'menu');
  for (const [icon, label, run] of items) {
    const item = document.createElement('button');
    item.setAttribute('role', 'menuitem');
    item.append(svgIcon(icon), label);
    item.addEventListener('click', e => {
      e.preventDefault();
      e.stopPropagation();
      closeMenu();
      run();
    });
    menu.appendChild(item);
  }
  document.body.appendChild(menu);
  // Unter dem Knopf, rechtsbündig; passt es unten nicht, darüber.
  const r = btn.getBoundingClientRect();
  const h = menu.offsetHeight;
  menu.style.top = `${r.bottom + h + 8 > innerHeight ? r.top - h - 4 : r.bottom + 4}px`;
  menu.style.left = `${Math.min(innerWidth - menu.offsetWidth - 8, Math.max(8, r.right - menu.offsetWidth))}px`;
  menu.querySelector('button').focus();
}

document.addEventListener('click', e => { if (menu && !menu.contains(e.target)) closeMenu(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeMenu(); });
addEventListener('scroll', closeMenu, { passive: true });

// Auftrag an den yt-dlp-Helfer (über background.js). onProgress bekommt z. B. "42.0%".
// Das zurückgegebene Promise hat .cancel() zum Abbrechen.
function runJob(job, onProgress) {
  let cancel;
  const promise = new Promise((resolve, reject) => {
    const port = browser.runtime.connect({ name: 'job' });
    let settled = false;
    port.onMessage.addListener(msg => {
      if (msg.progress) onProgress?.(msg.progress);
      if (msg.done) { settled = true; resolve(msg.file); }
      if (msg.error) { settled = true; reject(new Error(msg.error)); }
    });
    port.onDisconnect.addListener(() => { if (!settled) reject(new Error('Helfer hat ohne Ergebnis beendet.')); });
    port.postMessage(job);
    // Abbrechen: Port trennen; der Helfer beendet dann yt-dlp und löscht halbe Dateien.
    cancel = () => {
      if (settled) return;
      settled = true;
      port.disconnect();
      reject(new Error('Download abgebrochen.'));
    };
  });
  promise.cancel = () => cancel?.();
  return promise;
}

// Ganzes Video über den Helfer, mit Fortschritt und ✕ zum Abbrechen im Toast.
async function downloadWithHelper(job, name) {
  const t = toast('', 0);
  const text = h('span', {}, `${name}: wird geladen …`);
  const stop = h('button', { class: 'xvd-cancel', 'aria-label': 'Download abbrechen', title: 'Abbrechen' }, '✕');
  t.append(text, stop);
  const run = runJob(job, p => { text.textContent = `${name}: ${p}`; });
  stop.onclick = () => run.cancel();
  try {
    const file = await run;
    text.textContent = `Gespeichert: ${(file || '').split(/[\\/]/).pop()}`;
  } catch (err) {
    text.textContent = err.message;
  }
  stop.remove();
  setTimeout(() => t.remove(), 5000);
}

// Kopiert einen nativen Knopf der Seite (z. B. "Teilen") und macht daraus den Download-Knopf.
// So übernimmt er Größe, Abstände und Hover-Effekt der Seite.
function cloneAction(ref, label) {
  const el = ref.cloneNode(true);
  for (const node of [el, ...el.querySelectorAll('*')]) {
    for (const a of ['id', 'data-e2e', 'data-testid', 'data-key-interaction', 'aria-label', 'aria-pressed', 'aria-expanded', 'aria-haspopup', 'title', 'href']) {
      node.removeAttribute(a);
    }
  }
  const icon = svgIcon(ICON);
  const old = el.querySelector('svg');
  if (old) {
    for (const a of ['class', 'width', 'height', 'style']) if (old.hasAttribute(a)) icon.setAttribute(a, old.getAttribute(a));
    old.replaceWith(icon);
  } else {
    icon.setAttribute('width', '24');
    icon.setAttribute('height', '24');
    (el.querySelector('[class*="icon" i]') || el).appendChild(icon);
  }
  // Erster sichtbarer Text (z. B. "Teilen" oder "6.2M") wird zu label, weiterer Text verschwindet.
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let first = true;
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (!n.nodeValue.trim() || n.parentElement.closest('svg')) continue;
    n.nodeValue = first ? label : '';
    first = false;
  }
  const hit = el.matches('button, [role="button"]') ? el : el.querySelector('button, [role="button"]') || el;
  hit.setAttribute('aria-label', label);
  hit.setAttribute('aria-haspopup', 'menu');
  hit.title = label;
  el.classList.add('xvd-native');
  return { el, hit };
}

// Menü für Seiten, die komplett über den Helfer laufen (YouTube, TikTok, Instagram).
async function helperMenu(hit, name, getJob, getVideo) {
  if (menu?.owner === hit) return closeMenu();
  const { format } = await getPresets();
  openMenu(hit, [
    [ICON, `Ganzes Video downloaden (${format.toUpperCase()})`, () => downloadWithHelper(getJob(), name)],
    [SCISSORS, 'Trimmen', () => trimPanel(getVideo(), getJob(), name)],
  ]);
}

const fmt = s => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`;
const parseTime = text => text.split(':').reduce((sum, part) => sum * 60 + Number(part.replace(',', '.')), 0);

// Zuschnitt-Leiste unten auf der Seite: Start/Ende von der laufenden Stelle des Videos übernehmen.
async function trimPanel(video, job, name) {
  document.querySelector('.xvd-trim')?.remove();
  if (!video) return toast('Kein Video gefunden.');
  const { format } = await getPresets();
  const start = h('input', { inputmode: 'decimal', 'aria-label': 'Start' });
  const end = h('input', { inputmode: 'decimal', 'aria-label': 'Ende' });
  const select = h('select', { title: 'Format' }, h('option', { value: 'mp4' }, 'MP4'), h('option', { value: 'mp3' }, 'MP3'));
  const status = h('div', { class: 'xvd-trim-status' });
  const button = (act, text, attrs = {}) => h('button', { 'data-act': act, ...attrs }, text);
  // Vorschau: Canvas spiegelt das Video der Seite. Klick = Play/Pause.
  const canvas = h('canvas', { class: 'xvd-trim-view', title: 'Klick: Abspielen/Pause' });
  const range = act => h('input', { type: 'range', min: '0', step: '0.1', 'data-range': act, 'aria-label': act === 'start' ? 'Start' : 'Ende' });
  const startRange = range('start'), endRange = range('end');
  const sel = h('div', { class: 'xvd-tl-sel' }), head = h('div', { class: 'xvd-tl-head' });
  const timeline = h('div', { class: 'xvd-tl' }, sel, head, startRange, endRange);
  const p = h('div', { class: 'xvd-trim' },
    canvas,
    timeline,
    h('strong', {}, 'Zuschnitt'),
    h('label', {}, 'Start ', start),
    button('setStart', '⟦ Jetzt', { title: 'Start auf aktuelle Stelle setzen' }),
    h('label', {}, 'Ende ', end),
    button('setEnd', 'Jetzt ⟧', { title: 'Ende auf aktuelle Stelle setzen' }),
    button('preview', '▶ Vorschau'),
    select,
    button('save', 'Speichern', { class: 'xvd-primary' }),
    button('close', '✕', { 'aria-label': 'Schließen', title: 'Schließen' }),
    status);
  const cancelBtn = button('cancel', '✕ Abbrechen', { hidden: '', title: 'Download abbrechen' });
  status.before(cancelBtn);
  let running = null;
  const duration = () => (Number.isFinite(video.duration) ? video.duration : 0);
  // Auswahl auf der Zeitleiste einfärben und Griffe an die Textfelder angleichen.
  const sync = () => {
    const d = duration() || 1, s = parseTime(start.value) || 0, e = parseTime(end.value) || 0;
    startRange.max = endRange.max = String(d);
    startRange.value = String(s);
    endRange.value = String(e);
    sel.style.left = `${(s / d) * 100}%`;
    sel.style.width = `${Math.max(0, (e - s) / d) * 100}%`;
  };
  const resetEnd = () => { if (!parseTime(end.value)) { end.value = fmt(duration()); sync(); } };
  start.value = fmt(0);
  end.value = fmt(duration());
  select.value = format;
  sync();
  video.addEventListener('loadedmetadata', resetEnd);
  let stopAt = null;
  const onTime = () => { if (stopAt !== null && video.currentTime >= stopAt) { video.pause(); stopAt = null; } };
  video.addEventListener('timeupdate', onTime);
  const ctx = canvas.getContext('2d');
  let frame = 0;
  const draw = () => {
    if (video.videoWidth) {
      const w = Math.round(Math.min(480, 240 * video.videoWidth / video.videoHeight));
      if (canvas.width !== w) { canvas.width = w; canvas.height = Math.round(w * video.videoHeight / video.videoWidth); }
      // Zeichnen klappt auch bei Videos von fremden CDNs; das Canvas wird nur nie ausgelesen.
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    }
    head.style.left = `${(video.currentTime / (duration() || 1)) * 100}%`;
    frame = requestAnimationFrame(draw);
  };
  draw();
  canvas.addEventListener('click', () => { stopAt = null; video.paused ? video.play() : video.pause(); });
  timeline.addEventListener('input', e => {
    const t = Number(e.target.value), isStart = e.target === startRange;
    if (isStart) start.value = fmt(Math.min(t, parseTime(end.value)));
    else end.value = fmt(Math.max(t, parseTime(start.value)));
    stopAt = null;
    video.pause();
    video.currentTime = parseTime(isStart ? start.value : end.value);
    sync();
  });
  for (const input of [start, end]) input.addEventListener('change', sync);
  const actions = {
    setStart: () => { start.value = fmt(video.currentTime); sync(); },
    setEnd: () => { end.value = fmt(video.currentTime); sync(); },
    preview: () => {
      video.currentTime = parseTime(start.value);
      stopAt = parseTime(end.value);
      video.play();
    },
    close: () => {
      cancelAnimationFrame(frame);
      video.removeEventListener('timeupdate', onTime);
      video.removeEventListener('loadedmetadata', resetEnd);
      p.remove();
    },
    save: async () => {
      const s = parseTime(start.value), e = parseTime(end.value);
      if (!(e > s)) { status.textContent = 'Ende muss nach dem Start liegen.'; return; }
      const save = p.querySelector('[data-act="save"]');
      save.disabled = true;
      cancelBtn.hidden = false;
      status.textContent = `${name}: wird geschnitten …`;
      running = runJob({ ...job, format: select.value, start: s, end: e }, pct => { status.textContent = `${name}: ${pct}`; });
      try {
        const file = await running;
        status.textContent = `Gespeichert: ${(file || '').split(/[\\/]/).pop()}`;
      } catch (err) {
        status.textContent = err.message;
      }
      running = null;
      cancelBtn.hidden = true;
      save.disabled = false;
    },
    cancel: () => running?.cancel(),
  };
  p.addEventListener('click', e => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act) { e.preventDefault(); actions[act](); }
  });
  // Tasten nicht an die Seite weitergeben (YouTube/TikTok haben Tastenkürzel).
  p.addEventListener('keydown', e => e.stopPropagation());
  document.body.appendChild(p);
}

// Das Bild in root, das gerade am meisten sichtbar ist (bei Slideshows die aktuelle Folie).
// Sichtbar = Schnitt mit dem Fenster und mit allen Vorfahren, die überstehenden Inhalt abschneiden.
function visibleImage(root) {
  let best = null, bestArea = 0;
  for (const img of root.querySelectorAll('img')) {
    let r = img.getBoundingClientRect();
    if (r.width < 150) continue;
    let box = { l: Math.max(r.left, 0), t: Math.max(r.top, 0), r: Math.min(r.right, innerWidth), b: Math.min(r.bottom, innerHeight) };
    for (let p = img.parentElement; p && p !== document.body; p = p.parentElement) {
      if (getComputedStyle(p).overflowX === 'visible') continue;
      r = p.getBoundingClientRect();
      box = { l: Math.max(box.l, r.left), t: Math.max(box.t, r.top), r: Math.min(box.r, r.right), b: Math.min(box.b, r.bottom) };
    }
    const area = Math.max(0, box.r - box.l) * Math.max(0, box.b - box.t);
    if (area > bestArea) { best = img; bestArea = area; }
  }
  return best;
}

// Größte Variante aus srcset, sonst die angezeigte Quelle.
function imageSource(img) {
  const best = (img.srcset || '').split(',').map(s => s.trim().split(/\s+/)).filter(([u]) => u)
    .sort((a, b) => parseInt(b[1]) - parseInt(a[1]))[0];
  return best?.[0] || img.currentSrc || img.src;
}

// Menü mit einem Eintrag "Bild downloaden"; speichert über background.js (downloads-API).
function imageMenu(hit, img, name) {
  const src = imageSource(img);
  const ext = /\.(jpe?g|png|webp|heic|avif)(\?|$)/i.exec(new URL(src, location.href).pathname)?.[1] || 'jpg';
  openMenu(hit, [[ICON, 'Bild downloaden', async () => {
    await browser.runtime.sendMessage({ type: 'save', url: src, filename: `${name}.${ext}` });
    toast('Download gestartet');
  }]]);
}

// Das Video, das gerade läuft; sonst das erste in root.
function activeVideo(root = document) {
  const videos = [...root.querySelectorAll('video')];
  return videos.find(v => !v.paused) || videos[0] || null;
}

// Prüft die Seite neu, sobald sich etwas ändert (Seiten laden Inhalte nach).
function watch(scan) {
  let queued = false;
  new MutationObserver(() => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; scan(); });
  }).observe(document.documentElement, { childList: true, subtree: true });
  scan();
}
