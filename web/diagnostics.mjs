// A bounded, local-only flight recorder. Never read or change save/mod contents.
const key = 'isaac-web-diagnostics-v1';
const limit = (value, size = 1000) => String(value ?? '').slice(0, size);
const read = name => { try { return window[name]?.(); } catch { return null; } };
let previous = null;
try { const text=localStorage.getItem(key); previous=text && text.length<=48000 ? JSON.parse(text) : null; } catch {}
const samples = [], errors = [];
let frame = null, advancedAt = performance.now(), persistedAt = -Infinity;
let current = null, opened = false, baseline = null, lastSampleAt = null, maxVisibleSampleGapMs = 0;
const started = new Date().toISOString();

const style = document.createElement('style');
style.textContent = `
  #isaac-diagnostics {position:fixed;inset:0;pointer-events:none;z-index:10010;color:#eee;font:13px/1.6 system-ui,-apple-system,sans-serif}
  #isaac-diagnostics [hidden] {display:none!important}
  #isaac-diagnostics button {min-height:44px;border:1px solid #ffffff40;border-radius:8px;background:rgba(28,28,28,.78);color:inherit;font:inherit;padding:8px 12px;cursor:pointer;touch-action:manipulation}
  #isaac-diagnostics button:focus-visible,#isaac-diagnostics textarea:focus-visible {outline:2px solid #fff;outline-offset:3px}
  #isaac-diagnostic-toggle {position:absolute;right:max(6px,env(safe-area-inset-right));top:48%;min-width:48px;pointer-events:auto}
  #isaac-diagnostic-panel {position:absolute;right:max(62px,calc(env(safe-area-inset-right) + 62px));top:max(12px,env(safe-area-inset-top));bottom:max(12px,env(safe-area-inset-bottom));width:min(400px,calc(100vw - 86px));box-sizing:border-box;overflow:auto;overscroll-behavior:contain;padding:16px;border:1px solid #ffffff40;border-radius:12px;background:rgba(22,22,22,.96);pointer-events:auto;touch-action:pan-y}
  #isaac-diagnostics h2 {font-size:16px;margin:0;font-weight:600}
  #isaac-diagnostics p {margin:10px 0;color:#ddd}
  #isaac-diagnostics .diagnostic-heading {display:flex;align-items:center;justify-content:space-between;gap:12px}
  #isaac-diagnostics dl {display:grid;grid-template-columns:90px minmax(0,1fr);gap:8px;margin:16px 0;font-variant-numeric:tabular-nums}
  #isaac-diagnostics dt {color:#bbb}#isaac-diagnostics dd {margin:0;overflow-wrap:anywhere;white-space:pre-wrap}
  #isaac-diagnostics .diagnostic-actions {display:flex;gap:8px;flex-wrap:wrap}
  #isaac-diagnostics textarea {box-sizing:border-box;width:100%;min-height:140px;margin-top:12px;background:#171717;color:#eee;border:1px solid #777;font:12px/1.5 monospace}
`;
const root = document.createElement('div'); root.id = 'isaac-diagnostics';
root.innerHTML = `<button id="isaac-diagnostic-toggle" type="button" aria-label="打开运行诊断" aria-expanded="false" aria-controls="isaac-diagnostic-panel">诊断</button>
  <section id="isaac-diagnostic-panel" aria-label="运行诊断" hidden>
    <div class="diagnostic-heading"><h2>运行诊断</h2><button type="button" data-close>关闭</button></div>
    <p data-status role="status"></p>
    <div class="diagnostic-actions"><button type="button" data-download>下载报告</button><button type="button" data-copy>复制摘要</button><button type="button" data-previous>下载上次快照</button></div>
    <dl></dl>
    <p>打开面板不会暂停游戏。报告仅保存在本机，不包含存档和 mod 文件内容。</p>
    <p data-result role="status"></p><textarea aria-label="诊断摘要，可手动复制" readonly hidden></textarea>
  </section>`;
document.head.append(style);
// The game fullscreen target is <main>; controls outside it disappear fullscreen.
(document.querySelector('main') || document.body).append(root);
const toggle = root.querySelector('#isaac-diagnostic-toggle');
const panel = root.querySelector('section');
const result = root.querySelector('[data-result]');
const previousButton = root.querySelector('[data-previous]');
previousButton.disabled = !previous;
const fields = new Map();
for (const label of ['画面帧数', '最近推进', '刷新节奏', '待取资源', '备用与失败', '待写存档', '最近错误', '上次快照']) {
  const term = document.createElement('dt'), value = document.createElement('dd');
  term.textContent = label; panel.querySelector('dl').append(term, value); fields.set(label, value);
}

