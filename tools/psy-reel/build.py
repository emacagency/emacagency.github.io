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

# Fahed's word timings (words.json) drive everything: long pauses are cut to a short breath
# (a little longer at the end of a sentence) and every caption word keeps its exact spoken time
import numpy as np, wave
raw = HERE / "out" / f"{slug}-raw.wav"
subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(ROOT / "research" / "audio" / f"reel-{slug}.mp3"), "-ac", "1", "-ar", "48000", str(raw)], check=True)
with wave.open(str(raw)) as w: SR0 = w.getframerate(); a = np.frombuffer(w.readframes(w.getnframes()), np.int16).astype(np.float32) / 32768
W = json.loads((ROOT / "research" / "audio" / f"reel-{slug}.words.json").read_text(encoding="utf-8"))
toks = text.split(); assert len(toks) == len(W), (len(toks), len(W))
hop = SR0 // 100; n = len(a) // hop
db = 20 * np.log10(np.sqrt(np.mean(a[:n * hop].reshape(n, hop) ** 2, axis=1)) + 1e-9); sil = db < -42
runs, i = [], 0
while i < n:
    if sil[i]:
        j = i
        while j < n and sil[j]: j += 1
        runs.append((i / 100, j / 100)); i = j
    else: i += 1
def keep_for(s):
    k = max([i for i, x in enumerate(W) if x["t"] <= s] or [0])
    return cfg.get("pause", {}).get(str(k), .3 if re.search("[.!؟]$", toks[k]) else .2 if re.search("[،:…]$", toks[k]) else .12)
mapping, out, newt, cur = [], [], 0.0, 0.0
for s, e in runs:
    keep = keep_for(s) if s > .05 else 0
    if e - s <= keep + .02: continue
    a1, a2 = (s + keep / 2, e - keep / 2) if s > .05 else (s, e)
    mapping.append((cur, a1, newt)); out.append(a[int(cur * SR0):int(a1 * SR0)]); newt += a1 - cur; cur = a2
mapping.append((cur, len(a) / SR0, newt)); out.append(a[int(cur * SR0):])
def m(t):
    for o0, o1, n0 in mapping:
        if t <= o1: return n0 + max(0, t - o0)
    return newt
y = np.concatenate(out + [np.zeros(int(.6 * SR0), np.float32)])
with wave.open(str(voice), "w") as o:
    o.setnchannels(1); o.setsampwidth(2); o.setframerate(SR0); o.writeframes((np.clip(y, -1, 1) * 32767).astype(np.int16).tobytes())
dur = len(y) / SR0 - .6
TASHKEEL = re.compile("[\u064B-\u0652\u0670\u0640]")
lines, cur_line = [], []
for tok, x in zip(toks, W):
    word = TASHKEEL.sub("", tok).strip("،.؟!:…")
    for a_, b_ in cfg.get("fix", {}).items(): word = word.replace(a_, b_)
    cur_line.append({"w": word, "t": round(m(x["t"]), 3), "e": round(m(x["t"] + x["d"]), 3)})
    if re.search("[،.؟!:]$", tok):
        lines.append({"a": cur_line[0]["t"], "b": cur_line[-1]["e"], "words": [{"w": q["w"], "t": q["t"]} for q in cur_line]}); cur_line = []
