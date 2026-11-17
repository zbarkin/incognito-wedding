"""
Stitched jacket: a tailor's dress form and a dinner jacket cut from real pattern
pieces (forepart, side body, back, top and under sleeve, notch lapel, collar),
sewn together with Blender's cloth simulation so the fabric drapes like wool.

Run headless from the project folder:
    blender -b --factory-startup -P blender/stitched_jacket.py -- --stage model
Stages:
    model   build the form, stand and pattern pieces, drape the jacket, save build/jacket.blend
    still   render a still of the finished jacket to build/still.png (needs model)
Or run it inside an open Blender (Text editor > Run Script) to build the scene there.

Coordinates: Blender metres, Z up, the form faces -Y (towards the front camera).
The shape helpers below work in (x, up, forward) and convert with V().
"""
import bpy, bmesh, math, os, sys
import numpy as np
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree

HERE = os.path.dirname(os.path.abspath(__file__))
BUILD = os.path.join(HERE, "build")
os.makedirs(BUILD, exist_ok=True)

def V(x, up, fwd):
    return Vector((x, -fwd, up))

def clamp01(x): return min(1.0, max(0.0, x))
def lerp(a, b, t): return a + (b - a) * t
def smooth(a, b, x):
    t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t)

# ------------------------------------------------------------------ profiles
class Profile:
    """Rows of (height, half-width, half-depth), smoothed; cross-sections are superellipses."""
    def __init__(self, rows, n):
        self.n = n
        P = [np.array(r, float) for r in rows]
        dense = []
        for i in range(len(P) - 1):
            p0 = P[i - 1] if i > 0 else P[i]; p1 = P[i]; p2 = P[i + 1]
            p3 = P[i + 2] if i + 2 < len(P) else P[i + 1]
            for k in range(30):
                t = k / 30
                dense.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t
                                    + (-p0 + 3 * p1 - 3 * p2 + p3) * t ** 3))
        dense.append(P[-1])
        d = np.array(dense)
        self.y = np.maximum.accumulate(d[:, 0]); self.w = d[:, 1]; self.d = d[:, 2]

    def wd(self, y):
        return float(np.interp(y, self.y, self.w)), float(np.interp(y, self.y, self.d))

    def point(self, a, y, off=0.0):
        """Angle a from centre front (0) round the left side (pi/2) to the back (pi)."""
        w, d = self.wd(y); n = self.n
        s, c = math.sin(a), math.cos(a)
        r = 1.0 / ((abs(s) / (w + off)) ** n + (abs(c) / (d + off)) ** n) ** (1.0 / n)
        return (r * s, y, r * c)

FORM = Profile([
    (0.88, .172, .122), (0.95, .176, .126), (1.00, .180, .130), (1.04, .181, .131), (1.10, .171, .124),
    (1.16, .160, .116), (1.24, .167, .123), (1.33, .173, .129), (1.40, .174, .130), (1.46, .184, .122),
    # a jacket form: broad square shoulders that carry the jacket, sitting about 1.5 cm inside it
    (1.50, .199, .109), (1.525, .205, .101), (1.552, .199, .087), (1.570, .162, .075), (1.587, .111, .063),
    (1.600, .071, .054), (1.612, .058, .052), (1.65, .054, .051), (1.665, .052, .050),
], 2.7)
FORM_BOTTOM, FORM_TOP = 0.88, 1.665

# The jacket: square padded shoulders, a defined chest, light waist suppression, straight over the hips.
JACKET = Profile([
    (0.84, .190, .141), (0.95, .190, .140), (1.04, .191, .141), (1.10, .185, .135), (1.17, .178, .129),
    (1.26, .185, .137), (1.34, .190, .142), (1.42, .192, .142), (1.48, .203, .133), (1.525, .222, .118),
    (1.552, .220, .103), (1.570, .180, .090), (1.587, .120, .075), (1.600, .084, .066), (1.615, .069, .061),
], 3.4)

HEM = 0.86
BREAK = 1.12                     # top (and only) button: where the lapel starts to roll
ARM_C, ARM_DZ, ARM_DA = 1.45, 0.105, 0.28   # armhole on the body: centre height, half-height, half-angle
# The lapel and collar are cut by measurements across the front (x, metres from centre front),
# like a tailor's pattern, and converted to the jacket surface by alpha_x().
def alpha_x(z, x):
    """The angle round the jacket at height z whose point lies x across from centre front."""
    lo, hi = 0.0, math.pi / 2
    for _ in range(40):
        mid = (lo + hi) / 2
        if JACKET.point(mid, z)[0] < abs(x): lo = mid
        else: hi = mid
    return math.copysign((lo + hi) / 2, x)
ROOT_X, ROOT_Z = 0.070, 1.595    # the neck point: the roll line ends at the side of the neck
NOTCH_X, NOTCH_Z = 0.128, 1.524  # the notch, at collarbone height
POINT_X, POINT_Z = 0.150, 1.515  # the lapel's top edge meets its outer edge square
def roll_x(z):                   # the roll line runs from the button to the neck point
    return lerp(-0.012, ROOT_X, clamp01((z - BREAK) / (ROOT_Z - BREAK)) ** 1.08)
def roll(z):
    return alpha_x(z, roll_x(min(z, ROOT_Z)))
ROOT_A = roll(ROOT_Z)
def neck_z(a):                   # the neckline where the collar is sewn, by angle
    return lerp(ROOT_Z, 1.622, smooth(ROOT_A, math.pi, a) ** 0.8)
def hem_at(a):                   # rounded front corners
    return HEM + 0.045 * (1 - smooth(-0.12, 0.45, a))
def armhole(psi, off=0.0):       # psi: 0 front, pi/2 top (shoulder point), pi back, 3pi/2 underarm
    a = math.pi / 2 - ARM_DA * math.cos(psi)
    z = ARM_C + ARM_DZ * math.sin(psi)
    return JACKET.point(a, z, off)
def fore_right(z):               # forepart's edge: side seam, then front of the armhole, then shoulder seam
    if z <= ARM_C: return math.pi / 2 - ARM_DA
    if z >= ARM_C + ARM_DZ: return math.pi / 2
    return math.pi / 2 - ARM_DA * math.sqrt(max(0.0, 1 - ((z - ARM_C) / ARM_DZ) ** 2))
def back_left(z):
    return math.pi - fore_right(z)

# Notch lapel: the outer edge runs nearly straight from the button up to the lapel point; the
# gorge runs from the neck point down to the notch, and the lapel point turns slightly up.
GORGE_Z = 1.545                  # the gorge meets the roll line just above the notch
GORGE_X = roll_x(GORGE_Z)        # (above it the roll line carries on up the collar to the neck)
NOTCH_U = (NOTCH_X - GORGE_X) / (POINT_X - GORGE_X)
def lapel_out_x(z):
    t = clamp01((z - BREAK) / (POINT_Z - BREAK))
    return lerp(roll_x(BREAK) + 0.006, POINT_X, t)       # a straight edge from the button to the point
def lapel_top(u):
    if u <= NOTCH_U: return lerp(GORGE_Z, NOTCH_Z, u / NOTCH_U)
    return lerp(NOTCH_Z, POINT_Z, (u - NOTCH_U) / (1 - NOTCH_U))

# sleeves: the head is sewn into the armhole; below it the sleeve hangs and tapers to the cuff
SLEEVE_TOP_Z, CUFF_Z = 1.30, 0.95
def sleeve_axis(t):              # t 0 at the bottom of the head, 1 at the cuff
    return (lerp(0.238, 0.240, t), lerp(SLEEVE_TOP_Z, CUFF_Z, t), lerp(0.008, 0.046, t * t))
def sleeve_ring(t, phi, off=0.0, k=1.0):  # phi: 0 front, pi/2 outside, pi back, 3pi/2 inside
    cx, cy, cz = sleeve_axis(t)
    rz, rx = lerp(0.060, 0.048, t) * k + off, lerp(0.036, 0.031, t) * k + off
    q = lambda v: math.copysign(abs(v) ** 0.85, v)
    return (cx + rx * q(math.sin(phi)), cy, cz + rz * q(math.cos(phi)))
HEAD = 0.30                      # share of the sleeve's length given to the head
def sleeve_point(phi, v, off=0.0):
    if v >= HEAD:
        return sleeve_ring((v - HEAD) / (1 - HEAD), phi, off)
    s = v / HEAD
    A = np.array(armhole(phi, off)); R = np.array(sleeve_ring(0.0, phi, off))
    ax = np.array(sleeve_axis(0.0))
    mid = A + (R - A) * 0.62
    out = mid - np.array([ax[0], mid[1], ax[2]]); out[1] = 0
    nrm = np.linalg.norm(out) or 1
    bulge = 0.014 * max(0.0, math.sin(phi))               # roped sleeve head over the shoulder
    P1 = mid + out / nrm * bulge + np.array([0, 0.012 * max(0.0, math.sin(phi)), 0])
    P1[0] += 0.006 * max(0.0, -math.sin(phi))             # underarm: keep clear of the side body
    B = (1 - s) ** 2 * A + 2 * s * (1 - s) * P1 + s * s * R
    return tuple(B)
SLEEVE_IN, SLEEVE_BACK = -0.22 * math.pi, 0.78 * math.pi   # inseam (front-inside), back seam (outside-back)

# collar: one piece round the back of the neck, from gorge to gorge

def down_surface(a, z, length):
    """Walk down the jacket's surface from height z at angle a; the height after length metres."""
    p = np.array(JACKET.point(a, z)); done = 0.0
    while done < length and z > 1.3:
        z -= 0.001
        q = np.array(JACKET.point(a, z)); done += float(np.linalg.norm(q - p)); p = q
    return z

LAP = {1: 0.005, -1: -0.003}     # each front's lift where they overlap: the left (+x) laps over the right
FOLD = 0.0042                    # the lapel lies this far off the front once it has rolled over
def lapel_base(side, a):
    return LAP[side] * (1 - smooth(0.15, 0.55, a))
EDGE_A0 = 1.15                   # where the outer edge leaves the front and turns over the shoulder
def fall_z(a, width):            # the fall's outer edge at angle a: width metres down from the neckline
    return down_surface(a, neck_z(a), width)
