"""Original, deliberately pixel-sized bead designs (no external assets)."""
from PIL import Image, ImageDraw

INK = '#303b36'
CREAM = '#fff3d9'
WHITE = '#fffdf6'
PINK = '#f2a5b5'
GREEN = '#719d64'
DARK_GREEN = '#37674e'
YELLOW = '#f4d35e'
ORANGE = '#dc9250'
BLUE = '#80b6c7'
PURPLE = '#a895c4'


def original_designs():
    items = []

    def make(key, name, category):
        image = Image.new('RGBA', (29, 29))
        return image, ImageDraw.Draw(image)

    def add(key, name, category, image):
        items.append(dict(id='original_' + key, name=name, category=category, image=image,
                          source='豆物原创', badge=''))

    def ellipse(d, box, color, outline=INK, width=1):
        d.ellipse(box, fill=color, outline=outline, width=width)

    def rect(d, box, color, outline=None):
        d.rectangle(box, fill=color, outline=outline)

    def eyes(d, y=13, left=10, right=18):
        rect(d, (left, y, left+1, y+2), INK)
        rect(d, (right, y, right+1, y+2), INK)

    def cheeks(d, y=17):
        rect(d, (7, y, 9, y+1), PINK)
        rect(d, (19, y, 21, y+1), PINK)

    # Animal silhouettes are individually drawn; no recolored duplicates.
    for key, name in [('cat','招财小猫'),('rabbit','垂耳兔'),('panda','圆脸熊猫'),('bear','蜂蜜小熊'),
                      ('corgi','柯基犬'),('frog','小青蛙')]:
        im,d=make(key,name,'动物')
        if key == 'cat':
            d.polygon([(5,12),(5,4),(12,9),(18,9),(23,4),(23,15)],fill=INK)
            d.polygon([(6,12),(6,6),(12,10),(18,10),(22,6),(22,15)],fill=ORANGE)
            d.polygon([(7,7),(7,11),(10,10)],fill=PINK);d.polygon([(21,7),(21,11),(18,10)],fill=PINK)
            ellipse(d,(4,9,24,24),ORANGE);ellipse(d,(9,17,20,23),CREAM,None)
            eyes(d);d.point((14,17),fill=INK);d.line([(12,19),(14,20),(16,19)],fill=INK)
            d.line([(4,17),(8,18)],fill=INK);d.line([(21,18),(25,17)],fill=INK)
        elif key == 'rabbit':
            ellipse(d,(6,2,12,16),WHITE);ellipse(d,(17,3,23,18),WHITE)
            ellipse(d,(8,4,10,12),PINK,None);ellipse(d,(19,5,21,14),PINK,None)
            ellipse(d,(4,11,25,26),WHITE);eyes(d,17);cheeks(d,21);d.point((14,21),fill=INK)
        elif key == 'panda':
            ellipse(d,(3,4,10,12),INK);ellipse(d,(19,4,26,12),INK)
            ellipse(d,(4,7,25,26),WHITE);ellipse(d,(7,12,12,18),INK);ellipse(d,(17,12,22,18),INK)
            d.point((10,14),fill=WHITE);d.point((19,14),fill=WHITE)
            ellipse(d,(12,19,16,21),INK);d.line([(14,21),(14,23),(16,23)],fill=INK)
        elif key == 'bear':
            ellipse(d,(3,4,11,12),ORANGE);ellipse(d,(18,4,26,12),ORANGE)
            ellipse(d,(5,6,9,10),CREAM,None);ellipse(d,(20,6,24,10),CREAM,None)
            ellipse(d,(4,8,25,26),ORANGE);eyes(d,14);ellipse(d,(9,18,20,25),CREAM,None)
            ellipse(d,(12,19,16,21),INK);d.line([(14,21),(14,23),(16,23)],fill=INK)
        elif key == 'corgi':
            d.polygon([(4,14),(5,3),(12,9),(18,9),(24,3),(25,18)],fill=INK)
            d.polygon([(5,14),(6,5),(12,10),(18,10),(23,5),(24,18)],fill=ORANGE)
            ellipse(d,(4,10,25,25),ORANGE);d.polygon([(14,10),(18,20),(22,23),(14,25),(7,23),(11,20)],fill=WHITE)
            eyes(d,14);ellipse(d,(12,18,16,20),INK);rect(d,(13,22,15,24),PINK)
        else:
            ellipse(d,(4,5,13,14),GREEN);ellipse(d,(16,5,25,14),GREEN)
            ellipse(d,(3,10,26,25),GREEN);ellipse(d,(6,7,11,12),WHITE);ellipse(d,(18,7,23,12),WHITE)
            eyes(d,9,8,20);cheeks(d,17);d.line([(9,19),(12,21),(17,21),(20,19)],fill=INK)
        add(key,name,'动物',im)

    im,d=make('penguin','围巾企鹅','动物')
    ellipse(d,(6,3,22,25),INK);ellipse(d,(8,11,20,25),WHITE,None)
    rect(d,(4,14,6,20),INK);rect(d,(22,14,24,20),INK)
    eyes(d,8,10,17);d.polygon([(12,12),(17,12),(14,15)],fill=ORANGE)
    rect(d,(6,15,22,17),'#d76769');rect(d,(18,17,20,22),'#d76769')
    rect(d,(7,25,12,26),ORANGE);rect(d,(17,25,22,26),ORANGE)
    add('penguin','围巾企鹅','动物',im)

    im,d=make('chick','破壳小鸡','动物')
    ellipse(d,(7,4,22,21),YELLOW);eyes(d,10,10,18)
    d.polygon([(13,14),(17,14),(15,17)],fill=ORANGE)
    d.polygon([(5,18),(9,21),(12,18),(16,21),(20,18),(24,20),(22,26),(8,26)],fill=WHITE,outline=INK)
    add('chick','破壳小鸡','动物',im)

    im,d=make('owl','夜猫子猫头鹰','动物')
    d.polygon([(5,4),(12,8),(18,8),(24,4),(23,22),(19,26),(9,26),(5,22)],fill='#b88f69',outline=INK)
    ellipse(d,(6,8,15,19),CREAM);ellipse(d,(14,8,23,19),CREAM)
    ellipse(d,(10,11,12,14),INK);ellipse(d,(17,11,19,14),INK)
    d.polygon([(12,18),(17,18),(15,21)],fill=ORANGE)
    d.line([(7,19),(10,23)],fill=INK);d.line([(22,19),(19,23)],fill=INK)
    add('owl','夜猫子猫头鹰','动物',im)

    im,d=make('turtle','慢慢小海龟','动物')
    for box in [(5,5,10,10),(18,5,23,10),(5,20,10,25),(18,20,23,25)]:ellipse(d,box,GREEN)
    ellipse(d,(23,11,28,18),GREEN);ellipse(d,(3,6,24,24),DARK_GREEN)
    d.polygon([(10,8),(17,8),(21,14),(17,21),(10,21),(6,14)],fill=GREEN,outline=INK)
    d.polygon([(11,11),(16,11),(18,15),(15,18),(10,17),(9,14)],fill='#b5c777',outline=INK)
    d.point((26,13),fill=INK)
    add('turtle','慢慢小海龟','动物',im)

    im,d=make('whale','喷水小鲸鱼','动物')
    d.polygon([(19,17),(26,11),(27,17),(24,22),(19,23)],fill=BLUE,outline=INK)
    ellipse(d,(2,11,23,25),BLUE);d.pieslice((3,12,22,25),0,180,fill=CREAM)
    d.line([(4,23),(7,25),(18,25),(22,22)],fill=INK);eyes(d,17,7,14)
    d.line([(11,10),(11,6),(8,4)],fill=BLUE,width=2);d.line([(11,7),(14,4)],fill=BLUE,width=2)
    add('whale','喷水小鲸鱼','动物',im)

    im,d=make('fish','小金鱼','动物')
    d.polygon([(18,14),(26,7),(26,23),(18,19)],fill=ORANGE,outline=INK)
    ellipse(d,(3,7,22,24),YELLOW);ellipse(d,(6,12,10,17),WHITE);d.point((8,14),fill=INK)
    d.line([(14,10),(17,15),(14,20)],fill=ORANGE,width=2)
    ellipse(d,(3,2,5,4),BLUE);ellipse(d,(8,0,11,3),BLUE)
    add('fish','小金鱼','动物',im)

    im,d=make('butterfly','紫色蝴蝶','动物')
    for box in [(2,4,14,17),(15,4,27,17)]:ellipse(d,box,PURPLE)
    for box in [(5,15,14,25),(15,15,24,25)]:ellipse(d,box,PINK)
    for box in [(5,7,10,12),(19,7,24,12)]:ellipse(d,box,CREAM,None)
    rect(d,(13,8,15,25),INK);d.line([(13,8),(10,3)],fill=INK);d.line([(15,8),(18,3)],fill=INK)
    add('butterfly','紫色蝴蝶','动物',im)

    im,d=make('ladybug','七星瓢虫','动物')
    for yy in [11,17,22]:d.line([(5,yy),(1,yy-1)],fill=INK);d.line([(23,yy),(27,yy-1)],fill=INK)
    ellipse(d,(9,2,20,12),INK);ellipse(d,(4,7,25,27),'#d95b59');d.line([(14,8),(14,26)],fill=INK)
    for box in [(7,11,10,14),(18,11,21,14),(6,18,9,21),(19,18,22,21),(10,23,12,25),(16,23,18,25)]:ellipse(d,box,INK)
    d.point((12,5),fill=WHITE);d.point((17,5),fill=WHITE)
    add('ladybug','七星瓢虫','动物',im)

    im,d=make('bee','采蜜小蜜蜂','动物')
    ellipse(d,(6,2,15,13),WHITE);ellipse(d,(14,2,23,13),WHITE)
    d.polygon([(3,17),(0,20),(4,22)],fill=INK);ellipse(d,(3,10,26,25),YELLOW)
    for xx in [8,15]:rect(d,(xx,11,xx+2,24),INK)
    ellipse(d,(20,10,27,23),YELLOW);d.point((24,15),fill=INK)
    d.line([(23,10),(22,7)],fill=INK)
    add('bee','采蜜小蜜蜂','动物',im)

    im,d=make('snail','小蜗牛','动物')
    d.line([(21,15),(21,8),(19,6)],fill=INK);d.line([(25,15),(25,7),(27,5)],fill=INK)
    ellipse(d,(3,5,21,23),ORANGE);ellipse(d,(7,8,18,20),YELLOW);ellipse(d,(10,11,16,17),ORANGE)
    rect(d,(4,22,25,25),GREEN,INK);ellipse(d,(20,13,27,25),GREEN);d.point((24,17),fill=INK)
    add('snail','小蜗牛','动物',im)

    # Plants and flowers.
    im,d=make('tulip','粉色郁金香','花草')
    rect(d,(14,12,15,26),DARK_GREEN);d.polygon([(14,23),(7,17),(7,23),(14,26)],fill=GREEN)
    d.polygon([(15,21),(23,16),(22,22),(15,25)],fill=GREEN)
    d.polygon([(6,5),(11,9),(14,3),(18,9),(23,5),(22,14),(18,18),(11,18),(7,14)],fill=PINK,outline=INK)
    d.line([(11,9),(13,15),(17,16),(19,10)],fill='#cf718f')
    add('tulip','粉色郁金香','花草',im)

    im,d=make('cactus','盆栽仙人掌','花草')
    ellipse(d,(10,2,18,18),GREEN);rect(d,(10,7,18,21),GREEN)
    d.line([(10,16),(5,16),(5,9)],fill=INK,width=5);d.line([(10,16),(5,16),(5,9)],fill=GREEN,width=3)
    d.line([(18,12),(23,12),(23,6)],fill=INK,width=5);d.line([(18,12),(23,12),(23,6)],fill=GREEN,width=3)
    d.line([(14,5),(14,19)],fill=DARK_GREEN)
    rect(d,(7,20,22,22),ORANGE,INK);d.polygon([(8,22),(21,22),(19,27),(10,27)],fill=ORANGE,outline=INK)
    add('cactus','盆栽仙人掌','花草',im)

    im,d=make('sakura','樱花','花草')
    for box in [(10,2,19,14),(17,8,28,19),(14,17,24,28),(3,16,15,27),(0,7,12,19)]:ellipse(d,box,PINK)
    ellipse(d,(10,10,19,19),YELLOW,None)
    for point in [(14,8),(21,14),(18,21),(10,21),(7,14)]:d.line([(14,14),point],fill='#cd6c8a')
    add('sakura','樱花','花草',im)

    im,d=make('clover','幸运四叶草','花草')
    d.line([(14,14),(17,26)],fill=DARK_GREEN,width=2)
    for box in [(3,3,15,15),(14,3,26,15),(3,14,15,26),(14,14,26,26)]:ellipse(d,box,GREEN)
    for point in [(7,7),(22,7),(7,22),(22,22)]:d.line([(14,14),point],fill=DARK_GREEN)
    add('clover','幸运四叶草','花草',im)

    im,d=make('monstera','龟背竹','花草')
    d.line([(14,14),(15,28)],fill=DARK_GREEN,width=2)
    d.polygon([(14,2),(23,4),(27,12),(25,20),(18,25),(14,22),(8,24),(2,18),(2,9),(7,3)],fill=GREEN,outline=INK)
    d.line([(14,4),(14,24)],fill=DARK_GREEN)
    for yy in [8,14,20]:
        d.line([(14,yy+2),(7,yy-1)],fill=DARK_GREEN)
        d.line([(15,yy+1),(23,yy-2)],fill=DARK_GREEN)
    for box in [(6,7,7,10),(20,7,21,10),(6,15,7,18),(20,14,21,17)]:ellipse(d,box,'#00000000',None)
    add('monstera','龟背竹','花草',im)

    im,d=make('mushroom','红伞蘑菇','花草')
    d.polygon([(11,15),(18,15),(20,26),(9,26)],fill=CREAM,outline=INK)
    d.pieslice((2,2,27,28),180,360,fill='#d75f60',outline=INK)
    rect(d,(2,14,27,16),'#d75f60',INK)
    for box in [(8,6,11,9),(17,5,21,8),(4,11,7,14),(20,11,24,14),(12,11,15,14)]:ellipse(d,box,WHITE,None)
    eyes(d,20,12,16)
    add('mushroom','红伞蘑菇','花草',im)

    im,d=make('lavender','薰衣草','花草')
    for xx,top in [(8,9),(14,3),(20,8)]:
        d.line([(14,26),(xx,top+3)],fill=DARK_GREEN)
        for yy in range(top,top+11,3):ellipse(d,(xx-2,yy,xx+2,yy+3),PURPLE,DARK_GREEN)
    d.polygon([(14,23),(6,19),(9,24),(14,26),(23,20),(20,26)],fill=GREEN)
    add('lavender','薰衣草','花草',im)

    im,d=make('sprout','发芽小盆栽','花草')
    d.line([(14,8),(14,21)],fill=DARK_GREEN,width=2)
    ellipse(d,(3,5,14,12),GREEN);ellipse(d,(14,2,26,10),GREEN)
    d.line([(5,7),(14,11),(24,4)],fill=DARK_GREEN)
    rect(d,(6,19,23,22),ORANGE,INK);d.polygon([(8,22),(21,22),(19,27),(10,27)],fill=ORANGE,outline=INK)
    add('sprout','发芽小盆栽','花草',im)

    # Compact faces with different expressions, rather than palette variants.
    for key,name in [('smile','微笑脸'),('wink','眨眼脸'),('love','心动脸'),('cry','哭哭脸'),('cool','墨镜脸'),('sleep','困困脸')]:
        im,d=make(key,name,'表情');ellipse(d,(2,2,26,26),YELLOW)
        if key=='smile':
            eyes(d,10,8,19);d.line([(8,17),(10,20),(18,20),(21,17)],fill=INK,width=2)
        elif key=='wink':
            rect(d,(8,10,9,13),INK);d.line([(17,11),(20,10),(22,12)],fill=INK)
            cheeks(d,16);d.line([(11,19),(14,21),(18,19)],fill=INK)
        elif key=='love':
            for xx in [6,17]:d.polygon([(xx,9),(xx+2,7),(xx+4,9),(xx+6,7),(xx+8,9),(xx+7,12),(xx+4,15),(xx+1,12)],fill='#c94f68')
            d.line([(10,19),(13,21),(17,21),(20,18)],fill=INK,width=2)
        elif key=='cry':
            d.line([(7,10),(11,8)],fill=INK);d.line([(18,8),(22,10)],fill=INK)
            d.line([(7,13),(11,13)],fill=INK);d.line([(18,13),(22,13)],fill=INK)
            rect(d,(8,14,10,23),BLUE);rect(d,(19,14,21,23),BLUE)
            d.line([(12,21),(14,19),(17,21)],fill=INK)
        elif key=='cool':
            rect(d,(4,10,12,15),INK);rect(d,(16,10,24,15),INK);rect(d,(12,11,16,12),INK)
            d.line([(6,11),(9,11)],fill=WHITE);d.line([(18,11),(21,11)],fill=WHITE)
            d.line([(11,20),(15,21),(19,18)],fill=INK)
        else:
            d.line([(6,12),(9,14),(12,12)],fill=INK);d.line([(17,12),(20,14),(23,12)],fill=INK)
            ellipse(d,(12,18,16,23),INK)
            d.line([(22,3),(27,3),(22,7),(27,7)],fill=PURPLE)
        add(key,name,'表情',im)

    im,d=make('planet','土星','小物')
    ellipse(d,(6,5,23,23),'#e6b37d')
    d.line([(9,9),(19,9)],fill=ORANGE);d.line([(7,15),(22,15)],fill=ORANGE)
    d.arc((0,10,28,20),0,180,fill=INK,width=4);d.arc((0,9,28,19),0,180,fill=PURPLE,width=2)
    d.point((3,4),fill=YELLOW);d.point((25,25),fill=YELLOW)
    add('planet','土星','小物',im)

    im,d=make('rocket','小火箭','小物')
    d.polygon([(11,19),(14,27),(17,19)],fill=ORANGE,outline=INK)
    d.polygon([(9,13),(5,19),(5,24),(11,21),(18,21),(24,24),(24,19),(20,13)],fill='#d66d6b',outline=INK)
    d.polygon([(9,20),(9,10),(14,1),(20,10),(20,20)],fill=WHITE,outline=INK)
    d.polygon([(10,8),(14,2),(18,8)],fill='#d66d6b');ellipse(d,(11,10,17,16),BLUE)
    add('rocket','小火箭','小物',im)

    im,d=make('rainbow','雨后彩虹','小物')
    for box,color in [((1,3,27,29),'#d87d85'),((4,6,24,29),YELLOW),((7,9,21,29),GREEN),((10,12,18,29),BLUE)]:
        d.pieslice(box,180,360,fill=color)
    d.pieslice((12,15,16,29),180,360,fill='#00000000')
    rect(d,(0,22,28,28),'#00000000')
    for box in [(0,18,8,25),(4,16,12,25),(17,17,25,25),(21,19,28,25)]:ellipse(d,box,WHITE,None)
    add('rainbow','雨后彩虹','小物',im)

    im,d=make('heart','像素爱心','小物')
    d.polygon([(2,6),(6,3),(10,3),(14,7),(18,3),(22,3),(26,6),(26,14),(14,26),(2,14)],fill='#d9657d',outline=INK)
    d.line([(5,8),(7,6),(10,6)],fill='#f8bfd0',width=2)
    add('heart','像素爱心','小物',im)

    im,d=make('star','星星挂件','小物')
    d.polygon([(14,1),(18,10),(28,11),(21,18),(23,28),(14,23),(5,28),(7,18),(0,11),(10,10)],fill=YELLOW,outline=INK)
    eyes(d,13,10,17);d.line([(12,18),(14,19),(16,18)],fill=INK)
    add('star','星星挂件','小物',im)

    im,d=make('camera','复古相机','小物')
    rect(d,(9,4,18,8),'#a6b6af',INK);rect(d,(3,7,26,24),'#a6b6af',INK)
    rect(d,(4,11,25,21),ORANGE);ellipse(d,(9,9,22,22),INK);ellipse(d,(11,11,20,20),BLUE)
    ellipse(d,(13,12,17,16),WHITE,None);rect(d,(5,9,8,10),WHITE);rect(d,(21,5,24,6),INK)
    add('camera','复古相机','小物',im)

    im,d=make('gamepad','游戏手柄','小物')
    d.polygon([(5,7),(23,7),(26,11),(28,23),(25,26),(21,23),(18,19),(11,19),(7,25),(3,26),(0,23),(2,12)],fill=PURPLE,outline=INK)
    rect(d,(5,10,7,18),INK);rect(d,(2,13,10,15),INK)
    ellipse(d,(21,10,24,13),'#d4697e');ellipse(d,(18,14,21,17),YELLOW)
    rect(d,(12,13,15,14),INK)
    add('gamepad','游戏手柄','小物',im)

    im,d=make('gift','蝴蝶结礼物','小物')
    ellipse(d,(5,2,14,10),PINK);ellipse(d,(14,2,23,10),PINK)
    rect(d,(4,9,25,26),BLUE,INK);rect(d,(2,9,27,14),BLUE,INK)
    rect(d,(12,9,16,26),PINK);d.line([(6,4),(13,9),(22,4)],fill='#c76888')
    add('gift','蝴蝶结礼物','小物',im)

    assert len(items) == 38, len(items)
    return items
