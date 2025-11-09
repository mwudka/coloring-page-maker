import './style.css';
import { jsPDF } from 'jspdf';

type DrawFunction = (ctx: CanvasRenderingContext2D, x: number, y: number, size: number) => void;

interface Stamp {
  id: string;
  name: string;
  size: number;
  draw: DrawFunction;
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

    // Set canvas size to 8.5x11 aspect ratio
    this.canvas.width = 680;
    this.canvas.height = 880;

    // Define available stamps - magical/fantasy theme with outline drawings
    this.stamps = [
      { id: 'unicorn1', name: 'Unicorn', size: 50, draw: this.drawUnicorn },
      { id: 'unicorn2', name: 'Horse', size: 50, draw: this.drawHorse },
      { id: 'heart', name: 'Heart', size: 40, draw: this.drawHeart },
      { id: 'flower', name: 'Flower', size: 45, draw: this.drawFlower },
      { id: 'sunflower', name: 'Sunflower', size: 45, draw: this.drawSunflower },
      { id: 'rose', name: 'Rose', size: 45, draw: this.drawRose },
      { id: 'star', name: 'Star', size: 40, draw: this.drawStar },
      { id: 'moon', name: 'Moon', size: 40, draw: this.drawMoon },
      { id: 'butterfly', name: 'Butterfly', size: 45, draw: this.drawButterfly },
      { id: 'rainbow', name: 'Rainbow', size: 50, draw: this.drawRainbowStamp },
      { id: 'sparkles', name: 'Sparkles', size: 40, draw: this.drawSparkles },
      { id: 'crown', name: 'Crown', size: 40, draw: this.drawCrown },
    ];

