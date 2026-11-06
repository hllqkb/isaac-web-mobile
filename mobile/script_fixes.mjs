// A Lua error raised inside a mod callback ends the web port (after the PC game would only
// log it, the port reaches vcruntime140.dll!_CxxThrowException, which is not implemented),
// while an error caught inside Lua does not. The game dispatches every mod callback through
// _RunCallback in resources/scripts/main.lua, which calls each one without pcall; the copy
// written to MEMFS calls it through pcall and logs a bounded number of errors instead.
// The change applies only when both original texts occur exactly once.
export const CALLBACK_GUARD_SCRIPT = 'resources/scripts/main.lua';
const DISPATCH = 'function _RunCallback(callbackId, param, ...)';
const CALL = 'local result = v.Function(v.Mod, ...)';
// Reporting may not raise either: a bad __tostring on the error or mod name is swallowed.
const REPORTER = [
  'local _isaacWebCallbackErrors = {}',
  'local function _isaacWebReportCallbackError(callbackId, mod, err)',
  ' local n = (_isaacWebCallbackErrors[callbackId] or 0) + 1',
  ' _isaacWebCallbackErrors[callbackId] = n',
  ' if n <= 3 or n % 1000 == 0 then',
  '  pcall(function() Isaac.DebugString("Error in callback " .. tostring(callbackId) .. " from mod " .. tostring(mod and mod.Name) .. " (#" .. n .. "): " .. tostring(err)) end)',
  ' end',
  'end',
  '',
].join('\n');
// Like the PC game, an error ends this dispatch: the remaining callbacks for the event are not run.
const GUARDED_CALL = 'local ok, result = pcall(v.Function, v.Mod, ...) if not ok then _isaacWebReportCallbackError(callbackId, v.Mod, result) return nil end';

const once = (text, piece) => text.split(piece).length === 2;

// Returns the bytes to write and why; never throws on unexpected input.
export function patchGameScript(rel, bytes, {enabled = true} = {}) {
  if (rel !== CALLBACK_GUARD_SCRIPT) return {bytes, status: 'untouched'};
  if (!enabled) return {bytes, status: 'off'};
  let text;
  // Only valid UTF-8 is rewritten; anything else is written exactly as shipped.
  try { text = new TextDecoder('utf-8', {fatal: true}).decode(bytes); } catch { return {bytes, status: 'unrecognised'}; }
  if (!once(text, DISPATCH) || !once(text, CALL)) return {bytes, status: 'unrecognised'};
  const patched = text.replace(DISPATCH, REPORTER + DISPATCH).replace(CALL, GUARDED_CALL);
  return {bytes: new TextEncoder().encode(patched), status: 'guarded'};
}
