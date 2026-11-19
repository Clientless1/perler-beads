"""Rebuild home example source images from the exact packaged bead grids."""
import json
import re
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
records = {item['id']: item for item in json.loads((ROOT / 'src/data/templates.json').read_text())}
palette_source = (ROOT / 'src/utils/beadPalette.js').read_text()
colors = dict(re.findall(r'([A-Z]\d+),(#[0-9A-Fa-f]{6})', palette_source))
symbols = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'

for template_id in ['original_rabbit', 'original_bear', 'icecream_mint']:
    record = records[template_id]
    cells = ''.join(symbol * int(count or 1) for symbol, count in re.findall(r'([A-Za-z.])(\d*)', record['runs']))
    size, scale = record['gridSize'], 16
    assert len(cells) == size * size
    image = Image.new('RGBA', (size * scale, size * scale))
    draw = ImageDraw.Draw(image)
    for i, symbol in enumerate(cells):
        if symbol == '.':
            continue
        color = colors[record['palette'][symbols.index(symbol)]]
        x, y = i % size * scale, i // size * scale
        draw.rectangle((x, y, x + scale - 1, y + scale - 1), fill=color)
    image.save(ROOT / 'src/static/examples' / f'{template_id}.png', optimize=True)
