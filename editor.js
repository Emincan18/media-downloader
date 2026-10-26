import { ALL_FORMATS, BlobSource, BufferTarget, Conversion, Input, Mp4OutputFormat, Output } from './mediabunny.min.mjs';

const $ = id => document.getElementById(id);
const q = new URLSearchParams(location.search);
const tweet = q.get('tweet') || 'video';
const keys = (q.get('keys') || '').split(',').filter(Boolean);
const player = $('player'), start = $('start'), end = $('end');
const buttons = ['setStart', 'setEnd', 'preview', 'full', 'cut'].map($);
const once = (el, ev) => new Promise(r => el.addEventListener(ev, r, { once: true }));
let list = [], videoBlob = null, blobUrl = '', previewing = false;

const status = text => { $('status').textContent = text; };
const busy = on => buttons.forEach(b => { b.disabled = on; });
const fmt = s => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`;
const showTimes = () => {
  $('startTime').textContent = fmt(+start.value);
  $('endTime').textContent = fmt(+end.value);
};
const save = (url, name) => browser.downloads.download({ url, filename: name });

async function init() {
  busy(true);
  list = await browser.runtime.sendMessage({ type: 'media', tweet: q.get('tweet'), keys });
  if (!list.length) return status('Kein Video gefunden. Video auf X kurz abspielen oder die Seite neu laden, dann nochmal drücken.');
  list.forEach((_, i) => $('pick').add(new Option(`Video ${i + 1}`, i)));
  $('pick').hidden = list.length < 2;
  fillQuality();
}

async function fillQuality() {
  const quality = $('quality');
  const { variants } = list[$('pick').value];
  quality.innerHTML = '';
  for (const v of variants) {
    const res = /\/(\d+x\d+)\//.exec(v.url);
    quality.add(new Option(res ? `${res[1]} · ${Math.round(v.bitrate / 1000)} kbps` : 'GIF', v.url));
  }
  const presets = await getPresets();
  quality.value = pickVariant(variants, presets.quality).url;
  if (presets.format === 'mp3') $('mode').value = 'mp3';
  load();
}

async function load() {
  busy(true);
  status('Lädt Video …');
  try {
    const res = await fetch($('quality').value);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = videoBlob = await res.blob();
    if (blobUrl) URL.revokeObjectURL(blobUrl);
    blobUrl = URL.createObjectURL(blob);
    player.src = blobUrl;
    await once(player, 'loadedmetadata');
    start.max = end.max = player.duration;
    start.value = 0;
    end.value = player.duration;
    showTimes();
    status(`Fertig geladen (${(blob.size / 1e6).toFixed(1)} MB). Mit den Reglern zuschneiden.`);
    busy(false);
  } catch (err) {
    status(`Laden fehlgeschlagen: ${err.message}`);
  }
}

// MP4 schneiden mit Mediabunny. "Schnell" kopiert die Daten ohne Neu-Kodieren; der Start rutscht dabei
// auf den Keyframe davor (meist unter 1-2 s). "Exakt" kodiert das Bild neu und schneidet bildgenau.
// MP3 kann der Browser nicht kodieren, das macht der yt-dlp-Helfer (lädt den Ausschnitt selbst von X).
function cutMp3(s, e) {
  busy(true);
  status('MP3 wird erstellt …');
  const port = browser.runtime.connect({ name: 'job' });
  port.onMessage.addListener(msg => {
    if (msg.progress) status(`MP3 wird erstellt … ${msg.progress}`);
    if (msg.done) status(`Gespeichert: ${(msg.file || '').split(/[\\/]/).pop()}`);
    if (msg.error) status(msg.error);
  });
  port.onDisconnect.addListener(() => busy(false));
  port.postMessage({ url: `https://x.com/i/status/${tweet}`, format: 'mp3', start: s, end: e });
}

async function cut() {
  const s = +start.value, e = +end.value;
  if ($('mode').value === 'mp3') return cutMp3(s, e);
  const exact = $('mode').value === 'exact';
  busy(true);
  player.pause();
  const prog = $('prog');
  prog.value = 0;
  prog.hidden = false;
  status('Schneide …');
  try {
    const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(videoBlob) });
    const output = new Output({ format: new Mp4OutputFormat(), target: new BufferTarget() });
    const conversion = await Conversion.init({
      input,
      output,
      trim: { start: s, end: e },
      video: exact ? { forceTranscode: true } : undefined,
    });
    if (!conversion.isValid) throw new Error('Dieses Video kann hier nicht geschnitten werden.');
    conversion.onProgress = p => {
      prog.value = p;
      status(`Schneide … ${Math.round(p * 100)} %`);
    };
    await conversion.execute();
    const out = URL.createObjectURL(new Blob([output.target.buffer], { type: 'video/mp4' }));
    await save(out, `x-${tweet}-${s.toFixed(1)}s-${e.toFixed(1)}s.mp4`);
    status('Als MP4 im Download-Ordner gespeichert.');
  } catch (err) {
    status(`Schneiden fehlgeschlagen: ${err.message}`);
  }
  prog.hidden = true;
  busy(false);
}

start.oninput = () => {
  if (+start.value > +end.value - 0.1) start.value = +end.value - 0.1;
  player.currentTime = start.value;
  showTimes();
};
end.oninput = () => {
  if (+end.value < +start.value + 0.1) end.value = +start.value + 0.1;
  player.currentTime = end.value;
  showTimes();
};
$('setStart').onclick = () => { start.value = Math.min(player.currentTime, +end.value - 0.1); showTimes(); };
$('setEnd').onclick = () => { end.value = Math.max(player.currentTime, +start.value + 0.1); showTimes(); };
$('preview').onclick = () => {
  player.currentTime = start.value;
  previewing = true;
  player.play();
};
player.ontimeupdate = () => {
  if (previewing && player.currentTime >= +end.value) { player.pause(); previewing = false; }
};
$('full').onclick = async () => {
  await save(blobUrl, `x-${tweet}.mp4`);
  status('Ganzes Video gespeichert.');
};
$('cut').onclick = cut;
$('pick').onchange = fillQuality;
$('quality').onchange = load;
init();