_EDGE = {}
def collar_edge_point(t, side):
    """The collar's outer edge up the front: a straight line on the jacket from the notch to the
    point where the fall reaches the side of the neck."""
    if side not in _EDGE:
        an = alpha_x(NOTCH_Z, NOTCH_X)
        z1 = fall_z(EDGE_A0, COLLAR_W); x1 = JACKET.point(EDGE_A0, z1)[0]
        _EDGE[side] = (lapel_base(side, an) + FOLD, z1, x1)
    off0, z1, x1 = _EDGE[side]
    z = lerp(NOTCH_Z, z1, t); x = lerp(NOTCH_X, x1, t)
    return JACKET.point(alpha_x(z, x), z, lerp(off0, 0.006, smooth(0.0, 1.0, t)))

COLLAR_FRONT = 0.22              # share of each half of the collar that runs up the front
COLLAR_W = 0.036                 # width of the fall round the neck
def collar_wrap(na, nz, h, width):
    """A collar section wrapped round the neck: stand from the seam up the neck by h, then the
    fall folding back down onto the jacket, width metres down its surface. Returns (N, T, F)."""
    N = np.array(JACKET.point(na, nz, 0.002))
    T = np.array(FORM.point(na, nz + h, 0.012)) if h > 0.002 else N
    F = np.array(JACKET.point(na, down_surface(na, nz, width), 0.006))
    return N, T, F
def fold_profile(N, T, F, w, stand=0.3):
    if w <= stand:
        return N + (T - N) * (w / stand)
    t = (w - stand) / (1 - stand)
    radial = np.array([T[0], 0.0, T[2]]); radial /= (np.linalg.norm(radial) or 1)
    C = T + radial * 0.004 + np.array([0, 0.002, 0])       # the roll of the fold
    return (1 - t) ** 2 * T + 2 * t * (1 - t) * C + t * t * F

def collar_point(s, w):
    """One piece from the left notch, up the roll line, round the back of the neck and down to the
    right notch. s 0..1 along it; w 0 the inner (roll / neck) edge, 1 the outer edge.
    One continuous shape: at the notch it lies flat beside the lapel; climbing the roll line its
    stand rises, so by the side of the neck it wraps the neck, and round the back it stands
    about 2.4 cm with the fall an even width all the way."""
    beta = lerp(0.0, 2 * math.pi, s)
    side = 1 if beta <= math.pi else -1
    b = beta if side > 0 else 2 * math.pi - beta          # 0 at the front ends, pi at centre back
    f = b / math.pi
    if f <= COLLAR_FRONT:                                  # up the roll line from the gorge
        t = f / COLLAR_FRONT
        nz = lerp(GORGE_Z, ROOT_Z, t); na = alpha_x(nz, roll_x(nz))
        h = 0.010 * smooth(0.0, 1.0, t)
    else:                                                  # round the neck to the back
        g = (f - COLLAR_FRONT) / (1 - COLLAR_FRONT)
        na = lerp(ROOT_A, math.pi, g); nz = neck_z(na); t = 1.0
        h = 0.010 + 0.004 * smooth(0.1, 1.0, g)          # the shirt collar shows about 1 cm above it
    width = COLLAR_W + (0.002 * smooth(0.6, 1.0, g) if f > COLLAR_FRONT else 0.0)
    # at the gorge the collar meets the lapel edge to edge, so it starts at the lapel's own
    # height off the front (the left front laps over the right) and eases to its own
    base = lapel_base(side, na)
    k = smooth(0.3, 1.0, t)
    N = np.array(JACKET.point(na, nz, lerp(base, 0.002, k)))
    q = smooth(0.0, 0.010, h)                              # how far the stand has risen against the neck
    T = np.array(JACKET.point(na, nz + h, lerp(base, 0.004, k))) * (1 - q) + np.array(FORM.point(na, nz + h, 0.012)) * q
    if f <= COLLAR_FRONT:
        # the outer edge runs in a straight line from the notch to the side of the neck
        F = np.array(collar_edge_point(t, side))
    else:
        # the outer edge runs on round the shoulder a little ahead of the neckline, so it lies
        # over the shoulder rather than dropping down the chest
        ea = lerp(EDGE_A0, math.pi, smooth(0.0, 1.0, g) * 0.35 + g * 0.65)
        F = np.array(JACKET.point(ea, fall_z(ea, width), 0.006))
    stand = 0.3 * q
    if stand > 1e-4 and w <= stand:
        P = N + (T - N) * (w / stand)
    else:
        u = (w - stand) / (1 - stand)
        radial = np.array([T[0], 0.0, T[2]]); radial /= (np.linalg.norm(radial) or 1)
        C = T + radial * 0.004 * q + np.array([0, 0.002 * q, 0]) + (F - T) * 0.5 * (1 - q)
        P = (1 - u) ** 2 * T + 2 * u * (1 - u) * C + u * u * F
    return (P[0] * side, P[1], P[2])

# ------------------------------------------------------------------ pattern pieces
class Piece:
    def __init__(self, name, nu, nv, fn, mirror=False, material="wool", canvas=lambda u, v: 0.2, axis=None,
                 seam_sides=("u0", "u1", "v0", "v1")):
        self.name, self.nu, self.nv, self.mirror, self.material = name, nu, nv, mirror, material
        pts, w = [], []
        for j in range(nv + 1):
            for i in range(nu + 1):
                x, y, f = fn(i / nu, j / nv)
                if mirror: x = -x
                pts.append(V(x, y, f)); w.append(canvas(i / nu, j / nv))
        self.verts, self.canvas = pts, w
        faces = []
        for j in range(nv):
            for i in range(nu):
                a = j * (nu + 1) + i; b = a + 1; c = a + nu + 1; d = c + 1
                faces.append((a, b, d, c) if not mirror else (a, c, d, b))
        # face the cloth outwards (away from the body, or from the sleeve's centre line)
        ref = axis or (lambda p: Vector((0, 0, p.z)))
        score = 0.0
        for f in faces[:: max(1, len(faces) // 200)]:
            a, b, c = pts[f[0]], pts[f[1]], pts[f[2]]
            n = (b - a).cross(c - a); ctr = (a + b + c) / 3
            score += n.dot(ctr - ref(ctr) * Vector((1, 1, 1)))
        if score < 0: faces = [tuple(reversed(f)) for f in faces]
        self.faces = faces
        bnd = set()   # edge points that may be sewn (only the sides that are real seams)
        if "v0" in seam_sides: bnd.update(range(nu + 1))
        if "v1" in seam_sides: bnd.update(nv * (nu + 1) + i for i in range(nu + 1))
        if "u0" in seam_sides: bnd.update(j * (nu + 1) for j in range(nv + 1))
        if "u1" in seam_sides: bnd.update(j * (nu + 1) + nu for j in range(nv + 1))
        self.boundary = sorted(bnd)

def iterate(fn_a, fn_z, u, v, z0):
    z = z0
    for _ in range(4):
        a = fn_a(u, z); z = fn_z(a, v)
    return a, z

def forepart_fn(lap):
    # lap: the left front buttons over the right, so it sits a little proud of it near centre front
    def forepart(u, v):
        a, z = iterate(lambda u, z: lerp(roll(min(z, ROOT_Z)), fore_right(z), u),
                       lambda a, v: lerp(hem_at(a), neck_z(a) if a > ROOT_A else ROOT_Z, v), u, v, lerp(HEM, 1.5, v))
        return JACKET.point(a, z, lap * (1 - smooth(0.15, 0.55, a)))
    return forepart
def side_body(u, v):
    a = lerp(math.pi / 2 - ARM_DA, math.pi / 2 + ARM_DA, u)
    top = ARM_C - ARM_DZ * math.sqrt(max(0.0, 1 - ((a - math.pi / 2) / ARM_DA) ** 2))
    return JACKET.point(a, lerp(HEM, top, v))
def back(u, v):
    a, z = iterate(lambda u, z: lerp(back_left(z), math.pi, u),
                   lambda a, v: lerp(HEM, neck_z(a), v), u, v, lerp(HEM, 1.6, v))
    return JACKET.point(a, z)
def top_sleeve(u, v):
    return sleeve_point(lerp(SLEEVE_IN, SLEEVE_BACK, u), v)
def under_sleeve(u, v):
    return sleeve_point(lerp(SLEEVE_BACK, SLEEVE_IN + 2 * math.pi, u), v)
FORE_NV = 72
_ROWS = []
def lapel_rows():
    """Heights for the lapel's rows: where the front's own rows meet the roll line, so the two
    edges sew point to point and the roll line runs clean (no zigzag)."""
    if not _ROWS:
        f = forepart_fn(0.0)
        zs = [f(0.0, j / FORE_NV)[1] for j in range(FORE_NV + 1)]
        mid = [z for z in zs if BREAK + 0.004 < z < GORGE_Z - 0.004]
        _ROWS.extend([BREAK] + mid + [GORGE_Z])
    return _ROWS
def lapel_fn(lap):
    # The lapel is the front folded back along the roll line: it starts at the front's edge
    # (welded there), rolls over through a soft fold about 5 mm across, then lies one cloth
    # thickness above the front. lap is the front's own lift where the fronts overlap.
    rows = lapel_rows()
    def lapel(u, v):
        k = v * (len(rows) - 1); i = min(int(k), len(rows) - 2)
        zr = lerp(rows[i], rows[i + 1], k - i)               # on the roll line, the front's own rows
        z = lerp(BREAK, lapel_top(u), (zr - BREAK) / (GORGE_Z - BREAK))
        x = lerp(roll_x(z), lapel_out_x(z), u)
        # straighten the top edge (the gorge seam and the notch) into clean lines
        zt = lapel_top(u)
        x_top = lerp(GORGE_X, NOTCH_X, u / NOTCH_U) if u <= NOTCH_U else lerp(NOTCH_X, POINT_X, (u - NOTCH_U) / (1 - NOTCH_U))
        x += (x_top - lerp(roll_x(zt), lapel_out_x(zt), u)) * v ** 3
        a = alpha_x(z, x)
        base = lap * (1 - smooth(0.15, 0.55, a))
        # the roll is a soft fold about 6 mm across; towards the button it flattens out, so the
        # facing runs smoothly into the front edge instead of twisting into creases
        across = u * abs(lapel_out_x(z) - roll_x(z))
        near = smooth(BREAK, BREAK + 0.14, z)              # 0 at the button, 1 higher up
        fold = FOLD * math.sin(min(1.0, across / lerp(0.0015, 0.006, near)) * math.pi / 2) * lerp(0.6, 1.0, near)
        return JACKET.point(a, z, base + fold)
    return lapel
def collar(u, v):
    return collar_point(u, v)

def build_pieces():
    P = []
    for m, side in ((False, "L"), (True, "R")):
        P.append(Piece("Forepart_" + side, 26, FORE_NV, forepart_fn(LAP[-1 if m else 1]), m,
                       canvas=lambda u, v: 1.0 if v > 0.45 else 0.35))
        P.append(Piece("SideBody_" + side, 10, 50, side_body, m))
        P.append(Piece("Back_" + side, 20, 74, back, m, canvas=lambda u, v: 0.6 if v > 0.8 else 0.25))
        sx = -1 if m else 1
        ax = lambda p, sx=sx: Vector((sx * 0.218, -0.02, p.z)) if p.z < 1.33 else Vector((sx * 0.12, 0, p.z))
        P.append(Piece("TopSleeve_" + side, 22, 62, top_sleeve, m, canvas=lambda u, v: 1.0 if v < HEAD else 0.25, axis=ax))
        P.append(Piece("UnderSleeve_" + side, 14, 62, under_sleeve, m, canvas=lambda u, v: 0.6 if v < HEAD else 0.2, axis=ax))
        P.append(Piece("Lapel_" + side, 14, len(lapel_rows()) - 1, lapel_fn(LAP[-1 if m else 1]), m, material="satin", canvas=lambda u, v: 1.0,
                       seam_sides=("u0", "v1")))   # roll line and gorge
    P.append(Piece("Collar", 88, 12, collar, False, material="wool", canvas=lambda u, v: 1.0,
                   seam_sides=("v0", "u0", "u1")))  # neckline and the two gorge ends
    return P

# which pieces are sewn to which (seams); everything else may touch but is not joined
def sewn(a, b):
    sa, sb = a.split("_")[-1], b.split("_")[-1]
    ka, kb = a.split("_")[0], b.split("_")[0]
    pair = {ka, kb}
    if pair == {"Back"} and a != b: return True                  # centre back
    if "Collar" in pair: return bool(pair & {"Lapel", "Forepart", "Back"})
    if sa != sb: return False
    body = {"Forepart", "SideBody", "Back"}
    return (pair <= body and len(pair) == 2) or (pair & body and pair & {"TopSleeve", "UnderSleeve"}) \
        or pair == {"TopSleeve", "UnderSleeve"} or pair == {"Lapel", "Forepart"}

# ------------------------------------------------------------------ scene helpers
def new_scene():
    sc = bpy.data.scenes.get("Stitched Jacket")
    if sc:
        for o in list(sc.collection.all_objects): bpy.data.objects.remove(o, do_unlink=True)
    else:
        sc = bpy.data.scenes.new("Stitched Jacket")
    bpy.context.window.scene = sc if bpy.context.window else None
    if not bpy.context.window:
        bpy.context.screen  # noqa
    return sc

def link(sc, ob, coll=None):
    (coll or sc.collection).objects.link(ob); return ob

def mesh_object(name, verts, faces, edges=(), recalc=False):
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(v) for v in verts], list(edges), list(faces))
    if recalc:   # closed solids: make every face point outwards
        bm = bmesh.new(); bm.from_mesh(me)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces); bm.to_mesh(me); bm.free()
    me.update()
    ob = bpy.data.objects.new(name, me)
    for p in me.polygons: p.use_smooth = True
    return ob

