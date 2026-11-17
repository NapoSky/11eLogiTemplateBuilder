import { Icon, Section, Template, IconCategory, CATEGORIES, generateId, Subtype, SectionIcon, IconScale, ICON_SCALES, ViewMode, MpfDataEntry, TodoList, TodoListItem, TodoProductionEntry, TodoCategory, TODO_CATEGORIES, ProductionSource, ProductionRunProfile, ProductionWorkspace, FactionFilter, TextBlock, TextAnchor, TemplateBackground, BackgroundPreset, DEFAULT_BACKGROUND, isValidBackground } from './types';
import { getBaseUrl } from './config';
import type { ItemDataEntry, QuantityMode } from './services/gameData';
import { canonicalIconFilename, migrateSectionIcon, migrateTodoListItem } from './services/iconPaths';
import { FACTORY_QUEUE_CAPACITY, factoryCrateLimit, factoryTodoEntries, normalizeFactoryQueueItems, LoadingTransport } from './services/productionPlanner';
import { orderCrateCount, productionSource } from './services/mpfCalculator';

export type { IconScale };
export { ICON_SCALES };
// Transient menu selection only; icon and saved document categories stay unchanged.
export type SidebarCategory = IconCategory | TodoCategory | 'Toutes';

// Simple event emitter pattern
type Listener = () => void;

const TODOLIST_STORAGE_KEY = 'todolist';
const RUN_STORAGE_KEY = 'productionRun';
const RUN_QUEUE_BACKUP_KEY = 'productionRun_beforeSingleQueue';
const RUN_ORDER_BACKUP_KEY = 'productionRun_beforeSingleOrder';
const RUN_FACTORY_BACKUP_KEY = 'productionRun_beforeFactoryCapacity';

/** One queue per category: mixed Factory crates, or the latest selected MPF asset. */
function runQueueItems(items: TodoListItem[], source: ProductionSource): TodoListItem[] {
  if (source === 'factory') return normalizeFactoryQueueItems(items);
  const selected = new Map<TodoListItem['category'], TodoListItem>();
  for (const item of items) selected.set(item.category, item.orderCount === 1 ? item : { ...item, orderCount: 1 });
  return [...selected.values()];
}

function defaultTodoList(): TodoList {
  return {
    title: 'TODOLIST',
    autoDate: true,
    faction: 'all',
    items: [],
    textBlocks: [],
  };
}

function defaultProductionRun(source: ProductionSource = 'factory'): TodoList {
  return { ...defaultTodoList(), title: source === 'factory' ? 'Factory run' : 'MPF run', autoDate: false, productionSource: source };
}

function defaultProductionRuns(): Record<ProductionSource, [TodoList, TodoList]> {
  return { factory: [defaultProductionRun('factory'), defaultProductionRun('factory')], mpf: [defaultProductionRun('mpf'), defaultProductionRun('mpf')] };
}

function readProductionRun(value: unknown, source: ProductionSource): TodoList {
  const document = value as TodoList;
  if (!document || typeof document !== 'object' || !Array.isArray(document.items) ||
    (document.textBlocks !== undefined && !Array.isArray(document.textBlocks))) throw new Error('Invalid production run');
  return {
    ...defaultProductionRun(source), ...document, productionSource: source,
    items: document.items.map(migrateTodoListItem), textBlocks: document.textBlocks ?? [],
  };
}

class Store {
  private listeners: Set<Listener> = new Set();
  
  // State
  icons: Icon[] = [];
  subtypes: Subtype[] = [];
  sections: Section[] = [];
  selectedCategory: SidebarCategory = 'Toutes';
  searchQuery: string = '';
  iconScale: IconScale = 'medium'; // Taille globale des icônes

  // Template background (default: bleu uni)
  background: TemplateBackground = DEFAULT_BACKGROUND;
  backgroundPresets: BackgroundPreset[] = [];

  // TodoList builder state
  viewMode: ViewMode = 'template';
  mpfData: MpfDataEntry[] = [];
  itemData: ItemDataEntry[] = [];
  quantityMode: QuantityMode = 'legacy';
  todolist: TodoList = defaultTodoList();
  private productionRuns = defaultProductionRuns();
  private selectedRunProfiles: Record<ProductionSource, ProductionRunProfile> = { factory: 1, mpf: 1 };
  productionRun: TodoList = this.productionRuns.factory[0];
  productionWorkspace: ProductionWorkspace = 'todolist';
  private mpfRunTransports: [LoadingTransport, LoadingTransport] = ['truck', 'truck'];
  factoryCombinedLoading = false;

