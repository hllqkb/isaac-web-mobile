// A run saved while mods were loaded aborts the game on boot once those mods are gone
// (gamestateN.dat -> _invalid_parameter_noinfo_noreturn). Each run save records the mods
// expected to load when it was written, and a boot that lacks any of them keeps the run
// out of the game until they are back. The stored bytes are never changed or deleted.
const RUN_STATE = /(^|\/)gamestate\d+\.dat$/i;
export const LEGACY_RUN = '(saved before mods were recorded)';
export const isRunState = key => RUN_STATE.test(String(key));

// Preset mods removed from every install at boot. drop-trinkets-faster raises a Lua error in
// MC_POST_GAME_STARTED when a slot has no data of its own, and the port cannot survive an error
// inside a mod callback (vcruntime140.dll!_CxxThrowException is not implemented). Runs recorded
// while a retired mod was loaded do not need it back.
export const RETIRED_MODS = ['drop-trinkets-faster'];
const retired = new Set(RETIRED_MODS);

// The mods seedMods will load, from the mod list alone: enabled, with files, within the
// seeding budget, in listMods order. Saves are restored before mods, so the decision can
// not wait for the seeding itself without moving runs behind thousands of mod files.
export function loadableMods(records, budget) {
  const ids = [];
  let used = 0;
  for (const mod of records) {
    if (mod.enabled === false || !(mod.files > 0) || retired.has(mod.id)) continue;
    const size = mod.bytes || 0;
    if (used + size > budget) continue;
    used += size;
    ids.push(mod.id);
  }
  return ids.sort();
}

export function createRunGuard() {
  // undefined: not decided yet; null: the mod list could not be read; array: expected mods.
  let expected;
  const copy = () => (Array.isArray(expected) ? [...expected] : expected);
  return {
    useMods(ids) {
      expected = Array.isArray(ids) ? [...new Set(ids)].sort() : null;
    },
    loaded: copy,
    // mods: the ids recorded with the run, or undefined for a run written before recording began.
    decide(mods) {
      // Without a readable mod list the guard knows nothing; behave exactly as before it existed.
      if (!Array.isArray(expected)) return {restore: true, stamp: false, missing: []};
      const have = new Set(expected);
      if (!Array.isArray(mods)) {
        // An unrecorded run is only trusted when some mods load; with none it is the known crash.
        return have.size ? {restore: true, stamp: true, missing: []} : {restore: false, stamp: false, missing: [LEGACY_RUN]};
      }
      const missing = mods.filter(id => !have.has(id) && !retired.has(id));
      return {restore: !missing.length, stamp: false, missing};
    },
    // Extra fields stored with a save write, so the record commits in the same transaction as the bytes.
    // Before the mod list is known (or when it is unreadable) the run is left unrecorded, like a legacy run.
    tag(key) {
      return isRunState(key) && Array.isArray(expected) ? {mods: [...expected]} : {};
    },
  };
}
