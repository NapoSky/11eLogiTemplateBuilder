import { store } from '../store';
import { CATEGORIES, IconCategory, Icon } from '../types';

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

    this.container.innerHTML = `
      <div class="p-3 border-b border-gray-700">
        <input
          type="text"
          id="search-input"
          placeholder="Rechercher..."
          value="${store.searchQuery}"
          class="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded text-sm focus:outline-none focus:border-blue-500"
        />
      </div>
      
      <div class="p-2 border-b border-gray-700 flex flex-wrap gap-1">
        <button
          data-category="Toutes"
          class="px-2 py-1 text-xs rounded ${store.selectedCategory === 'Toutes' ? 'bg-blue-600' : 'bg-gray-700 hover:bg-gray-600'}"
        >Toutes</button>
        ${CATEGORIES.map(cat => `
          <button
            data-category="${cat}"
            class="px-2 py-1 text-xs rounded ${store.selectedCategory === cat ? 'bg-blue-600' : 'bg-gray-700 hover:bg-gray-600'}"
          >${cat}</button>
        `).join('')}
      </div>
      
      <div class="flex-1 overflow-y-auto p-2">
        <div class="grid grid-cols-4 gap-1" id="icon-grid">
          ${store.filteredIcons.map(icon => this.renderIcon(icon)).join('')}
        </div>
      </div>
    `;

    this.attachEvents();
  }

  private renderIcon(icon: Icon): string {
    return `
      <div
        class="sidebar-icon aspect-square bg-gray-800 rounded p-1 cursor-grab hover:bg-gray-700 flex items-center justify-center"
        draggable="true"
        data-icon-id="${icon.id}"
        data-icon-filename="${icon.filename}"
        data-icon-path="${icon.path}"
        data-icon-name="${icon.displayName}"
        title="${icon.displayName}"
      >
        <img src="${icon.path}" alt="${icon.displayName}" class="w-full h-full object-contain" loading="lazy" />
      </div>
    `;
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
        const cat = btn.getAttribute('data-category') as IconCategory | 'Toutes';
        store.setCategory(cat);
      });
    });

    // Drag start for icons
    this.container.querySelectorAll('.sidebar-icon').forEach(el => {
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
}
