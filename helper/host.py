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


def output_name(job):
    # Direkte Dateien (z. B. Roblox-Trailer) haben keinen Titel; dann gibt das Add-on den Namen vor.
    if job.get("name"):
        return re.sub(r'[\\/:*?"<>|%]+', "", str(job["name"]))[:120]
    return "%(uploader,channel,uploader_id)s - %(title).80B [%(id)s]"


def ffmpeg_command(job, section, suffix):
    # Roblox-Trailer: HLS mit einzelnen WebM-Dateien als Segmente, die yt-dlp nicht zusammensetzen kann.
    # Jedes Segment ist eine eigene WebM-Datei mit fortlaufenden Zeitstempeln. Der concat-Filter setzt sie
    # richtig aneinander (der concat-Demuxer würde die Zeit doppelt zählen). Ausgabe H.264/AAC (MP4) oder MP3.
    ext = "mp3" if job.get("format") == "mp3" else "mp4"
    audio = job.get("audio", True)
    if ext == "mp3" and not audio:
        raise ValueError("Dieser Trailer hat keinen Ton.")
    final = Path.home() / "Downloads" / f"{output_name(job)}{suffix}.{ext}"
    job["_final"] = final
    n = len(job["segments"])
    args = ["ffmpeg", "-hide_banner", "-loglevel", "error", "-nostdin", "-y"]
    for url in job["segments"]:
        args += ["-i", url]
    streams = "".join((f"[{i}:a]" if ext == "mp3" else f"[{i}:v]" + (f"[{i}:a]" if audio else "")) for i in range(n))
    v, a = (0, 1) if ext == "mp3" else (1, int(audio))
    outs = ("[v]" if v else "") + ("[a]" if a else "")
    args += ["-filter_complex", f"{streams}concat=n={n}:v={v}:a={a}{outs}"]
    for label in ("[v]", "[a]"):
        if label in outs:
            args += ["-map", label]
    if section:
        args += ["-ss", f"{float(job['start']):.2f}", "-to", f"{float(job['end']):.2f}"]
    if ext == "mp3":
        args += ["-c:a", "libmp3lame", "-q:a", "0"]
    else:
        args += ["-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p",
                 "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart"]
    # .temp. im Namen: remove_partials räumt die Datei bei einem Abbruch weg.
    return args + ["-progress", "pipe:1", "-nostats", str(final.with_suffix(f".temp.{ext}"))]


def command(job):
    section = job.get("start") is not None and job.get("end") is not None
    suffix = f" {float(job['start']):.1f}s-{float(job['end']):.1f}s" if section else ""
    if job.get("segments"):
        return ffmpeg_command(job, section, suffix)
    args = [
        sys.executable, "-m", "yt_dlp",
        "--js-runtimes", "node", "--no-playlist", "--newline", "--progress", "--no-simulate",
        "--quiet", "--no-warnings",
        "--progress-template", "download:XVD %(progress._percent_str)s",
        "--print", "after_move:XVDFILE %(filepath)s",
        "-P", str(Path.home() / "Downloads"),
        "-o", output_name(job) + suffix + ".%(ext)s",
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
        if line.startswith("out_time_us=") and job.get("duration"):
            # ffmpeg -progress: Position in Mikrosekunden -> Prozent wie bei yt-dlp.
            length = float(job["end"]) - float(job["start"]) if job.get("end") is not None else float(job["duration"])
            done = int(line[12:]) if line[12:].isdigit() else 0  # am Anfang meldet ffmpeg "N/A"
            line = f"XVD {min(100, done / 1e4 / max(length, 0.1)):.1f}%"
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
    final = job.get("_final")
    if final and proc.returncode == 0 and not cancelled.is_set():
        final.unlink(missing_ok=True)
        final.with_suffix(f".temp{final.suffix}").rename(final)
        file = str(final)
    if cancelled.is_set():
        remove_partials(started)
        return
    if proc.returncode == 0:
        send({"done": True, "file": file})
    else:
        errors = [l for l in lines if l.startswith("ERROR")] or lines or [f"Fehlercode {proc.returncode}"]
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
