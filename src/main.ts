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

  constructor() {
    this.canvas = document.getElementById('canvas') as HTMLCanvasElement;
    this.ctx = this.canvas.getContext('2d')!;

    // Set canvas size
    this.canvas.width = 800;
    this.canvas.height = 600;

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

    this.canvas.addEventListener('click', (e) => {
      if (this.selectedStamp && this.previewPosition) {
        this.placedStamps.push({
          stamp: this.selectedStamp,
          x: this.previewPosition.x,
          y: this.previewPosition.y,
        });
        this.render();
      }
    });
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
