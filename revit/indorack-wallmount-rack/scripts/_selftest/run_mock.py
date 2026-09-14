# Self-test: menjalankan script builder di luar Revit memakai mock API.
import sys, types, os
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
BUILDER = os.path.join(HERE, '..', 'build_indorack_wallmount_rack.py')
import revitmock as RM

db = types.ModuleType('Autodesk.Revit.DB')
for n in dir(RM):
    if not n.startswith('_'):
        setattr(db, n, getattr(RM, n))
pkg_a = types.ModuleType('Autodesk'); pkg_r = types.ModuleType('Autodesk.Revit')
sys.modules['Autodesk'] = pkg_a; sys.modules['Autodesk.Revit'] = pkg_r
sys.modules['Autodesk.Revit.DB'] = db

src = open(BUILDER).read()
# lewati pencarian template (tidak ada file .rft di linux)
src = src.replace("template = find_template(app)", "template = 'MOCK.rft'")
g = {'__name__': 'builder', '__revit__': RM.UIApplication()}
exec(compile(src, 'builder.py', 'exec'), g)

REC = RM.REC
print('\n===== HASIL SIMULASI =====')
print('extrusion :', len(REC['ext']))
print('refplane  :', len(REC['rp']))
print('dimensi   :', len(REC['dim']))
print('alignment :', len(REC['align']))
print('parameter :', len(REC['param']))
print('formula   :', len(REC['formula']))
print('types     :', REC['types'])
print('assoc     :', len(REC['assoc']))
print('subcat    :', REC['subcat'])
print('material  :', REC['mat'])
FT = 304.8
bad = []
for e in REC['ext']:
    w = (e.x1-e.x0)*FT; d = (e.y1-e.y0)*FT; h = abs(e.EndOffset-e.StartOffset)*FT
    if min(w, d, h) < 0.5: bad.append((e.id, round(w,2), round(d,2), round(h,2)))
print('solid degenerate:', bad if bad else 'none')
xs = [v for e in REC['ext'] for v in (e.x0, e.x1)]
ys = [v for e in REC['ext'] for v in (e.y0, e.y1)]
zs = [v for e in REC['ext'] for v in (e.StartOffset, e.EndOffset)]
print('bbox mm   : X %.1f..%.1f  Y %.1f..%.1f  Z %.1f..%.1f' % (
    min(xs)*FT, max(xs)*FT, min(ys)*FT, max(ys)*FT, min(zs)*FT, max(zs)*FT))
import json
json.dump([{'id':e.id,'x0':e.x0*FT,'x1':e.x1*FT,'y0':e.y0*FT,'y1':e.y1*FT,
            'z0':e.StartOffset*FT,'z1':e.EndOffset*FT,'round':e.round_only}
           for e in REC['ext']], open('solids.json','w'), indent=0)
print('formula list:')
for k, v in REC['formula'].items(): print('   ', k, '=', v)
