import { store } from '../store';
import { Section, generateId } from '../types';

const COLORS = [
  // Couleurs Foxhole exactes (basées sur le jeu)
  '#8b7d3a', // olive/gold (armes légères 7.92)
  '#6b5234', // marron (munitions AT)
  '#8b3538', // rouge bordeaux (RPG/launchers)
  '#3d5a80', // bleu (utilitaires)
  '#5c4a6e', // violet/mauve
  
  // Variations utiles
  '#a08b3a', // olive clair
  '#4a3728', // marron foncé
  '#b84545', // rouge plus vif
  '#2d4a6b', // bleu foncé
  '#7c5a9e', // violet clair
  
  // Couleurs complémentaires
  '#d4a534', // jaune/or
  '#e67e22', // orange
  '#27ae60', // vert
  '#16a085', // teal/turquoise
  '#95a5a6', // gris
  '#34495e', // slate foncé
];

export class SectionModal {
  private container: HTMLElement | null = null;
  private modal: HTMLElement | null = null;
  private editingId: string | null = null;
  private createX: number = 100;
  private createY: number = 100;

  mount(container: HTMLElement): void {
    this.container = container;
    
    // Listen for open modal event
    window.addEventListener('open-section-modal', ((e: CustomEvent) => {
      if (e.detail?.editId) {
        this.openEdit(e.detail.editId);
      } else {
        this.createX = e.detail?.x ?? 100;
        this.createY = e.detail?.y ?? 100;
        this.openCreate();
      }
    }) as EventListener);
  }

  private openCreate(): void {
    this.editingId = null;
    this.render('Nouvelle Section', '', COLORS[Math.floor(Math.random() * COLORS.length)]);
  }

  private openEdit(id: string): void {
    const section = store.sections.find(s => s.id === id);
    if (!section) return;
    
    this.editingId = id;
    this.render(section.title, section.title, section.color);
  }

  private render(title: string, inputValue: string, selectedColor: string): void {
    if (!this.container) return;

    this.container.innerHTML = `
      <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50" id="modal-backdrop">
        <div class="bg-gray-800 rounded-lg shadow-xl p-6 w-96" id="modal-content">
          <h2 class="text-lg font-semibold mb-4">${this.editingId ? 'Modifier' : 'Créer'} une section</h2>
          
          <div class="mb-4">
            <label class="block text-sm text-gray-400 mb-1">Titre</label>
            <input
              type="text"
              id="section-title"
              value="${inputValue}"
              class="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded focus:outline-none focus:border-blue-500"
              placeholder="Ex: Infanterie"
            />
          </div>
          
          <div class="mb-6">
            <label class="block text-sm text-gray-400 mb-2">Couleur</label>
            <div class="flex gap-2 flex-wrap" id="color-picker">
              ${COLORS.map(color => `
                <button
                  class="w-8 h-8 rounded-full border-2 ${color === selectedColor ? 'border-white' : 'border-transparent'}"
                  style="background-color: ${color}"
                  data-color="${color}"
                ></button>
              `).join('')}
            </div>
            <input type="hidden" id="selected-color" value="${selectedColor}" />
          </div>
          
          <div class="flex justify-end gap-2">
            <button id="btn-cancel" class="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded">
              Annuler
            </button>
            <button id="btn-save" class="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded">
              ${this.editingId ? 'Modifier' : 'Créer'}
            </button>
          </div>
        </div>
      </div>
    `;

    this.modal = this.container.querySelector('#modal-backdrop');
    this.attachEvents();
  }

  private attachEvents(): void {
    if (!this.container) return;

    // Close on backdrop click
    this.modal?.addEventListener('click', (e) => {
      if (e.target === this.modal) this.close();
    });

    // Cancel button
    this.container.querySelector('#btn-cancel')?.addEventListener('click', () => this.close());

    // Color picker
    this.container.querySelectorAll('#color-picker button').forEach(btn => {
      btn.addEventListener('click', () => {
        const color = (btn as HTMLElement).dataset.color!;
        (this.container!.querySelector('#selected-color') as HTMLInputElement).value = color;
        
        // Update visual selection
        this.container!.querySelectorAll('#color-picker button').forEach(b => {
          b.classList.toggle('border-white', (b as HTMLElement).dataset.color === color);
          b.classList.toggle('border-transparent', (b as HTMLElement).dataset.color !== color);
        });
      });
    });

    // Save button
    this.container.querySelector('#btn-save')?.addEventListener('click', () => this.save());

    // Enter key to save
    this.container.querySelector('#section-title')?.addEventListener('keydown', (e) => {
      if ((e as KeyboardEvent).key === 'Enter') this.save();
    });

    // Focus input
    setTimeout(() => {
      (this.container?.querySelector('#section-title') as HTMLInputElement)?.focus();
    }, 50);
  }

  private save(): void {
    const titleInput = this.container?.querySelector('#section-title') as HTMLInputElement;
    const colorInput = this.container?.querySelector('#selected-color') as HTMLInputElement;
    
    const title = titleInput.value.trim() || 'Section';
    const color = colorInput.value;

    if (this.editingId) {
      store.updateSection(this.editingId, { title, color });
    } else {
      const section: Section = {
        id: generateId(),
        title,
        color,
        x: this.createX,
        y: this.createY,
        width: 200,
        height: 150,
        icons: []
      };
      store.addSection(section);
    }

    this.close();
  }

  private close(): void {
    if (this.container) {
      this.container.innerHTML = '';
    }
    this.modal = null;
    this.editingId = null;
  }
}
