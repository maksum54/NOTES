# -*- coding: utf-8 -*-
# =============================================================================
#  INDORACK  -  WALLMOUNT RACK 19" SINGLE GLASS DOOR  (ref. WIR7010S)
#  Revit 2025 Family Builder
#
#  Sumber data  : Datasheet Indorack WIR7010S - Wallmount 19 inch Series
#                 Dimension (D x W x H) = 700 x 600 x 545 mm, 10U,
#                 berat +/- 31 kg, static load 60 kg.
#
#  Script ini MEMBUAT file .rfa baru dari template Generic Model,
#  lengkap dengan geometry, parameter (Depth / Width / Height / U),
#  reference plane + dimension berlabel (supaya family-nya FLEX),
#  material, subcategory, dan family types.
#
#  Jalankan di salah satu dari:
#    * pyRevit           -> pyRevit > Tools > Run Script (atau taruh di bundle)
#    * RevitPythonShell  -> paste ke shell / Run Script
#    * Dynamo            -> Python Script node (IronPython2 / CPython3)
#
#  TIDAK butuh project terbuka, tapi kalau ada project aktif family-nya
#  langsung di-load (LOAD_INTO_PROJECT = True).
# =============================================================================

import math
import os

try:
    import clr
    clr.AddReference('RevitAPI')
    clr.AddReference('RevitAPIUI')
except Exception:
    pass

from Autodesk.Revit.DB import *

# =============================================================================
#  1. KONFIGURASI  (ubah di sini kalau perlu)
# =============================================================================

FAMILY_NAME        = 'Indorack_Wallmount_Rack_19in_SingleGlassDoor'
OUTPUT_FOLDER      = None      # None -> folder Documents user
TEMPLATE_FILE      = None      # None -> auto cari 'Metric Generic Model.rft'
FAMILY_CATEGORY    = 'Generic Models'   # 'Data Devices' / 'Communication Devices' /
                                        # 'Electrical Equipment' / 'Specialty Equipment'
DIMS_AS_INSTANCE   = False     # False = Depth/Width/Height jadi TYPE parameter (+ bisa pakai type catalog)
                               # True  = jadi INSTANCE parameter (tiap rack bisa beda tanpa bikin type baru)
WORK_PLANE_BASED   = False     # True = family bisa ditempel ke work plane / face dinding
BUILD_TYPES        = True      # bikin family types untuk ukuran katalog lain
LOAD_INTO_PROJECT  = True      # load ke project yang sedang aktif (kalau ada)
OPEN_FAMILY_AFTER_BUILD = True # buka file .rfa hasilnya di Revit (dilewati saat jalan di Dynamo)
VERBOSE            = True

# -----------------------------------------------------------------------------
#  Nilai default (mm) - semua geometry dihitung dari angka-angka ini
# -----------------------------------------------------------------------------
DEF = {
    # ---- ukuran utama (dari datasheet) ----
    'Rack_Width':                   600.0,   # W - lebar (kiri-kanan)
    'Rack_Depth':                   700.0,   # D - kedalaman (depan-belakang)
    'Rack_Height_Manual':           545.0,   # H - tinggi (dipakai kalau Height_Auto = No)
    'U_Count':                      10,      # 10U
    'U_Pitch':                      44.45,   # 1U = 44.45 mm (EIA-310)
    'Frame_Height_Allowance':       100.5,   # H = U*44.45 + 100.5  (545 = 10*44.45 + 100.5)

    # ---- konstruksi bodi ----
    'Panel_Thickness':              1.5,     # plat sheet metal
    'Frame_Profile_Size':           25.0,    # mounting profile sudut
    'Door_Thickness':               10.0,
    'Door_Gap':                     2.5,     # 600 - 2x2.5 = 595 (lebar pintu di datasheet)
    'Door_Frame_Width':             40.0,
    'Glass_Thickness':              4.0,

    # ---- mounting angle 19" (EIA-310) ----
    'Rail_Standard_Width':          482.6,   # 19 inch
    'Rail_Hole_Spacing':            465.1,   # jarak center lubang kiri-kanan
    'Rail_Flange_Width':            15.9,
    'Rail_Leg_Depth':               35.0,
    'Rail_Thickness':               2.0,
    'Rail_Front_Setback':           50.0,    # jarak rail depan dari bidang depan kabinet
    'Rail_Rear_Setback':            400.0,   # jarak rail belakang dari rail depan

    # ---- aksesoris ----
    'Fan_Diameter':                 120.0,
    'Fan_Spacing':                  180.0,   # jarak antar center fan
    'Fan_Setback_From_Back':        230.0,
    'Cable_Entry_Width':            320.0,
    'Cable_Entry_Depth':            50.0,
    'Cable_Entry_Setback_From_Back': 55.0,
    'PDU_Height':                   44.45,
    'PDU_Depth':                    44.0,
    'Wall_Hole_Edge_Offset_X':      45.0,
    'Wall_Hole_Edge_Offset_Z':      70.0,
}

# -----------------------------------------------------------------------------
#  Family types: (nama type, depth mm, U, product id)
#  Pola kode Indorack: WIR<2 digit depth><2 digit U>S  (S = single door)
#  -> HANYA WIR7010S yang terverifikasi dari datasheet; sisanya ikut pola,
#     silakan cek ulang ke katalog sebelum dipakai di dokumen tender.
# -----------------------------------------------------------------------------
TYPES = [
    ('WIR7010S - 10U D700',              700.0, 10, 'WIR7010S'),
    ('19in Wallmount - 6U  D400',       400.0,  6, ''),
    ('19in Wallmount - 9U  D400',       400.0,  9, ''),
    ('19in Wallmount - 6U  D500',       500.0,  6, ''),
    ('19in Wallmount - 9U  D500',       500.0,  9, ''),
    ('19in Wallmount - 12U D500',       500.0, 12, ''),
    ('19in Wallmount - 6U  D600',       600.0,  6, ''),
    ('19in Wallmount - 9U  D600',       600.0,  9, ''),
    ('19in Wallmount - 12U D600',       600.0, 12, ''),
    ('19in Wallmount - 15U D600',       600.0, 15, ''),
    ('19in Wallmount - 12U D700',       700.0, 12, ''),
    ('19in Wallmount - 15U D700',       700.0, 15, ''),
    ('19in Wallmount - 18U D700',       700.0, 18, ''),
    ('19in Wallmount - 20U D700',       700.0, 20, ''),
]

# =============================================================================
#  2. UTILITAS
# =============================================================================

FT2MM = 304.8
LOG = []
STATS = {'solid': 0, 'refplane': 0, 'dim_ok': 0, 'dim_fail': 0,
         'align_ok': 0, 'align_fail': 0, 'param': 0}


def log(msg):
    LOG.append(msg)
    if VERBOSE:
        try:
            print(msg)
        except Exception:
            pass


def mm(v):
    """mm -> internal units (feet)."""
    try:
        return UnitUtils.ConvertToInternalUnits(float(v), UnitTypeId.Millimeters)
    except Exception:
        return float(v) / FT2MM


def ft2mm(v):
    return float(v) * FT2MM


def running_in_dynamo():
    return '__revit__' not in globals() or globals().get('__revit__') is None


