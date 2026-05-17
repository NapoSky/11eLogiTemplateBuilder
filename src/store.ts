import { Icon, Section, Template, IconCategory, generateId, Subtype, SectionIcon, IconScale, ICON_SCALES, ViewMode, MpfDataEntry, TodoList, TodoListItem, FactionFilter, TextBlock, TextAnchor, TemplateBackground, BackgroundPreset, DEFAULT_BACKGROUND, isValidBackground } from './types';
import { getBaseUrl } from './config';

export type { IconScale };
export { ICON_SCALES };

// Simple event emitter pattern
type Listener = () => void;

const TODOLIST_STORAGE_KEY = 'todolist';

function defaultTodoList(): TodoList {
  return {
    title: 'TODOLIST',
    autoDate: true,
    faction: 'all',
    items: [],
    textBlocks: [],
  };
}

class Store {
  private listeners: Set<Listener> = new Set();
  
  // State
  icons: Icon[] = [];
  subtypes: Subtype[] = [];
  sections: Section[] = [];
  selectedCategory: IconCategory | 'Toutes' = 'Toutes';
  searchQuery: string = '';
  iconScale: IconScale = 'medium'; // Taille globale des icônes

  // Template background (default: bleu uni)
  background: TemplateBackground = DEFAULT_BACKGROUND;
  backgroundPresets: BackgroundPreset[] = [];

  // TodoList builder state
  viewMode: ViewMode = 'template';
  mpfData: MpfDataEntry[] = [];
  todolist: TodoList = defaultTodoList();

  // Stockpile template source (shared with Toolbar for active state rendering)
  stockpileTplSource: 'current' | 'official' | 'file' = 'current';
  stockpileTplFileName: string | null = null;
  
  // Subscribe to changes
  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  
  private emit(): void {
    this.listeners.forEach(fn => fn());
  }
  
  // Actions
  setIcons(icons: Icon[]): void {
    this.icons = icons;
    this.emit();
  }
  
  setSubtypes(subtypes: Subtype[]): void {
    this.subtypes = subtypes;
    this.emit();
  }
  
  setCategory(category: IconCategory | 'Toutes'): void {
    this.selectedCategory = category;
    this.emit();
  }
  
  setSearch(query: string): void {
    this.searchQuery = query;
    this.emit();
  }
  
  setIconScale(scale: IconScale): void {
    this.iconScale = scale;
    localStorage.setItem('iconScale', scale);
    this.emit();
  }

  setBackground(bg: TemplateBackground): void {
    if (!isValidBackground(bg)) {
      console.warn('setBackground: invalid background, ignoring', bg);
      return;
    }
    this.background = bg;
    try {
      localStorage.setItem('templateBackground', JSON.stringify(bg));
    } catch (e) {
      console.warn('setBackground: failed to persist (quota?)', e);
    }
    this.emit();
  }

  setBackgroundPresets(presets: BackgroundPreset[]): void {
    this.backgroundPresets = presets;
    this.emit();
  }
  
  addSection(section: Section): void {
    this.sections = [...this.sections, section];
    this.save();
    this.emit();
  }
  
  updateSection(id: string, updates: Partial<Section>): void {
    this.sections = this.sections.map(s => 
      s.id === id ? { ...s, ...updates } : s
    );
    this.save();
    this.emit();
  }
  
  deleteSection(id: string): void {
    this.sections = this.sections.filter(s => s.id !== id);
    this.save();
    this.emit();
  }
  
