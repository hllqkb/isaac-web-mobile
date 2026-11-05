export function createResourceTransport({fetch: request, headerMs = 30000, idleMs = 30000, notify = () => {}}) {
  const active = new Map(), waiting = new Map();
  const totals = {attempts: 0, fallbacks: 0, failures: 0, timeouts: 0};
  let ticker = null, lastError = '';
  async function readWhole({key, url, check, read}) {
    // A fallback must identify the exact same repository, commit and file.
    const match = /^https:\/\/cdn\.jsdelivr\.net\/gh\/([^/@]+\/[^/@]+)@([a-f0-9]{40})\/(.+)$/.exec(url);
    const urls = [url];
    if (match) urls.push(`https://raw.githubusercontent.com/${match[1]}/${match[2]}/${match[3]}`);
    let failure;
    for (let attempt = 0; attempt < urls.length; attempt++) {
      const controller = new AbortController();
      const item = {received: 0, fallback: attempt > 0, phase: 'headers'};
      active.set(key, item);
      totals.attempts++; if (attempt) totals.fallbacks++;
      let timer, timedOut = false, rejectTimeout;
      const deadline = new Promise((_, reject) => { rejectTimeout = reject; });
      const arm = ms => {
        clearTimeout(timer);
        timer = setTimeout(() => {
          timedOut = true; totals.timeouts++;
          const error = new Error(`resource ${key}: ${item.phase} idle timeout`);
          rejectTimeout(error); controller.abort();
        }, ms);
      };
      arm(headerMs);
      try {
        const work = (async () => {
          const response = await request(urls[attempt], {signal: controller.signal});
          if (timedOut) throw new Error(`resource ${key}: request timed out`);
          item.phase = 'body'; arm(idleMs);
          if (!check(response)) {
            controller.abort();
            throw new Error(`resource ${key}: invalid whole response (HTTP ${response.status})`);
          }
          return await read(response, bytes => {
            if (timedOut) return;
            item.received += bytes;
            arm(idleMs);
          });
        })();
        const bytes = await Promise.race([work, deadline]);
        return bytes;
      } catch (error) {
        controller.abort(); failure = error;
      } finally {
        clearTimeout(timer);
        if (active.get(key) === item) active.delete(key);
      }
    }
    totals.failures++;
    throw new Error(`资源 ${key} 读取失败，已尝试 ${urls.length} 个固定版本源。${failure?.message || failure}`);
  }
  async function wait(promise, key) {
    const token = Symbol(key);
    lastError = '';
    // Separate tokens keep concurrent reads of one chunk from hiding each other.
    if (!ticker) ticker = setInterval(() => {
      const pending = [...waiting.values()].some(item => Date.now() - item.since >= 500);
      if (!pending) return;
      const item = [...waiting.values()].find(item => Date.now() - item.since >= 500);
      const current = active.get(item.key);
      notify(`${current?.fallback ? '资源连接重试中' : '正在读取游戏资源'}${current ? ` ${(current.received / 1048576).toFixed(1)} MB` : ''}，请稍候`);
    }, 250);
    waiting.set(token, {key, since: Date.now()});
    try { return await promise; }
    catch (error) { lastError = error.message || String(error); throw error; }
    finally {
      waiting.delete(token);
      if (!waiting.size) { clearInterval(ticker); ticker = null; notify(lastError); }
    }
  }
  return {readWhole, wait, summary: () => ({...totals, active: [...active].map(([key, item]) => ({key, ...item})), waiting: waiting.size})};
}
