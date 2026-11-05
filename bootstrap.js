const readyKey = 'isaac-shared-ready';
const pendingKey = 'isaac-shared-pending';
const start = document.getElementById('start');
const status = document.getElementById('status');
const bar = document.getElementById('bar');
let info;
let homePreparation;


function progress(text, value) {
  if(homePreparation){homePreparation.notice(text);return;}
  status.textContent = text;
  bar.style.width = `${value}%`;
  bar.parentElement.setAttribute('aria-valuenow', String(value));
}

function openDatabase(name, stores) {
  return new Promise((resolve, reject) => {
    function open(version) {
      const request = version ? indexedDB.open(name, version) : indexedDB.open(name);
      request.onupgradeneeded = () => {
        for (const store of stores) {
          if (!request.result.objectStoreNames.contains(store)) request.result.createObjectStore(store);
        }
      };
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error('请关闭这个网站的其他游戏页面，然后重试。'));
      request.onsuccess = () => {
        const db = request.result;
        if (stores.every(store => db.objectStoreNames.contains(store))) {
          db.onversionchange = () => db.close();
          resolve(db);
        } else {
          const next = db.version + 1;
          db.close();
          open(next);
        }
      };
    }
    open();
  });
}

async function hasExistingData() {
  const databases = await indexedDB.databases();
  for (const name of ['isaac-saves', 'isaac-mods']) {
    if (!databases.some(db => db.name === name)) continue;
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open(name);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      for (const store of db.objectStoreNames) {
        const count = await new Promise((resolve, reject) => {
          const request = db.transaction(store).objectStore(store).count();
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
        if (count > 0) return true;
      }
    } finally { db.close(); }
  }
  return false;
}

function decode(value) {
  if (value && typeof value === 'object' && !Array.isArray(value) && typeof value.$bytes === 'string') {
    if (typeof Uint8Array.fromBase64 === 'function') return Uint8Array.fromBase64(value.$bytes);
    return Uint8Array.from(atob(value.$bytes), character => character.charCodeAt(0));
  }
  if (Array.isArray(value)) return value.map(decode);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, decode(item)]));
  return value;
}

async function digest(bytes) {
  const result = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(result)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

async function importPreset() {
  if (localStorage.getItem(readyKey)) return;
  const pending = localStorage.getItem(pendingKey);
  if (!pending && await hasExistingData()) {
    localStorage.setItem(readyKey, 'existing');
    return;
  }
  if(homePreparation)await homePreparation.downloadPreset();
  progress(homePreparation?'正在校验存档和 mod。':'正在下载你的初始存档和 mod。', 5);
  const chunks = [];
  let received = 0;
  for (const part of info.parts) {
    const response = homePreparation?await homePreparation.readPreset(part.url):await fetch(part.url);
    if(!response)throw new Error('已下载的配置无法读取，请重试。');
    if (!response.ok) throw new Error(`配置下载失败：HTTP ${response.status}`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.length !== part.bytes || await digest(bytes) !== part.sha256) throw new Error('配置文件校验失败，请重试。');
    chunks.push(bytes);
    received += bytes.length;
    progress(`正在下载配置：${(received / 1000000).toFixed(1)} / ${(info.bytes / 1000000).toFixed(1)} MB`, 5 + 65 * received / info.bytes);
  }
  const packed = new Blob(chunks);
  if (await digest(await packed.arrayBuffer()) !== info.sha256) throw new Error('完整配置校验失败。');
  const preset = await new Response(packed.stream().pipeThrough(new DecompressionStream('gzip'))).json();
  if (preset.format !== 'isaac-shared-preset/1') throw new Error('配置格式不受支持。');
  const names = Object.keys(preset.databases);
  if (names.length !== 2 || !names.includes('isaac-saves') || !names.includes('isaac-mods')) throw new Error('配置数据库不完整。');
  if (preset.databases['isaac-saves'].files.length !== info.saves
      || preset.databases['isaac-mods'].mods.length !== info.mods
      || preset.databases['isaac-mods'].files.length !== info.mod_files) throw new Error('配置记录不完整。');
  // Only mark a pending import after preserving any pre-existing player data above.
  // The game cannot start before both database transactions have completed.
  localStorage.setItem(pendingKey, info.sha256);
  for (const [index, name] of names.entries()) {
    progress(name === 'isaac-mods' ? '正在安装 mod 和中文配置。' : '正在写入初始存档。', 75 + index * 10);
    const stores = preset.databases[name];
    const allowed = name === 'isaac-saves' ? ['files'] : ['files', 'mods', 'state'];
    if (Object.keys(stores).some(store => !allowed.includes(store))) throw new Error('配置含未知数据表。');
    const db = await openDatabase(name, allowed);
    try {
      await new Promise((resolve, reject) => {
        const tx = db.transaction(Object.keys(stores), 'readwrite');
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error || new Error('空间不足，导入未完成。'));
        try {
          for (const [store, records] of Object.entries(stores)) {
            for (const record of records) tx.objectStore(store).put(decode(record.value), record.key);
          }
        } catch (error) { tx.abort(); reject(error); }
      });
    } finally { db.close(); }
  }
  localStorage.setItem(readyKey, info.sha256);
  localStorage.removeItem(pendingKey);
  if (navigator.storage?.persist) await navigator.storage.persist().catch(() => false);
  progress(homePreparation?'存档和 mod 已准备好。':'配置已保存，正在进入游戏。', 100);
}

