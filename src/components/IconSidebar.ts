import { store, type SidebarCategory } from '../store';
import { CATEGORIES, TODO_CATEGORIES, TODO_CATEGORY_LABELS, Icon, FactionFilter } from '../types';
import { showToast } from '../services/toast';

const PRODUCTION_MENU_LABELS = { ...TODO_CATEGORY_LABELS, supplies: 'Resources', shipables: 'Structures' };

const escapeHtml = (value: string): string => value.replace(/[&<>"']/g, char =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!));

export class IconSidebar {
  private container: HTMLElement | null = null;
  private unsubscribe: (() => void) | null = null;

  mount(container: HTMLElement): void {
    this.container = container;
    this.render();
    this.unsubscribe = store.subscribe(() => this.render());
  }

  destroy(): void {
    this.unsubscribe?.();
  }

  private render(): void {
    if (!this.container) return;
    const availableCategories = new Set<string>(store.availableIconCategories);
    const faction = store.viewMode === 'todolist' ? store.productionDocument.faction : store.templateFaction;

    // Check if we already have the structure, if so just update the icon grid
    const existingGrid = this.container.querySelector('#icon-grid');
    const existingSearchInput = this.container.querySelector('#search-input') as HTMLInputElement;
    
    // Both production and Template use the same faction controls.
    const existingFactionBlock = this.container.querySelector('[data-faction]');
    const factionBlockShouldExist = store.viewMode === 'template' || store.viewMode === 'todolist';
    if (existingGrid && existingSearchInput && (!!existingFactionBlock === factionBlockShouldExist)) {
      // Just update the icon grid and category buttons without touching the search input
      existingGrid.innerHTML = store.filteredIcons.map(icon => this.renderIcon(icon)).join('');
      const emptyState = this.container.querySelector('#icon-grid-empty');
      emptyState?.classList.toggle('hidden', store.filteredIcons.length > 0);
      (existingGrid as HTMLElement).classList.toggle('hidden', store.filteredIcons.length === 0);
      
      // Update category button states
      this.container.querySelectorAll('[data-category]').forEach(btn => {
        const cat = btn.getAttribute('data-category');
        (btn as HTMLButtonElement).hidden = cat !== 'Toutes' && !availableCategories.has(cat!);
        if (cat === store.selectedCategory) {
          btn.className = 'px-2 py-1 text-xs rounded bg-blue-600';
        } else {
          btn.className = 'px-2 py-1 text-xs rounded bg-gray-700 hover:bg-gray-600';
        }
      });

      this.container.querySelectorAll('[data-faction]').forEach(btn => {
        const active = btn.getAttribute('data-faction') === faction;
        (btn as HTMLElement).className = this.factionButtonClass(active);
        btn.setAttribute('aria-pressed', String(active));
      });
      
      // Re-attach drag events for new icons
      this.attachIconDragEvents();
      return;
    }

    this.container.innerHTML = `
      <div class="p-3 border-b border-gray-700">
        <input
          type="text"
          id="search-input"
          placeholder="Search icons..."
          value="${store.searchQuery}"
          class="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded text-sm focus:outline-none focus:border-blue-500"
        />
      </div>

      ${factionBlockShouldExist ? `
      <div role="group" aria-label="Faction" class="px-2 pt-2 pb-1 border-b border-gray-700 flex gap-1">
        ${(['all', 'warden', 'colonial'] as FactionFilter[]).map(value => `
          <button type="button" data-faction="${value}" aria-pressed="${faction === value}"
            class="${this.factionButtonClass(faction === value)}">${value === 'all' ? 'All' : value === 'warden' ? 'Warden' : 'Colonial'}</button>
        `).join('')}
      </div>` : ''}
      
      <div class="p-2 border-b border-gray-700 flex flex-wrap gap-1">
        <button
          data-category="Toutes"
          class="px-2 py-1 text-xs rounded ${store.selectedCategory === 'Toutes' ? 'bg-blue-600' : 'bg-gray-700 hover:bg-gray-600'}"
        >All</button>
        ${[...CATEGORIES.map(category => ({ value: category, label: category.charAt(0) + category.slice(1).toLowerCase() })),
          ...TODO_CATEGORIES.map(category => ({ value: category, label: PRODUCTION_MENU_LABELS[category] }))].map(({ value, label }) => `
          <button
            data-category="${value}"
            ${availableCategories.has(value) ? '' : 'hidden'}
            class="px-2 py-1 text-xs rounded ${store.selectedCategory === value ? 'bg-blue-600' : 'bg-gray-700 hover:bg-gray-600'}"
          >${label}</button>
        `).join('')}
      </div>
      
      <div class="flex-1 overflow-y-auto p-2">
        <p id="icon-grid-empty" class="text-xs text-gray-500 text-center mt-4 px-2 ${store.filteredIcons.length === 0 ? '' : 'hidden'}">No icons match your search or filters.</p>
        <div class="grid grid-cols-4 gap-1 ${store.filteredIcons.length === 0 ? 'hidden' : ''}" id="icon-grid">
          ${store.filteredIcons.map(icon => this.renderIcon(icon)).join('')}
        </div>
      </div>
    `;

    this.attachEvents();
  }

  private factionButtonClass(active: boolean): string {
    return `px-2 py-1 text-xs rounded flex-1 ${active ? 'bg-blue-600' : 'bg-gray-700 hover:bg-gray-600'}`;
  }

  private renderIcon(icon: Icon): string {
    const contents = store.viewMode !== 'todolist' ? undefined : store.productionWorkspace === 'run' && store.productionRunSource === 'factory'
      ? store.itemData.find(item => item.iconFilename === icon.filename)?.unitsPerCrate
      : store.mpfData.find(entry => entry.iconFilename === icon.filename)?.numberProduced;
    const tooltipTitle = contents ? `${icon.displayName} — ${contents} items/crate` : icon.displayName;
    return `
      <div
        class="sidebar-icon aspect-square bg-gray-800 rounded p-1 cursor-grab hover:bg-gray-700 flex items-center justify-center"
        draggable="true"
        data-icon-id="${icon.id}"
        data-icon-filename="${icon.filename}"
        data-icon-path="${icon.path}"
        data-icon-name="${escapeHtml(icon.displayName)}"
        title="${escapeHtml(tooltipTitle)}"
      >
        <img src="${icon.path}" alt="${escapeHtml(icon.displayName)}" class="w-full h-full object-contain" loading="lazy" />
      </div>
    `;
  }

  private attachIconDragEvents(): void {
    if (!this.container) return;
    
    // Drag start for icons
    this.container.querySelectorAll('.sidebar-icon').forEach(el => {
      if (store.viewMode === 'todolist') {
        el.addEventListener('dblclick', () => {
          const result = store.addTodoListItemFromIcon((el as HTMLElement).dataset.iconFilename!, store.productionWorkspace);
          if (result === 'category-full') showToast('Factory category full (4/4 crates). Reduce or remove an item before adding another.', { type: 'error' });
        });
      }
      el.addEventListener('dragstart', (e) => {
        const target = e.currentTarget as HTMLElement;
        const iconData = {
          id: target.dataset.iconId,
          filename: target.dataset.iconFilename,
          path: target.dataset.iconPath,
          displayName: target.dataset.iconName
        };
        (e as DragEvent).dataTransfer?.setData('application/json', JSON.stringify(iconData));
        (e as DragEvent).dataTransfer!.effectAllowed = 'copy';
      });
    });
  }

  private attachEvents(): void {
    if (!this.container) return;

    // Search input
    const searchInput = this.container.querySelector('#search-input') as HTMLInputElement;
    searchInput?.addEventListener('input', (e) => {
      store.setSearch((e.target as HTMLInputElement).value);
    });

    // Category buttons
    this.container.querySelectorAll('[data-category]').forEach(btn => {
      btn.addEventListener('click', () => {
        const cat = btn.getAttribute('data-category') as SidebarCategory;
        store.setCategory(cat);
      });
    });

    // The shared control targets only the currently visible document.
    this.container.querySelectorAll('[data-faction]').forEach(btn => {
      btn.addEventListener('click', () => {
        const f = btn.getAttribute('data-faction') as FactionFilter;
        if (store.viewMode === 'todolist') store.setTodoListFaction(f, store.productionWorkspace);
        else store.setTemplateFaction(f);
      });
    });

    // Drag start for icons
    this.attachIconDragEvents();
  }
}
