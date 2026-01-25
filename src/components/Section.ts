import interact from 'interactjs';
import { store, ICON_SCALES } from '../store';
import { Section as SectionType, SectionIcon } from '../types';

interface InteractMoveEvent {
  dx: number;
  dy: number;
  rect: { width: number; height: number };
}

// Constantes pour le layout
const TITLE_HEIGHT = 32; // Hauteur du titre au-dessus
const PADDING = 6; // Padding interne

export class SectionComponent {
  private element: HTMLElement;
  private section: SectionType;
  private onDelete: (id: string) => void;
  private onEdit: (id: string) => void;
  private draggedIconId: string | null = null;

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

  private getCellSize(): number {
    return ICON_SCALES[store.iconScale].cell;
  }

  private getGridDimensions(): { cols: number; rows: number } {
    const cellSize = this.getCellSize();
    const contentWidth = this.section.width - PADDING * 2;
    const contentHeight = this.section.height - TITLE_HEIGHT - PADDING * 2;
    return {
      cols: Math.max(1, Math.floor(contentWidth / cellSize)),
      rows: Math.max(1, Math.floor(contentHeight / cellSize))
    };
  }

  private updateStyle(): void {
    this.element.style.left = `${this.section.x}px`;
    this.element.style.top = `${this.section.y}px`;
    this.element.style.width = `${this.section.width}px`;
    this.element.style.height = `${this.section.height}px`;
  }