def get_uiapp():
    """UIApplication dari pyRevit / RevitPythonShell (__revit__) atau dari Dynamo."""
    g = globals()
    if '__revit__' in g and g['__revit__'] is not None:
        return g['__revit__']
    for asm in ('RevitServices', 'RevitAPI', 'RevitAPIUI', 'RevitNodes'):
        try:
            clr.AddReference(asm)
        except Exception:
            pass
    try:
        from RevitServices.Persistence import DocumentManager
        return DocumentManager.Instance.CurrentUIApplication
    except Exception:
        pass
    raise Exception('Tidak menemukan UIApplication. Jalankan script ini dari '
                    'pyRevit, RevitPythonShell, atau Dynamo Python node.')


def close_dynamo_transaction():
    """Dynamo membuka transaksi sendiri; harus ditutup sebelum SaveAs / LoadFamily."""
    try:
        clr.AddReference('RevitServices')
    except Exception:
        pass
    try:
        from RevitServices.Transactions import TransactionManager
        TransactionManager.Instance.ForceCloseTransaction()
        return True
    except Exception:
        return False


def find_template(app):
    if TEMPLATE_FILE and os.path.isfile(TEMPLATE_FILE):
        return TEMPLATE_FILE
    names = ['Metric Generic Model.rft', 'Generic Model (metric).rft',
             'Metric Generic Model face based.rft']
    roots = []
    try:
        if app.FamilyTemplatePath:
            roots.append(app.FamilyTemplatePath)
    except Exception:
        pass
    ver = ''
    try:
        ver = str(app.VersionNumber)
    except Exception:
        ver = '2025'
    for base in [r'C:\ProgramData\Autodesk\RVT ' + ver + r'\Family Templates',
                 r'C:\ProgramData\Autodesk\RVT 2025\Family Templates']:
        for sub in ['English', 'English_I', 'English-Imperial', 'Indonesian', '']:
            roots.append(os.path.join(base, sub) if sub else base)
    seen = set()
    for root in roots:
        if not root or root in seen or not os.path.isdir(root):
            continue
        seen.add(root)
        for n in names:
            p = os.path.join(root, n)
            if os.path.isfile(p):
                return p
        for dirpath, _dirs, files in os.walk(root):
            for n in names:
                if n in files:
                    return os.path.join(dirpath, n)
    raise Exception('Template "Metric Generic Model.rft" tidak ketemu. '
                    'Isi TEMPLATE_FILE di bagian KONFIGURASI dengan path lengkapnya.')


def output_path():
    folder = OUTPUT_FOLDER
    if not folder:
        folder = os.path.join(os.path.expanduser('~'), 'Documents')
    if not os.path.isdir(folder):
        os.makedirs(folder)
    return os.path.join(folder, FAMILY_NAME + '.rfa')


def group_id(kind):
    """Cari ForgeTypeId group parameter dengan fallback antar versi Revit."""
    table = {
        'dim':      ['Geometry', 'Dimensions'],
        'ident':    ['IdentityData'],
        'graphics': ['Graphics'],
        'vis':      ['Visibility', 'Graphics'],
        'mat':      ['Materials', 'MaterialsFinishes', 'Graphics'],
        'data':     ['Data', 'General', 'Other', 'IdentityData'],
        'constr':   ['Constraints'],
    }
    for n in table.get(kind, []):
        gid = getattr(GroupTypeId, n, None)
        if gid is not None:
            return gid
    return GroupTypeId.General


def spec_id(kind):
    if kind == 'length':
        return SpecTypeId.Length
    if kind == 'int':
        return SpecTypeId.Int.Integer
    if kind == 'yesno':
        return SpecTypeId.Boolean.YesNo
    if kind == 'text':
        return SpecTypeId.String.Text
    if kind == 'number':
        return SpecTypeId.Number
    if kind == 'material':
        return SpecTypeId.Reference.Material
    return SpecTypeId.Number


# =============================================================================
#  3. STATE GLOBAL
# =============================================================================

FDOC = None          # family document
FM = None            # FamilyManager
SP_XY = None         # sketch plane XY (z = 0)
VPLAN = None         # floor plan view (untuk ref plane / dimensi arah X-Y)
VELEV = None         # front elevation view (untuk ref plane / dimensi arah Z)
P = {}               # nama parameter -> FamilyParameter
RP = {}              # nama reference plane -> ReferencePlane
MAT = {}             # nama material -> ElementId
SUB = {}             # nama subcategory -> Category
PARTS = {}           # nama grup -> list extrusion


def get_views():
    global VPLAN, VELEV
    plans = [v for v in FilteredElementCollector(FDOC).OfClass(ViewPlan)
             if not v.IsTemplate and v.ViewType == ViewType.FloorPlan]
    VPLAN = plans[0] if plans else None
    elevs = [v for v in FilteredElementCollector(FDOC).OfClass(ViewSection)
             if not v.IsTemplate and v.ViewType == ViewType.Elevation]
    front = None
    for v in elevs:
        d = v.ViewDirection
        if abs(d.Y) > 0.9 and d.Y < 0:       # arah pandang depan
            front = v
            break
    if front is None:
        for v in elevs:
            if abs(v.ViewDirection.Y) > 0.9:
                front = v
                break
    VELEV = front if front is not None else (elevs[0] if elevs else None)
    if VPLAN is None or VELEV is None:
        raise Exception('View plan / elevation tidak ditemukan di template family.')
    log('View: plan="{0}", elevation="{1}"'.format(VPLAN.Name, VELEV.Name))


def set_category():
    try:
        cat = FDOC.Settings.Categories.get_Item(FAMILY_CATEGORY)
        FDOC.OwnerFamily.FamilyCategory = cat
        log('Family category  : ' + FAMILY_CATEGORY)
    except Exception as ex:
        log('! Gagal set category "{0}" ({1}) - dibiarkan default.'.format(FAMILY_CATEGORY, ex))
    if WORK_PLANE_BASED:
        try:
            FDOC.OwnerFamily.get_Parameter(BuiltInParameter.FAMILY_WORK_PLANE_BASED).Set(1)
        except Exception:
            pass


# =============================================================================
#  4. PARAMETER
# =============================================================================

def add_param(name, kind, group, is_inst, value=None, formula=None):
    try:
        prm = FM.AddParameter(name, group_id(group), spec_id(kind), is_inst)
    except Exception as ex:
        log('! AddParameter gagal: {0} ({1})'.format(name, ex))
        return None
    P[name] = prm
    STATS['param'] += 1
    if value is not None:
        set_param(name, kind, value)
    if formula:
        P[name + '__formula'] = formula
    return prm


def set_param(name, kind, value):
    prm = P.get(name)
    if prm is None:
        return
    try:
        if kind == 'length':
            FM.Set(prm, mm(value))
        elif kind in ('int', 'yesno'):
            FM.Set(prm, int(value))
        elif kind == 'text':
            FM.Set(prm, str(value))
        else:
            FM.Set(prm, float(value))
    except Exception as ex:
        log('! Set gagal: {0} = {1} ({2})'.format(name, value, ex))


