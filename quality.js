// Gemeinsam für background.js, editor.js und popup.html.
// maxHeight 0 = beste Qualität, sonst die beste Variante, deren kurze Seite <= maxHeight ist.
// variants ist nach Bitrate absteigend sortiert.
function pickVariant(variants, maxHeight) {
  if (!maxHeight) return variants[0];
  const fits = variants.find(v => {
    const m = /\/(\d+)x(\d+)\//.exec(v.url);
    return !m || Math.min(+m[1], +m[2]) <= maxHeight;
  });
  return fits || variants[variants.length - 1];
}

// quality: maximale kurze Bildseite (0 = beste), format: "mp4" oder "mp3" für "Ganzes Video downloaden".
async function getPresets() {
  const { quality = 0, format = 'mp4' } = await browser.storage.local.get(['quality', 'format']);
  return { quality: +quality, format };
}

async function getPreset() {
  return (await getPresets()).quality;
}