def surface_of_revolution(name, prof_fn, z0, z1, nz=80, na=96, cap_bottom=True):
    verts, faces = [], []
    for j in range(nz + 1):
        z = lerp(z0, z1, j / nz)
        for i in range(na):
            a = -math.pi + 2 * math.pi * i / na
            verts.append(V(*prof_fn(a, z)))
    for j in range(nz):
        for i in range(na):
            a = j * na + i; b = j * na + (i + 1) % na
            faces.append((a, b, b + na, a + na))
    if cap_bottom: faces.append(tuple(reversed(range(na))))
    faces.append(tuple(range(nz * na, nz * na + na)))
    return mesh_object(name, verts, faces, recalc=True)

def lathe(name, rz_points, segs=64):
    """Turned wood or metal from (radius, z) points."""
    verts, faces = [], []
    for r, z in rz_points:
        for i in range(segs):
            a = 2 * math.pi * i / segs
            verts.append((r * math.cos(a), r * math.sin(a), z))
    n = len(rz_points)
    for j in range(n - 1):
        for i in range(segs):
            a = j * segs + i; b = j * segs + (i + 1) % segs
            faces.append((a, b, b + segs, a + segs))
    return mesh_object(name, verts, faces)

# ------------------------------------------------------------------ materials
def mat(name, build):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree; nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    nt.links.new(bsdf.outputs[0], out.inputs[0])
    build(nt, bsdf)
    return m

def weave(nt, bsdf, scale, strength, twill=True):
    tc = nt.nodes.new("ShaderNodeTexCoord")
    mp = nt.nodes.new("ShaderNodeMapping"); mp.inputs["Scale"].default_value = (scale, scale, scale)
    nt.links.new(tc.outputs["Object"], mp.inputs[0])
    w1 = nt.nodes.new("ShaderNodeTexWave"); w1.wave_type = "BANDS"; w1.bands_direction = "DIAGONAL" if twill else "X"
    w1.inputs["Distortion"].default_value = 1.5; w1.inputs["Detail"].default_value = 2
    w2 = nt.nodes.new("ShaderNodeTexNoise"); w2.inputs["Scale"].default_value = scale * 0.6; w2.inputs["Detail"].default_value = 8
    nt.links.new(mp.outputs[0], w1.inputs["Vector"]); nt.links.new(mp.outputs[0], w2.inputs["Vector"])
    mix = nt.nodes.new("ShaderNodeMix"); mix.data_type = "FLOAT"; mix.inputs["Factor"].default_value = 0.35
    nt.links.new(w1.outputs["Fac"], mix.inputs[2]); nt.links.new(w2.outputs["Fac"], mix.inputs[3])
    bump = nt.nodes.new("ShaderNodeBump"); bump.inputs["Strength"].default_value = strength
    bump.inputs["Distance"].default_value = 0.0004
    nt.links.new(mix.outputs[0], bump.inputs["Height"]); nt.links.new(bump.outputs[0], bsdf.inputs["Normal"])

def materials():
    M = {}
    def wool(nt, b):
        b.inputs["Base Color"].default_value = (0.010, 0.010, 0.012, 1)
        b.inputs["Roughness"].default_value = 0.9
        b.inputs["Specular IOR Level"].default_value = 0.25
        b.inputs["Sheen Weight"].default_value = 0.9
        b.inputs["Sheen Roughness"].default_value = 0.4
        b.inputs["Sheen Tint"].default_value = (0.35, 0.36, 0.40, 1)
        weave(nt, b, 900, 0.25)
    M["wool"] = mat("Wool barathea", wool)
    def satin(nt, b):
        b.inputs["Base Color"].default_value = (0.016, 0.016, 0.018, 1)
        b.inputs["Roughness"].default_value = 0.38
        b.inputs["Anisotropic"].default_value = 0.85
        b.inputs["Specular IOR Level"].default_value = 0.42
        b.inputs["Sheen Weight"].default_value = 0.35
        weave(nt, b, 2400, 0.05, twill=False)
    M["satin"] = mat("Silk satin facing", satin)
    def satin_lapel(nt, b):
        # the facing's sheen runs along its length (the grain), not round the piece's centre
        satin(nt, b); b.inputs["Anisotropic"].default_value = 0.6
        tg = nt.nodes.new("ShaderNodeTangent"); tg.direction_type = "UV_MAP"; tg.uv_map = "grain"
        nt.links.new(tg.outputs["Tangent"], b.inputs["Tangent"])
    M["satin_lapel"] = mat("Silk satin lapel", satin_lapel)
    def linen(nt, b):
        b.inputs["Base Color"].default_value = (0.32, 0.30, 0.27, 1)
        b.inputs["Roughness"].default_value = 0.92
        b.inputs["Sheen Weight"].default_value = 0.3
        weave(nt, b, 260, 0.35, twill=False)
    M["linen"] = mat("Linen form cover", linen)
    def walnut(nt, b):
        b.inputs["Base Color"].default_value = (0.11, 0.055, 0.03, 1)
        b.inputs["Roughness"].default_value = 0.32
        b.inputs["Coat Weight"].default_value = 0.4
        tc = nt.nodes.new("ShaderNodeTexCoord"); wv = nt.nodes.new("ShaderNodeTexWave")
        wv.wave_type = "RINGS"; wv.inputs["Scale"].default_value = 18; wv.inputs["Distortion"].default_value = 6
        nt.links.new(tc.outputs["Object"], wv.inputs["Vector"])
        ramp = nt.nodes.new("ShaderNodeValToRGB")
        ramp.color_ramp.elements[0].color = (0.07, 0.035, 0.02, 1); ramp.color_ramp.elements[1].color = (0.16, 0.085, 0.045, 1)
        nt.links.new(wv.outputs["Fac"], ramp.inputs[0]); nt.links.new(ramp.outputs[0], b.inputs["Base Color"])
    M["walnut"] = mat("Walnut", walnut)
    def brass(nt, b):
        b.inputs["Base Color"].default_value = (0.62, 0.45, 0.22, 1)
        b.inputs["Metallic"].default_value = 1.0
        b.inputs["Roughness"].default_value = 0.28
    M["brass"] = mat("Brass", brass)
    def shirt(nt, b):
        b.inputs["Base Color"].default_value = (0.72, 0.70, 0.66, 1)
        b.inputs["Roughness"].default_value = 0.55
        b.inputs["Sheen Weight"].default_value = 0.3
        weave(nt, b, 1400, 0.1, twill=False)
    M["shirt"] = mat("Shirt cotton", shirt)
    def onyx(nt, b):
        b.inputs["Base Color"].default_value = (0.005, 0.005, 0.006, 1); b.inputs["Roughness"].default_value = 0.08
        b.inputs["Coat Weight"].default_value = 1.0
    M["onyx"] = mat("Onyx", onyx)
    def tape(nt, b):
        b.inputs["Base Color"].default_value = (0.02, 0.02, 0.02, 1); b.inputs["Roughness"].default_value = 0.7
    M["tape"] = mat("Twill tape", tape)
    return M

