// Render an Instagram reel (1080x1920, 30 fps, H.264 + AAC) from research/ig-reels/index.html?<slug>.
// The page is stepped frame by frame on a fake clock, so the hologram and captions land on the
// same frames as Fahed's narration whatever the machine's speed.
//
//   python tools/ig-reel.py cell && node tools/render-ig-reel.mjs cell   ->  research/ig-reels/out/cell.mp4
//
// Needs Playwright with Chromium, and ffmpeg. THREE_JS=<path to three.module.js> serves three.js
// from disk where the CDN is out of reach.
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { extname, join, resolve } from 'node:path';
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');

const ROOT = resolve(new URL('..', import.meta.url).pathname), slug = process.argv[2] || 'cell', FPS = 30;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg' };
const server = createServer(async (req, res) => {
  try { const p = join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname)); res.writeHead(200, { 'content-type': TYPES[extname(p)] || 'application/octet-stream' }); res.end(await readFile(p)); }
  catch { res.writeHead(404); res.end(); }
}).listen(0);
const port = server.address().port;

const proxy = process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY, bypass: '127.0.0.1' } : undefined;
const browser = await chromium.launch({ proxy, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 540, height: 960 }, deviceScaleFactor: 2, ignoreHTTPSErrors: !!proxy });
if (process.env.THREE_JS) await page.route(/three@[\d.]+\/build\/three\.module\.js/, async r => r.fulfill({ contentType: 'text/javascript', body: await readFile(process.env.THREE_JS) }));
page.on('pageerror', e => console.error('page:', e.message));
// same random scene on every render
await page.addInitScript(() => { let s = 7; Math.random = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646; });
await page.clock.install({ time: 0 });
await page.goto(`http://127.0.0.1:${port}/research/ig-reels/index.html?${slug}`);
for (let i = 0; !(await page.evaluate(() => document.body.dataset.ready && document.querySelector('.holo.live'))); i++) {
  if (i > 600) throw new Error('reel page did not get ready');
  await page.clock.runFor(50);
}
// Playwright's own screenshot waits for an animation frame, which never comes on the fake clock
const cdp = await page.context().newCDPSession(page);
const shot = async () => Buffer.from((await cdp.send('Page.captureScreenshot', { format: 'png' })).data, 'base64');
const duration = await page.evaluate(() => reel.duration), frames = Math.ceil(duration * FPS);

// --stills 2,20,31 saves those seconds as PNGs instead of a video, to check a layout quickly
const stills = process.argv.includes('--stills') ? process.argv[process.argv.indexOf('--stills') + 1].split(',').map(Number) : null;
if (stills) {
  await mkdir(join(ROOT, 'research/ig-reels/out'), { recursive: true });
  let at = 0;
  for (const s of stills) {
    await page.clock.fastForward(Math.max(0, s * 1000 - at)); at = s * 1000;
    await page.evaluate(t => reel.seek(t), s); await page.clock.runFor(1000 / FPS);
    await writeFile(join(ROOT, `research/ig-reels/out/${slug}-${s}s.png`), await shot());
  }
  await browser.close(); server.close(); process.exit(0);
}

await mkdir(join(ROOT, 'research/ig-reels/out'), { recursive: true });
const out = join(ROOT, `research/ig-reels/out/${slug}.mp4`);
const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-i', '-',
  '-i', join(ROOT, `research/audio/${slug}.mp3`), '-af', 'apad', '-t', String(frames / FPS),
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-r', String(FPS),
  '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-movflags', '+faststart', out], { stdio: ['pipe', 'inherit', 'inherit'] });
const done = new Promise((ok, no) => ff.on('close', c => c ? no(new Error('ffmpeg ' + c)) : ok()));

for (let f = 0; f < frames; f++) {
  await page.clock.runFor(1000 / FPS);
  await page.evaluate(t => reel.seek(t), f / FPS);
  const png = await shot();
  if (!ff.stdin.write(png)) await new Promise(r => ff.stdin.once('drain', r));
  if (f % 150 === 0) console.log(`${slug}: frame ${f}/${frames}`);
}
ff.stdin.end(); await done;
await browser.close(); server.close();
console.log('wrote', out);