def build_parameters():
    """Semua parameter dibuat dulu, formula menyusul (build_formulas)."""
    inst = bool(DIMS_AS_INSTANCE)

    # ---------- ukuran utama ----------
    add_param('Rack_Width',             'length', 'dim', inst)
    add_param('Rack_Depth',             'length', 'dim', inst)
    add_param('Rack_Height',            'length', 'dim', inst)   # formula
    add_param('Rack_Height_Manual',     'length', 'dim', inst)
    add_param('Height_Auto',            'yesno',  'dim', inst)
    add_param('U_Count',                'int',    'dim', inst)
    add_param('U_Pitch',                'length', 'dim', False)
    add_param('Frame_Height_Allowance', 'length', 'dim', False)

    # ---------- konstruksi ----------
    for n in ('Panel_Thickness', 'Frame_Profile_Size', 'Door_Thickness',
              'Door_Gap', 'Door_Frame_Width', 'Glass_Thickness'):
        add_param(n, 'length', 'dim', False)
    add_param('Door_Width',  'length', 'dim', False)   # formula
    add_param('Door_Height', 'length', 'dim', False)   # formula

    # ---------- mounting angle 19" ----------
    for n in ('Rail_Standard_Width', 'Rail_Hole_Spacing', 'Rail_Flange_Width',
              'Rail_Leg_Depth', 'Rail_Thickness', 'Rail_Rear_Setback'):
        add_param(n, 'length', 'dim', False)
    add_param('Rail_Front_Setback', 'length', 'dim', True)
    add_param('Rail_Height',        'length', 'dim', inst)   # formula
    add_param('Rail_Bottom_Offset', 'length', 'dim', inst)   # formula

    # ---------- aksesoris ----------
    for n in ('Fan_Diameter', 'Fan_Spacing', 'Fan_Setback_From_Back',
              'Cable_Entry_Width', 'Cable_Entry_Depth', 'Cable_Entry_Setback_From_Back',
              'PDU_Height', 'PDU_Depth', 'Wall_Hole_Edge_Offset_X',
              'Wall_Hole_Edge_Offset_Z'):
        add_param(n, 'length', 'dim', False)

    # ---------- info terhitung ----------
    add_param('Max_Equipment_Depth', 'length', 'dim', inst)    # formula
    add_param('Wall_Hole_Spacing_X', 'length', 'dim', inst)    # formula
    add_param('Wall_Hole_Spacing_Z', 'length', 'dim', inst)    # formula

    # ---------- visibility / opsi ----------
    add_param('Show_Front_Door', 'yesno', 'vis', True,  1)
    add_param('Front_Door_Open', 'yesno', 'vis', True,  0)
    add_param('Show_Side_Doors', 'yesno', 'vis', True,  1)
    add_param('Show_Rails',      'yesno', 'vis', True,  1)
    add_param('Show_Rear_Rails', 'yesno', 'vis', False, 0)
    add_param('Show_Fan',        'yesno', 'vis', True,  1)
    add_param('Fan_Count',       'int',   'vis', False, 1)
    add_param('Show_PDU',        'yesno', 'vis', True,  1)
    add_param('Show_Brush_Panel', 'yesno', 'vis', False, 1)
    add_param('Show_Wall_Holes', 'yesno', 'vis', False, 1)
    # kontrol gabungan (formula)
    for n in ('_Vis_Door_Closed', '_Vis_Door_Open', '_Vis_Fan_1',
              '_Vis_Fan_2', '_Vis_Rear_Rails'):
        add_param(n, 'yesno', 'vis', True)

    # ---------- material ----------
    for n in ('Material_Body', 'Material_Glass', 'Material_Rail', 'Material_Accessory'):
        add_param(n, 'material', 'mat', False)

    # ---------- identitas produk ----------
    add_param('Product_ID',           'text',   'ident', False, 'WIR7010S')
    add_param('Product_Type',         'text',   'ident', False, 'Single Door Wallmount Rack')
    add_param('Rack_Standard',        'text',   'ident', False, 'EIA-310 19 inch / Metric / ETSI')
    add_param('Mounting_Method',      'text',   'ident', False, 'Wall Mount - 4 pcs Dynabolt 88 mm')
    add_param('Finish_Color',         'text',   'ident', False, 'Black')
    add_param('Included_Accessories', 'text',   'ident', False,
              'Glass front door + 2 side door with lock; 1 horizontal PDU 6 outlet with switch; '
              '1 single fan 220VAC; 1 top brush panel; 4 dynabolt 88mm; 20 set M06 cagenut & screw')
    add_param('Weight_kg',            'number', 'ident', False, 31.0)
    add_param('Static_Load_kg',       'number', 'ident', False, 60.0)

    log('Parameter dibuat  : {0}'.format(STATS['param']))


def set_default_values():
    """Isi nilai numerik default (dipanggil setelah type pertama dibuat)."""
    for k in ('Rack_Width', 'Rack_Depth', 'Rack_Height_Manual', 'U_Pitch',
              'Frame_Height_Allowance', 'Panel_Thickness', 'Frame_Profile_Size',
              'Door_Thickness', 'Door_Gap', 'Door_Frame_Width', 'Glass_Thickness',
              'Rail_Standard_Width', 'Rail_Hole_Spacing', 'Rail_Flange_Width',
              'Rail_Leg_Depth', 'Rail_Thickness', 'Rail_Front_Setback',
              'Rail_Rear_Setback', 'Fan_Diameter', 'Fan_Spacing',
              'Fan_Setback_From_Back', 'Cable_Entry_Width', 'Cable_Entry_Depth',
              'Cable_Entry_Setback_From_Back', 'PDU_Height', 'PDU_Depth',
              'Wall_Hole_Edge_Offset_X', 'Wall_Hole_Edge_Offset_Z'):
        set_param(k, 'length', DEF[k])
    set_param('U_Count', 'int', DEF['U_Count'])
    set_param('Height_Auto', 'yesno', 1)
    set_param('Rack_Height', 'length', DEF['Rack_Height_Manual'])


def build_formulas():
    f = [
        ('Rack_Height',         'if(Height_Auto, U_Count * U_Pitch + Frame_Height_Allowance, Rack_Height_Manual)'),
        ('Rail_Height',         'U_Count * U_Pitch'),
        ('Rail_Bottom_Offset',  '(Rack_Height - Rail_Height) / 2'),
        ('Door_Width',          'Rack_Width - Door_Gap * 2'),
        ('Door_Height',         'Rack_Height - Door_Gap * 2'),
        ('Max_Equipment_Depth', 'Rack_Depth - Door_Thickness - Rail_Front_Setback - Rail_Leg_Depth - Panel_Thickness'),
        ('Wall_Hole_Spacing_X', 'Rack_Width - Wall_Hole_Edge_Offset_X * 2'),
        ('Wall_Hole_Spacing_Z', 'Rack_Height - Wall_Hole_Edge_Offset_Z * 2'),
        ('_Vis_Door_Closed',    'Show_Front_Door and not(Front_Door_Open)'),
        ('_Vis_Door_Open',      'Show_Front_Door and Front_Door_Open'),
        ('_Vis_Fan_1',          'Show_Fan and Fan_Count > 0'),
        ('_Vis_Fan_2',          'Show_Fan and Fan_Count > 1'),
        ('_Vis_Rear_Rails',     'Show_Rails and Show_Rear_Rails'),
    ]
    for name, formula in f:
        prm = P.get(name)
        if prm is None:
            continue
        st = SubTransaction(FDOC)
        st.Start()
        try:
            FM.SetFormula(prm, formula)
            st.Commit()
        except Exception as ex:
            st.RollBack()
            log('! Formula gagal: {0} = "{1}" ({2})'.format(name, formula, ex))


