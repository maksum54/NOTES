# Mock minimal Revit API supaya logika script bisa diuji di luar Revit.
import math, sys, types

FT = 304.8
REC = {'ext': [], 'align': [], 'dim': [], 'rp': [], 'param': {}, 'formula': {},
       'types': [], 'values': {}, 'assoc': [], 'subcat': [], 'mat': []}

class XYZ(object):
    def __init__(s, x=0.0, y=0.0, z=0.0): s.X, s.Y, s.Z = float(x), float(y), float(z)
    def __getitem__(s, i): return (s.X, s.Y, s.Z)[i]
    def DotProduct(s, o): return s.X*o.X + s.Y*o.Y + s.Z*o.Z
    def IsAlmostEqualTo(s, o): return abs(s.X-o.X) < 1e-9 and abs(s.Y-o.Y) < 1e-9 and abs(s.Z-o.Z) < 1e-9
    def __repr__(s): return 'XYZ(%.4f,%.4f,%.4f)' % (s.X, s.Y, s.Z)
XYZ.BasisX = XYZ(1,0,0); XYZ.BasisY = XYZ(0,1,0); XYZ.BasisZ = XYZ(0,0,1); XYZ.Zero = XYZ(0,0,0)

class UnitTypeId(object): Millimeters = 'mm'
class UnitUtils(object):
    @staticmethod
    def ConvertToInternalUnits(v, u): return float(v)/FT

class _Curve(object): pass
class Line(_Curve):
    def __init__(s, a, b): s.a, s.b = a, b
    @staticmethod
    def CreateBound(a, b):
        if abs(a.X-b.X) < 1e-12 and abs(a.Y-b.Y) < 1e-12 and abs(a.Z-b.Z) < 1e-12:
            raise Exception('Line terlalu pendek')
        return Line(a, b)
    def bbox(s): return (min(s.a.X,s.b.X), max(s.a.X,s.b.X), min(s.a.Y,s.b.Y), max(s.a.Y,s.b.Y))
class Arc(_Curve):
    def __init__(s, c, r): s.c, s.r = c, r
    @staticmethod
    def Create(c, r, a0, a1, xa, ya): return Arc(c, r)
    def bbox(s): return (s.c.X-s.r, s.c.X+s.r, s.c.Y-s.r, s.c.Y+s.r)

class CurveArray(list):
    def Append(s, c): s.append(c)
class CurveArrArray(list):
    def Append(s, c): s.append(c)
class ReferenceArray(list):
    def Append(s, c): s.append(c)

class Reference(object):
    def __init__(s, owner, tag): s.owner, s.tag = owner, tag
class PlanarFace(object):
    def __init__(s, n, o, owner, tag): s.FaceNormal, s.Origin, s.Reference = n, o, Reference(owner, tag)
class Solid(object):
    def __init__(s, faces): s.Faces = faces
class GeometryElement(list): pass

class Options(object):
    def __init__(s): s.ComputeReferences=False; s.DetailLevel=None; s.IncludeNonVisibleObjects=False
class ViewDetailLevel(object): Coarse, Medium, Fine = 'c', 'm', 'f'

class Parameter(object):
    def __init__(s, name): s.name = name
    def Set(s, v): REC['values'][s.name] = v; return True
class FamilyParameter(object):
    def __init__(s, name, kind, group, inst):
        s.Definition = types.SimpleNamespace(Name=name)
        s.name, s.kind, s.group, s.IsInstance = name, kind, group, inst

class Extrusion(object):
    _n = 0
    def __init__(s, x0, x1, y0, y1, end, round_only=False):
        Extrusion._n += 1
        s.id = Extrusion._n
        s.x0, s.x1, s.y0, s.y1 = x0, x1, y0, y1
        s.EndOffset = end; s._start = 0.0
        s.round_only = round_only
        s.Subcategory = None; s._vis = None
        s.params = {}
    def _get_start(s): return s._start
    def _set_start(s, v): s._start = v
    StartOffset = property(_get_start, _set_start)
    def get_Parameter(s, bip): return Parameter('%s_%d' % (bip, s.id))
    def SetVisibility(s, v): s._vis = v
    def get_Geometry(s, opt):
        z0, z1 = min(s._start, s.EndOffset), max(s._start, s.EndOffset)
        xm, ym, zm = (s.x0+s.x1)/2.0, (s.y0+s.y1)/2.0, (z0+z1)/2.0
        f = [PlanarFace(XYZ(0,0,-1), XYZ(xm,ym,z0), s, 'zmin'),
             PlanarFace(XYZ(0,0,1),  XYZ(xm,ym,z1), s, 'zmax')]
        if not s.round_only:
            f += [PlanarFace(XYZ(-1,0,0), XYZ(s.x0,ym,zm), s, 'xmin'),
                  PlanarFace(XYZ(1,0,0),  XYZ(s.x1,ym,zm), s, 'xmax'),
                  PlanarFace(XYZ(0,-1,0), XYZ(xm,s.y0,zm), s, 'ymin'),
                  PlanarFace(XYZ(0,1,0),  XYZ(xm,s.y1,zm), s, 'ymax')]
        return GeometryElement([Solid(f)])

