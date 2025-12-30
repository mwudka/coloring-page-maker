#!/usr/bin/env -S uv run
# /// script
# dependencies = [
#   "pillow",
# ]
# ///

"""
Ulanzi Stream Deck Profile Generator for Coloring Page Maker

This script generates a Ulanzi Studio profile that configures stream deck
buttons for the 13 stamps, mapping each to hotkeys Ctrl+Alt+Shift+A through M.

Usage:
    uv run generate_ulanzi_profile.py [output_file]

Arguments:
    output_file: Optional path for the generated .ulanziDeckProfile file
                 Default: "Coloring Page Maker.ulanziDeckProfile"
"""

import json
import os
import shutil
import sys
import tempfile
import uuid
import zipfile
from pathlib import Path
from hashlib import md5

try:
    from PIL import Image
except ImportError:
    print("Warning: PIL not available, thumbnails will not be generated", file=sys.stderr)
    Image = None


def get_stamp_images(stamps_dir: Path) -> list[tuple[int, Path]]:
    """Get list of stamp images from the public/stamps directory."""
    stamp_images = []
    for i in range(1, 15):  # 14 stamps total
        # Skip stamp 14 (remove tool)
        if i == 14:
            continue

        img_path = stamps_dir / f"{i}.png"
        if img_path.exists():
            stamp_images.append((i, img_path))
        else:
            print(f"Warning: Missing stamp image: {img_path}", file=sys.stderr)
    return stamp_images


def hash_file(file_path: Path) -> str:
    """Generate MD5 hash of a file for consistent naming."""
    return md5(file_path.read_bytes()).hexdigest()


