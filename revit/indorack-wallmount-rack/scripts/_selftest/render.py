# Render preview isometrik dari solids.json (hasil dump_solids.py).
import json, math
from PIL import Image, ImageDraw, ImageFont

S = json.load(open('solids.json'))
D = 700.0
COL = {'back':(58,60,63),'top':(66,68,71),'bottom':(58,60,63),'side':(62,64,67),
       'frame':(80,82,86),'rail':(120,122,127),'pdu':(45,46,48),'fan':(38,39,41),
       'brush':(150,150,152),'wall':(90,92,95),'door_closed':(52,54,57),
       'door_open':(52,54,57),'misc':(70,70,70)}
GLASS = (96,124,140)

def faces_of(b):
    x0,x1,y0,y1,z0,z1 = b['x0'],b['x1'],b['y0'],b['y1'],b['z0'],b['z1']
    v = lambda x,y,z: (x, -y, z)             # yy = jarak dari pintu ke dinding (0 = dinding)
    return [
        ([v(x0,y0,z1),v(x1,y0,z1),v(x1,y1,z1),v(x0,y1,z1)], 'top'),
        ([v(x0,y0,z0),v(x1,y0,z0),v(x1,y1,z0),v(x0,y1,z0)], 'bot'),
        ([v(x1,y0,z0),v(x1,y1,z0),v(x1,y1,z1),v(x1,y0,z1)], 'side'),
        ([v(x0,y0,z0),v(x0,y1,z0),v(x0,y1,z1),v(x0,y0,z1)], 'side'),
        ([v(x0,y0,z0),v(x1,y0,z0),v(x1,y0,z1),v(x0,y0,z1)], 'front'),
        ([v(x0,y1,z0),v(x1,y1,z0),v(x1,y1,z1),v(x0,y1,z1)], 'back'),
    ]

SH = {'top':1.18,'front':1.0,'side':0.78,'bot':0.55,'back':0.66}

def render(path, show_open, title, hide=()):
    polys = []
    for b in S:
        g = b['group']
        if g in hide: continue
        if g == 'door_open' and not show_open: continue
        if g == 'door_closed' and show_open: continue
        glass = (g.startswith('door') and (b['x1']-b['x0']) > 300 and (b['y1']-b['y0']) < 6
                 and (b['z1']-b['z0']) > 300)
        base = GLASS if glass else COL.get(g, (70,70,70))
        for pts, kind in faces_of(b):
            key = max(p[0]+p[1]+p[2] for p in pts) + sum(p[0]+p[1]+p[2] for p in pts)/len(pts)*0.001
            f = SH[kind]
            c = tuple(min(255, int(ch*f)) for ch in base)
            polys.append((key, pts, c, glass))
    polys.sort(key=lambda p: p[0])
    W, H = 1400, 1000
    img = Image.new('RGB', (W, H), (246,247,249))
    dr = ImageDraw.Draw(img, 'RGBA')
    raw = []
    for _k, pts, _c, _g in polys:
        for x, y, z in pts:
            raw.append(((x - y)*0.866, (x + y)*0.5 - z))
    rx0 = min(p[0] for p in raw); rx1 = max(p[0] for p in raw)
    ry0 = min(p[1] for p in raw); ry1 = max(p[1] for p in raw)
    k = min((W - 120.0)/(rx1 - rx0), (H - 200.0)/(ry1 - ry0))
    ox = (W - (rx1 - rx0)*k)/2.0 - rx0*k
    oy = (H + 110 - (ry1 - ry0)*k)/2.0 - ry0*k
    def proj(p):
        x, y, z = p
        return ((x - y)*0.866*k + ox, ((x + y)*0.5 - z)*k + oy)
    for key, pts, c, glass in polys:
        sp = [proj(p) for p in pts]
        if glass:
            dr.polygon(sp, fill=c + (150,), outline=(40,45,50))
        else:
            dr.polygon(sp, fill=c, outline=(24,25,27))
    try:
        fnt = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 30)
        fnt2 = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 20)
    except Exception:
        fnt = fnt2 = ImageFont.load_default()
    dr.text((30, 26), title, fill=(20,22,25), font=fnt)
    dr.text((30, 66), '700 (D) x 600 (W) x 545 (H) mm  -  10U  -  simulasi geometri family Revit',
            fill=(80,84,90), font=fnt2)
    img.save(path)
    print('wrote', path)

render('preview_closed.png', False, 'Indorack WIR7010S - pintu tertutup')
render('preview_open.png', True, 'Indorack WIR7010S - Front_Door_Open = Yes')
render('preview_inside.png', False, 'Indorack WIR7010S - Show_Front_Door = No (mounting angle 19\" + PDU)',
       hide=('door_closed','door_open','side','top','brush','fan','bottom'))