def set_identity_builtins():
    pairs = [
        (BuiltInParameter.ALL_MODEL_MANUFACTURER, 'Indorack'),
        (BuiltInParameter.ALL_MODEL_MODEL,        'WIR7010S'),
        (BuiltInParameter.ALL_MODEL_TYPE_MARK,    'WIR7010S'),
        (BuiltInParameter.ALL_MODEL_DESCRIPTION,
         'Wallmount Rack 19 inch 10U, depth 700 mm, single glass door, welded structure, '
         'static load 60 kg'),
        (BuiltInParameter.ALL_MODEL_URL, 'https://www.indorack.com'),
    ]
    for bip, val in pairs:
        try:
            prm = FM.get_Parameter(bip)
            if prm is not None:
                FM.Set(prm, val)
        except Exception:
            pass


# =============================================================================
#  5. MATERIAL & SUBCATEGORY
# =============================================================================

def build_materials():
    specs = [
        ('Material_Body',      'Indorack - Cabinet Steel Black',  (35, 35, 38),   0,  64),
        ('Material_Glass',     'Indorack - Tempered Glass Tinted', (70, 80, 90),  70, 90),
        ('Material_Rail',      'Indorack - Mounting Angle Steel', (95, 95, 100),  0,  50),
        ('Material_Accessory', 'Indorack - Accessory',            (60, 60, 62),   0,  40),
    ]
    for pname, mname, rgb, transp, shine in specs:
        mid = ElementId.InvalidElementId
        try:
            exist = [m for m in FilteredElementCollector(FDOC).OfClass(Material)
                     if m.Name == mname]
            if exist:
                mid = exist[0].Id
            else:
                mid = Material.Create(FDOC, mname)
            m = FDOC.GetElement(mid)
            m.Color = Color(rgb[0], rgb[1], rgb[2])
            m.Transparency = transp
            m.Shininess = shine
            m.UseRenderAppearanceForShading = False
        except Exception as ex:
            log('! Material "{0}" gagal ({1})'.format(mname, ex))
        MAT[pname] = mid
        if mid != ElementId.InvalidElementId and P.get(pname) is not None:
            try:
                FM.Set(P[pname], mid)
            except Exception:
                pass


def build_subcategories():
    famcat = FDOC.OwnerFamily.FamilyCategory
    names = [('Frame', 'Material_Body'), ('Panels', 'Material_Body'),
             ('Doors', 'Material_Body'), ('Glass', 'Material_Glass'),
             ('Mounting Angle', 'Material_Rail'), ('Accessories', 'Material_Accessory'),
             ('Wall Mounting', 'Material_Body')]
    for n, matkey in names:
        try:
            sub = FDOC.Settings.Categories.NewSubcategory(famcat, n)
            mid = MAT.get(matkey, ElementId.InvalidElementId)
            if mid and mid != ElementId.InvalidElementId:
                sub.Material = FDOC.GetElement(mid)
            SUB[n] = sub
        except Exception as ex:
            log('! Subcategory "{0}" gagal ({1})'.format(n, ex))


# =============================================================================
#  6. HELPER GEOMETRY
# =============================================================================

def _apply(ext, group, sub, mat, vis, detail):
    if sub and SUB.get(sub) is not None:
        try:
            ext.Subcategory = SUB[sub]
        except Exception:
            pass
    if mat and P.get(mat) is not None:
        try:
            ep = ext.get_Parameter(BuiltInParameter.MATERIAL_ID_PARAM)
            if ep is not None:
                FM.AssociateElementParameterToFamilyParameter(ep, P[mat])
        except Exception:
            pass
    if vis and P.get(vis) is not None:
        try:
            ep = ext.get_Parameter(BuiltInParameter.IS_VISIBLE_PARAM)
            if ep is not None:
                FM.AssociateElementParameterToFamilyParameter(ep, P[vis])
        except Exception:
            pass
    if detail:
        try:
            fev = FamilyElementVisibility(FamilyElementVisibilityType.Model)
            fev.IsShownInCoarse = ('c' in detail)
            fev.IsShownInMedium = ('m' in detail)
            fev.IsShownInFine = True
            ext.SetVisibility(fev)
        except Exception:
            pass
    PARTS.setdefault(group, []).append(ext)
    STATS['solid'] += 1


def prism(pts2d, z0, z1, group='misc', sub=None, mat='Material_Body',
          vis=None, detail='cmf'):
    """Extrusion vertikal dari polygon plan (list (x,y) mm) setinggi z0..z1 mm."""
    if abs(z1 - z0) < 0.01 or len(pts2d) < 3:
        return None
    ca = CurveArray()
    n = len(pts2d)
    for i in range(n):
        a = pts2d[i]
        b = pts2d[(i + 1) % n]
        if abs(a[0] - b[0]) < 1e-9 and abs(a[1] - b[1]) < 1e-9:
            continue
        ca.Append(Line.CreateBound(XYZ(mm(a[0]), mm(a[1]), 0.0),
                                   XYZ(mm(b[0]), mm(b[1]), 0.0)))
    caa = CurveArrArray()
    caa.Append(ca)
    try:
        ext = FDOC.FamilyCreate.NewExtrusion(True, caa, SP_XY, mm(max(z0, z1)))
        ext.StartOffset = mm(min(z0, z1))
    except Exception as ex:
        log('! Extrusion gagal ({0}): {1}'.format(group, ex))
        return None
    _apply(ext, group, sub, mat, vis, detail)
    return ext


def box(x0, x1, y0, y1, z0, z1, **kw):
    if abs(x1 - x0) < 0.01 or abs(y1 - y0) < 0.01:
        return None
    xa, xb = min(x0, x1), max(x0, x1)
    ya, yb = min(y0, y1), max(y0, y1)
    return prism([(xa, ya), (xb, ya), (xb, yb), (xa, yb)], z0, z1, **kw)


def cyl(cx, cy, r, z0, z1, **kw):
    if r <= 0.01 or abs(z1 - z0) < 0.01:
        return None
    c = XYZ(mm(cx), mm(cy), 0.0)
    ca = CurveArray()
    ca.Append(Arc.Create(c, mm(r), 0.0, math.pi, XYZ.BasisX, XYZ.BasisY))
    ca.Append(Arc.Create(c, mm(r), math.pi, 2.0 * math.pi, XYZ.BasisX, XYZ.BasisY))
    caa = CurveArrArray()
    caa.Append(ca)
    try:
        ext = FDOC.FamilyCreate.NewExtrusion(True, caa, SP_XY, mm(max(z0, z1)))
        ext.StartOffset = mm(min(z0, z1))
    except Exception as ex:
        log('! Cylinder gagal: {0}'.format(ex))
        return None
    _apply(ext, kw.get('group', 'misc'), kw.get('sub'), kw.get('mat', 'Material_Body'),
           kw.get('vis'), kw.get('detail', 'mf'))
    return ext


