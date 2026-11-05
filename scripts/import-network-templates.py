"""Refresh allowlisted network sprite sources, preserving provenance and checksums.

Use existing downloaded packs:
  python3 scripts/import-network-templates.py --archives /path/to/packs
Or retrieve packs where the host permits automated access:
  python3 scripts/import-network-templates.py --download
Then run python3 scripts/create-templates.py to rebuild the offline library.
"""
import argparse
import hashlib
import io
import json
from pathlib import Path
import time
from urllib.parse import urlparse
from urllib.request import Request, urlopen
from urllib.robotparser import RobotFileParser
import zipfile

ROOT = Path(__file__).resolve().parents[1]
USER_AGENT = 'Codex'
MAX_ARCHIVE_BYTES = 10 * 1024 * 1024


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument('--archives', type=Path, help='Folder with the original source ZIP archives')
    group.add_argument('--download', action='store_true', help='Fetch only allowlisted, robot-permitted archives')
    args = parser.parse_args()
    sources = json.loads((ROOT/'src/data/template-sources.json').read_text())
    selections = json.loads((ROOT/'scripts/network-templates.json').read_text())
    updates = []
    policies = {}
    for source in sources:
        if source['id'] == 'twemoji':
            continue  # Pinned individual PNG import: scripts/import-twemoji.py.
        url = source['archiveUrl']
        parsed = urlparse(url)
        if parsed.scheme != 'https' or parsed.hostname != 'opengameart.org':
            raise ValueError('Unexpected source host')
        if args.archives:
            data = (args.archives/Path(parsed.path).name).read_bytes()
        else:
            origin = f'{parsed.scheme}://{parsed.netloc}'
            if origin not in policies:
                with urlopen(Request(origin+'/robots.txt',headers={'User-Agent':USER_AGENT}),timeout=30) as response:
                    policy = RobotFileParser()
                    policy.parse(response.read().decode().splitlines())
                    policies[origin] = policy
            policy = policies[origin]
            if not policy.can_fetch(USER_AGENT,url):
                raise RuntimeError(f'Automated access is disallowed for {url}; use --archives with a permitted local copy.')
            time.sleep(max(1,policy.crawl_delay(USER_AGENT) or policy.crawl_delay('*') or 1))
            with urlopen(Request(url,headers={'User-Agent':USER_AGENT}),timeout=45) as response:
                if response.geturl() != url:
                    raise RuntimeError('Unexpected source redirect')
                data = response.read(MAX_ARCHIVE_BYTES+1)
        if len(data) > MAX_ARCHIVE_BYTES:
            raise ValueError('Archive exceeds size limit')
        with zipfile.ZipFile(io.BytesIO(data)) as archive:
            if sum(item.file_size for item in archive.infolist()) > 64 * 1024 * 1024:
                raise ValueError('Expanded archive exceeds size limit')
            for item in [item for item in selections if item['sourceId'] == source['id']]:
                matches = [name for name in archive.namelist() if Path(name).name == item['asset']]
                if len(matches) != 1:
                    raise ValueError(f'Expected one source file for {item["id"]}')
                pixels = archive.read(matches[0])
                if hashlib.sha256(pixels).hexdigest() != item['sha256']:
                    raise ValueError(f'Source changed; review required: {item["id"]}')
                destination = ROOT/'scripts/template-sources'/source['id']/item['asset']
                updates.append((destination,pixels))
    # Validate every source before touching the existing imported pixels.
    for destination,data in updates:
        destination.parent.mkdir(parents=True,exist_ok=True)
        destination.write_bytes(data)
    print(f'Imported {len(updates)} selected source sprites. Run scripts/create-templates.py to rebuild.')


if __name__ == '__main__':
    main()
