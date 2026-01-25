import { Icon, Section, Template, IconCategory, generateId, Subtype, SectionIcon } from './types';

// Simple event emitter pattern
type Listener = () => void;

// Tailles d'icônes disponibles
export type IconScale = 'small' | 'medium' | 'large';
export const ICON_SCALES: Record<IconScale, { cell: number; icon: number; img: number }> = {
  small: { cell: 52, icon: 48, img: 38 },
  medium: { cell: 64, icon: 58, img: 46 },
  large: { cell: 76, icon: 70, img: 56 }
};

class Store {
  private listeners: Set<Listener> = new Set();
  
  // State
  icons: Icon[] = [];
  subtypes: Subtype[] = [];
  sections: Section[] = [];
  selectedCategory: IconCategory | 'Toutes' = 'Toutes';
  searchQuery: string = '';
  iconScale: IconScale = 'medium'; // Taille globale des icônes
  
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
          i.id === iconInstanceId ? { ...i, quantity: Math.max(1, quantity) } : i
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
  
  // Filtered icons getter
  get filteredIcons(): Icon[] {
    let filtered = this.icons;
    
    if (this.selectedCategory !== 'Toutes') {
      filtered = filtered.filter(i => i.category === this.selectedCategory);
    }
    
    if (this.searchQuery.trim()) {
      const q = this.searchQuery.toLowerCase();
      filtered = filtered.filter(i => 
        i.displayName.toLowerCase().includes(q) ||
        i.filename.toLowerCase().includes(q)
      );
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
      if (savedScale && ['small', 'medium', 'large'].includes(savedScale)) {
        this.iconScale = savedScale;
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
    return JSON.stringify({ sections: this.sections }, null, 2);
  }
  
  importJSON(json: string): void {
    try {
      const template: Template = JSON.parse(json);
      // Migrer les anciennes icônes sans gridRow/gridCol
      this.sections = (template.sections || []).map(section => ({
        ...section,
        icons: this.migrateIcons(section.icons, section.width)
      }));
      this.save();
      this.emit();
    } catch (e) {
      console.error('Failed to import template:', e);
    }
  }
}

export const store = new Store();
