# Howitzer sprite build (PzH 2000-style art, turret at the rear, gun pointing forward).
# Source: docs/asset-sources/howitzer-pzh-source.jpg (single top-down Grok Imagine render, front up,
# white background). Keys out the white, cuts the gun tube (muzzle brake -> mantlet) into the barrel
# layer, fills the hull under the tube by diffusion, keeps natural proportions (no stretch) and saves
# public/images/map/units/howitzer_map.webp (front up) + howitzer_barrel.webp (muzzle down).
# Run from the repo root.
from PIL import Image
import numpy as np, json
from scipy import ndimage
SRC = 'docs/asset-sources/howitzer-pzh-source.jpg'
CX = 639.5            # gun axis (source px)
CUT_Y = 345           # barrel layer ends here (top of the mantlet / trunnion = pivot)
HULL_Y0 = 154         # first hull row (stowage bumps)
BASE_H = 240          # source canvas height (>= 2x the 3x prepared hull height)
im = np.asarray(Image.open(SRC).convert('RGB')).astype(float)
H, W, _ = im.shape
d = 255 - im.min(2)
a = np.clip((d - 10) / 35, 0, 1)
solid = ndimage.binary_fill_holes(ndimage.binary_opening(a > 0.5, iterations=1))
lab, n = ndimage.label(solid)
keep = lab == (np.argmax(ndimage.sum(solid, lab, range(1, n + 1))) + 1)
a = np.where(ndimage.binary_erosion(keep, iterations=2), 1.0, np.where(ndimage.binary_dilation(keep, iterations=2), a, 0))
aa = np.clip(a, 0.05, 1)[..., None]
rgb = ((im - (1 - aa) * 255) / aa).clip(0, 255)
# gun tube mask (soft 1px edge): thin tube + brake above y=212, recuperator/cradle sleeve below
yy, xx = np.mgrid[0:H, 0:W]
hw = np.where(yy < 212, 10.0, 15.0)
tube = np.clip(hw + 0.5 - np.abs(xx + 0.5 - CX), 0, 1) * (yy < CUT_Y)
tube[:HULL_Y0] = np.where(np.abs(xx[:HULL_Y0] + 0.5 - CX) < 16, 1, 0)   # above hull: alpha decides
bar_a = a * tube
# hull: remove tube, diffuse-fill colour from neighbours
hull_a = np.where(yy < HULL_Y0, 0, a)
hole = (tube > 0) & (yy >= HULL_Y0) & (hull_a > 0.5)
fill = rgb.copy(); known = ~hole
for _ in range(400):
    blur = ndimage.uniform_filter(fill * known[..., None], (5, 5, 1))
    wgt = ndimage.uniform_filter(known.astype(float), 5)[..., None]
    upd = hole & (wgt[..., 0] > 0.05)
    fill[upd] = (blur / np.maximum(wgt, 1e-6))[upd]
    if _ % 3 == 0: known = known | upd
rng = np.random.default_rng(7)
fill[hole] += rng.normal(0, 4, (hole.sum(), 1))
def rgba(c, al): return Image.fromarray(np.dstack([c, al * 255]).clip(0, 255).astype(np.uint8), 'RGBA')
hull = rgba(fill, hull_a); bar = rgba(rgb, bar_a)
hb = hull.getchannel('A').point(lambda v: 255 if v > 20 else 0).getbbox()
hull = hull.crop(hb); hw_, hh = hull.size
f = BASE_H / hh
hull = hull.resize((round(hw_ * f), BASE_H), Image.LANCZOS)
sq = Image.new('RGBA', (BASE_H, BASE_H), (0, 0, 0, 0)); pad = (BASE_H - hull.width) // 2
sq.alpha_composite(hull, (pad, 0))
bb = bar.getchannel('A').point(lambda v: 255 if v > 20 else 0).getbbox()
bar = bar.crop((bb[0], bb[1], bb[2], CUT_Y))
mount_x_src = CX - hb[0]; mount_y_src = CUT_Y - hb[1]
bar = bar.resize((round(bar.width * f), round(bar.height * f)), Image.LANCZOS).transpose(Image.FLIP_TOP_BOTTOM)
sq.save('public/images/map/units/howitzer_map.webp', lossless=True)
bar.save('public/images/map/units/howitzer_barrel.webp', lossless=True)
bmx = round((CX - bb[0]) * f, 1)
print(json.dumps({'base': sq.size, 'hull_px': hull.size, 'barrel': bar.size,
  'barrelMountSource': [round(pad + mount_x_src * f, 1), round(mount_y_src * f, 1)],
  'mountSource': [bmx, 0], 'muzzleSource': [bmx, bar.height]}))
