// Roblox: Download-Knopf neben "Favorit" auf der Spielseite. Lädt die gerade sichtbare Folie
// der Galerie: Bild (Original, sonst 768x432-PNG) oder Trailer (über den Helfer als MP4).
document.documentElement.dataset.xvdSite = 'roblox';
const GALLERY = '#game-details-carousel-container';

const universeId = () => document.querySelector('#game-detail-meta-data')?.dataset.universeId;
const gameName = () => (document.querySelector('.game-name')?.textContent || document.title.split('|')[0]).trim().replace(/[\\/:*?"<>|]+/g, '');

let media = null;
async function getMedia() {
  const id = universeId();
  if (media?.id !== id) media = { id, list: (await (await fetch(`https://games.roblox.com/v2/games/${id}/media`)).json()).data || [] };
  return media.list;
}

// Signierte CDN-Adresse der Originaldatei. Bilder brauchen meist einen Login, Trailer nicht.
async function assetUrl(id) {
  const json = await (await fetch(`https://assetdelivery.roblox.com/v2/assetId/${id}`, { credentials: 'include' })).json();
  return json.locations?.[0]?.location || null;
}

// Trailer: Roblox streamt HLS, jedes Segment ist eine eigene WebM-Datei. Die Signatur steht als
// EXT-X-DEFINE-Variable in der Playlist, das kann yt-dlp nicht. Deshalb hier die Segment-Adressen
// fertig bauen; der Helfer setzt sie mit ffmpeg zu MP4/MP3 zusammen.
async function trailerJob(videoId) {
  const list = encodeURIComponent(btoa(JSON.stringify([{ format: 'hls', majorVersion: '1', fidelity: 'main' }])));
  const json = await (await fetch(`https://assetdelivery.roblox.com/v2/asset?Id=${videoId}&&ContentRepresentationPriorityList=${list}`, { credentials: 'include' })).json();
  const master = new URL(json.locations?.[0]?.location || '');
  // Rohwerte aus der Adresse, nicht dekodieren: die Signatur muss Zeichen für Zeichen stimmen.
  const params = Object.fromEntries(master.search.slice(1).split('&').map(p => [p.slice(0, p.indexOf('=')), p.slice(p.indexOf('=') + 1)]));
  const fill = text => text.replace(/\{\$([^}]+)\}/g, (_, k) => params[k] ?? '');
  const text = await (await fetch(master)).text();
  const lines = text.split('\n').map(l => l.trim());
  // Varianten stehen nach Bitrate absteigend: die beste nehmen, deren kurze Seite ins Preset passt.
  const variants = lines.flatMap((l, i) => {
    const res = /RESOLUTION=(\d+)x(\d+)/.exec(l);
    return res ? [{ short: Math.min(+res[1], +res[2]), audio: /CODECS="[^"]*(opus|mp4a|vorbis)/.test(l), uri: lines[i + 1] }] : [];
  });
  const { quality } = await getPresets();
  const pick = variants.find(v => !quality || v.short <= quality) || variants[variants.length - 1];
  const playlist = new URL(fill(pick.uri), master);
  const segments = (await (await fetch(playlist)).text()).split('\n').map(l => l.trim())
    .filter(l => l && !l.startsWith('#')).map(l => new URL(fill(l), playlist).href);
  const duration = +(/RBX-DURATION",VALUE="([\d.]+)"/.exec(text)?.[1] || 0);
  return { url: master.href, segments, duration, audio: pick.audio };
}

// Endung aus den ersten Bytes, weil die CDN-Adresse keine hat.
async function imageExt(url) {
  const b = new Uint8Array(await (await fetch(url, { headers: { Range: 'bytes=0-3' } })).arrayBuffer());
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

function scan() {
  const fav = document.querySelector('.favorite-follow-vote-share > .game-favorite-button-container');
  if (!fav || fav.parentElement.querySelector('.xvd-native')) return;
  const { el, hit } = cloneAction(fav, 'Download');
  for (const node of [el, ...el.querySelectorAll('*')]) {
    for (const a of [...node.attributes]) if (a.name.startsWith('data-')) node.removeAttribute(a.name);
  }
  // Stern-Sprite (CSS-Hintergrund) durch das Download-Icon ersetzen.
  const slot = el.querySelector('.icon-favorite');
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
}

watch(scan);
