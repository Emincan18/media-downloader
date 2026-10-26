"""Native-Messaging-Helfer für das Add-on "Media Downloader".

Bekommt einen Auftrag {url, format: "mp4"|"mp3", quality, start?, end?, cookies?} und lädt mit yt-dlp
in den Download-Ordner. Meldet Fortschritt und am Ende den Dateipfad oder den Fehler zurück.
"""
import glob
import json
import os
import re
import struct
import subprocess
import sys
import threading
import time
from pathlib import Path


def read():
    raw = sys.stdin.buffer.read(4)
    if len(raw) < 4:
        sys.exit(0)
    return json.loads(sys.stdin.buffer.read(struct.unpack("<I", raw)[0]))


def send(msg):
    data = json.dumps(msg).encode("utf-8")
    sys.stdout.buffer.write(struct.pack("<I", len(data)) + data)
    sys.stdout.buffer.flush()


def browser_profile():
    # Cookies aus dem zuletzt benutzten Zen-Profil (Instagram braucht den Login), sonst Firefox.
    for base in ("zen", os.path.join("Mozilla", "Firefox")):
        files = glob.glob(os.path.join(os.environ["APPDATA"], base, "Profiles", "*", "cookies.sqlite"))
        if files:
            return "firefox:" + os.path.dirname(max(files, key=os.path.getmtime))
    return None


def command(job):
    section = job.get("start") is not None and job.get("end") is not None
    suffix = f" {float(job['start']):.1f}s-{float(job['end']):.1f}s" if section else ""
    args = [
        sys.executable, "-m", "yt_dlp",
        "--js-runtimes", "node", "--no-playlist", "--newline", "--progress", "--no-simulate",
        "--quiet", "--no-warnings",
        "--progress-template", "download:XVD %(progress._percent_str)s",
        "--print", "after_move:XVDFILE %(filepath)s",
        "-P", str(Path.home() / "Downloads"),
        "-o", "%(uploader,channel,uploader_id)s - %(title).80B [%(id)s]" + suffix + ".%(ext)s",
        "--force-overwrites",
    ]
    if job.get("format") == "mp3":
        args += ["-x", "--audio-format", "mp3", "--audio-quality", "0"]
    else:
        # H.264 vor allem anderen, weil AV1/VP9 viele Programme nicht abspielen; res = kürzere Bildseite.
        res = int(job.get("quality") or 0)
        sort = f"vcodec:h264,res:{res},ext:mp4:m4a" if res else "vcodec:h264,ext:mp4:m4a"
        args += ["-S", sort, "-f", "bv*+ba/b", "--merge-output-format", "mp4"]
    if job.get("item"):
        # Eine Folie aus einem Karussell/Slideshow (1 = erste Folie).
        args += ["--playlist-items", str(int(job["item"]))]
    if section:
        # Kodiert an den Schnittstellen neu, damit Start und Ende genau sitzen.
        args += ["--download-sections", f"*{float(job['start']):.2f}-{float(job['end']):.2f}", "--force-keyframes-at-cuts"]
    if job.get("cookies"):
        profile = browser_profile()
        if profile:
            args += ["--cookies-from-browser", profile]
    return args + ["--", job["url"]]


# Zwischendateien von yt-dlp: "x.part", "x.ytdl", "x.f137.mp4", "x.temp.mp4", "x.part-Frag3".
TEMP_FILE = re.compile(r"(\.part|\.ytdl|\.part-Frag\d+|\.f\d+\.\w+|\.temp\.\w+)$")


def remove_partials(started):
    folder = Path.home() / "Downloads"
    # Nach dem Beenden sperrt Windows die Dateien manchmal noch kurz, deshalb mehrere Versuche.
    for _ in range(10):
        left = [f for f in folder.iterdir()
                if f.is_file() and f.stat().st_mtime >= started - 2 and TEMP_FILE.search(f.name)]
        for f in left:
            try:
                f.unlink()
            except OSError:
                pass
        if not any(f.exists() for f in left):
            return
        time.sleep(0.3)


cancelled = threading.Event()


def cancel_on_eof(proc):
    # Bricht der Nutzer ab, trennt das Add-on den Port und Firefox schließt stdin.
    # Dann yt-dlp samt ffmpeg beenden; das Aufräumen macht run().
    # os.read statt sys.stdin: blockiert nicht das Beenden von Python (Lock des gepufferten stdin).
    while os.read(sys.stdin.fileno(), 65536):
        pass
    if proc.poll() is None:
        cancelled.set()
        subprocess.run(["taskkill", "/F", "/T", "/PID", str(proc.pid)], capture_output=True,
                       creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))


def run(job):
    started = time.time()
    proc = subprocess.Popen(
        command(job),
        # stdin gehört dem Add-on (Abbruch-Signal); ffmpeg würde sonst davon lesen.
        stdin=subprocess.DEVNULL,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        env={**os.environ, "PYTHONUTF8": "1"},
        creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
    )
    threading.Thread(target=cancel_on_eof, args=(proc,), daemon=True).start()
    file, lines, last = None, [], None
    for raw in proc.stdout:
        line = raw.decode("utf-8", "replace").strip()
        if line.startswith("XVD "):
            pct = line[4:].strip().split(".")[0]
            if pct != last:
                last = pct
                send({"progress": line[4:].strip()})
        elif line.startswith("XVDFILE "):
            file = line[8:]
        elif line:
            lines.append(line)
    proc.wait()
    if cancelled.is_set():
        remove_partials(started)
        return
    if proc.returncode == 0:
        send({"done": True, "file": file})
    else:
        errors = [l for l in lines if l.startswith("ERROR")] or lines or [f"yt-dlp Fehlercode {proc.returncode}"]
        send({"error": errors[-1]})


if __name__ == "__main__":
    job = read()
    if job.get("type") == "ping":
        send({"ok": True})
    else:
        try:
            run(job)
        except Exception as exc:  # Fehler immer ans Add-on melden, sonst hängt der Fortschritt.
            send({"error": str(exc)})
