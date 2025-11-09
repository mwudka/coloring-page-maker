# Ulanzi Profile Generator

This directory contains a standalone Python script that generates Ulanzi Stream Deck profiles for the Coloring Page Maker application.

## Features

- Automatically generates a `.ulanziDeckProfile` file from stamp images
- Configures 13 buttons (one per stamp)
- Maps each button to hotkeys `Ctrl+Alt+Shift+A` through `Ctrl+Alt+Shift+M`
- Uses stamp images as button icons with automatic thumbnail generation

## Requirements

- Python 3.11+ (recommended to run with `uv`)
- Stamp images in `public/stamps/` (named `1.png` through `13.png`)

## Usage

### With uv (recommended):

```bash
uv run generate_ulanzi_profile.py
```

### With standard Python:

```bash
pip install pillow
python generate_ulanzi_profile.py
```

### Custom output location:

```bash
uv run generate_ulanzi_profile.py "path/to/output/MyProfile.ulanziDeckProfile"
```

## Output

The script generates a file named `Coloring Page Maker.ulanziDeckProfile` (by default) that can be imported into Ulanzi Studio.

## Button Layout

The 13 stamps are arranged in a grid layout (5 columns × 3 rows):

```
┌────┬────┬────┬────┬────┐
│ A  │ B  │ C  │ D  │ E  │  Row 0
├────┼────┼────┼────┼────┤
│ F  │ G  │ H  │ I  │ J  │  Row 1
├────┼────┼────┼────┼────┤
│ K  │ L  │ M  │    │    │  Row 2
└────┴────┴────┴────┴────┘
```

Each button triggers `Ctrl+Alt+Shift+[Letter]`

## Hotkey Configuration

The Coloring Page Maker web app now automatically supports these keyboard shortcuts! When you press a Stream Deck button, it will select the corresponding stamp in the application.

Keyboard shortcuts are handled in `src/main.ts` in the `setupKeyboardShortcuts()` method.

## File Structure

The generated profile follows the Ulanzi Studio format:

```
{uuid}.ulanziProfile/
├── manifest.json           # Main profile manifest
├── icon.png               # Profile icon
└── Profiles/
    └── {page-uuid}/
        ├── manifest.json  # Page configuration with actions
        └── Images/        # Button icons (thumbnails)
            ├── {hash1}.png
            ├── {hash2}.png
            └── ...
```

## Troubleshooting

**Missing stamp images:**
- Ensure all 13 stamp images (`1.png` through `13.png`) exist in `public/stamps/`
- The script will warn about missing images but continue with available ones

**PIL/Pillow not available:**
- The script will work without PIL but thumbnails may not be optimally sized
- Install with: `pip install pillow` or use `uv run` (which handles dependencies automatically)

**Profile doesn't import:**
- Make sure you're using a compatible Ulanzi device (tested with D200H)
- Check that the file has the `.ulanziDeckProfile` extension
