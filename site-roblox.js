// Roblox: Download-Knopf neben "Favorit" auf der Spielseite. Lädt die gerade sichtbare Folie
// der Galerie: Bild (Original, sonst 768x432-PNG) oder Trailer (über den Helfer als MP4).
document.documentElement.dataset.xvdSite = 'roblox';
const GALLERY = '#game-details-carousel-container';
// Anfragen im Namen der Seite (Firefox: content.fetch). Normales fetch im Content-Skript scheitert an CORS,
// weil das Add-on keine Rechte für die Roblox-APIs hat; so geht es ohne neue Berechtigung und mit Login.
const pageFetch = (...args) => (globalThis.content?.fetch ? content.fetch(...args) : fetch(...args));

const universeId = () => document.querySelector('#game-detail-meta-data')?.dataset.universeId;
const gameName = () => (document.querySelector('.game-name')?.textContent || document.title.split('|')[0]).trim().replace(/[\\/:*?"<>|]+/g, '');

let media = null;
async function getMedia() {
  const id = universeId();
  if (media?.id !== id) media = { id, list: (await (await pageFetch(`https://games.roblox.com/v2/games/${id}/media`)).json()).data || [] };
  return media.list;
}

// Signierte CDN-Adresse der Originaldatei. Bilder brauchen meist einen Login, Trailer nicht.
async function assetUrl(id) {
  const json = await (await pageFetch(`https://assetdelivery.roblox.com/v2/assetId/${id}`, { credentials: 'include' })).json();
  return json.locations?.[0]?.location || null;
}

// Trailer: Roblox streamt HLS, jedes Segment ist eine eigene WebM-Datei. Die Signatur steht als
// EXT-X-DEFINE-Variable in der Playlist, das kann yt-dlp nicht. Deshalb hier die Segment-Adressen
// fertig bauen; der Helfer setzt sie mit ffmpeg zu MP4/MP3 zusammen.
async function trailerJob(videoId) {
  const list = encodeURIComponent(btoa(JSON.stringify([{ format: 'hls', majorVersion: '1', fidelity: 'main' }])));
  const json = await (await pageFetch(`https://assetdelivery.roblox.com/v2/asset?Id=${videoId}&&ContentRepresentationPriorityList=${list}`, { credentials: 'include' })).json();
  const master = new URL(json.locations?.[0]?.location || '');
  // Rohwerte aus der Adresse, nicht dekodieren: die Signatur muss Zeichen für Zeichen stimmen.
  const params = Object.fromEntries(master.search.slice(1).split('&').map(p => [p.slice(0, p.indexOf('=')), p.slice(p.indexOf('=') + 1)]));
  const fill = text => text.replace(/\{\$([^}]+)\}/g, (_, k) => params[k] ?? '');
  const text = await (await pageFetch(master)).text();
  const lines = text.split('\n').map(l => l.trim());
  // Varianten stehen nach Bitrate absteigend: die beste nehmen, deren kurze Seite ins Preset passt.
  const variants = lines.flatMap((l, i) => {
    const res = /RESOLUTION=(\d+)x(\d+)/.exec(l);
    return res ? [{ short: Math.min(+res[1], +res[2]), audio: /CODECS="[^"]*(opus|mp4a|vorbis)/.test(l), uri: lines[i + 1] }] : [];
  });
  const { quality } = await getPresets();
  const pick = variants.find(v => !quality || v.short <= quality) || variants[variants.length - 1];
  const playlist = new URL(fill(pick.uri), master);
  const segments = (await (await pageFetch(playlist)).text()).split('\n').map(l => l.trim())
    .filter(l => l && !l.startsWith('#')).map(l => new URL(fill(l), playlist).href);
  const duration = +(/RBX-DURATION",VALUE="([\d.]+)"/.exec(text)?.[1] || 0);
  return { url: master.href, segments, duration, audio: pick.audio };
}

// Endung aus den ersten Bytes, weil die CDN-Adresse keine hat.
async function imageExt(url) {
  const b = new Uint8Array(await (await pageFetch(url, { headers: { Range: 'bytes=0-3' } })).arrayBuffer());
  return b[0] === 0x89 ? 'png' : b[0] === 0xff ? 'jpg' : b[0] === 0x52 ? 'webp' : 'png';
}

async function onClick(hit) {
  if (menu?.owner === hit) return closeMenu();
  const items = [...document.querySelectorAll(`${GALLERY} .carousel-item`)];
  const active = items.find(i => i.classList.contains('carousel-item-active')) || items[0];
  const name = `Roblox - ${gameName()}`;
  try {
    const entry = (await getMedia())[items.indexOf(active)];
    const video = active?.querySelector('video');
    if (video || entry?.videoId || entry?.videoHash) {
      const job = entry?.videoHash ? { url: `https://www.youtube.com/watch?v=${entry.videoHash}` } : await trailerJob(entry.videoId);
      if (!job.url || job.segments?.length === 0) return toast('Trailer nicht gefunden.');
      return helperMenu(hit, name, () => ({ ...job, name: `${name} - Trailer` }), () => video);
    }
    const img = active?.querySelector('img');
    const original = entry?.imageId && await assetUrl(entry.imageId);
    const url = original || img?.src.replace(/\/(Webp|Jpeg)\//, '/Png/');
    if (!url) return toast('Kein Bild gefunden.');
    const ext = original ? await imageExt(original) : 'png';
    openMenu(hit, [[ICON, 'Bild downloaden', async () => {
      await browser.runtime.sendMessage({ type: 'save', url, filename: `${name} ${items.indexOf(active) + 1}.${ext}` });
      toast('Download gestartet');
    }]]);
  } catch (err) {
    toast(`Roblox: ${err.message}`);
  }
}

// Favorit-Knopf finden, unabhängig vom genauen Aufbau (eingeloggt kommt z. B. "Notify" dazu).
// Selektoren in Reihenfolge der Verlässlichkeit; der erste sichtbare Treffer gewinnt.
const FAVORITE = ['.game-favorite-button-container', '#toggle-game-favorite', '[class*="icon-favorite"]',
  'button[aria-label*="favorit" i]', '[role="button"][aria-label*="favorit" i]', 'button[data-testid*="favorite" i]'];
const VOTES = ['#voting-section', '.voting-panel', '[class*="upvote"]'];
const first = list => list.map(s => [...document.querySelectorAll(s)].find(el => el.getClientRects().length && !el.closest('.xvd-native'))).find(Boolean);

function scan() {
  const anchor = first(FAVORITE);
  if (!anchor) return;
  // Eintrag des Favorit-Knopfs: Listeneintrag bzw. Knopf, sonst hochklettern bis neben die Like-Leiste.
  let fav = anchor.closest('li, button');
  if (!fav) {
    const votes = first(VOTES);
    fav = anchor;
    if (votes) while (fav.parentElement && !fav.parentElement.contains(votes)) fav = fav.parentElement;
    // Zu groß geklettert (enthält mehr als den Favorit-Knopf): beim Anker bleiben.
    if (fav.querySelectorAll('a, button, [role="button"]').length > 1) fav = anchor;
  }
  if (!fav.parentElement || fav.parentElement.querySelector('.xvd-native')) return;
  const { el, hit } = cloneAction(fav, 'Download');
  for (const node of [el, ...el.querySelectorAll('*')]) {
    for (const a of [...node.attributes]) if (a.name.startsWith('data-')) node.removeAttribute(a.name);
  }
  // Stern-Sprite (CSS-Hintergrund) durch das Download-Icon ersetzen.
  const slot = el.querySelector('[class*="icon-favorite"]');
  if (slot) {
    slot.className = '';
    slot.style.cssText = 'width:28px;height:28px;margin:0 auto;';
    const icon = svgIcon(ICON);
    icon.setAttribute('width', '28');
    icon.setAttribute('height', '28');
    slot.replaceChildren(icon);
  }
  hit.addEventListener('click', e => {
    e.preventDefault();
    e.stopPropagation();
    onClick(hit);
  });
  fav.after(el);
  // Mit unserem Knopf passt die Like-Leiste nicht mehr in die Zeile: mittig darunter setzen (content.css).
  fav.parentElement.classList.add('xvd-roblox-bar');
}

// Spiel-Kacheln (Home "Recommended For You", Charts, Suche): runder Download-Knopf oben links auf dem Bild,
// sichtbar beim Hovern wie Roblox' "…"-Knopf. Größe und Format stehen frei in der tr.rbxcdn.com-Adresse:
// breite Thumbnails gibt es bis 768x432, Icons bis 512x512.
function tileImageUrl(img) {
  const wide = img.naturalWidth > img.naturalHeight * 1.3 || img.width > img.height * 1.3;
  return img.src.replace(/\/\d+\/\d+\/Image\/\w+\//, wide ? '/768/432/Image/Png/' : '/512/512/Image/Png/');
}

function scanTiles() {
  const imgs = document.querySelectorAll(':is(a[href*="/games/"], .game-card-container) img[src*="tr.rbxcdn.com"]:not([data-xvd-tile])');
  for (const img of imgs) {
    img.dataset.xvdTile = '';
    // Breite Kacheln (Home) legen beim Hovern eine Video-Vorschau über das Bild: Knopf an den äußeren Container.
    const box = img.closest('.featured-game-icon-container, .game-card-thumb-container, [class*="thumb" i]') || img.parentElement;
    if (getComputedStyle(box).position === 'static') box.style.position = 'relative';
    const btn = h('button', { class: 'xvd-tile-btn', type: 'button', title: 'Thumbnail downloaden', 'aria-label': 'Thumbnail downloaden' }, svgIcon(ICON));
    btn.addEventListener('click', e => {
      // Die Kachel ist ein Link: Klick nicht zur Spielseite durchlassen.
      e.preventDefault();
      e.stopPropagation();
      const tile = img.closest('a, .game-card-container');
      const name = (img.alt || tile?.querySelector('[title]')?.title || 'Spiel').replace(/[\\/:*?"<>|]+/g, '').trim();
      browser.runtime.sendMessage({ type: 'save', url: tileImageUrl(img), filename: `Roblox - ${name}.png` });
      toast('Download gestartet');
    });
    box.append(btn);
  }
}

watch(() => { scan(); scanTiles(); });