  get productionRunSource(): ProductionSource {
    return this.productionRun.productionSource === 'mpf' ? 'mpf' : 'factory';
  }

  get productionRunTransport(): LoadingTransport {
    return this.productionRunSource === 'factory' ? 'truck' : this.mpfRunTransports[this.productionRunProfile - 1];
  }

  getProductionRunProfile(source: ProductionSource): ProductionRunProfile {
    return this.selectedRunProfiles[source];
  }

  get productionRunProfile(): ProductionRunProfile {
    return this.getProductionRunProfile(this.productionRunSource);
  }

  getProductionRunItems(source: ProductionSource, profile: ProductionRunProfile): readonly TodoListItem[] {
    return source === this.productionRunSource && profile === this.productionRunProfile
      ? this.productionRun.items : this.productionRuns[source][profile - 1].items;
  }

  get productionLoadingItems(): TodoListItem[] {
    return this.productionRunSource === 'factory' && this.factoryCombinedLoading
      ? ([1, 2] as const).flatMap(profile => this.getProductionRunItems('factory', profile))
      : this.productionRun.items;
  }

  // Template faction filter (persisted)
  templateFaction: FactionFilter = 'all';

  // Stockpile template source (shared with Toolbar for active state rendering)
  stockpileTplSource: 'current' | 'official' | 'official-colonial' | 'file' = 'current';
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
  