// Isolate diagnostic clicks and keyboard shortcuts from the game's input handlers.
for (const type of ['pointerdown','pointerup','pointermove','pointercancel','click','keydown'])
  root.addEventListener(type, event => event.stopPropagation());
root.addEventListener('keydown', event => {
  if (event.key === 'Escape' && opened) { event.preventDefault(); show(false); }
});
function show(value) {
  opened = value; panel.hidden = !value;
  toggle.setAttribute('aria-expanded', String(value));
  toggle.setAttribute('aria-label', value ? '关闭运行诊断' : '打开运行诊断');
  if (value) { sample(); panel.querySelector('[data-close]').focus({preventScroll:true}); }
  else toggle.focus({preventScroll:true});
}
toggle.addEventListener('click', () => show(!opened));
panel.querySelector('[data-close]').addEventListener('click', () => show(false));

function status() {
  if (current.hidden) return '页面在后台，帧数不用于判断卡死';
  if (current.done !== null) return '引擎已结束或报错，请下载报告';
  if (current.frame === null) return '游戏正在初始化';
  if (current.resources?.waiting) return '游戏正在等待资源读取';
  if (current.sinceAdvanceMs >= 5000) return '画面帧超过 5 秒未推进，原因待确认';
  return '画面帧正在推进';
}
function render() {
  const message=status(), statusField=panel.querySelector('[data-status]');
  if (statusField.textContent!==message) statusField.textContent=message;
  const resource = current.resources, save = current.save;
  fields.get('画面帧数').textContent = `${current.frame ?? '尚未开始'} · 近段 ${current.framesPerSecond ?? '--'} 帧/秒`;
  fields.get('最近推进').textContent = `${(current.sinceAdvanceMs / 1000).toFixed(1)} 秒前`;
  fields.get('刷新节奏').textContent = `${current.refreshHz ?? '--'} Hz（浏览器回调估计）`;
  fields.get('待取资源').textContent = resource ? `${resource.waiting} 个等待，${resource.active.length} 个下载\n${resource.active.map(x => `${x.key}: ${(x.received/1048576).toFixed(1)} MB，${x.fallback ? '备用源' : '主源'}`).join('\n')}` : '尚未初始化';
  fields.get('备用与失败').textContent = resource ? `备用 ${resource.fallbacks} · 超时 ${resource.timeouts} · 最终失败 ${resource.failures}` : '--';
  fields.get('待写存档').textContent = save ? `${save.pending ?? '--'} 个待写 · ${save.inFlight ?? 0} 个写入中${save.lastError ? ` · ${limit(save.lastError,180)}` : ''}` : '尚未初始化';
  fields.get('最近错误').textContent = errors.at(-1)?.text || current.crash?.error || '暂未捕获';
  fields.get('上次快照').textContent = previous?.at || '暂无';
}
let refreshHz = null, refreshLast = null;
const refreshSamples = [];
function measureRefresh(now) {
  if (!document.hidden && refreshLast !== null && now - refreshLast > 0 && now - refreshLast < 100) {
    refreshSamples.push(now - refreshLast);
    if (refreshSamples.length > 60) refreshSamples.shift();
    if (refreshSamples.length >= 10) refreshHz = Math.round(1000 / (refreshSamples.reduce((n,x)=>n+x,0)/refreshSamples.length));
  }
  refreshLast = document.hidden ? null : now;
  if (refreshSamples.length < 60) requestAnimationFrame(measureRefresh);
}
requestAnimationFrame(measureRefresh);

