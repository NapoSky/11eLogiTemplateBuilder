import interact from 'interactjs';
import Sortable, { SortableEvent } from 'sortablejs';
import { store } from '../store';
import { Section as SectionType, SectionIcon } from '../types';

interface InteractMoveEvent {
  dx: number;
  dy: number;
  rect: { width: number; height: number };
}

export class SectionComponent {
  private element: HTMLElement;
  private section: SectionType;
  private sortable: Sortable | null = null;
  private onDelete: (id: string) => void;
  private onEdit: (id: string) => void;

  constructor(section: SectionType, onDelete: (id: string) => void, onEdit: (id: string) => void) {
    this.section = section;
    this.onDelete = onDelete;
    this.onEdit = onEdit;
    this.element = document.createElement('div');
    this.element.className = 'section absolute';
    this.element.dataset.sectionId = section.id;
    
    this.updateStyle();
    this.render();
    this.setupInteract();
    this.setupDropZone();
  }

  private updateStyle(): void {
    this.element.style.left = `${this.section.x}px`;
    this.element.style.top = `${this.section.y}px`;
    this.element.style.width = `${this.section.width}px`;
    this.element.style.height = `${this.section.height}px`;
  }

  private render(): void {
    // Destroy old sortable before re-rendering
    if (this.sortable) {
      this.sortable.destroy();
      this.sortable = null;
    }

    const color = this.section.color;
    
    this.element.innerHTML = `
      <div class="section-box relative rounded-xl overflow-hidden h-full backdrop-blur-sm" 
           style="background: linear-gradient(135deg, ${color}15 0%, ${color}08 100%); border: 2px solid ${color}; box-shadow: 0 4px 20px ${color}30, inset 0 1px 0 rgba(255,255,255,0.1);">
        
        <!-- Header with title -->
        <div class="section-header flex items-center justify-between px-3 py-1.5" 
             style="background: linear-gradient(180deg, ${color}40 0%, ${color}20 100%); border-bottom: 1px solid ${color}50;">
          <div class="flex-1"></div>
          <div class="section-title text-center text-sm font-semibold text-white tracking-wide"
               style="text-shadow: 0 1px 3px rgba(0,0,0,0.8);">
            ${this.section.title}
          </div>
          <div class="section-controls flex-1 flex justify-end gap-1 opacity-0 transition-opacity duration-200">
            <button class="btn-edit p-1 bg-white/10 hover:bg-white/25 rounded-lg transition-colors" title="Éditer">
              <svg class="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/>
              </svg>
            </button>
            <button class="btn-delete p-1 bg-white/10 hover:bg-red-500/60 rounded-lg transition-colors" title="Supprimer">
              <svg class="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
              </svg>
            </button>
          </div>
        </div>
        
        <!-- Content area -->
        <div class="section-content p-2 h-[calc(100%-36px)] overflow-auto cursor-move">
          <div class="icon-grid flex flex-wrap gap-1.5 content-start">
            ${this.section.icons.map(icon => this.renderIcon(icon)).join('')}
          </div>
        </div>
      </div>
    `;
    
    // Attach button events
    this.element.querySelector('.btn-delete')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.onDelete(this.section.id);
    });
    this.element.querySelector('.btn-edit')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.onEdit(this.section.id);
    });
    
    // Drag from content area
    const content = this.element.querySelector('.section-content');
    if (content) {
      content.addEventListener('mousedown', (e) => {
        if ((e.target as HTMLElement).closest('.section-icon')) return;
        // Let interact.js handle the drag
      });
    }
    
    this.setupSortable();
  }

  private renderIcon(icon: SectionIcon): string {
    const subtypeHtml = icon.subtype 
      ? `<img src="${icon.subtype}" alt="" class="absolute -top-0.5 -left-0.5 w-5 h-5 pointer-events-none drop-shadow-md" />`
      : '';
    const quantityHtml = icon.quantity > 1
      ? `<span class="absolute -bottom-0.5 -right-0.5 bg-gradient-to-br from-gray-800 to-gray-900 text-white text-xs font-bold px-1.5 py-0.5 rounded-md shadow-lg border border-white/20">${icon.quantity}</span>`
      : '';
    return `
      <div class="section-icon relative w-14 h-14 bg-black/40 rounded-lg flex items-center justify-center cursor-grab hover:bg-black/60 hover:scale-105 transition-all duration-150 select-none ring-1 ring-white/10 hover:ring-white/30" 
           data-icon-instance-id="${icon.id}" data-section-id="${this.section.id}">
        <img src="${icon.path}" alt="" class="w-11 h-11 object-contain pointer-events-none select-none drop-shadow-sm" draggable="false" />
        ${subtypeHtml}
        ${quantityHtml}
      </div>
    `;
  }

  private setupInteract(): void {
    interact(this.element)
      .draggable({
        allowFrom: '.section-box',
        ignoreFrom: '.section-icon',
        modifiers: [
          interact.modifiers.restrictRect({
            restriction: 'parent'
          })
        ],
        listeners: {
          move: (event: InteractMoveEvent) => {
            const x = this.section.x + event.dx;
            const y = this.section.y + event.dy;
            
            this.section.x = x;
            this.section.y = y;
            this.element.style.left = `${x}px`;
            this.element.style.top = `${y}px`;
          },
          end: () => {
            store.updateSection(this.section.id, {
              x: this.section.x,
              y: this.section.y
            });
          }
        }
      })
      .resizable({
        edges: { right: true, bottom: true, left: false, top: false },
        modifiers: [
          interact.modifiers.restrictSize({
            min: { width: 100, height: 60 }
          })
        ],
        listeners: {
          move: (event: InteractMoveEvent) => {
            this.section.width = event.rect.width;
            this.section.height = event.rect.height;
            this.element.style.width = `${event.rect.width}px`;
            this.element.style.height = `${event.rect.height}px`;
          },
          end: () => {
            store.updateSection(this.section.id, {
              width: this.section.width,
              height: this.section.height
            });
          }
        }
      });
  }

  private setupDropZone(): void {
    this.element.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer!.dropEffect = 'copy';
      this.element.classList.add('ring-2', 'ring-blue-500');
    });

    this.element.addEventListener('dragleave', () => {
      this.element.classList.remove('ring-2', 'ring-blue-500');
    });

    this.element.addEventListener('drop', (e) => {
      e.preventDefault();
      this.element.classList.remove('ring-2', 'ring-blue-500');
      
      try {
        const data = JSON.parse(e.dataTransfer!.getData('application/json'));
        if (data.id && data.path) {
          store.addIconToSection(this.section.id, {
            id: data.id,
            filename: data.filename,
            displayName: data.displayName,
            category: '',
            path: data.path
          });
        }
      } catch (err) {
        // Ignore invalid drops
      }
    });
  }

  private setupSortable(): void {
    const iconGrid = this.element.querySelector('.icon-grid') as HTMLElement;
    if (!iconGrid) {
      console.error('Icon grid not found');
      return;
    }

    // Small delay to ensure DOM is ready
    requestAnimationFrame(() => {
      this.sortable = Sortable.create(iconGrid, {
        group: 'icons',
        animation: 150,
        ghostClass: 'sortable-ghost',
        chosenClass: 'sortable-chosen',
        dragClass: 'sortable-drag',
        draggable: '.section-icon',
        filter: '.btn-edit, .btn-delete',
        preventOnFilter: false,
        onStart: () => {
          document.body.style.cursor = 'grabbing';
        },
        onEnd: (evt: SortableEvent) => {
          document.body.style.cursor = '';
          const iconInstanceId = evt.item.dataset.iconInstanceId;
          if (!iconInstanceId) return;
          
          const fromSection = evt.from.closest('.section') as HTMLElement | null;
          const toSection = evt.to.closest('.section') as HTMLElement | null;
          const fromSectionId = fromSection?.dataset.sectionId;
          const toSectionId = toSection?.dataset.sectionId;
          
          if (!fromSectionId || !toSectionId) return;
          
          if (fromSectionId === toSectionId) {
            // Reorder within same section
            const newOrder = Array.from(evt.to.querySelectorAll('.section-icon'))
              .map(el => (el as HTMLElement).dataset.iconInstanceId!)
              .filter(Boolean);
            store.reorderSectionIcons(toSectionId, newOrder);
          } else {
            // Move to different section
            store.moveIconBetweenSections(fromSectionId, toSectionId, iconInstanceId, evt.newIndex ?? 0);
          }
        }
      });
    });
  }

  update(section: SectionType): void {
    const oldSection = this.section;
    this.section = section;
    
    // Only update style if position/size changed
    if (oldSection.x !== section.x || oldSection.y !== section.y || 
        oldSection.width !== section.width || oldSection.height !== section.height ||
        oldSection.color !== section.color) {
      this.updateStyle();
    }
    
    // Only update title if changed
    if (oldSection.title !== section.title || oldSection.color !== section.color) {
      const header = this.element.querySelector('.section-header') as HTMLElement;
      if (header) {
        header.style.backgroundColor = section.color;
        const titleEl = header.querySelector('span');
        if (titleEl) titleEl.textContent = section.title;
      }
    }
    
    // Only re-render icons if icons changed (id, subtype, or quantity)
    const oldIconIds = oldSection.icons.map(i => `${i.id}:${i.subtype || ''}:${i.quantity}`).join(',');
    const newIconIds = section.icons.map(i => `${i.id}:${i.subtype || ''}:${i.quantity}`).join(',');
    if (oldIconIds !== newIconIds) {
      this.renderIconsOnly();
    }
  }
  
  private renderIconsOnly(): void {
    // Destroy old sortable
    if (this.sortable) {
      this.sortable.destroy();
      this.sortable = null;
    }
    
    const iconGrid = this.element.querySelector('.icon-grid');
    if (iconGrid) {
      iconGrid.innerHTML = this.section.icons.map(icon => this.renderIcon(icon)).join('');
      this.setupSortable();
    }
  }

  getElement(): HTMLElement {
    return this.element;
  }

  destroy(): void {
    this.sortable?.destroy();
    interact(this.element).unset();
    this.element.remove();
  }
}