def create_thumbnail(source_image: Path, output_path: Path, size: int = 80):
    """Create a thumbnail for the stream deck button."""
    if Image is None:
        # If PIL is not available, just copy the original
        shutil.copy2(source_image, output_path)
        return

    img = Image.open(source_image)

    # Convert to RGBA if not already
    if img.mode != 'RGBA':
        img = img.convert('RGBA')

    # Resize maintaining aspect ratio
    img.thumbnail((size, size), Image.Resampling.LANCZOS)

    # Create a new image with transparent background
    thumb = Image.new('RGBA', (size, size), (0, 0, 0, 0))

    # Paste the resized image centered
    offset = ((size - img.width) // 2, (size - img.height) // 2)
    thumb.paste(img, offset, img if img.mode == 'RGBA' else None)

    # Save as PNG
    thumb.save(output_path, 'PNG')


def create_action(stamp_num: int, icon_filename: str, hotkey_letter: str) -> dict:
    """Create an action configuration for a stamp button."""
    return {
        "Action": "com.ulanzi.ulanzideck.system.hotkey",
        "ActionID": str(uuid.uuid4()),
        "ActionParam": {
            "Hotkey": f"Ctrl+Shift+Alt+{hotkey_letter}"
        },
        "LinkedTitle": True,
        "Name": "Hotkey",
        "State": 0,
        "ViewParam": [
            {
                "Icon": f"Images/{icon_filename}",
                "IconDef": "Images/btn_hotkey.png",
                "IconEx": f"Images/{icon_filename}",
                "Text": f"Stamp {stamp_num}"
            }
        ]
    }


def generate_profile(stamps_dir: Path, output_file: Path, device_model: str = "D200H"):
    """Generate a complete Ulanzi Studio profile."""

    # Get stamp images
    stamp_images = get_stamp_images(stamps_dir)
    if not stamp_images:
        raise ValueError(f"No stamp images found in {stamps_dir}")

    # Create temporary directory structure
    with tempfile.TemporaryDirectory() as tmpdir:
        tmpdir = Path(tmpdir)

        # Generate UUIDs for profile structure
        profile_uuid = str(uuid.uuid4())
        page_uuid = str(uuid.uuid4())

        # Create directory structure
        profile_dir = tmpdir / f"{profile_uuid}.ulanziProfile"
        profile_dir.mkdir()

        pages_dir = profile_dir / "Profiles" / page_uuid
        images_dir = pages_dir / "Images"
        images_dir.mkdir(parents=True)

        # Create main manifest
        main_manifest = {
            "Device": {
                "Model": device_model,
                "UUID": "generated"
            },
            "Icon": "icon.png",
            "Name": "Coloring Page Maker",
            "Pages": {
                "Current": page_uuid,
                "Pages": [page_uuid]
            },
            "Version": "2.0"
        }

        with open(profile_dir / "manifest.json", 'w') as f:
            json.dump(main_manifest, f)

        # Create a simple icon for the profile
        if Image is not None:
            icon = Image.new('RGBA', (256, 256), (255, 255, 255, 255))
            icon.save(profile_dir / "icon.png", 'PNG')

        # Generate actions for each stamp
        actions = {}

        # Ulanzi deck layout: typically 5 columns x 3 rows (15 buttons)
        # We'll place the 13 coloring stamps in reading order (excluding stamp 14 remove tool)
        hotkey_letters = 'ABCDEFGHIJKLM'

        for idx, (stamp_num, stamp_path) in enumerate(stamp_images):
            if idx >= 13:  # 13 coloring stamps (stamps 1-13, excluding stamp 14 remove tool)
                break

            # Calculate grid position (col, row) - Ulanzi uses col_row format
            row = idx // 5
            col = idx % 5
            position_key = f"{col}_{row}"

            # Generate unique filename for the icon
            icon_hash = hash_file(stamp_path)
            icon_filename = f"{icon_hash}.png"

            # Copy and create thumbnail
            create_thumbnail(stamp_path, images_dir / icon_filename)

            # Create action
            actions[position_key] = create_action(
                stamp_num,
                icon_filename,
                hotkey_letters[idx]
            )

        # Create page manifest
        page_manifest = {
            "Controllers": [
                {
                    "Actions": actions,
                    "Type": "Keypad"
                },
                {
                    "Actions": {},
                    "Type": "Encoder"
                }
            ],
            "Icon": "",
            "Name": "Main Page"
        }

        with open(pages_dir / "manifest.json", 'w') as f:
            json.dump(page_manifest, f)

        # Create the zip archive with special header
        output_file.parent.mkdir(parents=True, exist_ok=True)

        # Create zip file
        with zipfile.ZipFile(output_file, 'w', zipfile.ZIP_DEFLATED) as zf:
            # Add all files to the zip
            for file_path in profile_dir.rglob('*'):
                if file_path.is_file():
                    arcname = file_path.relative_to(tmpdir)
                    zf.write(file_path, arcname)

        # Prepend the version header (12 bytes)
        # Based on the sample file: "#Version: 2\nPK"
        with open(output_file, 'rb') as f:
            zip_content = f.read()

        with open(output_file, 'wb') as f:
            f.write(b'#Version: 2\n')
            f.write(zip_content)

    print(f"[SUCCESS] Generated Ulanzi profile: {output_file}")
    print(f"[SUCCESS] Configured {len(stamp_images)} stamps with hotkeys Ctrl+Alt+Shift+A-{hotkey_letters[len(stamp_images)-1]}")


def main():
    """Main entry point."""
    # Determine paths
    script_dir = Path(__file__).parent
    stamps_dir = script_dir / "public" / "stamps"

    # Get output file from command line or use default
    if len(sys.argv) > 1:
        output_file = Path(sys.argv[1])
    else:
        # Output to public directory so it gets included in the build
        output_file = script_dir / "public" / "Coloring Page Maker.ulanziDeckProfile"

    # Validate stamps directory
    if not stamps_dir.exists():
        print(f"Error: Stamps directory not found: {stamps_dir}", file=sys.stderr)
        print("Please ensure the stamps are located in public/stamps/", file=sys.stderr)
        sys.exit(1)

    try:
        generate_profile(stamps_dir, output_file)
    except Exception as e:
        print(f"Error generating profile: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
