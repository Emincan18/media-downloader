// X: Download-Knopf in der Aktionsleiste (Antworten, Reposten, Gefällt mir ...) jedes Video-Posts.
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

async function toggleMenu(btn, article) {
  if (menu?.owner === btn) return closeMenu();
  const { format } = await getPresets();
  openMenu(btn, [
    [ICON, `Ganzes Video downloaden (${format.toUpperCase()})`, () => downloadFull(article)],
    [SCISSORS, 'Trimmen', () => browser.runtime.sendMessage({ type: 'open', ...info(article) })],
  ]);
}

function scan() {
  for (const article of document.querySelectorAll('article')) {
    if (article.querySelector('.xvd-btn')) continue;
    if (!article.querySelector('video, [data-testid="videoPlayer"], [data-testid="videoComponent"]')) continue;
    const bar = [...article.querySelectorAll('[role="group"]')].pop();
    if (!bar) continue;
    const btn = document.createElement('button');
    btn.className = 'xvd-btn';
    btn.title = 'Video downloaden';
    btn.setAttribute('aria-label', 'Video downloaden');
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
