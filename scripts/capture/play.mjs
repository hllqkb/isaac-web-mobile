import { chromium } from 'playwright';
import fs from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';

const out = process.env.CAPTURE_DIR || 'work/capture';
const routeVariant = Math.max(1, Math.min(3, Number(process.env.ROUTE_VARIANT) || 1));
fs.mkdirSync(out, { recursive: true });
const lunaMod = String.raw`local mod = RegisterMod("Luna Floor Helper", 1)
local routeVariant = ${routeVariant}
local azazelCharacter = false
local ignoredPickup = nil
local pickupTarget = nil
local pickupStartedTick = 0
Isaac.DebugString("LUNA_HELPER_READY")
local game = Game()
local held = {}
local controlled = {
  [ButtonAction.ACTION_LEFT]=true,[ButtonAction.ACTION_RIGHT]=true,
  [ButtonAction.ACTION_UP]=true,[ButtonAction.ACTION_DOWN]=true,
  [ButtonAction.ACTION_SHOOTLEFT]=true,[ButtonAction.ACTION_SHOOTRIGHT]=true,
  [ButtonAction.ACTION_SHOOTUP]=true,[ButtonAction.ACTION_SHOOTDOWN]=true,
  [ButtonAction.ACTION_BOMB]=true,
}
local orbit = 1
local tick = 0
local currentRoom = -1
local currentStage = -1
local reportedCharacter = false
local visitedRooms = {}
local lastEnemyHp = nil
local lastHpLog = 0
local lastBombTick = -10000
local function setAction(action, down) held[action] = down and true or false end
local function aim(delta)
  if azazelCharacter and tick % 90 >= 56 then return end
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
-- Pick the next ordinary movement input. No entity or world state is mutated.
local function steer(room, player, target, fighting)
  local pos = player.Position
  local start = room:GetGridIndex(pos)
  local width = room:GetGridWidth()
  local size = room:GetGridSize()
  local grid = { start }
  local first, cost = {}, { [start] = 0 }
  local best, bestScore = start, math.huge
  local danger = {}
  if fighting then
    for _, e in ipairs(Isaac.GetRoomEntities()) do
      if e.Type == EntityType.ENTITY_PROJECTILE or (e:IsActiveEnemy(false) and not e:IsDead()) then
        danger[#danger+1] = {p=e.Position + e.Velocity*5, radius=math.min(110, 38+e.Size), projectile=e.Type==EntityType.ENTITY_PROJECTILE}
      end
    end
  end
  local function dangerAt(point)
    local penalty = 0
    for _, e in ipairs(danger) do
      local near = math.max(0, e.radius + 18 - point:Distance(e.p))
      penalty = penalty + near*(e.projectile and 12 or 7)
    end
    return penalty
  end
  local cursor = 1
  while grid[cursor] do
    local i = grid[cursor]
    cursor = cursor+1
    local point = room:GetGridPosition(i)
    local distance = point:Distance(target)
    local score = distance + cost[i]*0.3
    if fighting then
      local offset = target-point
      local across = math.min(math.abs(offset.X),math.abs(offset.Y))
      local range = azazelCharacter and 120 or math.min(190, math.max(125,(player.TearRange or 260)*0.52))
      score = across*3 + math.abs(distance-range)*0.55 + cost[i]*6 + dangerAt(point)
      if not room:CheckLine(point,target,0,0,false,false) then score = score+160 end
      if first[i] then score=score+dangerAt(room:GetGridPosition(first[i])) end
    end
    if score < bestScore then best,bestScore=i,score end
    for _, step in ipairs({1,-1,width,-width}) do
      local j=i+step
      if j>=0 and j<size and not cost[j] and (math.abs(step)~=1 or math.floor(i/width)==math.floor(j/width)) then
        local nextPoint=room:GetGridPosition(j)
        local collision=room:GetGridCollision(j)
        if room:IsPositionInRoom(nextPoint,5) and (collision==0 or (player.CanFly and collision==1)) then
          cost[j]=cost[i]+1
          first[j]=first[i] or j
          grid[#grid+1]=j
        end
      end
    end
  end
  if best==start then
    if not fighting then return target-pos end
    local d=target-pos
    if math.abs(d.X)>math.abs(d.Y) then return Vector(0,math.abs(d.Y)>6 and d.Y or 0) end
    return Vector(math.abs(d.X)>6 and d.X or 0,0)
  end
  return room:GetGridPosition(first[best])-pos
end

local function logState()
  local level = game:GetLevel()
  local desc = level:GetCurrentRoomDesc()
  local index = desc and desc.GridIndex or -1
  local stage = level:GetStage()
  if stage ~= currentStage then
    currentStage = stage
    visitedRooms = {}
    lastEnemyHp = nil
    Isaac.DebugString("LUNA_STAGE:" .. tostring(stage))
  end
  if index ~= currentRoom then
    currentRoom = index
    visitedRooms[index] = true
    ignoredPickup = nil
    pickupTarget = nil
    lastEnemyHp = nil
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
local function findSafePickup(room, player)
  local desc = game:GetLevel():GetCurrentRoomDesc()
  local kind = desc and desc.Data and desc.Data.Type or -1
  if kind == RoomType.ROOM_CURSE or kind == RoomType.ROOM_SACRIFICE then return nil end
  local needsRedHealth = player:GetHearts() < player:GetMaxHearts()
  local best, bestDistance
  for _, entity in ipairs(Isaac.GetRoomEntities()) do
    if entity.Type == EntityType.ENTITY_PICKUP then
      local lineOfSight = player.CanFly or room:CheckLine(player.Position, entity.Position, 0, 0, false, false)
      local collectible = entity.Variant == PickupVariant.PICKUP_COLLECTIBLE and entity.Price == 0 and lineOfSight
      local heart = entity.Variant == PickupVariant.PICKUP_HEART and needsRedHealth and lineOfSight
      local skipped = ignoredPickup and entity.Position:Distance(ignoredPickup) < 20
      if (collectible or heart) and not skipped then
        local distance = entity.Position:Distance(player.Position)
        if not bestDistance or distance < bestDistance then best, bestDistance = entity, distance end
      end
    end
  end
  return best
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
        local treasure = RoomType.ROOM_TREASURE and kind == RoomType.ROOM_TREASURE
        local seen = visitedRooms[desc.GridIndex or targetIndex]
        local score
        if routeVariant == 2 then
          score = (treasure and 3500 or 0) + (boss and 1200 or 0) + (seen and -1000 or 500) - visited * 100 - slot
        elseif routeVariant == 3 then
          score = (boss and 10000 or 0) + (treasure and 800 or 0) + (seen and -1000 or 500) - visited * 100 + slot
        else
          score = (boss and 10000 or 0) + (seen and -1000 or 500) - visited * 100 - slot
        end
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
  if not reportedCharacter and player.GetPlayerType then
    reportedCharacter = true
    local playerType = player:GetPlayerType()
    azazelCharacter = playerType == 7
    Isaac.DebugString("LUNA_CHAR:" .. tostring(playerType))
  end
  local room = game:GetRoom()
  local level = game:GetLevel()
  logState()
  local nearest, nearestDistance, delta
  local totalEnemyHp = 0
  for _, entity in ipairs(Isaac.GetRoomEntities()) do
    if entity:IsActiveEnemy(false) and not entity:IsDead() then
      totalEnemyHp = totalEnemyHp + (entity.HitPoints or 0)
      local diff = entity.Position - player.Position
      local distance = diff:Length()
      if not nearestDistance or distance < nearestDistance then
        nearest, nearestDistance, delta = entity, distance, diff
      end
    end
  end
  if lastEnemyHp and totalEnemyHp < lastEnemyHp - 0.25 and tick - lastHpLog >= 60 then
    Isaac.DebugString("LUNA_HP:" .. tostring(currentStage) .. ":" .. tostring(currentRoom) .. ":" .. string.format("%.1f", totalEnemyHp))
    lastHpLog = tick
  end
  lastEnemyHp = totalEnemyHp
  if nearest then
    aim(delta)
    if nearest:IsBoss() and player:GetNumBombs() > 0 and nearestDistance >= 85 and nearestDistance <= 165 and tick - lastBombTick >= 180 then
      setAction(ButtonAction.ACTION_BOMB, true)
      lastBombTick = tick
      Isaac.DebugString("LUNA_BOMB:" .. tostring(currentStage) .. ":" .. tostring(currentRoom))
    end
    local direction
    if nearestDistance < 105 then
      direction = unit(delta) * -1
    elseif nearestDistance > 245 then
      direction = unit(delta)
    else
      if tick % 120 == 0 then orbit = -orbit end
      direction = unit(Vector(-delta.Y,delta.X)) * orbit
    end
    move(steer(room, player, nearest.Position, true))
  else
    local pickup = findSafePickup(room, player)
    local trapdoor = findTrapdoor(room)
    local door
    if not trapdoor then door = selectDoor(room, level) end
    if pickup then
      if not pickupTarget or pickup.Position:Distance(pickupTarget) > 20 then
        pickupTarget = pickup.Position
        pickupStartedTick = tick
      elseif tick - pickupStartedTick > 900 then
        ignoredPickup = pickup.Position
        pickupTarget = nil
        pickup = nil
      end
    end
    if pickup then
      move(steer(room, player, pickup.Position, false))
    elseif trapdoor then
      move(steer(room, player, trapdoor, false))
    elseif door then
      move(steer(room, player, door.Position, false))
    else
      -- After the boss dies, walk over the ordinary center exit/trapdoor.
      move(steer(room, player, room:GetCenterPos(), false))
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
let page;
let frame;
let videoPath;
let prepLog;
try {
  const display = process.env.DISPLAY || ':99.0';
  recorder = spawn('ffmpeg', [
    '-y', '-thread_queue_size', '1024', '-f', 'x11grab', '-video_size', '1280x720', '-framerate', '30', '-i', display,
    '-thread_queue_size', '1024', '-f', 'pulse', '-i', 'IsaacCapture.monitor', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '128k', '-movflags', '+frag_keyframe+empty_moov+default_base_moof', `${out}/floor-one-original.mp4`,
  ], { stdio: ['ignore', 'ignore', fs.openSync(`${out}/ffmpeg.log`, 'w')] });
  await new Promise(r => setTimeout(r, 1500));
  browser = await chromium.launch({ headless: false, args: ['--kiosk', '--start-fullscreen', '--window-size=1280,720', '--window-position=0,0', '--enable-unsafe-swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
  const context = await browser.newContext({ viewport: null });
  page = await context.newPage();
  await page.route('**/bootstrap.js', async route => {
    const response = await route.fetch();
    let source = await response.text();
    const anchor = '  localStorage.setItem(pendingKey, info.sha256);';
    if (source.split(anchor).length !== 2) throw new Error('Cloud-only helper insertion point changed');
    const bytes = Buffer.from(lunaMod, 'utf8').toString('base64');
    const addition = `  const __lunaBytes = { $bytes: ${JSON.stringify(bytes)} };\n  const __runFiles = preset.databases['isaac-saves'].files;\n  const __isSeededRun = r => String(r.key).replaceAll('\\\\','/').split('/').at(-1).toLowerCase() === 'gamestate1.dat';\n  const __runCount = __runFiles.filter(__isSeededRun).length;\n  if (__runCount !== 1) throw new Error('Expected one fresh-profile in-progress save to clear; found ' + __runCount);\n  preset.databases['isaac-saves'].files = __runFiles.filter(r => !__isSeededRun(r));\n  preset.databases['isaac-mods'].files.push({key:'luna-floor-helper/main.lua',value:{bytes:__lunaBytes}});\n  preset.databases['isaac-mods'].mods.push({key:'luna-floor-helper',value:{id:'luna-floor-helper',name:'Luna Floor Helper',description:'Cloud-only normal movement and aim helper.',version:'1',bytes:${Buffer.byteLength(lunaMod)},files:1,added:Date.now(),enabled:true}});\n`;
    source = source.replace(anchor, `${addition}${anchor}`);
    record('CLOUD_ONLY_HELPER_ADDED_TO_FRESH_PRESET_IMPORT');
    await route.fulfill({ response, body: source });
  });
  page.on('console', m => {
    const text = m.text();
    if (m.type() === 'error' || /LUNA_(?:HELPER_READY|STAGE|ROOM|HP)/.test(text)) record(`CONSOLE ${m.type()}: ${text}`);
  });
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
  const iframe = await page.locator('#game-frame').elementHandle();
  frame = await iframe?.contentFrame();
  if (!frame) throw new Error('Game iframe did not attach');
  await frame.waitForURL(url => /^\/game(?:\.html)?\/?$/.test(url.pathname), { timeout: 120000 });
  await frame.waitForLoadState('domcontentloaded', { timeout: 120000 });
  await frame.waitForSelector('#canvas', { state: 'attached', timeout: 120000 });
  await frame.waitForFunction(() => (window.isaacFrame || 0) > 120, undefined, { timeout: 120000 });
  await frame.waitForFunction(() => { const overlay=document.getElementById('overlay'); return !overlay || overlay.hidden; }, undefined, { timeout: 120000 });
  clearInterval(prepLog);
  record(`BOOT ${JSON.stringify(await frame.evaluate(() => ({ url: location.href, frame: window.isaacFrame, overlayHidden: document.getElementById('overlay')?.hidden, mode: document.querySelector('#touch-controls')?.dataset.mode || null, globals: Object.keys(window).filter(k => /isaac|mod|save/i.test(k)).slice(0, 80) })))}`);
  await page.screenshot({ path: `${out}/boot.png` });
  // Advance the normal title/character screens by Enter; no game state is modified.
  const gameplayState = () => frame.evaluate(() => {
    try {
      const G=window.isaacGuest,g=G.u32(0xc71678),begin=G.u32(g+0x1baa8),end=G.u32(g+0x1baac),logicFrame=G.u32(g+0x264f8);
      for(let p=begin;p<end&&p<begin+256;p+=4){const e=G.u32(p);if(e&&G.u32(e+0x28)===1)return {active:logicFrame>120&&!G.u8(e+0x173),logicFrame,player:true};}
      return {active:false,logicFrame,player:false};
    } catch { return {active:false,logicFrame:0,player:false}; }
  });
  const tapMenuKey = async key => {
    await frame.evaluate(key => window.isaacInjectKey?.(key, true, 'cloud-capture'), key);
    await frame.waitForTimeout(120);
    await frame.evaluate(key => window.isaacInjectKey?.(key, false, 'cloud-capture'), key);
    await frame.waitForTimeout(350);
  };
  const readMenu = async () => {
    const shot = await page.screenshot();
    const runs = ['6', '11'].map(psm => spawnSync('tesseract', ['stdin', 'stdout', '--psm', psm], { input: shot, encoding: 'utf8', timeout: 8000, maxBuffer: 1024 * 1024 }));
    const text = runs.map(result => result.stdout || '').join(' ').replace(/\s+/g, ' ').trim();
    record(`MENU_OCR ${JSON.stringify({ text, statuses: runs.map(result => result.status), errors: runs.map(result => result.error?.message || null) })}`);
    return text;
  };
  const characterMenu = text => /who\s*am|more\s*options|greedier|less\s*room/i.test(text)
    && /\b(?:isaac|azazel|normal)\b/i.test(text);
  let started = await gameplayState();
  let azazelMenuConfirmed = false;
  let menuText = started.active ? '' : await readMenu();
  for (let i = 0; i < 40 && !started.active; i++) {
    if (characterMenu(menuText)) {
      record('CHARACTER_MENU_DETECTED');
      let selected = /\bazazel\b/i.test(menuText);
      for (let step = 0; step < 7 && !selected; step++) {
        await tapMenuKey('right');
        await frame.waitForTimeout(750);
        menuText = await readMenu();
        selected = /\bazazel\b/i.test(menuText);
      }
      if (!selected) {
        record('AZAZEL_NAME_NOT_OCR_VISIBLE_AFTER_RIGHT_INPUTS');
        throw new Error('AZAZEL_MENU_SELECTION_NOT_CONFIRMED');
      }
      record('AZAZEL_MENU_CONFIRMED');
      await tapMenuKey('e');
      await frame.waitForTimeout(1100);
      menuText = await readMenu();
      if (!/\bazazel\b/i.test(menuText) || /broken\s*wings|hemopt[yi]sis/i.test(menuText)) {
        throw new Error('NORMAL_AZAZEL_NOT_CONFIRMED_AFTER_E_TOGGLE');
      }
      azazelMenuConfirmed = true;
      record('NORMAL_AZAZEL_MENU_CONFIRMED');
      // Confirm the selected character through LUNA_CHAR and allow slow cloud startup frames.
      await tapMenuKey('enter');
      for (let attempt = 0; attempt < 90 && !started.active; attempt++) {
        await frame.waitForTimeout(500);
        started = await gameplayState();
      }
      break;
    }
    await tapMenuKey('enter');
    started = await gameplayState();
    if (started.active) break;
    await frame.waitForTimeout(1100);
    menuText = await readMenu();
  }
  record(`PLAY ${JSON.stringify({ started, azazelMenuConfirmed, state: await frame.evaluate(() => ({ frame: window.isaacFrame, mode: document.querySelector('#touch-controls')?.dataset.mode || null })) })}`);
  if (!started.active) throw new Error('GAMEPLAY_MODE_NOT_REACHED: no live player pointer or logic frame');
  await frame.waitForFunction(() => Array.isArray(window.isaacLog) && window.isaacLog.some(line => /LUNA_CHAR:\d+/.test(String(line))), undefined, { timeout: 30000 });
  const selectedCharacter = await frame.evaluate(() => { const line = (window.isaacLog || []).map(String).find(value => /LUNA_CHAR:\d+/.test(value)); return Number(line?.match(/LUNA_CHAR:(\d+)/)?.[1] || -1); });
  record(`SELECTED_CHARACTER_TYPE ${selectedCharacter}`);
  if (selectedCharacter !== 7) throw new Error(`AZAZEL_CHARACTER_TYPE_MISMATCH: ${selectedCharacter}`);
  await page.screenshot({ path: `${out}/play-start.png` });
  const stopAt = Date.now() + Number(process.env.PLAY_MS || 3600000);
  let secondFloor = false;
  let helperSeen = false;
  let lastRoomPtr = null;
  let lastRoomKey = null;
  let lastRoomChange = Date.now();
  let lastScreenshot = 0;
  const seenHpMarks = new Set();
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
    let latestRoomKey = null;
    for (const line of [...state.logs, ...log]) {
      const roomMark = String(line).match(/LUNA_ROOM:(\d+):(-?\d+):(-?\d+)/);
      if (roomMark) {
        helperSeen = true;
        latestRoomKey = `${roomMark[1]}:${roomMark[2]}`;
      }
      if (/LUNA_STAGE:\s*\d+\b|LUNA_HELPER_READY/.test(String(line))) helperSeen = true;
      const hpMark = String(line).match(/LUNA_HP:(\d+):(-?\d+):([\d.]+)/);
      if (hpMark) {
        helperSeen = true;
        const key = hpMark[0];
        if (!seenHpMarks.has(key)) { seenHpMarks.add(key); lastRoomChange = Date.now(); }
      }
    }
    if (latestRoomKey && latestRoomKey !== lastRoomKey) {
      lastRoomKey = latestRoomKey;
      lastRoomChange = Date.now();
    }
    const stageHit = /LUNA_STAGE:\s*2\b/.test(observed);
    if (azazelMenuConfirmed && /LUNA_CHAR:(\d+)/.test(observed) && Number(observed.match(/LUNA_CHAR:(\d+)/)?.[1]) !== 7) throw new Error('AZAZEL_CHARACTER_TYPE_MISMATCH');
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
  try {
    const target = frame || page;
    if (target) {
      const diag = await target.evaluate(() => ({
        url: location.href,
        title: document.title,
        bodyTail: (document.body?.innerText || '').slice(-700),
        frame: window.isaacFrame ?? null,
        isaacLogTail: Array.isArray(window.isaacLog) ? window.isaacLog.slice(-30).map(String) : String(window.isaacLog || '').slice(-2000),
      }));
      record(`FAILURE_DIAGNOSTICS ${JSON.stringify(diag)}`);
      await page?.screenshot({ path: `${out}/failure.png` });
    }
  } catch (diagnosticError) {
    record(`DIAGNOSTICS_UNAVAILABLE ${diagnosticError.stack || diagnosticError.message}`);
    try { await page?.screenshot({ path: `${out}/failure.png` }); } catch {}
  }
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
