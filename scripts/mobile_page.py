"""Shared webpage patches for the APK and hosted web game; invoked in CI."""

from hashlib import sha256
import json
from pathlib import Path
import re
from typing import Any

# A run saved with mods aborts the game once those mods are gone. While saves are restored
# (before mods are seeded, as before), each run save is checked against the mods the mod list
# says will load; a run that needs a missing mod stays in the store and out of the game.
RUN_GUARD_CHECK = (
    "if(!modsOn)runGuard.useMods([]);else{try{const db=await openModDbForRuns();"
    "try{runGuard.useMods(db?loadableMods(await listMods(db),SEED_BUDGET):[]);}finally{db?.close();}}"
    "catch(e){runGuard.useMods(null);log(`  run check: mod list unavailable (${e.message}); runs restored as before`);}}"
    "log(`  run check: ${runGuard.loaded()?.length??'unknown'} mod(s) expected to load`);"
)
RUN_GUARD_PATCHES = (
    ('out.push({key:c.key,src:c.value.src,bytes:c.value.bytes});',
     'out.push({key:c.key,src:c.value.src,bytes:c.value.bytes,mods:c.value.mods});'),
    ('const saved=await readSaves();', RUN_GUARD_CHECK + 'const saved=await readSaves();'),
    ('for(const{key,src,bytes}of saved){const rel=src||key;',
     'for(const{key,src,bytes,mods}of saved){const rel=src||key;'
     'if(isRunState(key)){const d=runGuard.decide(mods);'
     'if(!d.restore){log(`  kept aside ${rel}: needs mods ${d.missing.join(\', \')}`);dropBody(bytes);continue;}'
     'if(d.stamp){persistPending.push({key,src,bytes:bytes.slice(),mods:runGuard.loaded()});flushSaves();}}'),
    ('persistPending.push({key,src,bytes});', 'persistPending.push({key,src,bytes,...runGuard.tag(key)});'),
    # Retired mods are removed right before mods are seeded, whatever happened to the save store.
    ('const r=await seedMods(modDb,seed,log,',
     'if(modDb)for(const id of RETIRED_MODS){try{if(await getModForRuns(modDb,id)){await deleteModForRuns(modDb,id);'
     'log(`  retired mod ${id} removed`);}}catch(e){log(`  retired mod ${id} not removed: ${e.message}`);}}'
     'const r=await seedMods(modDb,seed,log,'),
)


def apply_run_guard(boot_web: str) -> str:
    for before, after in RUN_GUARD_PATCHES:
        if boot_web.count(before) != 1:
            raise ValueError(f'Run guard insertion point changed: {before}')
        boot_web = boot_web.replace(before, after)
    return ("import{createRunGuard,isRunState,loadableMods,RETIRED_MODS}from'./mobile_run_guard.mjs';"
            "import{listMods,SEED_BUDGET,openModDb as openModDbForRuns,getMod as getModForRuns,deleteMod as deleteModForRuns}from'./mods.mjs';"
            "const runGuard=createRunGuard();window.isaacRunGuard=runGuard;" + boot_web)


