"""Time a reel's captions to its narration.

Reads research/ig-reels/<slug>.json (hand-written: title, cards, hologram focus,
caption fixes), the article narration research/narration/<slug>.txt and its
voiced audio research/audio/<slug>.mp3 (Fahed, made by tools/narrate.py).
Writes the "lines" of the reel back into the same json: every spoken phrase
with its start and end in seconds, found from the pauses in the audio, and
each word's time inside it, shared out by its length.

    python tools/ig-reel.py cell
then render with: node tools/render-ig-reel.mjs cell
"""
import json, pathlib, re, subprocess, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
slug = sys.argv[1]
cfg_path = ROOT / "research" / "ig-reels" / f"{slug}.json"
cfg = json.loads(cfg_path.read_text(encoding="utf-8"))
mp3 = ROOT / "research" / "audio" / f"{slug}.mp3"
text = (ROOT / "research" / "narration" / f"{slug}.txt").read_text(encoding="utf-8")

TASHKEEL = re.compile("[ً-ْٰـ]")
plain = TASHKEEL.sub("", text)
for a, b in cfg.get("fix", {}).items():
    plain = plain.replace(a, b)
phrases = [p.strip() for p in re.split(r"[،.؟!:\n]+", plain) if p.strip()]

# speech runs between pauses of a quarter second or more
log = subprocess.run(["ffmpeg", "-hide_banner", "-i", str(mp3), "-af", "silencedetect=noise=-35dB:d=0.25", "-f", "null", "-"],
                     capture_output=True, text=True).stderr
dur = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(mp3)],
                           capture_output=True, text=True).stdout)
starts = [float(x) for x in re.findall(r"silence_start: ([\d.]+)", log)]
ends = [float(x) for x in re.findall(r"silence_end: ([\d.]+)", log)]
runs, t = [], 0.0
for s, e in zip(starts, ends + [dur]):
    if s - t > 0.05: runs.append([t, s])
    t = e
if dur - t > 0.05: runs.append([t, dur])

# The voice also pauses inside some phrases (around quotes, before a number), so give each
# phrase a group of consecutive runs, picking the grouping whose durations best match the
# phrase lengths. With fewer runs than phrases, share the speech out by phrase length.
if len(runs) > len(phrases):
    P, R = len(phrases), len(runs)
    speech = sum(b - a for a, b in runs); chars = sum(len(p) for p in phrases)
    INF = float("inf"); cost = [[INF] * (R + 1) for _ in range(P + 1)]; back = [[0] * (R + 1) for _ in range(P + 1)]
    cost[0][0] = 0
    for i in range(1, P + 1):
        for j in range(i, R + 1):
            for k in range(i - 1, j):
                d = sum(b - a for a, b in runs[k:j]) / speech - len(phrases[i - 1]) / chars
                if cost[i - 1][k] + d * d < cost[i][j]: cost[i][j], back[i][j] = cost[i - 1][k] + d * d, k
    groups, j = [], R
    for i in range(P, 0, -1):
        k = back[i][j]; groups.append([runs[k][0], runs[j - 1][1]]); j = k
    runs = groups[::-1]
elif len(runs) < len(phrases):
    print(f"warning: {len(phrases)} phrases but {len(runs)} speech runs, timing by length")
    a, b = runs[0][0], runs[-1][1]
    total = sum(len(p) for p in phrases); runs, t = [], a
    for p in phrases:
        d = (b - a) * len(p) / total; runs.append([t, t + d]); t += d

lines = []
for p, (a, b) in zip(phrases, runs):
    words = p.split()
    total = sum(len(w) + 1 for w in words); t, ws = a, []
    for w in words:
        ws.append({"w": w, "t": round(t, 3)}); t += (b - a) * (len(w) + 1) / total
    lines.append({"a": round(a, 3), "b": round(b, 3), "words": ws})

cfg["duration"] = round(dur, 3)
cfg["lines"] = lines
cfg_path.write_text(json.dumps(cfg, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
print(f"{slug}: {len(lines)} lines, {dur:.1f}s")
