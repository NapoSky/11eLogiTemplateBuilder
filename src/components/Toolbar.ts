import html2canvas from 'html2canvas-pro';
import { store, IconScale, ICON_SCALES } from '../store';

export class Toolbar {
  private container: HTMLElement | null = null;

  mount(container: HTMLElement): void {
    this.container = container;
    this.render();
    
    // Écouter les changements de store pour mettre à jour le bouton actif
    store.subscribe(() => this.updateScaleButtons());
  }

  private render(): void {
    if (!this.container) return;

    this.container.className = 'flex items-center justify-between px-4 py-2 bg-gray-800 border-b border-gray-700';
    this.container.innerHTML = `
      <div class="flex items-center gap-4">
        <h1 class="text-lg font-bold">11e Template Builder</h1>
        <button id="btn-new-section" class="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 rounded text-sm flex items-center gap-1">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
          </svg>
          Nouvelle Section
        </button>
        
        <!-- Sélecteur de taille d'icônes -->
        <div class="flex items-center gap-1 ml-2 border-l border-gray-600 pl-4">
          <span class="text-xs text-gray-400 mr-1">Taille:</span>
          <button data-scale="small" class="icon-scale-btn px-2 py-1 text-xs rounded transition-colors" title="Petites icônes">S</button>
          <button data-scale="medium" class="icon-scale-btn px-2 py-1 text-xs rounded transition-colors" title="Moyennes icônes">M</button>
          <button data-scale="large" class="icon-scale-btn px-2 py-1 text-xs rounded transition-colors" title="Grandes icônes">L</button>
        </div>
      </div>
      
      <div class="flex items-center gap-2">
        <button id="btn-export-png" class="px-3 py-1.5 bg-green-600 hover:bg-green-700 rounded text-sm">
          Export PNG
        </button>
        <button id="btn-export-json" class="px-3 py-1.5 bg-gray-600 hover:bg-gray-700 rounded text-sm">
          Export JSON
        </button>
        <label class="px-3 py-1.5 bg-gray-600 hover:bg-gray-700 rounded text-sm cursor-pointer">
          Import JSON
          <input type="file" accept=".json" id="import-json" class="hidden" />
        </label>
        <button id="btn-clear" class="px-3 py-1.5 bg-red-600/50 hover:bg-red-600 rounded text-sm">
          Effacer
        </button>
      </div>
    `;
    
    this.updateScaleButtons();

    this.attachEvents();
  }

  private updateScaleButtons(): void {
    if (!this.container) return;
    const currentScale = store.iconScale;
    this.container.querySelectorAll('.icon-scale-btn').forEach(btn => {
      const scale = btn.getAttribute('data-scale') as IconScale;
      if (scale === currentScale) {
        btn.className = 'icon-scale-btn px-2 py-1 text-xs rounded transition-colors bg-blue-600 text-white';
      } else {
        btn.className = 'icon-scale-btn px-2 py-1 text-xs rounded transition-colors bg-gray-600 hover:bg-gray-500 text-gray-300';
      }
    });
  }

  private attachEvents(): void {
    if (!this.container) return;

    // New section
    this.container.querySelector('#btn-new-section')?.addEventListener('click', () => {
      window.dispatchEvent(new CustomEvent('open-section-modal', { detail: { x: 100, y: 100 } }));
    });

    // Icon scale buttons
    this.container.querySelectorAll('.icon-scale-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const scale = btn.getAttribute('data-scale') as IconScale;
        if (scale) {
          store.setIconScale(scale);
        }
      });
    });

    // Export PNG
    this.container.querySelector('#btn-export-png')?.addEventListener('click', () => this.exportPng());

    // Export JSON
    this.container.querySelector('#btn-export-json')?.addEventListener('click', () => this.exportJson());

    // Import JSON
    this.container.querySelector('#import-json')?.addEventListener('change', (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      
      const reader = new FileReader();
      reader.onload = () => {
        store.importJSON(reader.result as string);
      };
      reader.readAsText(file);
      (e.target as HTMLInputElement).value = '';
    });

    // Clear
    this.container.querySelector('#btn-clear')?.addEventListener('click', () => {
      if (confirm('Effacer tout le template ?')) {
        store.sections.forEach(s => store.deleteSection(s.id));
      }
    });
  }

  private async exportPng(): Promise<void> {
    const canvas = document.getElementById('template-canvas');
    if (!canvas) return;

    try {
      // Clone the canvas to avoid modifying original
      const clone = canvas.cloneNode(true) as HTMLElement;
      clone.style.position = 'absolute';
      clone.style.left = '-9999px';
      document.body.appendChild(clone);
      
      // Hide section controls (edit/delete buttons) for export
      clone.querySelectorAll('.section-controls').forEach(el => {
        (el as HTMLElement).style.display = 'none';
      });
      
      // html2canvas-pro supports oklab/oklch natively - no color conversion needed!
      const result = await html2canvas(clone, {
        backgroundColor: null,
        useCORS: true,
        scale: 1,
        logging: false
      });
      
      // Clean up
      document.body.removeChild(clone);
      
      const link = document.createElement('a');
      link.download = 'template.png';
      link.href = result.toDataURL('image/png');
      link.click();
    } catch (err) {
      console.error('Export PNG failed:', err);
      alert('Erreur lors de l\'export PNG');
    }
  }

  private exportJson(): void {
    const json = store.exportJSON();
    const blob = new Blob([json], { type: 'application/json' });
    const link = document.createElement('a');
    link.download = 'template.json';
    link.href = URL.createObjectURL(blob);
    link.click();
    URL.revokeObjectURL(link.href);
  }
}
