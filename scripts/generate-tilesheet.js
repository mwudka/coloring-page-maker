import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const STAMPS_DIR = path.join(__dirname, '../public/stamps');
const OUTPUT_DIR = path.join(__dirname, '../public');
const TILESHEET_PATH = path.join(OUTPUT_DIR, 'tilesheet.png');
const METADATA_PATH = path.join(OUTPUT_DIR, 'tilesheet.json');

async function generateTilesheet() {
  console.log('Generating tilesheet from stamps...');

  // Get all stamp files
  const stampFiles = [];
  for (let i = 1; i <= 13; i++) {
    stampFiles.push(`${i}.png`);
  }

  // Load all images and get their dimensions
  const stamps = [];
  for (const filename of stampFiles) {
    const filepath = path.join(STAMPS_DIR, filename);
    const image = sharp(filepath);
    const metadata = await image.metadata();
    stamps.push({
      filename,
      filepath,
      width: metadata.width,
      height: metadata.height,
      buffer: await image.toBuffer(),
    });
  }

  // Find the maximum dimensions
  const maxWidth = Math.max(...stamps.map(s => s.width));
  const maxHeight = Math.max(...stamps.map(s => s.height));

  // Calculate tilesheet dimensions (arrange in a grid)
  const cols = Math.ceil(Math.sqrt(stamps.length)); // 4 columns for 13 stamps
  const rows = Math.ceil(stamps.length / cols); // 4 rows

  const tilesheetWidth = maxWidth * cols;
  const tilesheetHeight = maxHeight * rows;

  console.log(`Creating ${tilesheetWidth}x${tilesheetHeight} tilesheet (${cols}x${rows} grid)`);

  // Create transparent background
  const background = await sharp({
    create: {
      width: tilesheetWidth,
      height: tilesheetHeight,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    }
  }).png().toBuffer();

  // Prepare composite operations and metadata
  const composites = [];
  const metadata = {
    tileWidth: maxWidth,
    tileHeight: maxHeight,
    cols,
    rows,
    stamps: []
  };

  stamps.forEach((stamp, index) => {
    const col = index % cols;
    const row = Math.floor(index / cols);
    const x = col * maxWidth;
    const y = row * maxHeight;

    composites.push({
      input: stamp.buffer,
      left: x,
      top: y
    });

    metadata.stamps.push({
      id: `stamp${index + 1}`,
      filename: stamp.filename,
      x,
      y,
      width: stamp.width,
      height: stamp.height
    });
  });

  // Composite all stamps onto the tilesheet
  await sharp(background)
    .composite(composites)
    .png()
    .toFile(TILESHEET_PATH);

  // Write metadata
  fs.writeFileSync(METADATA_PATH, JSON.stringify(metadata, null, 2));

  console.log(`✓ Tilesheet saved to ${TILESHEET_PATH}`);
  console.log(`✓ Metadata saved to ${METADATA_PATH}`);
  console.log(`✓ Combined ${stamps.length} stamps into a single ${tilesheetWidth}x${tilesheetHeight} image`);
}

generateTilesheet().catch(err => {
  console.error('Error generating tilesheet:', err);
  process.exit(1);
});