def rot90(pts, ox, oy):
    """Putar +90 derajat (CCW, dilihat dari atas) terhadap titik (ox, oy)."""
    out = []
    for (x, y) in pts:
        dx = x - ox
        dy = y - oy
        out.append((ox - dy, oy + dx))
    return out


# =============================================================================
#  7. REFERENCE PLANE, DIMENSION, ALIGNMENT
# =============================================================================

REF_IDX = {'left': 3, 'center_lr': 4, 'right': 5, 'front': 6, 'center_fb': 7,
           'back': 8, 'bottom': 9, 'center_elev': 10, 'top': 11, 'strong': 1, 'weak': 2}


def find_origin_planes():
    """Ambil reference plane bawaan template: Center (Left/Right) & Center (Front/Back)."""
    for rp in FilteredElementCollector(FDOC).OfClass(ReferencePlane):
        try:
            n = rp.Normal
            o = rp.BubbleEnd
        except Exception:
            continue
        if abs(abs(n.X) - 1.0) < 1e-6 and abs(o.X) < 1e-6:
            RP['center_lr'] = rp
        elif abs(abs(n.Y) - 1.0) < 1e-6 and abs(o.Y) < 1e-6:
            RP['center_fb'] = rp
    log('Ref plane origin  : center_lr={0}, center_fb={1}'.format(
        'ok' if 'center_lr' in RP else 'MISSING',
        'ok' if 'center_fb' in RP else 'MISSING'))


def add_rp_x(key, x, y0, y1, name, ref=None):
    """Reference plane vertikal, normal ke arah X (bidang kiri/kanan)."""
    rp = FDOC.FamilyCreate.NewReferencePlane(
        XYZ(mm(x), mm(y0), 0.0), XYZ(mm(x), mm(y1), 0.0), XYZ.BasisZ, VPLAN)
    return _finish_rp(rp, key, name, ref)


def add_rp_y(key, y, x0, x1, name, ref=None):
    """Reference plane vertikal, normal ke arah Y (bidang depan/belakang)."""
    rp = FDOC.FamilyCreate.NewReferencePlane(
        XYZ(mm(x0), mm(y), 0.0), XYZ(mm(x1), mm(y), 0.0), XYZ.BasisZ, VPLAN)
    return _finish_rp(rp, key, name, ref)


def add_rp_z(key, z, x0, x1, name, ref=None):
    """Reference plane horizontal (bidang atas/bawah), dibuat di view elevation."""
    d = VELEV.ViewDirection
    rp = FDOC.FamilyCreate.NewReferencePlane(
        XYZ(mm(x0), 0.0, mm(z)), XYZ(mm(x1), 0.0, mm(z)), XYZ(d.X, d.Y, d.Z), VELEV)
    return _finish_rp(rp, key, name, ref)


def _finish_rp(rp, key, name, ref):
    try:
        rp.Name = name
    except Exception:
        pass
    if ref:
        try:
            rp.get_Parameter(BuiltInParameter.ELEM_REFERENCE_NAME).Set(REF_IDX[ref])
        except Exception:
            pass
    RP[key] = rp
    STATS['refplane'] += 1
    return rp


def dim_label(view, line, keys, param_name=None, equality=False):
    """Buat dimensi antar reference plane lalu beri label parameter."""
    st = SubTransaction(FDOC)
    st.Start()
    try:
        ra = ReferenceArray()
        for k in keys:
            rp = RP.get(k)
            if rp is None:
                raise Exception('reference plane "{0}" tidak ada'.format(k))
            ra.Append(rp.GetReference())
        d = FDOC.FamilyCreate.NewDimension(view, line, ra)
        if equality:
            try:
                d.AreSegmentsEqual = True
            except Exception:
                pass
        elif param_name and P.get(param_name) is not None:
            d.FamilyLabel = P[param_name]
        FDOC.Regenerate()
        st.Commit()
        STATS['dim_ok'] += 1
        return d
    except Exception as ex:
        st.RollBack()
        STATS['dim_fail'] += 1
        log('! Dimensi gagal {0} -> {1} ({2})'.format(keys, param_name, ex))
        return None


def _face_ref(ext, axis, coord_mm):
    """Cari reference face planar dengan normal sejajar axis pada koordinat coord_mm."""
    idx = {'x': 0, 'y': 1, 'z': 2}[axis]
    opt = Options()
    opt.ComputeReferences = True
    opt.DetailLevel = ViewDetailLevel.Fine
    opt.IncludeNonVisibleObjects = False
    try:
        geo = ext.get_Geometry(opt)
    except Exception:
        return None
    best = None
    bestd = 0.4  # toleransi mm
    for g in geo:
        if not isinstance(g, Solid):
            continue
        for f in g.Faces:
            if not isinstance(f, PlanarFace):
                continue
            n = f.FaceNormal
            comp = (n.X, n.Y, n.Z)[idx]
            if abs(abs(comp) - 1.0) > 1e-6:
                continue
            o = f.Origin
            val = ft2mm((o.X, o.Y, o.Z)[idx])
            d = abs(val - coord_mm)
            if d < bestd:
                bestd = d
                best = f.Reference
    return best


def align(rp_key, ext, axis, coord_mm, view=None):
    """Kunci satu muka solid ke reference plane (supaya ikut flex)."""
    if ext is None:
        return False
    rp = RP.get(rp_key)
    if rp is None:
        return False
    v = view if view is not None else (VELEV if axis == 'z' else VPLAN)
    st = SubTransaction(FDOC)
    st.Start()
    try:
        FDOC.Regenerate()
        fref = _face_ref(ext, axis, coord_mm)
        if fref is None:
            raise Exception('muka {0}={1} tidak ketemu'.format(axis, coord_mm))
        FDOC.FamilyCreate.NewAlignment(v, rp.GetReference(), fref)
        FDOC.Regenerate()
        st.Commit()
        STATS['align_ok'] += 1
        return True
    except Exception as ex:
        st.RollBack()
        STATS['align_fail'] += 1
        log('! Align gagal [{0} {1}={2}]: {3}'.format(rp_key, axis, coord_mm, ex))
        return False


# =============================================================================
#  8. GEOMETRY
#
#  Sistem koordinat family:
#      X  : 0 di tengah rak, -W/2 (kiri) .. +W/2 (kanan)
#      Y  : 0 di BIDANG BELAKANG rak (menempel dinding),
#           badan rak ke arah -Y, pintu kaca di y = -Depth
#      Z  : 0 di dasar rak (Ref. Level), puncak di z = Height
# =============================================================================

