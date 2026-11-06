// One page-wide draw counter; wrapping twice would double count.
const drawCalls = () => window.__isaacDrawCalls || 0;
function countDrawCalls() {
  for (const type of [window.WebGL2RenderingContext, window.WebGLRenderingContext]) {
    const proto = type?.prototype;
    if (!proto || Object.prototype.hasOwnProperty.call(proto, '__isaacDrawCount')) continue;
    Object.defineProperty(proto, '__isaacDrawCount', {value: true});
    for (const name of ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced', 'drawRangeElements']) {
      const original = proto[name];
      if (typeof original !== 'function') continue;
      proto[name] = function (...args) { window.__isaacDrawCalls = drawCalls() + 1; return original.apply(this, args); };
    }
  }
}

export function createMobilePerformance() {
  const intervals = new Float64Array(1200);
  let cursor = 0, count = 0, totalSamples = 0;
  let previousFrame = null, previousTime = 0;

  // Engine cost per yield: main-thread time between yields, time spent waiting in
  // the yield (vsync, pacer, other tasks) and draw calls issued in between.
  const COST = 600;
  const busy = new Float64Array(COST), wait = new Float64Array(COST), work = new Float64Array(COST), draws = new Float64Array(COST), reads = new Float64Array(COST);
  let costCursor = 0, costCount = 0, costActive = false, lastExit = null, drawsAtExit = 0, readMs = 0, readsAtExit = 0;
  countDrawCalls();
  // The engine awaits one file read at a time; that wait yields the main thread.
  window.isaacTrackRead = pending => {
    const started = performance.now();
    const done = () => { readMs += performance.now() - started; };
    return Promise.resolve(pending).then(value => { done(); return value; }, error => { done(); throw error; });
  };
  function recordFrame(engineWork, enteredAt, exitedAt) {
    if (costActive && lastExit !== null && enteredAt >= lastExit && exitedAt >= enteredAt) {
      reads[costCursor] = readMs - readsAtExit;
      busy[costCursor] = Math.max(0, enteredAt - lastExit - reads[costCursor]);
      wait[costCursor] = exitedAt - enteredAt;
      work[costCursor] = Number.isFinite(engineWork) ? engineWork : NaN;
      draws[costCursor] = drawCalls() - drawsAtExit;
      costCursor = (costCursor + 1) % COST;
      costCount = Math.min(costCount + 1, COST);
    }
    lastExit = costActive ? exitedAt : null;
    drawsAtExit = drawCalls();
    readsAtExit = readMs;
  }
  window.isaacRecordFrame = recordFrame;

  const invalidate = () => { previousFrame = null; previousTime = 0; costActive = false; lastExit = null; };
  // A hidden page may receive no frame callbacks until it becomes visible again.
  document.addEventListener('visibilitychange', invalidate);

  function sample(state) {
    if (!state?.ready || !state.running || state.paused || state.blocked ||
        (state.mode && state.mode !== 'game') ||
        state.hidden || document.hidden || !Number.isFinite(state.frame)) {
      invalidate();
      return;
    }
    costActive = true;
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

  function cost() {
    const rounded = value => Math.round(value * 10) / 10;
    const stats = values => {
      const sorted = Array.from(values.subarray(0, costCount)).filter(Number.isFinite).sort((a, b) => a - b);
      const at = fraction => sorted.length ? rounded(sorted[Math.ceil(sorted.length * fraction) - 1]) : null;
      return {p50: at(0.5), p95: at(0.95), max: sorted.length ? rounded(sorted[sorted.length - 1]) : null, sorted};
    };
    const b = stats(busy), w = stats(wait), e = stats(work), d = stats(draws), r = stats(reads);
    return {
      frames: costCount,
      busyMs: {p50: b.p50, p95: b.p95, max: b.max},
      busyOver16: b.sorted.filter(value => value > 1000 / 60).length,
      busyOver33: b.sorted.filter(value => value > 1000 / 30).length,
      waitMs: {p50: w.p50, p95: w.p95, max: w.max},
      fileWaitMs: {p95: r.p95, max: r.max, frames: r.sorted.filter(value => value > 0.5).length},
      engineWorkMs: {p50: e.p50, p95: e.p95, max: e.max},
      drawCalls: {p50: d.p50, p95: d.p95, max: d.max},
    };
  }
  window.isaacFrameCost = cost;

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
      engine: cost(),
    };
  }

  function reset() {
    cursor = 0;
    count = 0;
    totalSamples = 0;
    costCursor = 0;
    costCount = 0;
    invalidate();
  }

  window.isaacPerfSummary = summary;
  return {sample, summary, reset};
}
