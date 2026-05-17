import { store } from '../store';
import { Template, Section, SectionIcon, MpfDataEntry, TodoListItem, TodoList, MpfCategory, generateId } from '../types';
import { getBaseUrl } from '../config';
import { renderTodoList } from '../services/todoListExporter';

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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!)
  );
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
export function parseCSV(text: string): { header: StockpileHeader | null; items: Map<string, number> } {
  const lines = text.split(/\r?\n/);
  const items = new Map<string, number>();
  let header: StockpileHeader | null = null;
  let firstDataLine = true;

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
    const normalizedName = name
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/[\u201C\u201D]/g, '"');
    items.set(normalizedName, qty);
  }

  return { header, items };
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
        const csvKey = isCrateTarget ? `${itemName} (Crate)` : itemName;
        stockpileQty = csvItems.get(csvKey) ?? 0;
        matchedCsvKeys.add(csvKey);
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

const CSV_ITEMS_KEY    = 'stockpile_csv_items';
const CSV_HEADER_KEY   = 'stockpile_csv_header';
const CSV_FILENAME_KEY = 'stockpile_csv_filename';
const TPL_FILE_KEY     = 'stockpile_tpl_file';
const TPL_FILENAME_KEY = 'stockpile_tpl_filename';

export class StockpileView {
  private container: HTMLElement | null = null;
  private iconMapping: Record<string, string> = {};
  private mappingLoaded = false;

  // CSV state
  private csvItems: Map<string, number> = new Map();
  private csvHeader: StockpileHeader | null = null;
  private csvFileName: string | null = null;
  private result: ComparisonResult | null = null;

  // UI state
  private filterStatus: FilterStatus = 'all';
  private externalTemplate: Template | null = null;
  private useReferenceTemplate = true;
  private externalTemplateFileName: string | null = null;
  private collapsedSections: Set<string> = new Set();
  private sortByGap = true;
  private hideOk = true;
  private searchQuery = '';

  // Bound window listeners (for cleanup)
  private onLoadCsv     = (e: Event) => { this.handleLoadCsv((e as CustomEvent).detail.file as File); };
  private onClearCsv    = () => { this.handleClearCsv(); };
  private onSetTplCurrent  = () => { this.handleSetTplCurrent(); };
  private onSetTplOfficial = () => { this.handleSetTplOfficial(); };
  private onLoadTpl     = (e: Event) => { this.handleLoadTpl((e as CustomEvent).detail.file as File); };

  mount(container: HTMLElement): void {
    this.container = container;
    window.addEventListener('stockpile:load-csv',      this.onLoadCsv);
    window.addEventListener('stockpile:clear-csv',     this.onClearCsv);
    window.addEventListener('stockpile:set-tpl-current',  this.onSetTplCurrent);
    window.addEventListener('stockpile:set-tpl-official', this.onSetTplOfficial);
    window.addEventListener('stockpile:load-tpl',      this.onLoadTpl);
    this.renderLoading();
    this.loadMapping().then(async () => {
      this.loadCollapsedSections();
      const savedSource = localStorage.getItem('stockpile_tpl_source') ?? 'official';
      if (savedSource === 'official') {
        try {
          const baseUrl = getBaseUrl();
          const res = await fetch(`${baseUrl}referenceTemplate.json`);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          this.externalTemplate = await res.json() as Template;
          this.useReferenceTemplate = true;
        } catch (e) {
          console.warn('StockpileView: failed to load reference template', e);
          this.useReferenceTemplate = false;
        }
      } else if (savedSource === 'file') {
        this.restoreExternalTemplate();
        this.useReferenceTemplate = false;
      } else {
        this.useReferenceTemplate = false;
      }
      // Sync store so Toolbar reflects the restored state
      store.setStockpileTplSource(
        this.useReferenceTemplate ? 'official' : this.externalTemplate ? 'file' : 'current',
        this.externalTemplateFileName
      );
      this.restoreCSV();
      this.render();
    });
  }

