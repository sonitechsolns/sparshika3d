"""Generate a Dell wordmark decal texture (transparent PNG) for the R760 bezel.
Baked as a texture/decal — NOT 3D text — per the rebuild spec's branding rule.
Run with the venv python that has Pillow: ./venv/bin/python scripts/generate_dell_logo.py
"""
from PIL import Image, ImageDraw, ImageFont
import os

OUT = os.path.join(os.path.dirname(os.path.dirname(__file__)), "public", "dell_logo.png")

W, H = 512, 512
img = Image.new("RGBA", (W, H), (0, 0, 0, 0))

# Dell's roundel: dark navy circle with white wordmark.
draw = ImageDraw.Draw(img)
cx, cy, r = W // 2, H // 2, 235
draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(0, 40, 85, 255))          # navy disc
draw.ellipse([cx - r, cy - r, cx + r, cy + r], outline=(120, 170, 220, 255), width=6)

font_path = "/System/Library/Fonts/Supplemental/Arial Bold.ttf"
try:
    font = ImageFont.truetype(font_path, 150)
except IOError:
    font = ImageFont.load_default()

# Draw D E L L, with the E tilted ~ -18deg (Dell's signature).
letters = ["D", "E", "L", "L"]
# measure widths
widths = [draw.textbbox((0, 0), ch, font=font)[2] for ch in letters]
gap = 6
total = sum(widths) + gap * (len(letters) - 1)
x = cx - total // 2
baseline_y = cy - 95
for ch, w in zip(letters, widths):
    if ch == "E":
        # render tilted E on its own layer, then paste
        tile = Image.new("RGBA", (w + 40, 220), (0, 0, 0, 0))
        ImageDraw.Draw(tile).text((20, 0), ch, font=font, fill=(255, 255, 255, 255))
        tile = tile.rotate(18, expand=True, resample=Image.BICUBIC)
        img.alpha_composite(tile, (x - 20, baseline_y - 12))
    else:
        draw.text((x, baseline_y), ch, font=font, fill=(255, 255, 255, 255))
    x += w + gap

img.save(OUT)
print("Wrote", OUT, img.size)