if cur_line: lines.append({"a": cur_line[0]["t"], "b": cur_line[-1]["e"], "words": [{"w": q["w"], "t": q["t"]} for q in cur_line]})
Rn = len(lines)
cfg["duration"] = round(dur, 3); cfg["lines"] = lines
(HERE / f"{slug}.json").write_text(json.dumps(cfg, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
print(f"{slug}: {len(lines)} lines from {Rn} runs, {dur:.1f}s")
for i, l in enumerate(lines): print(i, l["a"], " ".join(w["w"] for w in l["words"]))

# light sound effects on the visual events, no music: a sweep at the start, a whoosh on each scene
# change, a chirp when labels appear and a shimmer when a part lights up red
import numpy as np
SR = 48000
n = int((dur + 1 + cfg.get("outro", 0)) * SR); mix = np.zeros(n)
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
    if b.get("chart") and b["chart"] != prev.get("chart"):
        put(t - .1, sweep(.9), .08)
        ch = cfg.get("charts", {}).get(b["chart"], {})
        if ch.get("type") == "table":  # a pop for each cell as it lands
            for r in ch["rows"]:
                for c in r["cells"]:
                    if c and c.get("t", 0) > .05: put(t + c["t"], chirp(900 if c["dir"] == "down" else 1500, 600 if c["dir"] == "down" else 2400, .09), .09)
        elif ch.get("type") in ("curve", "bars", "count", "dual"):
            for k in range(16): put(t + .3 + k * .1, chirp(2200 + 60 * k, 2400 + 60 * k, .04), .035)
    prev["chart"] = b.get("chart")
    prev["labels"], prev["hot"] = b.get("labels", []), b.get("hot", [])
# heartbeat thumps that follow the on-screen heart (same smoothing as reel.html, one step per frame)
if any("hr" in b for b in cfg["beats"]):
    def thump():
        k = np.arange(int(.18 * SR)) / SR; return np.sin(2 * np.pi * (48 + 30 * np.exp(-k / .03)) * k) * env(len(k), .004, .05)
    bt = [(lines[b["at"]]["a"] - .2 if "at" in b else b["t"], b) for b in cfg["beats"]]
    hr, ph, t_end = 70.0, 0.0, lines[-1]["b"] + .35
    for f in range(int(t_end * 30)):
        t = f / 30; cur = [b for t0, b in bt if t0 <= t]; b = cur[-1] if cur else {}
        if b.get("scene", "brain") != "kid": continue
        hr += (b.get("hr", 70) - hr) * .06; p0 = ph; ph += hr / 60 / 30
        for q, g in ((.08, .5), (.26, .3)):
            if int(p0 - q) != int(ph - q) or (p0 - q) // 1 != (ph - q) // 1: put(t, thump(), g)
# sounds for the new pieces: prison bars, red flash, name card, chain, answer cards, people grid
def wordT(li, w):
    L = lines[li]["words"]; return next((x["t"] for x in L if w in x["w"]), L[0]["t"])
def clank():
    k = np.arange(int(.9 * SR)) / SR
    return (np.sin(2 * np.pi * 70 * k) * env(len(k), .002, .08) + .5 * sum(np.sin(2 * np.pi * f * k) for f in (523, 1187, 1913)) / 3 * env(len(k), .002, .25))
def boom():
    k = np.arange(int(.8 * SR)) / SR; return np.sin(2 * np.pi * (40 + 60 * np.exp(-k / .05)) * k) * env(len(k), .003, .22)
def buzz():
    k = np.arange(int(.35 * SR)) / SR; f = 420 - 260 * k / .35; return np.sign(np.sin(2 * np.pi * np.cumsum(f) / SR)) * env(len(k), .005, .12) * .5
on = {"bars": False, "title": False}
for b in cfg["beats"]:
    t = lines[b["at"]]["a"] - .2 + b.get("dt", 0) if "at" in b else b["t"]
    if "bars" in b and b["bars"] != on["bars"]:
        if b["bars"]: [put(t + .38 + d, clank(), .16 * g) for d, g in ((0, 1), (.09, .5))]
        else: put(t - .1, whoosh(.6), .14)
        on["bars"] = b["bars"]
    if "title" in b and b["title"] != on["title"]:
        if b["title"]: put(t - .1, sweep(.8), .1); put(t + .15, shimmer(1.4), .08)
        on["title"] = b["title"]
    if b.get("flash"): put(t, boom(), .22)
    ch = cfg.get("charts", {}).get(b.get("chart") or "", {})
    if ch.get("type") == "chain":
        for nd in ch["nodes"]: put(wordT(*nd["at"]) - .12, chirp(1100, 2000, .1), .09)
    if ch.get("type") == "options":
        for cd in ch["cards"]:
            put(wordT(*cd["at"]) - .12, chirp(900, 1500, .08), .1)
            if cd.get("x"): put(wordT(*cd["x"]), buzz(), .07)
            if cd.get("win"): put(wordT(*cd["at"]), shimmer(1.2), .1)
    if ch.get("type") == "grid100":
        for k in range(8): put(t + .2 + .5 + k * .16, chirp(1800, 1200, .05), .08)
if cfg.get("ask"):  # the comment card slides in and types itself
    a0 = lines[cfg["ask"]["at"]]["a"] - .1; put(a0 - .2, whoosh(.5), .1)
    for k in range(0, len(cfg["ask"]["text"]), 3): put(a0 + k / 28, chirp(3000, 2800, .02), .03)
if cfg.get("outro"):
    t_out = lines[-1]["b"] + .35
    put(t_out - .3, whoosh(.8), .16); put(t_out + .1, shimmer(1.6), .09)
import wave
pcm = (np.clip(mix, -1, 1) * 32767).astype("<i2")
with wave.open(str(HERE / "out" / f"{slug}-sfx.wav"), "wb") as w:
    w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