  setCategory(category: SidebarCategory): void {
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
        const maxCols = this.getGridColumns(s.width);
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
      // Un dépôt explicite remplace la case entière, quantité et subtype compris.
      return { ...s, icons: s.icons.filter(i => i.gridRow !== row || i.gridCol !== col).concat(sectionIcon) };
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
    if (fromSectionId === toSectionId) {
      this.moveIconToGridPosition(fromSectionId, iconInstanceId, gridRow, gridCol);
      return;
    }
    const fromSection = this.sections.find(s => s.id === fromSectionId);
    if (!fromSection || !this.sections.some(s => s.id === toSectionId)) return;
    
    const icon = fromSection.icons.find(i => i.id === iconInstanceId);
    if (!icon) return;
    
    // Copier l'icône avec la nouvelle position
    const movedIcon = { ...icon, gridRow, gridCol };
    
    this.sections = this.sections.map(s => {
      if (s.id === fromSectionId) {
        return { ...s, icons: s.icons.filter(i => i.id !== iconInstanceId) };
      }
      if (s.id === toSectionId) {
        // Remplacer tout occupant de la case, en conservant l'icône transférée.
        return { ...s, icons: s.icons.filter(i => i.gridRow !== gridRow || i.gridCol !== gridCol).concat(movedIcon) };
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
    if (this.selectedCategory !== 'Toutes' && !this.availableIconCategories.includes(this.selectedCategory)) {
      this.selectedCategory = 'Toutes';
    }
    localStorage.setItem('viewMode', mode);
    this.emit();
  }

  setStockpileTplSource(source: 'current' | 'official' | 'official-colonial' | 'file', fileName: string | null = null): void {
    this.stockpileTplSource = source;
    this.stockpileTplFileName = fileName;
    this.emit();
  }

  setMpfData(data: MpfDataEntry[]): void {
    this.mpfData = data;
    this.emit();
  }

  setItemData(data: ItemDataEntry[]): void {
    this.itemData = data;
    this.emit();
  }

  useCrateEquivalentQuantities(): void {
    this.quantityMode = 'crate-equivalents-v1';
    this.save();
    this.emit();
  }

  getProductionDocument(workspace: ProductionWorkspace): TodoList {
    return workspace === 'run' ? this.productionRun : this.todolist;
  }

  get productionDocument(): TodoList {
    return this.getProductionDocument(this.productionWorkspace);
  }

  /** Existing callers target the regiment todo unless a workspace is explicit. */
  private updateProductionDocument(workspace: ProductionWorkspace, update: (document: TodoList) => TodoList): void {
    const updated = update(this.getProductionDocument(workspace));
    const document = workspace === 'run' ? { ...updated, items: runQueueItems(updated.items, updated.productionSource ?? 'mpf') } : updated;
    if (workspace === 'run') this.productionRun = document; else this.todolist = document;
    this.saveTodoList(workspace);
    this.emit();
  }

  setProductionWorkspace(workspace: ProductionWorkspace): void {
    this.productionWorkspace = workspace;
    this.selectedCategory = 'Toutes';
    this.searchQuery = '';
    localStorage.setItem('productionWorkspace', workspace);
    this.emit();
  }

  setProductionRunTransport(transport: LoadingTransport): void {
    if (this.productionRunSource !== 'mpf') return;
    this.mpfRunTransports[this.productionRunProfile - 1] = transport;
    this.saveTodoList('run');
    this.emit();
  }

  setFactoryCombinedLoading(enabled: boolean): void {
    if (this.productionRunSource !== 'factory') return;
    this.factoryCombinedLoading = enabled;
    this.saveTodoList('run');
    this.emit();
  }

  setTodoListTitle(title: string, workspace: ProductionWorkspace = 'todolist'): void {
    this.updateProductionDocument(workspace, document => ({ ...document, title }));
  }

  setTodoListAutoDate(autoDate: boolean, workspace: ProductionWorkspace = 'todolist'): void {
    this.updateProductionDocument(workspace, document => ({ ...document, autoDate }));
  }

  setTodoListFaction(faction: FactionFilter, workspace: ProductionWorkspace = 'todolist'): void {
    this.updateProductionDocument(workspace, document => ({ ...document, faction }));
  }

  setTodoListProductionSource(source: ProductionSource, workspace: ProductionWorkspace = 'todolist'): void {
    if (workspace !== 'run') return;
    this.productionRuns[this.productionRunSource][this.productionRunProfile - 1] = this.productionRun;
    this.productionRun = this.productionRuns[source][this.getProductionRunProfile(source) - 1];
    this.selectedCategory = 'Toutes';
    this.searchQuery = '';
    this.saveTodoList('run');
    this.emit();
  }

  setProductionRunProfile(profile: ProductionRunProfile): void {
    if ((profile !== 1 && profile !== 2) || profile === this.productionRunProfile) return;
    const source = this.productionRunSource;
    this.productionRuns[source][this.productionRunProfile - 1] = this.productionRun;
    this.selectedRunProfiles[source] = profile;
    this.productionRun = this.productionRuns[source][profile - 1];
    this.saveTodoList('run');
    this.emit();
  }

  get factoryTodoData(): TodoProductionEntry[] {
    return factoryTodoEntries(this.itemData, this.icons, this.mpfData);
  }

  get todoProductionData(): TodoProductionEntry[] {
    return this.productionDataFor(this.productionWorkspace);
  }

  private productionDataFor(workspace: ProductionWorkspace): TodoProductionEntry[] {
    return workspace === 'run' && this.productionRunSource === 'factory' ? this.factoryTodoData
      : this.mpfData.map(entry => ({ ...entry, category: entry.itemCategory }));
  }

  setTemplateFaction(faction: FactionFilter): void {
    this.templateFaction = faction;
    localStorage.setItem('templateFaction', faction);
    this.emit();
  }

  /** Factory additions consume free crates in their category and never replace another asset. */
  addTodoListItemFromIcon(iconFilename: string, workspace: ProductionWorkspace = 'todolist'): 'added' | 'not-mpf' | 'wrong-faction' | 'category-full' {
    const document = this.getProductionDocument(workspace);
    const source = workspace === 'run' ? this.productionRunSource : 'mpf';
    const entry = this.productionDataFor(workspace).find(e => canonicalIconFilename(e.iconFilename) === canonicalIconFilename(iconFilename));
    if (!entry) return 'not-mpf';
    const f = document.faction;
    if (f !== 'all' && !entry.faction.includes(f)) {
      return 'wrong-faction';
    }
    const existing = document.items.find(i => canonicalIconFilename(i.iconFilename) === canonicalIconFilename(iconFilename) && productionSource(i) === source);
    if (existing) {
      if (workspace === 'todolist') this.setTodoListOrderCount(existing.id, existing.orderCount + 1, workspace);
      return 'added';
    }
    const freeCrates = workspace === 'run' && source === 'factory' ? factoryCrateLimit(document.items, entry.category) : entry.maxCrates;
    if (freeCrates === 0) return 'category-full';
    const item: TodoListItem = {
      id: generateId(),
      iconFilename: entry.iconFilename,
      itemName: entry.itemName,
      category: entry.category,
      faction: [...entry.faction],
      cost: { ...entry.cost },
      maxCrates: entry.maxCrates,
      numberProduced: entry.numberProduced,
      crateBonus: entry.crateBonus,
      subtypeFilename: entry.subtypeFilename,
      orderCount: 1,
      ...(source === 'factory' ? { productionSource: source } : {}),
      ...(freeCrates < entry.maxCrates ? { cratesPerOrder: freeCrates } : {}),
    };
    this.updateProductionDocument(workspace, current => ({ ...current, items: [...current.items, item] }));
    return 'added';
  }

  setTodoListOrderCount(itemId: string, count: number, workspace: ProductionWorkspace = 'todolist'): void {
    if (workspace === 'run' || !Number.isFinite(count)) return;
    const orderCount = Math.max(1, Math.floor(count));
    this.updateProductionDocument(workspace, document => ({
      ...document, items: document.items.map(i => i.id === itemId ? { ...i, orderCount } : i),
    }));
  }

  setTodoListCratesPerOrder(itemId: string, count: number, workspace: ProductionWorkspace = 'todolist'): void {
    if (workspace !== 'run' || !Number.isFinite(count)) return;
    this.updateProductionDocument(workspace, document => ({
      ...document,
      items: document.items.map(item => item.id === itemId
        ? { ...item, cratesPerOrder: Math.min(orderCrateCount({ ...item, cratesPerOrder: count }),
          this.productionRunSource === 'factory' ? factoryCrateLimit(document.items, item.category, item.id) : item.maxCrates) } : item),
    }));
  }

  removeTodoListItem(itemId: string, workspace: ProductionWorkspace = 'todolist'): void {
    this.updateProductionDocument(workspace, document => ({ ...document, items: document.items.filter(i => i.id !== itemId) }));
  }

  reorderTodoListItems(category: string, orderedIds: string[], workspace: ProductionWorkspace = 'todolist'): void {
    const document = this.getProductionDocument(workspace);
    const inCategory = document.items.filter(i => i.category === category);
    const others = document.items.filter(i => i.category !== category);
    const reordered = orderedIds
      .map(id => inCategory.find(i => i.id === id))
      .filter((i): i is TodoListItem => i !== undefined);
    const missing = inCategory.filter(i => !orderedIds.includes(i.id));
    this.updateProductionDocument(workspace, current => ({ ...current, items: [...others, ...reordered, ...missing] }));
  }

  clearTodoList(): void {
    this.updateProductionDocument('todolist', () => defaultTodoList());
  }

  clearProductionRun(): void {
    const source = this.productionRunSource;
    this.updateProductionDocument('run', () => defaultProductionRun(source));
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
      items: tl.items.map(migrateTodoListItem),
      textBlocks: tl.textBlocks,
      productionSource: tl.productionSource ?? 'mpf',
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

  private saveTodoList(workspace: ProductionWorkspace = 'todolist'): void {
    const current = this.getProductionDocument(workspace);
    const document = { ...current, items: current.items.map(migrateTodoListItem) };
    if (workspace === 'run') this.productionRun = document; else this.todolist = document;
    if (workspace === 'run') {
      this.productionRuns[this.productionRunSource][this.productionRunProfile - 1] = document;
      localStorage.setItem(RUN_STORAGE_KEY, JSON.stringify({
        version: 3, source: this.productionRunSource, selectedProfiles: this.selectedRunProfiles,
        runs: this.productionRuns, mpfTransports: this.mpfRunTransports, factoryCombinedLoading: this.factoryCombinedLoading,
      }));
    } else {
      localStorage.setItem(TODOLIST_STORAGE_KEY, JSON.stringify(document));
    }
  }

  private loadTodoList(): void {
    try {
      const raw = localStorage.getItem(TODOLIST_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        this.todolist = {
          ...defaultTodoList(),
          ...parsed,
          items: (parsed.items ?? []).map(migrateTodoListItem),
          textBlocks: parsed.textBlocks ?? [],
        };
      }
      const savedMode = localStorage.getItem('viewMode');
      if (savedMode === 'template' || savedMode === 'todolist' || savedMode === 'stockpile' || savedMode === 'facilities') {
        this.viewMode = savedMode;
      }
    } catch (e) {
      console.error('Failed to load todolist:', e);
    }
    // A damaged personal draft must never prevent restoring the regiment todo.
    this.productionRuns = defaultProductionRuns();
    this.selectedRunProfiles = { factory: 1, mpf: 1 };
    this.factoryCombinedLoading = false;
    this.productionRun = this.productionRuns.factory[0];
    this.mpfRunTransports = [localStorage.getItem('productionRunTransport') === 'container' ? 'container' : 'truck', 'truck'];
    try {
      const raw = localStorage.getItem(RUN_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.version === 3 && parsed.runs) {
          this.factoryCombinedLoading = parsed.factoryCombinedLoading === true;
          for (const source of ['factory', 'mpf'] as const) {
            this.selectedRunProfiles[source] = parsed.selectedProfiles?.[source] === 2 ? 2 : 1;
            for (const index of [0, 1] as const) {
              try {
                this.productionRuns[source][index] = readProductionRun(parsed.runs[source]?.[index], source);
              } catch (error) {
                console.error(`Failed to load ${source} profile ${index + 1}:`, error);
              }
            }
          }
          this.mpfRunTransports = [0, 1].map(index => parsed.mpfTransports?.[index] === 'container' ? 'container' : 'truck') as [LoadingTransport, LoadingTransport];
        } else if (parsed?.version === 2 && parsed.runs) {
          for (const source of ['factory', 'mpf'] as const) {
            try {
              this.productionRuns[source][0] = readProductionRun(parsed.runs[source], source);
            } catch (error) {
              console.error(`Failed to load ${source} run:`, error);
            }
          }
          this.mpfRunTransports[0] = parsed.mpfTransport === 'container' ? 'container' : 'truck';
        } else {
          // Preserve the old mixed draft, splitting by each recorded recipe.
          for (const source of ['factory', 'mpf'] as const) {
            const document = readProductionRun(parsed, source);
            this.productionRuns[source][0] = {
              ...document, items: document.items.filter(item => productionSource(item) === source),
            };
          }
        }
        const hasDuplicateQueues = this.productionRuns.mpf.some(run => runQueueItems(run.items, 'mpf').length !== run.items.length);
        const hasOverfullFactory = this.productionRuns.factory.some(run => TODO_CATEGORIES.some(category => run.items
          .filter(item => item.category === category).reduce((sum, item) => sum + orderCrateCount(item), 0) > FACTORY_QUEUE_CAPACITY));
        const hasMultipleOrders = Object.values(this.productionRuns).flat().some(run => run.items.some(item => item.orderCount !== 1));
        for (const [needed, key] of [[hasDuplicateQueues, RUN_QUEUE_BACKUP_KEY], [hasMultipleOrders, RUN_ORDER_BACKUP_KEY], [hasOverfullFactory, RUN_FACTORY_BACKUP_KEY]] as const) {
          if (needed && !localStorage.getItem(key)) {
            try {
              localStorage.setItem(key, raw);
            } catch (error) {
              console.warn('Could not back up previous production queues:', error);
            }
          }
        }
        for (const source of ['factory', 'mpf'] as const) {
          for (const run of this.productionRuns[source]) run.items = runQueueItems(run.items, source);
        }
        const source = parsed.productionSource === 'mpf' || parsed.source === 'mpf' ? 'mpf' : 'factory';
        this.productionRun = this.productionRuns[source][this.getProductionRunProfile(source) - 1];
      }
    } catch (error) {
      console.error('Failed to load production run:', error);
    }
    const workspace = localStorage.getItem('productionWorkspace');
    this.productionWorkspace = workspace === 'run' ? 'run' : 'todolist';
  }

  // Filtered icons getter
  get availableIconCategories(): Array<IconCategory | TodoCategory> {
    if (this.viewMode !== 'todolist') return CATEGORIES;
    // Keep the menu stable while searching or changing faction. Its categories
    // describe the selected building's catalogue, not the current search result.
    const filenames = new Set(this.icons.map(icon => canonicalIconFilename(icon.filename)));
    const present = new Set(this.todoProductionData.filter(item => filenames.has(canonicalIconFilename(item.iconFilename))).map(item => item.category));
    return TODO_CATEGORIES.filter(category => present.has(category));
  }

  get filteredIcons(): Icon[] {
    // Keep alternate facilities artwork addressable for saved documents and the future module.
    const facilitiesOnly = new Set(this.itemData.filter(item => item.iconUsage === 'facilities').map(item => item.iconFilename));
    let filtered = this.icons.filter(icon => !facilitiesOnly.has(icon.filename));
    
    if (this.viewMode !== 'todolist' && this.selectedCategory !== 'Toutes') {
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
      const f = this.productionDocument.faction;
      const entries = this.todoProductionData;
      filtered = filtered.filter(i => {
        const entry = entries.find(e => canonicalIconFilename(e.iconFilename) === canonicalIconFilename(i.filename));
        if (!entry) return false;
        if (this.selectedCategory !== 'Toutes' && entry.category !== this.selectedCategory) return false;
        if (f === 'all') return true;
        return entry.faction.includes(f);
      });
    }

    // In template mode, hide icons that don't belong to the selected faction.
    // Same logic as todolist faction filter but icons absent from mpfData are always shown.
    if (this.viewMode === 'template' && this.templateFaction !== 'all') {
      const f = this.templateFaction;
      filtered = filtered.filter(i => {
        const metadata = this.itemData.find(e => e.iconFilename === i.filename);
        if (metadata?.faction) return metadata.faction.includes(f);
        const entry = this.mpfData.find(e => e.iconFilename === i.filename);
        return !entry || entry.faction.includes(f);
      });
    }
    
    return filtered;
  }
  
  // Persistence
  save(): void {
    const template: Template = { sections: this.sections, ...(this.quantityMode !== 'legacy' ? { quantityMode: this.quantityMode } : {}) };
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
      
      const savedTemplateFaction = localStorage.getItem('templateFaction') as FactionFilter | null;
      if (savedTemplateFaction === 'all' || savedTemplateFaction === 'warden' || savedTemplateFaction === 'colonial') {
        this.templateFaction = savedTemplateFaction;
      }

      const data = localStorage.getItem('template');
      if (data) {
        const template: Template = JSON.parse(data);
        this.quantityMode = template.quantityMode === 'crate-equivalents-v1' ? 'crate-equivalents-v1' : 'legacy';
        // Restaurer les positions et décaler les collisions des anciens fichiers.
        this.sections = (template.sections || []).map(section => ({
          ...section,
          icons: this.migrateIcons(section.icons, section.width)
        }));
        this.emit();
      } else {
        this.quantityMode = 'crate-equivalents-v1';
      }
      this.loadTodoList();
    } catch (e) {
      console.error('Failed to load template:', e);
    }
  }
  
  private getGridColumns(sectionWidth: number): number {
    // Même largeur de cellule et padding de 6px que SectionComponent.
    return Math.max(1, Math.floor((sectionWidth - 12) / ICON_SCALES[this.iconScale].cell));
  }

  // Garder les positions existantes ; déplacer seulement les doublons/positions absentes.
  private migrateIcons(icons: SectionIcon[], sectionWidth: number): SectionIcon[] {
    const maxCols = this.getGridColumns(sectionWidth);
    const migrated = icons.map(icon => migrateSectionIcon(icon, getBaseUrl()));
    const hasPosition = (icon: SectionIcon): boolean => Number.isInteger(icon.gridRow) && icon.gridRow >= 0 &&
      Number.isInteger(icon.gridCol) && icon.gridCol >= 0;
    // Réserver aussi les cases des icônes suivantes pour ne pas les déplacer.
    const occupied = new Set(migrated.filter(hasPosition).map(icon => `${icon.gridRow},${icon.gridCol}`));
    const assigned = new Set<string>();
    
    return migrated.map((icon, index) => {
      const key = `${icon.gridRow},${icon.gridCol}`;
      if (hasPosition(icon) && !assigned.has(key)) {
        assigned.add(key);
        return icon;
      }
      
      // Sinon, trouver une position libre
      const start = hasPosition(icon) ? icon.gridRow * maxCols + icon.gridCol + 1 : index;
      let row = Math.floor(start / maxCols);
      let col = start % maxCols;
      
      // S'assurer que la position n'est pas occupée
      while (occupied.has(`${row},${col}`)) {
        col++;
        if (col >= maxCols) {
          col = 0;
          row++;
        }
      }
      
      occupied.add(`${row},${col}`);
      assigned.add(`${row},${col}`);
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
    const template: Template = { sections: normalizedSections, iconScale: this.iconScale, background: this.background,
      ...(this.quantityMode !== 'legacy' ? { quantityMode: this.quantityMode } : {}) };
    return JSON.stringify(template, null, 2);
  }
  
  importJSON(json: string): boolean {
    try {
      const template: Template = JSON.parse(json);
      if (template.quantityMode !== undefined && template.quantityMode !== 'legacy' && template.quantityMode !== 'crate-equivalents-v1') return false;
      this.quantityMode = template.quantityMode === 'crate-equivalents-v1' ? 'crate-equivalents-v1' : 'legacy';
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
      return true;
    } catch (e) {
      console.error('Failed to import template:', e);
      return false;
    }
  }
}

export const store = new Store();