def build_reference_planes():
    W = DEF['Rack_Width']
    D = DEF['Rack_Depth']
    H = DEF['Rack_Height_Manual']
    t = DEF['Panel_Thickness']
    dt = DEF['Door_Thickness']
    g = DEF['Door_Gap']
    rw = DEF['Rail_Standard_Width']
    yfi = -(D - dt)
    zr0 = (H - DEF['U_Count'] * DEF['U_Pitch']) / 2.0
    zr1 = zr0 + DEF['U_Count'] * DEF['U_Pitch']
    y_rf = yfi + DEF['Rail_Front_Setback']

    y0, y1 = 120.0, -(D + 120.0)
    x0, x1 = -(W / 2.0 + 120.0), (W / 2.0 + 120.0)

    add_rp_x('left',      -W / 2.0, y0, y1, 'Rack Left',            'left')
    add_rp_x('right',      W / 2.0, y0, y1, 'Rack Right',           'right')
    add_rp_y('front',     -D,       x0, x1, 'Rack Front (Door)',    'front')
    add_rp_y('front_inner', yfi,    x0, x1, 'Rack Front Inner',     'weak')
    add_rp_z('base',       0.0,     x0, x1, 'Rack Base',            'bottom')
    add_rp_z('top',        H,       x0, x1, 'Rack Top',             'top')
    add_rp_z('top_inner',  H - t,   x0, x1, 'Rack Top Inner',       'weak')
    add_rp_x('side_in_l', -W / 2.0 + t, y0, y1, 'Side Panel Inner L', 'weak')
    add_rp_x('side_in_r',  W / 2.0 - t, y0, y1, 'Side Panel Inner R', 'weak')
    add_rp_x('door_l',    -W / 2.0 + g, y0, y1, 'Door Left',        'weak')
    add_rp_x('door_r',     W / 2.0 - g, y0, y1, 'Door Right',       'weak')
    add_rp_z('door_top',   H - g,   x0, x1, 'Door Top',             'weak')
    add_rp_x('rail_l',    -rw / 2.0, y0, y1, 'Mounting Angle L',    'weak')
    add_rp_x('rail_r',     rw / 2.0, y0, y1, 'Mounting Angle R',    'weak')
    add_rp_y('rail_front', y_rf,    x0, x1, 'Mounting Angle Front', 'weak')
    add_rp_z('rail_bottom', zr0,    x0, x1, 'Mounting Angle Bottom', 'weak')
    add_rp_z('rail_top',   zr1,     x0, x1, 'Mounting Angle Top',   'weak')
    log('Reference plane   : {0}'.format(STATS['refplane']))


def build_dimensions():
    W = DEF['Rack_Width']
    D = DEF['Rack_Depth']
    H = DEF['Rack_Height_Manual']

    def lx(off):   # garis dimensi arah X (di view plan)
        return Line.CreateBound(XYZ(mm(-W), mm(off), 0.0), XYZ(mm(W), mm(off), 0.0))

    def ly(off):   # garis dimensi arah Y (di view plan)
        return Line.CreateBound(XYZ(mm(off), mm(150.0), 0.0), XYZ(mm(off), mm(-D - 150.0), 0.0))

    def lz(off):   # garis dimensi arah Z (di view elevation)
        return Line.CreateBound(XYZ(mm(off), 0.0, mm(-150.0)), XYZ(mm(off), 0.0, mm(H + 250.0)))

    # --- lebar: rak selalu simetris terhadap Center (Left/Right) ---
    dim_label(VPLAN, lx(160.0), ['left', 'center_lr', 'right'], None, True)
    dim_label(VPLAN, lx(260.0), ['left', 'right'], 'Rack_Width')
    # --- kedalaman diukur dari bidang belakang (Center Front/Back) ---
    dim_label(VPLAN, ly(W / 2.0 + 160.0), ['center_fb', 'front'], 'Rack_Depth')
    dim_label(VPLAN, ly(W / 2.0 + 260.0), ['front', 'front_inner'], 'Door_Thickness')
    dim_label(VPLAN, ly(-W / 2.0 - 160.0), ['front_inner', 'rail_front'], 'Rail_Front_Setback')
    # --- tebal panel & celah pintu ---
    dim_label(VPLAN, lx(360.0), ['left', 'side_in_l'], 'Panel_Thickness')
    dim_label(VPLAN, lx(420.0), ['right', 'side_in_r'], 'Panel_Thickness')
    dim_label(VPLAN, lx(480.0), ['left', 'door_l'], 'Door_Gap')
    dim_label(VPLAN, lx(540.0), ['right', 'door_r'], 'Door_Gap')
    # --- mounting angle 19 inch, simetris di tengah ---
    dim_label(VPLAN, lx(-120.0), ['rail_l', 'center_lr', 'rail_r'], None, True)
    dim_label(VPLAN, lx(-220.0), ['rail_l', 'rail_r'], 'Rail_Standard_Width')
    # --- tinggi ---
    dim_label(VELEV, lz(W / 2.0 + 160.0), ['base', 'top'], 'Rack_Height')
    dim_label(VELEV, lz(W / 2.0 + 260.0), ['top_inner', 'top'], 'Panel_Thickness')
    dim_label(VELEV, lz(W / 2.0 + 360.0), ['door_top', 'top'], 'Door_Gap')
    dim_label(VELEV, lz(-W / 2.0 - 160.0), ['base', 'rail_bottom'], 'Rail_Bottom_Offset')
    dim_label(VELEV, lz(-W / 2.0 - 260.0), ['rail_bottom', 'rail_top'], 'Rail_Height')
    log('Dimensi berlabel  : ok={0}, gagal={1}'.format(STATS['dim_ok'], STATS['dim_fail']))


