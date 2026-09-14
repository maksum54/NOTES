# Self-test: menjalankan script builder di luar Revit memakai mock API.
import sys, types, os, json
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
BUILDER = os.path.join(HERE, '..', 'build_indorack_wallmount_rack.py')
import revitmock as RM
db = types.ModuleType('Autodesk.Revit.DB')
for n in dir(RM):
    if not n.startswith('_'): setattr(db, n, getattr(RM, n))
sys.modules['Autodesk'] = types.ModuleType('Autodesk')
sys.modules['Autodesk.Revit'] = types.ModuleType('Autodesk.Revit')
sys.modules['Autodesk.Revit.DB'] = db
src = open(BUILDER).read()
src = src.replace("template = find_template(app)", "template = 'MOCK.rft'").replace('VERBOSE            = True','VERBOSE            = False')
g = {'__name__': 'builder', '__revit__': RM.UIApplication()}
exec(compile(src, 'builder.py', 'exec'), g)
FT = 304.8
grp = {}
for name, lst in g['PARTS'].items():
    for e in lst: grp[e.id] = name
out = []
for e in RM.REC['ext']:
    out.append({'id': e.id, 'group': grp.get(e.id, '?'),
                'x0': e.x0*FT, 'x1': e.x1*FT, 'y0': e.y0*FT, 'y1': e.y1*FT,
                'z0': min(e.StartOffset, e.EndOffset)*FT, 'z1': max(e.StartOffset, e.EndOffset)*FT,
                'round': e.round_only})
json.dump(out, open('solids.json','w'), indent=1)
print('solids:', len(out))
from collections import Counter
print(Counter([o['group'] for o in out]))
# cek beberapa nilai kunci
for o in out:
    if o['group'] in ('back','bottom') or o['id'] in (1,):
        print(o['group'], {k: round(v,2) for k,v in o.items() if k not in ('group','round','id')})
