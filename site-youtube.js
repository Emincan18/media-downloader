// YouTube: Download-Knopf direkt neben "Teilen" (normale Videos und Shorts).
document.documentElement.dataset.xvdSite = 'youtube';
const SHARE = /^(Teilen|Share)$/i;

function videoUrl() {
  const id = new URLSearchParams(location.search).get('v');
  return id ? `https://www.youtube.com/watch?v=${id}` : location.href.split('?')[0];
}

function scan() {
  if (!/^\/(watch|shorts\/)/.test(location.pathname)) return;
  const shares = document.querySelectorAll('ytd-watch-metadata button[aria-label], ytd-shorts button[aria-label], ytd-reel-video-renderer button[aria-label]');
  for (const button of shares) {
    if (!SHARE.test(button.getAttribute('aria-label'))) continue;
    // outer: äußerster Wrapper, der nur den Teilen-Knopf enthält (dahinter kommt unser Knopf).
    // inner: größtes normales HTML-Element um den Knopf. YouTube-Custom-Elements (Name mit "-")
    // werden nicht kopiert, weil sie sich ohne ihre Daten leer neu aufbauen würden.
    let outer = button;
    while (outer.parentElement && outer.parentElement.querySelectorAll('button').length === 1) outer = outer.parentElement;
    let inner = button;
    while (inner.parentElement !== outer && inner !== outer && !inner.parentElement.tagName.includes('-')) inner = inner.parentElement;
    if (!outer.parentElement || outer.nextElementSibling?.classList.contains('xvd-native')) continue;
    // Versteckte Teilen-Kopien (Platzmangel, z. B. nach Vollbild) bekommen keinen Knopf.
    if (!button.getClientRects().length) continue;
    // YouTube baut die Leiste z. B. nach dem Vollbild neu auf. Alte Knöpfe entfernen, sonst stapeln sie sich
    // und verdrängen "Gefällt mir" und "Teilen" ins "…"-Menü.
    const scope = button.closest('ytd-watch-metadata, ytd-reel-video-renderer') || outer.parentElement;
    for (const old of scope.querySelectorAll('.xvd-native.xvd-yt')) old.remove();
    const { el, hit } = cloneAction(inner, 'Download');
    // Icon-Bereich komplett ersetzen: YouTube rendert dort eigene Elemente nach,
    // die sonst das Icon über den Text schieben.
    const slot = el.querySelector('[class*="ShapeNextIcon"], [class*="shape-next__icon"]');
    if (slot) {
      const icon = svgIcon(ICON);
      icon.style.cssText = 'width:24px;height:24px;display:block';
      slot.replaceChildren(icon);
    }
    const wrap = document.createElement('div');
    wrap.className = 'xvd-native xvd-yt';
    if (outer.closest('ytd-watch-metadata')) {
      // Leiste unter dem Video: YouTube nutzt 8px Abstand. Fest setzen, weil der berechnete Wert
      // beim ersten Rendern noch 0 sein kann.
      wrap.style.marginLeft = '8px';
    } else {
      const cs = getComputedStyle(outer);
      wrap.style.margin = cs.margin;
      wrap.style.padding = cs.padding;
    }
    wrap.appendChild(el);
    hit.addEventListener('click', e => {
      e.preventDefault();
      e.stopPropagation();
      helperMenu(hit, 'YouTube', () => ({ url: videoUrl() }), () => document.querySelector('#movie_player video') || activeVideo());
    });
    outer.after(wrap);
  }
}

watch(scan);
