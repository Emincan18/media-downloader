"""Neue Version veröffentlichen: python release.py 2.3.1

1. setzt die Version in manifest.json
2. baut dist/media-downloader.xpi
3. trägt die Version in updates.json ein (die Update-Adresse, die Zen täglich abfragt)
4. committet, pusht nach main und legt das GitHub-Release mit der XPI an

Zen installiert die neue Version danach von selbst (spätestens nach 24 h,
sofort über about:addons > Zahnrad > "Nach Updates suchen").
"""
import json
import re
import subprocess
import sys
import zipfile
from pathlib import Path

REPO = "Emincan18/media-downloader"
ADDON_ID = "x-video-downloader@emincan.local"
ROOT = Path(__file__).parent
XPI = ROOT / "dist" / "media-downloader.xpi"
# Alles, was ins Add-on gehört (nicht helper/, README usw.).
FILES = [
    "manifest.json", "quality.js", "ui.js", "background.js", "content.js",
    "site-youtube.js", "site-tiktok.js", "site-instagram.js", "site-roblox.js", "content.css",
    "editor.html", "editor.js", "popup.html", "popup.js", "icon.svg",
    "mediabunny.min.mjs", "mediabunny-LICENSE.txt",
]


def run(*cmd):
    print(">", " ".join(cmd))
    subprocess.run(cmd, cwd=ROOT, check=True)


def build():
    # Jede Datei, die das Manifest lädt, muss in FILES stehen, sonst fehlt sie still im Add-on.
    manifest = json.loads((ROOT / "manifest.json").read_text(encoding="utf-8"))
    used = set(manifest["background"]["scripts"])
    for cs in manifest["content_scripts"]:
        used.update(cs.get("js", []) + cs.get("css", []))
    missing = used - set(FILES)
    if missing:
        sys.exit(f"Fehlt in FILES (release.py): {', '.join(sorted(missing))}")
    XPI.parent.mkdir(exist_ok=True)
    with zipfile.ZipFile(XPI, "w", zipfile.ZIP_DEFLATED) as z:
        for f in FILES:
            z.write(ROOT / f, f)


def main(version):
    if not re.fullmatch(r"\d+\.\d+\.\d+", version):
        sys.exit("Version im Format 1.2.3 angeben.")
    manifest_path = ROOT / "manifest.json"
    text = manifest_path.read_text(encoding="utf-8")
    old = json.loads(text)["version"]
    manifest_path.write_text(text.replace(f'"version": "{old}"', f'"version": "{version}"', 1), encoding="utf-8")
    build()

    updates_path = ROOT / "updates.json"
    updates = json.loads(updates_path.read_text(encoding="utf-8"))
    entries = updates["addons"][ADDON_ID]["updates"]
    entries[:] = [e for e in entries if e["version"] != version]
    entries.append({
        "version": version,
        "update_link": f"https://github.com/{REPO}/releases/download/v{version}/media-downloader.xpi",
    })
    updates_path.write_text(json.dumps(updates, indent=2) + "\n", encoding="utf-8")

    run("git", "add", "-A")
    run("git", "commit", "-m", f"release: v{version}\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>")
    run("git", "push", "origin", "main")
    run("gh", "release", "create", f"v{version}", str(XPI), "--repo", REPO, "--target", "main",
        "--title", f"v{version}", "--notes", f"Media Downloader v{version}")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(sys.argv[1])
