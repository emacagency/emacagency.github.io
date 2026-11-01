// node render.mjs [stills t1,t2,...]  -> frames to ffmpeg (video only) or preview stills
import { createRequire } from 'module';
const { chromium } = createRequire(import.meta.url)('playwright');
import fs from 'fs';
import { spawn } from 'child_process';
const dir = new URL('.', import.meta.url).pathname;
const timing = JSON.parse(fs.readFileSync(dir + 'timing.json', 'utf8'));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
page.on('console', m => console.log('page:', m.text()));
page.on('pageerror', e => console.log('ERR', e.message));
await page.goto('file://' + dir + 'reel.html');
await page.evaluate(t => window.setup(t), timing);
const b64 = s => Buffer.from(s.split(',')[1], 'base64');
if (process.argv[2] === 'stills') {
  for (const t of process.argv[3].split(',').map(Number)) {
    fs.writeFileSync(`${dir}still-${t}.jpg`, b64(await page.evaluate(t => window.frame(t), t)));
  }
  fs.writeFileSync(dir + 'cover.jpg', b64(await page.evaluate(() => window.cover())));
} else {
  const FPS = 30, dur = timing.lines[8].e + 2.4, n = Math.ceil(dur * FPS);
  const ff = spawn('ffmpeg', ['-v', 'error', '-y', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'slow', '-crf', '19', '-r', String(FPS), dir + 'video.mp4'], { stdio: ['pipe', 'inherit', 'inherit'] });
  for (let i = 0; i < n; i++) {
    const buf = b64(await page.evaluate(t => window.frame(t), i / FPS));
    if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
    if (i % 150 === 0) console.log('frame', i, '/', n);
  }
  ff.stdin.end(); await new Promise(r => ff.on('close', r));
  console.log('duration', dur);
}
await browser.close();