class FamilyElementVisibilityType(object): Model = 'model'
class FamilyElementVisibility(object):
    def __init__(s, t): s.t=t; s.IsShownInCoarse=True; s.IsShownInMedium=True; s.IsShownInFine=True

class ReferencePlane(object):
    def __init__(s, p1, p2, cut, name=''):
        s.BubbleEnd, s.FreeEnd = p1, p2
        d = XYZ(p2.X-p1.X, p2.Y-p1.Y, p2.Z-p1.Z)
        n = XYZ(d.Y*cut.Z - d.Z*cut.Y, d.Z*cut.X - d.X*cut.Z, d.X*cut.Y - d.Y*cut.X)
        L = math.sqrt(n.X**2+n.Y**2+n.Z**2) or 1.0
        s.Normal = XYZ(n.X/L, n.Y/L, n.Z/L)
        s.Name = name
    def GetReference(s): return Reference(s, 'rp')
    def get_Parameter(s, bip): return Parameter('rp_%s' % bip)

class View(object):
    def __init__(s, name, vt, vd): s.Name=name; s.ViewType=vt; s.ViewDirection=vd; s.IsTemplate=False
class ViewPlan(View): pass
class ViewSection(View): pass
class ViewType(object): FloorPlan='FloorPlan'; Elevation='Elevation'
class Material(object):
    _n = 0
    def __init__(s, name):
        s.Name=name; s.Color=None; s.Transparency=0; s.Shininess=0; s.UseRenderAppearanceForShading=False
        Material._n += 1; s.Id = ElementId(Material._n)
    @staticmethod
    def Create(doc, name):
        m = Material(name); doc._elements[m.Id.v] = m; REC['mat'].append(name); return m.Id
class Color(object):
    def __init__(s, r, g, b): s.r, s.g, s.b = r, g, b
class ElementId(object):
    def __init__(s, v): s.v = v
    def __eq__(s, o): return isinstance(o, ElementId) and o.v == s.v
    def __ne__(s, o): return not s.__eq__(o)
    def __hash__(s): return hash(s.v)
ElementId.InvalidElementId = ElementId(-1)

class GroupTypeId(object):
    Geometry='Dimensions'; IdentityData='Identity'; Graphics='Graphics'; Visibility='Visibility'
    Materials='Materials'; Data='Data'; General='General'; Constraints='Constraints'
class _Sub(object):
    Integer='int'
class _Bool(object):
    YesNo='yesno'
class _Str(object):
    Text='text'
class _Ref(object):
    Material='material'
class SpecTypeId(object):
    Length='length'; Number='number'; Int=_Sub(); Boolean=_Bool(); String=_Str(); Reference=_Ref()
class BuiltInParameter(object):
    MATERIAL_ID_PARAM='mat'; IS_VISIBLE_PARAM='vis'; ELEM_REFERENCE_NAME='refname'
    ALL_MODEL_MANUFACTURER='manu'; ALL_MODEL_MODEL='model'; ALL_MODEL_TYPE_MARK='tmark'
    ALL_MODEL_DESCRIPTION='desc'; ALL_MODEL_URL='url'; FAMILY_WORK_PLANE_BASED='wpb'

class Plane(object):
    @staticmethod
    def CreateByNormalAndOrigin(n, o): return Plane()
class SketchPlane(object):
    @staticmethod
    def Create(doc, plane): return SketchPlane()

class Transaction(object):
    def __init__(s, doc, name): pass
    def Start(s): pass
    def Commit(s): pass
    def RollBack(s): pass
class SubTransaction(Transaction):
    def __init__(s, doc): pass
class SaveAsOptions(object):
    def __init__(s): s.OverwriteExistingFile=False

class FamilyType(object):
    def __init__(s, name): s.Name = name

