import './style.css';

interface Stamp {
  id: string;
  emoji: string;
  size: number;
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

  constructor() {
    this.canvas = document.getElementById('canvas') as HTMLCanvasElement;
    this.ctx = this.canvas.getContext('2d')!;
    this.audioContext = new AudioContext();

    // Set canvas size to 8.5x11 aspect ratio
    this.canvas.width = 680;
    this.canvas.height = 880;

    // Define available stamps (using emoji for simplicity)
    this.stamps = [
      { id: 'star', emoji: '⭐', size: 60 },
      { id: 'heart', emoji: '❤️', size: 60 },
      { id: 'flower', emoji: '🌸', size: 60 },
      { id: 'sun', emoji: '☀️', size: 60 },
      { id: 'moon', emoji: '🌙', size: 60 },
      { id: 'tree', emoji: '🌲', size: 60 },
      { id: 'butterfly', emoji: '🦋', size: 60 },
      { id: 'cat', emoji: '🐱', size: 60 },
      { id: 'dog', emoji: '🐶', size: 60 },
      { id: 'rainbow', emoji: '🌈', size: 60 },
    ];

    this.initializeStampList();
    this.setupCanvasEvents();
    this.render();
  }

  private initializeStampList(): void {
    const stampList = document.getElementById('stampList')!;

    this.stamps.forEach((stamp) => {
      const stampElement = document.createElement('div');
      stampElement.className = 'stamp-item';
      stampElement.textContent = stamp.emoji;
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

        this.render();
      }
    });
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

  private render(): void {
    // Clear canvas
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

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
    this.ctx.font = `${stamp.size}px Arial`;
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'middle';
    this.ctx.fillText(stamp.emoji, x, y);
    this.ctx.restore();
  }
}

// Initialize the application
new ColoringPageMaker();
