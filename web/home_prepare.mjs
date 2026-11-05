import {createVerifiedChunkCache,CHUNKS} from './chunk_cache.mjs';

// This component prepares bytes; the importer alone owns saves and DB transactions.
export function createHomePreparation({info,render}) {
  const baseUrl=new URL('../',import.meta.url).href;
  const resources=createVerifiedChunkCache({baseUrl});
  const preset=createVerifiedChunkCache({baseUrl,entries:info.parts.map(part=>({path:part.url,bytes:part.bytes,sha256:part.sha256})),cacheName:'isaac-preset-parts-v1-'+info.sha256});
  window.isaacFullChunkCache=resources;
  let active=false,closed=false,visible=true,held=null,request=null,timer=null;
  let presetReady=false,phase='checking',message='',downloading=false,pausing=false;
  const current=()=>phase==='preset'?preset:resources;
  function release() {
    const previous=held;held=null;
    if(previous)Promise.resolve(previous.release()).catch(()=>{});
  }
  function keepAwake() {
    if(!active||closed||!visible||document.hidden||held||request||!navigator.wakeLock?.request)return;
    request=Promise.resolve().then(()=>navigator.wakeLock.request('screen')).then(lock=>{
      if(!active||closed||!visible||document.hidden){Promise.resolve(lock.release()).catch(()=>{});return;}
      held=lock;lock.addEventListener('release',()=>{if(held===lock)held=null;});
    }).catch(()=>{}).finally(()=>{request=null;});
  }
  const visibility=()=>{if(document.hidden)release();else keepAwake();};
  const leaving=()=>{visible=false;release();};
  const returning=()=>{visible=true;keepAwake();};
  function update() {
    const state=current().summary(),game=resources.summary(),config=preset.summary();
    const total=info.bytes+game.total;
    const ready=Math.min(total,(presetReady?info.bytes:config.received)+game.received);
    const speed=state.bytesPerSecond,usable=active&&downloading&&Number.isFinite(speed)&&speed>0;
    const rate=usable?(speed>=1048576?`${(speed/1048576).toFixed(1)} MiB/s`:`${(speed/1024).toFixed(0)} KiB/s`):'正在测速';
    let estimate='正在估算剩余时间';
    if(!active)estimate='已准备好的数据会保留';
    else if(!downloading)estimate='正在检查或写入数据';
    else if(state.retrying)estimate='连接中断，正在重试';
    else if(usable){
      const eta=phase==='resources'?state.etaSeconds:Math.max(0,total-ready)/speed;
      if(Number.isFinite(eta)&&eta>=0){const seconds=Math.ceil(eta);estimate=`预计约 ${Math.floor(seconds/60)?Math.floor(seconds/60)+' 分 ':''}${seconds%60} 秒`;}
    }
    render({value:total?Math.min(100,ready/total*100):0,
      label:state.retrying&&downloading?'连接中断，正在自动重试。':message,
      detail:`${(ready/1048576).toFixed(1)} / ${(total/1048576).toFixed(1)} MiB · ${downloading?rate+' · ':''}${estimate}`,
      canPause:active&&downloading&&!pausing,showPause:active&&downloading});
  }
  return {
    start() {
      active=true;phase='checking';downloading=false;pausing=false;
      document.addEventListener('visibilitychange',visibility);
      window.addEventListener('pagehide',leaving);window.addEventListener('pageshow',returning);
      keepAwake();if(!timer)timer=setInterval(update,500);update();
    },
    async downloadPreset() {
      phase='preset';downloading=true;message='正在准备存档和 mod。';update();
      await preset.preload();
      if(preset.summary().completed!==info.parts.length)throw Error('配置尚未全部准备好，请继续下载。');
      downloading=false;phase='install';update();
    },
    readPreset(url) {return preset.readWhole(new URL(url,baseUrl).href);},
    presetReady() {presetReady=true;message='存档和 mod 已准备好。';update();},
    notice(text) {message=text;update();},
    async resources() {
      presetReady=true;phase='resources';downloading=true;message='正在准备游戏资源，完成后自动进入。';
      window.isaacPreloadError=null;update();await resources.preload();
      if(resources.summary().completed!==CHUNKS.length)throw Error('游戏资源尚未全部准备好，请继续下载。');
      window.isaacPreloadError=null;
      downloading=false;message='准备完成，正在进入游戏。';update();
    },
    async pause() {
      if(!active||!downloading||pausing)return;
      pausing=true;message='正在暂停下载。';update();
      await current().pause();
    },
    stop(error) {
      active=false;downloading=false;
      if(error){message=error.name==='AbortError'?'下载已暂停，点击继续下载。':String(error.message||error);window.isaacPreloadError=error.name==='AbortError'?null:message;}update();
      clearInterval(timer);timer=null;release();
      document.removeEventListener('visibilitychange',visibility);
      window.removeEventListener('pagehide',leaving);window.removeEventListener('pageshow',returning);
    },
    close() {closed=true;this.stop();}
  };
}
