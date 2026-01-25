import html2canvas from 'html2canvas-pro';
import { store, IconScale, ICON_SCALES } from '../store';

export class Toolbar {
  private container: HTMLElement | null = null;
  private helpModalVisible = false;

  mount(container: HTMLElement): void {
    this.container = container;
    this.render();
    
    // Écouter les changements de store pour mettre à jour le bouton actif
    store.subscribe(() => this.updateScaleButtons());
    
    // Setup global keyboard shortcuts
    this.setupKeyboardShortcuts();
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
        <!-- Helper button -->
        <button id="btn-help" class="px-2 py-1.5 bg-gray-700 hover:bg-gray-600 rounded text-sm flex items-center gap-1" title="Aide & Raccourcis">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
          </svg>
          <span class="text-xs">?</span>
        </button>
        
        <div class="border-l border-gray-600 h-6 mx-1"></div>
        
        <button id="btn-export-png" class="px-3 py-1.5 bg-green-600 hover:bg-green-700 rounded text-sm flex items-center gap-1" title="Ctrl+E">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/>
          </svg>
          PNG
        </button>
        <button id="btn-export-json" class="px-3 py-1.5 bg-gray-600 hover:bg-gray-700 rounded text-sm flex items-center gap-1" title="Ctrl+S">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4"/>
          </svg>
          Save
        </button>
        <label class="px-3 py-1.5 bg-gray-600 hover:bg-gray-700 rounded text-sm cursor-pointer flex items-center gap-1" title="Ctrl+O">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/>
          </svg>
          Load
          <input type="file" accept=".json" id="import-json" class="hidden" />
        </label>
        <button id="btn-clear" class="px-3 py-1.5 bg-red-600/50 hover:bg-red-600 rounded text-sm">
          Effacer
        </button>
      </div>
      
      <!-- Help Modal -->
      <div id="help-modal" class="hidden fixed inset-0 z-50 flex items-center justify-center bg-black/60">
        <div class="bg-gray-800 rounded-lg shadow-2xl border border-gray-600 p-6 max-w-md w-full mx-4">
          <div class="flex items-center justify-between mb-4">
            <h2 class="text-lg font-bold text-white flex items-center gap-2">
              <svg class="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
              </svg>
              Aide & Raccourcis
            </h2>
            <button id="btn-close-help" class="text-gray-400 hover:text-white transition-colors">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
              </svg>
            </button>
          </div>
          
          <div class="space-y-4">
            <div>
              <h3 class="text-sm font-semibold text-gray-300 mb-2">⌨️ Raccourcis clavier</h3>
              <div class="space-y-2 text-sm">
                <div class="flex justify-between items-center py-1 px-2 bg-gray-700/50 rounded">
                  <span class="text-gray-300">Sauvegarder (JSON)</span>
                  <kbd class="px-2 py-0.5 bg-gray-900 rounded text-xs text-gray-400 font-mono">Ctrl + S</kbd>
                </div>
                <div class="flex justify-between items-center py-1 px-2 bg-gray-700/50 rounded">
                  <span class="text-gray-300">Charger un template</span>
                  <kbd class="px-2 py-0.5 bg-gray-900 rounded text-xs text-gray-400 font-mono">Ctrl + O</kbd>
                </div>
                <div class="flex justify-between items-center py-1 px-2 bg-gray-700/50 rounded">
                  <span class="text-gray-300">Exporter en PNG</span>
                  <kbd class="px-2 py-0.5 bg-gray-900 rounded text-xs text-gray-400 font-mono">Ctrl + E</kbd>
                </div>
              </div>
            </div>
            
            <div>
              <h3 class="text-sm font-semibold text-gray-300 mb-2">🖱️ Actions souris</h3>
              <ul class="text-sm text-gray-400 space-y-1">
                <li>• <span class="text-gray-300">Double-clic</span> sur le canvas → Nouvelle section</li>
                <li>• <span class="text-gray-300">Glisser</span> une icône vers une section → Ajouter</li>
                <li>• <span class="text-gray-300">Glisser</span> dans la grille → Réorganiser</li>
                <li>• <span class="text-gray-300">Clic droit</span> sur une icône → Quantité & sous-type</li>
              </ul>
            </div>
            
            <div>
              <h3 class="text-sm font-semibold text-gray-300 mb-2">📐 Taille des icônes</h3>
              <p class="text-sm text-gray-400">Utilisez les boutons <kbd class="px-1.5 py-0.5 bg-gray-700 rounded text-xs">S</kbd> <kbd class="px-1.5 py-0.5 bg-gray-700 rounded text-xs">M</kbd> <kbd class="px-1.5 py-0.5 bg-gray-700 rounded text-xs">L</kbd> dans la barre d'outils pour ajuster la taille globale des icônes.</p>
            </div>
          </div>
          
          <div class="mt-5 pt-4 border-t border-gray-700 text-center">
            <span class="text-xs text-gray-500">11eRC-FL Template Builder v2.0</span>
          </div>
        </div>
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
    
    // Help modal
    const helpModal = this.container.querySelector('#help-modal') as HTMLElement;
    this.container.querySelector('#btn-help')?.addEventListener('click', () => {
      this.toggleHelpModal(true);
    });
    this.container.querySelector('#btn-close-help')?.addEventListener('click', () => {
      this.toggleHelpModal(false);
    });
    // Close on backdrop click
    helpModal?.addEventListener('click', (e) => {
      if (e.target === helpModal) {
        this.toggleHelpModal(false);
      }
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
  
  private toggleHelpModal(show: boolean): void {
    const helpModal = this.container?.querySelector('#help-modal') as HTMLElement;
    if (helpModal) {
      if (show) {
        helpModal.classList.remove('hidden');
        this.helpModalVisible = true;
      } else {
        helpModal.classList.add('hidden');
        this.helpModalVisible = false;
      }
    }
  }
  
  private setupKeyboardShortcuts(): void {
    document.addEventListener('keydown', (e) => {
      // Ignorer si on est dans un input/textarea
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
        return;
      }
      
      // Escape pour fermer le modal d'aide
      if (e.key === 'Escape' && this.helpModalVisible) {
        this.toggleHelpModal(false);
        return;
      }
      
      // Ctrl/Cmd + S : Sauvegarder (Export JSON)
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        this.exportJson();
        return;
      }
      
      // Ctrl/Cmd + O : Ouvrir (Import JSON)
      if ((e.ctrlKey || e.metaKey) && e.key === 'o') {
        e.preventDefault();
        this.triggerImport();
        return;
      }
      
      // Ctrl/Cmd + E : Exporter PNG
      if ((e.ctrlKey || e.metaKey) && e.key === 'e') {
        e.preventDefault();
        this.exportPng();
        return;
      }
      
      // ? pour afficher l'aide
      if (e.key === '?' && !e.ctrlKey && !e.metaKey) {
        this.toggleHelpModal(!this.helpModalVisible);
        return;
      }
    });
  }
  
  private triggerImport(): void {
    const importInput = this.container?.querySelector('#import-json') as HTMLInputElement;
    if (importInput) {
      importInput.click();
    }
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
