// A run saved while mods were loaded aborts the game on boot once those mods are gone
// (gamestateN.dat -> _invalid_parameter_noinfo_noreturn). Each run save records the mods
// that were fully loaded when it was written, and a boot that lacks any of them keeps the
// run out of the game until they are back. The stored bytes are never changed or deleted.
const RUN_STATE = /(^|\/)gamestate\d+\.dat$/i;
export const LEGACY_RUN = '(saved before mods were recorded)';
export const isRunState = key => RUN_STATE.test(String(key));

// Mod id of a seeded path, or null when the path is not a mod's own file.
export function modOfSeed(path, rootOf) {
  const root = rootOf(path);
  if (!root) return null;
  const id = String(path).slice(root.length).split('/')[0];
  // ' import mod' is the page's own import row, not a mod a save can depend on.
  return id && !id.startsWith(' ') ? id : null;
}

export function createRunGuard() {
  const seeds = new Map();
  let loaded = null;
  const loadedList = () => loaded || [];
  return {
    // Every mod file goes through here while mods are seeded; one failed file means the mod is incomplete.
    seeded(id, ok) {
      if (!id || loaded) return;
      const s = seeds.get(id) || {ok: 0, failed: 0};
      if (ok) s.ok++; else s.failed++;
      seeds.set(id, s);
    },
    // Freeze the set of fully loaded mods; later seeds do not change what runs are checked against.
    finish() {
      if (!loaded) loaded = [...seeds].filter(([, s]) => s.ok && !s.failed).map(([id]) => id).sort();
      return loadedList();
    },
    loaded: loadedList,
    // mods: the ids recorded with the run, or undefined for a run written before recording began.
    decide(mods) {
      const have = new Set(loadedList());
      if (!Array.isArray(mods)) {
        // An unrecorded run is only trusted when some mods loaded; with none it is the known crash.
        return have.size ? {restore: true, stamp: true, missing: []} : {restore: false, stamp: false, missing: [LEGACY_RUN]};
      }
      const missing = mods.filter(id => !have.has(id));
      return {restore: !missing.length, stamp: false, missing};
    },
    // Extra fields stored with a save write, so the record commits in the same transaction as the bytes.
    tag(key) {
      return isRunState(key) ? {mods: loadedList()} : {};
    },
  };
}
