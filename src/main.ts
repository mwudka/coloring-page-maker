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
    // Define 13 stamp images to load
    const stampFiles = [
      { id: 'stamp1', name: 'Stamp 1', filename: '1.png' },
      { id: 'stamp2', name: 'Stamp 2', filename: '2.png' },
      { id: 'stamp3', name: 'Stamp 3', filename: '3.png' },
      { id: 'stamp4', name: 'Stamp 4', filename: '4.png' },
      { id: 'stamp5', name: 'Stamp 5', filename: '5.png' },
      { id: 'stamp6', name: 'Stamp 6', filename: '6.png' },
      { id: 'stamp7', name: 'Stamp 7', filename: '7.png' },
      { id: 'stamp8', name: 'Stamp 8', filename: '8.png' },
      { id: 'stamp9', name: 'Stamp 9', filename: '9.png' },
      { id: 'stamp10', name: 'Stamp 10', filename: '10.png' },
      { id: 'stamp11', name: 'Stamp 11', filename: '11.png' },
      { id: 'stamp12', name: 'Stamp 12', filename: '12.png' },
      { id: 'stamp13', name: 'Stamp 13', filename: '13.png' },
    ];

    // Load all images
    const imagePromises = stampFiles.map(async (stampFile) => {
      const img = new Image();
      const loadPromise = new Promise<HTMLImageElement>((resolve, reject) => {
        img.onload = () => resolve(img);
        img.onerror = reject;
      });
      img.src = `/stamps/${stampFile.filename}`;

      await loadPromise;

      // Trim 50px from all sides to remove borders/margins
      const trimmedImage = this.trimImage(img, 50);

      // Process image (remove background)
      const processedImage = this.removeBackground(trimmedImage);

      // Generate thumbnail from processed image
      const thumbnail = this.generateThumbnail(processedImage);

      // Use the maximum dimension of the processed image as the size
      const size = Math.max(processedImage.width, processedImage.height);

      return {
        id: stampFile.id,
        name: stampFile.name,
        size: size,
        image: img,
        thumbnail,
        processedImage,
      };
    });

    this.stamps = await Promise.all(imagePromises);
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
        this.removeOverlappingStamps(
          this.previewPosition.x,
          this.previewPosition.y,
          this.selectedStamp.size
        );

        this.placedStamps.push({
          stamp: this.selectedStamp,
          x: this.previewPosition.x,
          y: this.previewPosition.y,
        });

        // Play a silly sound
        this.playSillySound();

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

      // Calculate size: scale to 1/3 of original size for higher DPI
      const scale = (stamp.size / Math.max(imgCanvas.width, imgCanvas.height)) * (1/3);
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

  private removeOverlappingStamps(x: number, y: number, size: number): void {
    // Check for overlaps and remove them
    // Two stamps overlap if their centers are closer than the average of their sizes
    this.placedStamps = this.placedStamps.filter((placedStamp) => {
      const dx = placedStamp.x - x;
      const dy = placedStamp.y - y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      const overlapThreshold = (placedStamp.stamp.size + size) / 2;

      // Keep the stamp if it's NOT overlapping (distance >= threshold)
      return distance >= overlapThreshold;
    });
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
      this.drawStamp(placedStamp.stamp, placedStamp.x, placedStamp.y, 1.0);
    });

    // Draw preview (faint outline)
    if (this.selectedStamp && this.previewPosition) {
      this.drawStamp(
        this.selectedStamp,
        this.previewPosition.x,
        this.previewPosition.y,
        0.3
      );
    }
  }

  private drawStamp(stamp: Stamp, x: number, y: number, opacity: number): void {
    this.ctx.save();
    this.ctx.globalAlpha = opacity;

    // Enable high-quality image smoothing
    this.ctx.imageSmoothingEnabled = true;
    this.ctx.imageSmoothingQuality = 'high';

    // Use the cached processed image (background already removed)
    const imgCanvas = stamp.processedImage!;

    // Calculate size: scale to 1/3 of original size for higher DPI on canvas
    const scale = (stamp.size / Math.max(imgCanvas.width, imgCanvas.height)) * (1/3);
    const width = imgCanvas.width * scale;
    const height = imgCanvas.height * scale;

    // Draw centered at x, y
    this.ctx.drawImage(imgCanvas, x - width / 2, y - height / 2, width, height);
    this.ctx.restore();
  }
}

// Initialize the application
new ColoringPageMaker();