  addIconToSection(sectionId: string, icon: Icon, gridRow?: number, gridCol?: number): void {
    this.sections = this.sections.map(s => {
      if (s.id !== sectionId) return s;
      
      // Trouver une position libre si non spécifiée
      let row = gridRow ?? 0;
      let col = gridCol ?? 0;
      
      if (gridRow === undefined || gridCol === undefined) {
        // Chercher la première cellule libre
        const occupied = new Set(s.icons.map(i => `${i.gridRow},${i.gridCol}`));
        const maxCols = Math.floor((s.width - 16) / 60) || 1; // 60px par cellule + padding
        let found = false;
        for (let r = 0; !found; r++) {
          for (let c = 0; c < maxCols; c++) {
            if (!occupied.has(`${r},${c}`)) {
              row = r;
              col = c;
              found = true;
              break;
            }
          }
        }
      }
      
      const sectionIcon = {
        id: generateId(),
        iconId: icon.id,
        filename: icon.filename,
        path: icon.path,
        quantity: 1,
        gridRow: row,
        gridCol: col
      };
      return { ...s, icons: [...s.icons, sectionIcon] };
    });
    this.save();
    this.emit();
  }
  
  removeIconFromSection(sectionId: string, iconInstanceId: string): void {
    this.sections = this.sections.map(s => {
      if (s.id !== sectionId) return s;
      return { ...s, icons: s.icons.filter(i => i.id !== iconInstanceId) };
    });
    this.save();
    this.emit();
  }
  
  setIconSubtype(sectionId: string, iconInstanceId: string, subtypePath: string | undefined): void {
    this.sections = this.sections.map(s => {
      if (s.id !== sectionId) return s;
      return {
        ...s,
        icons: s.icons.map(i => 
          i.id === iconInstanceId ? { ...i, subtype: subtypePath } : i
        )
      };
    });
    this.save();
    this.emit();
  }
  
  setIconQuantity(sectionId: string, iconInstanceId: string, quantity: number): void {
    this.sections = this.sections.map(s => {
      if (s.id !== sectionId) return s;
      return {
        ...s,
        icons: s.icons.map(i => 
          i.id === iconInstanceId ? { ...i, quantity: Math.max(-1, quantity) } : i
        )
      };
    });
    this.save();
    this.emit();
  }
  
  reorderSectionIcons(sectionId: string, newOrder: string[]): void {
    this.sections = this.sections.map(s => {
      if (s.id !== sectionId) return s;
      const reordered = newOrder
        .map(id => s.icons.find(i => i.id === id))
        .filter((i): i is NonNullable<typeof i> => i !== undefined);
      return { ...s, icons: reordered };
    });
    this.save();
    this.emit();
  }
  
  // Déplacer une icône vers une nouvelle position dans la grille
  moveIconToGridPosition(sectionId: string, iconInstanceId: string, gridRow: number, gridCol: number): void {
    this.sections = this.sections.map(s => {
      if (s.id !== sectionId) return s;
      
      // Vérifier si la position est déjà occupée par une autre icône
      const existingIcon = s.icons.find(i => i.gridRow === gridRow && i.gridCol === gridCol && i.id !== iconInstanceId);
      if (existingIcon) {
        // Échanger les positions
        const movingIcon = s.icons.find(i => i.id === iconInstanceId);
        if (movingIcon) {
          return {
            ...s,
            icons: s.icons.map(i => {
              if (i.id === iconInstanceId) {
                return { ...i, gridRow, gridCol };
              }
              if (i.id === existingIcon.id) {
                return { ...i, gridRow: movingIcon.gridRow, gridCol: movingIcon.gridCol };
              }
              return i;
            })
          };
        }
      }
      
      // Sinon, simplement déplacer l'icône
      return {
        ...s,
        icons: s.icons.map(i => 
          i.id === iconInstanceId ? { ...i, gridRow, gridCol } : i
        )
      };
    });
    this.save();
    this.emit();
  }
  
  moveIconBetweenSections(fromSectionId: string, toSectionId: string, iconInstanceId: string, gridRow: number, gridCol: number): void {
    const fromSection = this.sections.find(s => s.id === fromSectionId);
    if (!fromSection) return;
    
    const icon = fromSection.icons.find(i => i.id === iconInstanceId);
    if (!icon) return;
    
    // Copier l'icône avec la nouvelle position
    const movedIcon = { ...icon, gridRow, gridCol };
    
    this.sections = this.sections.map(s => {
      if (s.id === fromSectionId) {
        return { ...s, icons: s.icons.filter(i => i.id !== iconInstanceId) };
      }
      if (s.id === toSectionId) {
        // Vérifier si la position est occupée et échanger si nécessaire
        const existingIcon = s.icons.find(i => i.gridRow === gridRow && i.gridCol === gridCol);
        if (existingIcon) {
          // Retirer l'icône existante et ajouter la nouvelle
          return { 
            ...s, 
            icons: s.icons.filter(i => i.id !== existingIcon.id).concat(movedIcon)
          };
        }
        return { ...s, icons: [...s.icons, movedIcon] };
      }
      return s;
    });
    this.save();
    this.emit();
  }
  
