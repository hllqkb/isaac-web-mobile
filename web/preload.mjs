import {createVerifiedChunkCache} from './chunk_cache.mjs';

export async function prepareResources() {
  const cache=createVerifiedChunkCache({baseUrl:new URL('./',location.href).href});
  window.isaacFullChunkCache=cache;
  const overlay=document.getElementById('overlay'),wasHidden=overlay?.hidden;
  if(overlay)overlay.hidden=true;
  const screen=document.createElement('section');
  screen.setAttribute('aria-label','准备游戏资源');
  screen.style.cssText='position:fixed;inset:0;z-index:10000;display:grid;place-items:center;padding:24px;background:#1c1915;color:#e7d7bb;font:15px/1.7 system-ui;overflow:auto';
  screen.innerHTML=`<div style="width:min(100%,460px)">
    <h1 style="margin:0 0 12px;font-size:26px">准备游戏资源</h1>
    <p style="margin:0 0 20px">首次需要下载完整资源，之后会复用缓存，减少游戏中临时加载的停顿。</p>
    <progress max="1" value="0" aria-label="资源下载进度" style="width:100%;height:12px;accent-color:#bc9b6c"></progress>
    <p data-progress role="status" aria-live="polite">正在检查已下载的资源。</p>
    <p data-transfer style="margin:0 0 16px"></p>
    <p data-error role="alert" hidden></p>
    <div data-actions hidden style="display:none;gap:12px;flex-wrap:wrap">
      <button data-retry type="button">重试下载</button>
      <button data-continue type="button">先进入游戏</button>
    </div>
    <p style="font-size:13px;color:#bba98b">下载时请保持页面打开，网络中断会自动重试。<br>这里只下载游戏文件，不会修改存档。</p>
  </div>`;
  for(const button of screen.querySelectorAll('button'))button.style.cssText='min-height:44px;padding:8px 16px;border:1px solid #a78d69;border-radius:5px;background:#d8c7a8;color:#382d23;font:inherit;cursor:pointer';
  document.body.append(screen);
  const meter=screen.querySelector('progress'),label=screen.querySelector('[data-progress]');
  const errorLabel=screen.querySelector('[data-error]'),actions=screen.querySelector('[data-actions]');
  const transfer=screen.querySelector('[data-transfer]');
  let downloading=false,closed=false,pageActive=true,wakeLock=null,wakeRequest=null;
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
    const activity=state.activeFiles>1?` · ${state.activeFiles} 个文件同时下载`:'';
    const detail=`下载速度：${rate} · ${estimate}${activity}`;
    if(transfer.textContent!==detail)transfer.textContent=detail;
  }
  const timer=setInterval(render,500);
  try {
    for(;;) {
      actions.hidden=true;actions.style.display='none';errorLabel.hidden=true;
      downloading=true;requestWakeLock();
      window.isaacPreloadError=null;
      try {await cache.preload();window.isaacPreloadError=null;render();return;}
      catch(error) {
        downloading=false;releaseWakeLock();
        window.isaacPreloadError=String(error?.message||error);
        console.error('[isaac resource preload]',error);
        render();
        errorLabel.textContent='下载未完成，已准备好的文件会保留。请重试；也可以先进入游戏，但临时加载仍可能卡顿。';
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
    clearInterval(timer);screen.remove();
    if(overlay)overlay.hidden=wasHidden;
  }
}
