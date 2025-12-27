#!/bin/bash

# Generate all icon sizes from SVG
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

SOURCE_SVG="$SCRIPT_DIR/icon-source.svg"
ICONS_DIR="$SCRIPT_DIR/src-tauri/icons"

echo "Generating icons from $SOURCE_SVG..."

# Generate PNG sizes using Inkscape (better quality for SVG)
inkscape "$SOURCE_SVG" -w 32 -h 32 -o "$ICONS_DIR/32x32.png"
inkscape "$SOURCE_SVG" -w 128 -h 128 -o "$ICONS_DIR/128x128.png"
inkscape "$SOURCE_SVG" -w 256 -h 256 -o "$ICONS_DIR/128x128@2x.png"
inkscape "$SOURCE_SVG" -w 512 -h 512 -o "$ICONS_DIR/icon.png"

# Windows Store logos
inkscape "$SOURCE_SVG" -w 30 -h 30 -o "$ICONS_DIR/Square30x30Logo.png"
inkscape "$SOURCE_SVG" -w 44 -h 44 -o "$ICONS_DIR/Square44x44Logo.png"
inkscape "$SOURCE_SVG" -w 71 -h 71 -o "$ICONS_DIR/Square71x71Logo.png"
inkscape "$SOURCE_SVG" -w 89 -h 89 -o "$ICONS_DIR/Square89x89Logo.png"
inkscape "$SOURCE_SVG" -w 107 -h 107 -o "$ICONS_DIR/Square107x107Logo.png"
inkscape "$SOURCE_SVG" -w 142 -h 142 -o "$ICONS_DIR/Square142x142Logo.png"
inkscape "$SOURCE_SVG" -w 150 -h 150 -o "$ICONS_DIR/Square150x150Logo.png"
inkscape "$SOURCE_SVG" -w 284 -h 284 -o "$ICONS_DIR/Square284x284Logo.png"
inkscape "$SOURCE_SVG" -w 310 -h 310 -o "$ICONS_DIR/Square310x310Logo.png"
inkscape "$SOURCE_SVG" -w 50 -h 50 -o "$ICONS_DIR/StoreLogo.png"

# Generate ICO for Windows (using ImageMagick)
convert "$ICONS_DIR/icon.png" -define icon:auto-resize=256,128,96,64,48,32,16 "$ICONS_DIR/icon.ico"

# Generate ICNS for macOS (requires png2icns or iconutil)
if command -v png2icns &> /dev/null; then
    png2icns "$ICONS_DIR/icon.icns" "$ICONS_DIR/icon.png"
elif command -v iconutil &> /dev/null; then
    # macOS only
    mkdir -p icon.iconset
    for size in 16 32 128 256 512; do
        inkscape "$SOURCE_SVG" -w $size -h $size -o "icon.iconset/icon_${size}x${size}.png"
        inkscape "$SOURCE_SVG" -w $((size*2)) -h $((size*2)) -o "icon.iconset/icon_${size}x${size}@2x.png"
    done
    iconutil -c icns icon.iconset -o "$ICONS_DIR/icon.icns"
    rm -rf icon.iconset
else
    echo "Warning: Cannot generate ICNS file. Install png2icns or use macOS iconutil"
fi

echo "Done! All icons generated in $ICONS_DIR"
