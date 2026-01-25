import { store } from '../store';

export class IconContextMenu {
  private container: HTMLElement | null = null;
  private menu: HTMLElement | null = null;
  private currentSectionId: string | null = null;
  private currentIconId: string | null = null;

  mount(container: HTMLElement): void {
    this.container = container;
    
    // Listen for right-click on section icons
    document.addEventListener('contextmenu', (e) => {
      const target = e.target as HTMLElement;
      const iconEl = target.closest('.section-icon') as HTMLElement;
      
      if (iconEl) {
        e.preventDefault();
        this.currentIconId = iconEl.dataset.iconInstanceId || null;
        this.currentSectionId = iconEl.dataset.sectionId || null;
        
        if (this.currentIconId && this.currentSectionId) {
          this.show(e.clientX, e.clientY);
        }
      }
    });

    // Close on click outside (but not inside the menu)
    document.addEventListener('click', (e) => {
      if (this.menu && !this.menu.contains(e.target as Node)) {
        this.hide();
      }
    });
  }

  private show(x: number, y: number): void {
    if (!this.container) return;

    // Find current icon
    const section = store.sections.find(s => s.id === this.currentSectionId);
    const icon = section?.icons.find(i => i.id === this.currentIconId);
    const currentSubtype = icon?.subtype;
    const currentQuantity = icon?.quantity ?? 1;

    this.container.innerHTML = `
      <div class="fixed inset-0 z-40" id="context-backdrop"></div>
      <div class="fixed bg-gray-800 border border-gray-600 rounded-lg shadow-xl z-50 min-w-56 max-h-[70vh] flex flex-col" style="left: ${x}px; top: ${y}px" id="context-menu">
        <div class="px-3 py-2 border-b border-gray-600 shrink-0">
          <label class="block text-xs text-gray-400 uppercase mb-1">Quantité</label>
          <div class="flex items-center gap-2">
            <button class="qty-btn w-8 h-8 bg-gray-700 hover:bg-gray-600 rounded flex items-center justify-center" data-qty-action="minus">−</button>
            <input type="number" id="qty-input" value="${currentQuantity}" min="-1" max="999" class="w-16 px-2 py-1 bg-gray-700 border border-gray-600 rounded text-center text-sm" />
            <button class="qty-btn w-8 h-8 bg-gray-700 hover:bg-gray-600 rounded flex items-center justify-center" data-qty-action="plus">+</button>
          </div>
          <div class="flex gap-1 mt-2">
            <button class="qty-preset flex-1 px-2 py-1 text-xs rounded ${currentQuantity === 0 ? 'bg-amber-600' : 'bg-gray-700 hover:bg-gray-600'}" data-qty-preset="0" title="Non nécessaire">★ Non</button>
            <button class="qty-preset flex-1 px-2 py-1 text-xs rounded ${currentQuantity === -1 ? 'bg-purple-600' : 'bg-gray-700 hover:bg-gray-600'}" data-qty-preset="-1" title="Spécifique">? Spé</button>
          </div>
        </div>
        <div class="overflow-y-auto flex-1">
          <div class="px-3 py-1 text-xs text-gray-400 uppercase sticky top-0 bg-gray-800">Subtype</div>
          <button class="context-item w-full px-3 py-2 text-left hover:bg-gray-700 flex items-center gap-2 ${!currentSubtype ? 'text-blue-400' : ''}" data-subtype="">
            <span class="w-5 h-5 flex items-center justify-center">${!currentSubtype ? '✓' : ''}</span>
            Aucun
          </button>
          ${store.subtypes.map(st => `
            <button class="context-item w-full px-3 py-2 text-left hover:bg-gray-700 flex items-center gap-2 ${currentSubtype === st.path ? 'text-blue-400' : ''}" data-subtype="${st.path}">
              <img src="${st.path}" alt="" class="w-5 h-5 object-contain" />
              ${st.displayName}
            </button>
          `).join('')}
        </div>
        <div class="border-t border-gray-600 shrink-0">
          <button class="context-item w-full px-3 py-2 text-left hover:bg-red-600 text-red-400" data-action="delete">
            Supprimer l'icône
          </button>
        </div>
      </div>
    `;

    this.menu = this.container.querySelector('#context-menu');
    
    // Adjust position to ensure menu stays in viewport
    if (this.menu) {
      const rect = this.menu.getBoundingClientRect();
      const padding = 10; // padding from viewport edges
      
      let finalX = x;
      let finalY = y;
      
      // Horizontal adjustment
      if (rect.right > window.innerWidth - padding) {
        finalX = window.innerWidth - rect.width - padding;
      }
      if (finalX < padding) {
        finalX = padding;
      }
      
      // Vertical adjustment - position above cursor if not enough space below
      if (rect.bottom > window.innerHeight - padding) {
        // Try positioning above the click point
        finalY = y - rect.height;
        // If still not enough space, anchor to bottom of viewport
        if (finalY < padding) {
          finalY = padding;
          // Also reduce max-height if needed
          const availableHeight = window.innerHeight - (2 * padding);
          this.menu.style.maxHeight = `${availableHeight}px`;
        }
      }
      
      this.menu.style.left = `${finalX}px`;
      this.menu.style.top = `${finalY}px`;
    }

    this.attachEvents();
  }

  private attachEvents(): void {
    if (!this.container) return;

    // Quantity buttons
    this.container.querySelectorAll('.qty-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const action = (btn as HTMLElement).dataset.qtyAction;
        const input = this.container!.querySelector('#qty-input') as HTMLInputElement;
        let qty = parseInt(input.value) || 1;
        if (action === 'plus') {
          if (qty < 1) qty = 1; // Passer de valeur spéciale à 1
          else qty++;
        }
        if (action === 'minus' && qty > 1) qty--;
        input.value = String(qty);
        if (this.currentSectionId && this.currentIconId) {
          store.setIconQuantity(this.currentSectionId, this.currentIconId, qty);
        }
      });
    });

    // Quantity preset buttons (★ and ?)
    this.container.querySelectorAll('.qty-preset').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const qty = parseInt((btn as HTMLElement).dataset.qtyPreset || '1');
        const input = this.container!.querySelector('#qty-input') as HTMLInputElement;
        input.value = String(qty);
        if (this.currentSectionId && this.currentIconId) {
          store.setIconQuantity(this.currentSectionId, this.currentIconId, qty);
        }
        this.hide();
      });
    });

    // Quantity input change
    this.container.querySelector('#qty-input')?.addEventListener('change', (e) => {
      const qty = parseInt((e.target as HTMLInputElement).value) || 1;
      if (this.currentSectionId && this.currentIconId) {
        store.setIconQuantity(this.currentSectionId, this.currentIconId, qty);
      }
    });

    // Subtype selection
    this.container.querySelectorAll('.context-item[data-subtype]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const subtype = (btn as HTMLElement).dataset.subtype || undefined;
        if (this.currentSectionId && this.currentIconId) {
          store.setIconSubtype(this.currentSectionId, this.currentIconId, subtype);
        }
        this.hide();
      });
    });

    // Delete action
    this.container.querySelector('[data-action="delete"]')?.addEventListener('click', (e) => {
      e.stopPropagation();
      if (this.currentSectionId && this.currentIconId) {
        store.removeIconFromSection(this.currentSectionId, this.currentIconId);
      }
      this.hide();
    });

    // Close on backdrop click
    this.container.querySelector('#context-backdrop')?.addEventListener('click', () => this.hide());
  }

  private hide(): void {
    if (this.container) {
      this.container.innerHTML = '';
    }
    this.menu = null;
    this.currentSectionId = null;
    this.currentIconId = null;
  }
}
