const fields = ['format', 'quality'].map(id => document.getElementById(id));
getPresets().then(p => fields.forEach(f => { f.value = p[f.id]; }));
for (const f of fields) {
  f.onchange = async () => {
    await browser.storage.local.set({ [f.id]: f.id === 'quality' ? +f.value : f.value });
    document.getElementById('saved').textContent = 'Gespeichert ✓';
  };
}

// Helfer anpingen und das Ergebnis (oder Zens genaue Fehlermeldung) anzeigen.
function testHelper() {
  const out = document.getElementById('helper');
  out.textContent = 'wird geprüft …';
  const port = browser.runtime.connect({ name: 'job' });
  let done = false;
  port.onMessage.addListener(msg => {
    done = true;
    out.textContent = msg.ok ? 'Verbunden ✓' : msg.error || JSON.stringify(msg);
  });
  port.onDisconnect.addListener(() => { if (!done) out.textContent = 'Keine Antwort vom Helfer.'; });
  port.postMessage({ type: 'ping' });
}
document.getElementById('test').onclick = testHelper;
testHelper();
