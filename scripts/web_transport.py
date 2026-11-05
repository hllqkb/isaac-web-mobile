"""Add bounded network waits and reader diagnostics to the pinned hosted game."""

from pathlib import Path
import json
import re


def apply_web_transport(page: str, source: Path) -> str:
    helper = source.read_text().replace('export function ', 'function ', 1)
    before = '  async function piece1(s, i) {'
    if page.count(before) != 1:
        raise ValueError('Portable whole-chunk insertion point changed')
    helper += '''
  var resourceNotice;
  var resourceTransport = createResourceTransport({fetch: fetch.bind(window), notify: function(text) {
    if (!resourceNotice && text) {
      resourceNotice = document.createElement('div');
      resourceNotice.setAttribute('role', 'status');
      resourceNotice.style.cssText = 'position:fixed;bottom:12px;left:50%;transform:translateX(-50%);max-width:90vw;padding:10px 14px;border-radius:8px;background:#151515ed;color:white;font:14px sans-serif;z-index:10000;pointer-events:none;text-align:center';
      document.body.appendChild(resourceNotice);
    }
    if (resourceNotice) { resourceNotice.textContent = text; resourceNotice.hidden = !text; }
  }});
  window.isaacResourceStats = function() { return resourceTransport.summary(); };
'''
    page = page.replace(before, helper + before)
    start = page.index(before)
    end = page.index('  function inWindow(p)', start)
    page = page[:start] + '''  async function piece1(s, i) {
    var size = chunkLen(s, i), key = s + ':' + i;
    var cached = P.hostedFullCache && window.isaacFullChunkCache ? await window.isaacFullChunkCache.readWhole(name(s, i)) : null;
    var raw = cached && wholeHeader(cached, size) ? await body(cached, s, i, 0, size) : await resourceTransport.readWhole({key: key, url: name(s, i),
      check: function(r) { return r.ok && wholeHeader(r, size); },
      read: function(r, progress) { return body(r, s, i, 0, size, progress); }});
    return remember(key, await unpackWhole(s, i, raw));
  }
''' + page[end:]
    replacements = {
        'async function body(r, s, i, from, size) {':
            'async function body(r, s, i, from, size, onBytes) {',
        'u.set(part.value, n); n += part.value.length;':
            'u.set(part.value, n); n += part.value.length; if (onBytes && part.value.length) onBytes(part.value.length);',
        'return pre ? pr : pr.then(function (u) { wasRead(key); return u; });':
            'return pre ? pr : resourceTransport.wait(pr, key).then(function (u) { wasRead(key); return u; });',
    }
    for old, new in replacements.items():
        if page.count(old) != 1:
            raise ValueError(f'Portable transport insertion point changed: {old}')
        page = page.replace(old, new)
    ready_anchor = 'ready: (async function () {'
    if page.count(ready_anchor) != 1:
        raise ValueError('Portable preload gate insertion point changed')
    page = page.replace(ready_anchor, ready_anchor +
        '\n      if (P.hostedFullCache) await window.isaacFullCacheReady;')
    registry = re.search(r'window\.__isaacModules = (.*?);</script>', page, re.S)
    if not registry:
        raise ValueError('Missing inline modules for reader diagnostics')
    modules = json.loads(registry.group(1))
    boot = modules['boot_web.mjs']
    worker = re.search(r'const READER_WORKER=`([^`]*?)`;', boot, re.S)
    if not worker:
        raise ValueError('Reader worker insertion point changed')
    guard = (source.parent / 'reader_guard.mjs').read_text().replace('export function ', 'function ', 1)
    if '`' in guard or '\\' in guard:
        raise ValueError('Reader guard cannot contain template delimiters or escapes')
    guarded = worker.group(1)
    for old, new in {'await fetch(url, init)': 'await readerFetch(url, init)',
                     'await fetch(url)': 'await readerFetch(url)',
                     '}).catch(() => {\n    landed();': '}).catch((error) => {\n    landed();',
                     'buf: null, hit: false, pf: prefetched, ah: ahead':
                     "buf: null, error: String((error && error.message) || error).slice(0,240), hit: false, pf: prefetched, ah: ahead"}.items():
        if guarded.count(old) != 1:
            raise ValueError(f'Reader fetch insertion point changed: {old}')
        guarded = guarded.replace(old, new)
    chunk_cache = (source.parent / 'chunk_cache.mjs').read_text().replace(
        "import{createReaderFetch}from'./reader_guard.mjs';\n", '', 1).replace('export ', '')
    if '`' in chunk_cache or '\\' in chunk_cache:
        raise ValueError('Chunk cache cannot contain template delimiters or escapes')
    message_anchor = '  const d = e.data;\n  if (d.xorKey)'
    if guarded.count(message_anchor) != 1:
        raise ValueError('Worker chunk cache configuration insertion point changed')
    guarded = guarded.replace(message_anchor,
        '  const d = e.data;\n  if (d.chunkCache) { rawChunkCache = createVerifiedChunkCache(d.chunkCache); return; }\n  if (d.xorKey)')
    guarded = guard + '\n' + chunk_cache + '''
const networkReaderFetch = createReaderFetch({fetch:fetch.bind(globalThis)});
let rawChunkCache = null;
const readerFetch = async(url, init) => {
  const hit = rawChunkCache && await rawChunkCache.readRange(url, init);
  return hit || networkReaderFetch(url, init);
};
''' + guarded
    boot = boot[:worker.start(1)] + guarded + boot[worker.end(1):]
    config_anchor = 'const pdata=window.__isaacPortableData;'
    if boot.count(config_anchor) != 1:
        raise ValueError('Reader hosted chunk cache flag insertion point changed')
    boot = boot.replace(config_anchor, config_anchor +
        'if(pdata&&pdata.hostedFullCache===true)w.postMessage({chunkCache:{baseUrl:location.href}});')
    failure = "failRead(p.src,p.off,p.len,'the reader had no bytes')"
    if boot.count(failure) != 1:
        raise ValueError('Reader failure diagnostic insertion point changed')
    boot = boot.replace(failure, "failRead(p.src,p.off,p.len,d.error||'the reader had no bytes')")
    anchor = 'window.isaacLazyStats=()=>({'
    if boot.count(anchor) != 1:
        raise ValueError('Reader diagnostic insertion point changed')
    pending = (
        "window.isaacPendingReadStats=()=>{const windows=[];for(const p of pendingReads.values()){"
        "windows.push({file:String(p.src).slice(-180),offset:p.off,bytes:p.len,"
        "ageMs:Math.round(performance.now()-p.t0)});if(windows.length===8)break;}"
        "return {pendingReads:pendingReads.size,"
        "oldestPendingMs:pendingReads.size?Math.round(performance.now()-pendingReads.values().next().value.t0):0,"
        "windows};};"
    )
    modules['boot_web.mjs'] = boot.replace(anchor, pending + anchor + '...window.isaacPendingReadStats(),')
    page = page[:registry.start(1)] + json.dumps(modules) + page[registry.end(1):]
    return page
