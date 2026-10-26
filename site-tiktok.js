// TikTok: Download-Knopf in der Aktionsleiste direkt unter "Teilen".
// Videos laufen über den Helfer; bei Foto-Slideshows wird das gerade sichtbare Bild gespeichert.
document.documentElement.dataset.xvdSite = 'tiktok';

function videoInfo(item) {
  // Feed: Video-ID steckt in der ID des Player-Wrappers; Einzelseite: in der URL.
  const id = (/xgwrapper-\d+-(\d+)/.exec(item?.querySelector('[id^="xgwrapper-"]')?.id || '') || /\/(?:video|photo)\/(\d+)/.exec(location.pathname) || [])[1];
  const user = (/^\/@([^/?]+)/.exec(item?.querySelector('a[href^="/@"]')?.getAttribute('href') || location.pathname) || [])[1] || '_';
  return id ? { url: `https://www.tiktok.com/@${user}/video/${id}`, cookies: true, id } : { url: location.href, cookies: true };
}

// item: Feed-Eintrag (article), document auf der Einzelseite, null in der Detail-Ansicht
// (dann zählen nur Adresszeile und root, weil darunter noch der Feed liegt).
function onClick(hit, item, root = item === document ? document : item) {
  if (menu?.owner === hit) return closeMenu();
  const video = activeVideo(root);
  if (video && video.getBoundingClientRect().width > 0) {
    return helperMenu(hit, 'TikTok', () => videoInfo(item), () => video);
  }
  // Foto-Post (Slideshow): kein sichtbares Video, also das aktuelle Bild speichern.
  const img = visibleImage(root);
  if (!img) return toast('Kein Video oder Bild gefunden.');
  const slides = [...root.querySelectorAll('img')].filter(i => i.getBoundingClientRect().width >= 150 && i.src);
  const n = slides.indexOf(img);
  imageMenu(hit, img, `tiktok-${videoInfo(item).id || 'foto'}${n >= 0 ? `-${n + 1}` : ''}`);
}

function scan() {
  for (const icon of document.querySelectorAll('[data-e2e="share-icon"]')) {
    // Eintrag in der Leiste = Vorfahre des Icons, der direktes Kind der Leiste (section) ist.
    const bar = icon.closest('section');
    let ref = icon;
    while (ref && ref.parentElement !== bar) ref = ref.parentElement;
    if (!ref || ref.nextElementSibling?.classList.contains('xvd-native')) continue;
    const item = icon.closest('article') || document;
    const { el, hit } = cloneAction(ref, 'Download');
    hit.addEventListener('click', e => {
      e.preventDefault();
      e.stopPropagation();
      onClick(hit, item);
    });
    ref.after(el);
  }
  // Detail-Ansicht (großes Video, Kommentare rechts): Kopie von "Merken", direkt dahinter.
  for (const icon of document.querySelectorAll('[data-e2e="browse-favorite-icon"]')) {
    const button = icon.closest('button');
    if (!button) continue;
    // "Merken" steckt in einem eigenen Wrapper; unser Knopf muss dahinter in die Reihe.
    let ref = button;
    while (ref.parentElement && ref.parentElement.querySelectorAll('button').length === 1) ref = ref.parentElement;
    if (ref.nextElementSibling?.classList.contains('xvd-native')) continue;
    const { el, hit } = cloneAction(button, 'Download');
    // Nur das Icon: rechts in derselben Zeile sitzen noch die Teilen-Icons, Text würde umbrechen.
    el.querySelector('strong')?.remove();
    hit.addEventListener('click', e => {
      e.preventDefault();
      e.stopPropagation();
      onClick(hit, null, document.querySelector('[data-e2e="browse-video"]')?.parentElement || document);
    });
    ref.after(el);
  }
}

watch(scan);