  // ============================================================
  // TodoList builder actions
  // ============================================================

  setViewMode(mode: ViewMode): void {
    if (this.viewMode === mode) return;
    this.viewMode = mode;
    localStorage.setItem('viewMode', mode);
    this.emit();
  }

  setStockpileTplSource(source: 'current' | 'official' | 'file', fileName: string | null = null): void {
    this.stockpileTplSource = source;
    this.stockpileTplFileName = fileName;
    this.emit();
  }

  setMpfData(data: MpfDataEntry[]): void {
    this.mpfData = data;
    this.emit();
  }

  setTodoListTitle(title: string): void {
    this.todolist = { ...this.todolist, title };
    this.saveTodoList();
    this.emit();
  }

  setTodoListAutoDate(autoDate: boolean): void {
    this.todolist = { ...this.todolist, autoDate };
    this.saveTodoList();
    this.emit();
  }

  setTodoListFaction(faction: FactionFilter): void {
    this.todolist = { ...this.todolist, faction };
    this.saveTodoList();
    this.emit();
  }

  /** Returns 'added' on success, 'not-mpf' if not craftable, 'wrong-faction' if blocked by current faction filter. */
  addTodoListItemFromIcon(iconFilename: string): 'added' | 'not-mpf' | 'wrong-faction' {
    const entry = this.mpfData.find(e => e.iconFilename === iconFilename);
    if (!entry) return 'not-mpf';
    const f = this.todolist.faction;
    if (f !== 'all' && !entry.faction.includes(f)) {
      return 'wrong-faction';
    }
    const existing = this.todolist.items.find(i => i.iconFilename === iconFilename);
    if (existing) {
      this.setTodoListOrderCount(existing.id, existing.orderCount + 1);
      return 'added';
    }
    const item: TodoListItem = {
      id: generateId(),
      iconFilename: entry.iconFilename,
      itemName: entry.itemName,
      category: entry.itemCategory,
      faction: entry.faction,
      cost: entry.cost,
      maxCrates: entry.maxCrates,
      numberProduced: entry.numberProduced,
      crateBonus: entry.crateBonus,
      subtypeFilename: entry.subtypeFilename,
      orderCount: 1,
    };
    this.todolist = { ...this.todolist, items: [...this.todolist.items, item] };
    this.saveTodoList();
    this.emit();
    return 'added';
  }

  setTodoListOrderCount(itemId: string, count: number): void {
    const orderCount = Math.max(1, Math.floor(count));
    this.todolist = {
      ...this.todolist,
      items: this.todolist.items.map(i => i.id === itemId ? { ...i, orderCount } : i),
    };
    this.saveTodoList();
    this.emit();
  }

  removeTodoListItem(itemId: string): void {
    this.todolist = {
      ...this.todolist,
      items: this.todolist.items.filter(i => i.id !== itemId),
    };
    this.saveTodoList();
    this.emit();
  }

  reorderTodoListItems(category: string, orderedIds: string[]): void {
    const inCategory = this.todolist.items.filter(i => i.category === category);
    const others = this.todolist.items.filter(i => i.category !== category);
    const reordered = orderedIds
      .map(id => inCategory.find(i => i.id === id))
      .filter((i): i is TodoListItem => i !== undefined);
    const missing = inCategory.filter(i => !orderedIds.includes(i.id));
    this.todolist = { ...this.todolist, items: [...others, ...reordered, ...missing] };
    this.saveTodoList();
    this.emit();
  }

