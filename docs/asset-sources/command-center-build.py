"""Reproducible post-processing for the Command Center and perk badge art.

Run from the repository root: python3 docs/asset-sources/command-center-build.py
Needs Pillow, numpy and scipy. Inputs are the generated source images in
docs/asset-sources/command-center/. Provenance: docs/asset-sources/command-center-art-prompts.md.
"""
from PIL import Image, ImageDraw, ImageFilter
import numpy as np
from scipy import ndimage as ndi

SRC = 'docs/asset-sources/command-center'

A = ['cc.unit.start', 'cc.unit.if.own', 'cc.unit.if.world', 'cc.unit.if.sensing', 'cc.unit.do.service', 'cc.unit.do.combat', 'cc.unit.do.movement', 'cc.unit.do.air',
     'cc.base.start', 'cc.base.if.economy', 'cc.base.if.census', 'cc.base.if.enemies', 'cc.base.do.economy', 'cc.base.do.support', 'cc.base.do.production', 'cc.base.do.defence']
B = ['cc.def.start', 'cc.def.if.sensing', 'cc.def.if.own', 'cc.def.if.world', 'cc.def.do.discipline', 'cc.def.do.engage', 'cc.def.do.lock', 'cc.def.do.manual',
     'cc.prod.start', 'cc.prod.if.economy', 'cc.prod.if.census', 'cc.prod.if.losses', 'cc.prod.if.enemies', 'cc.prod.do.ground', 'cc.prod.do.support', None]
C = ['cc.prod.do.air', 'cc.prod.do.naval', 'cc.def.capstone', 'cc.prod.do.orders']
SHEETS = [('perk-badges-sheet-a.webp', A, 4), ('perk-badges-sheet-b.webp', B, 4), ('perk-badges-sheet-c.webp', C, 2)]


def map_sprite():
    a = np.asarray(Image.open(f'{SRC}/command-center-map-source.webp').convert('RGB')).astype(float)
    bg = np.median(np.concatenate([a[:20, :20].reshape(-1, 3), a[-20:, -20:].reshape(-1, 3)]), axis=0)
    d = np.sqrt(((a - bg) ** 2).sum(-1))
    alpha = np.clip((d - 40) / 50, 0, 1)
    mag = (a[..., 0] + a[..., 2]) / 2 - a[..., 1]
    alpha = np.where((mag > 70) & (d < 120), np.minimum(alpha, np.clip((140 - mag) / 70, 0, 1)), alpha)
    rgb = a.copy()
    lim = rgb[..., 1] + 25
    rgb[..., 0] = np.minimum(rgb[..., 0], np.maximum(lim, rgb[..., 0] * (1 - alpha) + lim * alpha))
    rgb[..., 2] = np.minimum(rgb[..., 2], np.maximum(lim, rgb[..., 2] * (1 - alpha) + lim * alpha))
    out = Image.fromarray(np.dstack([rgb, alpha * 255]).astype(np.uint8), 'RGBA')
    crop = out.crop(out.getbbox())
    w, h = crop.size
    size = max(w, h)
    square = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    square.alpha_composite(crop, ((size - w) // 2, (size - h) // 2))
    final = np.asarray(square.resize((384, 384), Image.LANCZOS)).astype(int).copy()
    fringe = (final[..., 3] > 30) & (final[..., 0] - final[..., 1] > 50) & (final[..., 2] - final[..., 1] > 40)
    grey = final[..., :3].mean(-1)
    for channel in range(3):
        final[fringe, channel] = grey[fringe]
    Image.fromarray(final.astype(np.uint8), 'RGBA').save('public/images/map/buildings/command_center.webp', 'WEBP', quality=85, alpha_quality=100, method=6)


def sidebar():
    Image.open(f'{SRC}/command-center-sidebar-source.webp').convert('RGB').resize((256, 256), Image.LANCZOS) \
        .save('public/images/sidebar/command_center.webp', 'WEBP', quality=85, method=6)


def badges():
    for name, ids, n in SHEETS:
        a = np.asarray(Image.open(f'{SRC}/{name}').convert('RGB')).astype(float)
        height, width, _ = a.shape
        bg = np.median(a[:8, :8].reshape(-1, 3), axis=0)
        for index, perk_id in enumerate(ids):
            if perk_id is None:
                continue
            row, col = divmod(index, n)
            x0, y0 = int(col * width / n), int(row * height / n)
            cell = a[y0:int(y0 + height / n), x0:int(x0 + width / n)]
            d = np.sqrt(((cell - bg) ** 2).sum(-1))
            mask = ndi.binary_opening(d > 20, iterations=1)
            labels, count = ndi.label(mask)
            sizes = ndi.sum(mask, labels, range(1, count + 1))
            keep = np.zeros_like(mask)
            for j, sl in enumerate(ndi.find_objects(labels)):
                if sizes[j] >= 150 and sl[0].stop - sl[0].start >= 0.12 * cell.shape[0]:
                    keep |= labels == j + 1  # skips the printed cell numbers
            ys, xs = np.where(keep)
            cx, cy = (xs.min() + xs.max()) / 2, (ys.min() + ys.max()) / 2
            radius = max(xs.max() - xs.min(), ys.max() - ys.min()) / 2 + 2
            bx, by, size = int(round(cx - radius)), int(round(cy - radius)), int(round(2 * radius))
            sub = d[max(0, by):by + size, max(0, bx):bx + size]
            labels, _ = ndi.label(sub < 22)
            border = set(np.unique(np.concatenate([labels[0], labels[-1], labels[:, 0], labels[:, -1]]))) - {0}
            outside = np.isin(labels, list(border))
            yy, xx = np.mgrid[0:sub.shape[0], 0:sub.shape[1]]
            circle = ((xx - (cx - max(0, bx))) ** 2 + (yy - (cy - max(0, by))) ** 2) <= radius * radius
            alpha = Image.fromarray(((circle & ~outside) * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.7))
            crop = Image.fromarray(cell.astype(np.uint8)).crop((bx, by, bx + size, by + size)).convert('RGBA')
            full_alpha = Image.new('L', crop.size, 0)
            full_alpha.paste(alpha, (max(0, bx) - bx, max(0, by) - by))
            crop.putalpha(full_alpha)
            crop.resize((256, 256), Image.LANCZOS).save(f'public/images/perks/{perk_id}.webp', 'WEBP', quality=85, alpha_quality=100, method=6)


if __name__ == '__main__':
    map_sprite()
    sidebar()
    badges()
