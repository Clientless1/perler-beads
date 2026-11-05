"""Build exact, offline bead patterns and previews from the bundled CC0 pixel art.
Run: python3 scripts/create-templates.py (Pillow + project npm dependencies required).
"""
import json, math, subprocess, tempfile, importlib.util, hashlib, re
from pathlib import Path
from PIL import Image, ImageDraw
ROOT = Path(__file__).resolve().parents[1]
META = [
 ('strawberry','一颗小草莓','水果',1,'人气样板'),('cherries','樱桃好心情','水果',1,''),
 ('avocado_half','牛油果的一半','水果',1,''),('watermelon_slice','夏日西瓜','水果',1,''),
 ('apple_red','红苹果','水果',1,''),('pineapple','热带菠萝','水果',1,''),
 ('burger','快乐汉堡','食物',2,'双倍颗粒'),('pizza_pepperoni_slice','一角披萨','食物',1,''),
 ('sushi_nigiri','三文鱼寿司','食物',1,''),('rice_ball','海苔饭团','食物',1,'新手友好'),
 ('cake_slice_plain','奶油小蛋糕','甜点',2,'下午茶'),('popsicle','莓果冰棒','甜点',1,''),
 ('waffle','格子华夫饼','甜点',1,''),('carrot','小小胡萝卜','食物',1,''),
 ('pumpkin','秋日南瓜','食物',1,''),('blueberries','一把蓝莓','水果',1,''),
 ('banana','弯弯香蕉','水果',1,''),('croissant','黄油可颂','甜点',1,''),
 ('pretzel','蝴蝶脆饼','甜点',1,''),('sushi_roll','寿司小卷','食物',1,''),
 ('broccoli','西兰花花','食物',1,''),('cheese','一块芝士','食物',1,'轻松入门'),
 ('bacon','早餐培根','食物',1,''),
 ('peach','水蜜桃','水果',1,''),
 ('grapes_purple','紫葡萄','水果',1,''),
 ('lemon','柠檬','水果',1,''),
 ('orange','橙子','水果',1,''),
 ('pear','小梨子','水果',1,''),
 ('kiwi','猕猴桃','水果',1,''),
 ('lychee','荔枝','水果',1,''),
 ('mango','芒果','水果',1,''),
 ('coconut_half','半颗椰子','水果',1,''),
 ('pomegranate','石榴','水果',1,''),
 ('persimmon','柿子','水果',1,''),
 ('fig','无花果','水果',1,''),
 ('plum','李子','水果',1,''),
 ('rubus_raspberry','树莓','水果',1,''),
 ('rubus_blackberry','黑莓','水果',1,''),
 ('cantaloupe_slice','一片蜜瓜','水果',1,''),
 ('durian','榴莲','水果',1,''),
 ('egg_fried','煎蛋','食物',1,''),
 ('dumpling','小饺子','食物',1,''),
 ('french_fries','薯条','食物',1,''),
 ('hotdog','热狗','食物',2,''),
 ('sandwich','三明治','食物',2,''),
 ('taco','墨西哥卷饼','食物',1,''),
 ('burrito','大卷饼','食物',1,''),
 ('corn','玉米','食物',1,''),
 ('tomato','番茄','食物',1,''),
 ('mushroom','小蘑菇','食物',1,''),
 ('radish','红萝卜','食物',1,''),
 ('eggplant','茄子','食物',1,''),
 ('cucumber','黄瓜','食物',1,''),
 ('pea_pod','豌豆荚','食物',1,''),
 ('garlic','大蒜','食物',1,''),
 ('potato','土豆','食物',1,''),
 ('soup_miso','味噌汤','食物',1,''),
 ('shrimp_fried','炸虾','食物',1,''),
 ('chicken_drumstick_cooked','烤鸡腿','食物',1,''),
 ('steak_grilled','烤牛排','食物',1,''),
 ('tofu','豆腐','食物',1,''),
 ('moon_cake','月饼','甜点',1,''),
 ('narutomaki','鸣门卷','食物',1,''),
 ('octopus','章鱼小食','食物',1,''),
 ('tamale','玉米粽','食物',1,''),
 ('cookie','巧克力曲奇','甜点',1,''),
 ('chocolate','巧克力','甜点',1,''),
 ('icecream_vanilla','香草冰淇淋','甜点',1,''),
 ('icecream_mint','薄荷冰淇淋','甜点',1,''),
 ('cupcake_vanilla','香草纸杯蛋糕','甜点',1,''),
 ('cupcake_chocolate','巧克力纸杯蛋糕','甜点',1,''),
 ('cake_slice_chocolate','巧克力蛋糕','甜点',1,''),
 ('doughnut_chocolate','巧克力甜甜圈','甜点',1,''),
 ('doughnut_pink_sprinkles','彩糖甜甜圈','甜点',2,''),
 ('pancakes','松饼','甜点',2,''),
 ('muffin_blueberry','蓝莓玛芬','甜点',1,''),
 ('dango','三色团子','甜点',1,''),
 ('mochi','糯米团','甜点',1,''),
 ('lollipop','棒棒糖','甜点',1,''),
 ('candy_cane','拐杖糖','甜点',1,''),
 ('peppermint','薄荷糖','甜点',1,''),
 ('gingerbread_man','姜饼人','甜点',1,''),
 ('honey_pot','蜂蜜罐','甜点',1,''),
 ('flan','焦糖布丁','甜点',1,''),
 ('jello','小果冻','甜点',1,''),
 ('fortune_cookie','幸运饼干','甜点',1,''),
 ('popcorn','爆米花','甜点',1,''),
]
raw = []
for key,name,category,scale,badge in META:
    path = ROOT / 'src/static/templates/sources' / (key+'.png')
    if not path.exists(): raise FileNotFoundError(path)
    art = Image.open(path).convert('RGBA')
    if scale > 1: art = art.resize((art.width*scale,art.height*scale),Image.Resampling.NEAREST)
    size = math.ceil(max(art.size)/29)*29
    image = Image.new('RGBA',(size,size));image.paste(art,((size-art.width)//2,(size-art.height)//2))
    raw.append(dict(id=key,name=name,category=category,badge=badge,gridSize=size,rgba=list(image.tobytes()), source='ARoachIFoundOnMyPillow · CC0'))
# Original designs also become directly usable patterns.
for key,name in [('flower','把春天留下来'),('fox','森林小狐狸'),('coffee','爱心咖啡')]:
    art=Image.open(ROOT/f'src/static/examples/{key}.png').convert('RGBA').resize((29,29),Image.Resampling.NEAREST)
    raw.append(dict(id=key,name=name,category={'flower':'花草','fox':'动物','coffee':'小物'}[key],badge='豆物原创',gridSize=29,rgba=list(art.tobytes()),source='豆物原创'))
# Draw additional original pixel designs, then interleave categories in the gallery.
spec = importlib.util.spec_from_file_location('template_designs', ROOT/'scripts/template-designs.py')
designs = importlib.util.module_from_spec(spec); spec.loader.exec_module(designs)
for item in designs.original_designs():
    art = item.pop('image')
    raw.append(dict(**item, gridSize=29, rgba=list(art.tobytes())))
# Network sources are selected and audited in a manifest; rebuilding is fully offline.
source_info = {item['id']: item for item in json.loads((ROOT/'src/data/template-sources.json').read_text())}
for item in json.loads((ROOT/'scripts/network-templates.json').read_text()):
    path = ROOT/'scripts/template-sources'/item['sourceId']/item['asset']
    if hashlib.sha256(path.read_bytes()).hexdigest() != item['sha256']:
        raise ValueError(f'Source checksum mismatch: {path}')
    art = Image.open(path).convert('RGBA')
    if item['sourceId'] == 'tiny_creatures':
        # The pack uses black as its solid outside background, with dark-plum outlines.
        pixels = list(art.getdata())
        art.putdata([(0,0,0,0) if pixel[:3] == (0,0,0) else pixel for pixel in pixels])
    bounds = art.getbbox()
    if not bounds: raise ValueError(f'Empty sprite: {path}')
    art = art.crop(bounds)
    if item['sourceId'] == 'twemoji':
        # 25 visible cells leave a two-cell margin on a standard 29-cell board.
        scale = 25/max(art.size)
        art = art.resize((max(1,round(art.width*scale)),max(1,round(art.height*scale))),Image.Resampling.LANCZOS)
        art.putdata([(r,g,b,255) if a >= 110 else (0,0,0,0) for r,g,b,a in art.getdata()])
    size = math.ceil(max(art.size)/29)*29
    image = Image.new('RGBA',(size,size))
    image.paste(art,((size-art.width)//2,(size-art.height)//2))
    source = source_info[item['sourceId']]
    raw.append(dict(id=item['id'],name=item['name'],category=item['category'],tags=item['tags'],
                    sourceId=item['sourceId'],source=source['author']+' · '+source.get('licenseLabel','CC0'),badge='网络精选',
                    gridSize=size,rgba=list(image.tobytes())))
category_order = ['动物','花草','游戏','水果','食物','甜点','表情','小物']
# Alternate new network subjects and existing patterns within each category.
previous = [item for item in raw if item.get('sourceId') != 'twemoji']
new = [item for item in raw if item.get('sourceId') == 'twemoji']
raw = []
for category in category_order:
    old_items = [item for item in previous if item['category'] == category]
    new_items = [item for item in new if item['category'] == category]
    while old_items or new_items:
        if new_items: raw.append(new_items.pop(0))
        if old_items: raw.append(old_items.pop(0))
buckets = {category: [item for item in raw if item['category'] == category] for category in category_order}
raw = []
while any(buckets.values()):
    for category in category_order:
        if buckets[category]: raw.append(buckets[category].pop(0))
with tempfile.TemporaryDirectory() as directory:
    input_path=Path(directory)/'input.json'; output_path=Path(directory)/'output.json'; input_path.write_text(json.dumps(raw))
    code=r"""
const esbuild = require('esbuild'), fs = require('fs');
(async () => {
 const result = await esbuild.build({ stdin:{ contents: `import { matchAll } from './src/utils/colorMatcher.js'; import { MARD_PALETTE } from './src/utils/beadPalette.js'; export { matchAll, MARD_PALETTE }`, resolveDir: process.cwd() }, bundle:true, write:false, format:'cjs', platform:'node' });
 const m = { exports:{} }; new Function('module','exports',result.outputFiles[0].text)(m,m.exports);
 const { matchAll, MARD_PALETTE } = m.exports;
 const records = JSON.parse(fs.readFileSync(process.argv[1],'utf8')).map(item => {
   const { rgba, ...meta } = item;
   const { pattern, colorUsage } = matchAll(new Uint8ClampedArray(rgba),item.gridSize,MARD_PALETTE,item.sourceId === 'twemoji' ? 12 : 0);
   const palette = colorUsage.map(({count,...color}) => color), index = new Map(palette.map((c,i)=>[c.code,i]));
   const codes = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
   if (palette.length > codes.length) throw new Error('Template palette too large');
   const cells = pattern.flat().map(c=>c ? codes[index.get(c.code)] : '.').join('');
   // Repeated empty margins and same-color cells share a run; the grid stays exact.
   // Palette indexes use A-Z/a-z; run lengths use digits, so no separator is needed.
   const runs = cells.match(/(.)\1*/g).map(run=>run[0]+(run.length > 1 ? run.length : '')).join('');
   return { ...meta, palette, runs, totalBeads:colorUsage.reduce((n,c)=>n+c.count,0), colors:colorUsage.length };
 });
 fs.writeFileSync(process.argv[2],JSON.stringify(records));
})();
"""
    subprocess.run(['node','-e',code,str(input_path),str(output_path)],cwd=ROOT,check=True)
    records=json.loads(output_path.read_text())
compact_records = [{**item, 'palette':[color['code'] for color in item['palette']]} for item in records]
(ROOT/'src/data/templates.json').write_text(json.dumps(compact_records,ensure_ascii=False,separators=(',',':')))
for item in records:
    size=item['gridSize'];cell=12 if size==29 else 6
    # Covers use the same decoded cells and shared MARD palette as the app.
    cells = ''.join(code * int(count or '1') for code,count in re.findall(r'([A-Za-z.])(\d*)',item['runs']))
    rows = [cells[y*size:(y+1)*size] for y in range(size)]
    image=Image.new('RGBA',(size*cell,size*cell));d=ImageDraw.Draw(image)
    for y,row in enumerate(rows):
        for x,code in enumerate(row):
            index = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'.find(code) if code != '.' else -1
            if index<0:continue
            color=item['palette'][index]['hex'];bx=x*cell;by=y*cell
            d.rounded_rectangle((bx+.5,by+.5,bx+cell-.5,by+cell-.5),radius=max(1,cell/5),fill=color)
            d.ellipse((bx+cell*.39,by+cell*.39,bx+cell*.61,by+cell*.61),fill='#00000025')
    # Exact indexed RGBA: reduces package bytes without changing any preview pixel.
    colors = sorted(set(image.getdata()))
    if len(colors) <= 256:
        indices = {color:index for index,color in enumerate(colors)}
        indexed = Image.new('P', image.size)
        indexed.putpalette([channel for color in colors for channel in color[:3]])
        indexed.putdata([indices[color] for color in image.getdata()])
        indexed.info['transparency'] = bytes(color[3] for color in colors)
        image = indexed
    image.save(ROOT/f'src/static/templates/{item["id"]}.png', optimize=True)
# Native tabbar icon, matching the existing set.
for active,color in [(False,'#91988C'),(True,'#285C49')]:
    image=Image.new('RGBA',(72,72));d=ImageDraw.Draw(image)
    d.rounded_rectangle((13,12,59,61),radius=8,outline=color,width=4)
    for x,y in [(23,23),(41,23),(23,41),(41,41)]: d.rounded_rectangle((x,y,x+9,y+9),radius=2,fill=color)
    image.save(ROOT/f'src/static/icons/tab-templates{"-active" if active else ""}.png')
print(f'Built {len(records)} exact templates, all with MARD color codes.')
