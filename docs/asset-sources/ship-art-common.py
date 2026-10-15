"""Shared helpers for the ship art overhaul (destroyer, battleship, aircraft carrier).

The Grok Imagine sources are 1280x720 JPEGs on a flat blue background with the ship
horizontal and the bow pointing right. These helpers remove the blue background with a
soft chroma key (un-mixing the background colour from edge pixels so no blue fringe
remains), crop to the visible ship, and rotate losslessly so the bow points down
(south), which is the orientation the in-game renderers expect.
"""
import numpy as np
from PIL import Image


def chroma_key(path, low=18.0, high=80.0):
    rgb = np.asarray(Image.open(path).convert('RGB')).astype(np.float32)
    h, w, _ = rgb.shape
    border = np.concatenate([rgb[:8].reshape(-1, 3), rgb[-8:].reshape(-1, 3),
                             rgb[:, :8].reshape(-1, 3), rgb[:, -8:].reshape(-1, 3)])
    bg = np.median(border, axis=0)
    blueness = rgb[..., 2] - np.maximum(rgb[..., 0], rgb[..., 1])
    alpha = np.clip((high - blueness) / (high - low), 0.0, 1.0)
    # Un-mix the background from partially transparent edge pixels.
    safe = np.maximum(alpha, 1e-3)[..., None]
    color = (rgb - (1.0 - alpha[..., None]) * bg) / safe
    color = np.clip(color, 0, 255)
    # Residual despill: blue may never exceed the brighter of red/green by more than a little.
    color[..., 2] = np.minimum(color[..., 2], np.maximum(color[..., 0], color[..., 1]) + 6)
    alpha[alpha < 0.04] = 0
    out = np.dstack([color, alpha * 255.0]).round().astype(np.uint8)
    return Image.fromarray(out, 'RGBA'), bg


def largest_bbox(image, min_alpha=128):
    a = np.asarray(image)[..., 3]
    ys, xs = np.nonzero(a >= min_alpha)
    return int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1


def crop_region(image, box, pad=2):
    x0, y0, x1, y1 = box
    return image.crop((max(0, x0 - pad), max(0, y0 - pad), min(image.width, x1 + pad), min(image.height, y1 + pad)))


def bow_right_to_bow_down(image):
    return image.transpose(Image.Transpose.ROTATE_270)


def resize_to_height(image, height):
    width = max(1, round(image.width * height / image.height))
    # Premultiply so transparent edge colour does not bleed into the ship outline.
    arr = np.asarray(image).astype(np.float32)
    a = arr[..., 3:4] / 255.0
    pm = Image.fromarray(np.dstack([arr[..., :3] * a, arr[..., 3:]]).round().astype(np.uint8), 'RGBA')
    pm = pm.resize((width, height), Image.Resampling.LANCZOS)
    out = np.asarray(pm).astype(np.float32)
    a2 = np.maximum(out[..., 3:4] / 255.0, 1e-3)
    rgb = np.clip(out[..., :3] / a2, 0, 255)
    rgb[out[..., 3] == 0] = 0
    return Image.fromarray(np.dstack([rgb, out[..., 3:]]).round().astype(np.uint8), 'RGBA')
