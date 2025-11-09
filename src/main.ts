import './style.css';
import { jsPDF } from 'jspdf';

interface Stamp {
  id: string;
  name: string;
  size: number;
  image: HTMLImageElement;
  thumbnail: HTMLCanvasElement | null;
  processedImage: HTMLCanvasElement | null; // Cached background-removed image
}

interface PlacedStamp {
  stamp: Stamp;
  x: number;
  y: number;
  sizeMultiplier: number; // Random size variation (0.6 to 1.4)
}

class ColoringPageMaker {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private stamps: Stamp[];
  private selectedStamp: Stamp | null = null;
  private placedStamps: PlacedStamp[] = [];
  private previewPosition: { x: number; y: number } | null = null;
  private audioContext: AudioContext;
  private rainbowProgress: number = 0; // 0 to 100 (current animated value)
  private rainbowTargetProgress: number = 0; // 0 to 100 (target value)
  private starburstParticles: Array<{ x: number; y: number; vx: number; vy: number; life: number }> = [];
  private isRainbowAnimating: boolean = false;
  private isStarburstAnimating: boolean = false;
  private currentSizeMultiplier: number = 1.0; // Random size variation for next stamp placement

  constructor() {
    this.canvas = document.getElementById('canvas') as HTMLCanvasElement;
    this.ctx = this.canvas.getContext('2d')!;
    this.audioContext = new AudioContext();
    this.stamps = [];

    // Set canvas size to 8.5x11 aspect ratio
    this.canvas.width = 680;
    this.canvas.height = 880;

    this.setupCanvasEvents();
    this.setupPrintButton();
    this.setupKeyboardShortcuts();
    this.initialize();
  }

  private async initialize(): Promise<void> {
    await this.loadStamps();
    this.initializeStampList();
    this.render();
  }

  private async loadStamps(): Promise<void> {
    // Load tilesheet metadata
    const metadataResponse = await fetch(`${import.meta.env.BASE_URL}tilesheet.json`);
    const metadata = await metadataResponse.json();

    // Load tilesheet image
    const tilesheetImg = new Image();
    const tilesheetLoadPromise = new Promise<HTMLImageElement>((resolve, reject) => {
      tilesheetImg.onload = () => resolve(tilesheetImg);
      tilesheetImg.onerror = reject;
    });
    tilesheetImg.src = `${import.meta.env.BASE_URL}tilesheet.png`;
    await tilesheetLoadPromise;

    // Extract each stamp from the tilesheet
    const stamps = [];
    for (const stampMeta of metadata.stamps) {
      // Extract the stamp region from the tilesheet
      const extractCanvas = document.createElement('canvas');
      extractCanvas.width = stampMeta.width;
      extractCanvas.height = stampMeta.height;
      const extractCtx = extractCanvas.getContext('2d')!;
      extractCtx.drawImage(
        tilesheetImg,
        stampMeta.x, stampMeta.y, stampMeta.width, stampMeta.height,
        0, 0, stampMeta.width, stampMeta.height
      );

      // Convert canvas to image for compatibility with existing code
      const img = new Image();
      const imgLoadPromise = new Promise<HTMLImageElement>((resolve, reject) => {
        img.onload = () => resolve(img);
        img.onerror = reject;
      });
      img.src = extractCanvas.toDataURL();
      await imgLoadPromise;

      // Trim 50px from all sides to remove borders/margins
      const trimmedImage = this.trimImage(img, 50);

      // Process image (remove background)
      const processedImage = this.removeBackground(trimmedImage);

      // Generate thumbnail from processed image
      const thumbnail = this.generateThumbnail(processedImage);

      // Use the maximum dimension of the processed image as the size
      const size = Math.max(processedImage.width, processedImage.height);

      stamps.push({
        id: stampMeta.id,
        name: stampMeta.filename.replace('.png', ''),
        size: size,
        image: img,
        thumbnail,
        processedImage,
      });
    }

    this.stamps = stamps;
  }

  private trimImage(img: HTMLImageElement, trim: number): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    const trimmedWidth = Math.max(1, img.width - trim * 2);
    const trimmedHeight = Math.max(1, img.height - trim * 2);

    canvas.width = trimmedWidth;
    canvas.height = trimmedHeight;
    const ctx = canvas.getContext('2d')!;

