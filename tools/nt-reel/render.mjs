// Render a neurotransmitter reel to tools/nt-reel/out/<slug>.mp4 (1080x1920, 30 fps, H.264 + AAC).
//   python tools/nt-reel/build.py gaba && node tools/nt-reel/render.mjs gaba [--stills 3,12,30]
// reel.html is stepped one frame at a time with reel.seek(t), so pictures land exactly on the narration.
import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { extname, join } from 'node:path';
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');

const HERE = new URL('.', import.meta.url).pathname, slug = process.argv[2], FPS = 30;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.ttf': 'font/ttf' };
const server = createServer(async (req, res) => {
  try { const p = join(HERE, decodeURIComponent(new URL(req.url, 'http://x').pathname)); res.writeHead(200, { 'content-type': TYPES[extname(p)] || 'application/octet-stream' }); res.end(await readFile(p)); }
  catch { res.writeHead(404); res.end(); }
}).listen(0);
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 540, height: 960 }, deviceScaleFactor: 2 });
page.on('pageerror', e => console.error('page:', e.message));
await page.goto(`http://127.0.0.1:${server.address().port}/reel.html?${slug}`);
await page.waitForFunction(() => document.body.dataset.ready, null, { timeout: 60000 });
const cdp = await page.context().newCDPSession(page);
const shot = async () => Buffer.from((await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 94, clip: { x: 0, y: 0, width: 540, height: 960, scale: 2 } })).data, 'base64');
const frames = Math.ceil(await page.evaluate(() => reel.duration) * FPS), lead = Math.round(await page.evaluate(() => reel.lead) * 1000);

const si = process.argv.indexOf('--stills');
if (si > 0) {
  const want = process.argv[si + 1].split(',').map(Number);
  for (let f = 0; f <= Math.max(...want) * FPS; f++) {
    await page.evaluate(t => reel.seek(t), f / FPS);
    if (want.includes(f / FPS)) await writeFile(join(HERE, `out/${slug}-${f / FPS}s.jpg`), await shot());
  }
  await browser.close(); server.close(); process.exit(0);
}

const out = join(HERE, `out/${slug}.mp4`);
const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-i', '-',
  '-i', join(HERE, `out/${slug}-voice.wav`), '-i', join(HERE, `out/${slug}-sfx.wav`),
  '-filter_complex', `[1:a]adelay=${lead}:all=1[v];[2:a]adelay=${lead}:all=1[x];[v][x]amix=inputs=2:duration=first:normalize=0,alimiter=limit=0.95,apad[a]`, '-map', '0:v', '-map', '[a]', '-t', String(frames / FPS),
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '20', '-maxrate', '4M', '-bufsize', '8M', '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-r', String(FPS),
  '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-movflags', '+faststart', out], { stdio: ['pipe', 'inherit', 'inherit'] });
const done = new Promise((ok, no) => ff.on('close', c => c ? no(new Error('ffmpeg ' + c)) : ok()));
for (let f = 0; f < frames; f++) {
  await page.evaluate(t => reel.seek(t), f / FPS);
  const png = await shot();
  if (f === Math.round(lead / 1000 * FPS * .85)) await writeFile(join(HERE, `out/${slug}-cover.jpg`), png); // the cover card, for the post
  if (!ff.stdin.write(png)) await new Promise(r => ff.stdin.once('drain', r));
  if (f % 300 === 0) console.log(`${slug}: frame ${f}/${frames}`);
}
ff.stdin.end(); await done; await browser.close(); server.close();
console.log('wrote', out);