const fullscreenButton=document.getElementById('enter-fullscreen');
const orientationNote=document.getElementById('orientation-note');
let fullscreenStarted=false;
const fullscreenActive=()=>!!(document.fullscreenElement||document.webkitFullscreenElement);
function updateScreenHelp() {
  fullscreenButton.hidden=!fullscreenStarted||fullscreenActive();
  if(innerWidth>=innerHeight)orientationNote.hidden=true;
}
function enterFullscreen() {
  fullscreenStarted=true;
  // Call synchronously in the click event, before downloads consume user activation.
  let request;
  try {
    const root=document.documentElement;
    const method=root.requestFullscreen||root.webkitRequestFullscreen;
    request=fullscreenActive()?Promise.resolve():method?method.call(root):Promise.reject(Error('Fullscreen unavailable'));
  }catch(error){request=Promise.reject(error);}
  Promise.resolve(request).then(async()=>{
    if(matchMedia('(pointer:coarse)').matches){
      try {
        if(!screen.orientation?.lock)throw Error('Orientation lock unavailable');
        await screen.orientation.lock('landscape');orientationNote.hidden=true;
      }catch{orientationNote.hidden=innerWidth>=innerHeight;}
    }
  }).catch(()=>{}).finally(()=>{
    updateScreenHelp();
    if(document.body.classList.contains('game-active'))document.getElementById('game-frame').contentWindow?.focus();
  });
}
fullscreenButton.addEventListener('click',enterFullscreen);
document.addEventListener('fullscreenchange',updateScreenHelp);
document.addEventListener('webkitfullscreenchange',updateScreenHelp);
window.addEventListener('resize',updateScreenHelp);
function showGame(prepared) {
  const frame=document.getElementById('game-frame');
  document.getElementById('game-player').hidden=false;
  document.body.classList.add('game-active');
  frame.addEventListener('load',()=>frame.contentWindow?.focus(),{once:true});
  frame.src=prepared?'game.html?prepared=1':'game.html';
  updateScreenHelp();
}

start.addEventListener('click', async () => {
  enterFullscreen();
  start.disabled = true;
  document.getElementById('download-concurrency').disabled=window.isaacHosted===true;
  start.textContent = window.isaacHosted===true?'准备中…':'开始游戏';
  start.setAttribute('aria-busy','true');
  try {
    if (!navigator.locks) throw new Error('请更新 Chrome 或 Edge 后重试。');
    if(window.isaacHosted===true){
      if(!homePreparation){
        const {createHomePreparation}=await import('./web/home_prepare.mjs');
        homePreparation=createHomePreparation({info,render:({value,label,detail,canPause,showPause,settingsDisabled})=>{
          status.textContent=label;bar.style.width=`${value}%`;
          bar.parentElement.setAttribute('aria-valuenow',String(Math.round(value)));
          bar.parentElement.setAttribute('aria-valuetext',`${Math.round(value)}%，${label}`);
          document.getElementById('prepare-detail').textContent=detail;
          document.getElementById('prepare-percent').textContent=`${Math.floor(value)}%`;
          document.getElementById('download-concurrency').disabled=!!settingsDisabled;
          const pause=document.getElementById('prepare-pause');pause.hidden=!showPause;pause.disabled=!canPause;
        }});
      }
      homePreparation.start();
    }
    await navigator.locks.request('isaac-shared-import', importPreset);
    if(homePreparation){homePreparation.presetReady();await homePreparation.resources();homePreparation.close();}
    showGame(!!homePreparation);
  } catch (error) {
    if(homePreparation)homePreparation.stop(error);else progress(error.message || String(error), 0);
    start.disabled = false;
    start.textContent = error.name==='AbortError'?'继续下载':'重试';
  } finally {start.setAttribute('aria-busy','false');if(!start.disabled&&!homePreparation)document.getElementById('download-concurrency').disabled=false;}
});

document.getElementById('prepare-pause').addEventListener('click',()=>{homePreparation?.pause().catch(error=>{status.textContent=error.message||String(error);});});

try {
  if(window.isaacHosted===true){
    const settings=await import('./web/download_settings.mjs');
    const select=document.getElementById('download-concurrency');
    select.value=String(settings.getDownloadConcurrency());
    document.getElementById('download-settings').hidden=false;
    select.addEventListener('change',()=>{
      try {homePreparation?.setConcurrency(Number(select.value));settings.setDownloadConcurrency(select.value);}
      catch(error){status.textContent=error.message||String(error);select.value=String(settings.getDownloadConcurrency());}
    });
  }
  const response = await fetch('preset-info.json');
  if (!response.ok) throw new Error(`配置清单加载失败：HTTP ${response.status}`);
  info = await response.json();
  document.querySelector('.stats strong').textContent = '3';
  document.querySelectorAll('.stats strong')[1].textContent = info.enabled_mods;
  for (const mod of info.mod_names) {
    const item = document.createElement('li');
    item.textContent = mod.name + (mod.enabled ? '' : '（关闭）');
    if (!mod.enabled) item.className = 'off';
    document.getElementById('mods').append(item);
  }
  const existing = localStorage.getItem(readyKey);
  progress(existing ? (window.isaacHosted===true?'已找到存档，开始后检查游戏资源。':'已找到存档，可以直接开始。') : '首次开始会下载存档和 mod。', existing&&window.isaacHosted!==true?100:0);
  start.textContent = '开始游戏';
  start.disabled = false;
} catch (error) {
  progress(error.message || String(error), 0);
  start.textContent = '重新加载';
  start.disabled = false;
  start.onclick = () => location.reload();
}