# ------------------------------------------------------------------ build
def build_form(sc, M, coll):
    form = link(sc, surface_of_revolution("DressForm", lambda a, z: FORM.point(a, z), FORM_BOTTOM, FORM_TOP), coll)
    form.data.materials.append(M["linen"])
    s = form.modifiers.new("Subdivision", "SUBSURF"); s.levels = 1; s.render_levels = 2
    # twill tape: centre front, centre back, sides and waist
    for a in (0, math.pi, math.pi / 2, -math.pi / 2):
        pts = [V(*FORM.point(a, lerp(FORM_BOTTOM + 0.005, 1.585, k / 80), 0.0012)) for k in range(81)]
        link(sc, tube("Tape", pts, 0.0022, M["tape"]), coll)
    pts = [V(*FORM.point(2 * math.pi * k / 120, 1.16, 0.0012)) for k in range(121)]
    link(sc, tube("Tape", pts, 0.0022, M["tape"]), coll)
    # walnut neck cap and finial, base cap, turned pole, brass collar, tripod
    cap = lathe("NeckCap", [(0.0, FORM_TOP), (0.058, FORM_TOP), (0.061, FORM_TOP + 0.004), (0.06, FORM_TOP + 0.014),
                            (0.05, FORM_TOP + 0.02), (0.012, FORM_TOP + 0.024), (0.010, FORM_TOP + 0.04),
                            (0.02, FORM_TOP + 0.055), (0.022, FORM_TOP + 0.07), (0.016, FORM_TOP + 0.085),
                            (0.0, FORM_TOP + 0.092)])
    link(sc, cap, coll).data.materials.append(M["walnut"])
    w, d = FORM.wd(FORM_BOTTOM)
    base = lathe("FormBase", [(0.0, FORM_BOTTOM - 0.012), (min(w, d) * 0.95, FORM_BOTTOM - 0.012), (min(w, d), FORM_BOTTOM)])
    base.scale = (w / min(w, d), d / min(w, d), 1)
    link(sc, base, coll).data.materials.append(M["walnut"])
    pole = lathe("Pole", [(0.0, 0.32), (0.016, 0.32), (0.016, FORM_BOTTOM - 0.01), (0.0, FORM_BOTTOM - 0.01)], 40)
    link(sc, pole, coll).data.materials.append(M["walnut"])
    sleeve = lathe("PoleCollar", [(0.0, 0.58), (0.024, 0.58), (0.026, 0.59), (0.026, 0.63), (0.024, 0.64), (0.0, 0.64)], 48)
    link(sc, sleeve, coll).data.materials.append(M["brass"])
    hub = lathe("Hub", [(0.0, 0.26), (0.04, 0.26), (0.045, 0.28), (0.034, 0.34), (0.0, 0.34)], 48)
    link(sc, hub, coll).data.materials.append(M["walnut"])
    for i in range(3):
        a = i * 2 * math.pi / 3 + math.pi / 2
        foot = Vector((math.cos(a) * 0.34, math.sin(a) * 0.34, 0.03))
        top = Vector((math.cos(a) * 0.03, math.sin(a) * 0.03, 0.29))
        pts = [top.lerp(foot, k / 20) + Vector((0, 0, 0.03 * math.sin(math.pi * k / 20))) for k in range(21)]
        link(sc, tube("Leg", pts, 0.013, M["walnut"], taper=0.7), coll)
        f = lathe("Foot", [(0.0, 0.0), (0.018, 0.0), (0.02, 0.012), (0.016, 0.04), (0.0, 0.045)], 32)
        f.location = foot - Vector((0, 0, 0.03)); link(sc, f, coll).data.materials.append(M["brass"])
    return form

def tube(name, pts, r, material, taper=1.0, segs=10):
    verts, faces = [], []
    n = len(pts)
    for k, p in enumerate(pts):
        t = (pts[min(k + 1, n - 1)] - pts[max(k - 1, 0)]).normalized()
        a = t.orthogonal().normalized(); b = t.cross(a)
        rr = r * lerp(1, taper, k / (n - 1))
        for i in range(segs):
            th = 2 * math.pi * i / segs
            verts.append(p + (a * math.cos(th) + b * math.sin(th)) * rr)
    for k in range(n - 1):
        for i in range(segs):
            a = k * segs + i; b = k * segs + (i + 1) % segs
            faces.append((a, b, b + segs, a + segs))
    faces.append(tuple(reversed(range(segs)))); faces.append(tuple(range((n - 1) * segs, n * segs)))
    ob = mesh_object(name, verts, faces, recalc=True); ob.data.materials.append(material)
    return ob

def build_shirt(sc, M, coll):
    # the shirt wraps the whole upper body, so no form shows round the neck
    shirt = Piece("ShirtFront", 72, 40, lambda u, v: FORM.point(lerp(-math.pi, math.pi, u), lerp(1.06, 1.61, v), 0.005), False)
    ob = link(sc, mesh_object("ShirtFront", shirt.verts, shirt.faces), coll)
    ob.data.materials.append(M["shirt"])
    band = Piece("ShirtCollar", 48, 4, lambda u, v: FORM.point(lerp(0.12, 2 * math.pi - 0.12, u), lerp(1.598, 1.645, v), 0.007), False)
    ob2 = link(sc, mesh_object("ShirtCollar", band.verts, band.faces), coll)
    ob2.data.materials.append(M["shirt"])
    for o in (ob, ob2):
        so = o.modifiers.new("Thickness", "SOLIDIFY"); so.thickness = 0.0015
    return ob

def arm_proxies(sc, coll):
    obs = []
    for side in (1, -1):
        pts = []
        for k in range(30):
            t = k / 29
            x, y, f = sleeve_axis(lerp(0.06, 0.98, t))
            pts.append(V(x * side, y, f))
        ob = link(sc, tube("ArmProxy", pts, 0.02, bpy.data.materials.get("Twill tape"), taper=0.85, segs=16), coll)
        ob.scale = (1, 1, 1)
        ob.hide_render = True; ob.display_type = "WIRE"
        obs.append(ob)
    return obs

def build_jacket_sim(sc, pieces, coll):
    verts, faces, edges, groups, canvas = [], [], [], {}, []
    offsets = {}
    for p in pieces:
        o = len(verts); offsets[p.name] = o
        verts += p.verts; canvas += p.canvas
        faces += [tuple(i + o for i in f) for f in p.faces]
        groups[p.name] = list(range(o, o + len(p.verts)))
    # sewing: join boundary points of pieces that share a seam
    bpts = [(p.name, offsets[p.name] + i) for p in pieces for i in p.boundary]
    arr = np.array([tuple(verts[i]) for _, i in bpts])
    names = [n for n, _ in bpts]
    tree = BVHTree.FromPolygons  # noqa (kept for reference)
    from mathutils.kdtree import KDTree
    kd = KDTree(len(arr))
    for k, p in enumerate(arr): kd.insert(p, k)
    kd.balance()
    seen = set()
    for k, p in enumerate(arr):
        # each edge point is sewn to its single nearest partner on each piece it joins
        best = {}
        for (co, j, dist) in kd.find_range(p, 0.013):
            if j == k or names[j] == names[k] or not sewn(names[k], names[j]): continue
            if names[j] not in best or dist < best[names[j]][1]: best[names[j]] = (j, dist)
        for j, _ in best.values():
            key = (min(bpts[k][1], bpts[j][1]), max(bpts[k][1], bpts[j][1]))
            if key in seen: continue
            seen.add(key); edges.append(key)
    # the button: join the two fronts where the left one buttons over the right
    B = V(*JACKET.point(0.0, BREAK))
    # only the cloth right under the button: the front edges and the lapel tips stay free
    left = []   # (no weld: the fronts are held by the button-stand pin below, each at its own layer)
    right = groups["Forepart_R"]
    for i in left:
        j = min(right, key=lambda k: (verts[k] - verts[i]).length)
        if (verts[j] - verts[i]).length < 0.012: edges.append((i, j))
    # weld each seam: the sewn points become one point in the draping mesh, so the garment
    # holds together; rep[] remembers which welded point each pattern-piece point became
    parent = list(range(len(verts)))
    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]; x = parent[x]
        return x
    for a, b in edges:
        ra, rb = find(a), find(b)
        if ra != rb: parent[max(ra, rb)] = min(ra, rb)
    roots = sorted({find(i) for i in range(len(verts))})
    index = {r: k for k, r in enumerate(roots)}
    rep = [index[find(i)] for i in range(len(verts))]
    acc = [Vector() for _ in roots]; cnt = [0] * len(roots)
    for i, v in enumerate(verts): acc[rep[i]] += v; cnt[rep[i]] += 1
    wverts = [acc[k] / cnt[k] for k in range(len(roots))]
    wfaces = []
    for f in faces:
        g = []
        for i in f:
            if rep[i] not in g: g.append(rep[i])
        if len(g) < 3: continue
        P0 = wverts[g[0]]; area = 0.0
        for k in range(1, len(g) - 1): area += (wverts[g[k]] - P0).cross(wverts[g[k + 1]] - P0).length / 2
        if area > 2e-7: wfaces.append(tuple(g))   # drop slivers left where welds pinched a face
    ob = mesh_object("JacketSim", wverts, wfaces)
    short = sum(1 for e in ob.data.edges if (wverts[e.vertices[0]] - wverts[e.vertices[1]]).length < 0.001)
    print("  welded mesh: %d points, %d faces, %d edges under 1 mm" % (len(wverts), len(wfaces), short), flush=True)
    link(sc, ob, coll)
    wcanvas = [0.0] * len(roots); wpin = [0.0] * len(roots); owner = [None] * len(roots)
    for name, idx in groups.items():
        for i in idx:
            k = rep[i]
            wcanvas[k] = max(wcanvas[k], canvas[i])
            # the shoulders, neck and collar are held by canvas and pads; everything below hangs free
            # the lapel is canvassed and pad-stitched, so it keeps its shape but still settles
            w = 1.0 if name in ("Collar",) or name.startswith("Lapel") else smooth(1.47, 1.53, verts[i].z)
            if name.startswith("Forepart") and verts[i].z > BREAK - 0.04:
                # the canvassed front edge under the lapel holds its line, so the lapel can't wrinkle
                own_x = verts[i].x if name.endswith("_L") else -verts[i].x
                w = max(w, 1 - smooth(0.012, 0.035, own_x - roll_x(verts[i].z)))
            if name.startswith("Forepart"):
                # the button holds the two fronts closed, one over the other
                d = math.hypot(verts[i].x, verts[i].z - BREAK)
                w = max(w, 0.85 * (1 - smooth(0.03, 0.07, d)))
            wpin[k] = max(wpin[k], w)
            owner[k] = owner[k] or name
    for name in groups:
        vg = ob.vertex_groups.new(name=name)
        vg.add(sorted({rep[i] for i in groups[name]}), 1.0, "REPLACE")
    vg = ob.vertex_groups.new(name="canvas")
    for k, w in enumerate(wcanvas): vg.add([k], w, "REPLACE")
    pin = ob.vertex_groups.new(name="pin")
    for k, w in enumerate(wpin): pin.add([k], w, "REPLACE")
    ob["rep"] = rep
    return ob, offsets, len(edges)

