"""Generate a Dell wordmark decal texture (transparent PNG) for the R760 bezel.
Baked as a texture/decal — NOT 3D text — per the rebuild spec's branding rule.

Renders "DELL" as a single clean, evenly-spaced bold wordmark on the navy
roundel. (The earlier version rotated the "E" per-letter, which dipped below the
baseline and overlapped the next letter — it read as broken.)

Run with the venv python that has Pillow:
    ./venv/bin/python scripts/generate_dell_logo.py
"""
from PIL import Image, ImageDraw, ImageFont
import os

OUT = os.path.join(os.path.dirname(os.path.dirname(__file__)), "public", "dell_logo.png")

W, H = 512, 512
img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
draw = ImageDraw.Draw(img)

# Navy roundel with a lighter rim.
cx, cy, r = W // 2, H // 2, 235
draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(0, 40, 85, 255))
draw.ellipse([cx - r, cy - r, cx + r, cy + r], outline=(120, 170, 220, 255), width=6)

try:
    font = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial Bold.ttf", 150)
except IOError:
    font = ImageFont.load_default()

# Draw "DELL" as one string with tracking, centred both axes — no per-letter
# transforms, so every glyph (the E included) sits cleanly on the baseline.
text = "DELL"
tracking = 8  # extra px between letters
widths = [draw.textbbox((0, 0), ch, font=font)[2] for ch in text]
total_w = sum(widths) + tracking * (len(text) - 1)

# Vertical centring using the font's ascent/descent for a true optical middle.
ascent, descent = font.getmetrics()
y = cy - (ascent + descent) // 2

x = cx - total_w // 2
for ch, w in zip(text, widths):
    draw.text((x, y), ch, font=font, fill=(255, 255, 255, 255))
    x += w + tracking

img.save(OUT)
print("Wrote", OUT, img.size)
