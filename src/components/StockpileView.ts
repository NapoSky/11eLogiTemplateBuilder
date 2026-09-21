import { store } from '../store';
import { Template, Section, SectionIcon, MpfDataEntry, TodoListItem, TodoList, MpfCategory, IconCategory, CATEGORIES, generateId } from '../types';
import { getBaseUrl } from '../config';
import { renderTodoList } from '../services/todoListExporter';
import { fullOrderCost } from '../services/mpfCalculator';
import { translateFrenchItemName } from '../services/frenchItemNames';
import { showToast } from '../services/toast';
import { confirmDialog } from '../services/confirmDialog';
import {
  aggregateStockpileItems,
  buildBacklineCargo,
  CargoKind,
  DEFAULT_TRANSPORT_EXCLUSIONS,
  DepotRole,
  missionFits,
  renderTransportList,
  StockpileSnapshot,
  suggestTransportMissions,
  TransportCargoItem,
  TransportMission,
  TransportMode,
  TransportRoute,
  transportSlotsPerTrip,
  usedTransportSlots,
  formatLocationLabel,
  inferDepotName,
  normalizeStockItems,
  suggestDepotRole,
  upsertStockpileSnapshot,
} from '../services/stockpileLogistics';

// ─── Local types ──────────────────────────────────────────────────────────────

type RowStatus = 'ok' | 'partial' | 'missing' | 'unknown';
type FilterStatus = 'all' | 'missing' | 'partial' | 'ok';

interface StockpileRow {
  sectionTitle: string;
  sectionColor: string;
  iconPath: string;
  itemName: string | null;   // null = no iconMapping entry
  isCrateTarget: boolean;    // subtype SubtypeCrateIcon on this icon
  targetQty: number;
  stockpileQty: number;
  status: RowStatus;
}

interface StockpileHeader {
  location: string;
  date: string;
}

interface ComparisonResult {
  header: StockpileHeader | null;
  rows: StockpileRow[];
  surplus: Array<{ itemName: string; qty: number; isCrate: boolean }>;
}

type CsvEntry = StockpileSnapshot;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!)
  );
}

const ROLE_LABELS: Record<DepotRole, string> = { backline: 'Backline', intermediate: 'Main', front: 'Front' };

/** Sums the crate + plain (assembled) quantities of an item from a raw CSV items map. */
function resolveItemQuantity(items: Map<string, number>, itemName: string): number {
  return (items.get(`${itemName} (Crate)`) ?? 0) + (items.get(itemName) ?? 0);
}

interface RoleAccent { border: string; text: string; badgeBg: string; }
// border-t-* (not border-*) so the accent only colors the top strip, not all 4 sides
const ROLE_ACCENTS: Record<DepotRole, RoleAccent> = {
  backline: { border: 'border-t-lime-500', text: 'text-lime-400', badgeBg: 'bg-lime-900/30 border-lime-700/40' },
  intermediate: { border: 'border-t-amber-500', text: 'text-amber-400', badgeBg: 'bg-amber-900/30 border-amber-700/40' },
  front: { border: 'border-t-cyan-500', text: 'text-cyan-400', badgeBg: 'bg-cyan-900/30 border-cyan-700/40' },
};

/** Parse a Foxhole snapshot date string ("YYYY.MM.DD-HH.MM.SS") into a Date, or null if unparsable. */
function parseSnapshotDate(date: string): Date | null {
  const match = date.match(/^(\d{4})\.(\d{2})\.(\d{2})-(\d{2})\.(\d{2})\.(\d{2})$/);
  if (!match) return null;
  const [y, mo, d, h, mi, s] = match.slice(1).map(Number);
  return new Date(y, mo - 1, d, h, mi, s);
}

function formatSnapshotDate(date: Date): string {
  return date.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/** Human-readable "recorded at" range across the snapshots that make up a depot card. */
function formatSnapshotDateRange(entries: CsvEntry[]): string {
  const dates = entries
    .map(e => e.header ? parseSnapshotDate(e.header.date) : null)
    .filter((d): d is Date => d !== null)
    .sort((a, b) => a.getTime() - b.getTime());
  if (dates.length === 0) return '—';
  const first = formatSnapshotDate(dates[0]);
  const last = formatSnapshotDate(dates[dates.length - 1]);
  return first === last ? first : `${first} → ${last}`;
}

export function iconPathToMappingKey(path: string): string {
  const baseUrl = getBaseUrl();
  // Strip base URL prefix when it's not just '/'
  const prefix = baseUrl === '/' ? '/assets/icons/' : `${baseUrl}assets/icons/`;
  if (path.startsWith(prefix)) return path.slice(prefix.length);
  // Fallback: extract after 'assets/icons/'
  const idx = path.indexOf('assets/icons/');
  if (idx !== -1) return path.slice(idx + 'assets/icons/'.length);
  return path;
}

export function isCrateSubtype(subtype: string | undefined): boolean {
  return !!subtype && subtype.includes('SubtypeCrateIcon.png');
}

/**
 * Decode a CSV ArrayBuffer, trying UTF-8 first then falling back to windows-1252.
 */
function decodeBuffer(buffer: ArrayBuffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    return new TextDecoder('windows-1252').decode(buffer);
  }
}

/**
 * Parse the Foxhole stockpile CSV export.
 *
 * Format:
 *   Line 1 : "Stockpile name,YYYY.MM.DD-HH.MM.SS"  (metadata, NOT an item)
 *   Lines 2+: "Item Name,quantity"  (quantity = integer, 0 if empty)
 *   Empty lines: ignored (they separate item categories in the export)
 */
export function parseCSV(text: string): { header: StockpileHeader | null; items: Map<string, number>; frenchDetected: boolean } {
  const lines = text.split(/\r?\n/);
  const items = new Map<string, number>();
  let header: StockpileHeader | null = null;
  let firstDataLine = true;
  let frenchDetected = false;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    // Split on the LAST comma — item names never end with a comma,
    // but they can contain commas (e.g. quotes), spaces, dashes, etc.
    const lastComma = line.lastIndexOf(',');
    if (lastComma === -1) continue;

    const name = line.slice(0, lastComma).trim();
    const qtyStr = line.slice(lastComma + 1).trim();

    // If the second column isn't a plain integer → it's the metadata header line
    if (firstDataLine && !/^\d+$/.test(qtyStr)) {
      header = { location: name, date: qtyStr };
      firstDataLine = false;
      continue;
    }
    firstDataLine = false;

    const qty = parseInt(qtyStr, 10);
    if (isNaN(qty)) continue;

    // Normalize typographic quotes/apostrophes to ASCII equivalents so that
    // Foxhole CSV exports (which use U+2019, U+201C, U+201D) match iconMapping.json
    const afterQuoteNorm = name
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/[\u201C\u201D]/g, '"');
    const normalizedName = translateFrenchItemName(afterQuoteNorm);
    // "(Caisse)" is the unambiguous French indicator — English exports always
    // use "(Crate)", so this check never fires on an English CSV.
    if (/\(Caisse\)/i.test(afterQuoteNorm)) frenchDetected = true;
    items.set(normalizedName, (items.get(normalizedName) ?? 0) + qty);
  }

  return { header, items, frenchDetected };
}

/**
 * Build a comparison between template sections and CSV stockpile data.
 */
export function buildComparison(
  sections: Section[],
  csvItems: Map<string, number>,
  iconMapping: Record<string, string>,
  header: StockpileHeader | null
): ComparisonResult {
  const rows: StockpileRow[] = [];
  const matchedCsvKeys = new Set<string>();

  for (const section of sections) {
    for (const icon of section.icons) {
      const mappingKey = iconPathToMappingKey(icon.path);
      const itemName = iconMapping[mappingKey] ?? null;
      const isCrateTarget = isCrateSubtype(icon.subtype);

      let stockpileQty = 0;
      if (itemName) {
        // Côté Stockpile, on considère que tout est en crate par défaut.
        // Pour les Shippables et Vehicles, l'export peut contenir les deux formes
        // (crate ET assemblé/non-crate) → on somme les deux.
        const crateKey = `${itemName} (Crate)`;
        const plainKey = itemName;
        const crateQty = csvItems.get(crateKey) ?? 0;
        const plainQty = csvItems.get(plainKey) ?? 0;
        stockpileQty = crateQty + plainQty;
        if (crateQty > 0 || csvItems.has(crateKey)) matchedCsvKeys.add(crateKey);
        if (plainQty > 0 || csvItems.has(plainKey)) matchedCsvKeys.add(plainKey);
      }

      let status: RowStatus;
      if (!itemName) {
        status = 'unknown';
      } else if (icon.quantity === -1) {
        status = 'ok';
      } else if (stockpileQty >= icon.quantity) {
        status = 'ok';
      } else if (stockpileQty > 0) {
        status = 'partial';
      } else {
        status = 'missing';
      }

      rows.push({
        sectionTitle: section.title,
        sectionColor: section.color,
        iconPath: icon.path,
        itemName,
        isCrateTarget,
        targetQty: icon.quantity,
        stockpileQty,
        status,
      });
    }
  }

  // Surplus: CSV entries with qty > 0 not matched to any template item
  const surplus: ComparisonResult['surplus'] = [];
  for (const [name, qty] of csvItems.entries()) {
    if (qty > 0 && !matchedCsvKeys.has(name)) {
      const isCrate = name.endsWith(' (Crate)');
      const baseName = isCrate ? name.slice(0, -7) : name; // " (Crate)" = 8 chars but we keep the space out
      surplus.push({ itemName: isCrate ? name.slice(0, -8) : name, qty, isCrate });
    }
  }
  surplus.sort((a, b) => b.qty - a.qty);

  return { header, rows, surplus };
}

// ─── Component ────────────────────────────────────────────────────────────────

const CSV_ENTRIES_KEY  = 'stockpile_csv_entries';
const TPL_FILE_KEY     = 'stockpile_tpl_file';
const TPL_FILENAME_KEY = 'stockpile_tpl_filename';
const TRANSPORT_EXCLUSIONS_KEY = 'stockpile_transport_exclusions';
const CALCULATION_ROLES_KEY = 'stockpile_calculation_roles';
const LEGACY_TODOLIST_ROLES_KEY = 'stockpile_todolist_roles';
const DEFAULT_CALCULATION_ROLES = new Set<DepotRole>(['intermediate']);
const DEDUCT_BACKLINE_KEY = 'stockpile_deduct_backline';

function showFrenchWarningToast(): void {
  // Remove any existing French warning before showing a new one
  document.getElementById('french-warning-toast')?.remove();

  const toast = document.createElement('div');
  toast.id = 'french-warning-toast';
  toast.style.cssText = [
    'position:fixed',
    'bottom:1.5rem',
    'left:50%',
    'transform:translateX(-50%)',
    'z-index:9999',
    'max-width:30rem',
    'width:calc(100% - 2rem)',
    'background:#78350f',
    'border:1px solid #d97706',
    'border-radius:0.5rem',
    'padding:0.875rem 1rem',
    'box-shadow:0 4px 12px rgba(0,0,0,0.5)',
    'display:flex',
    'align-items:flex-start',
    'gap:0.625rem',
    'opacity:1',
    'transition:opacity 0.3s ease',
  ].join(';');

  toast.innerHTML = `
    <span style="font-size:1.1rem;flex-shrink:0;line-height:1.4">⚠️</span>
    <div style="font-size:0.8rem;line-height:1.45;color:#fef3c7">
      <strong style="display:block;margin-bottom:0.2rem;color:#fde68a">Stockpile chargée en français détectée</strong>
      Les noms d'items ont été traduits automatiquement pour correspondre aux données anglaises du template.
      Pour éviter toute confusion, nous recommandons de passer le jeu en <strong>anglais</strong>
      (<em>Settings → Language → English</em>) — c'est la langue de référence de la communauté Foxhole.
    </div>
    <button style="flex-shrink:0;margin-left:auto;background:none;border:none;color:#fde68a;font-size:1rem;cursor:pointer;line-height:1;padding:0 0 0 0.25rem" aria-label="Fermer">✕</button>
  `;

  const closeBtn = toast.querySelector('button')!;
  const dismiss = (): void => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  };
  closeBtn.addEventListener('click', dismiss);

  document.body.appendChild(toast);
  setTimeout(dismiss, 9000);
}

export class StockpileView {
  private container: HTMLElement | null = null;
  private iconMapping: Record<string, string> = {};
  private mappingLoaded = false;

  // CSV state
  private csvEntries: CsvEntry[] = [];
  private result: ComparisonResult | null = null;

  // UI state
  private filterStatus: FilterStatus = 'all';
  private externalTemplate: Template | null = null;
  private officialFaction: 'warden' | 'colonial' | null = 'warden';
  private externalTemplateFileName: string | null = null;
  private collapsedSections: Set<string> = new Set();
  private activeDepotTab: Partial<Record<DepotRole, number>> = {};
  private sortByGap = true;
  private hideOk = true;
  private searchQuery = '';
  private stockViewMode: 'global' | 'depots' = 'global';
  private calculationRoles = new Set<DepotRole>(DEFAULT_CALCULATION_ROLES);

  // Bound window listeners (for cleanup)
  private onLoadCsv      = (e: Event) => { this.handleLoadCsv((e as CustomEvent).detail.file as File); };
  private onPasteCsv     = (e: Event) => { this.handlePasteCsv((e as CustomEvent).detail.text as string); };
  private onClearCsv     = () => { this.handleClearCsv(); };
  private onOpenLoadModal = () => { this.showLoadCsvModal(); };
  private onSetTplCurrent  = () => { this.handleSetTplCurrent(); };
  private onSetTplOfficial = () => { this.handleSetTplOfficial('warden'); };
  private onSetTplOfficialColonial = () => { this.handleSetTplOfficial('colonial'); };
  private onLoadTpl      = (e: Event) => { this.handleLoadTpl((e as CustomEvent).detail.file as File); };

  mount(container: HTMLElement): void {
    this.container = container;
    window.addEventListener('stockpile:load-csv',       this.onLoadCsv);
    window.addEventListener('stockpile:paste-csv',      this.onPasteCsv);
    window.addEventListener('stockpile:clear-csv',      this.onClearCsv);
    window.addEventListener('stockpile:open-load-modal', this.onOpenLoadModal);
    window.addEventListener('stockpile:set-tpl-current',  this.onSetTplCurrent);
    window.addEventListener('stockpile:set-tpl-official', this.onSetTplOfficial);
    window.addEventListener('stockpile:set-tpl-official-colonial', this.onSetTplOfficialColonial);
    window.addEventListener('stockpile:load-tpl',      this.onLoadTpl);
    this.renderLoading();
    this.loadMapping().then(async () => {
      this.loadCollapsedSections();
      this.loadCalculationRoles();
      const savedSource = localStorage.getItem('stockpile_tpl_source') ?? 'official';
      if (savedSource === 'official' || savedSource === 'official-colonial') {
        const faction = savedSource === 'official' ? 'warden' : 'colonial';
        try {
          const baseUrl = getBaseUrl();
          const file = faction === 'warden' ? 'referenceTemplate.json' : 'referenceTemplateColonial.json';
          const res = await fetch(`${baseUrl}${file}`);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          this.externalTemplate = await res.json() as Template;
          this.officialFaction = faction;
        } catch (e) {
          console.warn('StockpileView: failed to load reference template', e);
          this.officialFaction = null;
        }
      } else if (savedSource === 'file') {
        this.restoreExternalTemplate();
        this.officialFaction = null;
      } else {
        this.officialFaction = null;
      }
      // Sync store so Toolbar reflects the restored state
      store.setStockpileTplSource(
        this.officialFaction === 'warden' ? 'official' : this.officialFaction === 'colonial' ? 'official-colonial' : this.externalTemplate ? 'file' : 'current',
        this.externalTemplateFileName
      );
      this.restoreCSV();
      this.render();
    });
  }

  unmount(): void {
    window.removeEventListener('stockpile:load-csv',       this.onLoadCsv);
    window.removeEventListener('stockpile:paste-csv',      this.onPasteCsv);
    window.removeEventListener('stockpile:clear-csv',      this.onClearCsv);
    window.removeEventListener('stockpile:open-load-modal', this.onOpenLoadModal);
    window.removeEventListener('stockpile:set-tpl-current',  this.onSetTplCurrent);
    window.removeEventListener('stockpile:set-tpl-official', this.onSetTplOfficial);
    window.removeEventListener('stockpile:set-tpl-official-colonial', this.onSetTplOfficialColonial);
    window.removeEventListener('stockpile:load-tpl',      this.onLoadTpl);
    this.container = null;
    this.result = null;
    this.csvEntries = [];
    this.filterStatus = 'all';
    this.externalTemplate = null;
    this.officialFaction = null;
    this.collapsedSections = new Set();
    this.searchQuery = '';
    this.calculationRoles = new Set(DEFAULT_CALCULATION_ROLES);
  }