def simulate(sc, ob, colliders, frames=60):
    for c in colliders:
        m = c.modifiers.new("Collision", "COLLISION")
        c.collision.thickness_outer = 0.004
        c.collision.cloth_friction = 8
    cl = ob.modifiers.new("Cloth", "CLOTH")
    s = cl.settings
    s.quality = 10; s.mass = 0.15; s.air_damping = 2.0
    s.tension_stiffness = 15; s.compression_stiffness = 15; s.shear_stiffness = 5
    s.bending_stiffness = 0.3; s.bending_stiffness_max = 20; s.vertex_group_bending = "canvas"
    s.vertex_group_mass = "pin"; s.pin_stiffness = 3
    # seams are joined by plain springs (each point to its nearest partner), which hold them closed
    s.use_sewing_springs = False
    c = cl.collision_settings
    c.collision_quality = 4; c.distance_min = 0.004
    c.use_self_collision = True; c.self_distance_min = 0.0015; c.self_friction = 8
    cl.point_cache.frame_start = 1; cl.point_cache.frame_end = frames
    sc.frame_start, sc.frame_end = 1, frames
    for f in range(1, frames + 1):
        sc.frame_set(f)
        if f % 10 == 0: print("  sim frame", f, flush=True)
    dg = bpy.context.evaluated_depsgraph_get()
    me = ob.evaluated_get(dg).to_mesh()
    co = [Vector(v.co) for v in me.vertices]
    names = {g.index: g.name for g in ob.vertex_groups}
    worst = {}
    for v in ob.data.vertices:
        g = next((names[x.group] for x in v.groups if names[x.group] not in ("canvas", "pin")), "?")
        worst[g] = max(worst.get(g, 0), (co[v.index] - v.co).length)
    print("  drape moved (max m):", {k: round(x, 3) for k, x in worst.items()}, flush=True)
    if ARGS.get("debug"):
        gi = {g.name: g.index for g in ob.vertex_groups}
        for gname in ("Lapel_L", "Collar", "Forepart_L"):
            rows = {}
            for v in ob.data.vertices:
                if v.co.x < 0 or v.co.z < 1.36 or not any(x.group == gi[gname] for x in v.groups): continue
                d = co[v.index] - v.co; r = rows.setdefault(round(v.co.z, 2), [0, 0, 0])
                r[0] = max(r[0], d.length); r[1] = min(r[1], d.z); r[2] = min(r[2], d.y)
            print("  ", gname, " ".join("%.2f:%.0f/%.0f/%.0f" % (k, *(x * 1000 for x in r)) for k, r in sorted(rows.items())), flush=True)
    ob.evaluated_get(dg).to_mesh_clear()
    return co

def split_pieces(sc, pieces, offsets, co, M, coll):
    obs = {}
    for p in pieces:
        o = offsets[p.name]
        ob = link(sc, mesh_object(p.name, co[o:o + len(p.verts)], p.faces), coll)
        # points that the seam welds pulled together become one, and pinched faces go
        bm = bmesh.new(); bm.from_mesh(ob.data)
        uv = bm.loops.layers.uv.new("grain")    # the straight grain runs up the body
        for face in bm.faces:
            for loop in face.loops:
                c = loop.vert.co; loop[uv].uv = (c.z, c.x)
        bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.0006)
        bmesh.ops.dissolve_degenerate(bm, edges=bm.edges, dist=0.0006)
        bm.to_mesh(ob.data); bm.free()
        for poly in ob.data.polygons: poly.use_smooth = True
        ob.data.materials.append(M["satin_lapel"] if p.material == "satin" else M[p.material])
        if p.material == "satin":   # wool underneath the satin facing shows at the edges
            ob.data.materials.append(M["wool"])
        so = ob.modifiers.new("Thickness", "SOLIDIFY")
        so.thickness = 0.0022 if p.material == "wool" else 0.0018
        so.offset = -1; so.use_rim = True; so.use_even_offset = False; so.use_quality_normals = True
        sub = ob.modifiers.new("Subdivision", "SUBSURF"); sub.levels = 1; sub.render_levels = 2
        # origin at the piece's centre, so it can fly in and settle
        c = sum(co[o:o + len(p.verts)], Vector()) / len(p.verts)
        ob.data.transform(Matrix.Translation(-c)); ob.location = c
        obs[p.name] = ob
    return obs

# ------------------------------------------------------------------ finishing details
def surface(ob):
    """Nearest point and normal on a piece's outer surface, in world space."""
    mw = Matrix.Translation(ob.location)    # pieces are not parented or turned yet when this runs
    vs = [mw @ v.co for v in ob.data.vertices]
    t = BVHTree.FromPolygons(vs, [tuple(p.vertices) for p in ob.data.polygons])
    def at(p):
        loc, n, i, d = t.find_nearest(p)
        out = Vector((loc.x, loc.y, 0)).normalized()
        if n.dot(out) < 0: n = -n            # make the normal face away from the body
        return loc, n
    return at

def place(ob, loc, normal, lift=0.0):
    ob.location = loc + normal * lift
    ob.rotation_euler = normal.to_track_quat("Z", "Y").to_euler()

def details(sc, M, obs, coll):
    made = {}
    def keep(name, ob, group):
        link(sc, ob, coll); made.setdefault(group, []).append(ob); return ob
    # satin-covered button at the break
    btn = lathe("Button", [(0.0, 0.0045), (0.006, 0.0042), (0.0095, 0.0032), (0.0115, 0.0015), (0.0118, 0.0), (0.0, 0.0)], 40)
    btn.data.materials.append(M["satin"])
    loc, n = surface(obs["Forepart_L"])(V(*JACKET.point(0.0, BREAK, 0.01)))
    place(btn, loc, n, 0.0005); keep("Button", btn, "button")
    # jetted hip pockets (satin piping) and a breast welt pocket
    for side, sx in (("L", 1), ("R", -1)):
        at = surface(obs["Forepart_" + side])
        for lip in (0.0035, -0.0035):
            pts = []
            for k in range(25):
                x, y, f = JACKET.point(lerp(0.46, 0.98, k / 24), 0.995 + lip, 0.01)
                loc, n = at(V(x * sx, y, f)); pts.append(loc + n * 0.0016)
            keep("Pocket jet", tube("Pocket jet", pts, 0.0024, M["satin"]), "pockets")
    at = surface(obs["Forepart_L"])
    vs, fs = [], []
    for j in range(4):
        for i in range(16):
            u = i / 15
            x, y, f = JACKET.point(lerp(0.66, 1.0, u), 1.372 + 0.012 * u + 0.022 * j / 3, 0.01)
            loc, n = at(V(x, y, f)); vs.append(loc + n * 0.0012)
    for j in range(3):
        for i in range(15):
            a = j * 16 + i; fs.append((a, a + 1, a + 17, a + 16))
    welt = mesh_object("Breast welt", vs, fs); welt.data.materials.append(M["wool"])
    so = welt.modifiers.new("Thickness", "SOLIDIFY"); so.thickness = 0.003; so.offset = 1
    welt.modifiers.new("Subdivision", "SUBSURF").levels = 1
    keep("Breast welt", welt, "pockets")
    # four kissing cuff buttons by the sleeve vent
    for side, sx in (("L", 1), ("R", -1)):
        at = surface(obs["TopSleeve_" + side])
        for k, t in enumerate((0.84, 0.88, 0.92, 0.96)):
            x, y, f = sleeve_point(SLEEVE_BACK - 0.3, HEAD + (1 - HEAD) * t, 0.01)
            loc, n = at(V(x * sx, y, f))
            b = lathe("Cuff button", [(0.0, 0.003), (0.006, 0.0026), (0.0075, 0.001), (0.0076, 0.0), (0.0, 0.0)], 28)
            b.data.materials.append(M["satin"]); place(b, loc, n, 0.0004); keep("Cuff button", b, "cuffs")
    # onyx shirt studs
    for z in (1.30, 1.38, 1.46):
        st = lathe("Stud", [(0.0, 0.003), (0.0032, 0.0026), (0.004, 0.001), (0.004, 0.0), (0.0, 0.0)], 24)
        st.data.materials.append(M["onyx"])
        p = V(*FORM.point(0.0, z, 0.0065)); place(st, p, Vector((0, -1, 0))); keep("Stud", st, "studs")
    # bow tie: two wings and a knot, in satin
    wing = [(0.007, -0.009), (0.022, -0.02), (0.04, -0.026), (0.054, -0.022), (0.05, -0.008), (0.047, 0.0),
            (0.05, 0.008), (0.054, 0.022), (0.04, 0.026), (0.022, 0.02), (0.007, 0.009)]
    bow = bpy.data.objects.new("Bow tie", None); link(sc, bow, coll); made.setdefault("bow", []).append(bow)
    for sx in (1, -1):
        bm = bmesh.new()
        vs = [bm.verts.new((x * sx, 0.0, y)) for x, y in wing]
        f = bm.faces.new(vs if sx > 0 else list(reversed(vs)))
        ext = bmesh.ops.extrude_face_region(bm, geom=[f])
        bmesh.ops.translate(bm, verts=[e for e in ext["geom"] if isinstance(e, bmesh.types.BMVert)], vec=(0, -0.009, 0))
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        me = bpy.data.meshes.new("Bow wing"); bm.to_mesh(me); bm.free()
        w = bpy.data.objects.new("Bow wing", me); me.materials.append(M["satin"])
        bv = w.modifiers.new("Bevel", "BEVEL"); bv.width = 0.0025; bv.segments = 3
        w.modifiers.new("Subdivision", "SUBSURF").levels = 2
        for poly in me.polygons: poly.use_smooth = True
        link(sc, w, coll); w.parent = bow
    knot = lathe("Bow knot", [(0.0, -0.011), (0.009, -0.009), (0.011, 0.0), (0.009, 0.009), (0.0, 0.011)], 24)
    knot.data.materials.append(M["satin"]); knot.scale = (1.0, 0.7, 1.0); knot.rotation_euler = (math.pi / 2, 0, 0)
    link(sc, knot, coll); knot.parent = bow
    bow.location = V(*FORM.point(0.0, 1.614, 0.017)) + Vector((0, 0.004, 0))
    return made