  clearTodoList(): void {
    this.todolist = defaultTodoList();
    this.saveTodoList();
    this.emit();
  }

  /**
   * Replace the current todolist content (items + textBlocks + title + autoDate)
   * while preserving the currently selected faction filter.
   */
  replaceTodoList(tl: Omit<TodoList, 'faction'>): void {
    this.todolist = {
      ...this.todolist,
      title: tl.title,
      autoDate: tl.autoDate,
      items: tl.items,
      textBlocks: tl.textBlocks,
    };
    this.saveTodoList();
    this.emit();
  }

  /** Add a text block at the given anchor; returns the new block id. */
  addTextBlock(anchor: TextAnchor): string {
    const block: TextBlock = { id: generateId(), content: '', anchor };
    this.todolist = { ...this.todolist, textBlocks: [...this.todolist.textBlocks, block] };
    this.saveTodoList();
    this.emit();
    return block.id;
  }

  updateTextBlock(id: string, patch: Partial<Pick<TextBlock, 'content' | 'anchor'>>): void {
    this.todolist = {
      ...this.todolist,
      textBlocks: this.todolist.textBlocks.map(b => b.id === id ? { ...b, ...patch } : b),
    };
    this.saveTodoList();
    this.emit();
  }

  removeTextBlock(id: string): void {
    this.todolist = {
      ...this.todolist,
      textBlocks: this.todolist.textBlocks.filter(b => b.id !== id),
    };
    this.saveTodoList();
    this.emit();
  }

  private saveTodoList(): void {
    localStorage.setItem(TODOLIST_STORAGE_KEY, JSON.stringify(this.todolist));
  }

  private loadTodoList(): void {
    try {
      const raw = localStorage.getItem(TODOLIST_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        this.todolist = {
          ...defaultTodoList(),
          ...parsed,
          items: parsed.items ?? [],
          textBlocks: parsed.textBlocks ?? [],
        };
      }
      const savedMode = localStorage.getItem('viewMode');
      if (savedMode === 'template' || savedMode === 'todolist' || savedMode === 'stockpile') {
        this.viewMode = savedMode;
      }
    } catch (e) {
      console.error('Failed to load todolist:', e);
    }
  }

  // Filtered icons getter
  get filteredIcons(): Icon[] {
    let filtered = this.icons;
    
    if (this.selectedCategory !== 'Toutes') {
      filtered = filtered.filter(i => i.category === this.selectedCategory);
    }
    
    if (this.searchQuery.trim()) {
      const q = this.searchQuery.trim().toLowerCase();
      filtered = filtered.filter(i => 
        i.displayName.toLowerCase().includes(q) ||
        i.filename.toLowerCase().includes(q)
      );
    }

    // In todolist mode, restrict to MPF-craftable icons. Apply faction filter on top.
    if (this.viewMode === 'todolist') {
      const f = this.todolist.faction;
      filtered = filtered.filter(i => {
        const entry = this.mpfData.find(e => e.iconFilename === i.filename);
        if (!entry) return false;
        if (f === 'all') return true;
        return entry.faction.includes(f);
      });
    }
    
    return filtered;
  }
  
  // Persistence
  save(): void {
    const template: Template = { sections: this.sections };
    localStorage.setItem('template', JSON.stringify(template));
  }  
  load(): void {
    try {
      // Charger la taille des icônes
      const savedScale = localStorage.getItem('iconScale') as IconScale | null;
      if (savedScale && (['small', 'medium', 'large', 'xlarge', 'xxlarge'] as string[]).includes(savedScale)) {
        this.iconScale = savedScale;
      }

      // Charger le background (avec validation, fallback default si invalide)
      const savedBg = localStorage.getItem('templateBackground');
      if (savedBg) {
        try {
          const parsed: unknown = JSON.parse(savedBg);
          if (isValidBackground(parsed)) {
            this.background = parsed;
          } else {
            console.warn('load: invalid persisted background, using default');
          }
        } catch (e) {
          console.warn('load: failed to parse persisted background', e);
        }
      }
      
      const data = localStorage.getItem('template');
      if (data) {
        const template: Template = JSON.parse(data);
        // Migrer les anciennes icônes sans gridRow/gridCol
        this.sections = (template.sections || []).map(section => ({
          ...section,
          icons: this.migrateIcons(section.icons, section.width)
        }));
        this.emit();
      }
      this.loadTodoList();
    } catch (e) {
      console.error('Failed to load template:', e);
    }
  }
  