  private async loadMapping(): Promise<void> {
    if (this.mappingLoaded) return;
    const baseUrl = getBaseUrl();
    const res = await fetch(`${baseUrl}iconMapping.json`);
    this.iconMapping = await res.json();
    this.mappingLoaded = true;
  }

  private saveCollapsedSections(): void {
    try {
      localStorage.setItem('stockpile_collapsed', JSON.stringify([...this.collapsedSections]));
    } catch (e) {
      console.warn('StockpileView: failed to persist collapsed sections', e);
    }
  }

  private loadCollapsedSections(): void {
    try {
      const raw = localStorage.getItem('stockpile_collapsed');
      if (raw) this.collapsedSections = new Set(JSON.parse(raw) as string[]);
    } catch (e) {
      console.warn('StockpileView: failed to restore collapsed sections', e);
    }
  }

  private loadCalculationRoles(): void {
    try {
      const raw = localStorage.getItem(CALCULATION_ROLES_KEY)
        ?? localStorage.getItem(LEGACY_TODOLIST_ROLES_KEY);
      if (!raw) return;
      const roles: DepotRole[] = ['backline', 'intermediate', 'front'];
      const restored = (JSON.parse(raw) as DepotRole[]).filter(role => roles.includes(role));
      if (restored.length > 0) this.calculationRoles = new Set(restored);
    } catch (error) {
      console.warn('StockpileView: failed to restore calculation roles', error);
    }
  }

  private setCalculationRole(role: DepotRole, included: boolean): boolean {
    if (!included && this.calculationRoles.size === 1) return false;
    if (included) this.calculationRoles.add(role);
    else this.calculationRoles.delete(role);
    try {
      localStorage.setItem(CALCULATION_ROLES_KEY, JSON.stringify([...this.calculationRoles]));
      localStorage.removeItem(LEGACY_TODOLIST_ROLES_KEY);
    } catch (error) {
      console.warn('StockpileView: failed to persist calculation roles', error);
    }
    this.rerunComparison();
    return true;
  }

  private saveExternalTemplate(): void {
    try {
      localStorage.setItem(TPL_FILE_KEY, JSON.stringify(this.externalTemplate));
      if (this.externalTemplateFileName) {
        localStorage.setItem(TPL_FILENAME_KEY, this.externalTemplateFileName);
      }
    } catch (e) {
      console.warn('StockpileView: failed to persist external template', e);
    }
  }

  private restoreExternalTemplate(): void {
    try {
      const raw = localStorage.getItem(TPL_FILE_KEY);
      if (raw) this.externalTemplate = JSON.parse(raw) as Template;
      this.externalTemplateFileName = localStorage.getItem(TPL_FILENAME_KEY);
    } catch (e) {
      console.warn('StockpileView: failed to restore external template', e);
    }
  }

  private saveCSV(): void {
    try {
      const raw = this.csvEntries.map(e => ({
        id: e.id,
        header: e.header,
        items: Object.fromEntries(e.items),
        label: e.label,
        depotName: e.depotName,
        role: e.role,
      }));
      localStorage.setItem(CSV_ENTRIES_KEY, JSON.stringify(raw));
    } catch (e) {
      console.warn('StockpileView: failed to persist CSV data', e);
    }
  }

  private restoreCSV(): void {
    try {
      const raw = localStorage.getItem(CSV_ENTRIES_KEY);
      if (!raw) {
        this.migrateOldCSV();
        return;
      }
      const entries = JSON.parse(raw) as Array<{
        id: string;
        header: StockpileHeader | null;
        items: Record<string, number>;
        label: string;
        depotName?: string;
        role?: DepotRole;
      }>;
      this.csvEntries = entries.map((e, index) => ({
        id: e.id,
        header: e.header,
        items: new Map(Object.entries(e.items)),
        label: e.label,
        depotName: e.depotName ?? inferDepotName(e.header?.location ?? e.label),
        role: e.role ?? (index === 0 ? 'intermediate' : 'backline'),
      }));
      if (this.csvEntries.length > 0) {
        this.result = buildComparison(this.getSections(), this.aggregateItems(), this.iconMapping, null);
      }
    } catch (e) {
      console.warn('StockpileView: failed to restore CSV data', e);
    }
  }

  private migrateOldCSV(): void {
    try {
      const rawItems = localStorage.getItem('stockpile_csv_items');
      const rawHeader = localStorage.getItem('stockpile_csv_header');
      const fileName = localStorage.getItem('stockpile_csv_filename');
      if (!rawItems) return;
      const obj = JSON.parse(rawItems) as Record<string, number>;
      const header = rawHeader ? JSON.parse(rawHeader) as StockpileHeader : null;
      const label = header?.location ?? fileName ?? 'Stockpile 1';
      this.csvEntries = [{
        id: generateId(),
        header,
        items: new Map(Object.entries(obj)),
        label,
        depotName: inferDepotName(header?.location ?? label),
        role: 'intermediate',
      }];
      this.saveCSV();
      localStorage.removeItem('stockpile_csv_items');
      localStorage.removeItem('stockpile_csv_header');
      localStorage.removeItem('stockpile_csv_filename');
      this.result = buildComparison(this.getSections(), this.aggregateItems(), this.iconMapping, null);
    } catch (e) {
      console.warn('StockpileView: failed to migrate old CSV data', e);
    }
  }

  private getSections(): Section[] {
    return this.externalTemplate?.sections ?? store.sections;
  }

  /**
   * The MPF production needs view always counts Backline + Main stock (Front depots are
   * informational only, transport isn't guaranteed) — no user toggle needed anymore since
   * the per-role breakdown is now shown directly in the table (see renderTable/getRoleItemMaps).
   */
  private aggregateItems(): Map<string, number> {
    return aggregateStockpileItems(this.csvEntries.filter(entry => entry.role !== 'front'));
  }

  private aggregateEntries(entries: CsvEntry[]): Map<string, number> {
    const result = new Map<string, number>();
    for (const entry of entries) {
      for (const [name, qty] of entry.items) result.set(name, (result.get(name) ?? 0) + qty);
    }
    return result;
  }

  /** Raw (crate-key-unresolved) item quantities per depot role, for the B/M/F breakdown columns. */
  private getRoleItemMaps(): Record<DepotRole, Map<string, number>> {
    const roles: DepotRole[] = ['backline', 'intermediate', 'front'];
    const maps = {} as Record<DepotRole, Map<string, number>>;
    for (const role of roles) {
      maps[role] = this.aggregateEntries(this.csvEntries.filter(entry => entry.role === role));
    }
    return maps;
  }

  private getDepots(): Array<{ name: string; role: DepotRole; entries: CsvEntry[] }> {
    const depots = new Map<string, { name: string; role: DepotRole; entries: CsvEntry[] }>();
    for (const entry of this.csvEntries) {
      const depot = depots.get(entry.depotName) ?? { name: entry.depotName, role: entry.role, entries: [] };
      depot.entries.push(entry);
      depot.role = entry.role;
      depots.set(entry.depotName, depot);
    }
    const roleOrder: Record<DepotRole, number> = { backline: 0, intermediate: 1, front: 2 };
    return [...depots.values()].sort((left, right) => roleOrder[left.role] - roleOrder[right.role]);
  }

  private getDirectCargoNames(): Set<string> {
    return new Set(store.mpfData
      .filter(entry => entry.itemCategory === 'vehicles' || entry.itemCategory === 'shipables')
      .map(entry => entry.itemName));
  }

  private rerunComparison(): void {
    if (this.csvEntries.length === 0) return;
    this.result = buildComparison(this.getSections(), this.aggregateItems(), this.iconMapping, null);
  }

  private async handleLoadCsv(file: File): Promise<void> {
    const buffer = await file.arrayBuffer();
    const text = decodeBuffer(buffer);
    this.addCsvEntry(text, file.name);
  }

  private handlePasteCsv(text: string): void {
    this.addCsvEntry(text, null);
  }

  private addCsvEntry(text: string, fileName: string | null): void {
    const { header, items, frenchDetected } = parseCSV(text);
    const label = header?.location ?? fileName ?? `Stockpile ${this.csvEntries.length + 1}`;
    const depotName = inferDepotName(header?.location ?? label);
    const sameDepot = this.csvEntries.find(entry => entry.depotName === depotName);
    const role = sameDepot?.role ?? suggestDepotRole(items);
    this.csvEntries = upsertStockpileSnapshot(this.csvEntries, {
      id: generateId(),
      header,
      items,
      label,
      depotName,
      role,
    });
    this.result = buildComparison(this.getSections(), this.aggregateItems(), this.iconMapping, null);
    this.saveCSV();
    this.filterStatus = 'all';
    this.render();
    if (frenchDetected) showFrenchWarningToast();
    if (!sameDepot) this.showAssignRoleModal(depotName, role);
  }