def build_finished_body(sc, sim, wco, M, coll):
    """The sewn body as one smooth surface (the drape mesh), for after the seams are closed.
    Seams show only as a slight pressed groove; the fine stitches sit over them."""
    names = {g.index: g.name for g in sim.vertex_groups if g.name not in ("canvas", "pin")}
    member = [set(names[x.group] for x in v.groups if x.group in names) for v in sim.data.vertices]
    def body(n): return not (n.startswith("Lapel") or n == "Collar")
    faces = []
    for p in sim.data.polygons:
        common = set.intersection(*[member[i] for i in p.vertices])
        if any(body(n) for n in common): faces.append(tuple(p.vertices))
    used = sorted({i for f in faces for i in f}); remap = {o: k for k, o in enumerate(used)}
    verts = [wco[i].copy() for i in used]
    ob = mesh_object("JacketFinished", verts, [tuple(remap[i] for i in f) for f in faces])
    me = ob.data
    me.calc_loop_triangles() if hasattr(me, "calc_loop_triangles") else None
    # pressed seams: points where two pieces were welded sink a fraction of a millimetre
    vnorm = [v.normal.copy() for v in me.vertices]
    for k, o in enumerate(used):
        if sum(1 for n in member[o] if body(n)) >= 2:
            out = Vector((verts[k].x, verts[k].y, 0)).normalized()
            nrm = vnorm[k] if vnorm[k].dot(out) >= 0 else -vnorm[k]
            me.vertices[k].co = verts[k] - nrm * 0.0007
    # close the pinholes where three seams meet (shoulder point); the big openings stay open
    bm = bmesh.new(); bm.from_mesh(me)
    bmesh.ops.holes_fill(bm, edges=[e for e in bm.edges if e.is_boundary], sides=10)
    bm.to_mesh(me); bm.free()
    for poly in me.polygons: poly.use_smooth = True
    link(sc, ob, coll); me.materials.append(M["wool"])
    so = ob.modifiers.new("Thickness", "SOLIDIFY"); so.thickness = 0.0022; so.offset = -1
    so.use_quality_normals = True
    sub = ob.modifiers.new("Subdivision", "SUBSURF"); sub.levels = 1; sub.render_levels = 2
    return ob

def lights_camera(sc):
    sc.render.engine = "CYCLES"
    sc.cycles.samples = 128; sc.cycles.use_denoising = True
    try:
        prefs = bpy.context.preferences.addons["cycles"].preferences
        prefs.compute_device_type = "OPTIX"; prefs.get_devices()
        for d in prefs.devices: d.use = d.type == "OPTIX"
        sc.cycles.device = "GPU"
    except Exception as e:
        print("GPU setup failed, using CPU:", e)
    sc.render.resolution_x, sc.render.resolution_y = 900, 1200
    sc.render.film_transparent = True
    sc.view_settings.view_transform = "AgX"
    try: sc.view_settings.look = "AgX - Medium High Contrast"
    except TypeError: pass
    world = bpy.data.worlds.new("Studio"); sc.world = world
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs[0].default_value = (0.006, 0.006, 0.007, 1)
    world.node_tree.nodes["Background"].inputs[1].default_value = 1.0

    def area(name, loc, size, power, color=(1, 1, 1), sx=None):
        ld = bpy.data.lights.new(name, "AREA"); ld.shape = "RECTANGLE"
        ld.size = size; ld.size_y = sx or size; ld.energy = power; ld.color = color
        ob = bpy.data.objects.new(name, ld); sc.collection.objects.link(ob)
        ob.location = loc
        d = Vector((0, 0, 1.2)) - Vector(loc)
        ob.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()
        return ob
    area("Key", (-1.6, -2.4, 2.6), 1.6, 110, (1.0, 0.95, 0.88))
    area("Fill", (2.2, -2.2, 1.4), 2.0, 30, (0.85, 0.9, 1.0))
    area("RimL", (-1.8, 1.8, 2.0), 0.5, 140, (1.0, 0.86, 0.62), 1.6)
    area("RimR", (1.8, 1.6, 1.9), 0.5, 110, (1.0, 0.9, 0.75), 1.6)
    area("Top", (0, 0, 3.4), 1.2, 40)

    floor = mesh_object("ShadowFloor", [(-3, -3, 0), (3, -3, 0), (3, 3, 0), (-3, 3, 0)], [(0, 1, 2, 3)])
    sc.collection.objects.link(floor); floor.is_shadow_catcher = True

    cam_d = bpy.data.cameras.new("Camera"); cam_d.lens = 95; cam_d.sensor_fit = "VERTICAL"; cam_d.sensor_height = 36
    cam = bpy.data.objects.new("Camera", cam_d); sc.collection.objects.link(cam); sc.camera = cam
    cam.location = (0.0, -5.2, 1.05)
    d = Vector((0, 0, 0.88)) - cam.location
    cam.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()
    return cam

def stage_model():
    sc = bpy.context.scene
    for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
    sc.name = "Stitched Jacket"
    sc.unit_settings.system = "METRIC"
    sc.render.fps = 30
    M = materials()
    rig = bpy.data.objects.new("Turntable", None); sc.collection.objects.link(rig)
    def coll(name):
        c = bpy.data.collections.new(name); sc.collection.children.link(c); return c
    c_form, c_jacket, c_sim = coll("Dress form"), coll("Jacket pieces"), coll("Simulation")
    form = build_form(sc, M, c_form)
    shirt = build_shirt(sc, M, c_form)
    arms = arm_proxies(sc, c_sim)
    pieces = build_pieces()
    sim, offsets, nsew = build_jacket_sim(sc, pieces, c_sim)
    print("pieces:", len(pieces), "verts:", len(sim.data.vertices), "sewing edges:", nsew, flush=True)
    wco = simulate(sc, sim, [form] + arms, frames=int(ARGS.get("frames", 50)))
    co = [wco[k] for k in sim["rep"]]
    obs = split_pieces(sc, pieces, offsets, co, M, c_jacket)
    sim.hide_render = True; sim.hide_viewport = True
    build_finished_body(sc, sim, wco, M, c_jacket_final := coll("Jacket finished"))
    c_det = coll("Details")
    details(sc, M, obs, c_det)
    c_sim.hide_viewport = True; c_sim.hide_render = True
    for o in list(c_form.objects) + list(c_jacket.objects) + list(c_det.objects) + list(c_jacket_final.objects):
        if o.parent is None: o.parent = rig
    lights_camera(sc)
    sc.frame_set(1)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(BUILD, "jacket.blend"))
    print("saved", os.path.join(BUILD, "jacket.blend"), flush=True)

def stage_still():
    sc = bpy.context.scene
    rig = bpy.data.objects.get("Turntable")
    if "t" in ARGS: sc.frame_set(sec(float(ARGS["t"])))
    elif rig and "yaw" in ARGS: rig.rotation_euler.z = math.radians(float(ARGS["yaw"]))
    if "samples" in ARGS: sc.cycles.samples = int(ARGS["samples"])
    if ARGS.get("framing") == "lapel":
        cam = sc.camera; cam.location = (0.35, -1.5, 1.45); cam.data.lens = float(ARGS.get("lens", 95))
        d = Vector((0.03, 0, 1.36)) - cam.location; cam.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()
    if ARGS.get("framing") == "break":  # where the lapels end at the button
        cam = sc.camera; cam.location = (0.25, -1.2, 1.2); cam.data.lens = 120
        d = Vector((0.0, 0, 1.15)) - cam.location; cam.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()
    if ARGS.get("framing") == "neck":   # the collar and shoulders, straight on
        cam = sc.camera; cam.location = (0.0, -1.9, 1.56); cam.data.lens = 95
        d = Vector((0, 0, 1.50)) - cam.location; cam.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()
    if ARGS.get("framing") == "torso":
        cam = sc.camera; cam.location = (0.0, -3.4, 1.38); cam.data.lens = 95
        d = Vector((0, 0, 1.24)) - cam.location; cam.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()
    sc.render.filepath = os.path.join(BUILD, ARGS.get("out", "still.png"))
    bpy.ops.render.render(write_still=True)
    print("wrote", sc.render.filepath, flush=True)

# ------------------------------------------------------------------ animation
FPS = 30
def sec(t): return int(round(1 + t * FPS))

# When each piece arrives (seconds) and the seams in sewing order. The form turns once
# (see TURN), so every seam is sewn while it faces the camera.
ARRIVE = {
    "Back_L": 0.5, "Back_R": 0.62, "SideBody_L": 0.85, "SideBody_R": 0.97,
    "Forepart_L": 1.2, "Forepart_R": 1.32, "TopSleeve_L": 1.6, "UnderSleeve_L": 1.7,
    "TopSleeve_R": 1.75, "UnderSleeve_R": 1.85,
    "Collar": 6.4, "Lapel_L": 6.55, "Lapel_R": 6.65,
}
ARRIVE_DUR = 1.0
TURN = (0.9, 7.4, -25.0, 335.0)       # start, length, from-degrees, to-degrees
# (piece A, piece B, start s, length s); a pair can hold several seams (the sleeve has two)
SEAMS = [
    ("Forepart_R", "SideBody_R", 2.7, 0.8), ("Forepart_R", "Back_R", 2.9, 0.4),
    ("TopSleeve_R", "UnderSleeve_R", 3.0, 0.9), ("Forepart_R", "TopSleeve_R", 3.2, 0.8),
    ("SideBody_R", "UnderSleeve_R", 3.45, 0.5), ("Back_R", "TopSleeve_R", 3.6, 0.6),
    ("SideBody_R", "Back_R", 4.0, 0.8), ("Back_L", "Back_R", 4.3, 1.0), ("SideBody_L", "Back_L", 4.8, 0.8),
    ("Back_L", "TopSleeve_L", 5.15, 0.6), ("Forepart_L", "Back_L", 5.3, 0.4),
    ("TopSleeve_L", "UnderSleeve_L", 5.4, 0.9), ("SideBody_L", "UnderSleeve_L", 5.6, 0.5),
    ("Forepart_L", "TopSleeve_L", 5.7, 0.8), ("Forepart_L", "SideBody_L", 5.9, 0.8),
    ("Collar", "Back_L", 6.9, 0.6), ("Collar", "Lapel_L", 7.2, 0.4), ("Collar", "Lapel_R", 7.25, 0.4),
]
END = 9.0

