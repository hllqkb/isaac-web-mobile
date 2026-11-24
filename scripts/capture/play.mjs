import { chromium } from 'playwright';
import fs from 'node:fs';
import { spawn } from 'node:child_process';

const out = process.env.CAPTURE_DIR || 'work/capture';
fs.mkdirSync(out, { recursive: true });
const lunaMod = String.raw`local mod = RegisterMod("Luna Floor Helper", 1)
Isaac.DebugString("LUNA_HELPER_READY")
local game = Game()
local held = {}
local controlled = {
  [ButtonAction.ACTION_LEFT]=true,[ButtonAction.ACTION_RIGHT]=true,
  [ButtonAction.ACTION_UP]=true,[ButtonAction.ACTION_DOWN]=true,
  [ButtonAction.ACTION_SHOOTLEFT]=true,[ButtonAction.ACTION_SHOOTRIGHT]=true,
  [ButtonAction.ACTION_SHOOTUP]=true,[ButtonAction.ACTION_SHOOTDOWN]=true,
}
local orbit = 1
local tick = 0
local currentRoom = -1
local currentStage = -1
local function setAction(action, down) held[action] = down and true or false end
local function aim(delta)
  if math.abs(delta.X) >= math.abs(delta.Y) then
    if delta.X < 0 then setAction(ButtonAction.ACTION_SHOOTLEFT,true) else setAction(ButtonAction.ACTION_SHOOTRIGHT,true) end
  else
    if delta.Y < 0 then setAction(ButtonAction.ACTION_SHOOTUP,true) else setAction(ButtonAction.ACTION_SHOOTDOWN,true) end
  end
end
local function move(vector)
  setAction(ButtonAction.ACTION_LEFT,vector.X < -0.25)
  setAction(ButtonAction.ACTION_RIGHT,vector.X > 0.25)
  setAction(ButtonAction.ACTION_UP,vector.Y < -0.25)
  setAction(ButtonAction.ACTION_DOWN,vector.Y > 0.25)
end
local function unit(vector)
  local length = vector:Length()
  if length < 0.01 then return Vector(0,0) end
  return vector / length
end
local function logState()
  local level = game:GetLevel()
  local desc = level:GetCurrentRoomDesc()
  local index = desc and desc.GridIndex or -1
  local stage = level:GetStage()
  if stage ~= currentStage then
    currentStage = stage
    Isaac.DebugString("LUNA_STAGE:" .. tostring(stage))
  end
  if index ~= currentRoom then
    currentRoom = index
    local kind = desc and desc.Data and desc.Data.Type or -1
    Isaac.DebugString("LUNA_ROOM:" .. tostring(stage) .. ":" .. tostring(index) .. ":" .. tostring(kind))
  end
end
local function findTrapdoor(room)
  for index=0,room:GetGridSize()-1 do
    local grid = room:GetGridEntity(index)
    if grid and grid:GetType() == GridEntityType.GRID_TRAPDOOR then return grid.Position end
  end
end
local function selectDoor(room, level)
  local best, bestScore
  for slot=0,7 do
    local door = room:GetDoor(slot)
    if door and door:IsOpen() then
      local targetIndex = door.TargetRoomIndex
      local desc = level:GetRoomByIdx(targetIndex)
      if desc then
        local visited = desc.VisitedCount or 0
        local kind = desc.Data and desc.Data.Type or -1
        local boss = RoomType.ROOM_BOSS and kind == RoomType.ROOM_BOSS
        local score = (boss and 10000 or 0) - visited * 100 - slot
        if not bestScore or score > bestScore then best, bestScore = door, score end
      end
    end
  end
  return best
end
function mod:Update()
  tick = tick + 1
  if tick % 4 ~= 0 then return end
  for action in pairs(held) do held[action] = false end
  local player = Isaac.GetPlayer(0)
  if not player or player:IsDead() then return end
  local room = game:GetRoom()
  local level = game:GetLevel()
  logState()
  local nearest, nearestDistance, delta
  for _, entity in ipairs(Isaac.GetRoomEntities()) do
    if entity:IsActiveEnemy(false) and not entity:IsDead() then
      local diff = entity.Position - player.Position
      local distance = diff:Length()
      if not nearestDistance or distance < nearestDistance then
        nearest, nearestDistance, delta = entity, distance, diff
      end
    end
  end
  if nearest then
    aim(delta)
    local direction
    if nearestDistance < 105 then
      direction = unit(delta) * -1
    elseif nearestDistance > 245 then
      direction = unit(delta)
    else
      if tick % 120 == 0 then orbit = -orbit end
      direction = unit(Vector(-delta.Y,delta.X)) * orbit
    end
    move(direction)
  else
    local trapdoor = findTrapdoor(room)
    local door
    if not trapdoor then door = selectDoor(room, level) end
    if trapdoor then
      move(unit(trapdoor - player.Position))
    elseif door then
      move(unit(door.Position - player.Position))
    else
      -- After the boss dies, walk over the ordinary center exit/trapdoor.
      move(unit(room:GetCenterPos() - player.Position))
    end
    if tick % 60 == 0 then orbit = -orbit end
  end
end
mod:AddCallback(ModCallbacks.MC_POST_UPDATE, mod.Update)
mod:AddCallback(ModCallbacks.MC_INPUT_ACTION, function(_, entity, hook, action)
  if not controlled[action] then return nil end
  if hook == InputHook.IS_ACTION_PRESSED or hook == InputHook.IS_ACTION_TRIGGERED then return held[action] == true end
  if hook == InputHook.GET_ACTION_VALUE then return held[action] and 1 or 0 end
end)
mod:AddCallback(ModCallbacks.MC_POST_NEW_LEVEL, function() logState() end)
mod:AddCallback(ModCallbacks.MC_POST_NEW_ROOM, function() logState() end)
`;
const log = [];
const record = (s) => {
  const line = `${new Date().toISOString()} ${s}`;
  log.push(line);
  console.log(line);
};
let recorder;
let browser;
let videoPath;
let prepLog;
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
  await page.route('**/bootstrap.js', async route => {
    const response = await route.fetch();
    let source = await response.text();
    const anchor = '  localStorage.setItem(pendingKey, info.sha256);';
    if (source.split(anchor).length !== 2) throw new Error('Cloud-only helper insertion point changed');
    const bytes = Buffer.from(lunaMod, 'utf8').toString('base64');
    const addition = `  const __lunaBytes = { $bytes: ${JSON.stringify(bytes)} };\n  preset.databases['isaac-mods'].files.push({key:'luna-floor-helper/main.lua',value:__lunaBytes});\n  preset.databases['isaac-mods'].mods.push({key:'luna-floor-helper',value:{id:'luna-floor-helper',name:'Luna Floor Helper',description:'Cloud-only normal movement and aim helper.',version:'1',bytes:${Buffer.byteLength(lunaMod)},files:1,added:Date.now(),enabled:true}});\n`;
    source = source.replace(anchor, `${addition}${anchor}`);
    record('CLOUD_ONLY_HELPER_ADDED_TO_FRESH_PRESET_IMPORT');
    await route.fulfill({ response, body: source });
  });
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
  prepLog = setInterval(async () => {
    try { record(`PREP ${await page.locator('#status').textContent()} ${(await page.locator('#bar').getAttribute('style')) || ''}`); }
    catch { /* navigation */ }
  }, 15000);
  await page.waitForFunction(() => {
    const frame = document.querySelector('#game-frame');
    return frame && frame.getAttribute('src') && !document.querySelector('#game-player')?.hidden;
  }, undefined, { timeout: 1500000 });
  clearInterval(prepLog);
  const iframe = await page.locator('#game-frame').elementHandle();
  const frame = await iframe?.contentFrame();
  if (!frame) throw new Error('Game iframe did not attach');
  await frame.waitForURL('**/game.html*', { timeout: 1500000 });
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
  const initialMode = await frame.evaluate(() => document.querySelector('#touch-controls')?.dataset.mode || '');
  if (initialMode !== 'game') throw new Error(`GAMEPLAY_MODE_NOT_REACHED:${initialMode}`);
  const stopAt = Date.now() + Number(process.env.PLAY_MS || 3600000);
  let secondFloor = false;
  let helperSeen = false;
  let lastRoomPtr = null;
  let lastRoomChange = Date.now();
  let lastScreenshot = 0;
  const gameplayStarted = Date.now();
  while (Date.now() < stopAt) {
    const state = await frame.evaluate(() => {
      const logs = Array.isArray(window.isaacLog) ? window.isaacLog.slice(-80).map(String) : [];
      let run = null;
      try {
        const G=window.isaacGuest,g=G.u32(0xc71678),room=G.u32(g+0x18300),begin=G.u32(g+0x1baa8),end=G.u32(g+0x1baac);
        const players=[]; for(let p=begin;p<end&&p<begin+256;p+=4){const e=G.u32(p);if(e&&G.u32(e+0x28)===1)players.push({dead:!!G.u8(e+0x173),ptr:e, floats:(G.f32?[...Array(48)].map((_,i)=>{try{return G.f32(e+i*4)}catch{return null}}):[])});}
        run={frame:G.u32(g+0x264f8),paused:G.u32(g+0x23a74),roomPtr:room,room:room&&[G.u32(room+0xc),G.u32(room+0x10)],entities:Math.max(0,(end-begin)/4),players};
      } catch(e) { run={error:String(e)}; }
      return {mode:document.querySelector('#touch-controls')?.dataset.mode,frame:window.isaacFrame,run,logs};
    });
    record(`STATE ${JSON.stringify(state)}`);
    const observed = [...state.logs, ...log].join('\n');
    if (observed.includes('LUNA_HELPER_READY')) helperSeen = true;
    const stageHit = /LUNA_STAGE:\s*2\b/.test(observed);
    if (stageHit) {
      secondFloor = true;
      record('SECOND_FLOOR_REACHED');
      await page.screenshot({ path: `${out}/second-floor-proof.png` });
      break;
    }
    if (!helperSeen && Date.now() - gameplayStarted > 90000) throw new Error('LUNA_HELPER_NOT_LOADED');
    if (state.run?.players?.some(player => player.dead)) throw new Error('PLAYER_DIED_BEFORE_STAGE_2');
    if (state.run?.roomPtr && state.run.roomPtr !== lastRoomPtr) {
      lastRoomPtr = state.run.roomPtr;
      lastRoomChange = Date.now();
    } else if (Date.now() - lastRoomChange > 90000) {
      throw new Error('ROOM_NO_PROGRESS_FOR_90_SECONDS');
    }
    if (Date.now() - lastScreenshot >= 30000) {
      lastScreenshot = Date.now();
      await page.screenshot({ path: `${out}/state-${lastScreenshot}.png` });
    }
    await page.waitForTimeout(3000);
  }
  if (!secondFloor) throw new Error('Cloud play time limit reached before stage 2');
  record('FLOOR_TWO_CAPTURE_COMPLETE');
  await page.waitForTimeout(5000);
  fs.writeFileSync(`${out}/run.log`, log.join('\n') + '\n');
  await browser.close();
  browser = null;
} catch (e) {
  record(`FATAL ${e.stack || e.message}`);
  fs.writeFileSync(`${out}/run.log`, log.join('\n') + '\n');
  if (browser) await browser.close().catch(() => {});
  process.exitCode = 1;
} finally {
  if (prepLog) clearInterval(prepLog);
  if (recorder?.pid) {
    recorder.kill('SIGINT');
    await new Promise(r => recorder.once('exit', r));
  }
}