    // Draw the trimmed portion of the image
    ctx.drawImage(
      img,
      trim, trim, trimmedWidth, trimmedHeight,  // Source rectangle
      0, 0, trimmedWidth, trimmedHeight          // Destination rectangle
    );

    return canvas;
  }

  private generateThumbnail(processedImage: HTMLCanvasElement): HTMLCanvasElement {
    const thumbnailSize = 80; // Match the CSS stamp-item size
    const canvas = document.createElement('canvas');
    canvas.width = thumbnailSize;
    canvas.height = thumbnailSize;
    const ctx = canvas.getContext('2d')!;

    // Enable high-quality image smoothing
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    // Calculate scaling to fit image in thumbnail
    const scale = Math.min(
      thumbnailSize / processedImage.width,
      thumbnailSize / processedImage.height
    );
    const scaledWidth = processedImage.width * scale;
    const scaledHeight = processedImage.height * scale;
    const x = (thumbnailSize - scaledWidth) / 2;
    const y = (thumbnailSize - scaledHeight) / 2;

    // Draw image centered in thumbnail
    ctx.drawImage(processedImage, x, y, scaledWidth, scaledHeight);

    return canvas;
  }

  private removeBackground(sourceCanvas: HTMLCanvasElement): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = sourceCanvas.width;
    canvas.height = sourceCanvas.height;
    const ctx = canvas.getContext('2d')!;

    // Enable high-quality rendering
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    // Draw the source canvas
    ctx.drawImage(sourceCanvas, 0, 0);

    // Get image data
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;

    // Sample background color from corners (in case of compression artifacts)
    const corners = [
      0, // top-left
      (canvas.width - 1) * 4, // top-right
      (canvas.height - 1) * canvas.width * 4, // bottom-left
      ((canvas.height - 1) * canvas.width + (canvas.width - 1)) * 4, // bottom-right
    ];

    // Calculate average background color from corners
    let bgR = 0, bgG = 0, bgB = 0;
    for (const corner of corners) {
      bgR += data[corner];
      bgG += data[corner + 1];
      bgB += data[corner + 2];
    }
    bgR = Math.round(bgR / corners.length);
    bgG = Math.round(bgG / corners.length);
    bgB = Math.round(bgB / corners.length);

    // Increased tolerance for better background removal (especially with JPEGs)
    const tolerance = 85;

    // Make all pixels that match the background color transparent
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];

      // Calculate color distance (Euclidean distance in RGB space)
      const distance = Math.sqrt(
        Math.pow(r - bgR, 2) +
        Math.pow(g - bgG, 2) +
        Math.pow(b - bgB, 2)
      );

      // Make transparent if close to background color
      if (distance <= tolerance) {
        data[i + 3] = 0; // Set alpha to 0 (transparent)
      }
    }

    // Put the modified image data back
    ctx.putImageData(imageData, 0, 0);

    return canvas;
  }

  private initializeStampList(): void {
    const stampList = document.getElementById('stampList')!;

    this.stamps.forEach((stamp) => {
      const stampElement = document.createElement('div');
      stampElement.className = 'stamp-item';

      // Use the pre-generated thumbnail
      if (stamp.thumbnail) {
        stampElement.appendChild(stamp.thumbnail);
      }

      stampElement.addEventListener('click', () => this.selectStamp(stamp));
      stampList.appendChild(stampElement);
    });
  }

  private selectStamp(stamp: Stamp): void {
    this.selectedStamp = stamp;

    // Update UI to show selected stamp
    const stampElements = document.querySelectorAll('.stamp-item');
    stampElements.forEach((el, index) => {
      if (this.stamps[index] === stamp) {
        el.classList.add('selected');
      } else {
        el.classList.remove('selected');
      }
    });
  }

  private setupCanvasEvents(): void {
    this.canvas.addEventListener('mousemove', (e) => {
      if (this.selectedStamp) {
        const rect = this.canvas.getBoundingClientRect();
        this.previewPosition = {
          x: e.clientX - rect.left,
          y: e.clientY - rect.top,
        };
        this.render();
      }
    });

    this.canvas.addEventListener('mouseleave', () => {
      this.previewPosition = null;
      this.render();
    });

    this.canvas.addEventListener('click', () => {
      if (this.selectedStamp && this.previewPosition) {
        // Remove any overlapping stamps before placing new one
        const removedCount = this.removeOverlappingStamps(
          this.previewPosition.x,
          this.previewPosition.y
        );

        this.placedStamps.push({
          stamp: this.selectedStamp,
          x: this.previewPosition.x,
          y: this.previewPosition.y,
          sizeMultiplier: this.currentSizeMultiplier,
        });

        // Play a silly sound
        this.playSillySound();

        // Randomize size for next placement (+/- 40%)
        // Range: 0.6 to 1.4 (60% to 140% of original)
        this.currentSizeMultiplier = 0.6 + Math.random() * 0.8;

        // Only increment rainbow if no stamps were removed (not replacing)
        if (removedCount === 0) {
          // Increment rainbow target progress by 10%
          const wasComplete = this.rainbowTargetProgress >= 100;
          this.rainbowTargetProgress = Math.min(100, this.rainbowTargetProgress + 10);

          // Start animating if not already
          if (!this.isRainbowAnimating) {
            this.isRainbowAnimating = true;
            this.animateRainbowProgress();
          }

          // Trigger celebration when reaching 100%
          if (!wasComplete && this.rainbowTargetProgress >= 100) {
            // Delay celebration until animation completes
            this.scheduleCelebration();
          }
        }

        this.render();
      }
    });
  }

  private setupPrintButton(): void {
    const printButton = document.getElementById('printButton');
    if (printButton) {
      printButton.addEventListener('click', () => this.generatePDF());
    }
  }

  private setupKeyboardShortcuts(): void {
    document.addEventListener('keydown', (e) => {
      // Check for Ctrl+Alt+Shift+[A-M] hotkeys
      if (e.ctrlKey && e.altKey && e.shiftKey) {
        const key = e.key.toUpperCase();
        const hotkeys = 'ABCDEFGHIJKLM';
        const index = hotkeys.indexOf(key);

        if (index >= 0 && index < this.stamps.length) {
          e.preventDefault();
          this.selectStamp(this.stamps[index]);
          console.log(`Hotkey activated: Ctrl+Alt+Shift+${key} -> Stamp ${index + 1}`);
        }
      }
    });
  }

  private generatePDF(): void {
    // Create a temporary canvas to render the rainbow and stamps (no starburst)
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = this.canvas.width;
    tempCanvas.height = this.canvas.height;
    const tempCtx = tempCanvas.getContext('2d')!;

    // Fill with white background
    tempCtx.fillStyle = '#ffffff';
    tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);

    // Draw the rainbow
    this.drawRainbowOnContext(tempCtx);

    // Enable high-quality rendering for PDF
    tempCtx.imageSmoothingEnabled = true;
    tempCtx.imageSmoothingQuality = 'high';

    // Draw the placed stamps
    this.placedStamps.forEach((placedStamp) => {
      const stamp = placedStamp.stamp;
      const imgCanvas = stamp.processedImage!;

      // Calculate size: scale to 1/3 of original size for higher DPI, then apply random multiplier
      const scale = (stamp.size / Math.max(imgCanvas.width, imgCanvas.height)) * (1/3) * placedStamp.sizeMultiplier;
      const width = imgCanvas.width * scale;
      const height = imgCanvas.height * scale;

      // Draw centered at x, y
      tempCtx.drawImage(imgCanvas, placedStamp.x - width / 2, placedStamp.y - height / 2, width, height);
    });

    // Convert canvas to image
    const imgData = tempCanvas.toDataURL('image/png');

    // Create PDF with 8.5x11 inch dimensions
    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'in',
      format: 'letter',
    });

    // Calculate dimensions to fit the canvas (680x880) into the PDF page
    const pageWidth = 8.5;
    const pageHeight = 11;
    const margin = 0.5;
    const availableWidth = pageWidth - 2 * margin;
    const availableHeight = pageHeight - 2 * margin;

    // Canvas aspect ratio
    const canvasAspectRatio = this.canvas.width / this.canvas.height;
    const availableAspectRatio = availableWidth / availableHeight;

    let imgWidth, imgHeight, xOffset, yOffset;

    if (canvasAspectRatio > availableAspectRatio) {
      // Canvas is wider relative to available space
      imgWidth = availableWidth;
      imgHeight = availableWidth / canvasAspectRatio;
      xOffset = margin;
      yOffset = (pageHeight - imgHeight) / 2;
    } else {
      // Canvas is taller relative to available space
      imgHeight = availableHeight;
      imgWidth = availableHeight * canvasAspectRatio;
      xOffset = (pageWidth - imgWidth) / 2;
      yOffset = margin;
    }

    pdf.addImage(imgData, 'PNG', xOffset, yOffset, imgWidth, imgHeight);

    // Open PDF in new tab
    const pdfBlob = pdf.output('blob');
    const pdfUrl = URL.createObjectURL(pdfBlob);
    window.open(pdfUrl, '_blank');
  }

  private removeOverlappingStamps(x: number, y: number): number {
    // Pixel-perfect collision detection with 10% overlap tolerance
    const beforeCount = this.placedStamps.length;

    // Get the new stamp we're about to place
    const newStamp = this.selectedStamp!;

    this.placedStamps = this.placedStamps.filter((placedStamp) => {
      // Calculate overlap percentage using pixel-perfect detection
      const overlapPercent = this.calculateStampOverlap(
        placedStamp.stamp,
        placedStamp.x,
        placedStamp.y,
        placedStamp.sizeMultiplier,
        newStamp,
        x,
        y,
        this.currentSizeMultiplier
      );

      // Keep the stamp if overlap is less than or equal to 10%
      return overlapPercent <= 10;
    });

    return beforeCount - this.placedStamps.length;
  }

  private calculateStampOverlap(
    stamp1: Stamp,
    x1: number,
    y1: number,
    sizeMultiplier1: number,
    stamp2: Stamp,
    x2: number,
    y2: number,
    sizeMultiplier2: number
  ): number {
    // Calculate rendered dimensions (1/3 scale with size multiplier)
    const img1 = stamp1.processedImage!;
    const scale1 = (stamp1.size / Math.max(img1.width, img1.height)) * (1/3) * sizeMultiplier1;
    const width1 = img1.width * scale1;
    const height1 = img1.height * scale1;

    const img2 = stamp2.processedImage!;
    const scale2 = (stamp2.size / Math.max(img2.width, img2.height)) * (1/3) * sizeMultiplier2;
    const width2 = img2.width * scale2;
    const height2 = img2.height * scale2;

    // Calculate bounding boxes (centered at x, y)
    const box1 = {
      left: x1 - width1 / 2,
      top: y1 - height1 / 2,
      right: x1 + width1 / 2,
      bottom: y1 + height1 / 2,
      width: width1,
      height: height1,
    };

    const box2 = {
      left: x2 - width2 / 2,
      top: y2 - height2 / 2,
      right: x2 + width2 / 2,
      bottom: y2 + height2 / 2,
      width: width2,
      height: height2,
    };

    // Quick bounding box check - if boxes don't intersect, no overlap
    if (
      box1.right < box2.left ||
      box1.left > box2.right ||
      box1.bottom < box2.top ||
      box1.top > box2.bottom
    ) {
      return 0;
    }

    // Calculate intersection rectangle
    const intersectLeft = Math.max(box1.left, box2.left);
    const intersectTop = Math.max(box1.top, box2.top);
    const intersectRight = Math.min(box1.right, box2.right);
    const intersectBottom = Math.min(box1.bottom, box2.bottom);
    const intersectWidth = intersectRight - intersectLeft;
    const intersectHeight = intersectBottom - intersectTop;

    // Create temporary canvases to render stamps at their actual positions
    const tempCanvas1 = document.createElement('canvas');
    tempCanvas1.width = Math.ceil(width1);
    tempCanvas1.height = Math.ceil(height1);
    const tempCtx1 = tempCanvas1.getContext('2d')!;
    tempCtx1.drawImage(img1, 0, 0, width1, height1);
    const imgData1 = tempCtx1.getImageData(0, 0, tempCanvas1.width, tempCanvas1.height);

    const tempCanvas2 = document.createElement('canvas');
    tempCanvas2.width = Math.ceil(width2);
    tempCanvas2.height = Math.ceil(height2);
    const tempCtx2 = tempCanvas2.getContext('2d')!;
    tempCtx2.drawImage(img2, 0, 0, width2, height2);
    const imgData2 = tempCtx2.getImageData(0, 0, tempCanvas2.width, tempCanvas2.height);

    // Count overlapping non-transparent pixels
    let overlapPixels = 0;
    let totalPixels1 = 0;
    let totalPixels2 = 0;

    // Count total non-transparent pixels in each stamp
    for (let i = 3; i < imgData1.data.length; i += 4) {
      if (imgData1.data[i] > 0) totalPixels1++;
    }
    for (let i = 3; i < imgData2.data.length; i += 4) {
      if (imgData2.data[i] > 0) totalPixels2++;
    }

    // Check pixels in intersection area
    for (let y = 0; y < intersectHeight; y++) {
      for (let x = 0; x < intersectWidth; x++) {
        // Calculate absolute position
        const absX = intersectLeft + x;
        const absY = intersectTop + y;

        // Calculate position in stamp1's local coordinates
        const local1X = Math.floor(absX - box1.left);
        const local1Y = Math.floor(absY - box1.top);

        // Calculate position in stamp2's local coordinates
        const local2X = Math.floor(absX - box2.left);
        const local2Y = Math.floor(absY - box2.top);

        // Check if both positions are within bounds
        if (
          local1X >= 0 && local1X < tempCanvas1.width &&
          local1Y >= 0 && local1Y < tempCanvas1.height &&
          local2X >= 0 && local2X < tempCanvas2.width &&
          local2Y >= 0 && local2Y < tempCanvas2.height
        ) {
          // Get alpha values
          const idx1 = (local1Y * tempCanvas1.width + local1X) * 4 + 3;
          const idx2 = (local2Y * tempCanvas2.width + local2X) * 4 + 3;
          const alpha1 = imgData1.data[idx1];
          const alpha2 = imgData2.data[idx2];

          // Both pixels are non-transparent - this is an overlap
          if (alpha1 > 0 && alpha2 > 0) {
            overlapPixels++;
          }
        }
      }
    }

    // Calculate overlap as percentage of the smaller stamp
    const smallerStampPixels = Math.min(totalPixels1, totalPixels2);
    if (smallerStampPixels === 0) return 0;

    return (overlapPixels / smallerStampPixels) * 100;
  }

  private animateRainbowProgress(): void {
    if (!this.isRainbowAnimating) return;

    // Smoothly animate progress toward target (3% per frame at 60fps ≈ 0.5 seconds for 10%)
    const animationSpeed = 3;
    const diff = this.rainbowTargetProgress - this.rainbowProgress;

    if (Math.abs(diff) < 0.1) {
      // Close enough, snap to target
      this.rainbowProgress = this.rainbowTargetProgress;
      this.isRainbowAnimating = false;
    } else {
      // Move toward target
      this.rainbowProgress += Math.sign(diff) * Math.min(animationSpeed, Math.abs(diff));
    }

    this.render();

    if (this.isRainbowAnimating) {
      requestAnimationFrame(() => this.animateRainbowProgress());
    }
  }

  private scheduleCelebration(): void {
    // Wait for animation to complete, then trigger celebration
    const checkComplete = () => {
      if (this.rainbowProgress >= 100) {
        this.triggerCelebration();
      } else {
        requestAnimationFrame(checkComplete);
      }
    };
    requestAnimationFrame(checkComplete);
  }

  private playSillySound(): void {
    const now = this.audioContext.currentTime;

    // Random sound types for variety
    const soundType = Math.floor(Math.random() * 5);

    switch (soundType) {
      case 0: // Boing sound (quick pitch drop)
        this.createBoingSound(now);
        break;
      case 1: // Beep sound (short tone)
        this.createBeepSound(now);
        break;
      case 2: // Whistle sound (pitch rise)
        this.createWhistleSound(now);
        break;
      case 3: // Pop sound (quick burst)
        this.createPopSound(now);
        break;
      case 4: // Chirp sound (multiple quick tones)
        this.createChirpSound(now);
        break;
    }
  }

  private createBoingSound(startTime: number): void {
    const oscillator = this.audioContext.createOscillator();
    const gainNode = this.audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(this.audioContext.destination);

    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(600, startTime);
    oscillator.frequency.exponentialRampToValueAtTime(200, startTime + 0.1);

    gainNode.gain.setValueAtTime(0.3, startTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, startTime + 0.15);

    oscillator.start(startTime);
    oscillator.stop(startTime + 0.15);
  }

  private createBeepSound(startTime: number): void {
    const oscillator = this.audioContext.createOscillator();
    const gainNode = this.audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(this.audioContext.destination);

    const frequency = 400 + Math.random() * 400; // Random pitch
    oscillator.type = 'square';
    oscillator.frequency.setValueAtTime(frequency, startTime);

    gainNode.gain.setValueAtTime(0.2, startTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, startTime + 0.1);

    oscillator.start(startTime);
    oscillator.stop(startTime + 0.1);
  }

  private createWhistleSound(startTime: number): void {
    const oscillator = this.audioContext.createOscillator();
    const gainNode = this.audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(this.audioContext.destination);

    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(400, startTime);
    oscillator.frequency.exponentialRampToValueAtTime(800, startTime + 0.15);

    gainNode.gain.setValueAtTime(0.25, startTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, startTime + 0.15);

    oscillator.start(startTime);
    oscillator.stop(startTime + 0.15);
  }

  private createPopSound(startTime: number): void {
    const oscillator = this.audioContext.createOscillator();
    const gainNode = this.audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(this.audioContext.destination);

    oscillator.type = 'triangle';
    oscillator.frequency.setValueAtTime(150, startTime);

    gainNode.gain.setValueAtTime(0.3, startTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, startTime + 0.05);

    oscillator.start(startTime);
    oscillator.stop(startTime + 0.05);
  }

  private createChirpSound(startTime: number): void {
    for (let i = 0; i < 3; i++) {
      const oscillator = this.audioContext.createOscillator();
      const gainNode = this.audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(this.audioContext.destination);

      const offset = i * 0.05;
      const frequency = 500 + i * 200;

      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(frequency, startTime + offset);

      gainNode.gain.setValueAtTime(0.15, startTime + offset);
      gainNode.gain.exponentialRampToValueAtTime(0.01, startTime + offset + 0.04);

      oscillator.start(startTime + offset);
      oscillator.stop(startTime + offset + 0.04);
    }
  }

  private playCelebrationSound(): void {
    const now = this.audioContext.currentTime;

    // Play a triumphant ascending arpeggio
    const notes = [261.63, 329.63, 392.00, 523.25, 659.25]; // C, E, G, C, E

    notes.forEach((frequency, index) => {
      const oscillator = this.audioContext.createOscillator();
      const gainNode = this.audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(this.audioContext.destination);

      const offset = index * 0.1;

      oscillator.type = 'triangle';
      oscillator.frequency.setValueAtTime(frequency, now + offset);

      gainNode.gain.setValueAtTime(0.3, now + offset);
      gainNode.gain.exponentialRampToValueAtTime(0.01, now + offset + 0.4);

      oscillator.start(now + offset);
      oscillator.stop(now + offset + 0.4);
    });
  }

  private triggerCelebration(): void {
    // Play celebration sound
    this.playCelebrationSound();

    // Create starburst particles
    const centerX = this.canvas.width / 2;
    const centerY = 150;
    const numParticles = 150;

    for (let i = 0; i < numParticles; i++) {
      const angle = (Math.PI * 2 * i) / numParticles;
      const speed = 12 + Math.random() * 8; // Even faster particles (12-20)
      this.starburstParticles.push({
        x: centerX,
        y: centerY,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1.0,
      });
    }

    this.isStarburstAnimating = true;
    this.animateStarburst();
  }

  private animateStarburst(): void {
    if (!this.isStarburstAnimating) return;

    // Update particle positions and life
    this.starburstParticles.forEach((particle) => {
      particle.x += particle.vx;
      particle.y += particle.vy;
      particle.life -= 0.004; // Much slower decay for longer visibility
    });

    // Remove dead particles
    this.starburstParticles = this.starburstParticles.filter((p) => p.life > 0);

    // Stop animating when all particles are gone
    if (this.starburstParticles.length === 0) {
      this.isStarburstAnimating = false;
      return;
    }

    this.render();
    requestAnimationFrame(() => this.animateStarburst());
  }

  private drawStarburst(): void {
    this.starburstParticles.forEach((particle) => {
      this.ctx.save();
      this.ctx.globalAlpha = particle.life;
      this.ctx.fillStyle = `hsl(${Math.random() * 360}, 100%, 50%)`;
      this.ctx.beginPath();
      this.ctx.arc(particle.x, particle.y, 8, 0, Math.PI * 2); // Larger particles
      this.ctx.fill();
      this.ctx.restore();
    });
  }

  private drawRainbowOnContext(ctx: CanvasRenderingContext2D): void {
    const centerX = this.canvas.width / 2;
    const centerY = 450; // Position center below the canvas
    const startRadius = 340; // Innermost radius (violet)
    const arcWidth = 30;
    const numStripes = 7;

    // Rainbow colors (from outer to inner: red to violet)
    const rainbowColors = [
      { r: 255, g: 0, b: 0 },     // Red (outermost)
      { r: 255, g: 127, b: 0 },   // Orange
      { r: 255, g: 255, b: 0 },   // Yellow
      { r: 0, g: 255, b: 0 },     // Green
      { r: 0, g: 0, b: 255 },     // Blue
      { r: 75, g: 0, b: 130 },    // Indigo
      { r: 148, g: 0, b: 211 },   // Violet (innermost)
    ];

    // Draw each stripe of the rainbow (from outer to inner)
    for (let i = 0; i < numStripes; i++) {
      const radius = startRadius + (numStripes - 1 - i) * arcWidth;
      const color = rainbowColors[i];

      const progressFraction = this.rainbowProgress / 100;

      // Draw white background for the entire band
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius, Math.PI, 2 * Math.PI, false);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = arcWidth - 2;
      ctx.stroke();

      // Draw border lines to separate the bands
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius - arcWidth / 2, Math.PI, 2 * Math.PI, false);
      ctx.strokeStyle = '#999999';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Draw the filled colored portion from left (π) to progress point
      if (progressFraction > 0) {
        const filledEndAngle = Math.PI + progressFraction * Math.PI;
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, Math.PI, filledEndAngle, false);
        ctx.strokeStyle = `rgb(${color.r}, ${color.g}, ${color.b})`;
        ctx.lineWidth = arcWidth;
        ctx.stroke();
      }
    }
  }

  private drawRainbow(): void {
    this.drawRainbowOnContext(this.ctx);
  }

  private render(): void {
    // Clear canvas
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    // Draw rainbow at the top
    this.drawRainbow();

    // Draw starburst particles if animating
    if (this.isStarburstAnimating) {
      this.drawStarburst();
    }

    // Draw all placed stamps
    this.placedStamps.forEach((placedStamp) => {
      this.drawStamp(placedStamp.stamp, placedStamp.x, placedStamp.y, 1.0, placedStamp.sizeMultiplier);
    });

    // Draw preview (faint outline)
    if (this.selectedStamp && this.previewPosition) {
      this.drawStamp(
        this.selectedStamp,
        this.previewPosition.x,
        this.previewPosition.y,
        0.3,
        this.currentSizeMultiplier
      );
    }
  }

  private drawStamp(stamp: Stamp, x: number, y: number, opacity: number, sizeMultiplier: number = 1.0): void {
    this.ctx.save();
    this.ctx.globalAlpha = opacity;

    // Enable high-quality image smoothing
    this.ctx.imageSmoothingEnabled = true;
    this.ctx.imageSmoothingQuality = 'high';

    // Use the cached processed image (background already removed)
    const imgCanvas = stamp.processedImage!;

    // Calculate size: scale to 1/3 of original size for higher DPI on canvas, then apply random multiplier
    const scale = (stamp.size / Math.max(imgCanvas.width, imgCanvas.height)) * (1/3) * sizeMultiplier;
    const width = imgCanvas.width * scale;
    const height = imgCanvas.height * scale;

    // Draw centered at x, y
    this.ctx.drawImage(imgCanvas, x - width / 2, y - height / 2, width, height);
    this.ctx.restore();
  }
}

// Initialize the application
new ColoringPageMaker();
