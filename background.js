// Video-Infos aus den X-API-Antworten mitlesen.
// Schlüssel = ID aus der Vorschaubild-URL (ext_tw_video_thumb/<id>/...), die auch im <video poster> steht.
const KEY_RE = /(?:ext_tw_video_thumb|amplify_video_thumb|tweet_video_thumb)\/([^/.?]+)/;
const media = new Map();

function collect(node, found = []) {
  if (!node || typeof node !== 'object') return found;
  if (node.video_info && node.media_url_https) {
    const m = KEY_RE.exec(node.media_url_https);
    if (m) {
      const variants = (node.video_info.variants || [])
        .filter(v => v.content_type === 'video/mp4')
        .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))
        .map(v => ({ url: v.url, bitrate: v.bitrate || 0 }));
      if (variants.length) {
        media.set(m[1], { variants, duration: node.video_info.duration_millis || 0 });
        if (!found.includes(m[1])) found.push(m[1]);
        if (media.size > 3000) media.delete(media.keys().next().value);
      }
    }
  }
  for (const k in node) collect(node[k], found);
  return found;
}

// Firefox-only: Antwort unverändert durchreichen und eine Kopie parsen.
browser.webRequest.onBeforeRequest.addListener(
  ({ requestId }) => {
    const filter = browser.webRequest.filterResponseData(requestId);
    const decoder = new TextDecoder();
    let text = '';
    filter.ondata = e => {
      filter.write(e.data);
      text += decoder.decode(e.data, { stream: true });
    };
    filter.onstop = () => {
      filter.close();
      try { collect(JSON.parse(text + decoder.decode())); } catch {}
    };
    filter.onerror = () => {};
  },
  { urls: ['*://*.x.com/*graphql*', '*://*.twitter.com/*graphql*'] },
  ['blocking']
);

// Fallback, wenn das Video nicht in einer mitgelesenen Antwort war (öffentliche Tweets).
async function fromSyndication(id) {
  const token = ((Number(id) / 1e15) * Math.PI).toString(36).replace(/(0+|\.)/g, '');
  const res = await fetch(`https://cdn.syndication.twimg.com/tweet-result?id=${id}&token=${token}`);
  return res.ok ? collect(await res.json()) : [];
}

async function getMedia(tweet, keys) {
  if (tweet && (!keys.length || keys.some(k => !media.has(k)))) {
    const found = await fromSyndication(tweet).catch(() => []);
    if (!keys.length) keys = found;
  }
  return keys.filter(k => media.has(k)).map(k => ({ key: k, ...media.get(k) }));
}

// Aufträge für den yt-dlp-Helfer (YouTube, TikTok, Instagram, MP3). Fortschritt geht über den Port zurück.
browser.runtime.onConnect.addListener(port => {
  if (port.name !== 'job') return;
  port.onMessage.addListener(async job => {
    const { quality, format } = await getPresets();
    let native = null, closed = false;
    port.onDisconnect.addListener(() => { closed = true; native?.disconnect(); });
    const start = retry => {
      native = browser.runtime.connectNative('media_downloader');
      let answered = false;
      native.onMessage.addListener(msg => { answered = true; port.postMessage(msg); });
      native.onDisconnect.addListener(p => {
        if (closed) return;
        if (p.error && !answered && retry) {
          // Ein zweiter Versuch, falls Zen den Helfer direkt nach dem Start noch nicht findet.
          return setTimeout(() => start(false), 1500);
        }
        if (p.error) {
          const missing = /no such native application/i.test(p.error.message);
          port.postMessage({ error: missing
            ? `Helfer nicht gefunden (Zen meldet: "${p.error.message}"). Details im Add-on-Fenster unter "Helfer testen".`
            : `Helfer-Fehler: ${p.error.message}` });
        }
        port.disconnect();
      });
      native.postMessage({ quality, format, ...job });
    };
    start(true);
  });
});

browser.runtime.onMessage.addListener(msg => {
  if (msg.type === 'open') {
    const url = browser.runtime.getURL(`editor.html?tweet=${msg.tweet || ''}&keys=${msg.keys.join(',')}`);
    browser.windows.create({ url, type: 'popup', width: 860, height: 820 });
  }
  if (msg.type === 'media') return getMedia(msg.tweet, msg.keys);
  // Einzelne Datei direkt speichern (Bilder aus Instagram-/TikTok-Slideshows).
  if (msg.type === 'save') return browser.downloads.download({ url: msg.url, filename: msg.filename });
  if (msg.type === 'download') {
    // Qualität laut Preset direkt speichern, bei mehreren Videos im Post alle.
    return Promise.all([getMedia(msg.tweet, msg.keys), getPreset()]).then(([list, preset]) => {
      list.forEach((m, i) => browser.downloads.download({
        url: pickVariant(m.variants, preset).url,
        filename: `x-${msg.tweet || 'video'}${list.length > 1 ? `-${i + 1}` : ''}.mp4`,
      }));
      return list.length;
    });
  }
});