  private render(): void {
    const color = this.section.color;
    const { cols, rows } = this.getGridDimensions();
    const cellSize = this.getCellSize();
    
    // Design épuré : titre AU-DESSUS du cadre, pas de header intégré
    this.element.innerHTML = `
      <!-- Titre au-dessus du cadre -->
      <div class="section-title-container flex items-center justify-center gap-2 mb-0.5" style="height: ${TITLE_HEIGHT}px;">
        <span class="section-title text-xl font-bold text-white tracking-wider"
              style="text-shadow: 0 0 8px rgba(0,0,0,1), 0 2px 4px rgba(0,0,0,0.9), 0 4px 8px rgba(0,0,0,0.7);">
          ${this.section.title}
        </span>
        <div class="section-controls flex gap-1 opacity-0 transition-opacity duration-200">
          <button class="btn-edit p-0.5 bg-black/40 hover:bg-white/25 rounded transition-colors" title="Éditer">
            <svg class="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/>
            </svg>
          </button>
          <button class="btn-delete p-0.5 bg-black/40 hover:bg-red-500/60 rounded transition-colors" title="Supprimer">
            <svg class="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>
      </div>
      
      <!-- Cadre simple et épuré -->
      <div class="section-box relative rounded-lg overflow-hidden" 
           style="height: calc(100% - ${TITLE_HEIGHT}px); background: rgba(0,0,0,0.35); border: 2px solid ${color};">
        
        <!-- Content area with CSS Grid -->
        <div class="section-content p-1.5 h-full overflow-hidden">
          <div class="icon-grid relative" style="
            display: grid;
            grid-template-columns: repeat(${cols}, ${cellSize}px);
            grid-template-rows: repeat(${rows}, ${cellSize}px);
            gap: 0;
          ">
            ${this.renderGridCells(cols, rows)}
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
    
    this.setupIconDragDrop();
  }

  private renderGridCells(cols: number, rows: number): string {
    const cells: string[] = [];
    const iconsByPosition = new Map<string, SectionIcon>();
    const cellSize = this.getCellSize();
    const { icon: iconSize, img: imgSize } = ICON_SCALES[store.iconScale];
    
    // Mapper les icônes par position
    for (const icon of this.section.icons) {
      const key = `${icon.gridRow},${icon.gridCol}`;
      iconsByPosition.set(key, icon);
    }
    
    // Générer les cellules de la grille
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const key = `${row},${col}`;
        const icon = iconsByPosition.get(key);
        
        if (icon) {
          cells.push(this.renderIcon(icon, row, col, cellSize, iconSize, imgSize));
        } else {
          // Cellule vide (drop target)
          cells.push(`
            <div class="grid-cell empty-cell flex items-center justify-center rounded transition-all duration-150"
                 data-row="${row}" data-col="${col}"
                 style="grid-row: ${row + 1}; grid-column: ${col + 1}; width: ${cellSize}px; height: ${cellSize}px;">
              <div style="width: ${iconSize}px; height: ${iconSize}px;" class="border-2 border-dashed border-white/5 rounded opacity-0 hover:opacity-100 hover:border-white/20 transition-opacity"></div>
            </div>
          `);
        }
      }
    }
    
    // Ajouter les icônes qui sont hors de la grille visible
    for (const icon of this.section.icons) {
      if (icon.gridRow >= rows || icon.gridCol >= cols) {
        cells.push(this.renderIcon(icon, icon.gridRow, icon.gridCol, cellSize, iconSize, imgSize));
      }
    }
    
    return cells.join('');
  }

  private renderIcon(icon: SectionIcon, row: number, col: number, cellSize: number, iconSize: number, imgSize: number): string {
    const subtypeSize = Math.round(imgSize * 0.4);
    const subtypeHtml = icon.subtype 
      ? `<img src="${icon.subtype}" alt="" class="absolute -top-0.5 -left-0.5 pointer-events-none drop-shadow-md" style="width: ${subtypeSize}px; height: ${subtypeSize}px;" />`
      : '';
    let quantityHtml = '';
    if (icon.quantity === 0) {
      quantityHtml = `<span class="absolute -bottom-0.5 -right-0.5 bg-gradient-to-br from-amber-600 to-amber-800 text-white text-sm font-bold px-1.5 py-0.5 rounded shadow-lg border border-white/20">★</span>`;
    } else if (icon.quantity === -1) {
      quantityHtml = `<span class="absolute -bottom-0.5 -right-0.5 bg-gradient-to-br from-purple-600 to-purple-800 text-white text-sm font-bold px-1.5 py-0.5 rounded shadow-lg border border-white/20">?</span>`;
    } else if (icon.quantity > 1) {
      quantityHtml = `<span class="absolute -bottom-0.5 -right-0.5 bg-gradient-to-br from-gray-800 to-gray-900 text-white text-sm font-bold px-1.5 py-0.5 rounded shadow-lg border border-white/20">${icon.quantity}</span>`;
    }
    
    return `
      <div class="grid-cell icon-cell flex items-center justify-center"
           data-row="${row}" data-col="${col}"
           style="grid-row: ${row + 1}; grid-column: ${col + 1}; width: ${cellSize}px; height: ${cellSize}px;">
        <div class="section-icon relative bg-black/30 rounded flex items-center justify-center cursor-grab hover:bg-black/50 hover:scale-105 transition-all duration-150 select-none ring-1 ring-white/10 hover:ring-white/25" 
             style="width: ${iconSize}px; height: ${iconSize}px;"
             data-icon-instance-id="${icon.id}" data-section-id="${this.section.id}" draggable="true">
          <img src="${icon.path}" alt="" style="width: ${imgSize}px; height: ${imgSize}px;" class="object-contain pointer-events-none select-none drop-shadow-sm" draggable="false" />
          ${subtypeHtml}
          ${quantityHtml}
        </div>
      </div>
    `;
  }

  private setupIconDragDrop(): void {
    const iconGrid = this.element.querySelector('.icon-grid') as HTMLElement;
    if (!iconGrid) return;

    // Drag start sur les icônes
    iconGrid.addEventListener('dragstart', (e) => {
      const iconEl = (e.target as HTMLElement).closest('.section-icon') as HTMLElement;
      if (!iconEl) return;
      
      this.draggedIconId = iconEl.dataset.iconInstanceId || null;
      iconEl.classList.add('opacity-50');
      
      e.dataTransfer!.effectAllowed = 'move';
      e.dataTransfer!.setData('text/plain', this.draggedIconId || '');
      e.dataTransfer!.setData('application/x-section-icon', JSON.stringify({
        iconInstanceId: this.draggedIconId,
        fromSectionId: this.section.id
      }));
    });

    // Drag end
    iconGrid.addEventListener('dragend', (e) => {
      const iconEl = (e.target as HTMLElement).closest('.section-icon') as HTMLElement;
      if (iconEl) {
        iconEl.classList.remove('opacity-50');
      }
      this.draggedIconId = null;
      
      // Nettoyer les highlights
      iconGrid.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
    });

    // Drag over sur les cellules
    iconGrid.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer!.dropEffect = 'move';
      
      const cell = (e.target as HTMLElement).closest('.grid-cell') as HTMLElement;
      if (cell && !cell.classList.contains('drag-over')) {
        iconGrid.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
        cell.classList.add('drag-over');
      }
    });

    // Drag leave
    iconGrid.addEventListener('dragleave', (e) => {
      const cell = (e.target as HTMLElement).closest('.grid-cell') as HTMLElement;
      if (cell && !cell.contains(e.relatedTarget as Node)) {
        cell.classList.remove('drag-over');
      }
    });

    // Drop sur les cellules
    iconGrid.addEventListener('drop', (e) => {
      e.preventDefault();
      
      const cell = (e.target as HTMLElement).closest('.grid-cell') as HTMLElement;
      if (!cell) return;
      
      const row = parseInt(cell.dataset.row || '0');
      const col = parseInt(cell.dataset.col || '0');
      
      // Vérifier si c'est un déplacement interne
      const internalData = e.dataTransfer!.getData('application/x-section-icon');
      if (internalData) {
        try {
          const { iconInstanceId, fromSectionId } = JSON.parse(internalData);
          
          if (fromSectionId === this.section.id) {
            // Déplacement dans la même section
            store.moveIconToGridPosition(this.section.id, iconInstanceId, row, col);
          } else {
            // Déplacement entre sections
            store.moveIconBetweenSections(fromSectionId, this.section.id, iconInstanceId, row, col);
          }
        } catch (err) {
          console.error('Invalid internal drag data', err);
        }
      }
      
      // Nettoyer
      iconGrid.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
    });
  }

  private setupInteract(): void {
    interact(this.element)
      .draggable({
        allowFrom: '.section-title-container, .section-box',
        ignoreFrom: '.section-icon, .btn-edit, .btn-delete',
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
            min: { width: 80, height: 60 }
          })
        ],
        listeners: {
          move: (event: InteractMoveEvent) => {
            this.section.width = event.rect.width;
            this.section.height = event.rect.height;
            this.element.style.width = `${event.rect.width}px`;
            this.element.style.height = `${event.rect.height}px`;
            
            // Re-render grid on resize
            this.renderGridOnly();
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
    // Drop depuis la sidebar (nouvelles icônes)
    this.element.addEventListener('dragover', (e) => {
      // Vérifier si c'est un drop depuis la sidebar (pas un déplacement interne)
      if (!e.dataTransfer?.types.includes('application/x-section-icon')) {
        e.preventDefault();
        e.dataTransfer!.dropEffect = 'copy';
        this.element.querySelector('.section-box')?.classList.add('ring-2', 'ring-blue-500');
      }
    });

    this.element.addEventListener('dragleave', (e) => {
      if (!this.element.contains(e.relatedTarget as Node)) {
        this.element.querySelector('.section-box')?.classList.remove('ring-2', 'ring-blue-500');
      }
    });

    this.element.addEventListener('drop', (e) => {
      // Ne traiter que les drops depuis la sidebar
      if (e.dataTransfer?.types.includes('application/x-section-icon')) {
        return; // Laissé au handler de la grille
      }
      
      e.preventDefault();
      this.element.querySelector('.section-box')?.classList.remove('ring-2', 'ring-blue-500');
      
      try {
        const data = JSON.parse(e.dataTransfer!.getData('application/json'));
        if (data.id && data.path) {
          // Calculer la position de drop dans la grille
          const iconGrid = this.element.querySelector('.icon-grid') as HTMLElement;
          const cellSize = this.getCellSize();
          if (iconGrid) {
            const rect = iconGrid.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            const col = Math.max(0, Math.floor(x / cellSize));
            const row = Math.max(0, Math.floor(y / cellSize));
            
            store.addIconToSection(this.section.id, {
              id: data.id,
              filename: data.filename,
              displayName: data.displayName,
              category: '',
              path: data.path
            }, row, col);
          } else {
            store.addIconToSection(this.section.id, {
              id: data.id,
              filename: data.filename,
              displayName: data.displayName,
              category: '',
              path: data.path
            });
          }
        }
      } catch (err) {
        // Ignore invalid drops
      }
    });
  }

  private renderGridOnly(): void {
    const { cols, rows } = this.getGridDimensions();
    const cellSize = this.getCellSize();
    const iconGrid = this.element.querySelector('.icon-grid') as HTMLElement;
    if (iconGrid) {
      iconGrid.style.gridTemplateColumns = `repeat(${cols}, ${cellSize}px)`;
      iconGrid.style.gridTemplateRows = `repeat(${rows}, ${cellSize}px)`;
      iconGrid.innerHTML = this.renderGridCells(cols, rows);
      this.setupIconDragDrop();
    }
  }

  update(section: SectionType): void {
    const oldSection = this.section;
    this.section = section;
    
    // Only update style if position/size changed
    if (oldSection.x !== section.x || oldSection.y !== section.y || 
        oldSection.width !== section.width || oldSection.height !== section.height) {
      this.updateStyle();
    }
    
    // Re-render si la taille, le titre, la couleur ou les icônes changent
    const needsRerender = 
      oldSection.width !== section.width ||
      oldSection.height !== section.height ||
      oldSection.title !== section.title ||
      oldSection.color !== section.color ||
      this.iconsChanged(oldSection.icons, section.icons);
    
    if (needsRerender) {
      this.render();
    }
  }
  
  private iconsChanged(oldIcons: SectionIcon[], newIcons: SectionIcon[]): boolean {
    if (oldIcons.length !== newIcons.length) return true;
    
    for (let i = 0; i < oldIcons.length; i++) {
      const oldIcon = oldIcons[i];
      const newIcon = newIcons.find(ic => ic.id === oldIcon.id);
      if (!newIcon) return true;
      if (oldIcon.gridRow !== newIcon.gridRow || 
          oldIcon.gridCol !== newIcon.gridCol ||
          oldIcon.subtype !== newIcon.subtype ||
          oldIcon.quantity !== newIcon.quantity) {
        return true;
      }
    }
    return false;
  }

  getElement(): HTMLElement {
    return this.element;
  }

  destroy(): void {
    interact(this.element).unset();
    this.element.remove();
  }
}
