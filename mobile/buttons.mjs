import {createMobileConsole, readMobileRunState} from './mobile_console.mjs';

export function createMobileButtons({root, input, state, resetControls = () => input.reset(), gesture, listen}) {
  const style = document.createElement('style');
  style.textContent = `
    .mobile-tools {position:fixed;top:28vh;left:max(6px,env(safe-area-inset-left));display:grid;grid-template-columns:44px;grid-auto-rows:44px;gap:6px;width:44px;pointer-events:none;z-index:9}
    .mobile-tool-backdrop {position:fixed;inset:0;pointer-events:auto;z-index:8}
    .mobile-tool-options {position:absolute;left:calc(100% + 6px);top:0;display:flex;flex-direction:column;gap:4px;pointer-events:none}
    @media (pointer:coarse) and (orientation:landscape) {
      #stage {max-width:calc(100vw - 100px - 2 * max(6px,env(safe-area-inset-left),env(safe-area-inset-right)))}
    }
    #touch-controls .mobile-extra {box-sizing:border-box;width:72px;height:48px;min-width:72px;min-height:48px;padding:0 8px;border:1px solid #ffffff33;border-radius:8px;background:rgba(24,24,24,.65);color:#fff;font:500 13px/1.2 system-ui;touch-action:none;user-select:none;pointer-events:auto}
    #touch-controls .mobile-extra.is-down {background:rgba(72,72,72,.85);border-color:#ffffff80}
    #touch-controls .mobile-extra[aria-busy=true] {background:rgba(72,72,72,.85);border-color:#ffffff80}
    #touch-controls .mobile-extra:disabled {opacity:.4}
    #touch-controls .mobile-extra:focus-visible {outline:2px solid #fff;outline-offset:3px}
    #touch-controls .mobile-tools>.mobile-extra {width:44px;height:44px;min-width:44px;min-height:44px;padding:0;font-size:12px}
    #touch-controls .mobile-tool-options .mobile-extra {width:88px;min-width:88px}
    #touch-controls .mobile-menu-e {position:fixed;transform:translate(-50%,-50%);z-index:8}
    #touch-controls [hidden] {display:none!important}
    .mobile-performance {position:fixed;inset:0;z-index:20;background:#121212f5;color:#eee;padding:24px;overflow:auto;font:16px/1.6 system-ui;pointer-events:auto}
    .mobile-performance p,.mobile-performance .mobile-fps {display:block;max-width:620px;margin:12px auto;overflow-wrap:anywhere}
    .mobile-performance .mobile-fps {font-size:20px;color:#fff}
    .mobile-performance div {display:flex;justify-content:center;margin-top:24px}
    #touch-controls .mobile-performance button {min-width:96px;color:#fff}
    .mobile-console {position:fixed;inset:0;z-index:21;pointer-events:auto;background:#0003;display:flex;align-items:flex-end;padding:8px max(8px,env(safe-area-inset-right)) max(8px,env(safe-area-inset-bottom)) max(8px,env(safe-area-inset-left));box-sizing:border-box}
    .mobile-console form {width:min(100%,640px);margin:0 auto;padding:12px;border:1px solid #ffffff33;border-radius:8px;background:#181818ed;color:#fff;font:14px/1.4 system-ui;box-sizing:border-box}
    .mobile-console label {display:block;margin-bottom:8px}
    .mobile-console input {box-sizing:border-box;width:100%;height:44px;padding:8px 10px;border:1px solid #ffffff55;border-radius:6px;background:#ffffff12;color:#fff;font:16px/1.4 system-ui}
    .mobile-console form>div {display:flex;align-items:center;gap:8px;margin-top:8px}
    .mobile-console [role=status] {flex:1;min-width:0;overflow-wrap:anywhere}
    .mobile-console button {min-height:44px;padding:0 16px;border:1px solid #ffffff33;border-radius:6px;background:#ffffff12;color:#fff;font:500 14px system-ui}
    .mobile-console button:disabled {opacity:.5}
  `;
  const tools = document.createElement('div'); tools.className = 'mobile-tools'; tools.hidden = true;
  const toolOptions = document.createElement('div'); toolOptions.className = 'mobile-tool-options'; toolOptions.hidden = true;
  toolOptions.id = 'mobile-tool-options'; toolOptions.setAttribute('role', 'group'); toolOptions.setAttribute('aria-label', '游戏工具');
  const backdrop = document.createElement('div'); backdrop.className = 'mobile-tool-backdrop'; backdrop.hidden = true;
  const panel = document.createElement('section'); panel.className = 'mobile-performance'; panel.hidden = true;
  panel.setAttribute('aria-label', '性能诊断');
  const fps = document.createElement('span'); fps.className = 'mobile-fps'; fps.textContent = 'FPS --';
  root.append(style, backdrop, tools, panel); panel.append(fps);
  const terminal = createMobileConsole({root,state,gesture,resetControls,listen});
  let dropHold = null;
  const tapGestures = new Set();
  const cancelTaps = () => {for (const cancel of [...tapGestures]) cancel();};
  const tapContext = () => {
    const value = state();
    return [value.ready,value.blocked,value.running,value.paused,value.menu,value.cinematic,
      value.transit,value.cutscene,window.isaacDone,!!window.isaacMobileConsoleActive?.()].join(':');
  };
  listen(window, 'blur', cancelTaps);
  listen(document, 'visibilitychange', () => {if (document.hidden) cancelTaps();});
  const button = (parent, label, id, binding, tap = false) => {
    const el = document.createElement('button'); el.type = 'button'; el.textContent = label;
    el.className = 'mobile-extra'; el.dataset.mobileAction = id;
    const owner = `mobile:${id}`;
    if (tap) {
      let pending = null;
      const cancel = () => {pending = null; el.classList.remove('is-down'); tapGestures.delete(cancel);};
      const inside = event => {
        const box = el.getBoundingClientRect();
        return event.clientX >= box.left && event.clientX <= box.right && event.clientY >= box.top && event.clientY <= box.bottom;
      };
      const available = () => !el.disabled && !el.hidden && !tools.hidden && state().ready && !state().blocked && !document.hidden;
      const stop = event => {event.preventDefault(); event.stopPropagation();};
      listen(el, 'pointerdown', event => {
        stop(event);
        if (tapGestures.size) {cancelTaps(); return;}
        if (!available() || event.button !== 0 || !inside(event)) return;
        pending = {id:event.pointerId,x:event.clientX,y:event.clientY,time:performance.now(),context:tapContext()};
        tapGestures.add(cancel); el.classList.add('is-down');
        try {el.setPointerCapture(event.pointerId);} catch {}
      });
      listen(el, 'pointermove', event => {
        stop(event);
        if (pending?.id === event.pointerId && (!inside(event) || Math.hypot(event.clientX-pending.x,event.clientY-pending.y)>10)) cancel();
      });
      listen(el, 'pointerup', event => {
        stop(event);
        if (pending?.id !== event.pointerId) return;
        const valid = available() && inside(event) && Math.hypot(event.clientX-pending.x,event.clientY-pending.y)<=10 &&
          performance.now()-pending.time<=650 && pending.context===tapContext();
        cancel();
        if (valid) {gesture(); binding(owner,true); binding(owner,false);}
      });
      for (const type of ['pointercancel','lostpointercapture','pointerleave']) listen(el,type,event=>{
        stop(event); if (pending?.id===event.pointerId) cancel();
      });
      // Keyboard and assistive activation emit a zero-detail click; pointer clicks were handled above.
      listen(el,'click',event=>{stop(event);if(event.detail===0 && available() && !tapGestures.size){gesture();binding(owner,true);binding(owner,false);}});
      new MutationObserver(() => cancel())
        .observe(el,{attributes:true,attributeFilter:['disabled','hidden']});
    } else {
      listen(el, 'pointerdown', event => {
        event.preventDefault(); event.stopPropagation();
        if (el.disabled || !state().ready || state().blocked) return;
        gesture(); el.setPointerCapture(event.pointerId); el.classList.add('is-down');
        binding(owner, true);
      });
      const release = event => {
        event.preventDefault(); event.stopPropagation();
        if (!el.classList.contains('is-down')) return;
        el.classList.remove('is-down'); binding(owner, false);
      };
      for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) listen(el, type, release);
      listen(el, 'pointermove', event => {event.preventDefault(); event.stopPropagation();});
      listen(el, 'click', event => {event.preventDefault(); event.stopPropagation();});
    }
    parent.append(el); return el;
  };
  button(tools, 'Enter', 'enter', (owner, down) => {if (down) {releaseDrop(); input.tap(owner, 'enter');}}, true)
    .setAttribute('aria-label', '回车 Enter，跳过过场');
  const swap = button(tools, 'Ctrl', 'swap', (owner, down) => {if (down && !dropHold) input.tap(owner, 'ctrl');}, true);
  swap.setAttribute('aria-label', '切换 Ctrl');
  const drop = button(tools, '丢弃', 'drop', (_owner, down) => {if (down) startDrop();}, true);
  drop.setAttribute('aria-label', '长按 Ctrl 丢弃饰品和卡牌');
  drop.setAttribute('aria-busy', 'false');
  function releaseDrop() {
    if (!dropHold) return;
    window.isaacInjectKey?.('ctrl', false, 'mobile:drop');
    dropHold = null; drop.textContent = '丢弃'; drop.setAttribute('aria-busy', 'false');
  }
  function startDrop() {
    const current = state(), run = readMobileRunState(current);
    if (dropHold || !current.running || current.paused || current.cinematic || !run || run.dead ||
        window.isaacMobileConsoleActive?.()) return;
    resetControls();
    dropHold = {game:run.game, start:run.frame, last:run.frame, progressAt:performance.now()};
    drop.textContent = '丢弃中'; drop.setAttribute('aria-busy', 'true');
    window.isaacInjectKey?.('ctrl', true, 'mobile:drop');
  }
  listen(document, 'visibilitychange', () => {if (document.hidden) releaseDrop();});
  listen(window, 'blur', releaseDrop);
  const toggle = button(tools, '工具', 'tools', (_owner, down) => {if (down) expandTools(toolOptions.hidden);}, true);
  toggle.classList.add('mobile-tool-toggle'); toggle.setAttribute('aria-expanded', 'false');
  toggle.setAttribute('aria-controls', toolOptions.id); tools.append(toolOptions);
  function expandTools(expanded) {
    toolOptions.hidden = !expanded; backdrop.hidden = !expanded;
    toggle.setAttribute('aria-expanded', String(expanded));
  }
  for (const type of ['pointerdown','pointermove','pointerup','pointercancel','click']) listen(backdrop, type, event => {
    event.preventDefault(); event.stopPropagation();
    if (type === 'pointerdown') expandTools(false);
  });
  function placeTools() {
    if (tools.hidden) return;
    const box = document.getElementById('stage')?.getBoundingClientRect();
    if (!box) return;
    tools.style.left = 'max(6px,env(safe-area-inset-left))';
    const safeLeft = parseFloat(getComputedStyle(tools).left) || 6;
    const gutter = box.left - safeLeft;
    const width = tools.offsetWidth, height = tools.offsetHeight;
    if (gutter >= width + 6) tools.style.left = `${safeLeft + (gutter - width - 6) / 2}px`;
    const top = gutter < width + 6 && box.top >= height + 16
      ? (box.top - height) / 2 : box.top + (box.height - height) / 2;
    tools.style.top = `${Math.max(8, Math.min(top, innerHeight - height - 8))}px`;
  }
  listen(window, 'resize', placeTools);
  listen(document, 'fullscreenchange', placeTools);
  const menuE = button(root, '表里 E', 'menu-e', (owner, down) => {if (down) input.tap(owner, 'e');});
  menuE.classList.add('mobile-menu-e'); menuE.hidden = true;
  menuE.setAttribute('aria-label', '切换表里角色 E');
  function placeMenuE() {
    if (menuE.hidden) return;
    const box = document.getElementById('stage')?.getBoundingClientRect();
    if (!box) return;
    // Character selection only handles direction/confirm taps above game y=200.
    menuE.style.left = `${box.left + box.width / 2}px`;
    menuE.style.top = `${box.top + Math.max(box.height * 0.86, box.height * 200 / 270 + 28)}px`;
  }
  listen(window, 'resize', placeMenuE);
  const rewind = button(toolOptions, '回溯', 'rewind', (_owner, down) => {if (down) {releaseDrop(); expandTools(false); terminal.rewind();}});
  rewind.setAttribute('aria-label', '回溯至上一间房 rewind');
  const consoleButton = button(toolOptions, '终端', 'console', (_owner, down) => {if (down) {releaseDrop(); expandTools(false); terminal.open();}});
  const saveExit = button(toolOptions, '保存退出', 'save-exit', (_owner, down) => {
    if (down) {releaseDrop(); expandTools(false); window.isaacSaveAndExit?.();}
  });
  const diagnostics = button(toolOptions, '诊断', 'performance', (_owner, down) => {
    if (down) {expandTools(false); panel.hidden = false; renderPanel();}
  });
  for (const type of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel']) listen(panel, type, event => event.stopPropagation());
  const description = document.createElement('p');
  description.textContent = '渲染帧率、游戏更新速度和最近帧时间。';
  const details = document.createElement('p');
  const crashDetails = document.createElement('p'); crashDetails.hidden = true; crashDetails.style.whiteSpace = 'pre-wrap';
  const choices = document.createElement('div'); panel.append(description, details, crashDetails, choices);
  button(choices, '关闭', 'close-performance', (_owner, down) => {if (down) panel.hidden = true;});
  function renderPanel() {
    const gl = document.getElementById('canvas')?.getContext('webgl2');
    const ext = gl?.getExtension('WEBGL_debug_renderer_info');
    const renderer = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : '未公开';
    const perf = window.isaacPerfSummary?.();
    const timing = perf?.samples ? `；帧时间 P95 ${perf.p95Ms.toFixed(1)} ms，最大 ${perf.maxMs.toFixed(0)} ms，超过 100 ms ${perf.over100} 次` : '';
    details.textContent = `${fps.textContent}；游戏更新 ${fps.dataset.updates || '--'} 次/秒${timing}；渲染器：${renderer}；${navigator.userAgent}`;
    const crash = window.isaacLastCrash?.();
    crashDetails.hidden = !crash;
    crashDetails.textContent = crash ? `上次错误：${String(crash.title || '').slice(0,400)}\n${String(crash.error || '').slice(0,400)}` : '';
  }
  let lastTime = performance.now(), lastFrame = 0, lastUpdate = 0, lastCounter = null, lastToolsContext = '';
  return {update(mode) {
    const current = state();
    const run = readMobileRunState(current), dead = !!run?.dead;
    const skipping = !!(current.cinematic || current.transit || current.cutscene);
    const showTools = current.ready && !current.blocked && !window.isaacDone && ['game','menu'].includes(mode);
    if (showTools === tools.hidden) {tools.hidden = !showTools; if (showTools) placeTools();}
    const canConsole = showTools && (current.running || dead) && (!skipping || dead);
    const canDrop = !!run && !dead && current.running && !current.paused && !skipping && !window.isaacMobileConsoleActive?.();
    if (dropHold) {
      if (!showTools || !canDrop || document.hidden || run.game !== dropHold.game || run.frame < dropHold.last) releaseDrop();
      else {
        if (run.frame !== dropHold.last) {dropHold.last = run.frame; dropHold.progressAt = performance.now();}
        // Drop requires three seconds; 96 actual 30 Hz updates include a small margin.
        if (run.frame - dropHold.start >= 96 || performance.now() - dropHold.progressAt > 5000) releaseDrop();
      }
    }
    swap.disabled = !canDrop || !!dropHold;
    drop.disabled = !canDrop || !!dropHold;
    const toolsContext = `${showTools}:${!!current.paused}:${mode}:${skipping}:${dead}`;
    if (toolsContext !== lastToolsContext) {cancelTaps(); expandTools(false); lastToolsContext = toolsContext;}
    rewind.hidden = !!current.paused && !dead;
    rewind.disabled = consoleButton.disabled = !canConsole;
    saveExit.hidden = !current.running || dead || !showTools;
    saveExit.disabled = skipping || typeof window.isaacSaveAndExit !== 'function';
    diagnostics.hidden = current.running && !current.paused && !dead;
    const showE = mode === 'menu' && current.menu === 5 && !current.running;
    if (showE === menuE.hidden) {menuE.hidden = !showE; placeMenuE();}
    if (performance.now() - lastTime >= 1000) {
      let update = 0, counter = 'menu', paused = false;
      if (current.running && window.isaacGuest) {
        const guest = window.isaacGuest, game = guest.u32(0x00c71678);
        if (game) {
          update = guest.u32(game+0x264f8); counter = 'game';
          paused = guest.u32(game+0x23a74) !== 0;
        }
      }
      const seconds = (performance.now()-lastTime)/1000;
      const rate = Math.max(0, (current.frame-lastFrame)/seconds);
      fps.dataset.updates = counter === 'game' && lastCounter === counter && !paused && update >= lastUpdate
        ? ((update-lastUpdate)/seconds).toFixed(0) : '';
      fps.textContent = paused ? '已暂停' : `渲染 ${rate.toFixed(0)} FPS`;
      lastTime = performance.now(); lastFrame = current.frame; lastUpdate = update; lastCounter = counter;
      if (!panel.hidden) renderPanel();
    }
  }};
}