  // Migration des icônes sans positions de grille
  private migrateIcons(icons: SectionIcon[], sectionWidth: number): SectionIcon[] {
    const CELL_SIZE = 60;
    const PADDING = 8;
    const maxCols = Math.max(1, Math.floor((sectionWidth - PADDING * 2) / CELL_SIZE));
    const occupied = new Set<string>();
    
    return icons.map((icon, index) => {
      // Si l'icône a déjà des positions valides, la garder
      if (typeof icon.gridRow === 'number' && typeof icon.gridCol === 'number') {
        occupied.add(`${icon.gridRow},${icon.gridCol}`);
        return icon;
      }
      
      // Sinon, trouver une position libre
      let row = Math.floor(index / maxCols);
      let col = index % maxCols;
      
      // S'assurer que la position n'est pas occupée
      while (occupied.has(`${row},${col}`)) {
        col++;
        if (col >= maxCols) {
          col = 0;
          row++;
        }
      }
      
      occupied.add(`${row},${col}`);
      return { ...icon, gridRow: row, gridCol: col };
    });
  }
  
  exportJSON(): string {
    const baseUrl = getBaseUrl();
    // Normaliser les chemins en retirant le BASE_URL pour portabilité
    const normalizedSections = this.sections.map(section => ({
      ...section,
      icons: section.icons.map(icon => ({
        ...icon,
        path: icon.path.startsWith(baseUrl) 
          ? icon.path.slice(baseUrl.length - 1) // Garde le / initial
          : icon.path,
        subtype: icon.subtype?.startsWith(baseUrl)
          ? icon.subtype.slice(baseUrl.length - 1)
          : icon.subtype
      }))
    }));
    const template: Template = { sections: normalizedSections, iconScale: this.iconScale, background: this.background };
    return JSON.stringify(template, null, 2);
  }
  
  importJSON(json: string): void {
    try {
      const template: Template = JSON.parse(json);
      const baseUrl = getBaseUrl();
      // Restaurer la taille des icônes si présente dans le template
      const validScales: IconScale[] = ['small', 'medium', 'large', 'xlarge', 'xxlarge'];
      if (template.iconScale && validScales.includes(template.iconScale)) {
        this.iconScale = template.iconScale;
        localStorage.setItem('iconScale', template.iconScale);
      }

      // Restaurer le background : 3 cas (preset / upload / url / color), avec
      // fallback default si absent (template legacy) ou malformé.
      if (template.background === undefined) {
        this.background = DEFAULT_BACKGROUND;
      } else if (isValidBackground(template.background)) {
        this.background = template.background;
      } else {
        console.warn('importJSON: invalid background, using default', template.background);
        this.background = DEFAULT_BACKGROUND;
      }
      try {
        localStorage.setItem('templateBackground', JSON.stringify(this.background));
      } catch (e) {
        console.warn('importJSON: failed to persist background', e);
      }
      // Restaurer les chemins avec le BASE_URL courant
      this.sections = (template.sections || []).map(section => ({
        ...section,
        icons: this.migrateIcons(section.icons, section.width).map(icon => ({
          ...icon,
          path: icon.path.startsWith('/assets') 
            ? baseUrl.slice(0, -1) + icon.path // Ajoute le baseUrl sans le / final
            : icon.path,
          subtype: icon.subtype?.startsWith('/assets')
            ? baseUrl.slice(0, -1) + icon.subtype
            : icon.subtype
        }))
      }));
      this.save();
      this.emit();
    } catch (e) {
      console.error('Failed to import template:', e);
    }
  }
}

export const store = new Store();