    this.initializeStampList();
    this.setupCanvasEvents();
    this.setupPrintButton();
    this.render();
  }

  private initializeStampList(): void {
    const stampList = document.getElementById('stampList')!;

    this.stamps.forEach((stamp) => {
      const stampElement = document.createElement('div');
      stampElement.className = 'stamp-item';

      // Create a small canvas to preview the stamp
      const previewCanvas = document.createElement('canvas');
      previewCanvas.width = 60;
      previewCanvas.height = 60;
      const previewCtx = previewCanvas.getContext('2d')!;

      // Draw the stamp preview
      stamp.draw(previewCtx, 30, 30, 25);

      stampElement.appendChild(previewCanvas);
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

    // Draw the placed stamps
    this.placedStamps.forEach((placedStamp) => {
      placedStamp.stamp.draw(tempCtx, placedStamp.x, placedStamp.y, placedStamp.stamp.size);
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
    stamp.draw(this.ctx, x, y, stamp.size);
    this.ctx.restore();
  }

  // Stamp drawing functions - all create outline drawings for coloring
  private drawHeart(ctx: CanvasRenderingContext2D, x: number, y: number, size: number): void {
    ctx.beginPath();
    ctx.moveTo(x, y + size * 0.3);
    ctx.bezierCurveTo(x, y, x - size * 0.5, y, x - size * 0.5, y + size * 0.3);
    ctx.bezierCurveTo(x - size * 0.5, y + size * 0.5, x, y + size * 0.7, x, y + size);
    ctx.bezierCurveTo(x, y + size * 0.7, x + size * 0.5, y + size * 0.5, x + size * 0.5, y + size * 0.3);
    ctx.bezierCurveTo(x + size * 0.5, y, x, y, x, y + size * 0.3);
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  private drawStar(ctx: CanvasRenderingContext2D, x: number, y: number, size: number): void {
    const spikes = 5;
    const outerRadius = size * 0.5;
    const innerRadius = size * 0.2;

    ctx.beginPath();
    for (let i = 0; i < spikes * 2; i++) {
      const radius = i % 2 === 0 ? outerRadius : innerRadius;
      const angle = (i * Math.PI) / spikes - Math.PI / 2;
      const px = x + Math.cos(angle) * radius;
      const py = y + Math.sin(angle) * radius;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  private drawFlower(ctx: CanvasRenderingContext2D, x: number, y: number, size: number): void {
    const petalCount = 5;
    const petalSize = size * 0.25;

    // Draw petals
    for (let i = 0; i < petalCount; i++) {
      const angle = (i * 2 * Math.PI) / petalCount;
      const px = x + Math.cos(angle) * size * 0.3;
      const py = y + Math.sin(angle) * size * 0.3;

      ctx.beginPath();
      ctx.ellipse(px, py, petalSize, petalSize * 0.6, angle, 0, Math.PI * 2);
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // Draw center
    ctx.beginPath();
    ctx.arc(x, y, size * 0.15, 0, Math.PI * 2);
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  private drawSunflower(ctx: CanvasRenderingContext2D, x: number, y: number, size: number): void {
    const petalCount = 12;

    // Draw petals
    for (let i = 0; i < petalCount; i++) {
      const angle = (i * 2 * Math.PI) / petalCount;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(angle);

      ctx.beginPath();
      ctx.moveTo(size * 0.2, 0);
      ctx.lineTo(size * 0.5, -size * 0.1);
      ctx.lineTo(size * 0.5, size * 0.1);
      ctx.closePath();
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.restore();
    }

    // Draw center with seeds pattern
    ctx.beginPath();
    ctx.arc(x, y, size * 0.2, 0, Math.PI * 2);
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Small dots in center
    for (let i = 0; i < 8; i++) {
      const angle = (i * Math.PI) / 4;
      const dotX = x + Math.cos(angle) * size * 0.1;
      const dotY = y + Math.sin(angle) * size * 0.1;
      ctx.beginPath();
      ctx.arc(dotX, dotY, 1, 0, Math.PI * 2);
      ctx.fillStyle = '#000000';
      ctx.fill();
    }
  }

  private drawRose(ctx: CanvasRenderingContext2D, x: number, y: number, size: number): void {
    // Outer petals (spiral)
    ctx.beginPath();
    for (let i = 0; i < 3; i++) {
      const angle = (i * 2 * Math.PI) / 3;
      const radius = size * 0.4;
      const px = x + Math.cos(angle) * radius * 0.5;
      const py = y + Math.sin(angle) * radius * 0.5;

      ctx.moveTo(px, py);
      ctx.bezierCurveTo(
        px + Math.cos(angle - 0.5) * radius,
        py + Math.sin(angle - 0.5) * radius,
        px + Math.cos(angle + 0.5) * radius,
        py + Math.sin(angle + 0.5) * radius,
        px, py
      );
    }
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Center spiral
    ctx.beginPath();
    ctx.arc(x, y, size * 0.15, 0, Math.PI * 2);
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  private drawMoon(ctx: CanvasRenderingContext2D, x: number, y: number, size: number): void {
    ctx.beginPath();
    ctx.arc(x, y, size * 0.5, 0, Math.PI * 2);
    ctx.arc(x + size * 0.2, y, size * 0.4, 0, Math.PI * 2);
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  private drawButterfly(ctx: CanvasRenderingContext2D, x: number, y: number, size: number): void {
    // Body
    ctx.beginPath();
    ctx.moveTo(x, y - size * 0.4);
    ctx.lineTo(x, y + size * 0.4);
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 3;
    ctx.stroke();

    // Antennae
    ctx.beginPath();
    ctx.moveTo(x, y - size * 0.4);
    ctx.lineTo(x - size * 0.1, y - size * 0.5);
    ctx.moveTo(x, y - size * 0.4);
    ctx.lineTo(x + size * 0.1, y - size * 0.5);
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Left wings
    ctx.beginPath();
    ctx.ellipse(x - size * 0.25, y - size * 0.15, size * 0.3, size * 0.25, 0, 0, Math.PI * 2);
    ctx.ellipse(x - size * 0.25, y + size * 0.15, size * 0.25, size * 0.2, 0, 0, Math.PI * 2);
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Right wings
    ctx.beginPath();
    ctx.ellipse(x + size * 0.25, y - size * 0.15, size * 0.3, size * 0.25, 0, 0, Math.PI * 2);
    ctx.ellipse(x + size * 0.25, y + size * 0.15, size * 0.25, size * 0.2, 0, 0, Math.PI * 2);
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  private drawRainbowStamp(ctx: CanvasRenderingContext2D, x: number, y: number, size: number): void {
    const stripes = 3;
    const arcWidth = size * 0.12;

    for (let i = 0; i < stripes; i++) {
      const radius = size * 0.15 + i * arcWidth;
      ctx.beginPath();
      ctx.arc(x, y + size * 0.3, radius, Math.PI, 0, true);
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }

  private drawSparkles(ctx: CanvasRenderingContext2D, x: number, y: number, size: number): void {
    const drawSparkle = (cx: number, cy: number, s: number) => {
      ctx.beginPath();
      ctx.moveTo(cx, cy - s);
      ctx.lineTo(cx, cy + s);
      ctx.moveTo(cx - s, cy);
      ctx.lineTo(cx + s, cy);
      ctx.moveTo(cx - s * 0.7, cy - s * 0.7);
      ctx.lineTo(cx + s * 0.7, cy + s * 0.7);
      ctx.moveTo(cx - s * 0.7, cy + s * 0.7);
      ctx.lineTo(cx + s * 0.7, cy - s * 0.7);
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 2;
      ctx.stroke();
    };

    drawSparkle(x, y, size * 0.3);
    drawSparkle(x - size * 0.3, y + size * 0.2, size * 0.15);
    drawSparkle(x + size * 0.3, y + size * 0.2, size * 0.15);
    drawSparkle(x, y - size * 0.3, size * 0.2);
  }

  private drawCrown(ctx: CanvasRenderingContext2D, x: number, y: number, size: number): void {
    ctx.beginPath();
    ctx.moveTo(x - size * 0.4, y + size * 0.3);
    ctx.lineTo(x - size * 0.3, y - size * 0.3);
    ctx.lineTo(x - size * 0.15, y);
    ctx.lineTo(x, y - size * 0.4);
    ctx.lineTo(x + size * 0.15, y);
    ctx.lineTo(x + size * 0.3, y - size * 0.3);
    ctx.lineTo(x + size * 0.4, y + size * 0.3);
    ctx.closePath();
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Jewels
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath();
      ctx.arc(x + i * size * 0.15, y - size * 0.15, size * 0.06, 0, Math.PI * 2);
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  private drawUnicorn(ctx: CanvasRenderingContext2D, x: number, y: number, size: number): void {
    // Head (circle)
    ctx.beginPath();
    ctx.arc(x, y, size * 0.35, 0, Math.PI * 2);
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Horn
    ctx.beginPath();
    ctx.moveTo(x - size * 0.1, y - size * 0.35);
    ctx.lineTo(x, y - size * 0.6);
    ctx.lineTo(x + size * 0.1, y - size * 0.35);
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Ear
    ctx.beginPath();
    ctx.moveTo(x + size * 0.2, y - size * 0.3);
    ctx.lineTo(x + size * 0.3, y - size * 0.45);
    ctx.lineTo(x + size * 0.25, y - size * 0.25);
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Eye
    ctx.beginPath();
    ctx.arc(x + size * 0.12, y - size * 0.05, size * 0.05, 0, Math.PI * 2);
    ctx.fillStyle = '#000000';
    ctx.fill();

    // Mane
    ctx.beginPath();
    ctx.moveTo(x - size * 0.25, y - size * 0.25);
    ctx.quadraticCurveTo(x - size * 0.4, y - size * 0.15, x - size * 0.3, y);
    ctx.quadraticCurveTo(x - size * 0.4, y + size * 0.15, x - size * 0.25, y + size * 0.25);
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  private drawHorse(ctx: CanvasRenderingContext2D, x: number, y: number, size: number): void {
    // Head (different angle)
    ctx.beginPath();
    ctx.ellipse(x, y, size * 0.3, size * 0.35, Math.PI / 6, 0, Math.PI * 2);
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Snout
    ctx.beginPath();
    ctx.ellipse(x + size * 0.25, y + size * 0.2, size * 0.15, size * 0.12, Math.PI / 6, 0, Math.PI * 2);
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Ears
    ctx.beginPath();
    ctx.moveTo(x - size * 0.15, y - size * 0.35);
    ctx.lineTo(x - size * 0.1, y - size * 0.5);
    ctx.lineTo(x - size * 0.05, y - size * 0.35);
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Eye
    ctx.beginPath();
    ctx.arc(x + size * 0.05, y - size * 0.1, size * 0.05, 0, Math.PI * 2);
    ctx.fillStyle = '#000000';
    ctx.fill();

    // Mane
    ctx.beginPath();
    ctx.moveTo(x - size * 0.2, y - size * 0.3);
    ctx.quadraticCurveTo(x - size * 0.5, y - size * 0.2, x - size * 0.4, y + size * 0.1);
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}

// Initialize the application
new ColoringPageMaker();