  unmount(): void {
    window.removeEventListener('stockpile:load-csv',      this.onLoadCsv);
    window.removeEventListener('stockpile:clear-csv',     this.onClearCsv);
    window.removeEventListener('stockpile:set-tpl-current',  this.onSetTplCurrent);
    window.removeEventListener('stockpile:set-tpl-official', this.onSetTplOfficial);
    window.removeEventListener('stockpile:load-tpl',      this.onLoadTpl);
    this.container = null;
    this.result = null;
    this.csvItems = new Map();
    this.csvFileName = null;
    this.filterStatus = 'all';
    this.externalTemplate = null;
    this.useReferenceTemplate = false;
    this.collapsedSections = new Set();
    this.searchQuery = '';
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
      const obj: Record<string, number> = {};
      this.csvItems.forEach((qty, name) => { obj[name] = qty; });
      localStorage.setItem(CSV_ITEMS_KEY, JSON.stringify(obj));
      localStorage.setItem(CSV_HEADER_KEY, JSON.stringify(this.csvHeader));
      if (this.csvFileName) {
        localStorage.setItem(CSV_FILENAME_KEY, this.csvFileName);
      } else {
        localStorage.removeItem(CSV_FILENAME_KEY);
      }
    } catch (e) {
      console.warn('StockpileView: failed to persist CSV data', e);
    }
  }

  private restoreCSV(): void {
    try {
      const rawItems  = localStorage.getItem(CSV_ITEMS_KEY);
      const rawHeader = localStorage.getItem(CSV_HEADER_KEY);
      if (!rawItems) return;
      const obj = JSON.parse(rawItems) as Record<string, number>;
      this.csvItems = new Map(Object.entries(obj));
      this.csvHeader = rawHeader ? JSON.parse(rawHeader) as StockpileHeader : null;
      this.csvFileName = localStorage.getItem(CSV_FILENAME_KEY);
      this.result = buildComparison(this.getSections(), this.csvItems, this.iconMapping, this.csvHeader);
    } catch (e) {
      console.warn('StockpileView: failed to restore CSV data', e);
    }
  }

  private getSections(): Section[] {
    return this.externalTemplate?.sections ?? store.sections;
  }

  private rerunComparison(): void {
    if (this.csvItems.size === 0) return;
    this.result = buildComparison(this.getSections(), this.csvItems, this.iconMapping, this.csvHeader);
  }

  private async handleLoadCsv(file: File): Promise<void> {
    const buffer = await file.arrayBuffer();
    const text = decodeBuffer(buffer);
    const { header, items } = parseCSV(text);
    this.csvItems = items;
    this.csvHeader = header;
    this.csvFileName = file.name;
    this.result = buildComparison(this.getSections(), items, this.iconMapping, header);
    this.saveCSV();
    this.filterStatus = 'all';
    this.render();
  }

  private handleClearCsv(): void {
    this.csvItems = new Map();
    this.csvHeader = null;
    this.csvFileName = null;
    this.result = null;
    localStorage.removeItem(CSV_ITEMS_KEY);
    localStorage.removeItem(CSV_HEADER_KEY);
    localStorage.removeItem(CSV_FILENAME_KEY);
    this.render();
  }

  private handleSetTplCurrent(): void {
    if (this.externalTemplate === null && !this.useReferenceTemplate) return;
    this.externalTemplate = null;
    this.externalTemplateFileName = null;
    this.useReferenceTemplate = false;
    localStorage.setItem('stockpile_tpl_source', 'current');
    localStorage.removeItem(TPL_FILE_KEY);
    localStorage.removeItem(TPL_FILENAME_KEY);
    store.setStockpileTplSource('current');
    this.rerunComparison();
    this.render();
  }

  private async handleSetTplOfficial(): Promise<void> {
    if (this.useReferenceTemplate) return;
    try {
      const baseUrl = getBaseUrl();
      const res = await fetch(`${baseUrl}referenceTemplate.json`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      this.externalTemplate = await res.json() as Template;
      this.externalTemplateFileName = null;
      this.useReferenceTemplate = true;
      localStorage.setItem('stockpile_tpl_source', 'official');
      localStorage.removeItem(TPL_FILE_KEY);
      localStorage.removeItem(TPL_FILENAME_KEY);
      store.setStockpileTplSource('official');
      this.rerunComparison();
      this.render();
    } catch (e) {
      console.error('Failed to load reference template:', e);
      alert('Could not load the official reference template.');
    }
  }

  private async handleLoadTpl(file: File): Promise<void> {
    try {
      const text = await file.text();
      this.externalTemplate = JSON.parse(text) as Template;
      this.externalTemplateFileName = file.name;
      this.useReferenceTemplate = false;
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

          ${this.csvHeader ? `
          <!-- CSV timestamp -->
          <div class="flex items-center gap-1.5 text-xs text-gray-400">
            <svg class="w-3 h-3 shrink-0 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/>
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/>
            </svg>
            <span class="text-gray-300 font-medium">${escapeHtml(this.csvHeader.location)}</span>
            <span class="text-gray-500">·</span>
            <span class="text-gray-500">${escapeHtml(this.csvHeader.date)}</span>
          </div>
          ` : ''}

          ${hasResult ? `
          <!-- Filter -->
          <div class="flex items-center gap-1 border-l border-gray-600 pl-3">
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
          ` : ''}
        </div>

        <!-- Content -->
        <div class="flex-1 overflow-y-auto p-4">
          <!-- Disclaimer -->
          <div class="mb-4 flex items-start gap-2 px-3 py-2 bg-gray-800/60 border border-gray-700 rounded-lg text-xs text-gray-400">
            <svg class="w-3.5 h-3.5 mt-0.5 shrink-0 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
            </svg>
            <p>This comparison is for <span class="text-gray-300 font-semibold">informational purposes only</span>. It provides a snapshot diff between a template and an exported stockpile — not a live tracking system. Quantities may be outdated the moment the CSV is exported.</p>
          </div>
          ${!hasResult ? this.renderEmpty() : this.renderTable()}
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
      <div class="flex items-center gap-1.5">
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
          Upload or drag & drop a Foxhole stockpile CSV export to compare against the current template.
        </p>
      </div>
    `;
  }

  private renderTable(): string {
    if (!this.result) return '';

    // Group rows by section title (preserving order)
    const sectionOrder: string[] = [];
    const bySection = new Map<string, StockpileRow[]>();
    for (const row of this.result.rows) {
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
              <table class="w-full table-fixed text-sm">
                <thead>
                  <tr class="bg-gray-800 text-gray-400 text-xs">
                    <th class="text-left px-2 py-2 font-medium w-56">Item</th>
                    <th class="text-right px-2 py-2 font-medium w-20">Target</th>
                    <th class="text-right px-2 py-2 font-medium w-20">Stockpile</th>
                    <th class="text-right px-2 py-2 font-medium w-20">Gap</th>
                    <th class="text-center px-2 py-2 font-medium w-24">Status</th>
                    <th class="w-px p-0 border-l-2 border-gray-600"></th>
                    <th class="text-left px-2 py-2 font-medium w-56">Item</th>
                    <th class="text-right px-2 py-2 font-medium w-20">Target</th>
                    <th class="text-right px-2 py-2 font-medium w-20">Stockpile</th>
                    <th class="text-right px-2 py-2 font-medium w-20">Gap</th>
                    <th class="text-center px-2 py-2 font-medium w-24">Status</th>
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
                        ${this.renderRowCells(left)}
                        <td class="w-px p-0 border-l-2 border-gray-600"></td>
                        ${right ? this.renderRowCells(right) : this.renderEmptyCells()}
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

  private renderRowCells(row: StockpileRow): string {
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
      <td class="px-2 py-1.5 text-right font-mono text-sm ${cellClass}">${stockpileDisplay}</td>
      <td class="px-2 py-1.5 text-right font-mono text-sm ${cellClass}">${gapDisplay}</td>
      <td class="px-2 py-1.5 text-center">${statusBadge}</td>
    `;
  }

  private renderEmptyCells(): string {
    return '<td></td><td></td><td></td><td></td><td></td>';
  }

  // ─── Events ───────────────────────────────────────────────────────────────

  // ─── Shortage / Todolist generation ─────────────────────────────────────────

  private buildShortageData(): {
    mpfRows: Array<{ row: StockpileRow; entry: MpfDataEntry; cratesNeeded: number; orderCount: number }>;
    nonMpfRows: StockpileRow[];
  } {
    if (!this.result) return { mpfRows: [], nonMpfRows: [] };

    const missingRows = this.result.rows.filter(r =>
      r.itemName !== null &&
      (r.status === 'missing' || r.status === 'partial') &&
      r.targetQty !== -1
    );

    const mpfRows: Array<{ row: StockpileRow; entry: MpfDataEntry; cratesNeeded: number; orderCount: number }> = [];
    const nonMpfRows: StockpileRow[] = [];

    for (const row of missingRows) {
      const filename = iconPathToMappingKey(row.iconPath);
      const entry = store.mpfData.find(e => e.iconFilename === filename);
      const gap = Math.abs(row.stockpileQty - row.targetQty);

      if (entry) {
        // gap is always in crates for MPF-craftable items (Foxhole stores non-vehicles as crates)
        const cratesNeeded = gap;
        const orderCount = Math.ceil(cratesNeeded / (entry.maxCrates || 1));
        mpfRows.push({ row, entry, cratesNeeded, orderCount });
      } else {
        nonMpfRows.push(row);
      }
    }

    return { mpfRows, nonMpfRows };
  }

  private generateDiscordText(mpfRows: Array<{ row: StockpileRow; entry: MpfDataEntry; cratesNeeded: number; orderCount: number }>): string {
    if (mpfRows.length === 0) return '*(nothing to order)*';

    const now = new Date();
    const title = this.csvHeader
      ? `TODOLIST ${this.csvHeader.location}`
      : 'TODOLIST';

    const items: TodoListItem[] = mpfRows.map(({ row, entry, orderCount }) => ({
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

  private showTodolistModal(): void {
    if (!this.container) return;
    const { mpfRows, nonMpfRows } = this.buildShortageData();
    const discordText = this.generateDiscordText(mpfRows);

    const modal = document.createElement('div');
    modal.id = 'shortage-modal';
    modal.className = 'fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4';
    modal.innerHTML = `
      <div class="bg-gray-800 rounded-xl shadow-2xl flex flex-col w-full max-w-4xl" style="max-height: 85vh;">

        <!-- Header -->
        <div class="flex items-center justify-between px-5 py-3.5 border-b border-gray-700 shrink-0">
          <div>
            <h2 class="font-semibold text-base">Generate Todolist</h2>
              <p class="text-xs text-gray-500 mt-0.5">${mpfRows.length} craftable item${mpfRows.length !== 1 ? 's' : ''} · ${nonMpfRows.length} non-MPF</p>
          </div>
          <button id="close-shortage-modal" class="text-gray-400 hover:text-gray-200 transition-colors p-1 rounded hover:bg-gray-700">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>

        <!-- Body -->
        <div class="flex flex-1 overflow-hidden">

          <!-- Left: Discord text -->
          <div class="flex-1 flex flex-col p-4 border-r border-gray-700 overflow-hidden">
            <div class="flex items-center justify-between mb-2 shrink-0">
              <h3 class="text-sm font-medium text-gray-300">Discord format</h3>
              <button id="copy-discord-text"
                class="flex items-center gap-1.5 px-2.5 py-1 bg-gray-700 hover:bg-gray-600 rounded text-xs transition-colors">
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                    d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/>
                </svg>
                Copy
              </button>
            </div>
            <textarea id="discord-textarea" readonly
              class="flex-1 bg-gray-900 rounded border border-gray-700 p-3 text-xs text-gray-300 font-mono resize-none focus:outline-none focus:border-blue-500 leading-relaxed"
            >${escapeHtml(discordText)}</textarea>
          </div>

          <!-- Right: non-MPF items -->
          <div class="w-72 shrink-0 flex flex-col p-4 overflow-hidden">
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
    `;

    document.body.appendChild(modal);

    // Close
    modal.querySelector('#close-shortage-modal')?.addEventListener('click', () => modal.remove());
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });

    // Copy
    modal.querySelector('#copy-discord-text')?.addEventListener('click', async () => {
      const btn = modal.querySelector('#copy-discord-text') as HTMLButtonElement;
      await navigator.clipboard.writeText(discordText);
      btn.textContent = '✓ Copied!';
      setTimeout(() => {
        btn.innerHTML = `<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg> Copy`;
      }, 2000);
    });
  }

  private attachEvents(): void {
    if (!this.container) return;

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

    // Drag-and-drop CSV upload
    this.container.addEventListener('dragover', (e) => {
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    });
    this.container.addEventListener('drop', (e) => {
      e.preventDefault();
      const file = e.dataTransfer?.files[0];
      if (file) this.handleLoadCsv(file);
    });
  }
}
