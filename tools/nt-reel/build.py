"""Prepare one neurotransmitter reel: trim long pauses from Fahed's narration and time the captions.

    python tools/nt-reel/build.py gaba
reads research/narration/reel-gaba.txt, research/audio/reel-gaba.mp3 and tools/nt-reel/gaba.beats.json,
writes tools/nt-reel/out/gaba-voice.m4a and tools/nt-reel/gaba.json (beats + caption lines) for reel.html.
"""
import json, pathlib, re, subprocess, sys

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parent.parent
slug = sys.argv[1]
cfg = json.loads((HERE / f"{slug}.beats.json").read_text(encoding="utf-8"))
text = (ROOT / "research" / "narration" / f"reel-{slug}.txt").read_text(encoding="utf-8")
(HERE / "out").mkdir(exist_ok=True)
voice = HERE / "out" / f"{slug}-voice.wav"

# pauses longer than ~0.15 s are cut down to about a quarter second; the voice itself is untouched
subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(ROOT / "research" / "audio" / f"reel-{slug}.mp3"), "-af",
                "silenceremove=start_periods=1:start_threshold=-45dB:stop_periods=-1:stop_duration=0.15:stop_threshold=-45dB:stop_silence=0.08,"
                "areverse,silenceremove=start_periods=1:start_threshold=-45dB,areverse,apad=pad_dur=0.6", "-ar", "48000", str(voice)], check=True)

TASHKEEL = re.compile("[ً-ْٰـ]")
plain = TASHKEEL.sub("", text).replace("ٰ", "ا")
for a, b in cfg.get("fix", {}).items():
    plain = plain.replace(a, b)
phrases = [p.strip() for p in re.split(r"[،.؟!:\n]+", plain) if p.strip()]

dur = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(voice)],
                           capture_output=True, text=True).stdout) - 0.6

def speech_runs(noise, d):
    log = subprocess.run(["ffmpeg", "-hide_banner", "-i", str(voice), "-af", f"silencedetect=noise={noise}dB:d={d}", "-f", "null", "-"],
                         capture_output=True, text=True).stderr
    starts = [float(x) for x in re.findall(r"silence_start: ([\d.]+)", log)]
    ends = [float(x) for x in re.findall(r"silence_end: ([\d.]+)", log)]
    runs, t = [], 0.0
    for s, e in zip(starts, ends + [dur]):
        if s - t > 0.05: runs.append([t, min(s, dur)])
        t = e
    if dur - t > 0.05: runs.append([t, dur])
    return runs

# some commas are spoken without a pause: listen for shorter and shallower dips until every phrase has one
for noise, d in [(-40, .15), (-35, .1), (-30, .07), (-26, .05)]:
    runs = speech_runs(noise, d)
    if len(runs) >= len(phrases): break
while len(runs) < len(phrases):
    i = max(range(len(runs)), key=lambda i: runs[i][1] - runs[i][0]); a, b = runs[i]
    runs[i:i + 1] = [[a, (a + b) / 2], [(a + b) / 2, b]]

# give each phrase a group of consecutive speech runs whose length best matches the phrase length
P, Rn = len(phrases), len(runs)
speech = sum(b - a for a, b in runs); chars = sum(len(p) for p in phrases)
INF = float("inf"); cost = [[INF] * (Rn + 1) for _ in range(P + 1)]; back = [[0] * (Rn + 1) for _ in range(P + 1)]
cost[0][0] = 0
for i in range(1, P + 1):
    for j in range(i, Rn + 1):
        for k in range(i - 1, j):
            d = sum(b - a for a, b in runs[k:j]) / speech - len(phrases[i - 1]) / chars
            if cost[i - 1][k] + d * d < cost[i][j]: cost[i][j], back[i][j] = cost[i - 1][k] + d * d, k
groups, j = [], Rn
for i in range(P, 0, -1):
    k = back[i][j]; groups.append(runs[k:j]); j = k
groups.reverse()

lines = []
for p, g in zip(phrases, groups):
    words = p.split(); total = sum(len(w) + 1 for w in words)
    # spread words over the speech in this group, skipping its inner pauses
    span = sum(b - a for a, b in g); ws, acc = [], 0.0
    for w in words:
        x = acc / total * span
        for a, b in g:
            if x <= b - a: ws.append({"w": w, "t": round(a + x, 3)}); break
            x -= b - a
        acc += len(w) + 1
    lines.append({"a": round(g[0][0], 3), "b": round(g[-1][1], 3), "words": ws})

cfg["duration"] = round(dur, 3); cfg["lines"] = lines
(HERE / f"{slug}.json").write_text(json.dumps(cfg, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
print(f"{slug}: {len(lines)} lines from {Rn} runs, {dur:.1f}s")
for i, l in enumerate(lines): print(i, l["a"], " ".join(w["w"] for w in l["words"]))

# light sound effects on the visual events, no music: a sweep at the start, a whoosh on each scene
# change, a chirp when labels appear and a shimmer when a part lights up red
import numpy as np
SR = 48000
n = int((dur + 1) * SR); mix = np.zeros(n)
rng = np.random.default_rng(3)
def put(t, x, gain):
    i = int(max(0, t) * SR); x = x[: max(0, n - i)]; mix[i:i + len(x)] += x * gain
def env(m, a, r):
    k = np.arange(m) / SR; return np.minimum(1, k / a) * np.exp(-k / r)
def whoosh(L=.7):
    m = int(L * SR); w = rng.standard_normal(m); f = np.fft.rfft(w); fr = np.fft.rfftfreq(m, 1 / SR)
    w = np.fft.irfft(f * np.exp(-((fr - 1800) / 1400) ** 2), m); w /= np.abs(w).max()
    return w * np.sin(np.pi * np.arange(m) / m) ** 2
def chirp(f0=1400, f1=2600, L=.14):
    k = np.arange(int(L * SR)) / SR; ph = 2 * np.pi * (f0 * k + (f1 - f0) * k * k / (2 * L)); return np.sin(ph) * env(len(k), .005, .05)
def shimmer(L=1.1):
    k = np.arange(int(L * SR)) / SR; x = sum(np.sin(2 * np.pi * f * k + i) for i, f in enumerate([2093, 2637, 3136, 3951]))
    return x / 4 * env(len(k), .02, .35) * (1 + .3 * np.sin(2 * np.pi * 9 * k))
def sweep(L=1.4):
    k = np.arange(int(L * SR)) / SR; f = 180 + 900 * (k / L) ** 2; return np.sin(2 * np.pi * np.cumsum(f) / SR) * env(len(k), .3, .6)
put(0, sweep(), .12)
prev = {"scene": "brain", "labels": [], "hot": []}
for b in cfg["beats"]:
    t = lines[b["at"]]["a"] - .2 if "at" in b else b["t"]
    if b.get("scene") and b["scene"] != prev["scene"]: put(t - .35, whoosh(), .16); prev["scene"] = b["scene"]
    if set(b.get("labels", [])) - set(prev["labels"]): put(t + .05, chirp(), .07)
    if set(b.get("hot", [])) - set(prev["hot"]): put(t + .1, shimmer(), .06)
    prev["labels"], prev["hot"] = b.get("labels", []), b.get("hot", [])
import wave
pcm = (np.clip(mix, -1, 1) * 32767).astype("<i2")
with wave.open(str(HERE / "out" / f"{slug}-sfx.wav"), "wb") as w:
    w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
