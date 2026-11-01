# Kinetic-type reel (imposter syndrome)

1. Voice: `research/narration/reel-imposter.txt` (+ `.voice`) → CI writes `research/audio/reel-imposter.mp3` and `.words.json`.
2. `python3 tighten.py` shortens long silences and remaps word times (`voice_tight.wav`, `words_tight.json`), then build `timing.json` (words + line spans).
3. `node render.mjs stills 2,10` previews frames; `node render.mjs` renders `video.mp4` (1080×1920, 30 fps).
4. `python3 mix.py` adds synthesized SFX and a soft pad under the voice → `mix.wav`; normalize to -14 LUFS and mux.

Fonts come from the npm packages `@fontsource/ibm-plex-sans-arabic` and `@fontsource/bebas-neue`, unpacked into `fonts/`.
