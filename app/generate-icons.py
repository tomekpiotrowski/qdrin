#!/usr/bin/env python3
"""
Generate app icons from scratch using PIL
"""
from PIL import Image, ImageDraw
import math
import os

def create_icon(size):
    """Create a focus timer icon at the specified size"""
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    center = size // 2
    radius = size // 2 - size // 20  # Leave some padding

    # Draw split background (blue left, red right)
    blue = (74, 123, 169)  # #4a7ba9
    red = (199, 68, 64)    # #c74440

    # Draw blue half circle (left)
    draw.pieslice([size//20, size//20, size-size//20, size-size//20],
                  90, 270, fill=blue)

    # Draw red half circle (right)
    draw.pieslice([size//20, size//20, size-size//20, size-size//20],
                  270, 90, fill=red)

    # Draw white inner circle (clock face)
    inner_radius = int(radius * 0.83)
    draw.ellipse([center - inner_radius, center - inner_radius,
                  center + inner_radius, center + inner_radius],
                 fill=(245, 235, 235))  # #f5ebeb

    # Draw clock markers at 12, 3, 6, 9 positions
    marker_len = int(radius * 0.15)
    marker_width = max(2, size // 60)

    # 12 o'clock (top)
    draw.rectangle([center - marker_width, center - inner_radius,
                    center + marker_width, center - inner_radius + marker_len],
                   fill=(42, 74, 106))  # dark blue

    # 6 o'clock (bottom)
    draw.rectangle([center - marker_width, center + inner_radius - marker_len,
                    center + marker_width, center + inner_radius],
                   fill=(182, 63, 59))  # dark red

    # 3 o'clock (right)
    draw.rectangle([center + inner_radius - marker_len, center - marker_width,
                    center + inner_radius, center + marker_width],
                   fill=(199, 68, 64))  # red

    # 9 o'clock (left)
    draw.rectangle([center - inner_radius, center - marker_width,
                    center - inner_radius + marker_len, center + marker_width],
                   fill=(74, 123, 169))  # blue

    # Draw hour hand (pointing right towards 3)
    hand_len = int(inner_radius * 0.4)
    hand_width = max(3, size // 50)
    draw.rectangle([center, center - hand_width,
                    center + hand_len, center + hand_width],
                   fill=(74, 123, 169))  # blue

    # Draw minute hand (pointing up towards 12)
    minute_len = int(inner_radius * 0.65)
    minute_width = max(2, size // 70)
    draw.rectangle([center - minute_width, center - minute_len,
                    center + minute_width, center],
                   fill=(42, 74, 106))  # dark blue

    # Draw center dot
    dot_radius = max(4, size // 40)
    draw.ellipse([center - dot_radius, center - dot_radius,
                  center + dot_radius, center + dot_radius],
                 fill=(42, 74, 106))  # dark blue

    return img

# Create output directory
icons_dir = "src-tauri/icons"
os.makedirs(icons_dir, exist_ok=True)

# Generate all required sizes
sizes = {
    'icon.png': 512,
    '32x32.png': 32,
    '128x128.png': 128,
    '128x128@2x.png': 256,
    'Square30x30Logo.png': 30,
    'Square44x44Logo.png': 44,
    'Square71x71Logo.png': 71,
    'Square89x89Logo.png': 89,
    'Square107x107Logo.png': 107,
    'Square142x142Logo.png': 142,
    'Square150x150Logo.png': 150,
    'Square284x284Logo.png': 284,
    'Square310x310Logo.png': 310,
    'StoreLogo.png': 50,
}

print("Generating icons...")
for filename, size in sizes.items():
    icon = create_icon(size)
    filepath = os.path.join(icons_dir, filename)
    icon.save(filepath, 'PNG')
    print(f"  Created {filepath} ({size}x{size})")

# Generate ICO file (Windows)
print("Generating icon.ico...")
icon_sizes = [16, 32, 48, 64, 128, 256]
icons = [create_icon(s) for s in icon_sizes]
icons[0].save(os.path.join(icons_dir, 'icon.ico'), format='ICO', sizes=[(s, s) for s in icon_sizes])

print("\n✓ All icons generated successfully!")
print(f"  Location: {icons_dir}/")
