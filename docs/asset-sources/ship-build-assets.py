"""Builds the destroyer, battleship and aircraft carrier map sprites from the Grok Imagine sources.

Run from the repository root:  python3 docs/asset-sources/ship-build-assets.py
then regenerate the prepared 1x/2x/3x sprites with:  npm run make:prepared-sprites

Every output is written at exactly the 3x (DPR 3) on-map backing size, so the prepared
pipeline only ever downscales (3x is 1:1, 2x and 1x are Lanczos reductions). The hull
lengths in CSS pixels match the visible ship length of the previous sprites, so the ships
keep their on-map size and collision footprint.
"""
import importlib.util
import json
import os

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
OUT = os.path.join(ROOT, 'public', 'images', 'map', 'units')
spec = importlib.util.spec_from_file_location('ship_art_common', os.path.join(HERE, 'ship-art-common.py'))
common = importlib.util.module_from_spec(spec)
spec.loader.exec_module(common)

DENSITY = 3
PAD = 3
# Visible hull length on the map in CSS pixels (measured from the previous sprites:
# visible length / canvas length * NAVAL_RENDER_LENGTH_TILES * TILE_SIZE).
VISIBLE_LENGTH_CSS = {
    'destroyer': 306 / 342 * 3.9 * 32,
    'battleship': 241 / 256 * 6.6 * 32,
    'aircraftCarrier': 243 / 256 * 9.36 * 32,
}
# Battleship (Bismarck-class) barbette ring centres in the bow-right source (x along the hull).
BATTLESHIP_RINGS = {
    'aftOuter': (275.5, 352.0),
    'aftInner': (356.0, 352.0),
    'foreInner': (828.0, 352.0),
    'foreOuter': (910.5, 352.0),
}
DESTROYER_GUN_SOURCE = (1018.0, 352.0)  # centre of the forward gun mount, bow-right source
TURRET_WIDTH_CSS = 11.0
BARREL_LENGTH_CSS = 16.0
BARREL_WIDTH_CSS = 5 / 3


def save(image, name):
    image.save(os.path.join(OUT, name), 'WEBP', lossless=True, quality=100, method=6, exact=False)
    return image.size


def build_hull(key, image, box):
    crop = common.crop_region(image, box, PAD)
    visible = box[2] - box[0]
    target_length = VISIBLE_LENGTH_CSS[key] * DENSITY
    scale = target_length / visible
    down = common.bow_right_to_bow_down(crop)
    out = common.resize_to_height(down, round(down.height * scale))
    origin = (max(0, box[0] - PAD), max(0, box[1] - PAD))
    return out, scale, origin, crop.size


def to_output_point(point, origin, crop_size, scale):
    # bow-right crop coordinates -> bow-down (rotated 90 deg clockwise) output coordinates
    x, y = point[0] - origin[0], point[1] - origin[1]
    return ((crop_size[1] - y) * scale, x * scale)


def main():
    report = {}
    src = lambda name: os.path.join(HERE, name)

    # Destroyer
    image, _ = common.chroma_key(src('ship-destroyer-source.jpg'))
    box = common.largest_bbox(image)
    out, scale, origin, crop_size = build_hull('destroyer', image, box)
    report['destroyer'] = {'size': save(out, 'destroyer_map.webp'),
                           'gunSource': [round(v, 1) for v in to_output_point(DESTROYER_GUN_SOURCE, origin, crop_size, scale)]}

    # Aircraft carrier: mirrored top/bottom so the island sits on the port side and the
    # starboard deck stays free for the four aircraft parking slots, as before.
    image, _ = common.chroma_key(src('ship-aircraft-carrier-source.jpg'))
    image = image.transpose(Image.Transpose.FLIP_TOP_BOTTOM)
    box = common.largest_bbox(image)
    out, scale, origin, crop_size = build_hull('aircraftCarrier', image, box)
    report['aircraftCarrier'] = {'size': save(out, 'aircraft_carrier_map.webp')}

    # Battleship hull
    image, _ = common.chroma_key(src('ship-battleship-hull-source.jpg'))
    box = common.largest_bbox(image)
    out, scale, origin, crop_size = build_hull('battleship', image, box)
    hull_center_x = (box[0] + box[2]) / 2
    css_per_source = scale / DENSITY
    layout = {name: round((cx - hull_center_x) * css_per_source / 32, 3) for name, (cx, _) in BATTLESHIP_RINGS.items()}
    report['battleship'] = {'size': save(out, 'battleship_map.webp'), 'turretLongitudinalTiles': layout}

    # Turret and barrel share one source image: turret on the left, barrel on the right.
    image, _ = common.chroma_key(src('ship-battleship-turret-barrel-source.jpg'), high=70)
    left = image.crop((0, 0, 700, image.height))
    right = image.crop((700, 0, image.width, image.height))
    tbox = common.largest_bbox(left)
    turret = common.crop_region(left, tbox, 1)
    t_scale = TURRET_WIDTH_CSS * DENSITY / turret.width
    turret_out = common.resize_to_height(turret, round(turret.height * t_scale))
    bbox = common.largest_bbox(right)
    barrel = common.crop_region(right, bbox, 1)
    barrel_out = common.resize_to_height(barrel, round(BARREL_LENGTH_CSS * DENSITY))
    barrel_out = barrel_out.resize((max(3, round(BARREL_WIDTH_CSS * DENSITY)), barrel_out.height), Image.Resampling.LANCZOS)
    openings = [397.5, 471.0]
    opening_y = 522.0
    report['battleshipTurret'] = {
        'size': save(turret_out, 'battleship_turret.webp'),
        'barrelOffsetsCss': [round((x - (tbox[0] + tbox[2]) / 2) * t_scale / DENSITY, 2) for x in openings],
        'openingYCss': round((opening_y - (tbox[1] + tbox[3]) / 2) * t_scale / DENSITY, 2),
    }
    report['battleshipBarrel'] = {'size': save(barrel_out, 'battleship_barrel.webp')}
    print(json.dumps(report, indent=2))


if __name__ == '__main__':
    main()
