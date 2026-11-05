"""Build the self-contained hosted site in cloud CI, never on the local Mac."""

from hashlib import sha256
import json
from pathlib import Path
import re
import shutil
import tempfile
import time
from urllib.request import Request, urlopen
from zipfile import ZipFile

ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / 'dist'
APK_URL = 'https://github.com/hllqkb/isaac-web-setup/releases/download/v2026.11.05/Isaac-Mobile-2026-11-05.apk'
APK_SHA256 = 'd097d9ae686e978aea0c163fd96b3e0bef8f1e0143860e034b2e5b2635f3eebd'


def download_apk(destination: Path) -> None:
    for attempt in range(3):
        try:
            digest = sha256()
            request = Request(APK_URL, headers={'User-Agent': 'Isaac-Hosted-Packager'})
            with urlopen(request, timeout=120) as response, destination.open('wb') as output:
                while block := response.read(1024 * 1024):
                    digest.update(block)
                    output.write(block)
            if digest.hexdigest() != APK_SHA256:
                raise ValueError('Published APK checksum mismatch')
            return
        except Exception:
            if attempt == 2:
                raise
            time.sleep(2 ** attempt)


def main() -> None:
    page = (ROOT / 'game.html').read_text()
    match = re.search(r'window\.__isaacPortableData = (.*?);</script>', page, re.S)
    if not match:
        raise ValueError('Missing portable resource manifest')
    manifest = json.loads(match.group(1))
    expected: dict[str, int] = {}
    for stream in manifest['streams']:
        tag = stream['tag']
        if tag not in ('a', 'b'):
            raise ValueError('Unexpected resource stream')
        for index, length in enumerate(stream['stored']):
            expected[f'chunks/{tag}/{tag}{index}.bin'] = length
        base = stream.get('base', manifest['base'])
        if not re.fullmatch(r'https://cdn\.jsdelivr\.net/gh/chiikabu/boi-portable@[a-f0-9]{40}/[a-z0-9]+', base):
            raise ValueError('Unpinned resource origin')
        page = page.replace(base, f'./chunks/{tag}')
    if len(expected) != 38:
        raise ValueError('Unexpected resource count')
    page, count = re.subn(r'window\.isaacModCatalogue = .*?;</script>',
                         'window.isaacModCatalogue = null;</script>', page, count=1)
    if count != 1 or 'https://cdn.jsdelivr.net/' in page:
        raise ValueError('Unbundled third-party resource dependency')

    # Only the same-origin hosted build waits for complete, verified resources.
    # The legacy CDN page and Android package keep their existing startup path.
    hosted_manifest = re.search(r'window\.__isaacPortableData = (.*?);</script>', page, re.S)
    if not hosted_manifest:
        raise ValueError('Missing hosted preload manifest')
    hosted_data = json.loads(hosted_manifest.group(1))
    hosted_data['hostedFullCache'] = True
    preload_script = "<script>window.isaacFullCacheReady=import('./web/preload.mjs').then(m=>m.prepareResources());</script>"
    page = (page[:hosted_manifest.start(1)] + json.dumps(hosted_data)
            + page[hosted_manifest.end(1):hosted_manifest.end()] + preload_script
            + page[hosted_manifest.end():])
    launch = '  document.body.appendChild(s);'
    if page.count(launch) != 1:
        raise ValueError('Game launch anchor changed')
    page = page.replace(launch, """  window.isaacFullCacheReady.then(function () {
    document.body.appendChild(s);
  }).catch(function (error) {
    document.getElementById('status').textContent = '资源准备模块加载失败，请刷新后重试。';
    console.error('[isaac preload startup]', error);
  });""")

    DEST.mkdir(exist_ok=True)
    if any(DEST.iterdir()):
        raise ValueError('Hosted output must start empty')
    inventory = []
    with tempfile.TemporaryDirectory(prefix='isaac-hosted-') as temporary:
        apk = Path(temporary) / 'release.apk'
        download_apk(apk)
        with ZipFile(apk) as archive:
            entries = json.loads(archive.read('assets/game/inventory.json'))
            indexed = {entry['path']: entry for entry in entries}
            if len(entries) != len(indexed) or set(indexed) != set(expected):
                raise ValueError('APK resource inventory does not match the web release')
            for name, size in expected.items():
                entry = indexed[name]
                content = archive.read('assets/game/' + name)
                if len(content) != size or entry['bytes'] != size or sha256(content).hexdigest() != entry['sha256']:
                    raise ValueError(f'Resource checksum mismatch: {name}')
                target = DEST / name
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(content)
                inventory.append(entry)
                print(f'Verified hosted resource {name}: {size} bytes', flush=True)

    for name in ['index.html', 'bootstrap.js', 'preset-info.json', 'LICENSE']:
        shutil.copyfile(ROOT / name, DEST / name)
    for index in range(7):
        shutil.copyfile(ROOT / f'preset-{index}.bin', DEST / f'preset-{index}.bin')
    shutil.copytree(ROOT / 'web', DEST / 'web')
    shutil.copytree(ROOT / 'assets', DEST / 'assets')
    (DEST / 'game.html').write_text(page)
    (DEST / 'inventory.json').write_text(json.dumps(inventory, indent=2))
    (DEST / '404.html').write_text('<!doctype html><meta charset="utf-8"><title>资源不存在</title><p>资源不存在，请返回游戏入口。</p>')
    (DEST / '_headers').write_text('''/*
  X-Content-Type-Options: nosniff
/game.html
  Cache-Control: no-cache
/
  Cache-Control: no-cache
/web/*
  Cache-Control: no-cache
/bootstrap.js
  Cache-Control: no-cache
/preset-info.json
  Cache-Control: no-cache
/chunks/*
  Cache-Control: public, max-age=31536000, immutable
  Content-Type: application/octet-stream
''')
    for path in DEST.rglob('*'):
        if path.is_file() and path.stat().st_size > 25 * 1024 * 1024:
            raise ValueError(f'Asset exceeds Cloudflare Pages limit: {path.name}')
    print(f'Hosted site ready: {len(inventory)} verified chunks, no runtime CDN dependency', flush=True)


if __name__ == '__main__':
    main()
