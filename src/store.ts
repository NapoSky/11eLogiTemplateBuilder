import { Icon, Section, Template, IconCategory, generateId, Subtype } from './types';

// Simple event emitter pattern
type Listener = () => void;

class Store {
  private listeners: Set<Listener> = new Set();
  
  // State
  icons: Icon[] = [];
  subtypes: Subtype[] = [];
  sections: Section[] = [];
  selectedCategory: IconCategory | 'Toutes' = 'Toutes';
  searchQuery: string = '';
  
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
  
  addIconToSection(sectionId: string, icon: Icon): void {
    this.sections = this.sections.map(s => {
      if (s.id !== sectionId) return s;
      const sectionIcon = {
        id: generateId(),
        iconId: icon.id,
        filename: icon.filename,
        path: icon.path,
        quantity: 1
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
  
  moveIconBetweenSections(fromSectionId: string, toSectionId: string, iconInstanceId: string, newIndex: number): void {
    const fromSection = this.sections.find(s => s.id === fromSectionId);
    if (!fromSection) return;
    
    const icon = fromSection.icons.find(i => i.id === iconInstanceId);
    if (!icon) return;
    
    this.sections = this.sections.map(s => {
      if (s.id === fromSectionId) {
        return { ...s, icons: s.icons.filter(i => i.id !== iconInstanceId) };
      }
      if (s.id === toSectionId) {
        const newIcons = [...s.icons];
        newIcons.splice(newIndex, 0, icon);
        return { ...s, icons: newIcons };
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
      const data = localStorage.getItem('template');
      if (data) {
        const template: Template = JSON.parse(data);
        this.sections = template.sections || [];
        this.emit();
      }
    } catch (e) {
      console.error('Failed to load template:', e);
    }
  }
  
  exportJSON(): string {
    return JSON.stringify({ sections: this.sections }, null, 2);
  }
  
  importJSON(json: string): void {
    try {
      const template: Template = JSON.parse(json);
      this.sections = template.sections || [];
      this.save();
      this.emit();
    } catch (e) {
      console.error('Failed to import template:', e);
    }
  }
}

export const store = new Store();
