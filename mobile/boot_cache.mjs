// Keep decoded, immutable startup sound data separate from saves and mod state.
export function createSoundBootCache(version, expectedBytes) {
  const stats = {sfx:'pending',bytes:0};
  window.isaacBootCacheStats = () => ({...stats});
  return async function read(load) {
    const started = performance.now();
    const key = new URL(`.decoded-boot/${version}/sfx.a`, location.href).href;
    let cache;
    try {
      cache = await caches.open('isaac-decoded-sound-v1');
      const response = await cache.match(key);
      if (response) {
        const bytes = new Uint8Array(await response.arrayBuffer());
        if (bytes.length === expectedBytes) {
          Object.assign(stats,{sfx:'hit',bytes:bytes.length,elapsedMs:performance.now()-started});
          return bytes;
        }
        await cache.delete(key);
      }
    } catch { cache = null; }
    const bytes = await load();
    stats.sfx = 'unavailable';
    if (cache && bytes?.length === expectedBytes) {
      try {
        await cache.put(key, new Response(bytes, {headers:{'Content-Type':'application/octet-stream'}}));
        stats.sfx = 'stored';
        // Delete only obsolete entries in this dedicated cache.
        for (const old of await cache.keys()) if (old.url !== key) await cache.delete(old);
      } catch { /* Storage quotas must never prevent a normal startup. */ }
    }
    stats.bytes = bytes?.length || 0;
    stats.elapsedMs = performance.now() - started;
    return bytes;
  };
}
