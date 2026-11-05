export function createMobilePerformance() {
  const intervals = new Float64Array(1200);
  let cursor = 0, count = 0, totalSamples = 0;
  let previousFrame = null, previousTime = 0;

  const invalidate = () => { previousFrame = null; previousTime = 0; };
  // A hidden page may receive no frame callbacks until it becomes visible again.
  document.addEventListener('visibilitychange', invalidate);

  function sample(state) {
    if (!state?.ready || !state.running || state.paused || state.blocked ||
        (state.mode && state.mode !== 'game') ||
        state.hidden || document.hidden || !Number.isFinite(state.frame)) {
      invalidate();
      return;
    }
    const frame = state.frame;
    if (frame === previousFrame) return;
    const now = performance.now();
    if (previousFrame !== null && frame > previousFrame && now > previousTime) {
      intervals[cursor] = now - previousTime;
      cursor = (cursor + 1) % intervals.length;
      count = Math.min(count + 1, intervals.length);
      totalSamples++;
    }
    previousFrame = frame;
    previousTime = now;
  }

  function read(name) {
    try { return typeof window[name] === 'function' ? window[name]() : null; }
    catch { return null; }
  }

  function summary() {
    // Sorting and engine statistics are read only when the panel asks for them.
    const sorted = Array.from(intervals.subarray(0, count)).sort((a, b) => a - b);
    const rounded = value => Math.round(value * 100) / 100;
    const percentile = fraction => count ? rounded(sorted[Math.ceil(count * fraction) - 1]) : null;
    const lazy = read('isaacLazyStats');
    return {
      samples: count,
      totalSamples,
      durationSeconds: rounded(sorted.reduce((sum, value) => sum + value, 0) / 1000),
      p50Ms: percentile(0.5),
      p95Ms: percentile(0.95),
      p99Ms: percentile(0.99),
      maxMs: count ? rounded(sorted[count - 1]) : null,
      over50: sorted.filter(value => value > 50).length,
      over100: sorted.filter(value => value > 100).length,
      spikesMs: sorted.slice(-10).reverse().map(rounded),
      lazy: lazy ? {
        reader: lazy.reader,
        windows: lazy.windows,
        windowBytes: lazy.windowBytes,
        distinctWindows: lazy.distinctWindows,
        readerWaits: lazy.readerWaits,
        readerWaitMs: lazy.readerWaitMs,
        prefetchHits: lazy.prefetchHits,
        prefetchMisses: lazy.prefetchMisses,
        aheadFetched: lazy.aheadFetched,
        top: lazy.top,
      } : null,
      runTrail: read('isaacRunTrail'),
    };
  }

  function reset() {
    cursor = 0;
    count = 0;
    totalSamples = 0;
    invalidate();
  }

  window.isaacPerfSummary = summary;
  return {sample, summary, reset};
}
