# Stamp Images

Place 13 stamp images in this directory with the following filenames:

- `1.png`
- `2.png`
- `3.png`
- `4.png`
- `5.png`
- `6.png`
- `7.png`
- `8.png`
- `9.png`
- `10.png`
- `11.png`
- `12.png`
- `13.png`

## Image Requirements

- **Format**: PNG files (recommended for transparency support)
- **Background**: The upper-left pixel color will be automatically treated as transparent
- **Size**: Any size (images will be automatically scaled)
- **Content**: Line art or coloring page suitable images work best

## Background Removal

The application automatically removes backgrounds by:
1. Detecting the color of the upper-left pixel
2. Making all similar colors transparent (with a tolerance of 30 RGB units)

For best results, ensure your images have a solid background color in the upper-left corner.