def build_geometry():
    W = DEF['Rack_Width']
    D = DEF['Rack_Depth']
    H = DEF['Rack_Height_Manual']
    t = DEF['Panel_Thickness']
    pf = DEF['Frame_Profile_Size']
    dt = DEF['Door_Thickness']
    g = DEF['Door_Gap']
    fw = DEF['Door_Frame_Width']
    gt = DEF['Glass_Thickness']
    rw = DEF['Rail_Standard_Width']
    rfl = DEF['Rail_Flange_Width']
    rlg = DEF['Rail_Leg_Depth']
    rth = DEF['Rail_Thickness']

    xl, xr = -W / 2.0, W / 2.0
    yf = -D                     # muka pintu (paling depan)
    yfi = -(D - dt)             # bidang depan kabinet
    yb = 0.0                    # bidang belakang (menempel dinding)
    zr0 = (H - DEF['U_Count'] * DEF['U_Pitch']) / 2.0
    zr1 = zr0 + DEF['U_Count'] * DEF['U_Pitch']
    y_rf = yfi + DEF['Rail_Front_Setback']
    y_rr = y_rf + DEF['Rail_Rear_Setback']

    # ---------------------------------------------------------------- 1. BACK
    e = box(xl, xr, yb - t, yb, 0.0, H, group='back', sub='Panels')
    align('left', e, 'x', xl)
    align('right', e, 'x', xr)
    align('center_fb', e, 'y', yb)
    align('top', e, 'z', H)
    align('base', e, 'z', 0.0)

    # --------------------------------------------------------- 2. TOP + SLOT
    cw = DEF['Cable_Entry_Width']
    cs0 = -DEF['Cable_Entry_Setback_From_Back']
    cs1 = cs0 - DEF['Cable_Entry_Depth']
    for (bx0, bx1, by0, by1) in [(xl, xr, cs0, yb - t),
                                 (xl, xr, yfi, cs1),
                                 (xl, -cw / 2.0, cs1, cs0),
                                 (cw / 2.0, xr, cs1, cs0)]:
        e = box(bx0, bx1, by0, by1, H - t, H, group='top', sub='Panels')
        align('top', e, 'z', H)
        align('top_inner', e, 'z', H - t)
        if abs(bx0 - xl) < 0.01:
            align('left', e, 'x', xl)
        if abs(bx1 - xr) < 0.01:
            align('right', e, 'x', xr)

    # ------------------------------------------------------------- 3. BOTTOM
    e = box(xl, xr, yfi, yb - t, 0.0, t, group='bottom', sub='Panels')
    align('left', e, 'x', xl)
    align('right', e, 'x', xr)
    align('front_inner', e, 'y', yfi)
    align('base', e, 'z', 0.0)

    # --------------------------------------------- 4. SIDE DOOR (kiri-kanan)
    for side, xa, xb, rp_out, rp_in in [('L', xl, xl + t, 'left', 'side_in_l'),
                                        ('R', xr - t, xr, 'right', 'side_in_r')]:
        e = box(xa, xb, yfi, yb - t, t, H - t, group='side', sub='Doors',
                vis='Show_Side_Doors')
        align(rp_out, e, 'x', xa if side == 'L' else xb)
        align(rp_in, e, 'x', xb if side == 'L' else xa)
        align('front_inner', e, 'y', yfi)
        align('top_inner', e, 'z', H - t)
        # handle / L tower bolt lock pada side door
        hx = (xa - 6.0, xa) if side == 'L' else (xb, xb + 6.0)
        box(hx[0], hx[1], yfi + 55.0, yfi + 115.0, H / 2.0 - 9.0, H / 2.0 + 9.0,
            group='side', sub='Accessories', mat='Material_Accessory',
            vis='Show_Side_Doors', detail='mf')

    # ---------------------------------------- 5. MOUNTING PROFILE (4 sudut)
    for (px0, px1) in [(xl + t, xl + t + pf), (xr - t - pf, xr - t)]:
        for (py0, py1) in [(yfi, yfi + pf), (yb - t - pf, yb - t)]:
            e = box(px0, px1, py0, py1, t, H - t, group='frame', sub='Frame')
            align('side_in_l' if px0 == xl + t else 'side_in_r', e, 'x',
                  px0 if px0 == xl + t else px1)
            align('top_inner', e, 'z', H - t)
            if abs(py0 - yfi) < 0.01:
                align('front_inner', e, 'y', yfi)

    # -------------------------------------- 6. MOUNTING ANGLE 19" (EIA-310)
    rail_sets = [(y_rf, 'Show_Rails', 'front'), (y_rr, '_Vis_Rear_Rails', 'rear')]
    for (yr, visp, tag) in rail_sets:
        if yr + rth + rlg > yb - t:
            continue
        for side in ('L', 'R'):
            s = -1.0 if side == 'L' else 1.0
            fx0 = s * rw / 2.0
            fx1 = s * (rw / 2.0 - rfl)
            e = box(min(fx0, fx1), max(fx0, fx1), yr, yr + rth, zr0, zr1,
                    group='rail', sub='Mounting Angle', mat='Material_Rail',
                    vis=visp)
            align('rail_l' if side == 'L' else 'rail_r', e, 'x', fx0)
            align('rail_bottom', e, 'z', zr0)
            align('rail_top', e, 'z', zr1)
            if tag == 'front':
                align('rail_front', e, 'y', yr)
            lx0 = s * (rw / 2.0 - rfl)
            lx1 = s * (rw / 2.0 - rfl + rth) if side == 'L' else s * (rw / 2.0 - rfl - rth)
            e = box(min(lx0, lx1), max(lx0, lx1), yr + rth, yr + rth + rlg, zr0, zr1,
                    group='rail', sub='Mounting Angle', mat='Material_Rail',
                    vis=visp, detail='mf')
            align('rail_bottom', e, 'z', zr0)
            align('rail_top', e, 'z', zr1)

    # --------------------------------------------------------------- 7. PDU
    pdh = DEF['PDU_Height']
    pdd = DEF['PDU_Depth']
    e = box(-rw / 2.0, rw / 2.0, y_rf - 2.0, y_rf, zr0, zr0 + pdh,
            group='pdu', sub='Accessories', mat='Material_Accessory',
            vis='Show_PDU', detail='mf')
    align('rail_front', e, 'y', y_rf)
    align('rail_bottom', e, 'z', zr0)
    box(-rw / 2.0 + 12.0, rw / 2.0 - 12.0, y_rf, y_rf + pdd, zr0 + 2.0, zr0 + pdh - 2.0,
        group='pdu', sub='Accessories', mat='Material_Accessory',
        vis='Show_PDU', detail='f')
    for i in range(6):
        cx = -175.0 + i * 70.0
        box(cx - 23.0, cx + 23.0, y_rf - 6.0, y_rf - 2.0,
            zr0 + pdh / 2.0 - 15.0, zr0 + pdh / 2.0 + 15.0,
            group='pdu', sub='Accessories', mat='Material_Accessory',
            vis='Show_PDU', detail='f')

    # --------------------------------------------------------------- 8. FAN
    fr = DEF['Fan_Diameter'] / 2.0
    fy = -DEF['Fan_Setback_From_Back']
    for i, visp in enumerate(('_Vis_Fan_1', '_Vis_Fan_2')):
        fx = (-1.0 if i == 0 else 1.0) * DEF['Fan_Spacing'] / 2.0
        e = cyl(fx, fy, fr, H, H + 6.0, group='fan', sub='Accessories',
                mat='Material_Accessory', vis=visp, detail='mf')
        align('top', e, 'z', H)
        cyl(fx, fy, 18.0, H + 6.0, H + 12.0, group='fan', sub='Accessories',
            mat='Material_Accessory', vis=visp, detail='f')
        cyl(fx, fy, fr - 2.0, H - t - 25.0, H - t, group='fan', sub='Accessories',
            mat='Material_Accessory', vis=visp, detail='f')

    # ------------------------------------------------- 9. TOP BRUSH PANEL
    for (by0, by1) in [(cs1, cs1 + 13.0), (cs0 - 13.0, cs0)]:
        e = box(-cw / 2.0, cw / 2.0, by0, by1, H - t, H + 3.0,
                group='brush', sub='Accessories', mat='Material_Accessory',
                vis='Show_Brush_Panel', detail='mf')

    # ------------------------------------------------- 10. WALL MOUNTING
    wx = W / 2.0 - DEF['Wall_Hole_Edge_Offset_X']
    wz = DEF['Wall_Hole_Edge_Offset_Z']
    for sx in (-wx, wx):
        for sz in (wz, H - wz):
            box(sx - 15.0, sx + 15.0, yb - t - 2.0, yb - t, sz - 15.0, sz + 15.0,
                group='wall', sub='Wall Mounting', mat='Material_Body',
                vis='Show_Wall_Holes', detail='mf')

    # ------------------------------------------- 11. PINTU KACA (2 posisi)
    xdl, xdr = xl + g, xr - g
    zdb, zdt = g, H - g
    hinge = (xdr, yf)     # engsel di sisi kanan

    def door_set(tf, visp, tag):
        def T(pts):
            return rot90(pts, hinge[0], hinge[1]) if tf else pts

        def rect(a0, a1, b0, b1):
            return T([(a0, b0), (a1, b0), (a1, b1), (a0, b1)])

        # rangka pintu
        e = prism(rect(xdl, xdr, yf, yf + dt), zdb, zdb + fw,
                  group='door' + tag, sub='Doors', vis=visp)
        e2 = prism(rect(xdl, xdr, yf, yf + dt), zdt - fw, zdt,
                   group='door' + tag, sub='Doors', vis=visp)
        e3 = prism(rect(xdl, xdl + fw, yf, yf + dt), zdb + fw, zdt - fw,
                   group='door' + tag, sub='Doors', vis=visp)
        e4 = prism(rect(xdr - fw, xdr, yf, yf + dt), zdb + fw, zdt - fw,
                   group='door' + tag, sub='Doors', vis=visp)
        # kaca
        prism(rect(xdl + fw - 6.0, xdr - fw + 6.0, yf + 3.0, yf + 3.0 + gt),
              zdb + fw - 6.0, zdt - fw + 6.0,
              group='door' + tag, sub='Glass', mat='Material_Glass', vis=visp)
        # handle + lock
        prism(rect(xdl + 10.0, xdl + 30.0, yf - 16.0, yf), H / 2.0 - 70.0, H / 2.0 + 70.0,
              group='door' + tag, sub='Accessories', mat='Material_Accessory',
              vis=visp, detail='mf')
        prism(rect(xdl + 12.0, xdl + 28.0, yf - 8.0, yf), H / 2.0 - 110.0, H / 2.0 - 86.0,
              group='door' + tag, sub='Accessories', mat='Material_Accessory',
              vis=visp, detail='f')
        return (e, e2, e3, e4)

    closed = door_set(False, '_Vis_Door_Closed', '_closed')
    for e in closed:
        align('front', e, 'y', yf)
        align('front_inner', e, 'y', yf + dt)
    align('door_l', closed[2], 'x', xdl)
    align('door_r', closed[3], 'x', xdr)
    align('door_top', closed[1], 'z', zdt)
    door_set(True, '_Vis_Door_Open', '_open')

    log('Solid dibuat      : {0}'.format(STATS['solid']))
    log('Alignment         : ok={0}, gagal={1}'.format(STATS['align_ok'], STATS['align_fail']))


