// Use the game's own console so commands retain their normal game semantics.
export function readMobileRunState(current) {
  if (!current.ready || current.blocked || window.isaacDone) return null;
  const guest = window.isaacGuest;
  if (!guest) return null;
  try {
    const game = guest.u32(0x00c71678), manager = guest.u32(0x00c7169c);
    if (!game || !manager) return null;
    const frame = guest.u32(game + 0x264f8), room = guest.u32(game + 0x18300);
    const begin = guest.u32(game + 0x1baa8), end = guest.u32(game + 0x1baac);
    if (!frame || !room || !begin || end <= begin || end - begin > 64 || (end - begin) % 4) return null;
    const width = guest.u32(room + 0xc), height = guest.u32(room + 0x10);
    if (!width || width >= 64 || !height || height >= 64) return null;
    let dead = true;
    for (let at = begin; at < end; at += 4) {
      const player = guest.u32(at);
      if (!player || guest.u32(player + 0x28) !== 1) return null;
      dead = dead && guest.u8(player + 0x173) !== 0;
    }
    return {game, frame, dead};
  } catch { return null; }
}

export function createMobileConsole({root, state, gesture, resetControls, listen}) {
  const panel = document.createElement('section');
  panel.className = 'mobile-console'; panel.hidden = true;
  panel.setAttribute('aria-label', '游戏终端');
  panel.innerHTML = `<form><label for="mobile-command">游戏终端</label><input id="mobile-command" type="text" placeholder="输入命令，例如 rewind" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="send"><div><span role="status"></span><button type="submit">执行</button><button type="button" data-close>关闭</button></div></form>`;
  root.append(panel);
  const field = panel.querySelector('input'), form = panel.querySelector('form');
  const status = panel.querySelector('[role="status"]');
  const submit = panel.querySelector('[type="submit"]');
  let nativeOpen = false, busy = false, restorePause = false, activeTask = Promise.resolve();
  const held = new Set(), owner = 'mobile:console';
  const inject = (key, down) => {
    if (down) held.add(key); else held.delete(key);
    window.isaacInjectKey?.(key, down, owner);
  };
  const frames = (count) => new Promise((resolve, reject) => {
    const start = window.isaacFrame || 0;
    const since = performance.now();
    const poll = () => {
      if (document.hidden) return reject(new Error('已离开游戏，命令已取消'));
      if ((window.isaacFrame || 0) - start >= count) return resolve();
      if (performance.now() - since > 3000) return reject(new Error('游戏暂未响应，请回到游戏后重试'));
      setTimeout(poll, 16);
    };
    poll();
  });
  async function key(name) {
    inject(name, true);
    try { await frames(4); } finally { inject(name, false); }
    await frames(2);
  }
  const plain = {' ':'space','-':'minus','=':'equals','[':'lbracket',']':'rbracket',
    '\\':'backslash',';':'semicolon',"'":'quote',',':'comma','.':'period','/':'slash','`':'grave'};
  const shifted = {'!':'1','@':'2','#':'3','$':'4','%':'5','^':'6','&':'7','*':'8','(':'9',')':'0',
    '_':'minus','+':'equals','{':'lbracket','}':'rbracket','|':'backslash',':':'semicolon','"':'quote','<':'comma','>':'period','?':'slash','~':'grave'};
  function characters(text) {
    if (!text.trim() || text.length > 256) throw new Error('请输入 1 至 256 个字符的命令');
    return [...text].map(ch => {
      if (/^[a-z0-9]$/.test(ch)) return [ch, false];
      if (/^[A-Z]$/.test(ch)) return [ch.toLowerCase(), true];
      if (plain[ch]) return [plain[ch], false];
      if (shifted[ch]) return [shifted[ch], true];
      throw new Error('命令仅支持英文、数字和英文标点');
    });
  }
  async function typeCommand(text) {
    const sequence = characters(text);
    for (const [name, shift] of sequence) {
      if (shift) { inject('shift', true); await frames(1); }
      try { await key(name); } finally { if (shift) inject('shift', false); }
    }
    await key('enter');
  }
  async function ensureOpen() {
    const current = state();
    if (!current.ready || current.blocked || window.isaacDone)
      throw new Error('游戏尚未就绪或已经停止');
    if (nativeOpen) return;
    const dead = !!readMobileRunState(current)?.dead;
    if ((!current.running && !dead) || (current.cinematic && !dead))
      throw new Error('请进入游戏房间或死亡界面后使用');
    resetControls();
    restorePause = !!current.paused && !dead;
    if (restorePause) await key('escape');
    nativeOpen = true; await key('grave');
  }
  async function closeNative() {
    if (nativeOpen) {nativeOpen = false; await key('escape');}
    if (restorePause) { restorePause = false; await key('escape'); }
  }
  function run(action) {
    if (busy) return activeTask;
    busy = true; submit.disabled = true; status.textContent = '';
    activeTask = (async () => {
      try { await action(); }
      catch (error) { status.textContent = error.message; panel.hidden = false; }
      finally {
        for (const name of [...held]) inject(name, false);
        submit.disabled = false; busy = false;
      }
    })();
    return activeTask;
  }
  function open() {
    if (busy) return;
    gesture(); panel.hidden = false; field.focus({preventScroll:true});
    return run(ensureOpen);
  }
  async function close() {
    if (busy) await activeTask;
    if (document.hidden) return;
    field.blur();
    return run(async () => {await closeNative(); panel.hidden = true;});
  }
  function rewind() {
    return run(async () => {
      await ensureOpen(); await typeCommand('rewind'); await closeNative();
      panel.hidden = true;
    });
  }
  listen(form, 'submit', event => {
    event.preventDefault();
    const text = field.value;
    return run(async () => {
      characters(text); await ensureOpen(); await typeCommand(text);
      field.value = ''; status.textContent = '命令已发送';
    });
  });
  listen(panel.querySelector('[data-close]'), 'click', close);
  listen(field, 'keydown', event => {
    if (event.key === 'Escape') {event.preventDefault(); close();}
  });
  for (const type of ['pointerdown','pointermove','pointerup','pointercancel','click'])
    listen(panel, type, event => event.stopPropagation());
  listen(document, 'visibilitychange', () => {
    if (!document.hidden) return;
    for (const name of [...held]) inject(name, false);
    field.blur();
  });
  window.isaacMobileCloseConsole = close;
  window.isaacMobileConsoleActive = () => nativeOpen || busy;
  return {open, rewind};
}
