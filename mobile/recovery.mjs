export function installRecovery({readState}) {
  const crashKey = 'isaac-last-crash-v1';
  const readCrash = () => {try {return JSON.parse(localStorage.getItem(crashKey) || 'null');} catch {return null;}};
  window.isaacLastCrash = readCrash;
  function capture(title, text) {
    const lines = window.isaacLog || [];
    const excerpt = window.isaacCrashExcerpt ? window.isaacCrashExcerpt(lines) : lines.slice(-24);
    let state = null;
    try {state = readState();} catch {}
    const report = {at:new Date().toISOString(),title:String(title).slice(0,256),error:String(text || '').slice(0,6000),
      excerpt:excerpt.map(String).join('\n').slice(-16000),state,save:window.isaacSaveStats?.(),userAgent:navigator.userAgent};
    try {localStorage.setItem(crashKey, JSON.stringify(report));} catch {}
    // File writes can still finish after the Wasm stack has stopped.
    window.isaacFlushSaves?.().catch(() => {});
  }
  window.isaacCaptureCrash = capture;
  const copy = document.createElement('button');
  copy.type = 'button'; copy.textContent = '复制简要错误'; copy.id = 'copy-short-error';
  document.getElementById('copylog-btn')?.after(copy);
  copy.addEventListener('click', async () => {
    const report = readCrash();
    if (!report) return;
    const text = `${report.at}\n${report.title}\n${report.error}\n${report.excerpt}`.slice(0,2200);
    try {await navigator.clipboard.writeText(text); copy.textContent = '已复制';}
    catch {
      let field = document.getElementById('short-error-text');
      if (!field) {field = document.createElement('textarea');field.id='short-error-text';field.readOnly=true;field.rows=6;field.style.width='100%';document.getElementById('errlog')?.after(field);}
      field.value=text;field.focus();field.select();
    }
  });
  let saving = false;
  const delay = ms => new Promise(resolve => setTimeout(resolve,ms));
  const guest = () => window.isaacGuest;
  const pause = () => {const G=guest(),game=G?.u32(0xc71678);return game ? G.u32(game+0x23a74) : 0;};
  async function until(predicate) {
    const start=performance.now();
    while (!predicate()) {
      if (document.hidden || window.isaacDone || performance.now()-start>10000) throw new Error('游戏暂未完成保存操作');
      await delay(30);
    }
  }
  async function key(name) {
    const from=window.isaacFrame || 0;
    window.isaacInjectKey(name,true,'mobile:save-exit');
    try {await until(()=>(window.isaacFrame || 0)-from>=4);}
    finally {window.isaacInjectKey(name,false,'mobile:save-exit');}
    const released=window.isaacFrame || 0;
    await until(()=>(window.isaacFrame || 0)-released>=2);
  }
  const screen = () => {const G=guest(),menu=G?.u32(0xc72a20);return menu ? G.u32(menu+0x40) : -1;};
  window.isaacSaveAndExit = async () => {
    if (saving) return;
    const state=readState();
    if (!state.ready || !state.running || state.cinematic || state.blocked || window.isaacDone) return;
    saving=true;
    try {
      if (new URLSearchParams(location.search).get('persist')==='0') throw new Error('当前页面关闭了持久保存');
      await window.isaacMobileCloseConsole?.();
      if (!pause()) {await key('escape');await until(()=>pause()!==0);}
      // ESC backs out of options/My Stuff before selecting the native Exit row.
      for (let steps=0;pause()!==1&&steps<4;steps++) await key('escape');
      if (pause()!==1) throw new Error('未返回游戏暂停菜单');
      for (let steps=0;steps<8;steps++) {
        const G=guest(),game=G.u32(0xc71678),cursor=G.u32(game+0x23a7c);
        if (cursor===3) break;
        await key(cursor<3?'down':'up');
      }
      const G=guest(),game=G.u32(0xc71678);
      if (G.u32(game+0x23a7c)!==3) throw new Error('未定位到游戏原生退出选项');
      await key('enter');
      await until(()=>screen()===3&&!readState().running);
      await window.isaacFlushSaves?.();
    } catch (error) {
      capture('保存未完成',error.message);
      window.alert(`保存未完成：${error.message}`);
    } finally {saving=false;}
  };
}
