Add-Type -AssemblyName System.Drawing

$inputFile = "@5.png"
$outputFile = "@5.png"

# Load the image
$img = [System.Drawing.Image]::FromFile((Resolve-Path $inputFile))

Write-Host "Current size: $($img.Width)x$($img.Height) pixels"

# Calculate new dimensions (2 inches at 72 DPI = 144 pixels)
$ratio = $img.Width / $img.Height
$newHeight = 144
$newWidth = [int]($newHeight * $ratio)

# Create new bitmap with high quality settings
$newImg = New-Object System.Drawing.Bitmap($newWidth, $newHeight)
$graphics = [System.Drawing.Graphics]::FromImage($newImg)
$graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
$graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality

# Draw the resized image
$graphics.DrawImage($img, 0, 0, $newWidth, $newHeight)

# Save the new image (overwrite original)
$img.Dispose()
$newImg.Save((Join-Path (Get-Location) $outputFile), [System.Drawing.Imaging.ImageFormat]::Png)

# Clean up
$graphics.Dispose()
$newImg.Dispose()

Write-Host "Resized to: ${newWidth}x${newHeight} pixels (2 inches tall at 72 DPI)"
