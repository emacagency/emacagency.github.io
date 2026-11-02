"""Voice research articles.

Reads research/narration/<slug>.txt (Arabic text with tashkeel) and writes
research/audio/<slug>.mp3. Only files whose text changed are re-voiced; the
hash of each voiced text is kept in research/audio/.hashes.json.

With ELEVENLABS_API_KEY and ELEVENLABS_VOICE_ID set, it uses ElevenLabs.
Otherwise it uses Microsoft's free neural voices through edge-tts
(EDGE_VOICE, default ar-KW-FahedNeural), which need no account.
"""
import asyncio, hashlib, json, os, pathlib, urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "research" / "narration"
OUT = ROOT / "research" / "audio"
HASHES = OUT / ".hashes.json"

key = os.environ.get("ELEVENLABS_API_KEY")
voice = os.environ.get("ELEVENLABS_VOICE_ID")
if key and voice:
    engine = "elevenlabs"
else:
    engine, voice = "edge", os.environ.get("EDGE_VOICE") or "ar-KW-FahedNeural"
print("engine:", engine, "voice:", voice)


def elevenlabs(text, mp3):
    body = json.dumps({
        "text": text,
        "model_id": "eleven_multilingual_v2",
        "voice_settings": {"stability": 0.47, "similarity_boost": 0.75, "style": 0.2, "use_speaker_boost": True},
    }).encode()
    req = urllib.request.Request(
        f"https://api.elevenlabs.io/v1/text-to-speech/{voice}?output_format=mp3_44100_128",
        data=body, headers={"xi-api-key": key, "Content-Type": "application/json", "Accept": "audio/mpeg"})
    with urllib.request.urlopen(req, timeout=300) as r:
        mp3.write_bytes(r.read())


def edge(text, mp3, v=None, rate="+6%", pitch="+3Hz"):
    """Voice text and keep word timings next to the mp3 (<slug>.words.json)."""
    import edge_tts

    async def run():
        words = []
        with open(mp3, "wb") as f:
            async for c in edge_tts.Communicate(text, v or voice, rate=rate, pitch=pitch,
                                                boundary="WordBoundary").stream():
                if c["type"] == "audio":
                    f.write(c["data"])
                elif c["type"] == "WordBoundary":
                    words.append({"t": c["offset"] / 1e7, "d": c["duration"] / 1e7, "w": c["text"]})
        mp3.with_suffix(".words.json").write_text(json.dumps(words, ensure_ascii=False, indent=1) + "\n")

    asyncio.run(run())


def override(txt):
    """Optional <slug>.voice next to the text: "<voice> [rate] [pitch]" for that file only."""
    f = txt.with_suffix(".voice")
    return f.read_text().split() if f.exists() else []


OUT.mkdir(parents=True, exist_ok=True)
done = json.loads(HASHES.read_text()) if HASHES.exists() else {}
force = os.environ.get("FORCE") == "true"

for txt in sorted(SRC.glob("*.txt")):
    text = txt.read_text(encoding="utf-8").strip()
    over = override(txt) if engine == "edge" else []
    digest = hashlib.sha256((engine + voice + " ".join(over) + text).encode()).hexdigest()
    mp3 = OUT / (txt.stem + ".mp3")
    if not force and done.get(txt.stem) == digest and mp3.exists():
        print("unchanged:", txt.stem)
        continue
    if engine == "elevenlabs":
        elevenlabs(text, mp3)
    else:
        edge(text, mp3, *over)
    done[txt.stem] = digest
    print("voiced:", txt.stem, mp3.stat().st_size, "bytes")

HASHES.write_text(json.dumps(done, indent=2) + "\n")