  /**
   * Prompts the user to place a newly loaded depot in the right role column
   * right away, instead of relying on the auto-assigned heuristic silently.
   */
  private showAssignRoleModal(depotName: string, defaultRole: DepotRole): void {
    const roles: DepotRole[] = ['backline', 'intermediate', 'front'];
    const modal = document.createElement('div');
    modal.id = 'assign-role-modal';
    modal.className = 'fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4';
    modal.innerHTML = `
      <div class="bg-gray-800 border border-gray-700 rounded-lg shadow-xl p-5 w-96 max-w-[95vw] text-white">
        <div class="flex items-center justify-between mb-1">
          <h2 class="text-base font-semibold">Where is this stockpile?</h2>
          <button id="assign-role-close" class="text-gray-400 hover:text-white transition-colors" title="Close">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>
        <p class="text-xs text-gray-400 mb-4 truncate" title="${escapeHtml(depotName)}">${escapeHtml(depotName)}</p>
        <div class="flex flex-col gap-2">
          ${roles.map(role => {
            const accent = ROLE_ACCENTS[role];
            const isDefault = role === defaultRole;
            return `
              <button class="assign-role-btn flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg border ${accent.border} ${isDefault ? accent.badgeBg : 'bg-gray-900/40 hover:bg-gray-800'} transition-colors text-left"
                data-role="${role}">
                <span class="font-medium ${accent.text}">${ROLE_LABELS[role]}</span>
                ${isDefault ? `<span class="text-[10px] text-gray-400 shrink-0">Suggested</span>` : ''}
              </button>
            `;
          }).join('')}
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    const close = this.attachEscapeClose(() => modal.remove());
    modal.querySelector('#assign-role-close')!.addEventListener('click', close);
    modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
    modal.querySelectorAll<HTMLButtonElement>('.assign-role-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const role = btn.getAttribute('data-role') as DepotRole;
        close();
        if (role !== defaultRole) this.handleDepotRoleChange(depotName, role);
      });
    });
  }


  private handleRemoveEntry(id: string): void {
    const index = this.csvEntries.findIndex(e => e.id === id);
    if (index === -1) return;
    const removed = this.csvEntries[index];
    this.csvEntries = this.csvEntries.filter(e => e.id !== id);
    this.result = this.csvEntries.length > 0
      ? buildComparison(this.getSections(), this.aggregateItems(), this.iconMapping, null)
      : null;
    this.saveCSV();
    this.render();

    showToast(`Snapshot "${formatLocationLabel(removed.label, removed.depotName)}" removed`, {
      actionLabel: 'Undo',
      onAction: () => {
        this.csvEntries.splice(index, 0, removed);
        this.result = buildComparison(this.getSections(), this.aggregateItems(), this.iconMapping, null);
        this.saveCSV();
        this.render();
      },
    });
  }

  private handleDepotGroupNameChange(oldDepotName: string, newDepotName: string): void {
    const normalizedName = newDepotName.trim();
    if (!normalizedName || normalizedName === oldDepotName) return;
    this.csvEntries = this.csvEntries.map(entry => entry.depotName === oldDepotName ? { ...entry, depotName: normalizedName } : entry);
    this.saveCSV();
    this.render();
  }

  private async handleDepotRoleChange(depotName: string, role: DepotRole): Promise<boolean> {
    // Only one depot can hold the "Main" role at a time (readiness/gap calculations
    // elsewhere assume a single Main depot) — ask before demoting the previous one
    // instead of silently swapping it, so the user stays in control of where it ends up.
    const previousIntermediate = role === 'intermediate'
      ? this.getDepots().find(depot => depot.role === 'intermediate' && depot.name !== depotName)
      : undefined;

    if (previousIntermediate) {
      const confirmed = await confirmDialog(
        `"${previousIntermediate.name}" is currently the Main depot. Only one depot can hold that role — it will be moved to Backline. Continue?`
      );
      if (!confirmed) return false;
    }

    this.csvEntries = this.csvEntries.map(entry => {
      if (entry.depotName === depotName) return { ...entry, role };
      if (previousIntermediate && entry.depotName === previousIntermediate.name) return { ...entry, role: 'backline' };
      return entry;
    });
    this.rerunComparison();
    this.saveCSV();
    this.render();
    return true;
  }

  private handleClearCsv(): void {
    this.csvEntries = [];
    this.result = null;
    localStorage.removeItem(CSV_ENTRIES_KEY);
    this.render();
  }

  private handleSetTplCurrent(): void {
    if (this.externalTemplate === null && this.officialFaction === null) return;
    this.externalTemplate = null;
    this.externalTemplateFileName = null;
    this.officialFaction = null;
    localStorage.setItem('stockpile_tpl_source', 'current');
    localStorage.removeItem(TPL_FILE_KEY);
    localStorage.removeItem(TPL_FILENAME_KEY);
    store.setStockpileTplSource('current');
    this.rerunComparison();
    this.render();
  }

  private async handleSetTplOfficial(faction: 'warden' | 'colonial'): Promise<void> {
    if (this.officialFaction === faction) return;
    try {
      const baseUrl = getBaseUrl();
      const file = faction === 'warden' ? 'referenceTemplate.json' : 'referenceTemplateColonial.json';
      const res = await fetch(`${baseUrl}${file}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      this.externalTemplate = await res.json() as Template;
      this.externalTemplateFileName = null;
      this.officialFaction = faction;
      const source = faction === 'warden' ? 'official' : 'official-colonial';
      localStorage.setItem('stockpile_tpl_source', source);
      localStorage.removeItem(TPL_FILE_KEY);
      localStorage.removeItem(TPL_FILENAME_KEY);
      store.setStockpileTplSource(source);
      this.rerunComparison();
      this.render();
    } catch (e) {
      console.error(`Failed to load ${faction} reference template:`, e);
      alert(`Could not load the official ${faction === 'warden' ? 'Warden' : 'Colonial'} reference template.`);
    }
  }

  private async handleLoadTpl(file: File): Promise<void> {
    try {
      const text = await file.text();
      this.externalTemplate = JSON.parse(text) as Template;
      this.externalTemplateFileName = file.name;
      this.officialFaction = null;
      localStorage.setItem('stockpile_tpl_source', 'file');
      this.saveExternalTemplate();
      store.setStockpileTplSource('file', file.name);
      this.rerunComparison();
      this.render();
    } catch {
      alert('Invalid template JSON');
    }
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  private renderLoading(): void {
    if (!this.container) return;
    this.container.innerHTML = `
      <div class="flex items-center justify-center h-full text-gray-500 text-sm">
        Loading…
      </div>
    `;
  }

  private render(): void {
    if (!this.container) return;

    const hasResult = !!this.result;
    const sections = this.getSections();
    const hasSections = sections.length > 0;

    this.container.innerHTML = `
      <div class="h-full flex flex-col overflow-hidden bg-gray-900">

        <!-- Controls bar -->
        <div class="shrink-0 flex flex-wrap items-center gap-3 px-4 py-2.5 bg-gray-800 border-b border-gray-700">

          ${this.csvEntries.length > 0 ? `
          <div class="flex items-center rounded border border-gray-600 overflow-hidden">
            <button data-stock-view="global" class="px-2.5 py-1 text-xs ${this.stockViewMode === 'global' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}">MPF production needs</button>
            <button data-stock-view="depots" class="px-2.5 py-1 text-xs ${this.stockViewMode === 'depots' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}">Transport planning</button>
          </div>

          <!-- Filter -->
          <div class="flex items-center gap-1">
            <span class="text-xs text-gray-400 mr-1">Show:</span>
            ${(['all', 'missing', 'partial', 'ok'] as FilterStatus[]).map(f => `
              <button data-filter="${f}" class="filter-btn px-2 py-1 text-xs rounded transition-colors ${this.filterStatus === f ? 'bg-blue-600 text-white' : 'bg-gray-700 hover:bg-gray-600 text-gray-300'}">
                ${f === 'all' ? 'All' : f === 'missing' ? '✗ Missing' : f === 'partial' ? '⚠ Partial' : '✓ OK'}
              </button>
            `).join('')}
          </div>

          <!-- Sort + Hide OK -->
          <div class="flex items-center gap-1 border-l border-gray-600 pl-3">
            <button id="btn-sort-gap" class="flex items-center gap-1.5 px-2 py-1 text-xs rounded transition-colors ${this.sortByGap ? 'bg-blue-600 text-white' : 'bg-gray-700 hover:bg-gray-600 text-gray-300'}" title="Sort by largest gap first">
              <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12"/>
              </svg>
              Sort by gap
            </button>
            <button id="btn-hide-ok" class="flex items-center gap-1.5 px-2 py-1 text-xs rounded transition-colors ${this.hideOk ? 'bg-blue-600 text-white' : 'bg-gray-700 hover:bg-gray-600 text-gray-300'}" title="Hide items already at target quantity">
              <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"/>
              </svg>
              Hide OK
            </button>
          </div>

          <!-- Search -->
          <div class="flex items-center gap-1.5 border-l border-gray-600 pl-3">
            <svg class="w-3.5 h-3.5 text-gray-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0"/>
            </svg>
            <input type="text" id="search-items"
              placeholder="Search items…"
              value="${escapeHtml(this.searchQuery)}"
              class="bg-gray-700 border border-gray-600 rounded px-2 py-1 text-xs text-gray-200 placeholder-gray-500 w-36 focus:outline-none focus:border-blue-500 transition-colors"/>
          </div>

              ${this.stockViewMode === 'global' ? `
          <!-- Stats + Generate -->
          <div class="flex items-center gap-3 border-l border-gray-600 pl-3 text-xs ml-auto">
            ${this.renderStats()}
            ${hasSections ? `
            <button id="btn-generate-todolist"
              class="flex items-center gap-1.5 px-2.5 py-1 bg-green-700 hover:bg-green-600 rounded text-xs font-medium transition-colors ml-1">
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                  d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"/>
              </svg>
              Generate Todolist
            </button>
            ` : ''}
          </div>
          ` : `
          <div class="ml-auto flex items-center gap-3 text-xs">
            ${this.renderIntermediateReadiness()}
            <span class="text-gray-500">Front depots are excluded from totals</span>
            <button id="btn-prepare-transport" class="px-2.5 py-1 bg-emerald-700 hover:bg-emerald-600 rounded font-medium transition-colors">Prepare transport</button>
          </div>
          `}
          ` : ''}
        </div>

        <!-- Content -->
        <div class="flex-1 overflow-y-auto p-4">
          ${this.renderLoadedStockpiles()}
          <!-- Disclaimer -->
          <div class="mb-4 flex items-start gap-2 px-3 py-2 bg-gray-800/60 border border-gray-700 rounded-lg text-xs text-gray-400">
            <svg class="w-3.5 h-3.5 mt-0.5 shrink-0 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
            </svg>
            <p>This comparison is for <span class="text-gray-300 font-semibold">informational purposes only</span>. It provides a snapshot diff between a template and ${this.csvEntries.length > 1 ? `aggregated stockpiles` : `an exported stockpile`} — not a live tracking system. Quantities may be outdated the moment the CSV is exported.</p>
          </div>
          ${!hasResult ? this.renderEmpty() : this.stockViewMode === 'global' ? this.renderTable() : this.renderDepotMatrix()}
        </div>
      </div>
    `;

    this.attachEvents();
  }

  private renderStats(): string {
    if (!this.result) return '';
    const rows = this.result.rows.filter(r => r.itemName !== null);
    const ok      = rows.filter(r => r.status === 'ok').length;
    const partial = rows.filter(r => r.status === 'partial').length;
    const missing = rows.filter(r => r.status === 'missing').length;
    const unknown = this.result.rows.filter(r => r.status === 'unknown').length;
    const total   = rows.length;
    const pct     = total > 0 ? Math.round((ok / total) * 100) : 0;
    const barColor = pct === 100 ? '#22c55e' : pct >= 50 ? '#eab308' : '#ef4444';
    return `
      <div data-production-readiness class="flex items-center gap-1.5">
        <div class="w-20 h-1.5 bg-gray-700 rounded-full overflow-hidden" title="${ok}/${total} items stocked">
          <div class="h-full rounded-full transition-all duration-300" style="width: ${pct}%; background-color: ${barColor}"></div>
        </div>
        <span class="text-gray-400 tabular-nums">${pct}%</span>
      </div>
      <span class="text-green-400 font-medium">✓ ${ok}</span>
      <span class="text-yellow-400 font-medium">⚠ ${partial}</span>
      <span class="text-red-400 font-medium">✗ ${missing}</span>
      ${unknown > 0 ? `<span class="text-gray-500">? ${unknown}</span>` : ''}
    `;
  }

  private renderIntermediateReadiness(): string {
    if (!this.result) return '';
    const intermediate = this.getDepots().find(depot => depot.role === 'intermediate');
    if (!intermediate) return '<span class="text-amber-400">No Main depot</span>';

    const quantities = new Map(normalizeStockItems(
      this.aggregateEntries(intermediate.entries),
      this.getDirectCargoNames(),
    ).map(item => [item.itemName, item.crates + item.assembled]));
    const rows = this.result.rows.filter(
      (row): row is StockpileRow & { itemName: string } => row.itemName !== null && row.targetQty !== -1,
    );
    const statuses = rows.map(row => {
      const quantity = quantities.get(row.itemName) ?? 0;
      if (quantity >= row.targetQty) return 'ok';
      return quantity > 0 ? 'partial' : 'missing';
    });
    const ok = statuses.filter(status => status === 'ok').length;
    const partial = statuses.filter(status => status === 'partial').length;
    const missing = statuses.filter(status => status === 'missing').length;
    const pct = rows.length > 0 ? Math.round((ok / rows.length) * 100) : 0;
    const barColor = pct === 100 ? '#22c55e' : pct >= 50 ? '#eab308' : '#ef4444';

    return `
      <div data-intermediate-readiness class="flex items-center gap-2 border-l border-gray-600 pl-3" title="Main readiness: ${escapeHtml(intermediate.name)}">
        <span class="text-gray-400">Main readiness</span>
        <span class="flex items-center gap-1.5">
          <span class="w-16 h-1.5 bg-gray-700 rounded-full overflow-hidden">
            <span class="h-full rounded-full block" style="width:${pct}%;background-color:${barColor}"></span>
          </span>
          <span class="text-gray-400 tabular-nums">${pct}%</span>
        </span>
        <span class="text-green-400 font-medium">✓ ${ok}</span>
        <span class="text-yellow-400 font-medium">⚠ ${partial}</span>
        <span class="text-red-400 font-medium">✗ ${missing}</span>
      </div>
    `;
  }

  private renderLoadedStockpiles(): string {
    if (this.csvEntries.length === 0) return '';
    const depots = this.getDepots();
    const directCargoNames = this.getDirectCargoNames();
    const roles: DepotRole[] = ['backline', 'intermediate', 'front'];
    return `
      <div class="mb-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
        ${roles.map(role => this.renderDepotRoleCard(role, depots.filter(d => d.role === role), directCargoNames)).join('')}
      </div>
    `;
  }

  private renderDepotRoleCard(
    role: DepotRole,
    roleDepots: Array<{ name: string; role: DepotRole; entries: CsvEntry[] }>,
    directCargoNames: Set<string>,
  ): string {
    const accent = ROLE_ACCENTS[role];
    const roleLabel = ROLE_LABELS[role];

    if (roleDepots.length === 0) {
      return `
        <div class="bg-gray-800/30 border border-dashed border-gray-700 border-t-4 ${accent.border} rounded-lg p-3 flex flex-col items-center justify-center gap-1 min-h-52.5 text-center opacity-60">
          <span class="text-[10px] font-semibold uppercase tracking-wide ${accent.text}">${roleLabel}</span>
          <p class="text-xs text-gray-500 mt-1">No ${roleLabel.toLowerCase()} depot loaded</p>
          <p class="text-[11px] text-gray-600 max-w-[16rem]">Load a stockpile and set its role to ${roleLabel} to see it here.</p>
        </div>
      `;
    }

    const activeIndex = Math.min(this.activeDepotTab[role] ?? 0, roleDepots.length - 1);
    const depot = roleDepots[activeIndex];
    const totals = normalizeStockItems(this.aggregateEntries(depot.entries), directCargoNames);
    const totalCrates = totals.reduce((sum, item) => sum + item.crates, 0);
    const totalAssembled = totals.reduce((sum, item) => sum + item.assembled, 0);
    const location = depot.entries.find(e => e.header?.location)?.header?.location ?? null;

    return `
      <div class="bg-gray-800/60 border border-gray-700 border-t-4 ${accent.border} rounded-lg p-3 flex flex-col gap-2 min-h-52.5" data-role-card="${role}">
        ${roleDepots.length > 1 ? `
        <div class="flex flex-wrap gap-3 -mt-0.5 border-b border-gray-700">
          ${roleDepots.map((d, i) => `
            <button class="depot-tab-btn px-0.5 pb-1.5 text-xs border-b-2 -mb-px transition-colors ${i === activeIndex ? `${accent.border} ${accent.text} font-semibold` : 'border-transparent text-gray-500 hover:text-gray-300 hover:border-gray-600'}"
              data-role="${role}" data-index="${i}">${escapeHtml(d.name)}</button>
          `).join('')}
        </div>
        ` : ''}

        <span class="text-[10px] font-semibold uppercase tracking-wide ${accent.text}">${roleLabel}</span>

        <div class="flex items-center gap-2">
          <input class="depot-group-name-input min-w-0 flex-1 bg-transparent border-b border-transparent focus:border-blue-500 text-base font-semibold text-gray-100 focus:outline-none"
            data-old-depot-name="${escapeHtml(depot.name)}" value="${escapeHtml(depot.name)}" aria-label="Depot name" />
          <select class="depot-role-select bg-gray-900 border border-gray-700 rounded px-1 py-0.5 text-[11px] text-gray-400 shrink-0"
            data-depot-name="${escapeHtml(depot.name)}" aria-label="Depot role">
            <option value="backline" ${role === 'backline' ? 'selected' : ''}>Backline</option>
            <option value="intermediate" ${role === 'intermediate' ? 'selected' : ''}>Main</option>
            <option value="front" ${role === 'front' ? 'selected' : ''}>Front</option>
          </select>
        </div>
        ${location ? `<span class="text-xs text-gray-500 -mt-1.5 truncate" title="${escapeHtml(location)}">${escapeHtml(formatLocationLabel(location, depot.name))}</span>` : ''}

        <div>
          <span class="block text-[10px] uppercase tracking-wide text-gray-500 mb-1">Snapshots included</span>
          <div class="flex flex-wrap gap-1.5">
            ${depot.entries.map(e => `
              <span class="inline-flex items-center rounded-full border ${accent.badgeBg} text-[11px] text-gray-200 overflow-hidden" title="${escapeHtml(e.label)}">
                <span class="pl-2 pr-1.5 py-1">${escapeHtml(formatLocationLabel(e.label, depot.name))}</span>
                <button class="remove-entry-btn shrink-0 flex items-center justify-center w-5 h-5 mr-0.5 rounded-full bg-black/25 text-gray-100 hover:bg-red-500 hover:text-white transition-colors" data-entry-id="${escapeHtml(e.id)}" data-entry-label="${escapeHtml(formatLocationLabel(e.label, depot.name))}" title="Remove this snapshot" aria-label="Remove snapshot ${escapeHtml(e.label)}">
                  <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M6 18L18 6M6 6l12 12"/></svg>
                </button>
              </span>
            `).join('')}
          </div>
        </div>

        <div class="bg-gray-900/60 border border-gray-700 rounded-md px-2 py-1.5">
          <span class="block text-[10px] uppercase tracking-wide text-gray-500">Snapshot recorded</span>
          <span class="text-xs text-gray-300">${escapeHtml(formatSnapshotDateRange(depot.entries))}</span>
        </div>

        <div class="mt-auto grid grid-cols-2 gap-2 pt-1">
          <div>
            <span class="block text-lg font-semibold text-gray-100 tabular-nums">${totalCrates}</span>
            <span class="block text-[10px] text-gray-500">crates total</span>
          </div>
          <div>
            <span class="block text-lg font-semibold text-gray-100 tabular-nums">${totalAssembled}</span>
            <span class="block text-[10px] text-gray-500">vehicles &amp; equipment (unit)</span>
          </div>
        </div>
      </div>
    `;
  }

  private renderEmpty(): string {
    return `
      <div class="flex flex-col items-center justify-center h-full text-center text-gray-500 gap-3">
        <svg class="w-14 h-14 opacity-20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"
            d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2
               M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2
               m-6 9l2 2 4-4"/>
        </svg>
        <p class="text-base font-medium text-gray-400">No stockpile loaded</p>
        <p class="text-sm max-w-xs">
          Load a file, drag &amp; drop, or paste from clipboard ("Paste") to compare against the active template.
        </p>
        <p class="text-xs text-gray-600 max-w-xs">
          You can load multiple stockpiles — their quantities will be aggregated.
        </p>
      </div>
    `;
  }

  private renderDepotMatrix(): string {
    if (!this.result) return '';
    const depots = this.getDepots();
    const directCargoNames = this.getDirectCargoNames();
    type DepotMatrixRow = Pick<StockpileRow, 'itemName' | 'targetQty' | 'sectionTitle' | 'sectionColor' | 'iconPath'> & { itemName: string };
    const depotItems = new Map(depots.map(depot => [
      depot.name,
      new Map(normalizeStockItems(this.aggregateEntries(depot.entries), directCargoNames).map(item => [item.itemName, item])),
    ]));
    const iconPathsByName = new Map(Object.entries(this.iconMapping).map(([path, itemName]) => [
      itemName,
      `${getBaseUrl()}assets/icons/${path}`,
    ]));
    const rowsByName = new Map<string, DepotMatrixRow>(
      this.result.rows
        .filter((row): row is StockpileRow & { itemName: string } => row.itemName !== null)
        .map(row => [row.itemName, row]),
    );
    for (const items of depotItems.values()) {
      for (const itemName of items.keys()) {
        if (!rowsByName.has(itemName)) rowsByName.set(itemName, {
          itemName,
          targetQty: -1,
          sectionTitle: 'Not in template',
          sectionColor: '#4b5563',
          iconPath: iconPathsByName.get(itemName) ?? '',
        });
      }
    }
    const sectionOrder = [...new Set([...rowsByName.values()].map(row => row.sectionTitle))];
    const intermediate = depots.find(depot => depot.role === 'intermediate');
    const intermediateItems = intermediate ? depotItems.get(intermediate.name) : undefined;
    const getStatus = (row: DepotMatrixRow): RowStatus => {
      if (row.targetQty === -1) return 'unknown';
      const item = intermediateItems?.get(row.itemName);
      const quantity = (item?.crates ?? 0) + (item?.assembled ?? 0);
      if (quantity >= row.targetQty) return 'ok';
      return quantity > 0 ? 'partial' : 'missing';
    };
    const getGap = (row: DepotMatrixRow): number => {
      if (row.targetQty === -1) return Infinity;
      const item = intermediateItems?.get(row.itemName);
      return (item?.crates ?? 0) + (item?.assembled ?? 0) - row.targetQty;
    };
    let rows = [...rowsByName.values()];
    if (this.filterStatus !== 'all') rows = rows.filter(row => getStatus(row) === this.filterStatus);
    if (this.hideOk) rows = rows.filter(row => getStatus(row) !== 'ok');
    if (this.searchQuery.trim()) {
      const query = this.searchQuery.trim().toLowerCase();
      rows = rows.filter(row => row.itemName.toLowerCase().includes(query));
    }
    if (this.sortByGap) rows.sort((left, right) => getGap(left) - getGap(right));
    const rowsBySection = new Map<string, DepotMatrixRow[]>();
    for (const row of rows) {
      const sectionRows = rowsBySection.get(row.sectionTitle) ?? [];
      sectionRows.push(row);
      rowsBySection.set(row.sectionTitle, sectionRows);
    }

    const renderHeader = (): string => {
      const group = (sticky: boolean): string => `
        <th class="${sticky ? 'sticky left-0 z-10' : ''} bg-gray-800 text-left px-3 py-2 min-w-72 border-r border-gray-700">Item / target</th>
        ${depots.map(depot => `
          <th class="px-3 py-2 min-w-40 text-right border-r border-gray-700">
            <span class="block text-gray-200">${escapeHtml(depot.name)}</span>
            <span class="block uppercase text-[10px] ${depot.role === 'front' ? 'text-cyan-400' : depot.role === 'intermediate' ? 'text-amber-400' : 'text-lime-400'}">${ROLE_LABELS[depot.role]}</span>
          </th>
        `).join('')}
        <th class="px-3 py-2 min-w-28 text-right">Calculated total</th>
      `;
      return `
        <thead class="bg-gray-800 text-gray-300">
          <tr>
            ${group(true)}
            <th class="w-px p-0 border-l-2 border-gray-600"></th>
            ${group(false)}
          </tr>
        </thead>
      `;
    };

    const renderRowCells = (row: DepotMatrixRow, sticky: boolean): string => {
      const target = row.targetQty === -1 ? null : row.targetQty;
      let calculatedTotal = 0;
      const depotCells = depots.map(depot => {
        const item = depotItems.get(depot.name)?.get(row.itemName);
        const crates = item?.crates ?? 0;
        const assembled = item?.assembled ?? 0;
        if (depot.role !== 'front') calculatedTotal += crates + assembled;
        const gap = depot.role === 'intermediate' && target !== null ? crates + assembled - target : null;
        return `
          <td class="px-3 py-2 text-right border-r border-gray-800 tabular-nums">
            <span class="text-gray-200">${crates}</span><span class="text-gray-600"> cr</span>
            ${assembled > 0 ? `<span class="block text-cyan-400">${assembled} assembled</span>` : ''}
            ${gap !== null ? `<span class="block ${gap < 0 ? 'text-red-400' : 'text-green-400'}">${gap > 0 ? '+' : ''}${gap}</span>` : ''}
          </td>
        `;
      }).join('');
      return `
        <td class="${sticky ? 'sticky left-0' : ''} bg-gray-900 px-3 py-2 border-r border-gray-700">
          <div class="flex items-center gap-3">
            ${row.iconPath
              ? `<img src="${escapeHtml(row.iconPath)}" class="w-10 h-10 object-contain shrink-0" alt="" />`
              : `<span class="w-10 h-10 shrink-0 grid place-items-center rounded bg-gray-800 text-gray-600" aria-hidden="true">?</span>`}
            <div class="min-w-0">
              <span class="block text-gray-200">${escapeHtml(row.itemName)}</span>
              <span class="block text-gray-600">target ${target ?? '∞'}</span>
            </div>
          </div>
        </td>
        ${depotCells}
        <td class="px-3 py-2 text-right font-medium text-gray-200 tabular-nums">${calculatedTotal}</td>
      `;
    };

    const renderEmptyRowCells = (): string =>
      '<td></td>'.repeat(depots.length + 2);

    return `
      <div class="mb-3 text-xs text-gray-500">${rows.length} item${rows.length !== 1 ? 's' : ''}</div>
      ${sectionOrder.map(sectionTitle => {
        const sectionRows = rowsBySection.get(sectionTitle);
        if (!sectionRows) return '';
        const collapsed = this.collapsedSections.has(sectionTitle);
        const sectionColor = sectionRows[0].sectionColor;
        const pairs: [DepotMatrixRow, DepotMatrixRow | null][] = [];
        for (let i = 0; i < sectionRows.length; i += 2) {
          pairs.push([sectionRows[i], sectionRows[i + 1] ?? null]);
        }
        return `
          <div class="mb-3">
            <button class="section-toggle w-full flex items-center gap-2 py-1.5 px-2 rounded text-left text-sm font-semibold text-gray-300 hover:bg-gray-800/50 transition-colors"
                    data-section-key="${escapeHtml(sectionTitle)}">
              <svg class="w-3.5 h-3.5 shrink-0 text-gray-500 transition-transform ${collapsed ? '' : 'rotate-90'}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
              </svg>
              <span class="w-2.5 h-2.5 rounded-full shrink-0" style="background-color:${escapeHtml(sectionColor)}"></span>
              <span>${escapeHtml(sectionTitle)}</span>
              <span class="text-xs text-gray-500 font-normal">${sectionRows.length} item${sectionRows.length !== 1 ? 's' : ''}</span>
            </button>
            <div class="${collapsed ? 'hidden' : ''}">
              <div class="rounded-lg border border-gray-700 overflow-x-auto">
                <table class="min-w-full text-xs border-collapse">
                  ${renderHeader()}
                  <tbody class="divide-y divide-gray-800">
                    ${pairs.map(([left, right]) => `
                      <tr class="hover:bg-gray-800/40">
                        ${renderRowCells(left, true)}
                        <td class="w-px p-0 border-l-2 border-gray-600"></td>
                        ${right ? renderRowCells(right, false) : renderEmptyRowCells()}
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        `;
      }).join('')}
    `;
  }

  private renderTable(): string {
    if (!this.result) return '';

    const roleMaps = this.getRoleItemMaps();

    // Group rows by section title (preserving order) — "Facility" sections hold facility-only
    // gear that isn't part of MPF production, so they're hidden here (Transport planning still shows them).
    const sectionOrder: string[] = [];
    const bySection = new Map<string, StockpileRow[]>();
    for (const row of this.result.rows) {
      if (row.sectionTitle.toLowerCase().includes('facility')) continue;
      if (!bySection.has(row.sectionTitle)) {
        sectionOrder.push(row.sectionTitle);
        bySection.set(row.sectionTitle, []);
      }
      bySection.get(row.sectionTitle)!.push(row);
    }

    const visibleRows = (rows: StockpileRow[]): StockpileRow[] => {
      let filtered = this.filterStatus === 'all'
        ? rows
        : rows.filter(r => r.status === this.filterStatus);
      if (this.hideOk) {
        filtered = filtered.filter(r => r.status !== 'ok');
      }
      if (this.searchQuery.trim()) {
        const q = this.searchQuery.trim().toLowerCase();
        filtered = filtered.filter(r => r.itemName?.toLowerCase().includes(q) ?? false);
      }
      if (this.sortByGap) {
        // Most missing first (largest negative gap), unknowns last
        filtered = [...filtered].sort((a, b) => {
          const gapA = a.status === 'unknown' || a.targetQty === -1 ? Infinity : a.stockpileQty - a.targetQty;
          const gapB = b.status === 'unknown' || b.targetQty === -1 ? Infinity : b.stockpileQty - b.targetQty;
          return gapA - gapB;
        });
      }
      return filtered;
    };

    let html = '';

    // Per-section collapsible tables
    for (const sectionTitle of sectionOrder) {
      const rows = bySection.get(sectionTitle)!;
      const visible = visibleRows(rows);
      if (visible.length === 0) continue;

      const collapsed = this.collapsedSections.has(sectionTitle);
      const sectionColor = rows[0].sectionColor;
      const ok      = rows.filter(r => r.status === 'ok').length;
      const partial = rows.filter(r => r.status === 'partial').length;
      const missing = rows.filter(r => r.status === 'missing').length;
      const known   = rows.filter(r => r.status !== 'unknown').length;
      const pct     = known > 0 ? Math.round((ok / known) * 100) : 0;
      const barColor = pct === 100 ? '#22c55e' : pct >= 50 ? '#eab308' : '#ef4444';

      html += `
        <div class="mb-3">
          <button class="section-toggle w-full flex items-center gap-2 text-sm font-semibold text-gray-300 mb-0 py-1.5 px-2 rounded hover:bg-gray-800/50 transition-colors text-left"
                  data-section-key="${escapeHtml(sectionTitle)}">
            <svg class="w-3.5 h-3.5 shrink-0 text-gray-500 transition-transform ${collapsed ? '' : 'rotate-90'}"
                 fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
            </svg>
            <span class="w-2.5 h-2.5 rounded-full inline-block shrink-0" style="background-color: ${escapeHtml(sectionColor)}"></span>
            ${escapeHtml(sectionTitle)}
            <span class="text-xs text-gray-500 font-normal">${rows.length} item${rows.length > 1 ? 's' : ''}</span>
            <span class="ml-auto flex items-center gap-3 text-xs font-normal">
              <span class="flex items-center gap-1.5">
                <span class="w-16 h-1.5 bg-gray-700 rounded-full overflow-hidden inline-block">
                  <span class="h-full rounded-full block transition-all duration-300" style="width: ${pct}%; background-color: ${barColor}"></span>
                </span>
                <span class="text-gray-400 tabular-nums w-7 text-right">${pct}%</span>
              </span>
              ${ok      > 0 ? `<span class="text-green-400">✓ ${ok}</span>`      : ''}
              ${partial > 0 ? `<span class="text-yellow-400">⚠ ${partial}</span>` : ''}
              ${missing > 0 ? `<span class="text-red-400">✗ ${missing}</span>`    : ''}
            </span>
          </button>
          <div class="${collapsed ? 'hidden' : ''}">
            <div class="rounded-lg overflow-hidden border border-gray-700">
              <table class="w-full text-sm">
                <thead>
                  <tr class="bg-gray-800 text-gray-400 text-xs">
                    <th class="text-left px-2 py-2 font-medium w-56" rowspan="2">Item</th>
                    <th class="text-right px-2 py-2 font-medium w-16" rowspan="2">Target</th>
                    <th class="text-center px-2 py-1 font-medium border-b border-gray-700/70" colspan="3">Stockpile</th>
                    <th class="text-right px-2 py-2 font-medium w-20" rowspan="2">Stockpile<br/><span class="${ROLE_ACCENTS.backline.text}">B</span>+<span class="${ROLE_ACCENTS.intermediate.text}">M</span></th>
                    <th class="text-right px-2 py-2 font-medium w-16" rowspan="2">Gap</th>
                    <th class="text-center px-2 py-2 font-medium w-24" rowspan="2">Status</th>
                    <th class="w-px p-0 border-l-2 border-gray-600" rowspan="2"></th>
                    <th class="text-left px-2 py-2 font-medium w-56" rowspan="2">Item</th>
                    <th class="text-right px-2 py-2 font-medium w-16" rowspan="2">Target</th>
                    <th class="text-center px-2 py-1 font-medium border-b border-gray-700/70" colspan="3">Stockpile</th>
                    <th class="text-right px-2 py-2 font-medium w-20" rowspan="2">Stockpile<br/><span class="${ROLE_ACCENTS.backline.text}">B</span>+<span class="${ROLE_ACCENTS.intermediate.text}">M</span></th>
                    <th class="text-right px-2 py-2 font-medium w-16" rowspan="2">Gap</th>
                    <th class="text-center px-2 py-2 font-medium w-24" rowspan="2">Status</th>
                  </tr>
                  <tr class="bg-gray-800 text-gray-500 text-[11px]">
                    <th class="text-right px-2 py-1 font-medium w-10 ${ROLE_ACCENTS.backline.text}" title="Backline">B</th>
                    <th class="text-right px-2 py-1 font-medium w-10 ${ROLE_ACCENTS.intermediate.text}" title="Main">M</th>
                    <th class="text-right px-2 py-1 font-medium w-10 ${ROLE_ACCENTS.front.text}" title="Front">F</th>
                    <th class="text-right px-2 py-1 font-medium w-10 ${ROLE_ACCENTS.backline.text}" title="Backline">B</th>
                    <th class="text-right px-2 py-1 font-medium w-10 ${ROLE_ACCENTS.intermediate.text}" title="Main">M</th>
                    <th class="text-right px-2 py-1 font-medium w-10 ${ROLE_ACCENTS.front.text}" title="Front">F</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-gray-700/50">
                  ${(() => {
                    const pairs: [StockpileRow, StockpileRow | null][] = [];
                    for (let i = 0; i < visible.length; i += 2) {
                      pairs.push([visible[i], visible[i + 1] ?? null]);
                    }
                    return pairs.map(([left, right], i) => `
                      <tr class="${i % 2 === 1 ? 'bg-gray-800/30' : ''} hover:bg-gray-700/30 transition-colors">
                        ${this.renderRowCells(left, roleMaps)}
                        <td class="w-px p-0 border-l-2 border-gray-600"></td>
                        ${right ? this.renderRowCells(right, roleMaps) : this.renderEmptyCells()}
                      </tr>
                    `).join('');
                  })()}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      `;
    }

    // Surplus section — also collapsible; hidden when hideOk is active
    if (this.result.surplus.length > 0 && this.filterStatus === 'all' && !this.hideOk) {
      const surplusKey = '__surplus__';
      const collapsed  = this.collapsedSections.has(surplusKey);
      html += `
        <div class="mb-3">
          <button class="section-toggle w-full flex items-center gap-2 text-sm font-semibold text-gray-500 py-1.5 px-2 rounded hover:bg-gray-800/30 transition-colors text-left"
                  data-section-key="${surplusKey}">
            <svg class="w-3.5 h-3.5 shrink-0 text-gray-600 transition-transform ${collapsed ? '' : 'rotate-90'}"
                 fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
            </svg>
            <span class="w-2.5 h-2.5 rounded-full bg-gray-600 inline-block shrink-0"></span>
            Not in template
            <span class="text-xs text-gray-600 font-normal">${this.result.surplus.length} item${this.result.surplus.length > 1 ? 's' : ''} with qty &gt; 0</span>
          </button>
          <div class="${collapsed ? 'hidden' : ''}">
            <div class="rounded-lg overflow-hidden border border-gray-700/50">
              <table class="w-full text-sm">
                <thead>
                  <tr class="bg-gray-800/50 text-gray-500 text-xs">
                    <th class="text-left px-3 py-2 font-medium">Item</th>
                    <th class="text-right px-3 py-2 font-medium w-20">Stockpile</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-gray-700/30">
                  ${this.result.surplus.map(s => `
                    <tr class="text-gray-400 hover:bg-gray-800/30 transition-colors">
                      <td class="px-3 py-1.5">${escapeHtml(s.itemName)}</td>
                      <td class="px-3 py-1.5 text-right font-mono text-xs">${s.qty}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      `;
    }

    return html;
  }

  private renderRowCells(row: StockpileRow, roleMaps: Record<DepotRole, Map<string, number>>): string {
    const isUnknown = row.status === 'unknown';
    const cellClass = isUnknown ? 'text-gray-600' : 'text-gray-300';

    const statusBadge = isUnknown
      ? '<span class="text-sm text-gray-600">—</span>'
      : row.status === 'ok'
        ? '<span class="text-sm font-medium text-green-400">✓ OK</span>'
        : row.status === 'partial'
          ? '<span class="text-sm font-medium text-yellow-400">⚠ Partial</span>'
          : '<span class="text-sm font-medium text-red-400">✗ Missing</span>';

    const itemLabel = row.itemName
      ? `${escapeHtml(row.itemName)}${row.isCrateTarget ? ' <span class="text-xs text-gray-500 ml-1">(Crate)</span>' : ''}`
      : `<span class="text-gray-600 text-xs font-mono" title="No mapping found">${escapeHtml(row.iconPath.split('/').pop() ?? '')}</span>`;

    const targetDisplay = row.targetQty === -1
      ? '<span class="text-gray-500">∞</span>'
      : `${row.targetQty}`;

    const roleQtyDisplay = (role: DepotRole): string => {
      if (isUnknown || !row.itemName) return '<span class="text-gray-600">—</span>';
      return `${resolveItemQuantity(roleMaps[role], row.itemName)}`;
    };

    const stockpileDisplay = isUnknown
      ? '<span class="text-gray-600">—</span>'
      : `<span class="${row.status === 'ok' ? 'text-green-400' : row.status === 'partial' ? 'text-yellow-400' : 'text-red-400'}">${row.stockpileQty}</span>`;

    let gapDisplay: string;
    if (isUnknown || row.targetQty === -1) {
      gapDisplay = '<span class="text-gray-600">—</span>';
    } else {
      const gap = row.stockpileQty - row.targetQty;
      if (gap === 0) {
        gapDisplay = '<span class="text-gray-500">0</span>';
      } else if (gap > 0) {
        gapDisplay = `<span class="text-blue-400">+${gap}</span>`;
      } else {
        gapDisplay = `<span class="text-red-400">${gap}</span>`;
      }
    }

    return `
      <td class="px-2 py-1.5">
        <div class="flex items-center gap-2">
          <img src="${escapeHtml(row.iconPath)}"
               class="w-12 h-12 object-contain shrink-0 ${isUnknown ? 'opacity-25' : ''}"
               alt="" />
          <span class="truncate ${cellClass}">${itemLabel}</span>
        </div>
      </td>
      <td class="px-2 py-1.5 text-right font-mono text-sm text-gray-400">${targetDisplay}</td>
      <td class="px-2 py-1.5 text-right font-mono text-xs text-gray-500">${roleQtyDisplay('backline')}</td>
      <td class="px-2 py-1.5 text-right font-mono text-xs text-gray-500">${roleQtyDisplay('intermediate')}</td>
      <td class="px-2 py-1.5 text-right font-mono text-xs text-gray-500">${roleQtyDisplay('front')}</td>
      <td class="px-2 py-1.5 text-right font-mono text-sm ${cellClass}">${stockpileDisplay}</td>
      <td class="px-2 py-1.5 text-right font-mono text-sm ${cellClass}">${gapDisplay}</td>
      <td class="px-2 py-1.5 text-center">${statusBadge}</td>
    `;
  }

  private renderEmptyCells(): string {
    return '<td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td>';
  }

  // ─── Events ───────────────────────────────────────────────────────────────

  // ─── Shortage / Todolist generation ─────────────────────────────────────────

  /**
   * Sums the CSV-declared quantity of an item (crate + plain form) across all
   * currently loaded Backline-role depots. Used to deduct existing Backline
   * stock from the Intermediate shortfall so the MPF todolist only asks to
   * produce what isn't already available to transport.
   */
  private getBacklineQty(itemName: string): number {
    const backlineEntries = this.csvEntries.filter(entry => entry.role === 'backline');
    if (backlineEntries.length === 0) return 0;
    const items = this.aggregateEntries(backlineEntries);
    const crateQty = items.get(`${itemName} (Crate)`) ?? 0;
    const plainQty = items.get(itemName) ?? 0;
    return crateQty + plainQty;
  }

  private buildShortageData(
    includedRoles: ReadonlySet<DepotRole> = this.calculationRoles,
    deductBackline = true,
  ): {
    mpfRows: Array<{ row: StockpileRow; entry: MpfDataEntry; cratesNeeded: number; backlineAvailable: number; toProduce: number; orderCount: number }>;
    nonMpfRows: StockpileRow[];
  } {
    if (!this.result) return { mpfRows: [], nonMpfRows: [] };

    const includedEntries = this.csvEntries.filter(entry => includedRoles.has(entry.role));
    // "Facility" sections aren't part of MPF production — exclude them from the shortage calculator.
    const mpfSections = this.getSections().filter(section => !section.title.toLowerCase().includes('facility'));
    const comparison = buildComparison(
      mpfSections,
      this.aggregateEntries(includedEntries),
      this.iconMapping,
      null,
    );
    const missingRows = comparison.rows.filter(r =>
      r.itemName !== null &&
      (r.status === 'missing' || r.status === 'partial') &&
      r.targetQty !== -1
    );

    const mpfRows: Array<{ row: StockpileRow; entry: MpfDataEntry; cratesNeeded: number; backlineAvailable: number; toProduce: number; orderCount: number }> = [];
    const nonMpfRows: StockpileRow[] = [];

    // Deducting Backline stock only makes sense if Backline isn't already part
    // of the included roles (otherwise its stock is already counted in the gap).
    const shouldDeductBackline = deductBackline && !includedRoles.has('backline');

    for (const row of missingRows) {
      const filename = iconPathToMappingKey(row.iconPath);
      const entry = store.mpfData.find(e => e.iconFilename === filename);
      const gap = Math.abs(row.stockpileQty - row.targetQty);

      if (entry) {
        // gap is always in crates for MPF-craftable items (Foxhole stores non-vehicles as crates)
        const cratesNeeded = gap;
        const backlineAvailable = shouldDeductBackline
          ? Math.min(cratesNeeded, this.getBacklineQty(row.itemName ?? ''))
          : 0;
        const toProduce = Math.max(0, cratesNeeded - backlineAvailable);
        const orderCount = Math.ceil(toProduce / (entry.maxCrates || 1));
        mpfRows.push({ row, entry, cratesNeeded, backlineAvailable, toProduce, orderCount });
      } else {
        nonMpfRows.push(row);
      }
    }

    return { mpfRows, nonMpfRows };
  }

  private generateDiscordText(mpfRows: Array<{ row: StockpileRow; entry: MpfDataEntry; cratesNeeded: number; backlineAvailable: number; toProduce: number; orderCount: number }>): string {
    const craftable = mpfRows.filter(r => r.orderCount > 0);
    if (craftable.length === 0) return '*(nothing to order)*';

    const now = new Date();
    const firstHeader = this.csvEntries[0]?.header;
    const title = firstHeader
      ? `TODOLIST ${firstHeader.location}`
      : 'TODOLIST';

    const items: TodoListItem[] = craftable.map(({ row, entry, orderCount }) => ({
      id: generateId(),
      iconFilename: entry.iconFilename,
      itemName: row.itemName ?? entry.itemName,
      category: entry.itemCategory as MpfCategory,
      faction: entry.faction,
      cost: entry.cost,
      maxCrates: entry.maxCrates,
      numberProduced: entry.numberProduced,
      crateBonus: entry.crateBonus ?? 1,
      subtypeFilename: entry.subtypeFilename,
      orderCount,
    }));

    const fakeTodoList: TodoList = {
      title,
      autoDate: true,
      faction: 'all',
      items,
      textBlocks: [],
    };

    return renderTodoList(fakeTodoList, now);
  }

  /** Same materials/crates summary as the native MPF Todolist view, computed from shortage rows instead of TodoListItems. */
  private computeShortageTotals(
    craftableRows: Array<{ entry: MpfDataEntry; orderCount: number }>,
  ): { materialsText: string; cratesText: string } {
    const total = { bmat: 0, rmat: 0, emat: 0, hemat: 0 };
    for (const { entry, orderCount } of craftableRows) {
      const cost = fullOrderCost(entry.cost, entry.maxCrates);
      total.bmat += cost.bmat * orderCount;
      total.rmat += cost.rmat * orderCount;
      total.emat += cost.emat * orderCount;
      total.hemat += cost.hemat * orderCount;
    }

    const matParts: string[] = [];
    if (total.bmat) matParts.push(`${total.bmat} Bmats`);
    if (total.rmat) matParts.push(`${total.rmat} Rmats`);
    if (total.emat) matParts.push(`${total.emat} Emats`);
    if (total.hemat) matParts.push(`${total.hemat} HEmats`);

    const crateParts: string[] = [];
    if (total.bmat) crateParts.push(`${Math.ceil(total.bmat / 100)} Bmat crate(s)`);
    if (total.rmat) crateParts.push(`${Math.ceil(total.rmat / 20)} Rmat crate(s)`);
    if (total.emat) crateParts.push(`${Math.ceil(total.emat / 40)} Emat crate(s)`);
    if (total.hemat) crateParts.push(`${Math.ceil(total.hemat / 30)} HEmat crate(s)`);

    return {
      materialsText: matParts.length ? matParts.join(' / ') : '—',
      cratesText: crateParts.length ? `≈ ${crateParts.join(' / ')}` : '',
    };
  }

  /**
   * Wires an Escape-key listener that triggers `close`, and returns a wrapped
   * close function that also removes the listener (call it from every close path:
   * close button, backdrop click, successful action, etc.).
   */
  private attachEscapeClose(close: () => void): () => void {
    const handler = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') wrappedClose();
    };
    window.addEventListener('keydown', handler);
    const wrappedClose = (): void => {
      window.removeEventListener('keydown', handler);
      close();
    };
    return wrappedClose;
  }

  private showLoadCsvModal(): void {
    const modal = document.createElement('div');
    modal.id = 'csv-load-modal';
    modal.className = 'fixed inset-0 bg-black/50 flex items-center justify-center z-50';
    modal.innerHTML = `
      <div class="bg-gray-800 rounded-lg shadow-xl p-6 w-[520px] max-w-[95vw]">
        <!-- Header -->
        <div class="flex items-center justify-between mb-5">
          <h2 class="text-lg font-semibold text-white">Load Stockpile CSV</h2>
          <button id="csv-modal-close" class="text-gray-400 hover:text-white transition-colors" title="Close">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>
        <!-- Panels -->
        <div class="grid grid-cols-2 gap-4">
          <!-- Left: two stacked action cards -->
          <div class="flex flex-col gap-4">
            <label id="csv-modal-load-label" class="flex flex-col items-center justify-center gap-2 p-5 bg-gray-700/50 rounded-lg border border-gray-600 hover:border-blue-500 hover:bg-gray-700 cursor-pointer transition-colors group flex-1">
              <svg class="w-8 h-8 text-blue-400 group-hover:text-blue-300 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/>
              </svg>
              <p class="font-semibold text-sm text-white">Load file</p>
              <p class="text-xs text-gray-400 text-center">.csv / .txt</p>
              <input type="file" accept=".csv,.txt" id="csv-modal-file-input" class="hidden" />
            </label>
            <button id="csv-modal-paste" class="flex flex-col items-center justify-center gap-2 p-5 bg-gray-700/50 rounded-lg border border-gray-600 hover:border-blue-500 hover:bg-gray-700 cursor-pointer transition-colors group flex-1">
              <svg class="w-8 h-8 text-gray-400 group-hover:text-blue-300 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/>
              </svg>
              <p class="font-semibold text-sm text-white">Paste</p>
              <p class="text-xs text-gray-400 text-center">From clipboard</p>
            </button>
          </div>
          <!-- Right: drag & drop -->
          <div id="csv-modal-dropzone" class="flex flex-col items-center justify-center gap-3 p-5 bg-gray-700/50 rounded-lg border border-dashed border-gray-600 hover:border-gray-400 transition-colors min-h-[180px]">
            <svg class="w-10 h-10 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"/>
            </svg>
            <p class="font-semibold text-sm text-white">Drag &amp; drop</p>
            <p class="text-xs text-gray-400 text-center">Drop a .csv file here</p>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    const close = this.attachEscapeClose(() => modal.remove());

    modal.querySelector('#csv-modal-close')!.addEventListener('click', close);
    modal.addEventListener('click', (e) => { if (e.target === modal) close(); });

    // Load file
    modal.querySelector('#csv-modal-file-input')!.addEventListener('change', (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      close();
      this.handleLoadCsv(file);
    });

    // Paste
    modal.querySelector('#csv-modal-paste')!.addEventListener('click', async () => {
      try {
        const text = await navigator.clipboard.readText();
        if (!text.trim()) { alert('Clipboard is empty.'); return; }
        close();
        this.handlePasteCsv(text);
      } catch {
        alert('Could not read clipboard. Make sure clipboard access is allowed.');
      }
    });

    // Drag & drop
    const dropzone = modal.querySelector('#csv-modal-dropzone') as HTMLElement;
    dropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropzone.classList.add('border-blue-400', 'bg-gray-700');
    });
    dropzone.addEventListener('dragleave', () => {
      dropzone.classList.remove('border-blue-400', 'bg-gray-700');
    });
    dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzone.classList.remove('border-blue-400', 'bg-gray-700');
      const file = e.dataTransfer?.files[0];
      if (file) { close(); this.handleLoadCsv(file); }
    });
  }

  private showTodolistModal(): void {
    if (!this.container) return;
    const roles: DepotRole[] = ['backline', 'intermediate', 'front'];
    let includedRoles = new Set(this.calculationRoles);
    let deductBackline = (() => {
      try {
        const saved = localStorage.getItem(DEDUCT_BACKLINE_KEY);
        return saved === null ? true : saved === '1';
      } catch {
        return true;
      }
    })();
    const depotCounts = new Map(roles.map(role => [
      role,
      new Set(this.csvEntries.filter(entry => entry.role === role).map(entry => entry.depotName)).size,
    ]));

    const modal = document.createElement('div');
    modal.id = 'shortage-modal';
    modal.className = 'fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4';
    document.body.appendChild(modal);
    const close = this.attachEscapeClose(() => modal.remove());

    const renderModal = (): void => {
      const { mpfRows, nonMpfRows } = this.buildShortageData(includedRoles, deductBackline);
      const discordText = this.generateDiscordText(mpfRows);
      const craftableRows = mpfRows.filter(r => r.orderCount > 0);
      const backlineRows = mpfRows.filter(r => r.backlineAvailable > 0);
      const { materialsText, cratesText } = this.computeShortageTotals(craftableRows);
      const includedDepots = new Set(this.csvEntries
        .filter(entry => includedRoles.has(entry.role))
        .map(entry => entry.depotName));
      const roleSummary = roles
        .filter(role => includedRoles.has(role))
        .map(role => ROLE_LABELS[role])
        .join(' + ');
      const hasBacklineDepots = this.csvEntries.some(entry => entry.role === 'backline');

      modal.innerHTML = `
        <div class="bg-gray-800 rounded-xl shadow-2xl flex flex-col w-full max-w-4xl" style="max-height: 85vh;">
          <div class="flex items-center justify-between px-5 py-3.5 border-b border-gray-700 shrink-0">
            <div>
              <h2 class="font-semibold text-base">Generate Todolist</h2>
              <p class="text-xs text-gray-500 mt-0.5">${craftableRows.length} craftable item${craftableRows.length !== 1 ? 's' : ''} · ${nonMpfRows.length} non-MPF</p>
            </div>
            <button id="close-shortage-modal" class="text-gray-400 hover:text-gray-200 transition-colors p-1 rounded hover:bg-gray-700" aria-label="Close">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
              </svg>
            </button>
          </div>

          <div class="shrink-0 border-b border-gray-700 bg-gray-900/30 px-5 py-3">
            <div class="flex flex-wrap items-center gap-4">
              <span class="text-xs font-medium text-gray-300">Stock included in calculation</span>
              ${roles.map(role => `
                <label class="flex items-center gap-1.5 text-xs text-gray-300">
                  <input class="todolist-role-toggle accent-blue-500" type="checkbox" value="${role}" ${includedRoles.has(role) ? 'checked' : ''} />
                  <span>${ROLE_LABELS[role]} <span class="text-gray-500">(${depotCounts.get(role)})</span></span>
                </label>
              `).join('')}
            </div>
            <p id="todolist-role-summary" class="mt-1.5 text-xs text-gray-500">Counting ${includedDepots.size} depot${includedDepots.size !== 1 ? 's' : ''}: ${roleSummary}</p>
            ${hasBacklineDepots && !includedRoles.has('backline') ? `
              <label class="mt-2 flex items-center gap-1.5 text-xs text-gray-300">
                <input id="deduct-backline-toggle" class="accent-emerald-500" type="checkbox" ${deductBackline ? 'checked' : ''} />
                <span>Deduct available Backline stock from MPF production <span class="text-gray-500">(recommended — avoids over-producing)</span></span>
              </label>
            ` : ''}
          </div>

          <div class="flex flex-1 min-h-0 flex-col md:flex-row overflow-hidden">
            <div class="flex-1 flex flex-col p-4 border-b md:border-b-0 md:border-r border-gray-700 overflow-hidden">
              <div class="flex items-center justify-between mb-2 shrink-0">
                <h3 class="text-sm font-medium text-gray-300">Discord format</h3>
                <button id="copy-discord-text" class="flex items-center gap-1.5 px-2.5 py-1 bg-gray-700 hover:bg-gray-600 rounded text-xs transition-colors">
                  <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/>
                  </svg>
                  Copy
                </button>
              </div>
              <textarea id="discord-textarea" readonly class="flex-1 min-h-56 bg-gray-900 rounded border border-gray-700 p-3 text-xs text-gray-300 font-mono resize-none focus:outline-none focus:border-blue-500 leading-relaxed">${escapeHtml(discordText)}</textarea>
              ${craftableRows.length > 0 ? `
                <div class="mt-2 bg-blue-900/20 border border-blue-700/40 rounded-lg p-3 text-sm text-blue-200 shrink-0">
                  📦 ${craftableRows.length} item${craftableRows.length !== 1 ? 's' : ''} to produce — total = <strong>${materialsText}</strong>.
                  ${cratesText ? `<div class="mt-1 text-xs text-blue-300/70">${cratesText}</div>` : ''}
                </div>
              ` : ''}
            </div>

            <div class="w-full md:w-72 max-h-56 md:max-h-none shrink-0 flex flex-col p-4 overflow-hidden gap-3">
              ${backlineRows.length > 0 ? `
                <div class="flex flex-col overflow-hidden">
                  <h3 class="text-sm font-medium text-gray-300 mb-1 shrink-0">Available in Backline</h3>
                  <p class="text-xs text-gray-500 mb-2 shrink-0">Transport these instead of producing them.</p>
                  <div class="overflow-y-auto space-y-1">
                    ${backlineRows.map(({ row, backlineAvailable }) => `
                      <div class="flex items-center gap-2 px-2 py-1.5 rounded bg-gray-700/40">
                        <img src="${escapeHtml(row.iconPath)}" class="w-6 h-6 object-contain shrink-0" alt="" />
                        <span class="flex-1 text-xs text-gray-300 truncate">${escapeHtml(row.itemName ?? '')}</span>
                        <span class="text-xs font-mono text-emerald-400 shrink-0">${backlineAvailable}</span>
                      </div>
                    `).join('')}
                  </div>
                </div>
              ` : ''}
              <div class="flex-1 flex flex-col overflow-hidden">
                <h3 class="text-sm font-medium text-gray-300 mb-1 shrink-0">Not craftable at MPF</h3>
                <p class="text-xs text-gray-500 mb-3 shrink-0">Source these through factories, facilities, or other means.</p>
                ${nonMpfRows.length === 0
                  ? '<p class="text-xs text-gray-600 italic">None — all missing items are MPF-craftable.</p>'
                  : `<div class="flex-1 overflow-y-auto space-y-1">
                      ${nonMpfRows.map(row => {
                        const gap = Math.abs(row.stockpileQty - row.targetQty);
                        return `
                          <div class="flex items-center gap-2 px-2 py-1.5 rounded bg-gray-700/40">
                            <img src="${escapeHtml(row.iconPath)}" class="w-7 h-7 object-contain shrink-0" alt="" />
                            <span class="flex-1 text-xs text-gray-300 truncate">${escapeHtml(row.itemName ?? '')}</span>
                            <span class="text-xs font-mono text-red-400 shrink-0">−${gap}</span>
                          </div>
                        `;
                      }).join('')}
                    </div>`
                }
              </div>
            </div>
          </div>
        </div>
      `;

      modal.querySelector('#close-shortage-modal')?.addEventListener('click', () => close());
      modal.querySelectorAll<HTMLInputElement>('.todolist-role-toggle').forEach(input => {
        input.addEventListener('change', () => {
          if (!this.setCalculationRole(input.value as DepotRole, input.checked)) {
            input.checked = true;
            return;
          }
          includedRoles = new Set(this.calculationRoles);
          this.render();
          renderModal();
        });
      });
      modal.querySelector('#deduct-backline-toggle')?.addEventListener('change', (e) => {
        deductBackline = (e.target as HTMLInputElement).checked;
        try {
          localStorage.setItem(DEDUCT_BACKLINE_KEY, deductBackline ? '1' : '0');
        } catch (error) {
          console.warn('StockpileView: failed to persist deduct-backline preference', error);
        }
        renderModal();
      });
      modal.querySelector('#copy-discord-text')?.addEventListener('click', async () => {
        const btn = modal.querySelector('#copy-discord-text') as HTMLButtonElement;
        await navigator.clipboard.writeText(discordText);
        btn.textContent = '✓ Copied!';
        setTimeout(() => {
          btn.innerHTML = `<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg> Copy`;
        }, 2000);
      });
    };

    modal.addEventListener('click', (event) => { if (event.target === modal) close(); });
    renderModal();
  }

  private showTransportModal(): void {
    const depots = this.getDepots();
    if (depots.length < 2) {
      alert('Configure at least two depots first.');
      return;
    }

    let sourceName = depots.find(depot => depot.role === 'backline')?.name ?? depots[0].name;
    let destinationName = depots.find(depot => depot.role === 'intermediate' && depot.name !== sourceName)?.name
      ?? depots.find(depot => depot.name !== sourceName)!.name;
    // 'container' est le défaut : abstrait le type de véhicule, juste la quantité à transporter.
    let mode: TransportMode = 'container';
    let trainCars = 14;
    let globalNotes = '';
    let quantities = new Map<string, number>();
    let itemSearch = '';
    let exclusionSearch = '';
    let exclusionsPanelOpen = false;
    let categoryFilter: CargoKind | IconCategory | 'all' = 'all';
    let plannedRoutes: TransportRoute[] = [];
    // Snapshot pris juste avant un "Plan automatically", pour pouvoir tout annuler en un clic plutôt que ligne par ligne.
    let preAutoFillSnapshot: TransportRoute[] | null = null;
    const routeNotes = new Map<string, string>();
    const directCargoNames = this.getDirectCargoNames();
    // Classe chaque item par catégorie de jeu (Small Arms, Heavy Arms...) via le catalogue d'icônes déjà chargé.
    const itemCategoryLookup = new Map<string, string>();
    for (const icon of store.icons) {
      itemCategoryLookup.set(icon.displayName.toLowerCase(), icon.category);
    }
    const isCargoKind = (value: string): value is CargoKind =>
      value === 'container-crate' || value === 'direct-crate' || value === 'assembled';
    const modeLabel = (value: TransportMode): string =>
      value === 'container' ? 'Container/Shippable' : value[0].toUpperCase() + value.slice(1);
    const exclusionOptions = [
      'Heavy Explosive Powder',
      'Refined Materials',
      'Rare Metal',
      'Rare Alloys',
      'Basic Materials',
    ];
    // Catalogue complet des noms d'items connus, pour proposer des suggestions plutôt que d'imposer une saisie exacte.
    const allKnownItemNames = [...new Set(store.icons.map(icon => icon.displayName))].sort((left, right) => left.localeCompare(right));
    // Score de correspondance approximative (sous-séquence ordonnée, bonus consécutif/début de mot) : tolère fautes de frappe et ordre partiel sans dépendance externe.
    const fuzzyMatchScore = (query: string, target: string): number | null => {
      const q = query.toLowerCase();
      const t = target.toLowerCase();
      let queryIndex = 0;
      let score = 0;
      let consecutive = 0;
      for (let targetIndex = 0; targetIndex < t.length && queryIndex < q.length; targetIndex++) {
        if (t[targetIndex] !== q[queryIndex]) {
          consecutive = 0;
          continue;
        }
        consecutive++;
        score += 1 + consecutive;
        if (targetIndex === 0 || /[\s'-]/.test(t[targetIndex - 1])) score += 2;
        queryIndex++;
      }
      if (queryIndex < q.length) return null;
      return score - t.length * 0.01;
    };
    const getExclusionSuggestions = (query: string): string[] => {
      const term = query.trim();
      if (!term) return [];
      return allKnownItemNames
        .filter(name => !transportExclusions.has(name))
        .map(name => ({ name, score: fuzzyMatchScore(term, name) }))
        .filter((entry): entry is { name: string; score: number } => entry.score !== null)
        .sort((left, right) => right.score - left.score)
        .slice(0, 8)
        .map(entry => entry.name);
    };
    let transportExclusions = (() => {
      try {
        const saved = localStorage.getItem(TRANSPORT_EXCLUSIONS_KEY);
        if (saved) return new Set(JSON.parse(saved) as string[]);
      } catch (error) {
        console.warn('StockpileView: failed to restore transport exclusions', error);
      }
      return new Set(DEFAULT_TRANSPORT_EXCLUSIONS);
    })();
    const saveTransportExclusions = (): void => {
      localStorage.setItem(TRANSPORT_EXCLUSIONS_KEY, JSON.stringify([...transportExclusions]));
    };
    const routeKey = (source: string, destination: string): string => `${source}\u0000${destination}`;

    const getAvailableCargo = (): TransportCargoItem[] => {
      const source = depots.find(depot => depot.name === sourceName)!;
      return buildBacklineCargo(this.aggregateEntries(source.entries), directCargoNames, transportExclusions);
    };
    const cargoKey = (item: TransportCargoItem): string => `${item.kind}:${item.itemName}`;
    const getRemainingCargo = (): TransportCargoItem[] => getAvailableCargo().map(item => {
      const plannedQuantity = plannedRoutes
        .filter(route => route.source === sourceName)
        .flatMap(route => route.missions)
        .reduce((total, mission) => {
          // mission.cargo porte déjà la quantité totale (tous voyages confondus) : pas de
          // multiplication par tripCount ici.
          const cargo = mission.cargo.find(candidate => cargoKey(candidate) === cargoKey(item));
          return total + (cargo?.quantity ?? 0);
        }, 0);
      return { ...item, quantity: Math.max(0, item.quantity - plannedQuantity) };
    }).filter(item => item.quantity > 0);
    const addMissionToCurrentRoute = (mission: TransportMission): void => {
      const existing = plannedRoutes.find(route => route.source === sourceName && route.destination === destinationName);
      if (existing) {
        existing.missions.push(mission);
      } else {
        plannedRoutes.push({ source: sourceName, destination: destinationName, missions: [mission] });
      }
    };
    const buildRoutesWithDraft = (draft?: TransportMission): TransportRoute[] => {
      const routes = plannedRoutes.map(route => ({
        ...route,
        notes: (routeNotes.get(routeKey(route.source, route.destination)) ?? '').split('\n').filter(Boolean),
        missions: [...route.missions],
      }));
      if (draft?.cargo.length) {
        const current = routes.find(route => route.source === sourceName && route.destination === destinationName);
        if (current) current.missions.push(draft);
        else routes.push({
          source: sourceName,
          destination: destinationName,
          notes: (routeNotes.get(routeKey(sourceName, destinationName)) ?? '').split('\n').filter(Boolean),
          missions: [draft],
        });
      }
      return routes;
    };
    const renderLoadMeter = (mission: TransportMission): string => {
      const perTripCapacity = transportSlotsPerTrip(mission);
      const tripCount = Math.max(1, mission.tripCount);
      const directItems = mission.cargo.filter(item => item.kind !== 'container-crate');
      const directSlots = directItems.reduce((total, item) => total + item.quantity, 0);
      // Un slot "direct" ne contient qu'une seule unité d'un seul item : on déplie la liste pour retrouver, par index, quel item occupe ce slot.
      const directSlotItems: TransportCargoItem[] = directItems.flatMap(item => Array(item.quantity).fill(item));
      const directKindLabel = (kind: CargoKind): string => kind === 'direct-crate' ? 'Crated shippable' : 'Assembled shippable';
      const crateItems = mission.cargo.filter(item => item.kind === 'container-crate');
      const crateQuantity = crateItems.reduce((total, item) => total + item.quantity, 0);
      const containerSlots = Math.ceil(crateQuantity / 60);
      const partialCrates = crateQuantity % 60;
      const usedSlots = directSlots + containerSlots;
      // Mode 'container' : aucune capacité de véhicule à plafonner, la jauge affiche exactement ce
      // qui est chargé (pas de slot vide), contrairement aux autres haulers (perTripCapacity x tripCount).
      const capacity = mission.mode === 'container' ? usedSlots : perTripCapacity * tripCount;
      // Les caisses en conteneur partagent un même pool de 60 : on répartit chaque item, dans l'ordre, dans des conteneurs de 60 pour savoir ce que contient chaque conteneur.
      const containerBins: Array<Array<{ itemName: string; quantity: number }>> = [];
      {
        let currentBin: Array<{ itemName: string; quantity: number }> = [];
        let currentBinRemaining = 60;
        for (const item of crateItems) {
          let remaining = item.quantity;
          while (remaining > 0) {
            if (currentBinRemaining === 0) {
              containerBins.push(currentBin);
              currentBin = [];
              currentBinRemaining = 60;
            }
            const take = Math.min(remaining, currentBinRemaining);
            currentBin.push({ itemName: item.itemName, quantity: take });
            currentBinRemaining -= take;
            remaining -= take;
          }
        }
        if (currentBin.length > 0) containerBins.push(currentBin);
      }
      const slots = Array.from({ length: capacity }, (_, index) => {
        // Un véhicule au-delà du premier ne provient pas de la saisie manuelle mais de la mise à
        // l'échelle automatique (quantité > capacité d'un seul véhicule) : on le distingue par une
        // autre couleur (bleu) plutôt que d'afficher un simple conteneur "plein" classique. Ne
        // s'applique pas en mode 'container', qui n'a pas de notion de véhicule/voyage.
        const isUpscaledVehicle = mission.mode !== 'container' && Math.floor(index / perTripCapacity) > 0;
        if (index < directSlots) {
          const item = directSlotItems[index];
          const tooltip = item ? `${item.itemName} (${directKindLabel(item.kind as CargoKind)})` : '';
          const colors = isUpscaledVehicle
            ? 'border-blue-600 bg-blue-950/40 text-blue-300'
            : 'border-cyan-700 bg-cyan-950/50 text-cyan-300';
          return `<span class="grid min-h-10 cursor-help place-items-center rounded border ${colors} px-1 text-center text-[10px]" data-tooltip="${escapeHtml(tooltip)}">Shippable</span>`;
        }
        const containerIndex = index - directSlots;
        if (containerIndex < containerSlots) {
          const isPartial = containerIndex === containerSlots - 1 && partialCrates > 0;
          const quantity = isPartial ? partialCrates : 60;
          const bin = containerBins[containerIndex] ?? [];
          const tooltip = bin.map(entry => `${entry.quantity} ${entry.itemName}`).join('\n');
          const colors = isPartial
            ? 'border-amber-600 bg-amber-950/40 text-amber-300'
            : isUpscaledVehicle
              ? 'border-blue-600 bg-blue-950/40 text-blue-300'
              : 'border-green-700 bg-green-950/40 text-green-300';
          return `<span class="grid min-h-10 cursor-help place-items-center rounded border ${colors} px-1 text-center text-[10px]" data-tooltip="${escapeHtml(tooltip)}">${quantity}/60<br>crates</span>`;
        }
        return '<span class="grid min-h-10 place-items-center rounded border border-gray-700 bg-gray-900/40 px-1 text-center text-[10px] text-gray-600">Empty</span>';
      }).join('');
      const warnings = [
        ...(partialCrates > 0 ? [`<span data-container-warning class="text-amber-400">Incomplete container: ${partialCrates}/60 crates.</span>`] : []),
        ...(tripCount > 1 ? [`<span class="text-blue-400">Scaled up to ${tripCount} vehicles to carry the full quantity.</span>`] : []),
        ...(usedSlots > capacity ? [`<span class="text-red-400">Over capacity by ${usedSlots - capacity} slot${usedSlots - capacity !== 1 ? 's' : ''}.</span>`] : []),
      ].join(' ');

      return `
        <div class="flex items-center justify-between text-xs">
          <span class="text-gray-400">Transport slots</span>
          <span class="${usedSlots > capacity ? 'text-red-400' : tripCount > 1 ? 'text-blue-400' : 'text-gray-300'} tabular-nums">${usedSlots}/${capacity} used · ${containerSlots} container${containerSlots !== 1 ? 's' : ''}${tripCount > 1 ? ` · x${tripCount}` : ''}</span>
        </div>
        <div class="mt-2 grid gap-1.5" style="grid-template-columns:repeat(${Math.min(capacity, 7)},minmax(0,1fr))">${slots}</div>
        ${warnings ? `<div class="mt-2 text-xs">${warnings}</div>` : ''}
      `;
    };
    const modal = document.createElement('div');
    modal.id = 'transport-modal';
    modal.className = 'fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4';
    document.body.appendChild(modal);

    // Tooltip custom (thème sombre, positionné dynamiquement) pour remplacer le tooltip natif du navigateur.
    const tooltip = document.createElement('div');
    tooltip.id = 'transport-slot-tooltip';
    tooltip.className = 'pointer-events-none fixed z-[70] hidden max-w-xs whitespace-pre-line rounded border border-gray-600 bg-gray-950 px-2 py-1.5 text-[11px] leading-snug text-gray-100 shadow-2xl';
    document.body.appendChild(tooltip);
    const hideTooltip = (): void => tooltip.classList.add('hidden');
    const showTooltipFor = (target: HTMLElement): void => {
      const text = target.getAttribute('data-tooltip');
      if (!text) return;
      tooltip.textContent = text;
      tooltip.classList.remove('hidden');
      const anchorRect = target.getBoundingClientRect();
      const tooltipRect = tooltip.getBoundingClientRect();
      let left = anchorRect.left + anchorRect.width / 2 - tooltipRect.width / 2;
      left = Math.min(Math.max(8, left), window.innerWidth - tooltipRect.width - 8);
      let top = anchorRect.top - tooltipRect.height - 8;
      if (top < 8) top = anchorRect.bottom + 8;
      tooltip.style.left = `${left}px`;
      tooltip.style.top = `${top}px`;
    };
    modal.addEventListener('mouseover', event => {
      const target = (event.target as HTMLElement).closest<HTMLElement>('[data-tooltip]');
      if (target) showTooltipFor(target);
    });
    modal.addEventListener('mouseout', event => {
      const target = (event.target as HTMLElement).closest<HTMLElement>('[data-tooltip]');
      const related = event.relatedTarget as Node | null;
      if (target && !(related && target.contains(related))) hideTooltip();
    });

    const close = this.attachEscapeClose(() => {
      tooltip.remove();
      modal.remove();
    });

    const renderModal = (): void => {
      const available = getRemainingCargo();
      // Largest quantity of `targetItem` that fills this single trip to capacity alongside the
      // other rows already filled in.
      const computeMaxQuantityFor = (targetItem: TransportCargoItem): number => {
        const targetKey = cargoKey(targetItem);
        const otherCargo = available
          .filter(other => cargoKey(other) !== targetKey)
          .map(other => ({ ...other, quantity: quantities.get(cargoKey(other)) ?? 0 }))
          .filter(other => other.quantity > 0);
        const otherContainerCrates = otherCargo
          .filter(other => other.kind === 'container-crate')
          .reduce((total, other) => total + other.quantity, 0);
        const otherDirectSlots = otherCargo
          .filter(other => other.kind !== 'container-crate')
          .reduce((total, other) => total + other.quantity, 0);
        const capacity = transportSlotsPerTrip({ mode, tripCount: 1, trainCars, cargo: [] });
        const maxAddable = targetItem.kind === 'container-crate'
          ? Math.max(0, Math.max(0, capacity - otherDirectSlots) * 60 - otherContainerCrates)
          : Math.max(0, capacity - otherDirectSlots - Math.ceil(otherContainerCrates / 60));
        return Math.max(0, Math.min(targetItem.quantity, maxAddable));
      };
      const cargoKindLabel = (kind: CargoKind): string =>
        kind === 'container-crate' ? 'Crates in container' : kind === 'direct-crate' ? 'Crated shippable' : 'Assembled shippable';
      const categoryLabel = (category: CargoKind | IconCategory): string =>
        isCargoKind(category) ? cargoKindLabel(category) : category;
      // Résumé de quantité indépendant de tout véhicule (mode 'container') : nombre de conteneurs de 60 caisses + nombre de shippables.
      const describeContainerLoad = (cargo: TransportCargoItem[]): string => {
        const directQuantity = cargo.filter(item => item.kind !== 'container-crate').reduce((total, item) => total + item.quantity, 0);
        const crateQuantity = cargo.filter(item => item.kind === 'container-crate').reduce((total, item) => total + item.quantity, 0);
        const containerCount = Math.ceil(crateQuantity / 60);
        return `${containerCount} container${containerCount !== 1 ? 's' : ''} · ${directQuantity} shippable${directQuantity !== 1 ? 's' : ''}`;
      };
      const formatPlannedSlots = (planned: TransportMission): string => planned.mode === 'container'
        ? describeContainerLoad(planned.cargo)
        : `${usedTransportSlots(planned)}/${transportSlotsPerTrip(planned) * planned.tripCount} slots${planned.tripCount > 1 ? ` · x${planned.tripCount}` : ''}`;
      const describeLoad = (currentMission: TransportMission): { text: string; className: string } => currentMission.mode === 'container'
        ? { text: `Current load: ${describeContainerLoad(currentMission.cargo)}`, className: 'text-xs text-green-400' }
        : {
          text: `Current load: ${usedTransportSlots(currentMission)}/${transportSlotsPerTrip(currentMission) * Math.max(1, currentMission.tripCount)} slots${currentMission.tripCount > 1 ? ` · x${currentMission.tripCount}` : ''}`,
          className: `text-xs ${!missionFits(currentMission) ? 'text-red-400' : currentMission.tripCount > 1 ? 'text-blue-400' : 'text-green-400'}`,
        };
      const itemMatchesCategory = (item: TransportCargoItem, category: CargoKind | IconCategory | 'all'): boolean => {
        if (category === 'all') return true;
        if (isCargoKind(category)) return item.kind === category;
        return itemCategoryLookup.get(item.itemName.toLowerCase()) === category;
      };
      const renderCargoRow = (item: TransportCargoItem): string => {
        const maxPerTrip = item.quantity;
        return `<tr>
          <td class="wrap-break-word px-1.5 sm:px-3 py-2 text-gray-200">${escapeHtml(item.itemName)}</td>
          <td class="wrap-break-word px-1.5 sm:px-3 py-2 text-gray-500">${cargoKindLabel(item.kind)}</td>
          <td class="px-1.5 sm:px-3 py-2 text-right text-gray-400 tabular-nums">${item.quantity}</td>
          <td class="px-1.5 sm:px-3 py-2 text-right">
            <div class="flex items-center justify-end gap-1">
              <input class="transport-qty w-full min-w-0 bg-gray-900 border border-gray-700 rounded px-1.5 sm:px-2 py-1 text-right text-gray-200" data-cargo-key="${escapeHtml(cargoKey(item))}" type="number" min="0" max="${maxPerTrip}" value="${quantities.get(cargoKey(item)) ?? 0}" />
              <button class="transport-qty-max shrink-0 px-1.5 py-1 text-[10px] font-medium rounded bg-blue-700 hover:bg-blue-600 text-white" data-cargo-key="${escapeHtml(cargoKey(item))}" title="Load the most that still fits in this transport">Max</button>
            </div>
          </td>
        </tr>`;
      };
      const renderCargoRows = (filterText: string, category: CargoKind | IconCategory | 'all'): string => {
        if (available.length === 0) {
          return '<tr><td colspan="4" class="px-3 py-6 text-center text-gray-500">No transportable stock in this backline.</td></tr>';
        }
        const term = filterText.trim().toLowerCase();
        const filtered = available.filter(item =>
          itemMatchesCategory(item, category) && (!term || item.itemName.toLowerCase().includes(term))
        );
        if (filtered.length === 0) {
          const message = term ? `No item matches "${filterText.trim()}".` : `No item in category "${categoryLabel(category as CargoKind | IconCategory)}".`;
          return `<tr><td colspan="4" class="px-3 py-6 text-center text-gray-500 italic">${escapeHtml(message)}</td></tr>`;
        }
        return filtered.map(renderCargoRow).join('');
      };
      const attachCargoRowListeners = (): void => {
        modal.querySelectorAll<HTMLInputElement>('.transport-qty').forEach(input => {
          input.addEventListener('input', () => {
            const key = input.getAttribute('data-cargo-key');
            const maximum = Number(input.max);
            const quantity = Math.min(maximum, Math.max(0, Math.floor(Number(input.value) || 0)));
            if (key) quantities.set(key, quantity);
            updateDraftUi();
          });
        });
        modal.querySelectorAll<HTMLButtonElement>('.transport-qty-max').forEach(button => {
          button.addEventListener('click', () => {
            const key = button.getAttribute('data-cargo-key');
            const item = available.find(candidate => cargoKey(candidate) === key);
            const input = button.previousElementSibling as HTMLInputElement | null;
            if (!key || !item || !input) return;
            const quantity = computeMaxQuantityFor(item);
            quantities.set(key, quantity);
            input.value = String(quantity);
            updateDraftUi();
          });
        });
      };
      const addExclusion = (name: string): void => {
        transportExclusions.add(name);
        exclusionSearch = '';
        saveTransportExclusions();
        quantities = new Map();
        renderModal();
      };
      const removeExclusion = (name: string): void => {
        transportExclusions.delete(name);
        saveTransportExclusions();
        quantities = new Map();
        renderModal();
      };
      const renderExclusionSuggestions = (): string => {
        const suggestions = getExclusionSuggestions(exclusionSearch);
        if (suggestions.length === 0) return '';
        return `<ul class="absolute z-10 mt-1 max-h-40 w-full overflow-y-auto rounded border border-gray-700 bg-gray-900 shadow-lg">
          ${suggestions.map(name => `<li><button type="button" class="transport-exclusion-suggestion block w-full px-2 py-1.5 text-left text-xs text-gray-200 hover:bg-blue-700" data-item-name="${escapeHtml(name)}">${escapeHtml(name)}</button></li>`).join('')}
        </ul>`;
      };
      const renderExclusionChips = (): string => {
        const customExclusions = [...transportExclusions].filter(item => !exclusionOptions.includes(item)).sort((left, right) => left.localeCompare(right));
        return customExclusions.map(name => `
          <span class="flex items-center gap-1 rounded-full border border-gray-700 bg-gray-900 px-2 py-0.5 text-xs text-gray-300">
            ${escapeHtml(name)}
            <button type="button" class="transport-remove-custom-exclusion text-gray-500 hover:text-red-400" data-item-name="${escapeHtml(name)}" aria-label="Remove exclusion">✕</button>
          </span>
        `).join('');
      };
      const attachExclusionListeners = (): void => {
        modal.querySelectorAll<HTMLButtonElement>('.transport-exclusion-suggestion').forEach(button => {
          button.addEventListener('click', () => {
            const name = button.getAttribute('data-item-name');
            if (name) addExclusion(name);
          });
        });
        modal.querySelectorAll<HTMLButtonElement>('.transport-remove-custom-exclusion').forEach(button => {
          button.addEventListener('click', () => {
            const name = button.getAttribute('data-item-name');
            if (name) removeExclusion(name);
          });
        });
      };
      const presentItemCategories = CATEGORIES.filter(category =>
        available.some(item => itemCategoryLookup.get(item.itemName.toLowerCase()) === category)
      );
      const getDraftMission = (): TransportMission => {
        const rawCargo = available
          .map(item => ({ ...item, quantity: quantities.get(cargoKey(item)) ?? 0 }))
          .filter(item => item.quantity > 0);
        const capacity = transportSlotsPerTrip({ mode, tripCount: 1, trainCars, cargo: [] });
        const neededSlots = usedTransportSlots({ mode, tripCount: 1, trainCars, cargo: rawCargo });
        // Le nombre de véhicules se déduit de la quantité saisie : au-delà de la capacité d'un seul
        // trajet, on "scale" automatiquement (facteur x{N}) plutôt que de bloquer sur un dépassement.
        // cargo garde la quantité TOTALE demandée (pas de division) afin que la jauge affiche le
        // remplissage réel (ex. 60 plein + 40 partiel), le facteur xN servant uniquement à couvrir
        // la capacité totale nécessaire (capacité par voyage x nombre de voyages).
        const requiredTrips = neededSlots > 0 ? Math.max(1, Math.ceil(neededSlots / capacity)) : 1;
        return { mode, tripCount: requiredTrips, trainCars, cargo: rawCargo };
      };
      const mission = getDraftMission();
      const selected = mission.cargo;
      const routes = buildRoutesWithDraft(mission);
      const allMissions = routes.flatMap(route => route.missions);
      const fits = allMissions.length > 0 && allMissions.every(missionFits);
      const loadSummary = describeLoad(mission);
      const discordText = allMissions.length > 0 ? renderTransportList({
        date: new Date(),
        notes: globalNotes.split('\n').filter(Boolean),
        routes,
      }) : '';

      modal.innerHTML = `
        <div class="bg-gray-800 border border-gray-700 rounded-lg shadow-2xl flex flex-col w-full max-w-6xl overflow-hidden" style="height:92vh">
          <div class="flex items-center justify-between px-5 py-3 border-b border-gray-700">
            <div>
              <h2 class="font-semibold text-gray-100">Prepare transport</h2>
              <p class="text-xs text-gray-500">Build one or more loads. Enter the total to send; extra vehicles are added automatically.</p>
            </div>
            <button id="transport-close" class="p-1 text-gray-400 hover:text-white" aria-label="Close">✕</button>
          </div>
          <div class="grid grid-cols-1 lg:grid-cols-[minmax(0,1.25fr)_minmax(22rem,0.75fr)] flex-1 min-h-0">
            <div class="flex min-h-0 flex-col border-r border-gray-700">
              <div class="min-h-0 flex-1 overflow-y-auto p-4 pb-2">
              <div class="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
                <label class="text-xs text-gray-400">Source
                  <select id="transport-source" class="mt-1 w-full bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-gray-200">
                    ${depots.map(source => `<option value="${escapeHtml(source.name)}" ${source.name === sourceName ? 'selected' : ''}>${escapeHtml(source.name)} (${source.role})</option>`).join('')}
                  </select>
                </label>
                <label class="text-xs text-gray-400">Destination
                  <select id="transport-destination" class="mt-1 w-full bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-gray-200">
                    ${depots.filter(depot => depot.name !== sourceName).map(depot => `<option value="${escapeHtml(depot.name)}" ${depot.name === destinationName ? 'selected' : ''}>${escapeHtml(depot.name)} (${depot.role})</option>`).join('')}
                  </select>
                </label>
                <label class="text-xs text-gray-400">Hauler
                  <select id="transport-mode" class="mt-1 w-full bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-gray-200">
                    ${(['container', 'flatbed', 'freighter', 'train'] as TransportMode[]).map(value => `<option value="${value}" ${value === mode ? 'selected' : ''}>${modeLabel(value)}</option>`).join('')}
                  </select>
                </label>
                ${mode === 'train' ? `<label class="text-xs text-gray-400">Flatbed cars
                  <input id="transport-train-cars" type="number" min="1" max="14" value="${trainCars}" class="mt-1 w-full bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-gray-200" />
                </label>` : ''}
              </div>

              <details id="transport-exclusions-details" class="mb-4 rounded border border-gray-700 bg-gray-900/30" ${exclusionsPanelOpen ? 'open' : ''}>
                <summary class="cursor-pointer px-3 py-2 text-xs font-medium text-gray-300">
                  Cargo exclusions <span class="ml-1 text-gray-500">${transportExclusions.size} blocked</span>
                </summary>
                <div class="border-t border-gray-700 p-3">
                  <p class="mb-2 text-xs text-gray-500">Excluded items never appear in manual or automatic loads.</p>
                  <div class="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                    ${exclusionOptions.map(itemName => `
                      <label class="flex items-center gap-2 text-gray-300">
                        <input class="transport-exclusion-toggle accent-blue-500" type="checkbox" value="${escapeHtml(itemName)}" ${transportExclusions.has(itemName) ? 'checked' : ''} />
                        <span>${escapeHtml(itemName)}${itemName === 'Basic Materials' ? ' <span class="text-gray-500">(optional)</span>' : ''}</span>
                      </label>
                    `).join('')}
                  </div>
                  <div class="relative mt-3">
                    <label class="block text-xs text-gray-400" for="transport-exclusion-search">Add another exclusion</label>
                    <input id="transport-exclusion-search" type="text" autocomplete="off" value="${escapeHtml(exclusionSearch)}" placeholder="Search an item..."
                      class="mt-1 w-full rounded border border-gray-700 bg-gray-950 px-2 py-1.5 text-gray-200 focus:outline-none focus:border-blue-500" />
                    <div id="transport-exclusion-suggestions">${renderExclusionSuggestions()}</div>
                  </div>
                  <div id="transport-exclusion-chips" class="mt-2 flex flex-wrap gap-1.5">${renderExclusionChips()}</div>
                  <button id="transport-reset-exclusions" class="mt-2 text-xs text-blue-400 hover:text-blue-300">Reset defaults</button>
                </div>
              </details>

              <div class="flex items-center justify-between mb-2">
                <h3 class="text-sm font-medium text-gray-200">Planned loads</h3>
                <div class="flex items-center gap-2">
                  ${preAutoFillSnapshot ? `<button id="transport-undo-auto-fill" class="px-2 py-1 text-xs bg-gray-700 hover:bg-gray-600 text-white rounded">Undo automatic plan</button>` : ''}
                  <button id="transport-auto-fill" class="px-2 py-1 text-xs bg-blue-700 hover:bg-blue-600 text-white rounded">Plan this route automatically</button>
                </div>
              </div>
              ${plannedRoutes.length > 0 ? `
                <div class="mb-4 space-y-1">
                  ${(() => {
                    let lineIndex = 0;
                    return plannedRoutes.map((route, routeIndex) => route.missions.map((planned, missionIndex) => {
                      const letter = String.fromCharCode(65 + ((lineIndex++) % 26));
                      return `
                        <div class="flex items-center gap-2 rounded border border-gray-700 bg-gray-900/50 px-3 py-2 text-xs">
                          <span class="font-semibold text-blue-300">${letter}</span>
                          <span class="text-gray-400">${escapeHtml(route.source)} → ${escapeHtml(route.destination)}</span>
                          <span class="text-gray-300">${planned.mode === 'train' ? `Train (${planned.trainCars} cars)` : modeLabel(planned.mode)}</span>
                          <span class="${planned.tripCount > 1 ? 'text-blue-400' : 'text-gray-500'}">${formatPlannedSlots(planned)}</span>
                          <span class="ml-auto text-gray-500">${planned.cargo.length} cargo type${planned.cargo.length !== 1 ? 's' : ''}</span>
                          <button class="transport-remove-line p-1 text-gray-500 hover:text-red-400" data-route-index="${routeIndex}" data-mission-index="${missionIndex}" aria-label="Remove transport line">✕</button>
                        </div>
                      `;
                    }).join('')).join('');
                  })()}
                </div>
              ` : ''}

              <div class="flex flex-wrap items-center justify-between gap-2 mb-2">
                <h3 class="text-sm font-medium text-gray-200 whitespace-nowrap">Load for this transport</h3>
                <select id="transport-category-filter" class="bg-gray-900 border border-gray-700 rounded px-2 py-1 text-xs text-gray-200 focus:outline-none focus:border-blue-500">
                  <option value="all" ${categoryFilter === 'all' ? 'selected' : ''}>All categories</option>
                  <optgroup label="Storage type">
                    <option value="container-crate" ${categoryFilter === 'container-crate' ? 'selected' : ''}>${cargoKindLabel('container-crate')}</option>
                    <option value="direct-crate" ${categoryFilter === 'direct-crate' ? 'selected' : ''}>${cargoKindLabel('direct-crate')}</option>
                    <option value="assembled" ${categoryFilter === 'assembled' ? 'selected' : ''}>${cargoKindLabel('assembled')}</option>
                  </optgroup>
                  ${presentItemCategories.length > 0 ? `<optgroup label="Item type">
                    ${presentItemCategories.map(category => `<option value="${escapeHtml(category)}" ${categoryFilter === category ? 'selected' : ''}>${escapeHtml(category)}</option>`).join('')}
                  </optgroup>` : ''}
                </select>
                <input id="transport-item-search" type="text" value="${escapeHtml(itemSearch)}" placeholder="Search item..."
                  class="flex-1 min-w-32 bg-gray-900 border border-gray-700 rounded px-2 py-1 text-xs text-gray-200 focus:outline-none focus:border-blue-500" />
                <button id="transport-add-line" ${!missionFits(mission) || selected.length === 0 ? 'disabled' : ''}
                  class="px-2 py-1 text-xs rounded ${missionFits(mission) && selected.length > 0 ? 'bg-emerald-700 hover:bg-emerald-600 text-white' : 'bg-gray-700 text-gray-500 cursor-not-allowed'}">Add this load</button>
              </div>
              <div class="border border-gray-700 rounded overflow-hidden">
                <table class="w-full table-fixed text-xs">
                  <thead class="bg-gray-900 text-gray-500"><tr><th class="w-[28%] text-left px-1.5 sm:px-3 py-2">Item</th><th class="w-[32%] text-left px-1.5 sm:px-3 py-2">Storage</th><th class="w-[18%] text-right px-1.5 sm:px-3 py-2">Remaining</th><th class="w-[22%] text-right px-1.5 sm:px-3 py-2">Load</th></tr></thead>
                  <tbody id="transport-cargo-rows" class="divide-y divide-gray-700/60">
                    ${renderCargoRows(itemSearch, categoryFilter)}
                  </tbody>
                </table>
              </div>
              </div>
              <div id="transport-load-meter" class="shrink-0 border-t border-gray-700 bg-gray-900/70 p-3">
                ${renderLoadMeter(mission)}
              </div>
            </div>

            <div class="p-4 flex flex-col min-h-0 bg-gray-900/40">
              <div class="flex items-center justify-between mb-3">
                <span class="text-sm font-medium text-gray-200">11eForge preview</span>
                <span id="transport-current-capacity" class="${loadSummary.className}">${loadSummary.text}</span>
              </div>
              <label class="text-xs text-gray-500 mb-2">Global notes
                <textarea id="transport-global-notes" rows="2" class="mt-1 w-full bg-gray-900 border border-gray-700 rounded p-2 text-gray-300 resize-none" placeholder=":exclamation: ...">${escapeHtml(globalNotes)}</textarea>
              </label>
              <label class="text-xs text-gray-500 mb-3">Route notes
                <textarea id="transport-route-notes" rows="2" class="mt-1 w-full bg-gray-900 border border-gray-700 rounded p-2 text-gray-300 resize-none" placeholder="*Instruction...*">${escapeHtml(routeNotes.get(routeKey(sourceName, destinationName)) ?? '')}</textarea>
              </label>
              <textarea id="transport-preview" readonly class="flex-1 min-h-56 bg-gray-950 border border-gray-700 rounded p-3 text-xs font-mono text-gray-300 resize-none">${escapeHtml(discordText)}</textarea>
              <div class="mt-3 flex items-center justify-between gap-3">
                <span id="transport-summary" class="text-xs text-gray-500">${allMissions.reduce((total, item) => total + item.cargo.reduce((cargoTotal, cargo) => cargoTotal + cargo.quantity, 0), 0)} units planned across ${allMissions.reduce((total, item) => total + item.tripCount, 0)} action${allMissions.reduce((total, item) => total + item.tripCount, 0) !== 1 ? 's' : ''}</span>
                <button id="transport-copy" ${!fits ? 'disabled' : ''} class="px-3 py-1.5 rounded text-xs font-medium ${fits ? 'bg-emerald-700 hover:bg-emerald-600 text-white' : 'bg-gray-700 text-gray-500 cursor-not-allowed'}">Copy list</button>
              </div>
            </div>
          </div>
        </div>
      `;

      const updateDraftUi = (): void => {
        const currentMission = getDraftMission();
        const currentRoutes = buildRoutesWithDraft(currentMission);
        const currentMissions = currentRoutes.flatMap(route => route.missions);
        const currentFits = currentMissions.length > 0 && currentMissions.every(missionFits);
        const currentLoadSummary = describeLoad(currentMission);
        const currentDiscordText = currentMissions.length > 0 ? renderTransportList({
          date: new Date(),
          notes: globalNotes.split('\n').filter(Boolean),
          routes: currentRoutes,
        }) : '';
        const actions = currentMissions.reduce((total, item) => total + item.tripCount, 0);
        const units = currentMissions.reduce((total, item) => total + item.cargo.reduce((cargoTotal, cargo) => cargoTotal + cargo.quantity, 0), 0);
        const loadFits = missionFits(currentMission) && currentMission.cargo.length > 0;
        const addButton = modal.querySelector<HTMLButtonElement>('#transport-add-line');
        const copyButton = modal.querySelector<HTMLButtonElement>('#transport-copy');
        const capacityLabel = modal.querySelector<HTMLElement>('#transport-current-capacity');
        const meter = modal.querySelector<HTMLElement>('#transport-load-meter');
        const preview = modal.querySelector<HTMLTextAreaElement>('#transport-preview');
        const summary = modal.querySelector<HTMLElement>('#transport-summary');
        if (meter) meter.innerHTML = renderLoadMeter(currentMission);
        if (capacityLabel) {
          capacityLabel.textContent = currentLoadSummary.text;
          capacityLabel.className = currentLoadSummary.className;
        }
        if (addButton) {
          addButton.disabled = !loadFits;
          addButton.className = `px-2 py-1 text-xs rounded ${loadFits ? 'bg-emerald-700 hover:bg-emerald-600 text-white' : 'bg-gray-700 text-gray-500 cursor-not-allowed'}`;
        }
        if (preview) preview.value = currentDiscordText;
        if (summary) summary.textContent = `${units} units planned across ${actions} action${actions !== 1 ? 's' : ''}`;
        if (copyButton) {
          copyButton.disabled = !currentFits;
          copyButton.className = `px-3 py-1.5 rounded text-xs font-medium ${currentFits ? 'bg-emerald-700 hover:bg-emerald-600 text-white' : 'bg-gray-700 text-gray-500 cursor-not-allowed'}`;
        }
      };

      modal.querySelector('#transport-close')?.addEventListener('click', () => close());
      modal.querySelector('#transport-source')?.addEventListener('change', event => {
        sourceName = (event.target as HTMLSelectElement).value;
        if (destinationName === sourceName) {
          destinationName = depots.find(depot => depot.name !== sourceName)!.name;
        }
        quantities = new Map();
        renderModal();
      });
      modal.querySelector('#transport-destination')?.addEventListener('change', event => {
        destinationName = (event.target as HTMLSelectElement).value;
        quantities = new Map();
        renderModal();
      });
      modal.querySelectorAll<HTMLInputElement>('.transport-exclusion-toggle').forEach(input => {
        input.addEventListener('change', () => {
          if (input.checked) transportExclusions.add(input.value);
          else transportExclusions.delete(input.value);
          saveTransportExclusions();
          quantities = new Map();
          renderModal();
        });
      });
      modal.querySelector('#transport-reset-exclusions')?.addEventListener('click', () => {
        transportExclusions = new Set(DEFAULT_TRANSPORT_EXCLUSIONS);
        saveTransportExclusions();
        quantities = new Map();
        renderModal();
      });
      modal.querySelector('#transport-mode')?.addEventListener('change', event => {
        mode = (event.target as HTMLSelectElement).value as TransportMode;
        quantities = new Map();
        renderModal();
      });
      modal.querySelector('#transport-train-cars')?.addEventListener('change', event => {
        trainCars = Math.min(14, Math.max(1, Math.floor(Number((event.target as HTMLInputElement).value) || 1)));
        quantities = new Map();
        renderModal();
      });
      modal.querySelector('#transport-auto-fill')?.addEventListener('click', () => {
        preAutoFillSnapshot = plannedRoutes.map(route => ({ ...route, missions: route.missions.map(m => ({ ...m, cargo: [...m.cargo] })) }));
        plannedRoutes = plannedRoutes.filter(route => route.source !== sourceName || route.destination !== destinationName);
        const missions = suggestTransportMissions(getRemainingCargo(), mode, trainCars);
        if (missions.length > 0) {
          plannedRoutes.push({ source: sourceName, destination: destinationName, missions });
        }
        quantities = new Map();
        renderModal();
      });
      modal.querySelector('#transport-undo-auto-fill')?.addEventListener('click', () => {
        if (!preAutoFillSnapshot) return;
        plannedRoutes = preAutoFillSnapshot;
        preAutoFillSnapshot = null;
        quantities = new Map();
        renderModal();
      });
      modal.querySelector('#transport-add-line')?.addEventListener('click', () => {
        const currentMission = getDraftMission();
        if (currentMission.cargo.length === 0 || !missionFits(currentMission)) return;
        addMissionToCurrentRoute(currentMission);
        preAutoFillSnapshot = null;
        quantities = new Map();
        renderModal();
      });
      modal.querySelectorAll<HTMLButtonElement>('.transport-remove-line').forEach(button => {
        button.addEventListener('click', () => {
          const routeIndex = Number(button.getAttribute('data-route-index'));
          const missionIndex = Number(button.getAttribute('data-mission-index'));
          if (Number.isInteger(routeIndex) && Number.isInteger(missionIndex)) {
            plannedRoutes[routeIndex]?.missions.splice(missionIndex, 1);
            plannedRoutes = plannedRoutes.filter(route => route.missions.length > 0);
          }
          preAutoFillSnapshot = null;
          renderModal();
        });
      });
      attachCargoRowListeners();
      attachExclusionListeners();
      modal.querySelector<HTMLDetailsElement>('#transport-exclusions-details')?.addEventListener('toggle', event => {
        exclusionsPanelOpen = (event.target as HTMLDetailsElement).open;
      });
      modal.querySelector<HTMLInputElement>('#transport-exclusion-search')?.addEventListener('input', event => {
        exclusionSearch = (event.target as HTMLInputElement).value;
        const suggestionsBox = modal.querySelector<HTMLDivElement>('#transport-exclusion-suggestions');
        if (suggestionsBox) suggestionsBox.innerHTML = renderExclusionSuggestions();
        attachExclusionListeners();
      });
      modal.querySelector<HTMLInputElement>('#transport-item-search')?.addEventListener('input', event => {
        itemSearch = (event.target as HTMLInputElement).value;
        const tbody = modal.querySelector<HTMLTableSectionElement>('#transport-cargo-rows');
        if (tbody) tbody.innerHTML = renderCargoRows(itemSearch, categoryFilter);
        attachCargoRowListeners();
      });
      modal.querySelector<HTMLSelectElement>('#transport-category-filter')?.addEventListener('change', event => {
        categoryFilter = (event.target as HTMLSelectElement).value as CargoKind | IconCategory | 'all';
        const tbody = modal.querySelector<HTMLTableSectionElement>('#transport-cargo-rows');
        if (tbody) tbody.innerHTML = renderCargoRows(itemSearch, categoryFilter);
        attachCargoRowListeners();
      });
      modal.querySelector('#transport-global-notes')?.addEventListener('change', event => {
        globalNotes = (event.target as HTMLTextAreaElement).value;
        renderModal();
      });
      modal.querySelector('#transport-route-notes')?.addEventListener('change', event => {
        routeNotes.set(routeKey(sourceName, destinationName), (event.target as HTMLTextAreaElement).value);
        renderModal();
      });
      modal.querySelector('#transport-copy')?.addEventListener('click', async () => {
        await navigator.clipboard.writeText((modal.querySelector('#transport-preview') as HTMLTextAreaElement).value);
        const button = modal.querySelector('#transport-copy') as HTMLButtonElement | null;
        if (button) button.textContent = 'Copied!';
      });
    };

    modal.addEventListener('click', event => { if (event.target === modal) close(); });
    renderModal();
  }

  private attachEvents(): void {
    if (!this.container) return;

    this.container.querySelectorAll('[data-stock-view]').forEach(button => {
      button.addEventListener('click', () => {
        this.stockViewMode = button.getAttribute('data-stock-view') === 'depots' ? 'depots' : 'global';
        this.render();
      });
    });

    this.container.querySelector('#btn-prepare-transport')?.addEventListener('click', () => {
      this.showTransportModal();
    });

    this.container.querySelectorAll<HTMLInputElement>('.depot-group-name-input').forEach(input => {
      input.addEventListener('change', () => {
        const oldName = input.getAttribute('data-old-depot-name');
        if (oldName) this.handleDepotGroupNameChange(oldName, input.value);
      });
    });

    this.container.querySelectorAll<HTMLSelectElement>('.depot-role-select').forEach(select => {
      select.addEventListener('change', async () => {
        const depotName = select.getAttribute('data-depot-name');
        if (!depotName) return;
        const previousRole = this.csvEntries.find(entry => entry.depotName === depotName)?.role;
        const applied = await this.handleDepotRoleChange(depotName, select.value as DepotRole);
        if (!applied && previousRole) select.value = previousRole;
      });
    });

    // Depot role card tabs — switch which depot is shown, no full data recompute needed
    this.container.querySelectorAll<HTMLButtonElement>('.depot-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const role = btn.getAttribute('data-role') as DepotRole | null;
        const index = Number(btn.getAttribute('data-index'));
        if (role && !Number.isNaN(index)) {
          this.activeDepotTab[role] = index;
          this.render();
        }
      });
    });

    // Remove individual stockpile entry chips
    this.container.querySelectorAll('.remove-entry-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = btn.getAttribute('data-entry-id');
        if (!id) return;
        const label = btn.getAttribute('data-entry-label') ?? 'this snapshot';
        const confirmed = await confirmDialog(`Remove snapshot "${label}"?`, { confirmLabel: 'Remove', variant: 'danger' });
        if (confirmed) this.handleRemoveEntry(id);
      });
    });

    // Status filter buttons
    this.container.querySelectorAll('.filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.filterStatus = (btn.getAttribute('data-filter') as FilterStatus) ?? 'all';
        this.render();
      });
    });

    // Generate Todolist modal
    this.container.querySelector('#btn-generate-todolist')?.addEventListener('click', () => {
      this.showTodolistModal();
    });

    // Sort by gap toggle
    this.container.querySelector('#btn-sort-gap')?.addEventListener('click', () => {
      this.sortByGap = !this.sortByGap;
      this.render();
    });

    // Hide OK toggle
    this.container.querySelector('#btn-hide-ok')?.addEventListener('click', () => {
      this.hideOk = !this.hideOk;
      this.render();
    });

    // Search input
    this.container.querySelector('#search-items')?.addEventListener('input', (e) => {
      this.searchQuery = (e.target as HTMLInputElement).value;
      this.render();
      const input = this.container?.querySelector<HTMLInputElement>('#search-items');
      if (input) {
        input.focus();
        input.setSelectionRange(input.value.length, input.value.length);
      }
    });

    // Section collapse toggles — no full re-render, just toggle class + arrow in place
    this.container.querySelectorAll('.section-toggle').forEach(btn => {
      btn.addEventListener('click', () => {
        const key = btn.getAttribute('data-section-key');
        if (!key) return;
        if (this.collapsedSections.has(key)) {
          this.collapsedSections.delete(key);
        } else {
          this.collapsedSections.add(key);
        }
        this.saveCollapsedSections();
        const wrapper = btn.nextElementSibling as HTMLElement | null;
        const arrow   = btn.querySelector('svg') as SVGElement | null;
        if (wrapper) wrapper.classList.toggle('hidden');
        if (arrow)   arrow.classList.toggle('rotate-90');
      });
    });

  }
}
