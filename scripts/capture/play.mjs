import { chromium } from 'playwright';
import fs from 'node:fs';
import { spawn } from 'node:child_process';

const out = process.env.CAPTURE_DIR || 'work/capture';
fs.mkdirSync(out, { recursive: true });
const log = [];
const record = (s) => {
  const line = `${new Date().toISOString()} ${s}`;
  log.push(line);
  console.log(line);
};
let recorder;
let browser;
let videoPath;
try {
  const display = process.env.DISPLAY || ':99.0';
  recorder = spawn('ffmpeg', [
    '-y', '-thread_queue_size', '1024', '-f', 'x11grab', '-video_size', '1280x720', '-framerate', '30', '-i', display,
    '-thread_queue_size', '1024', '-f', 'pulse', '-i', 'IsaacCapture.monitor', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '128k', `${out}/floor-one-original.mp4`,
  ], { stdio: ['ignore', 'ignore', fs.openSync(`${out}/ffmpeg.log`, 'w')] });
  await new Promise(r => setTimeout(r, 1500));
  browser = await chromium.launch({ headless: false, args: ['--enable-unsafe-swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  page.on('console', m => record(`CONSOLE ${m.type()}: ${m.text()}`));
  page.on('pageerror', e => record(`PAGEERROR ${e.stack || e.message}`));
  page.on('requestfailed', r => record(`REQUESTFAILED ${r.url()} ${r.failure()?.errorText}`));
  await page.goto('https://isaac.hllqk.cn/', { waitUntil: 'domcontentloaded', timeout: 120000 });
  record(`HOME ${await page.title()} ${await page.url()}`);
  await page.screenshot({ path: `${out}/home.png` });
  const start = page.locator('#start');
  await page.waitForFunction(() => {
    const button = document.querySelector('#start');
    return button && !button.disabled;
  }, undefined, { timeout: 300000 });
  record(`READY ${JSON.stringify(await page.evaluate(() => ({ status: document.querySelector('#status')?.textContent, stats: [...document.querySelectorAll('.stats strong')].map(x => x.textContent) })))}`);
  await start.click();
  record('START_CLICKED');
  const prepLog = setInterval(async () => {
    try { record(`PREP ${await page.locator('#status').textContent()} ${(await page.locator('#bar').getAttribute('style')) || ''}`); }
    catch { /* navigation */ }
  }, 15000);
  await page.waitForFunction(() => {
    const frame = document.querySelector('#game-frame');
    return frame && frame.getAttribute('src') && !document.querySelector('#game-player')?.hidden;
  }, undefined, { timeout: 1500000 });
  clearInterval(prepLog);
  const frame = page.frame({ url: /game\.html/ });
  if (!frame) throw new Error('Game iframe did not attach');
  await frame.waitForFunction(() => (window.isaacFrame || 0) > 120 && (!!document.getElementById('overlay')?.hidden || !document.getElementById('overlay')), undefined, { timeout: 600000 }).catch(async () => {
    await frame.waitForFunction(() => (window.isaacFrame || 0) > 120, undefined, { timeout: 120000 });
  });
  record(`BOOT ${JSON.stringify(await frame.evaluate(() => ({ url: location.href, frame: window.isaacFrame, overlayHidden: document.getElementById('overlay')?.hidden, mode: document.querySelector('#touch-controls')?.dataset.mode, globals: Object.keys(window).filter(k => /isaac|mod|save/i.test(k)).slice(0, 80) })))}`);
  await page.screenshot({ path: `${out}/boot.png` });
  // Advance the normal title/character screens by Enter; no game state is modified.
  for (let i = 0; i < 16; i++) {
    const mode = await frame.evaluate(() => document.querySelector('#touch-controls')?.dataset.mode || '');
    if (mode === 'game') break;
    await frame.evaluate(() => window.isaacInjectKey?.('enter', true, 'cloud-capture'));
    await frame.waitForTimeout(120);
    await frame.evaluate(() => window.isaacInjectKey?.('enter', false, 'cloud-capture'));
    await frame.waitForTimeout(350);
  }
  record(`PLAY ${JSON.stringify(await frame.evaluate(() => ({ frame: window.isaacFrame, mode: document.querySelector('#touch-controls')?.dataset.mode, run: (() => { try { const G=window.isaacGuest,g=G.u32(0xc71678); return {game:!!g, gameFrame:G.u32(g+0x264f8), paused:G.u32(g+0x23a74)}; } catch { return null; } })() })))}`);
  await page.screenshot({ path: `${out}/play-start.png` });
  const pattern = [
    ['w', 'ArrowDown'], ['d', 'ArrowLeft'], ['s', 'ArrowUp'], ['a', 'ArrowRight'],
    ['w', 'ArrowRight'], ['d', 'ArrowDown'], ['s', 'ArrowLeft'], ['a', 'ArrowUp'],
  ];
  const stopAt = Date.now() + Number(process.env.PLAY_MS || 120000);
  let turn = 0;
  while (Date.now() < stopAt) {
    const [move, fire] = pattern[turn++ % pattern.length];
    const mode = await frame.evaluate(() => document.querySelector('#touch-controls')?.dataset.mode || '');
    if (mode !== 'game') {
      await frame.evaluate(() => window.isaacInjectKey?.('enter', true, 'cloud-capture'));
      await page.waitForTimeout(200);
      await frame.evaluate(() => window.isaacInjectKey?.('enter', false, 'cloud-capture'));
    } else {
      await frame.evaluate(([m, f]) => { window.isaacInjectKey?.(m, true, 'cloud-capture'); window.isaacInjectKey?.(f.toLowerCase(), true, 'cloud-capture'); }, [move, fire]);
      await page.waitForTimeout(750);
      await frame.evaluate(([m, f]) => { window.isaacInjectKey?.(m, false, 'cloud-capture'); window.isaacInjectKey?.(f.toLowerCase(), false, 'cloud-capture'); }, [move, fire]);
    }
    if (turn % 8 === 0) {
      const state = await frame.evaluate(() => {
        try {
          const G=window.isaacGuest,g=G.u32(0xc71678), room=G.u32(g+0x18300), begin=G.u32(g+0x1baa8), end=G.u32(g+0x1baac);
          const entities=[]; for(let p=begin;p<end&&p<begin+512;p+=4){const e=G.u32(p);if(e)entities.push([G.u32(e+0x28),G.u32(e+0x2c),G.u32(e+0x30)]);}
          return {mode:document.querySelector('#touch-controls')?.dataset.mode, frame:G.u32(g+0x264f8), paused:G.u32(g+0x23a74), room:room&&[G.u32(room+0xc),G.u32(room+0x10)], entities:entities.slice(0,40)};
        } catch(e) { return {error:String(e)}; }
      });
      record(`STATE ${JSON.stringify(state)}`);
      await page.screenshot({ path: `${out}/state-${String(turn).padStart(4,'0')}.png` });
    }
  }
  await frame.evaluate(() => { for (const k of ['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright']) window.isaacInjectKey?.(k, false, 'cloud-capture'); });
  record('PROBE_COMPLETE');
  await page.screenshot({ path: `${out}/probe-end.png` });
  fs.writeFileSync(`${out}/run.log`, log.join('\n') + '\n');
  await browser.close();
  browser = null;
} catch (e) {
  record(`FATAL ${e.stack || e.message}`);
  fs.writeFileSync(`${out}/run.log`, log.join('\n') + '\n');
  if (browser) await browser.close().catch(() => {});
  process.exitCode = 1;
} finally {
  if (recorder?.pid) {
    recorder.kill('SIGINT');
    await new Promise(r => recorder.once('exit', r));
  }
}
