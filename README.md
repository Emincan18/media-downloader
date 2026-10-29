# Media Downloader (Firefox / Zen)

Download-Knopf direkt in den Aktionsleisten von X, YouTube, TikTok, Instagram und Roblox. Der Knopf ist eine Kopie des „Teilen“- bzw. „Merken“-Knopfs der jeweiligen Seite und sieht deshalb aus wie ein eigener Knopf der Seite. Ein Klick öffnet ein Menü:

- **Ganzes Video downloaden**: speichert sofort, als MP4 oder MP3 (Preset). Bei Slideshows (Instagram, TikTok-Fotos) die gerade sichtbare Folie.
- **Trimmen**: bei X öffnet sich ein Editor-Fenster, bei YouTube, TikTok und Instagram eine Zuschnitt-Leiste unten auf der Seite. Start und Ende übernimmt man mit „Jetzt“ von der laufenden Stelle.
- **Roblox** (Spielseite, Knopf neben „Favorit“): lädt die gerade sichtbare Folie der Galerie. Bilder in Originalgröße, wenn man eingeloggt ist, sonst als 768×432-PNG. Trailer in 720p über den Helfer als MP4/MP3.
- Laufende Downloads lassen sich mit ✕ abbrechen. Der Helfer stoppt yt-dlp und löscht halbe Dateien.

Einstellungen über das Toolbar-Icon oder `about:addons` > Media Downloader > Einstellungen: Format (MP4/MP3), maximale Qualität und Helfer-Status.

## Installieren

1. Helfer installieren (einmalig, für YouTube, TikTok, Instagram und MP3): `helper\install.bat` per Doppelklick im Explorer starten.
   Er braucht Python, ffmpeg und Node. Das Skript kopiert `host.py` nach `%LOCALAPPDATA%\MediaDownloader`, installiert `yt-dlp[default,curl-cffi]` und meldet den Helfer bei Firefox/Zen an (Registry `HKCU\Software\Mozilla\NativeMessagingHosts\media_downloader`).
   **Nicht aus der Claude-Desktop-App heraus ausführen.** Die App läuft als MSIX-Paket, und Schreibzugriffe auf Registry und AppData landen dann in ihrem privaten Bereich (`%LOCALAPPDATA%\Packages\Claude_…\LocalCache`). Zen sieht den Helfer dann nicht ("No such native application media_downloader"). Aus der App heraus geht es nur über `explorer.exe helper\install.bat`.
2. In Zen `about:config` öffnen und `xpinstall.signatures.required` auf `false` setzen.
3. Die neueste `media-downloader.xpi` von den [Releases](https://github.com/Emincan18/media-downloader/releases/latest) laden und über `about:addons` > Zahnrad > „Add-on aus Datei installieren“ installieren.

## Updates

Das Add-on aktualisiert sich selbst. Zen fragt einmal am Tag `updates.json` in diesem Repo ab (`update_url` im Manifest) und installiert eine neue Version aus den GitHub-Releases. Sofort geht es über `about:addons` > Zahnrad > „Nach Updates suchen“.

Der Helfer (`helper/host.py`) wird **nicht** automatisch aktualisiert. Wenn er sich ändert, `helper\install.bat` erneut starten.

## Neue Version veröffentlichen

```
python release.py 2.3.1
```

Das Skript setzt die Version, baut `dist/media-downloader.xpi`, trägt die Version in `updates.json` ein, pusht nach `main` und legt das GitHub-Release mit der XPI an. Braucht `git` und ein angemeldetes `gh`.

## Aufbau

- `quality.js`: Presets (Format, Qualität) und Auswahl der MP4-Variante.
- `ui.js`: Bausteine für alle Seiten: Menü, Toast mit ✕, Kopie des nativen Knopfs, Zuschnitt-Leiste und Auftrag an den Helfer. Alles wird ohne `innerHTML` gebaut, weil YouTube Trusted Types erzwingt.
- `content.js` (X), `site-youtube.js`, `site-tiktok.js`, `site-instagram.js`, `site-roblox.js`: wo der Knopf hinkommt und welche URL bzw. Folie geladen wird.
- `background.js`: liest bei X die MP4-Links aus den API-Antworten mit (`filterResponseData`, nur Firefox), reicht Aufträge per Native Messaging an den Helfer weiter und speichert Bilder.
- `editor.html`/`editor.js`: X-Editor. MP4 schneidet [Mediabunny](https://mediabunny.dev) im Browser (`mediabunny.min.mjs`, MPL-2.0, Lizenz in `mediabunny-LICENSE.txt`). MP3 macht der Helfer.
- `helper/host.py`: Native-Messaging-Helfer. Er lädt mit yt-dlp in den Download-Ordner und bevorzugt H.264. Ausschnitte schneidet er genau mit `--download-sections` und `--force-keyframes-at-cuts`. Bei einem Abbruch (stdin geschlossen) beendet er yt-dlp und räumt auf. Für TikTok und Instagram nutzt er die Cookies aus dem zuletzt benutzten Zen-Profil. Roblox-Trailer sind HLS mit einzelnen WebM-Segmenten und signierten Variablen (`EXT-X-DEFINE`), die yt-dlp nicht kann. Das Add-on baut die Segment-Adressen, und der Helfer setzt sie mit dem concat-Filter von ffmpeg zusammen.