def boundary_points(ob):
    me = ob.data; mw = ob.matrix_world
    count = {}
    for p in me.polygons:
        for ek in p.edge_keys: count[ek] = count.get(ek, 0) + 1
    vs = {v for ek, c in count.items() if c == 1 for v in ek}
    return [(mw @ me.vertices[i].co) for i in vs]

def chains(points, gap=0.03):
    """Order loose seam points into polylines by walking to the nearest neighbour."""
    pts = list(points); out = []
    while pts:
        c = pts.mean(0) if False else sum(pts, Vector()) / len(pts)
        start = max(pts, key=lambda p: (p - c).length)
        chain = [start]; pts.remove(start)
        while pts:
            nxt = min(pts, key=lambda p: (p - chain[-1]).length)
            if (nxt - chain[-1]).length > gap: break
            chain.append(nxt); pts.remove(nxt)
        if len(chain) > 4: out.append(chain)
    return out

def resample(chain, step):
    L = [0.0]
    for i in range(1, len(chain)): L.append(L[-1] + (chain[i] - chain[i - 1]).length)
    n = max(2, int(L[-1] / step)); out = []
    j = 0
    for k in range(n):
        s = (k + 0.5) * L[-1] / n
        while j < len(L) - 2 and L[j + 1] < s: j += 1
        f = (s - L[j]) / ((L[j + 1] - L[j]) or 1)
        out.append(chain[j].lerp(chain[j + 1], f))
    return out

def seam_paths(obs, a, b):
    """The seam(s) between two pieces: points where their edges meet."""
    pa, pb = boundary_points(obs[a]), boundary_points(obs[b])
    from mathutils.kdtree import KDTree
    kd = KDTree(len(pb))
    for i, p in enumerate(pb): kd.insert(p, i)
    kd.balance()
    mids = []
    for p in pa:
        co, i, d = kd.find(p)
        if d < 0.015: mids.append((p + co) / 2)
    paths = []
    for ch in chains(mids):
        # light smoothing so the thread runs clean
        sm = [sum(ch[max(0, i - 2):i + 3], Vector()) / len(ch[max(0, i - 2):i + 3]) for i in range(len(ch))]
        paths.append(sm)
    return paths

def stitch_mesh(name, path, surface_obs, thread):
    """A running stitch along path, lifted just off the cloth. Faces are in sewing order for the Build modifier."""
    pts = resample(path, 0.011)
    trees = []
    for o in surface_obs:
        dg = bpy.context.evaluated_depsgraph_get()
        trees.append((o, BVHTree.FromObject(o, dg)))
    bm = bmesh.new(); tips = []
    for k, p in enumerate(pts):
        nrm = Vector((p.x, p.y, 0)).normalized()
        for o, t in trees:
            loc, n, i, d = t.find_nearest(o.matrix_world.inverted() @ p)
            if loc is not None and d < 0.02:
                nrm = (o.matrix_world.to_3x3() @ n).normalized(); break
        tan = (pts[min(k + 1, len(pts) - 1)] - pts[max(k - 1, 0)]).normalized()
        c = p + nrm * 0.0005
        # a flat stitch lying in the cloth: long along the seam, thin across, barely raised
        side = nrm.cross(tan).normalized(); up = tan.cross(side).normalized()
        basis = Matrix((side, up, tan)).transposed().to_4x4()
        m = Matrix.Translation(c) @ basis @ Matrix.Diagonal((0.0007, 0.0003, 0.0040, 1))
        bmesh.ops.create_uvsphere(bm, u_segments=8, v_segments=5, radius=1.0, matrix=m)
        tips.append((c, nrm, tan))
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    for p in me.polygons: p.use_smooth = True
    ob = bpy.data.objects.new(name, me); me.materials.append(thread)
    return ob, tips

def fade_material(m):
    """Let a material fade with the object's alpha (object colour alpha), for pieces arriving."""
    nt = m.node_tree
    if "FadeMix" in nt.nodes: return
    out = next(n for n in nt.nodes if n.type == "OUTPUT_MATERIAL")
    src = out.inputs[0].links[0].from_socket
    info = nt.nodes.new("ShaderNodeObjectInfo")
    tr = nt.nodes.new("ShaderNodeBsdfTransparent")
    mix = nt.nodes.new("ShaderNodeMixShader"); mix.name = "FadeMix"
    nt.links.new(info.outputs["Alpha"], mix.inputs[0])
    nt.links.new(tr.outputs[0], mix.inputs[1]); nt.links.new(src, mix.inputs[2])
    nt.links.new(mix.outputs[0], out.inputs[0])

def key(ob, path, frame, value=None, index=-1):
    if value is not None:
        cur = getattr(ob, path)
        if index >= 0: cur[index] = value
        else: setattr(ob, path, value)
    ob.keyframe_insert(path, frame=frame, index=index)

def stage_anim():
    sc = bpy.context.scene
    sc.render.fps = FPS
    sc.frame_start, sc.frame_end = 1, sec(END + 1.0)
    rig = bpy.data.objects["Turntable"]
    jacket = bpy.data.collections["Jacket pieces"]
    obs = {o.name: o for o in jacket.objects}
    thread = mat("Gold thread", lambda nt, b: (
        b.inputs["Base Color"].__setattr__("default_value", (0.55, 0.38, 0.16, 1)),
        b.inputs["Roughness"].__setattr__("default_value", 0.7),
        b.inputs["Sheen Weight"].__setattr__("default_value", 0.2),
        b.inputs["Specular IOR Level"].__setattr__("default_value", 0.2),
        b.inputs["Metallic"].__setattr__("default_value", 0.0)))
    steel = mat("Needle steel", lambda nt, b: (
        b.inputs["Base Color"].__setattr__("default_value", (0.8, 0.8, 0.82, 1)),
        b.inputs["Metallic"].__setattr__("default_value", 1.0),
        b.inputs["Roughness"].__setattr__("default_value", 0.15)))
    for m in {s.material for o in obs.values() for s in o.material_slots if s.material}: fade_material(m)
    tn = thread.node_tree
    info = tn.nodes.new("ShaderNodeObjectInfo")
    bsdf = next(n for n in tn.nodes if n.type == "BSDF_PRINCIPLED")
    tn.links.new(info.outputs["Color"], bsdf.inputs["Base Color"])

    # turntable: one slow turn while the jacket comes together
    t0, dur, a0, a1 = TURN
    rig.rotation_mode = "XYZ"
    rig.animation_data_clear()
    for k in range(0, 41):
        t = t0 + dur * k / 40
        e = (1 - math.cos(math.pi * k / 40)) / 2
        key(rig, "rotation_euler", sec(t), math.radians(lerp(a0, a1, e)), 2)
    key(rig, "rotation_euler", 1, math.radians(a0), 2)

    # seams first (they need the pieces in their finished places)
    stitches = bpy.data.collections.get("Stitches") or bpy.data.collections.new("Stitches")
    if stitches.name not in sc.collection.children: sc.collection.children.link(stitches)
    for o in list(stitches.objects): bpy.data.objects.remove(o, do_unlink=True)
    rig.rotation_euler.z = 0; bpy.context.view_layer.update()
    closes = {}                                  # piece -> time its first seam is sewn
    needle_me = None
    for a, b, start, length in SEAMS:
        if a not in obs or b not in obs: continue
        for n, path in enumerate(seam_paths(obs, a, b)):
            ob, tips = stitch_mesh("Stitch %s-%s %d" % (a, b, n), path, [obs[a], obs[b]], thread)
            stitches.objects.link(ob); ob.parent = rig
            bm_ = ob.modifiers.new("Sew", "BUILD")
            bm_.frame_start = sec(start); bm_.frame_duration = max(1, sec(start + length) - sec(start))
            # gold while it is sewn, then the thread sinks into the black cloth
            gold, black = (0.55, 0.38, 0.16, 1.0), (0.012, 0.012, 0.014, 1.0)
            key(ob, "color", 1, gold); key(ob, "color", sec(start + length + 0.4), gold)
            key(ob, "color", sec(start + length + 1.6), black)
            # a needle leads the thread
            if needle_me is None:
                needle_me = bpy.data.meshes.new("Needle")
                bmn = bmesh.new()
                bmesh.ops.create_cone(bmn, cap_ends=True, segments=10, radius1=0.0006, radius2=0.0011, depth=0.045,
                                      matrix=Matrix.Translation((0, 0, 0.0225)))
                bmn.to_mesh(needle_me); bmn.free(); needle_me.materials.append(steel)
            nd = bpy.data.objects.new("Needle %s-%s %d" % (a, b, n), needle_me); stitches.objects.link(nd); nd.parent = rig
            f0, f1 = sec(start), sec(start + length)
            key(nd, "hide_render", f0 - 1, True); key(nd, "hide_viewport", f0 - 1, True)
            key(nd, "hide_render", f0, False); key(nd, "hide_viewport", f0, False)
            key(nd, "hide_render", f1 + 1, True); key(nd, "hide_viewport", f1 + 1, True)
            for f in range(f0, f1 + 1):
                k = min(len(tips) - 1, int(len(tips) * (f - f0) / max(1, f1 - f0)))
                c, nrm, tan = tips[k]
                bob = 0.5 + 0.5 * math.sin(f * 1.7)
                axis = (nrm - tan * 0.7).normalized()
                key(nd, "location", f, c + axis * (-0.004 + 0.012 * bob))
                key(nd, "rotation_euler", f, axis.to_track_quat("Z", "Y").to_euler())
        for p in (a, b): closes[p] = min(closes.get(p, 1e9), start)

    # pieces fly in, outlined against the form, land a finger's width off, and close as they are sewn
    for name, ob in obs.items():
        ob.animation_data_clear()
        final = ob.location.copy()
        out = Vector((final.x, final.y, 0)); out = out.normalized() if out.length > 1e-4 else Vector((0, -1, 0))
        t = ARRIVE.get(name, 2.0)
        far = 0.24
        lift = Vector((0, 0, 0.06))
        if name.startswith("Lapel") or name == "Collar":   # the facings settle down onto the chest
            out = Vector((0, -1, 0)); far = 0.07; lift = Vector((0, 0, 0.05))
        key(ob, "location", 1, final + out * far + lift)
        key(ob, "location", sec(t), final + out * far + lift)
        key(ob, "location", sec(t + ARRIVE_DUR), final + out * 0.012)
        tc = closes.get(name, t + ARRIVE_DUR + 0.3)
        key(ob, "location", sec(max(tc, t + ARRIVE_DUR)), final + out * 0.012)
        key(ob, "location", sec(max(tc, t + ARRIVE_DUR) + 0.6), final)
        ob.rotation_mode = "XYZ"
        spin = math.radians(18 if final.x >= 0 else -18)
        key(ob, "rotation_euler", sec(t), spin, 2); key(ob, "rotation_euler", sec(t + ARRIVE_DUR), 0.0, 2)
        key(ob, "color", 1, (1, 1, 1, 0.0)); key(ob, "color", sec(t), (1, 1, 1, 0.0))
        key(ob, "color", sec(t + 0.5), (1, 1, 1, 1.0))
        for fc in ob.animation_data.action.fcurves if hasattr(ob.animation_data.action, "fcurves") else []:
            for kp in fc.keyframe_points: kp.interpolation = "BEZIER"; kp.easing = "EASE_OUT"
    # once the body's seams are all sewn, the separate pieces give way to the finished body
    fin = bpy.data.objects.get("JacketFinished")
    if fin:
        swap = max(t + l for a, b, t, l in SEAMS if not ({a, b} & {"Collar", "Lapel_L", "Lapel_R"})) + 0.7
        fin.animation_data_clear()
        # the same shape, so a clean cut on one frame: the pieces step out, the finished body steps in
        # (only one of the two coincident surfaces renders at a time; an invisible one still speckles)
        key(fin, "color", 1, (1, 1, 1, 1.0))
        key(fin, "hide_render", 1, True); key(fin, "hide_render", sec(swap) - 1, True); key(fin, "hide_render", sec(swap), False)
        key(fin, "hide_viewport", 1, True); key(fin, "hide_viewport", sec(swap) - 1, True); key(fin, "hide_viewport", sec(swap), False)
        for name, ob in obs.items():
            if name.startswith("Lapel") or name == "Collar": continue
            for path in ("hide_render", "hide_viewport"):
                key(ob, path, 1, False); key(ob, path, sec(swap) - 1, False); key(ob, path, sec(swap), True)
        print("finished body takes over at", round(swap, 2), "s", flush=True)

    # finishing details pop on last: pockets, button, cuff buttons, then the bow tie
    def pop(ob, t):
        ob.animation_data_clear()
        f = sec(t)
        for fr, sc_ in ((1, 0.0), (f, 0.0), (f + 5, 1.15), (f + 9, 1.0)):
            key(ob, "scale", fr, Vector((sc_, sc_, sc_)) if ob.type != "MESH" or sc_ else Vector((1e-4,) * 3))
    det = bpy.data.collections.get("Details")
    if det:
        cuffs = 0
        for ob in det.objects:
            if ob.parent and ob.parent.name == "Bow tie": continue
            n = ob.name
            if n.startswith("Pocket jet") or n.startswith("Breast welt"): pop(ob, 7.3)
            elif n.startswith("Button"): pop(ob, 7.7)
            elif n.startswith("Cuff button"): pop(ob, 7.85 + 0.05 * (cuffs % 4)); cuffs += 1
            elif n.startswith("Bow tie"): pop(ob, 8.05)
    sc.frame_set(sec(END))
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(BUILD, "jacket_anim.blend"))
    print("saved", os.path.join(BUILD, "jacket_anim.blend"), flush=True)

