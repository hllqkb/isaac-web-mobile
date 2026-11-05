"""Patch the pinned web page in CI without fetching or repackaging game assets."""

import json
from pathlib import Path
import re

from mobile_page import apply_mobile_page

ROOT = Path(__file__).resolve().parents[1]


def main() -> None:
    page = (ROOT / 'upstream/game.html').read_text()
    match = re.search(r'window\.__isaacPortableData = (.*?);</script>', page, re.S)
    if not match:
        raise ValueError('Pinned page is missing its resource manifest')
    manifest = json.loads(match.group(1))
    updated = apply_mobile_page(page, ROOT / 'mobile', manifest)
    current = re.search(r'window\.__isaacPortableData = (.*?);</script>', updated, re.S)
    if not current or current.group(1) != match.group(1):
        raise ValueError('Resource manifest changed while patching the page')
    (ROOT / 'game.html').write_text(updated)
    print('Applied shared APK/web patches; resource manifest and preset unchanged')


if __name__ == '__main__':
    main()