class FamilyManager(object):
    def __init__(s): s.CurrentType=None; s._params={}
    def AddParameter(s, name, group, spec, inst):
        if name in s._params: raise Exception('duplikat parameter: ' + name)
        p = FamilyParameter(name, spec, group, inst); s._params[name]=p
        REC['param'][name] = (spec, group, inst); return p
    def Set(s, p, v):
        if not s.CurrentType: raise Exception('belum ada family type')
        if p.name in REC['formula']: raise Exception('parameter punya formula: ' + p.name)
        REC['values'].setdefault(s.CurrentType.Name, {})[p.name] = v
    def SetFormula(s, p, f):
        if p.name not in s._params: raise Exception('param tidak ada')
        REC['formula'][p.name] = f
    def NewType(s, name):
        t = FamilyType(name); s.CurrentType=t; REC['types'].append(name); return t
    def get_Parameter(s, bip): return Parameter('builtin_%s' % bip)
    def AssociateElementParameterToFamilyParameter(s, ep, fp): REC['assoc'].append((ep.name, fp.name))

class FamilyCreate(object):
    def __init__(s, doc): s.doc = doc
    def NewExtrusion(s, solid, caa, sp, end):
        xs, ys, rounds = [], [], []
        for ca in caa:
            if len(ca) == 0: raise Exception('profil kosong')
            for c in ca:
                b = c.bbox(); xs += [b[0], b[1]]; ys += [b[2], b[3]]
                rounds.append(isinstance(c, Arc))
        e = Extrusion(min(xs), max(xs), min(ys), max(ys), end, all(rounds))
        REC['ext'].append(e); return e
    def NewReferencePlane(s, p1, p2, cut, view):
        rp = ReferencePlane(p1, p2, cut); s.doc._rps.append(rp); REC['rp'].append(rp); return rp
    def NewDimension(s, view, line, refs):
        if len(refs) < 2: raise Exception('butuh >= 2 referensi')
        d = types.SimpleNamespace(FamilyLabel=None, AreSegmentsEqual=False, refs=list(refs))
        REC['dim'].append(d); return d
    def NewAlignment(s, view, r1, r2):
        REC['align'].append((r1, r2)); return True

class Category(object):
    def __init__(s, name): s.Name=name; s.Material=None
class _Cats(object):
    def __init__(s): s._d = {}
    def get_Item(s, n): return s._d.setdefault(n, Category(n))
    def NewSubcategory(s, parent, name):
        c = Category(name); REC['subcat'].append(name); return c
class Settings(object):
    def __init__(s): s.Categories=_Cats()
class OwnerFamily(object):
    def __init__(s): s.FamilyCategory=Category('Generic Models')
    def get_Parameter(s, bip): return Parameter('owner_%s' % bip)

class FilteredElementCollector(object):
    def __init__(s, doc): s.doc=doc; s._items=[]
    def OfClass(s, cls):
        if cls is ViewPlan: s._items=[v for v in s.doc._views if isinstance(v, ViewPlan)]
        elif cls is ViewSection: s._items=[v for v in s.doc._views if isinstance(v, ViewSection)]
        elif cls is ReferencePlane: s._items=list(s.doc._rps)
        elif cls is Material: s._items=[e for e in s.doc._elements.values() if isinstance(e, Material)]
        else: s._items=[]
        return s
    def __iter__(s): return iter(s._items)

class Document(object):
    def __init__(s):
        s.FamilyCreate=FamilyCreate(s); s.FamilyManager=FamilyManager()
        s.Settings=Settings(); s.OwnerFamily=OwnerFamily(); s.IsFamilyDocument=True
        s._elements={}; s._rps=[]
        s._views=[ViewPlan('Ref. Level', ViewType.FloorPlan, XYZ(0,0,1)),
                  ViewSection('Front', ViewType.Elevation, XYZ(0,-1,0)),
                  ViewSection('Left', ViewType.Elevation, XYZ(-1,0,0))]
        # reference plane bawaan template
        s._rps.append(ReferencePlane(XYZ(0,-5,0), XYZ(0,5,0), XYZ(0,0,1), 'Center (Left/Right)'))
        s._rps.append(ReferencePlane(XYZ(-5,0,0), XYZ(5,0,0), XYZ(0,0,1), 'Center (Front/Back)'))
    def Regenerate(s): pass
    def GetElement(s, eid): return s._elements.get(eid.v)
    def SaveAs(s, path, opts): REC['saved']=path
    def LoadFamily(s, doc): raise Exception('no project')

class Application(object):
    FamilyTemplatePath = ''
    VersionNumber = '2025'
    def NewFamilyDocument(s, tpl): return Document()
class UIApplication(object):
    def __init__(s): s.Application=Application(); s.ActiveUIDocument=None
