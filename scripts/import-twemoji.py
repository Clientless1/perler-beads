"""Import 256 curated Twemoji v14.0.2 PNGs and retain CC-BY-4.0 attribution.

Only public raw GitHub assets from the pinned release are requested.
Existing manifest checksums are enforced on subsequent runs.
"""
import concurrent.futures
import hashlib
import importlib.util
import json
from pathlib import Path
import time
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
BASE = 'https://raw.githubusercontent.com/twitter/twemoji/v14.0.2/'


def fetch(path):
    for attempt in range(3):
        try:
            with urlopen(Request(BASE+path, headers={'User-Agent':'Codex'}), timeout=30) as response:
                data = response.read(1024*1024)
                if response.geturl() != BASE+path:
                    raise ValueError('Unexpected source redirect')
                return data
        except Exception:
            if attempt == 2:
                raise
            time.sleep(attempt+1)


def main():
    spec = importlib.util.spec_from_file_location('catalog', ROOT/'scripts/twemoji-catalog.py')
    catalog = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(catalog)
    entries = catalog.selections()
    destination = ROOT/'scripts/template-sources/twemoji'
    destination.mkdir(parents=True, exist_ok=True)
    manifest = ROOT/'scripts/network-templates.json'
    current = json.loads(manifest.read_text())
    existing = {item['id']:item for item in current}

    def import_one(item):
        target = destination/item['asset']
        data = target.read_bytes() if target.exists() else fetch('assets/72x72/'+item['asset'])
        if not data.startswith(b'\x89PNG\r\n\x1a\n'):
            raise ValueError('Expected PNG: '+item['asset'])
        digest = hashlib.sha256(data).hexdigest()
        if item['id'] in existing and existing[item['id']]['sha256'] != digest:
            raise ValueError('Source changed: '+item['id'])
        return {**item,'sha256':digest}, target, data

    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as executor:
        updates = list(executor.map(import_one, entries))
    for item, target, data in updates:
        target.write_bytes(data)
    manifest.write_text(json.dumps([i for i in current if i['sourceId']!='twemoji']+[i[0] for i in updates],ensure_ascii=False,indent=2)+'\n')
    (ROOT/'licenses/Twemoji-CC-BY-4.0.txt').write_bytes(fetch('LICENSE-GRAPHICS'))
    (ROOT/'licenses/Twemoji-attribution.txt').write_text('Twemoji v14.0.2\nCopyright 2019 Twitter, Inc and other contributors\nGraphics: CC-BY-4.0 https://creativecommons.org/licenses/by/4.0/\nhttps://github.com/twitter/twemoji/tree/v14.0.2\nAdapted: resized to a pixel grid, alpha thresholded and colors matched to MARD.\nRetrieved 2026-11-03. Original PNGs and SHA-256 checksums are retained.\n')
    print(f'Imported {len(updates)} licensed Twemoji subjects.')


if __name__ == '__main__':
    main()
