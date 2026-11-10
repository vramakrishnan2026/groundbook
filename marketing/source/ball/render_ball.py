# Photoreal football: truncated icosahedron panels on a sphere, with lighting, seams, gloss and leather grain.
import numpy as np, sys
from PIL import Image, ImageFilter
phi = (1 + 5 ** .5) / 2
V = np.array([(-1, phi, 0), (1, phi, 0), (-1, -phi, 0), (1, -phi, 0), (0, -1, phi), (0, 1, phi), (0, -1, -phi), (0, 1, -phi), (phi, 0, -1), (phi, 0, 1), (-phi, 0, -1), (-phi, 0, 1)], float)
V /= np.linalg.norm(V, axis=1)[:, None]
# icosahedron faces = triples of mutually nearest vertices -> hexagon centres
from itertools import combinations
d = np.linalg.norm(V[:, None] - V[None], axis=2); e = d[d > 1e-6].min()
F = [c for c in combinations(range(12), 3) if all(abs(d[a, b] - e) < 1e-6 for a, b in combinations(c, 2))]
Hc = np.array([V[list(f)].mean(0) for f in F]); Hc /= np.linalg.norm(Hc, axis=1)[:, None]
C = np.vstack([V, Hc]); is_pent = np.array([True] * 12 + [False] * 20)
dist = np.where(is_pent, 2.32743, 2.26728)   # face-plane distances of a truncated icosahedron (edge 1)

def rot(ax, ay, az):
    cx, sx, cy, sy, cz, sz = np.cos(ax), np.sin(ax), np.cos(ay), np.sin(ay), np.cos(az), np.sin(az)
    Rx = np.array([[1, 0, 0], [0, cx, -sx], [0, sx, cx]]); Ry = np.array([[cy, 0, sy], [0, 1, 0], [-sy, 0, cy]]); Rz = np.array([[cz, -sz, 0], [sz, cz, 0], [0, 0, 1]])
    return Rz @ Ry @ Rx

def render(size=1400, ss=2, pent=(20, 20, 22), hexa=(244, 244, 238), rotation=(0.35, -0.55, 0.2), seed=3, accent=None):
    N = size * ss
    y, x = np.mgrid[0:N, 0:N]
    u = (x + .5) / N * 2 - 1; v = -((y + .5) / N * 2 - 1)
    r2 = u * u + v * v; inside = r2 <= 1
    z = np.sqrt(np.clip(1 - r2, 0, 1))
    n = np.stack([u, v, z], -1)                       # surface normal = position on unit sphere
    R = rot(*rotation); m = n @ R                     # rotate ball (inverse applied to points)
    score = (m @ C.T) / dist                          # ray hits the face with the largest score
    idx = np.argsort(-score, axis=-1)
    s1 = np.take_along_axis(score, idx[..., :1], -1)[..., 0]; s2 = np.take_along_axis(score, idx[..., 1:2], -1)[..., 0]
    face = idx[..., 0]
    gap = (s1 - s2)                                   # 0 on a seam
    base = np.where(is_pent[face][..., None], np.array(pent, float), np.array(hexa, float))
    if accent is not None:                             # optional: tint one pentagon (the one facing the viewer)
        front = np.argmax((C @ R.T) @ np.array([0, 0, 1.0]) * is_pent)
        base = np.where((face == front)[..., None], np.array(accent, float), base)
    # panels puff up between seams: bend the normal toward the panel centre
    centre = C[face] @ R.T                            # panel centre in view space
    t = np.clip(gap / 0.06, 0, 1)
    puff = (1 - t) ** 2 * 0.35 * np.clip(z / 0.35, 0, 1)
    nn = n + (n - centre) * puff[..., None] * 0 + (n - (centre * 0.0)) * 0
    nn = n - (centre - n) * (puff[..., None] * 0.6)
    nn /= np.linalg.norm(nn, axis=-1, keepdims=True)
    L = np.array([-0.45, 0.55, 0.70]); L /= np.linalg.norm(L)
    Hv = L + np.array([0, 0, 1.0]); Hv /= np.linalg.norm(Hv)
    diff = np.clip(nn @ L, 0, 1)
    spec = np.clip(nn @ Hv, 0, 1) ** 90 * 1.0 + np.clip(nn @ Hv, 0, 1) ** 14 * 0.16
    fill = np.clip(nn @ np.array([0.6, -0.3, 0.6]) / 1.0, 0, 1) * 0.12      # soft bounce light from lower right
    ao = 0.55 + 0.45 * np.clip(gap / 0.025, 0, 1)                            # darken into the seams
    rim = 1 - 0.35 * (1 - z) ** 2                                            # edges fall off
    rng = np.random.default_rng(seed)
    grain = 1 + (rng.standard_normal((N, N)) * 0.025)
    shade = (0.10 + 0.95 * diff ** 1.15 + fill) * ao * rim * grain
    col = base * shade[..., None] + 255 * spec[..., None] * (0.55 + 0.45 * (1 - is_pent[face]))[..., None]
    seam = np.clip(1 - gap / 0.0045, 0, 1)                                    # stitched groove line
    col = col * (1 - 0.65 * seam[..., None])
    col = np.clip(col, 0, 255)
    alpha = np.clip((1 - r2) * N / 3, 0, 1) * 255                          # soft antialiased edge
    img = np.dstack([col, np.where(inside, alpha, 0)]).astype(np.uint8)
    return Image.fromarray(img, 'RGBA').resize((size, size), Image.LANCZOS)

if __name__ == '__main__':
    render(900, 2).save('ball-classic.png')
    render(900, 2, pent=(14, 82, 44)).save('ball-green.png')
    render(900, 2, pent=(22, 22, 24), accent=(245, 190, 40)).save('ball-gold.png')
    print('done')

def facing_rotation(tilt=(0.18, -0.22, 0.12)):
    """Rotation that puts a pentagon centre straight at the viewer, then tilts a little."""
    z = V[0] / np.linalg.norm(V[0])
    a = np.array([1.0, 0, 0]) if abs(z[0]) < .9 else np.array([0, 1.0, 0])
    x = np.cross(a, z); x /= np.linalg.norm(x); y = np.cross(z, x)
    Rf = np.vstack([x, y, z])          # rows: view x,y,z in ball space  (view (0,0,1) @ Rf = z)
    return rot(*tilt) @ Rf

def render_R(size, ss, R, **kw):
    global rot
    orig = rot
    try:
        rot = lambda *a: R
        return render(size, ss, rotation=(0, 0, 0), **kw)
    finally:
        rot = orig
