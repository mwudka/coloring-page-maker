from PIL import Image

# Load the image
img = Image.open("public/stamps/5.png")

print(f"Current size: {img.width}x{img.height} pixels")

# Calculate new dimensions (512 pixels)
ratio = img.width / img.height
new_height = 512
new_width = int(new_height * ratio)

# Resize with high quality
resized_img = img.resize((new_width, new_height), Image.Resampling.LANCZOS)

# Save the resized image (overwrite original)
resized_img.save("public/stamps/5.png", "PNG")

print(f"Resized to: {new_width}x{new_height} pixels")
