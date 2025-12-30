#!/usr/bin/env -S uv run
# /// script
# requires-python = ">=3.11"
# dependencies = [
#     "google-genai",
#     "python-dotenv",
#     "pillow",
# ]
# ///

"""
Generate new coloring page stamps using Google's Gemini API.

Usage:
    python generate_stamp.py <stamp_number>
    ./generate_stamp.py <stamp_number>  # On Unix-like systems

Example:
    python generate_stamp.py 7
"""

import argparse
import os
import subprocess
import sys
from pathlib import Path

from dotenv import load_dotenv
from google import genai
from google.genai import types
from PIL import Image
import io


# System prompt for coloring book style
COLORING_BOOK_SYSTEM_PROMPT = """You are an expert at creating simple, child-friendly coloring book images.

Generate a SQUARE image (1:1 aspect ratio) with these characteristics:
- Simple, bold black outlines
- Clear, defined shapes suitable for coloring
- White fill areas inside the outlines (for coloring)
- Magenta (#C51F8A or similar) background color
- No shading or gradients inside the coloring areas
- Cute, friendly, and appealing to children
- Single subject, centered in the frame
- Clean, professional coloring book style
- Square format (equal width and height)

The image should be perfect for printing and coloring with crayons or markers."""


def load_api_key() -> str:
    """Load API key from .env file."""
    load_dotenv()
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        print("Error: GEMINI_API_KEY not found in .env file", file=sys.stderr)
        print("Please create a .env file with your API key:", file=sys.stderr)
        print("  GEMINI_API_KEY=your_api_key_here", file=sys.stderr)
        sys.exit(1)
    return api_key


def generate_image(prompt: str, api_key: str) -> Image.Image:
    """Generate an image using Gemini API."""
    client = genai.Client(api_key=api_key)

    # Combine system prompt with user prompt
    full_prompt = f"{COLORING_BOOK_SYSTEM_PROMPT}\n\nUser request: {prompt}"

    print(f"Generating image with prompt: {prompt}")
    print("Please wait...")

    try:
        # Use Gemini Nano Banana Pro (Gemini 3 Pro Image Preview)
        contents = [
            types.Content(
                role="user",
                parts=[
                    types.Part.from_text(text=full_prompt),
                ],
            ),
        ]

        generate_content_config = types.GenerateContentConfig(
            response_modalities=["IMAGE", "TEXT"],
            image_config=types.ImageConfig(
                aspect_ratio="1:1",
                image_size="1K",
            ),
        )

        image_data = None
        for chunk in client.models.generate_content_stream(
            model="gemini-3-pro-image-preview",
            contents=contents,
            config=generate_content_config,
        ):
            if (
                chunk.candidates is None
                or chunk.candidates[0].content is None
                or chunk.candidates[0].content.parts is None
            ):
                continue

            # Check for image data
            if (chunk.candidates[0].content.parts[0].inline_data and
                chunk.candidates[0].content.parts[0].inline_data.data):
                inline_data = chunk.candidates[0].content.parts[0].inline_data
                image_data = inline_data.data
                print("✓ Image received")
            elif chunk.text:
                print(f"Model: {chunk.text}")

        if image_data is None:
            print("Error: No image generated in response", file=sys.stderr)
            sys.exit(1)

        # Convert binary data to PIL Image
        return Image.open(io.BytesIO(image_data))

    except Exception as e:
        print(f"Error generating image: {e}", file=sys.stderr)
        sys.exit(1)


def resize_to_1024(image: Image.Image) -> Image.Image:
    """Resize image to 1024x1024 if needed."""
    if image.size != (1024, 1024):
        print(f"Resizing from {image.size[0]}x{image.size[1]} to 1024x1024")
        return image.resize((1024, 1024), Image.Resampling.LANCZOS)
    return image


def save_stamp(image: Image.Image, stamp_number: int) -> Path:
    """Save image as a stamp and resize to 512x512."""
    # First resize to 1024x1024 if needed
    image = resize_to_1024(image)

    # Then resize to 512x512 (standard stamp size)
    print("Resizing to 512x512 for stamp...")
    resized = image.resize((512, 512), Image.Resampling.LANCZOS)

    # Ensure RGBA mode for PNG with transparency support
    if resized.mode != 'RGBA':
        resized = resized.convert('RGBA')

    # Save to stamps directory
    stamp_path = Path(f"public/stamps/{stamp_number}.png")
    stamp_path.parent.mkdir(parents=True, exist_ok=True)
    resized.save(stamp_path, "PNG")

    print(f"✓ Saved stamp to {stamp_path}")
    return stamp_path


def rebuild_assets():
    """Rebuild tilesheet and Ulanzi profile."""
    print("\nRebuilding assets...")

    try:
        # Generate tilesheet
        result = subprocess.run(
            ["npm", "run", "generate-tilesheet"],
            capture_output=True,
            text=True,
            check=True,
            shell=True  # Required for Windows
        )
        print(result.stdout)

        # Generate Ulanzi profile
        result = subprocess.run(
            ["npm", "run", "generate-streamdeck"],
            capture_output=True,
            text=True,
            check=True,
            shell=True  # Required for Windows
        )
        print(result.stdout)

        print("✓ Assets rebuilt successfully")

    except subprocess.CalledProcessError as e:
        print(f"Error rebuilding assets: {e}", file=sys.stderr)
        print(e.stderr, file=sys.stderr)
        sys.exit(1)


def main():
    parser = argparse.ArgumentParser(
        description="Generate a new coloring page stamp using Gemini API"
    )
    parser.add_argument(
        "stamp_number",
        type=int,
        help="Stamp number (e.g., 4, 7, 13)"
    )

    args = parser.parse_args()

    # Validate stamp number
    if args.stamp_number < 1:
        print("Error: Stamp number must be positive", file=sys.stderr)
        sys.exit(1)

    # Load API key
    api_key = load_api_key()

    # Interactive chat interface
    print(f"\n=== Stamp Generator for Stamp #{args.stamp_number} ===")
    print("Enter your prompt for the coloring page image.")
    print("(The system will automatically apply coloring book styling)\n")

    try:
        prompt = input("Prompt: ").strip()
        if not prompt:
            print("Error: Prompt cannot be empty", file=sys.stderr)
            sys.exit(1)

        # Generate image
        image = generate_image(prompt, api_key)

        # Save stamp
        save_stamp(image, args.stamp_number)

        # Rebuild assets
        rebuild_assets()

        print(f"\n✓ Stamp #{args.stamp_number} generated successfully!")

    except KeyboardInterrupt:
        print("\n\nCancelled by user")
        sys.exit(0)
    except EOFError:
        print("\nError: No input received", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