def stage_video():
    """A preview video straight from Blender, on a flat background colour (no alpha)."""
    sc = bpy.context.scene
    bg = tuple(int(ARGS.get("bg", "0F0E0D")[i:i + 2], 16) / 255 for i in (0, 2, 4))
    lin = tuple(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in bg)
    sc.render.film_transparent = False
    sc.world.node_tree.nodes["Background"].inputs[0].default_value = (*lin, 1)
    # the world colour only shows to the camera; keep the lighting as it was
    lp = sc.world.node_tree.nodes.new("ShaderNodeLightPath")
    mix = sc.world.node_tree.nodes.new("ShaderNodeMixShader")
    b2 = sc.world.node_tree.nodes.new("ShaderNodeBackground"); b2.inputs[0].default_value = (0.006, 0.006, 0.007, 1)
    bgn = sc.world.node_tree.nodes["Background"]; out = sc.world.node_tree.nodes["World Output"]
    nt = sc.world.node_tree
    nt.links.new(lp.outputs["Is Camera Ray"], mix.inputs[0])
    nt.links.new(b2.outputs[0], mix.inputs[1]); nt.links.new(bgn.outputs[0], mix.inputs[2])
    nt.links.new(mix.outputs[0], out.inputs[0])
    fl = bpy.data.objects.get("ShadowFloor")
    if fl: fl.hide_render = True
    sc.cycles.samples = int(ARGS.get("samples", 24))
    sc.render.resolution_percentage = int(ARGS.get("scale", 60))
    if ARGS.get("framing") == "break":  # where the lapels end at the button
        cam = sc.camera; cam.location = (0.25, -1.2, 1.2); cam.data.lens = 120
        d = Vector((0.0, 0, 1.15)) - cam.location; cam.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()
    if ARGS.get("framing") == "neck":   # the collar and shoulders, straight on
        cam = sc.camera; cam.location = (0.0, -1.9, 1.56); cam.data.lens = 95
        d = Vector((0, 0, 1.50)) - cam.location; cam.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()
    if ARGS.get("framing") == "torso":
        cam = sc.camera; cam.location = (0.0, -3.4, 1.38)
        d = Vector((0, 0, 1.24)) - cam.location; cam.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()
    im = sc.render.image_settings
    try: im.media_type = "VIDEO"
    except Exception: pass
    im.file_format = "FFMPEG"
    sc.render.ffmpeg.format = "MPEG4"; sc.render.ffmpeg.codec = "H264"
    sc.render.ffmpeg.constant_rate_factor = "HIGH"; sc.render.ffmpeg.ffmpeg_preset = "GOOD"
    sc.render.filepath = os.path.join(BUILD, ARGS.get("out", "preview.mp4"))
    bpy.ops.render.render(animation=True)
    print("wrote", sc.render.filepath, flush=True)

def stage_frames():
    """Final render: transparent PNG frames (with the floor shadow) to build/frames/."""
    sc = bpy.context.scene
    sc.cycles.samples = int(ARGS.get("samples", 96))
    sc.render.resolution_percentage = int(ARGS.get("scale", 80))
    sc.render.use_motion_blur = True
    if ARGS.get("framing") == "break":  # where the lapels end at the button
        cam = sc.camera; cam.location = (0.25, -1.2, 1.2); cam.data.lens = 120
        d = Vector((0.0, 0, 1.15)) - cam.location; cam.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()
    if ARGS.get("framing") == "neck":   # the collar and shoulders, straight on
        cam = sc.camera; cam.location = (0.0, -1.9, 1.56); cam.data.lens = 95
        d = Vector((0, 0, 1.50)) - cam.location; cam.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()
    if ARGS.get("framing") == "torso":
        cam = sc.camera; cam.location = (0.0, -3.4, 1.38)
        d = Vector((0, 0, 1.24)) - cam.location; cam.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()
    im = sc.render.image_settings
    im.file_format = "PNG"; im.color_mode = "RGBA"; im.compression = 30
    sc.render.film_transparent = True
    sc.render.filepath = os.path.join(BUILD, "frames", ARGS.get("framing", "full"), "f_")
    bpy.ops.render.render(animation=True)

def stage_encode():
    """Put the transparent frames on a style's background colour and encode an MP4 and a poster."""
    framing = ARGS.get("framing", "full")
    src = os.path.join(BUILD, "frames", framing)
    files = sorted(f for f in os.listdir(src) if f.endswith(".png"))
    sc = bpy.data.scenes.new("Encode")
    bpy.context.window_manager.windows[0].scene = sc if bpy.context.window_manager.windows else None
    first = bpy.data.images.load(os.path.join(src, files[0]))
    w, h = first.size
    sc.render.resolution_x, sc.render.resolution_y, sc.render.resolution_percentage = w, h, 100
    sc.render.fps = FPS
    sc.frame_start, sc.frame_end = 1, len(files) + int(FPS * float(ARGS.get("hold", 0)))
    se = sc.sequence_editor_create()
    strips = se.strips if hasattr(se, "strips") else se.sequences
    bg = ARGS.get("bg", "0F0E0D")
    col = strips.new_effect("Background", "COLOR", channel=1, frame_start=1, length=sc.frame_end)
    col.color = tuple(int(bg[i:i + 2], 16) / 255 for i in (0, 2, 4))
    img = strips.new_image("Frames", os.path.join(src, files[0]), channel=2, frame_start=1)
    for f in files[1:]: img.elements.append(f)
    img.blend_type = "ALPHA_OVER"
    img.frame_final_end = sc.frame_end + 1           # hold the last frame
    sc.view_settings.view_transform = "Standard"
    im = sc.render.image_settings
    try: im.media_type = "VIDEO"
    except Exception: pass
    im.file_format = "FFMPEG"
    sc.render.ffmpeg.format = "MPEG4"; sc.render.ffmpeg.codec = "H264"
    sc.render.ffmpeg.constant_rate_factor = ARGS.get("crf", "MEDIUM"); sc.render.ffmpeg.ffmpeg_preset = "BEST"
    sc.render.ffmpeg.gopsize = FPS
    name = ARGS.get("out", "jacket-%s-%s" % (framing, bg.lower()))
    sc.render.filepath = os.path.join(BUILD, name + ".mp4")
    bpy.ops.render.render(animation=True, scene=sc.name)
    # poster: the finished jacket on the same background
    try: im.media_type = "IMAGE"
    except Exception: pass
    im.file_format = "JPEG"; im.quality = 88
    sc.frame_set(len(files))
    sc.render.filepath = os.path.join(BUILD, name + ".jpg")
    bpy.ops.render.render(write_still=True, scene=sc.name)
    print("wrote", name, flush=True)

def parse_args():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    out = {}
    for i, a in enumerate(argv):
        if a.startswith("--"):
            out[a[2:]] = argv[i + 1] if i + 1 < len(argv) and not argv[i + 1].startswith("--") else True
    return out

ARGS = parse_args()
if __name__ == "__main__":
    stage = ARGS.get("stage", "model")
    if stage == "model": stage_model()
    elif stage == "still": stage_still()
    elif stage == "anim": stage_anim()
    elif stage == "video": stage_video()
    elif stage == "frames": stage_frames()
    elif stage == "encode": stage_encode()
