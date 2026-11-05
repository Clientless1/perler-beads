"""Draw the original pixel illustrations and small, WeChat-compatible PNG icons."""
from pathlib import Path
from PIL import Image, ImageDraw
import math

ROOT = Path(__file__).resolve().parents[1] / 'src' / 'static'
(ROOT / 'examples').mkdir(exist_ok=True)
(ROOT / 'ui').mkdir(exist_ok=True)

COLORS = {'y': '#FFE660', 'o': '#F49422', 'g': '#256847', 'l': '#83CB70',
          'w': '#EDE7DF', 'b': '#2E2F31', 'r': '#E64F27', 'p': '#F8CCE0',
          'c': '#A5693F', 'd': '#534137', 't': '#DEB48B'}

def create_design(kind):
    grid = [['.' for _ in range(29)] for _ in range(29)]
    def rect(x, y, w, h, color):
        for yy in range(y, y+h):
            for xx in range(x, x+w):
                if 0 <= xx < 29 and 0 <= yy < 29: grid[yy][xx] = color
    def row(y, x, text):
        for i, c in enumerate(text):
            if c != '.': grid[y][x+i] = c
    if kind == 'flower':
        rect(13, 12, 2, 13, 'g')
        for y, x, text in [(17,7,'ggg'),(18,7,'gllgg'),(19,8,'glllg'),(20,10,'gggg'),
                           (19,16,'gggg'),(20,15,'glllg'),(21,15,'gllg'),(22,14,'ggg')]: row(y,x,text)
        rows = ['....yyyy..yyyy....','...yyyyyyyyyyyy...', '..yyyyyyyyyyyyyy..',
                '..yyyyyyyyyyyyyy..','...yyyyooooyyyy...', '.yyyyyooooooyyyyy.',
                'yyyyyooooooooyyyyy','yyyyyooooooooyyyyy','.yyyyyooooooyyyyy.',
                '...yyyyooooyyyy...','..yyyyyyyyyyyyyy..','..yyyyyyyyyyyyyy..',
                '...yyyyyyyyyyyy...','....yyyy..yyyy....']
        for y, text in enumerate(rows, 2): row(y,5,text)
    elif kind == 'fox':
        rows = ['rrr...........rrr','rorr.........rror','roorr.......rooor',
                'rooorr.....roooor','roooorrrrrrroooor','rooooooooooooooor',
                'rooooooooooooooor','.rooooooooooooor.','.rooboooooboooor.',
                '.rwwwwoooowwwwr..','..rwwwwoowwwwr...','...rwwwbbwwwr....',
                '....rwwwwwwr.....','.....rrrrrr......']
        for y,text in enumerate(rows,5): row(y,6,text)
        rect(12,19,5,5,'o');rect(11,23,7,2,'r');rect(13,20,3,3,'w')
    else:
        for y,x,text in [(3,11,'dd'),(4,11,'dd'),(5,12,'dd'),(6,12,'dd'),
                          (3,17,'dd'),(4,17,'dd'),(5,16,'dd'),(6,16,'dd')]: row(y,x,text)
        rect(6,9,15,2,'d');rect(6,11,15,10,'w');rect(7,21,13,2,'d')
        rect(7,11,13,3,'c');rect(8,11,11,1,'t');rect(20,12,5,2,'d');rect(23,14,2,5,'d');rect(20,18,4,2,'d')
        rect(6,11,1,10,'d');rect(20,11,1,10,'d');rect(9,24,11,1,'g')
        for y,x,text in [(15,11,'pp.pp'),(16,10,'ppppppp'),(17,11,'ppppp'),(18,12,'ppp'),(19,13,'p')]: row(y,x,text)
    return grid

for name in ['flower', 'fox', 'coffee']:
    grid = create_design(name)
    for beads in [False, True]:
        cell = 24
        im = Image.new('RGBA', (29*cell,29*cell))
        draw = ImageDraw.Draw(im)
        for y,row in enumerate(grid):
            for x,c in enumerate(row):
                if c == '.': continue
                color = COLORS[c]
                if beads:
                    box = (x*cell+1,y*cell+1,(x+1)*cell-1,(y+1)*cell-1)
                    draw.rounded_rectangle(box,radius=4,fill=color)
                    draw.line((x*cell+5,y*cell+3,x*cell+cell-5,y*cell+3),fill='#ffffff70',width=2)
                    draw.ellipse((x*cell+10,y*cell+10,x*cell+14,y*cell+14),fill='#00000028')
                else: draw.rectangle((x*cell,y*cell,(x+1)*cell-1,(y+1)*cell-1),fill=color)
        im.save(ROOT / 'examples' / f'{name}{"-beads" if beads else ""}.png')