function snapshot(details = false) {
  return {format:'isaac-web-diagnostics/1',version:'2026-11-05-diagnostics',started,at:current.at,
    page:location.origin + location.pathname,userAgent:navigator.userAgent,
    viewport:{width:innerWidth,height:innerHeight,dpr:devicePixelRatio},
    hardware:{cores:navigator.hardwareConcurrency,memoryGB:navigator.deviceMemory},
    current,samples:[...samples],errors:[...errors],
    log:(Array.isArray(window.isaacLog) ? window.isaacLog : []).slice(-24).map(line=>limit(line,400)),
    performance:details ? read('isaacPerfSummary') : null};
}
function persist() {
  // Only this small diagnostic key is written. Game databases are untouched.
  try {
    const value=snapshot(); value.performance=null;
    if (JSON.stringify(value).length>48000) {value.log=[];value.errors=value.errors.slice(-3);value.samples=value.samples.slice(-20);}
    const text=JSON.stringify(value);
    if (text.length<=48000) localStorage.setItem(key,text);
  } catch {}
  persistedAt = performance.now();
}
function sample() {
  const now = performance.now(), next = Number.isFinite(window.isaacFrame) ? window.isaacFrame : null;
  const sampleGapMs=lastSampleAt===null ? 0 : Math.round(now-lastSampleAt);
  if (!document.hidden && current && !current.hidden) maxVisibleSampleGapMs=Math.max(maxVisibleSampleGapMs,sampleGapMs);
  lastSampleAt=now;
  if (next !== frame) { frame = next; advancedAt = now; }
  const elapsed = baseline && !document.hidden && !baseline.hidden ? now - baseline.ms : 0;
  let rate = null;
  if (!document.hidden && baseline && !baseline.hidden && frame !== null && baseline.frame !== null && frame >= baseline.frame)
    rate = elapsed >= 500 ? Math.round((frame-baseline.frame)*10000/elapsed)/10 : current?.framesPerSecond ?? null;
  if (!baseline || elapsed >= 500 || document.hidden !== baseline.hidden) baseline = {ms:now,frame,hidden:document.hidden};
  const crash=read('isaacLastCrash');
  current = {at:new Date().toISOString(),frame,framesPerSecond:rate,refreshHz,
    sinceAdvanceMs:Math.round(now-advancedAt),sampleGapMs,maxVisibleSampleGapMs,hidden:document.hidden,focused:document.hasFocus(),
    done:window.isaacDone == null ? null : limit(window.isaacDone,1500),
    resources:read('isaacResourceStats'),save:read('isaacSaveStats'),cache:read('isaacBootCacheStats'),
    crash:crash ? {at:crash.at,title:limit(crash.title,256),error:limit(crash.error,2000)} : null};
  samples.push({at:current.at,frame,hidden:current.hidden,sampleGapMs,waiting:current.resources?.waiting ?? null,
    received:current.resources?.active.reduce((n,x)=>n+x.received,0) ?? null,pending:current.save?.pending ?? null});
  if (samples.length > 60) samples.shift();
  if (now-persistedAt>=5000) persist();
  if (opened) render();
}
function capture(event) {
  errors.push({at:new Date().toISOString(),type:event.type,text:limit(event.message || event.reason?.stack || event.reason || '资源或脚本加载失败',2000)});
  if (errors.length>8) errors.shift();
  sample(); persist();
}
addEventListener('error',capture); addEventListener('unhandledrejection',capture);
document.addEventListener('visibilitychange',()=>{baseline=null;advancedAt=performance.now();sample();persist();});
addEventListener('pagehide',()=>{sample();persist();});
function report() { sample(); return {...snapshot(true),previous}; }
window.isaacDiagnosticReport = report;
function download(value, suffix) {
  const blob = new Blob([JSON.stringify(value,null,2)],{type:'application/json'});
  const url = URL.createObjectURL(blob), anchor = document.createElement('a');
  anchor.href = url; anchor.download = `Isaac-Diagnostics-${new Date().toISOString().replace(/[:.]/g,'-')}${suffix}.json`;
  anchor.hidden = true; root.append(anchor); anchor.click(); anchor.remove();
  setTimeout(()=>URL.revokeObjectURL(url),60000); result.textContent='已生成诊断报告，请把文件发给排查者。';
}
panel.querySelector('[data-download]').addEventListener('click',()=>download(report(),''));
previousButton.addEventListener('click',()=>{if(previous)download(previous,'-previous');});
panel.querySelector('[data-copy]').addEventListener('click',async()=>{
  sample();
  const text = `以撒运行诊断 ${current.at}\n${status()}\n帧 ${current.frame}，近段 ${current.framesPerSecond ?? '--'} 帧/秒\n资源 ${JSON.stringify(current.resources)}\n存档 ${JSON.stringify(current.save)}\n错误 ${errors.map(x=>x.text).join('\n')}\n${navigator.userAgent}`.slice(0,2200);
  try {await navigator.clipboard.writeText(text);result.textContent='已复制简要诊断。';}
  catch {const field=panel.querySelector('textarea');field.hidden=false;field.value=text;field.focus();field.select();result.textContent='请长按或使用复制快捷键，复制下方摘要。';}
});
sample();setInterval(sample,1000);
