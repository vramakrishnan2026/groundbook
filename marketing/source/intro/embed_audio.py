#!/usr/bin/env python3
"""
Put recorded voiceover into the slideshow so it stays ONE file you can send on WhatsApp.

Folder layout (next to this script):
    goarena-intro.html
    audio/en/01.mp3 ... audio/en/18.mp3
    audio/ml/... (Malayalam, later)

Run:
    python3 embed_audio.py
Output:
    goarena-intro-with-voice.html   <- send this one

Missing files are fine: that slide falls back to the phone's own voice,
or shows the words on screen if the phone has no voice for that language.
.mp3, .m4a, .ogg and .wav are accepted. Keep the files small (mono, 32-48 kbps mp3)
so the HTML stays under a few MB.
"""
import base64, json, re, sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
SRC = HERE / "goarena-intro.html"
OUT = HERE / "goarena-intro-with-voice.html"
SLIDES = 18
MIME = {".mp3": "audio/mpeg", ".m4a": "audio/mp4", ".ogg": "audio/ogg", ".wav": "audio/wav"}

def find(lang, n):
    for ext in MIME:
        p = HERE / "audio" / lang / f"{n:02d}{ext}"
        if p.exists():
            return p
    return None

audio, report = {}, []
for lang in ("en", "ml"):
    items = []
    for n in range(1, SLIDES + 1):
        p = find(lang, n)
        if p:
            items.append(f"data:{MIME[p.suffix]};base64," + base64.b64encode(p.read_bytes()).decode())
        else:
            items.append("")
            report.append(f"{lang}/{n:02d}")
    audio[lang] = items

html = SRC.read_text(encoding="utf-8")
new, count = re.subn(r"/\*AUDIO_START\*/.*?/\*AUDIO_END\*/",
                     lambda _m: "/*AUDIO_START*/" + json.dumps(audio) + "/*AUDIO_END*/",
                     html, flags=re.S)
if count != 1:
    sys.exit("Could not find the AUDIO marker in the HTML.")
OUT.write_text(new, encoding="utf-8")
print(f"Wrote {OUT.name} ({OUT.stat().st_size/1_000_000:.1f} MB)")
print("Missing audio (will use phone voice or on-screen words):", ", ".join(report) if report else "none")