def apply_mobile_page(page: str, module_dir: Path, data: dict[str, Any]) -> str:
    boot_cache_version = sha256(json.dumps(data, sort_keys=True, separators=(',', ':')).encode()).hexdigest()
    modules_match = re.search(r'window\.__isaacModules = (.*?);</script>', page, re.S)
    if not modules_match:
        raise ValueError('Missing inline modules')
    modules = json.loads(modules_match.group(1))
    modules['mobile_save_guard.mjs'] = (module_dir / 'save_guard.mjs').read_text()
    modules['mobile_recovery.mjs'] = (module_dir / 'recovery.mjs').read_text()
    modules['mobile_run_guard.mjs'] = (module_dir / 'run_guard.mjs').read_text()
    boot_web = modules['boot_web.mjs']
    flush_start = boot_web.index('function flushSaves(){')
    flush_end = boot_web.index('function readSaves(){', flush_start)
    boot_web = ("import{createSaveWriter}from'./mobile_save_guard.mjs';" + boot_web[:flush_start]
        + "const saveWriter=createSaveWriter({database:()=>saveDb,queue:persistPending,store:SAVE_STORE});"
          "function flushSaves(){saveWriter.flush().catch(error=>log(`  save store write FAILED: ${error.message}`));}"
          "window.isaacFlushSaves=()=>saveWriter.flush();"
        + boot_web[flush_end:])
    stats = 'window.isaacSaveStats=()=>({persisted,unlinked,pending:persistPending.length});'
    if boot_web.count(stats) != 1:
        raise ValueError('Save commit statistics insertion point changed')
    modules['boot_web.mjs'] = apply_run_guard(boot_web.replace(stats,
        'window.isaacSaveStats=()=>({persisted,unlinked,...saveWriter.stats()});'))
    modules['play.mjs'] = ("import{installRecovery}from'./mobile_recovery.mjs';"
        "installRecovery({readState:()=>readTouchState()});" + modules['play.mjs'])
    error_anchor = 'errorShown=true;renderProgress();'
    if modules['play.mjs'].count(error_anchor) != 1:
        raise ValueError('Crash report insertion point changed')
    modules['play.mjs'] = modules['play.mjs'].replace(error_anchor,
        'if(!ended)window.isaacCaptureCrash?.(title,text);' + error_anchor)
    reload_anchor = "$('reload-btn').addEventListener('click',()=>location.reload());"
    if modules['play.mjs'].count(reload_anchor) != 1:
        raise ValueError('Safe reload insertion point changed')
    modules['play.mjs'] = modules['play.mjs'].replace(reload_anchor,
        "$('reload-btn').addEventListener('click',async()=>{const button=$('reload-btn');button.disabled=true;"
        "try{await window.isaacFlushSaves?.();location.reload();}catch(error){button.disabled=false;"
        "button.textContent='保存未完成，点击重试';$('error-text').textContent+='\\n'+String(error.message||error);}});")
    modules['mobile_buttons.mjs'] = (module_dir / 'buttons.mjs').read_text()
    modules['mobile_performance.mjs'] = (module_dir / 'performance.mjs').read_text()
    modules['mobile_console.mjs'] = (module_dir / 'console.mjs').read_text()
    modules['mobile_frame_clock.mjs'] = (module_dir / 'frame_clock.mjs').read_text()
    modules['mobile_boot_cache.mjs'] = (module_dir / 'boot_cache.mjs').read_text()
    sound_read = 'const bytes=await portable.bytesFor(q.rel,q.off,q.len);'
    if modules['play.mjs'].count(sound_read) != 1:
        raise ValueError('Decoded startup sound cache insertion point changed')
    modules['play.mjs'] = "import{createSoundBootCache}from'./mobile_boot_cache.mjs';" + (
        f"const readCachedSound=createSoundBootCache('{boot_cache_version}',{data['files']['resources/packed/sfx.a']['size']});"
    ) + modules['play.mjs'].replace(sound_read,
        "const load=()=>portable.bytesFor(q.rel,q.off,q.len);"
        "const bytes=q.rel==='resources/packed/sfx.a'&&!q.off&&!q.len?await readCachedSound(load):await load();")
    yield_end = 'return waited})}__asyncjs__isaac_yield_js.sig="id";'
    yield_start = 'return Asyncify.handleAsync(async()=>{var waited=1;'
    if modules['boot.mjs'].count(yield_end) != 1 or modules['boot.mjs'].count(yield_start) != 1:
        raise ValueError('Engine yield pacing insertion point changed')
    # Diagnostics only: record main-thread time between yields and time spent waiting in one.
    modules['boot.mjs'] = modules['boot.mjs'].replace(yield_start,
        yield_start + 'var isaacYieldAt=performance.now();').replace(yield_end,
        'if(Module.isaacPaceFrame)await Module.isaacPaceFrame();'
        'if(typeof window!=="undefined"&&window.isaacRecordFrame)window.isaacRecordFrame(work,isaacYieldAt,performance.now());'
        + yield_end)
    lazy_read = 'var n=Module.isaacLazyPread(s,dst,off,len);'
    if modules['boot.mjs'].count(lazy_read) != 1:
        raise ValueError('Lazy read timing insertion point changed')
    # Diagnostics only: asynchronous file waits between yields are not main-thread work.
    modules['boot.mjs'] = modules['boot.mjs'].replace(lazy_read, lazy_read +
        'if(n&&typeof n.then==="function"&&typeof window!=="undefined"&&window.isaacTrackRead)n=window.isaacTrackRead(n);')
    sleep = 'let innerFunc=()=>new Promise(resolve=>setTimeout(resolve,ms));'
    if modules['boot.mjs'].count(sleep) != 1:
        raise ValueError('Engine sleep timing insertion point changed')
    # Diagnostics only: a native render-gate sleep is a wait, not main-thread work.
    modules['boot.mjs'] = modules['boot.mjs'].replace(sleep,
        'let innerFunc=()=>{let slept=new Promise(resolve=>setTimeout(resolve,ms));'
        'return typeof window!=="undefined"&&window.isaacTrackSleep?window.isaacTrackSleep(slept):slept};')
    config_anchor = 'const pads=createPads('
    if modules['boot_web.mjs'].count(config_anchor) != 1:
        raise ValueError('Engine frame clock configuration point changed')
    modules['boot_web.mjs'] = "import{createFramePacer}from'./mobile_frame_clock.mjs';" + modules['boot_web.mjs'].replace(
        config_anchor, "const cappedFramePacer=params.get('framepacer')!=='off';"
        "cfg.isaacPaceFrame=cappedFramePacer?createFramePacer():null;"
        "window.isaacPacingMode=cappedFramePacer?'capped60':'original-yield';" + config_anchor)
    controls = modules['touch_controls.mjs']
    controls = "import{createMobilePerformance}from'./mobile_performance.mjs';import{createMobileButtons}from'./mobile_buttons.mjs';" + controls
    input_anchor = 'const input=createTouchInput({readFrame:()=>state.frame,emit});'
    if controls.count(input_anchor) != 1:
        raise ValueError('Touch input clock insertion point changed')
    controls = controls.replace(input_anchor,
        "let inputFrame=0,inputSample='';const input=createTouchInput({readFrame:()=>{"
        "let sample=`menu:${state.frame}`;const guest=G(),game=guest&&guest.u32(0x00c71678);"
        "if(run&&mode==='game'&&game&&!state.cinematic&&!state.transit&&!state.cutscene&&!guest.u32(game+0x23a74))sample=`game:${guest.u32(game+0x264f8)}`;"
        "if(sample!==inputSample){inputSample=sample;inputFrame++;}return inputFrame;},emit});")
    anchor = 'const art={ready:false'
    if controls.count(anchor) != 1:
        raise ValueError('Mobile controls insertion point changed')
    controls = controls.replace(anchor,
        "const mobilePerformance=createMobilePerformance();const mobileButtons=createMobileButtons({root,input,state:()=>state,resetControls:reset,gesture,listen});" + anchor)
    patches = {
        "const key=Math.abs(dx)>Math.abs(dy)?(dx<0?'right':'left'):(dy<0?'down':'up');":
            "const key=Math.abs(dx)>Math.abs(dy)?(dx<0?'left':'right'):(dy<0?'up':'down');",
        "const again=stick===sticks.fire?relandBase(stick,cx,cy):null;if(again)placeStick(stick,again.x,again.y);else placeStick(stick,...clampBase(cx,cy));":
            "if(stick===sticks.fire)placeStick(stick,cx,cy);else placeStick(stick,...clampBase(cx,cy));",
        "const[bx,by]=clampBase(stick.bx+dx*pull,stick.by+dy*pull);":
            "const nextX=stick.bx+dx*pull,nextY=stick.by+dy*pull;const[bx,by]=stick===sticks.fire?[nextX,nextY]:clampBase(nextX,nextY);",
    }
    for before, after in patches.items():
        if controls.count(before) != 1:
            raise ValueError(f'Touch direction insertion point changed: {before}')
        controls = controls.replace(before, after)
    controls = controls.replace('input.update();}\nfunction frameLoop()',
                                "input.update();mobileButtons.update(mode);mobilePerformance.sample({...state,mode:mode==='off'&&run&&!state.paused?'game':mode,running:run});}\nfunction frameLoop()")
    # Preserve the upstream HUD, item bar and direct menu touch targets.
    # The native shell already fills the screen; a redundant HTML fullscreen
    # transition resets touch input during its first gameplay gesture.
    controls = controls.replace('function firstTouch(){',
                                'function firstTouch(){if(window.isaacNativeShell)return;try{if(window.parent!==window&&window.parent.document.fullscreenElement)return;}catch{}')
    if 'mobileButtons.update(mode)' not in controls:
        raise ValueError('Mobile controls update point changed')
    modules['touch_controls.mjs'] = controls
    visibility_pause = 'if(document.hidden)pauseHiddenRun();'
    if modules['play.mjs'].count(visibility_pause) != 1:
        raise ValueError('Background pause insertion point changed')
    modules['play.mjs'] = modules['play.mjs'].replace(visibility_pause,
        'if(document.hidden)window.isaacAndroidPause?.();')
    modules['play.mjs'] += '''
window.isaacAndroidPause = async()=>{
  if(!window.isaacMobileConsoleActive?.())return pauseHiddenRun();
  const visible=()=>new Promise(resolve=>{
    if(!document.hidden){resolve();return;}
    const changed=()=>{if(!document.hidden){document.removeEventListener('visibilitychange',changed);resolve();}};
    document.addEventListener('visibilitychange',changed);
  });
  await window.isaacMobileCloseConsole?.();
  await visible();
  await window.isaacMobileCloseConsole?.();
  await new Promise(resolve=>setTimeout(resolve,100));
  return pauseHiddenRun();
};
'''
    page = page[:modules_match.start(1)] + json.dumps(modules) + page[modules_match.end(1):]
    order = 'var order = ["boot.mjs"'
    if page.count(order) != 1:
        raise ValueError('Inline module dependency order changed')
    page = page.replace(order, 'var order = ["mobile_save_guard.mjs","mobile_run_guard.mjs","mobile_recovery.mjs","mobile_performance.mjs","mobile_console.mjs","mobile_buttons.mjs","mobile_frame_clock.mjs","mobile_boot_cache.mjs","boot.mjs"', 1)
    order_match = re.search(r'var order = (\[.*?\]);', page)
    if not order_match:
        raise ValueError('Missing module load order')
    loaded: set[str] = set()
    for name in json.loads(order_match.group(1)):
        for dependency in re.findall(r"from\s*['\"]\./([^'\"]+)['\"]", modules[name]):
            if dependency not in loaded:
                raise ValueError(f'{name}: dependency {dependency} is not loaded first')
        loaded.add(name)
    if loaded != set(modules):
        raise ValueError('Inline module registry and load order differ')
    return page
