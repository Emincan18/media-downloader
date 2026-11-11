const fields = ['format', 'quality'].map(id => document.getElementById(id));
getPresets().then(p => fields.forEach(f => { f.value = p[f.id]; }));
for (const f of fields) {
  f.onchange = async () => {
    await browser.storage.local.set({ [f.id]: f.id === 'quality' ? +f.value : f.value });
    document.getElementById('saved').textContent = 'Gespeichert ✓';
  };
}
const clip = document.getElementById('clipboard');
getPresets().then(p => { clip.checked = p.clipboard; });
clip.onchange = async () => {
  await browser.storage.local.set({ clipboard: clip.checked });
  document.getElementById('saved').textContent = 'Gespeichert ✓';
};

// Helfer anpingen und das Ergebnis (oder Zens genaue Fehlermeldung) anzeigen.
function testHelper() {
  const out = document.getElementById('helper');
  out.textContent = 'wird geprüft …';
  const port = browser.runtime.connect({ name: 'job' });
  let done = false;
  port.onMessage.addListener(msg => {
    done = true;
    out.textContent = msg.ok ? 'Verbunden ✓' : msg.error || JSON.stringify(msg);
    // Fehlt der Helfer, gleich den Ein-Befehl-Installer zeigen.
    document.getElementById('setup').hidden = !!msg.ok;
  });
  port.onDisconnect.addListener(() => {
    if (done) return;
    out.textContent = 'Keine Antwort vom Helfer.';
    document.getElementById('setup').hidden = false;
  });
  port.postMessage({ type: 'ping' });
}
document.getElementById('test').onclick = testHelper;
document.getElementById('copy').onclick = async () => {
  await navigator.clipboard.writeText(document.getElementById('cmd').textContent);
  document.getElementById('copy').textContent = 'Kopiert ✓';
};
testHelper();
