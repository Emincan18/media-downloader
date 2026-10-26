// Instagram: Download-Knopf direkt neben "Teilen" bei Reels, Video- und Bild-Posts.
// Bei Karussells (Slideshows) lädt er die Folie, die gerade zu sehen ist.
document.documentElement.dataset.xvdSite = 'instagram';
const SHARE = /^(Teilen|Beitrag teilen|Share|Share post)$/i;
const POST_LINK = 'a[href*="/reel/"], a[href*="/p/"]';
const BUTTON = '[role="button"], button';

function postUrl(container) {
  // Im Home-Feed steht der Link (Zeitstempel) im Kopf des Posts, also im ganzen <article> suchen.
  const href = (container.closest('article') || container).querySelector(POST_LINK)?.getAttribute('href');
  const path = /\/(reels?|p)\/[\w-]+/.exec(href || location.pathname)?.[0];
  return path ? `https://www.instagram.com${path.replace('/reels/', '/reel/')}/` : location.href;
}

// Post-Bilder, keine Kommentar-GIFs/Sticker (die kommen von external-*.fbcdn.net oder fbsbx.com).
const bigImage = el => [...el.querySelectorAll('img')].find(img =>
  img.getBoundingClientRect().width >= 200 && !/^https:\/\/(external[^/]*|[^/]*fbsbx\.com)\//.test(img.src));
const hasMedia = el => el.querySelector('video, ul > li img') || bigImage(el);
const translateX = li => +(/translateX\((-?[\d.]+)px/.exec(li.style.transform) || [0, 0])[1];

// Aktuelle Folie: Karussells scrollen horizontal, Index = scrollLeft / Folienbreite.
function currentSlide(container) {
  const ul = [...container.querySelectorAll('ul')].find(u => u.querySelector(':scope > li img, :scope > li video'));
  if (!ul) return { el: container, index: null };
  const items = [...ul.querySelectorAll(':scope > li')].filter(li => li.querySelector('img, video'));
  let scroller = ul;
  while (scroller !== container && !/auto|scroll/.test(getComputedStyle(scroller).overflowX)) scroller = scroller.parentElement;
  const width = items[0].getBoundingClientRect().width || 1;
  const index = Math.round(scroller.scrollLeft / width);
  return { el: items.find(li => Math.abs(translateX(li) - index * width) < 2) || items[0], index: index + 1 };
}

function onClick(hit, container) {
  if (menu?.owner === hit) return closeMenu();
  const url = postUrl(container);
  const { el, index } = currentSlide(container);
  const video = el.querySelector('video');
  if (video) {
    // item: Nummer der Folie im Karussell, damit yt-dlp genau dieses Video lädt.
    return helperMenu(hit, 'Instagram', () => ({ url, cookies: true, item: index }), () => video);
  }
  const img = bigImage(el);
  if (!img) return toast('Kein Bild oder Video gefunden.');
  const code = /\/(?:reels?|p)\/([\w-]+)/.exec(url)?.[1] || 'post';
  imageMenu(hit, img, `instagram-${code}${index ? `-${index}` : ''}`);
}

function scan() {
  for (const svg of document.querySelectorAll('svg[aria-label]')) {
    if (!SHARE.test(svg.getAttribute('aria-label'))) continue;
    // ref: äußerster Wrapper, der nur den Teilen-Knopf enthält. Im Home-Feed liegt der Knopf direkt
    // in der Zeile mit Gefällt mir/Kommentar/Repost, dann ist ref der Knopf selbst.
    let ref = svg.closest(BUTTON);
    if (!ref) continue;
    while (ref.parentElement && ref.parentElement.querySelectorAll(BUTTON).length === 1) ref = ref.parentElement;
    if (ref.nextElementSibling?.classList.contains('xvd-native')) continue;
    let container = svg.closest('article');
    if (!container) {
      container = ref;
      for (let i = 0; i < 12 && container && !hasMedia(container); i++) container = container.parentElement;
    }
    if (!container || !hasMedia(container)) continue;
    const { el, hit } = cloneAction(ref, 'Download');
    hit.addEventListener('click', e => {
      e.preventDefault();
      e.stopPropagation();
      onClick(hit, container);
    });
    ref.after(el);
  }
}

watch(scan);
