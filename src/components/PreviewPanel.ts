import { store } from '../store';

export class PreviewPanel {
  private container: HTMLElement | null = null;
  private panel: HTMLElement | null = null;
  private isOpen: boolean = false;
  private unsubscribe: (() => void) | null = null;
  private debounceTimer: number | null = null;

  mount(container: HTMLElement): void {
    this.container = container;
    this.render();
    
    // Subscribe to store changes for live preview
    this.unsubscribe = store.subscribe(() => this.updatePreview());
  }

  private render(): void {
    if (!this.container) return;

    this.container.innerHTML = `
      <div id="preview-panel" class="fixed right-0 top-1/2 -translate-y-1/2 z-30 flex items-center">
        <button id="preview-toggle" class="bg-gray-700 hover:bg-gray-600 px-2 py-6 rounded-l-lg shadow-lg">
          <svg class="w-5 h-5 transition-transform" id="preview-arrow" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/>
          </svg>
        </button>
        <div id="preview-content" class="bg-gray-800 border-l border-gray-600 shadow-xl w-0 overflow-hidden transition-all duration-300">
          <div class="p-4 flex flex-col" style="width: 720px;">
            <h3 class="font-semibold mb-3 text-base">Aperçu PNG</h3>
            <div class="bg-black/50 rounded-lg border border-gray-600 p-2">
              <canvas id="preview-canvas" style="width: 100%; aspect-ratio: 16/9; display: block;"></canvas>
            </div>
            <p class="text-xs text-gray-400 mt-2 text-center">Mise à jour en temps réel</p>
          </div>
        </div>
      </div>
    `;

    this.panel = this.container.querySelector('#preview-content');
    this.attachEvents();
  }

  private attachEvents(): void {
    this.container?.querySelector('#preview-toggle')?.addEventListener('click', () => {
      this.toggle();
    });
  }

  private toggle(): void {
    this.isOpen = !this.isOpen;
    
    const content = this.container?.querySelector('#preview-content') as HTMLElement;
    const arrow = this.container?.querySelector('#preview-arrow') as HTMLElement;
    
    if (content) {
      content.style.width = this.isOpen ? '720px' : '0';
    }
    if (arrow) {
      arrow.style.transform = this.isOpen ? 'rotate(180deg)' : '';
    }
    
    if (this.isOpen) {
      this.updatePreview();
    }
  }

  private updatePreview(): void {
    if (!this.isOpen) return;
    
    // Debounce to avoid too many updates
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    
    this.debounceTimer = window.setTimeout(() => {
      this.renderPreview();
    }, 300);
  }

  private async renderPreview(): Promise<void> {
    const sourceCanvas = document.getElementById('template-canvas');
    const previewCanvas = document.getElementById('preview-canvas') as HTMLCanvasElement;
    
    if (!sourceCanvas || !previewCanvas) return;

    try {
      // Clone the canvas element to avoid modifying the original
      const clone = sourceCanvas.cloneNode(true) as HTMLElement;
      clone.style.position = 'absolute';
      clone.style.left = '-9999px';
      document.body.appendChild(clone);
      
      // Hide section controls (edit/delete buttons) for preview
      clone.querySelectorAll('.section-controls').forEach(el => {
        (el as HTMLElement).style.display = 'none';
      });
      
      // html2canvas-pro supports oklab/oklch natively - no color conversion needed!
      const { default: html2canvas } = await import('html2canvas-pro');
      const result = await html2canvas(clone, {
        backgroundColor: null,
        useCORS: true,
        scale: 0.5, // Lower scale for preview performance
        logging: false
      });
      
      // Clean up clone
      document.body.removeChild(clone);
      
      // Draw to preview canvas
      const ctx = previewCanvas.getContext('2d');
      if (ctx) {
        previewCanvas.width = result.width;
        previewCanvas.height = result.height;
        ctx.drawImage(result, 0, 0);
      }
    } catch (err) {
      console.error('Preview render failed:', err);
    }
  }

  destroy(): void {
    this.unsubscribe?.();
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
  }
}
