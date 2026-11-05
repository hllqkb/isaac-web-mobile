import {createVerifiedChunkCache} from './chunk_cache.mjs';
import {DOWNLOAD_CONCURRENCY_OPTIONS,getDownloadConcurrency,setDownloadConcurrency} from './download_settings.mjs';

export async function prepareResources() {
  const cache=createVerifiedChunkCache({concurrency:getDownloadConcurrency(),baseUrl:new URL('./',location.href).href});
  window.isaacFullChunkCache=cache;
  const overlay=document.getElementById('overlay'),wasHidden=overlay?.hidden;
  const prepared=new URLSearchParams(location.search).get('prepared')==='1';
  let closed=false;
  const screen=document.createElement('section');
  screen.setAttribute('aria-label','准备游戏资源');
  screen.style.cssText='position:fixed;inset:0;z-index:10000;display:grid;place-items:center;padding:24px;background:#1c1915;color:#e7d7bb;font:15px/1.7 system-ui;overflow:auto';
  screen.innerHTML=`<div style="width:min(100%,460px)">
    <h1 style="margin:0 0 12px;font-size:26px">${prepared?'正在启动游戏':'准备游戏资源'}</h1>
    <p style="margin:0 0 20px">${prepared?'正在检查本地资源，已完成的文件会直接复用。':'首次需要下载完整资源，之后会复用缓存，减少游戏中临时加载的停顿。'}</p>
    <progress max="1" value="0" aria-label="资源下载进度" style="width:100%;height:12px;accent-color:#bc9b6c"></progress>
    <p data-progress role="status" aria-live="polite">正在检查已下载的资源。</p>
    <p data-transfer style="margin:0 0 16px"></p>
    <label style="display:flex;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:10px">下载并发 <select data-concurrency aria-label="下载并发" style="min-height:44px;padding:4px 12px;border:1px solid #a78d69;border-radius:4px;background:#d8c7a8;color:#382d23;font:inherit">${DOWNLOAD_CONCURRENCY_OPTIONS.map(value=>`<option value="${value}">${value}</option>`).join('')}</select><span>个分段请求</span></label>
    <button data-pause type="button">暂停下载</button>
    <p data-error role="alert" hidden></p>
    <div data-actions hidden style="display:none;gap:12px;flex-wrap:wrap">
      <button data-retry type="button">重试下载</button>
      <button data-continue type="button">先进入游戏</button>
    </div>
    <p style="font-size:13px;color:#bba98b">下载时请保持页面打开，网络中断会自动重试。<br>这里只下载游戏文件，不会修改存档。</p>
  </div>`;
  for(const button of screen.querySelectorAll('button'))button.style.cssText='min-height:44px;padding:8px 16px;border:1px solid #a78d69;border-radius:5px;background:#d8c7a8;color:#382d23;font:inherit;cursor:pointer';
  const showScreen=()=>{
    if(closed)return;
    if(overlay)overlay.hidden=true;
    document.body.append(screen);
  };
  // The home page already prepared these files. A normal warm check should not
  // flash a second download screen; a missing cache still gets the fallback UI.
  const presentationTimer=prepared?setTimeout(showScreen,350):null;
  if(!prepared)showScreen();
  const meter=screen.querySelector('progress'),label=screen.querySelector('[data-progress]');
  const errorLabel=screen.querySelector('[data-error]'),actions=screen.querySelector('[data-actions]');
  const transfer=screen.querySelector('[data-transfer]');
  const concurrency=screen.querySelector('[data-concurrency]'),pause=screen.querySelector('[data-pause]');
  const retry=screen.querySelector('[data-retry]'),compatibility=screen.querySelector('[data-continue]');
  concurrency.value=String(getDownloadConcurrency());
  concurrency.addEventListener('change',()=>{
    try {cache.setConcurrency(Number(concurrency.value));setDownloadConcurrency(concurrency.value);}
    catch(error){errorLabel.textContent=String(error.message||error);errorLabel.hidden=false;concurrency.value=String(getDownloadConcurrency());}
  });
  let pausing=false;
  pause.addEventListener('click',async()=>{
    if(!downloading||pausing)return;
    pausing=true;render();
    try {await cache.pause();}catch(error){errorLabel.textContent=String(error.message||error);errorLabel.hidden=false;}
    finally{pausing=false;render();}
  });
  let downloading=false,pageActive=true,wakeLock=null,wakeRequest=null;
  function releaseWakeLock() {
    const held=wakeLock;wakeLock=null;
    if(held)Promise.resolve(held.release()).catch(()=>{});
  }
  function requestWakeLock() {
    if(closed||!pageActive||!downloading||document.hidden||wakeLock||wakeRequest||!navigator.wakeLock?.request)return;
    wakeRequest=Promise.resolve().then(()=>navigator.wakeLock.request('screen')).then(held=>{
      if(closed||!pageActive||!downloading||document.hidden){Promise.resolve(held.release()).catch(()=>{});return;}
      wakeLock=held;
      held.addEventListener('release',()=>{if(wakeLock===held)wakeLock=null;});
    }).catch(()=>{}).finally(()=>{wakeRequest=null;});
  }
  function visibilityChanged() {
    if(document.hidden)releaseWakeLock();else requestWakeLock();
  }
  function pageLeaving() {pageActive=false;releaseWakeLock();}
  function pageReturning() {pageActive=true;requestWakeLock();}
  document.addEventListener('visibilitychange',visibilityChanged);
  window.addEventListener('pagehide',pageLeaving);
  window.addEventListener('pageshow',pageReturning);
  function render() {
    const state=cache.summary(),total=Math.max(1,state.total);
    concurrency.disabled=downloading||pausing;pause.hidden=!downloading;pause.disabled=pausing;retry.disabled=pausing;
    pause.textContent=pausing?'正在暂停…':'暂停下载';
    meter.value=Math.min(1,Math.max(0,state.received/total));
    const progress=`${(state.received/1048576).toFixed(1)} / ${(state.total/1048576).toFixed(1)} MiB · ${state.completed} 个文件已准备好`;
    const text=state.retrying?`连接中断，正在重试（第 ${state.attempt||2} 次）\n${progress}`:progress;
    if(label.textContent!==text)label.textContent=text;
    label.style.whiteSpace='pre-line';
    const speed=downloading&&Number.isFinite(state.bytesPerSecond)&&state.bytesPerSecond>0?state.bytesPerSecond:0;
    const rate=speed>=1048576?`${(speed/1048576).toFixed(1)} MiB/s`:`${(speed/1024).toFixed(0)} KiB/s`;
    let estimate='预计剩余时间：正在估算';
    if(!downloading)estimate='下载已暂停';
    else if(state.retrying)estimate='正在重新连接';
    else if(speed&&Number.isFinite(state.etaSeconds)&&state.etaSeconds>=0){
      const seconds=Math.ceil(state.etaSeconds),minutes=Math.floor(seconds/60);
      estimate=`预计还需约 ${minutes?minutes+' 分 ':''}${seconds%60} 秒`;
    }
    const activity=Number.isFinite(state.networkTasks)&&state.networkTasks>0?` · ${state.networkTasks} 个分段请求`:'';
    const checking=prepared&&downloading&&!state.downloadedBytes&&!state.activeFiles;
    const detail=checking?'正在检查本地缓存':`下载速度：${rate} · ${estimate}${activity}`;
    if(transfer.textContent!==detail)transfer.textContent=detail;
  }
  const timer=setInterval(render,500);
  try {
    for(;;) {
      actions.hidden=true;actions.style.display='none';errorLabel.hidden=true;
      cache.setConcurrency(getDownloadConcurrency());
      downloading=true;render();requestWakeLock();
      window.isaacPreloadError=null;
      try {await cache.preload();window.isaacPreloadError=null;render();return;}
      catch(error) {
        downloading=false;releaseWakeLock();
        const paused=error?.name==='AbortError';
        window.isaacPreloadError=paused?null:String(error?.message||error);
        if(!paused)console.error('[isaac resource preload]',error);
        render();
        retry.textContent=paused?'继续下载':'重试下载';compatibility.hidden=paused;
        errorLabel.textContent=paused?'下载已暂停，可以调整并发后继续。':'下载未完成，已准备好的文件会保留。请重试；也可以先进入游戏，但临时加载仍可能卡顿。';
        errorLabel.hidden=false;actions.hidden=false;actions.style.display='flex';
        const choice=await new Promise(resolve=>{
          screen.querySelector('[data-retry]').onclick=()=>resolve('retry');
          screen.querySelector('[data-continue]').onclick=()=>resolve('continue');
        });
        if(choice==='continue') {window.isaacPreloadCompatibility=true;return;}
      }
    }
  } finally {
    closed=true;downloading=false;releaseWakeLock();
    document.removeEventListener('visibilitychange',visibilityChanged);
    window.removeEventListener('pagehide',pageLeaving);
    window.removeEventListener('pageshow',pageReturning);
    clearTimeout(presentationTimer);clearInterval(timer);screen.remove();
    if(overlay)overlay.hidden=wasHidden;
  }
}
