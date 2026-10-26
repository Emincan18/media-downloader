// X: Download-Knopf in der Aktionsleiste (Antworten, Reposten, Gefällt mir ...) jedes Video- oder Foto-Posts.
// MP4 läuft direkt im Browser; MP3 über den yt-dlp-Helfer. Menü, Toast usw. kommen aus ui.js.
document.documentElement.dataset.xvdSite = 'x';
const KEY_RE = /(?:ext_tw_video_thumb|amplify_video_thumb|tweet_video_thumb)\/([^/.?]+)/;

function info(article) {
  const link = article.querySelector('a[href*="/status/"] time')?.closest('a');
  const tweet = (/\/status\/(\d+)/.exec(link?.href || location.pathname) || [])[1];
  const keys = [];
  for (const el of article.querySelectorAll('video[poster], img[src*="video_thumb"]')) {
    const m = KEY_RE.exec(el.poster || el.src);
    if (m && !keys.includes(m[1])) keys.push(m[1]);
  }
  return { tweet, keys };
}

async function downloadFull(article) {
  const { tweet, keys } = info(article);
  if ((await getPresets()).format === 'mp3') {
    return downloadWithHelper({ url: `https://x.com/i/status/${tweet}` }, 'X');
  }
  const count = await browser.runtime.sendMessage({ type: 'download', tweet, keys });
  toast(count ? 'Download gestartet' : 'Kein Video gefunden. Video kurz abspielen, dann nochmal.');
}

const hasVideo = article => article.querySelector('video, [data-testid="videoPlayer"], [data-testid="videoComponent"]');

// Fotos des Posts in Originalgröße (pbs.twimg.com/media/ID?format=jpg&name=small -> name=orig).
function photos(article) {
  const urls = [];
  for (const img of article.querySelectorAll('[data-testid="tweetPhoto"] img[src*="/media/"]')) {
    const url = new URL(img.src);
    url.searchParams.set('name', 'orig');
    if (!urls.includes(url.href)) urls.push(url.href);
  }
  return urls;
}

function downloadPhotos(article) {
  const { tweet } = info(article), urls = photos(article);
  urls.forEach((url, i) => browser.runtime.sendMessage({
    type: 'save',
    url,
    filename: `x-${tweet || 'bild'}${urls.length > 1 ? `-${i + 1}` : ''}.${new URL(url).searchParams.get('format') || 'jpg'}`,
  }));
  toast('Download gestartet');
}

async function toggleMenu(btn, article) {
  if (menu?.owner === btn) return closeMenu();
  const { format } = await getPresets();
  const items = [];
  if (hasVideo(article)) items.push(
    [ICON, `Ganzes Video downloaden (${format.toUpperCase()})`, () => downloadFull(article)],
    [SCISSORS, 'Trimmen', () => browser.runtime.sendMessage({ type: 'open', ...info(article) })]);
  const count = photos(article).length;
  if (count) items.push([ICON, count > 1 ? `Alle ${count} Bilder downloaden` : 'Bild downloaden', () => downloadPhotos(article)]);
  openMenu(btn, items);
}

function scan() {
  for (const article of document.querySelectorAll('article')) {
    if (article.querySelector('.xvd-btn')) continue;
    if (!hasVideo(article) && !photos(article).length) continue;
    const bar = [...article.querySelectorAll('[role="group"]')].pop();
    if (!bar) continue;
    const btn = document.createElement('button');
    btn.className = 'xvd-btn';
    btn.title = 'Downloaden';
    btn.setAttribute('aria-label', 'Downloaden');
    btn.setAttribute('aria-haspopup', 'menu');
    btn.appendChild(svgIcon(ICON));
    btn.addEventListener('click', e => {
      e.preventDefault();
      e.stopPropagation();
      toggleMenu(btn, article);
    });
    // Wie der Teilen-Knopf daneben: gleicher Container, gleiche Icon-Größe (Post-Seite hat größere Icons).
    const ref = bar.lastElementChild;
    const wrap = document.createElement('div');
    wrap.className = `${ref?.className || ''} xvd-wrap`;
    const icon = ref?.querySelector('svg')?.getBoundingClientRect().height;
    if (icon) {
      btn.style.setProperty('--xvd-icon', `${icon}px`);
      btn.style.setProperty('--xvd-size', `${icon + 16}px`);
    }
    wrap.appendChild(btn);
    bar.appendChild(wrap);
  }
}

watch(scan);