def icon(name, color):
    im = Image.new('RGBA',(72,72)); d = ImageDraw.Draw(im); w = 4
    def line(points): d.line(points,fill=color,width=w,joint='curve')
    def box(coords, r=5): d.rounded_rectangle(coords,radius=r,outline=color,width=w)
    def circle(coords): d.ellipse(coords,outline=color,width=w)
    if name == 'upload':
        line([(15,45),(15,57),(57,57),(57,45)]); line([(36,46),(36,14)]); line([(23,27),(36,14),(49,27)])
    elif name in ['arrow-right','chevron']:
        if name == 'arrow-right': line([(13,36),(58,36)])
        line([(39,18),(57,36),(39,54)])
    elif name == 'arrow-left': line([(58,36),(14,36)]);line([(32,18),(14,36),(32,54)])
    elif name == 'grid':
        for x in [14,40]:
            for y in [14,40]: box((x,y,x+18,y+18),3)
    elif name == 'folder':
        line([(12,24),(12,57),(60,57),(60,23),(35,23),(29,16),(12,16),(12,24)])
    elif name == 'image':
        box((12,12,60,60));circle((22,22,32,32));line([(14,53),(31,37),(41,47),(51,35),(59,44)])
    elif name == 'sparkles':
        line([(31,10),(36,28),(54,33),(36,38),(31,56),(26,38),(8,33),(26,28),(31,10)])
        line([(55,8),(55,20)]);line([(49,14),(61,14)]);line([(56,48),(56,61)]);line([(50,55),(62,55)])
    elif name == 'check': line([(17,36),(29,49),(56,22)])
    elif name == 'close': line([(21,21),(51,51)]);line([(51,21),(21,51)])
    elif name == 'plus': line([(17,36),(55,36)]);line([(36,17),(36,55)])
    elif name == 'minus': line([(17,36),(55,36)])
    elif name == 'download':
        line([(36,12),(36,45)]);line([(23,32),(36,45),(49,32)]);line([(14,47),(14,59),(58,59),(58,47)])
    elif name == 'help':
        circle((11,11,61,61));d.arc((26,21,46,40),180,450,fill=color,width=w);line([(36,38),(36,44)]);d.ellipse((34,50,38,54),fill=color)
    elif name == 'trash':
        line([(14,22),(58,22)]);line([(27,21),(27,13),(45,13),(45,21)]);line([(20,25),(23,59),(49,59),(52,25)]);line([(30,30),(31,50)]);line([(42,30),(41,50)])
    elif name in ['refresh','undo']:
        d.arc((15,15,58,58),200,500,fill=color,width=w);line([(12,16),(13,34),(31,31)])
    elif name == 'palette':
        d.arc((10,10,62,62),0,300,fill=color,width=w);line([(62,36),(46,36),(43,42),(47,49),(43,59)])
        for x,y in [(24,24),(38,20),(22,39)]: d.ellipse((x-3,y-3,x+3,y+3),fill=color)
    elif name == 'search':
        circle((13,12,48,47)); line([(44,43),(60,59)])
    elif name == 'leaf':
        d.arc((12,12,59,61),90,270,fill=color,width=w);d.arc((13,10,60,60),-90,90,fill=color,width=w);line([(18,59),(48,26)]);line([(31,44),(30,29)])
    elif name == 'edit':
        line([(16,45),(45,16),(56,27),(27,56),(14,59),(16,45)]);line([(39,22),(50,33)])
    elif name == 'expand':
        for pts in [[(12,28),(12,12),(28,12)],[(44,12),(60,12),(60,28)],[(12,44),(12,60),(28,60)],[(44,60),(60,60),(60,44)]]: line(pts)
    elif name == 'shield':
        line([(36,10),(58,19),(56,43),(48,54),(36,62),(24,54),(16,43),(14,19),(36,10)]);line([(25,34),(33,42),(48,27)])
    elif name == 'copy': box((25,24,60,60));line([(46,19),(46,12),(12,12),(12,46),(19,46)])
    return im

names = ['upload','arrow-right','arrow-left','chevron','grid','folder','image','sparkles','check','close','plus','minus','download','help','trash','refresh','undo','palette','leaf','edit','expand','shield','copy','search']
for name in names:
    for light in [False,True]: icon(name,'#ffffff' if light else '#285c49').save(ROOT/'ui'/f'{name}{"-light" if light else ""}.png')
for name,source in [('tab-home','grid'),('tab-history','folder')]:
    icon(source,'#8e9690').save(ROOT/'icons'/f'{name}.png')
    icon(source,'#285c49').save(ROOT/'icons'/f'{name}-active.png')
print('Created original illustrations and icons.')
