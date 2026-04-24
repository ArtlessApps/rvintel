"""Crop and transparentize RVIntel logo PNGs.

- Light logo: already has alpha — trim to bounding box.
- Dark logo: solid navy background — color-key it to alpha, then trim.

Outputs tight PNGs to public/ (overwrites the referenced filenames).
Keeps originals in public/_originals/.
"""
from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageChops

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public"
ORIGINALS = PUBLIC / "_originals"

LIGHT_SRC = ORIGINALS / "RVIntel logo Light.png"
DARK_SRC = ORIGINALS / "RVIntel logo Dark.png"
LIGHT_DST = PUBLIC / "RVIntel logo Light.png"
DARK_DST = PUBLIC / "RVIntel logo Dark.png"

PADDING_RATIO = 0.06  # 6% of cropped height as breathing room around wordmark


def trim_alpha(im: Image.Image) -> Image.Image:
    """Trim fully-transparent borders based on alpha channel."""
    if im.mode != "RGBA":
        im = im.convert("RGBA")
    alpha = im.getchannel("A")
    bbox = alpha.getbbox()
    if bbox is None:
        return im
    return im.crop(bbox)


def add_padding(im: Image.Image, ratio: float) -> Image.Image:
    """Pad with transparent pixels so the wordmark has consistent breathing room."""
    w, h = im.size
    pad = max(1, int(round(h * ratio)))
    new_w = w + pad * 2
    new_h = h + pad * 2
    out = Image.new("RGBA", (new_w, new_h), (0, 0, 0, 0))
    out.paste(im, (pad, pad), im if im.mode == "RGBA" else None)
    return out


def process_light() -> None:
    im = Image.open(LIGHT_SRC).convert("RGBA")
    cropped = trim_alpha(im)
    padded = add_padding(cropped, PADDING_RATIO)
    padded.save(LIGHT_DST, format="PNG", optimize=True)
    print(f"light: {im.size} -> crop {cropped.size} -> padded {padded.size}")


def process_dark() -> None:
    im = Image.open(DARK_SRC).convert("RGB")
    w, h = im.size
    px = im.load()
    assert px is not None

    # Sample the background from the corners (they are solid navy in the source).
    samples = [px[0, 0], px[w - 1, 0], px[0, h - 1], px[w - 1, h - 1]]
    bg = tuple(sum(c[i] for c in samples) // len(samples) for i in range(3))

    # Per-pixel distance from background -> alpha.
    # A pixel that matches bg exactly becomes fully transparent.
    # A pixel far from bg becomes fully opaque.
    # Soft edge: ramp over the first ~25 units of distance for anti-aliased glyph edges.
    rgba = Image.new("RGBA", (w, h))
    src = im.tobytes()  # RGBRGB...
    import array

    out = array.array("B", [0]) * (w * h * 4)
    ramp_lo = 20  # below this distance -> transparent
    ramp_hi = 55  # above this distance -> opaque
    for i in range(w * h):
        r = src[i * 3]
        g = src[i * 3 + 1]
        b = src[i * 3 + 2]
        dr = r - bg[0]
        dg = g - bg[1]
        db = b - bg[2]
        dist2 = dr * dr + dg * dg + db * db
        # Use squared distance compared against squared thresholds.
        if dist2 <= ramp_lo * ramp_lo:
            a = 0
        elif dist2 >= ramp_hi * ramp_hi:
            a = 255
        else:
            # Linear ramp in sqrt space — approximate without sqrt for speed.
            dist = dist2**0.5
            a = int(round((dist - ramp_lo) * 255 / (ramp_hi - ramp_lo)))
            if a < 0:
                a = 0
            elif a > 255:
                a = 255
        out[i * 4] = r
        out[i * 4 + 1] = g
        out[i * 4 + 2] = b
        out[i * 4 + 3] = a

    rgba.frombytes(bytes(out))
    cropped = trim_alpha(rgba)
    padded = add_padding(cropped, PADDING_RATIO)
    padded.save(DARK_DST, format="PNG", optimize=True)
    print(f"dark: {im.size} -> crop {cropped.size} -> padded {padded.size} (bg={bg})")


if __name__ == "__main__":
    process_light()
    process_dark()
