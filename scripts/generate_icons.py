import os
from PIL import Image, ImageDraw

def create_icon(size, output_path):
    # Create image with transparent background
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    
    # Background rounded rectangle (LinkedIn Blue / Dark Slate tone)
    # Dimensions
    pad = int(size * 0.08)
    corner_radius = int(size * 0.22)
    bg_color = (10, 102, 194, 255) # LinkedIn brand blue #0a66c2
    
    draw.rounded_rectangle(
        [(pad, pad), (size - pad - 1, size - pad - 1)],
        radius=corner_radius,
        fill=bg_color
    )
    
    # Draw a stylized filter / funnel or eye-slash icon
    # Funnel top width, neck, spout in crisp white
    cx = size / 2
    cy = size / 2
    
    # Filter icon geometry
    top_w = size * 0.55
    top_y = size * 0.30
    neck_w = size * 0.16
    neck_y = size * 0.52
    bot_y = size * 0.72
    bot_w = size * 0.16
    
    poly = [
        (cx - top_w / 2, top_y),
        (cx + top_w / 2, top_y),
        (cx + neck_w / 2, neck_y),
        (cx + bot_w / 2, bot_y),
        (cx - bot_w / 2, bot_y),
        (cx - neck_w / 2, neck_y),
    ]
    draw.polygon(poly, fill=(255, 255, 255, 245))
    
    # Subtle accent line or diagonal slash
    slash_color = (255, 75, 75, 255) # Vibrant red slash
    line_w = max(1, int(size * 0.10))
    draw.line(
        [(size * 0.25, size * 0.25), (size * 0.75, size * 0.75)],
        fill=slash_color,
        width=line_w
    )

    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    img.save(output_path, 'PNG')
    print(f"Generated icon: {output_path} ({size}x{size})")

def main():
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    icons_dir = os.path.join(base_dir, 'icons')
    for sz in [16, 48, 128]:
        out = os.path.join(icons_dir, f'icon-{sz}.png')
        create_icon(sz, out)

if __name__ == '__main__':
    main()
