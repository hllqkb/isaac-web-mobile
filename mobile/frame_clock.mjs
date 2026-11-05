// Pace only the engine's present/yield boundary. UI animation frames stay native.
export function createFramePacer({now = () => performance.now(),
  wait = ms => new Promise(resolve => setTimeout(resolve, ms)),
  hidden = () => document.hidden} = {}) {
  const period = 1000 / 60;
  let previous = null;
  return async function pace() {
    if (hidden()) {previous = null; return;}
    let current = now();
    if (previous === null || current >= previous + period) {
      previous = current;
      return;
    }
    const due = previous + period;
    while (current < due && !hidden()) {
      await wait(Math.ceil(due - current));
      current = now();
    }
    // Keep sub-millisecond timer error from accumulating; discard long stalls.
    previous = hidden() ? null : current - due < period ? due : current;
  };
}