# =============================================================================
#  9. FAMILY TYPES
# =============================================================================

def build_types(default_type):
    if not BUILD_TYPES:
        return
    made = 0
    for (name, depth, u, pid) in TYPES[1:]:
        st = SubTransaction(FDOC)
        st.Start()
        try:
            FM.CurrentType = default_type
            FM.NewType(name)
            set_param('Rack_Depth', 'length', depth)
            set_param('U_Count', 'int', u)
            set_param('Rack_Height_Manual', 'length',
                      u * DEF['U_Pitch'] + DEF['Frame_Height_Allowance'])
            set_param('Product_ID', 'text', pid if pid else
                      'WIR{0:02d}{1:02d}S (cek katalog)'.format(int(depth / 10), u))
            for bip in (BuiltInParameter.ALL_MODEL_TYPE_MARK, BuiltInParameter.ALL_MODEL_MODEL):
                try:
                    prm = FM.get_Parameter(bip)
                    if prm is not None:
                        FM.Set(prm, pid if pid else name)
                except Exception:
                    pass
            st.Commit()
            made += 1
        except Exception as ex:
            st.RollBack()
            log('! Type "{0}" gagal ({1})'.format(name, ex))
    try:
        FM.CurrentType = default_type
    except Exception:
        pass
    log('Family type dibuat: {0} (+1 default)'.format(made))


# =============================================================================
#  10. MAIN
# =============================================================================

def main():
    global FDOC, FM, SP_XY

    uiapp = get_uiapp()
    app = uiapp.Application
    template = find_template(app)
    log('=' * 70)
    log('INDORACK WALLMOUNT RACK 19" - REVIT FAMILY BUILDER')
    log('=' * 70)
    log('Template          : ' + template)

    FDOC = app.NewFamilyDocument(template)
    FM = FDOC.FamilyManager

    tr = Transaction(FDOC, 'Build Indorack Wallmount Rack')
    tr.Start()
    try:
        get_views()
        set_category()

        # type pertama harus ada dulu: FamilyManager.Set butuh current type
        default_type = FM.NewType(TYPES[0][0])
        build_parameters()
        set_default_values()
        set_identity_builtins()
        build_materials()
        build_subcategories()
        build_formulas()

        SP_XY = SketchPlane.Create(
            FDOC, Plane.CreateByNormalAndOrigin(XYZ.BasisZ, XYZ.Zero))

        find_origin_planes()
        build_reference_planes()
        build_dimensions()
        build_geometry()
        build_types(default_type)

        FDOC.Regenerate()
        tr.Commit()
    except Exception as ex:
        tr.RollBack()
        log('!! GAGAL: {0}'.format(ex))
        raise

    close_dynamo_transaction()
    path = output_path()
    opts = SaveAsOptions()
    opts.OverwriteExistingFile = True
    FDOC.SaveAs(path, opts)
    log('-' * 70)
    log('Family disimpan   : ' + path)

    loaded = False
    if LOAD_INTO_PROJECT:
        try:
            uidoc = uiapp.ActiveUIDocument
            pdoc = uidoc.Document if uidoc is not None else None
            if pdoc is not None and not pdoc.IsFamilyDocument:
                close_dynamo_transaction()
                t2 = Transaction(pdoc, 'Load Indorack Wallmount Rack')
                t2.Start()
                try:
                    FDOC.LoadFamily(pdoc)
                    t2.Commit()
                    loaded = True
                    log('Family di-load ke : ' + pdoc.Title)
                except Exception:
                    t2.RollBack()
                    raise
        except Exception as ex:
            log('! Load ke project gagal ({0}) - load manual lewat Insert > Load Family.'
                .format(ex))

    if OPEN_FAMILY_AFTER_BUILD and not running_in_dynamo():
        try:
            FDOC.Close(False)
            uiapp.OpenAndActivateDocument(path)
            log('Family dibuka     : ' + os.path.basename(path))
        except Exception as ex:
            log('! Tidak bisa membuka otomatis ({0}) - buka manual file di atas.'.format(ex))

    log('-' * 70)
    log('RINGKASAN')
    log('  Parameter       : {0}'.format(STATS['param']))
    log('  Solid           : {0}'.format(STATS['solid']))
    log('  Reference plane : {0}'.format(STATS['refplane']))
    log('  Dimensi label   : {0} ok / {1} gagal'.format(STATS['dim_ok'], STATS['dim_fail']))
    log('  Alignment       : {0} ok / {1} gagal'.format(STATS['align_ok'], STATS['align_fail']))
    log('  Family type     : {0}'.format(len(TYPES) if BUILD_TYPES else 1))
    log('  Load ke project : {0}'.format('ya' if loaded else 'tidak'))
    log('')
    log('LANGKAH BERIKUTNYA:')
    log('  1. Buka file .rfa di atas, jalankan Create > Family Types > flex')
    log('     (ubah Rack_Depth / U_Count / Rack_Width, klik Apply).')
    log('  2. Kalau ada bagian yang tidak ikut berubah, cek daftar "Align gagal"')
    log('     di log ini lalu kunci manual pakai Modify > Align + gembok.')
    log('=' * 70)
    return FDOC


FAMILY_DOC = main()
