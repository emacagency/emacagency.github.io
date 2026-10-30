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


def edge(text, mp3):
    import edge_tts
    asyncio.run(edge_tts.Communicate(text, voice, rate="+6%", pitch="+3Hz").save(str(mp3)))


OUT.mkdir(parents=True, exist_ok=True)
done = json.loads(HASHES.read_text()) if HASHES.exists() else {}
force = os.environ.get("FORCE") == "true"

for txt in sorted(SRC.glob("*.txt")):
    text = txt.read_text(encoding="utf-8").strip()
    digest = hashlib.sha256((engine + voice + text).encode()).hexdigest()
    mp3 = OUT / (txt.stem + ".mp3")
    if not force and done.get(txt.stem) == digest and mp3.exists():
        print("unchanged:", txt.stem)
        continue
    (elevenlabs if engine == "elevenlabs" else edge)(text, mp3)
    done[txt.stem] = digest
    print("voiced:", txt.stem, mp3.stat().st_size, "bytes")

HASHES.write_text(json.dumps(done, indent=2) + "\n")
