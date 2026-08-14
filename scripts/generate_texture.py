from PIL import Image, ImageDraw, ImageFont

def create_branding_texture():
    # Create a 1024x256 image (4:1 aspect ratio)
    width, height = 1024, 256
    img = Image.new('RGB', (width, height), color=(60, 60, 62))
    
    draw = ImageDraw.Draw(img)
    
    # Try to load a font, otherwise use default
    try:
        font_large = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 100)
    except IOError:
        font_large = ImageFont.load_default()
        
    # Background is black for the strip
    draw.rectangle([0, 0, width, height], fill=(15, 15, 15))
    
    # Try to paste the actual NVIDIA logo we downloaded
    try:
        nvidia_logo = Image.open("nvidia_logo.png").convert("RGBA")
        logo_w, logo_h = nvidia_logo.size
        target_h = 120
        target_w = int(logo_w * (target_h / logo_h))
        nvidia_logo = nvidia_logo.resize((target_w, target_h), Image.Resampling.LANCZOS)
        img.paste(nvidia_logo, (width - target_w - 60, (height - target_h) // 2), nvidia_logo)
    except Exception as e:
        # Fallback if logo fails
        draw.text((width - 400, 70), "NVIDIA", font=font_large, fill=(255, 255, 255))
        
    # Draw 'A100' on the left side
    draw.text((80, 70), "A100", font=font_large, fill=(200, 180, 150)) # Gold-ish text
    
    img.save("public/branding.png")
    print("Created public/branding.png")

if __name__ == "__main__":
    create_branding_texture()
