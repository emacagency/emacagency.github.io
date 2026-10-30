// Render a vertical 1080x1920 narrated reel for a research article.
//
//   node tools/make-reel.mjs cell [seconds-to-preview]
//
// Reads research/reels/<slug>.json (captions and hologram focus timed to the
// narration) and research/audio/<slug>.mp3, steps the article's hologram frame
// by frame in headless Chromium, and writes research/video/<slug>.mp4 plus a
// poster image. Needs playwright, ffmpeg and npm (for three.js and the font).
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');

const FPS = 25;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [slug, preview] = process.argv.slice(2);
const spec = JSON.parse(fs.readFileSync(path.join(ROOT, 'research/reels', `${slug}.json`), 'utf8'));
const audio = path.join(ROOT, spec.audio);
spec.duration = +execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', audio]);

const work = fs.mkdtempSync(path.join(os.tmpdir(), 'reel-'));
const site = path.join(work, 'site');
fs.cpSync(path.join(ROOT, 'research'), site, { recursive: true, filter: s => !/research\/(audio|video)(\/|$)/.test(s) });
fs.copyFileSync(path.join(ROOT, 'tools/reel/reel.html'), path.join(site, 'reel.html'));
fs.writeFileSync(path.join(site, 'reel.json'), JSON.stringify(spec));
execFileSync('npm', ['pack', 'three@0.165.0', '@fontsource/ibm-plex-sans-arabic@5.0.20', '--silent'], { cwd: work, stdio: 'ignore' });
for (const tgz of fs.readdirSync(work).filter(f => f.endsWith('.tgz'))) {
  const dir = path.join(work, tgz.slice(0, -4)); fs.mkdirSync(dir);
  execFileSync('tar', ['xzf', path.join(work, tgz), '-C', dir]);
}
const pkg = name => path.join(work, fs.readdirSync(work).find(f => f.startsWith(name) && !f.endsWith('.tgz')), 'package');
fs.copyFileSync(path.join(pkg('three-'), 'build/three.module.js'), path.join(site, 'three.module.js'));
fs.mkdirSync(path.join(site, 'fonts'));
for (const s of ['arabic', 'latin']) for (const w of [400, 600])
  fs.copyFileSync(path.join(pkg('fontsource-'), 'files', `ibm-plex-sans-arabic-${s}-${w}-normal.woff2`), path.join(site, 'fonts', `${s}-${w}.woff2`));

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.woff2': 'font/woff2', '.css': 'text/css' };
const server = http.createServer((req, res) => {
  const file = path.join(site, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!file.startsWith(site) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
}).listen(0, '127.0.0.1');
await new Promise(r => server.once('listening', r));

const frames = path.join(work, 'frames'); fs.mkdirSync(frames);
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
page.on('console', m => m.type() === 'error' && console.log('console:', m.text()));
page.on('pageerror', e => console.log('pageerror:', e.message));
await page.goto(`http://127.0.0.1:${server.address().port}/reel.html`);
await page.waitForFunction(() => window.__reel?.ready, null, { timeout: 60000 });
await page.evaluate(() => document.fonts.ready);
const n = preview ? Math.round(+preview * FPS) : Math.floor(spec.duration * FPS) + 1;
for (let i = 0; i < n; i++) {
  await page.evaluate(([ms, s]) => { __reel.advance(ms); __reel.render(s); __reel.flush(); }, [1000 / FPS, i / FPS]);
  await page.screenshot({ path: path.join(frames, `${String(i).padStart(5, '0')}.jpg`), type: 'jpeg', quality: 92 });
  if (i % 100 === 0) console.log(`frame ${i}/${n}`);
}
await browser.close(); server.close();

const out = path.join(ROOT, 'research/video'); fs.mkdirSync(out, { recursive: true });
const mp4 = path.join(out, `${slug}.mp4`);
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', path.join(frames, '%05d.jpg'), '-i', audio,
  '-c:v', 'libx264', '-preset', 'medium', '-crf', '22', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '160k',
  '-movflags', '+faststart', '-shortest', mp4]);
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', String(Math.min(12, n / FPS / 2)), '-i', mp4, '-frames:v', '1', '-q:v', '3', path.join(out, `${slug}.jpg`)]);
fs.rmSync(work, { recursive: true });
console.log('wrote', mp4, fs.statSync(mp4).size, 'bytes');
