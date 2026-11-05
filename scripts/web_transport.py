"""Add bounded network waits to the pinned hosted game's whole-chunk path."""

from pathlib import Path


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
    var raw = await resourceTransport.readWhole({key: key, url: name(s, i),
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
    return page
