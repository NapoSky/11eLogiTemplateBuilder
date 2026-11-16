import { store } from '../store';
import { TodoListItem, TODO_CATEGORIES, TODO_CATEGORY_LABELS, TodoCategory, TextBlock, TextAnchor, ProductionSource, ProductionWorkspace } from '../types';
import { categoryLabel, displayedCost, orderCrateCount, productionSource } from '../services/mpfCalculator';
import { renderTodoList } from '../services/todoListExporter';
import { getBaseUrl } from '../config';
import { showToast } from '../services/toast';
import { iconAssetUrl } from '../services/iconPaths';
import { MATERIALS, MATERIAL_KEYS, loadingSummary, producedCrates, truckPredeposit, LoadingTransport } from '../services/productionPlanner';

const BASE_URL = getBaseUrl();

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

/** Maps Discord emoji names to Unicode characters */
const EMOJI_MAP: Record<string, string> = {
  'grey_exclamation': '⚠️',
  'warning': '⚠️',
  'checkmark': '✅',
  'x': '❌',
  'information_source': 'ℹ️',
  'question': '❓',
  'heavy_check_mark': '✔️',
  'white_check_mark': '✅',
  'negative_squared_cross_mark': '❎',
  'exclamation': '❗',
  'bulb': '💡',
};

/** Converts Discord emoji names (e.g. :grey_exclamation:) to Unicode characters */
function convertEmojiNames(text: string): string {
  return text.replace(/:([a-z_]+):/gi, (match, name) => {
    return EMOJI_MAP[name.toLowerCase()] ?? match;
  });
}

/** Parses Discord markdown (**, *, __) and converts to HTML with styling. */
function renderMarkdownToHtml(text: string): string {
  // Handle bold+italic: ***text***
  text = text.replace(/\*\*\*(.+?)\*\*\*/gs, '<strong><em>$1</em></strong>');
  
  // Handle bold: **text**
  text = text.replace(/\*\*(.+?)\*\*/gs, '<strong>$1</strong>');
  
  // Handle underline: __text__
  text = text.replace(/__(.+?)__/gs, '<u>$1</u>');
  
  // Handle italic: *text* (single asterisk, avoiding already-replaced markup)
  text = text.replace(/\*([^*]+?)\*/gs, '<em>$1</em>');
  
  return text;
}

/** Renders raw Discord text as safe HTML, replacing the alarm custom emoji with a visual <img>. */
function renderPreviewHtml(raw: string): string {
  // First, convert named emojis (:grey_exclamation:) to Unicode
  let text = convertEmojiNames(raw);
  const escaped = escapeHtml(text);
  // Apply markdown formatting (bold, italic, underline)
  const withMarkdown = renderMarkdownToHtml(escaped);
  // After escapeHtml, '<a:alarm:1308239734618984508>' becomes '&lt;a:alarm:1308239734618984508&gt;'
  return withMarkdown.replaceAll(
    '&lt;a:alarm:1308239734618984508&gt;',
    `<img src="${BASE_URL}assets/emojis/alarm_icon.gif" alt="<a:alarm:1308239734618984508>" title="alarm" class="inline w-5 h-5 align-middle" onerror="this.outerHTML='\u23F0'" />`
  );
}

function regionalIndicator(index: number): string {
  if (index < 0 || index > 25) return '•';
  return String.fromCodePoint(0x1F1E6 + index);
}

export class TodoListView {
  private container: HTMLElement | null = null;
  private unsubscribe: (() => void) | null = null;
  private focusBlockHandler: ((e: Event) => void) | null = null;
  private pendingFocusBlockId: string | null = null;
  private transportOpen = true;
  private renderedContext: 'todolist' | ProductionSource | null = null;
  private scrollByContext = { todolist: 0, factory: 0, mpf: 0 };

  mount(container: HTMLElement): void {
    this.container = container;
    this.render();
    this.unsubscribe?.();
    this.unsubscribe = store.subscribe(() => this.render());

    // Listen for focus requests from the toolbar "+ Texte" button.
    this.focusBlockHandler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { id?: string } | undefined;
      if (!detail?.id) return;
      this.pendingFocusBlockId = detail.id;
      this.applyPendingFocus();
    };
    window.addEventListener('focus-text-block', this.focusBlockHandler);
  }

  unmount(): void {
    this.rememberScroll();
    this.renderedContext = null;
    this.unsubscribe?.();
    this.unsubscribe = null;
    if (this.focusBlockHandler) {
      window.removeEventListener('focus-text-block', this.focusBlockHandler);
      this.focusBlockHandler = null;
    }
    if (this.container) this.container.innerHTML = '';
    // Ne pas toucher this.container.className : c'est le #main-view partagé avec Canvas.
  }

  private applyPendingFocus(): void {
    if (!this.pendingFocusBlockId || !this.container) return;
    const ta = this.container.querySelector(
      `textarea[data-block-id="${this.pendingFocusBlockId}"]`
    ) as HTMLTextAreaElement | null;
    if (ta) {
      ta.focus();
      this.pendingFocusBlockId = null;
    }
  }

  private render(): void {
    if (!this.container) return;
    const tl = store.productionDocument;
    const isRun = store.productionWorkspace === 'run';
    const context = isRun ? store.productionRunSource : 'todolist';

    // Group items by category, preserving insertion order within categories
    const grouped: Record<TodoCategory, TodoListItem[]> = {
      small_arms: [], heavy_arms: [], heavy_ammunition: [],
      vehicles: [], shipables: [], uniforms: [], supplies: [], utility: [], medical: [],
    };
    for (const item of tl.items) grouped[item.category]?.push(item);

    const factionWarning = (item: TodoListItem): boolean => {
      if (tl.faction === 'all') return false;
      if (item.faction.includes('neutral')) return false;
      return !item.faction.includes(tl.faction as 'colonial' | 'warden');
    };

    // Group text blocks by anchor for fast lookup
    const topBlocks = tl.textBlocks.filter(b => b.anchor.kind === 'top');
    const footerBlocks = tl.textBlocks.filter(b => b.anchor.kind === 'footer');
    const blocksByCategory: Record<TodoCategory, TextBlock[]> = {
      small_arms: [], heavy_arms: [], heavy_ammunition: [],
      vehicles: [], shipables: [], uniforms: [], supplies: [], utility: [], medical: [],
    };
    for (const b of tl.textBlocks) {
      if (b.anchor.kind === 'category') blocksByCategory[b.anchor.category].push(b);
    }

    const exportText = isRun ? '' : renderTodoList(tl);

    // Sauvegarder la position de scroll du wrapper interne avant de re-rendre
    this.rememberScroll();
    const prevScrollTop = this.scrollByContext[context];
    this.renderedContext = context;

    // Wrapper interne : ne jamais toucher this.container.className (partagé avec Canvas)
    this.container.innerHTML = `<div class="h-full overflow-auto p-3 sm:p-6 bg-gray-900 text-gray-100">
      <div class="max-w-6xl mx-auto mb-5 py-2 sticky top-0 z-20 bg-gray-900 flex flex-wrap items-center justify-between gap-3">
        <div role="tablist" aria-label="Production workspace" class="inline-flex bg-gray-800 border border-gray-700 rounded-lg p-1 gap-1">
          ${(['todolist', 'run'] as const).map(workspace => `<button type="button" id="tl-workspace-${workspace}" data-workspace="${workspace}"
            role="tab" aria-selected="${store.productionWorkspace === workspace}" aria-controls="tl-workspace-content"
            tabindex="${store.productionWorkspace === workspace ? 0 : -1}"
            class="px-4 py-1.5 rounded text-sm transition-colors ${store.productionWorkspace === workspace ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-gray-200 hover:bg-gray-700'}">${workspace === 'run' ? 'Logi Calculator' : 'MPF Todolist'}</button>`).join('')}
        </div>
        ${!isRun ? '<span class="text-xs text-gray-500">Regiment list</span>' : ''}
      </div>
      <div id="tl-workspace-content" role="tabpanel" aria-labelledby="tl-workspace-${store.productionWorkspace}">
      <div class="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-[minmax(0,2fr)_minmax(260px,1fr)] gap-6">

        <!-- LEFT: builder -->
        <div id="todolist-dropzone" class="space-y-4 min-w-0">
          <!-- Header controls -->
          <div class="bg-gray-800 rounded-lg border border-gray-700 p-4 flex flex-wrap gap-4 items-end">
            ${!isRun ? `<div class="flex-1 min-w-[180px]">
              <label class="block text-xs text-gray-400 mb-1">Title</label>
              <input id="tl-title" type="text" value="${escapeHtml(tl.title)}"
                class="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-sm focus:outline-none focus:border-blue-500" />
            </div>` : ''}
            ${!isRun ? `<label class="flex items-center gap-2 text-sm cursor-pointer">
              <input id="tl-autodate" type="checkbox" ${tl.autoDate ? 'checked' : ''} class="accent-blue-500" />
              <span>Auto date (DD/MM)</span>
            </label>` : ''}
            ${isRun ? `<div role="group" aria-label="Production building" class="grid grid-cols-2 gap-3 w-full">
                ${(['factory', 'mpf'] as ProductionSource[]).map(source => `
                  <button type="button" data-production-source="${source}" aria-pressed="${(tl.productionSource ?? 'mpf') === source}"
                    class="flex items-center justify-center gap-2 min-h-14 px-4 py-3 rounded-lg border text-base font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-blue-400 focus-visible:outline-offset-2 ${(tl.productionSource ?? 'mpf') === source ? 'bg-blue-600 border-blue-500 text-white' : 'bg-gray-700 border-gray-600 text-gray-200 hover:bg-gray-600'}">
                    <span aria-hidden="true" class="w-4">${(tl.productionSource ?? 'mpf') === source ? '✓' : ''}</span>
                    ${source === 'factory' ? 'Factory' : 'MPF'}
                  </button>
                `).join('')}
            </div>` : ''}
          </div>

          ${topBlocks.map(b => this.renderTextBlock(b)).join('')}

          ${tl.items.length === 0 && tl.textBlocks.length === 0 ? `
            <div class="text-center py-12 text-gray-500 italic border-2 border-dashed border-gray-700 rounded-lg">
              ${isRun ? 'No items. Drag an icon here or double-click an icon in the sidebar.' : 'No items. Drag an icon here, or click &ldquo;+ Text&rdquo;.'}
            </div>
          ` : TODO_CATEGORIES.map(cat => {
            const items = grouped[cat];
            const catBlocks = blocksByCategory[cat];
            if ((!items || items.length === 0) && catBlocks.length === 0) return '';
            return `
              <section class="bg-gray-800 rounded-lg border border-gray-700">
                <header class="px-4 py-2 border-b border-gray-700 font-semibold text-gray-200">
                  ${categoryLabel(cat)}
                  ${(() => {
                    const assetCount = items.length;
                    const lineCount = items.reduce((s, i) => s + i.orderCount, 0);
                    const assetLabel = assetCount !== 1 ? 'assets' : 'asset';
                    const lineLabel = isRun ? (lineCount !== 1 ? 'queues' : 'queue') : (lineCount !== 1 ? 'orders' : 'order');
                    return `<span class="text-xs text-gray-500 ml-2">(${assetCount} ${assetLabel}, ${lineCount} ${lineLabel})</span>`;
                  })()}
                </header>
                ${catBlocks.length > 0 ? `<div class="p-3 space-y-3 border-b border-gray-700/60">${catBlocks.map(b => this.renderTextBlock(b)).join('')}</div>` : ''}
                ${items.length > 0 ? `
                <ul class="divide-y divide-gray-700">
                  ${items.map((item, idx) => this.renderItemRow(item, idx, factionWarning(item))).join('')}
                </ul>` : ''}
              </section>
            `;
          }).join('')}

          ${footerBlocks.map(b => this.renderTextBlock(b)).join('')}
          <div class="text-xs text-gray-500 flex flex-wrap justify-between gap-2">
            <span>${isRun ? 'One item per production category. Choosing another replaces the current line.' : 'Drag or double-click sidebar items to add an order.'}</span>
            <span>${isRun ? 'Costs for selected crates' : 'Costs shown per order'}</span>
          </div>
        </div>

          <!-- Each workspace has its own document and purpose. -->
        <div class="space-y-3 lg:sticky lg:top-20 self-start min-w-0">
          <div class="bg-gray-800 rounded-lg border border-gray-700">
            <h2 class="px-4 py-3 border-b border-gray-700 text-sm">${isRun ? 'Loading' : 'Discord Preview'}</h2>
            ${isRun ? `<div id="tl-panel-loading">
              ${this.renderLoading()}
            </div>` : `<div id="tl-panel-discord">
              <div class="px-4 py-3 flex flex-wrap items-center gap-2 border-b border-gray-700">
                <span id="tl-char-count" class="text-xs font-mono ${exportText.length > 4000 ? 'text-red-400 font-bold' : 'text-gray-400'}">${exportText.length} / 4000</span>
                <button id="tl-copy" class="ml-auto px-2 py-1 bg-blue-600 hover:bg-blue-700 rounded text-xs">📋 Copy</button>
                <button id="tl-download" class="px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded text-xs">⬇️ .txt</button>
              </div>
              <pre id="tl-preview" data-raw="${escapeHtml(exportText)}" class="p-4 text-xs whitespace-pre-wrap break-words font-mono text-gray-200 max-h-[65vh] overflow-auto">${renderPreviewHtml(exportText)}</pre>
            </div>`}
          </div>
          ${isRun && tl.items.length ? `<div class="text-xs text-gray-500">Produces ${producedCrates(tl.items)} ${producedCrates(tl.items) === 1 ? 'crate' : 'crates'}</div>` : ''}
        </div>
      </div>
      </div>
    </div>
    `;

    // Restaurer la position de scroll après le re-rendu
    if (prevScrollTop > 0) {
      const scrollEl = this.container.firstElementChild as HTMLElement | null;
      if (scrollEl) scrollEl.scrollTop = prevScrollTop;
    }

    this.attachEvents();
  }

  private rememberScroll(): void {
    if (this.renderedContext && this.container?.firstElementChild) {
      this.scrollByContext[this.renderedContext] = (this.container.firstElementChild as HTMLElement).scrollTop;
    }
  }

  private renderItemRow(item: TodoListItem, idx: number, warnFaction: boolean): string {
    const cost = displayedCost(item);
    const matsParts: string[] = [];
    if (cost.bmat > 0) matsParts.push(`${cost.bmat} Bmats`);
    if (cost.rmat > 0) matsParts.push(`${cost.rmat} Rmats`);
    if (cost.emat > 0) matsParts.push(`${cost.emat} Emats`);
    if (cost.hemat > 0) matsParts.push(`${cost.hemat} HEmats`);
    const matsHtml = escapeHtml(matsParts.join(' – '));
    const letter = regionalIndicator(idx);
    const crates = orderCrateCount(item);
    const source = productionSource(item);
    const isRun = store.productionWorkspace === 'run';
    const minimumCrates = source === 'factory' ? 1 : 3;
    const factionBadge = warnFaction
      ? `<span title="This item does not belong to the selected faction" class="text-amber-400 text-xs">⚠️</span>`
      : '';

    return `
      <li class="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2 hover:bg-gray-700/30" data-item-id="${item.id}" data-category="${item.category}" draggable="${!isRun}">
        ${!isRun ? `<span class="cursor-grab text-gray-500 hover:text-gray-300 select-none text-base leading-none px-0.5" title="Drag to reorder">⠿</span>
        <span class="text-lg select-none w-7 text-center">${letter}</span>` : ''}
        <div class="relative w-8 h-8 shrink-0" title="${item.numberProduced} items/crate">
          <img src="${iconAssetUrl(item.iconFilename, BASE_URL)}" alt="" draggable="false"
               class="w-8 h-8 object-contain"
               onerror="this.style.visibility='hidden'" />
          ${item.subtypeFilename
            ? `<img src="${BASE_URL}assets/icons/subtypes/${item.subtypeFilename}" alt=""
                    class="absolute bottom-0 right-0 w-4 h-4 object-contain pointer-events-none" />`
            : ''}
        </div>
        <div class="flex-1 ${isRun ? 'min-w-[140px]' : 'min-w-0'}">
          <div class="flex items-center gap-2">
            <span class="font-medium text-sm truncate">${escapeHtml(item.itemName)}</span>
            ${factionBadge}
          </div>
          <div class="text-xs text-gray-400 truncate">${matsHtml || '<span class="italic text-gray-600">no cost data</span>'}</div>
          ${!isRun && (crates < item.maxCrates || source === 'factory')
            ? `<div class="text-xs text-gray-400">Saved order: ${crates} crates</div>` : ''}
        </div>
        ${isRun ? `<div class="shrink-0 ml-auto">
          <label for="tl-crates-${item.id}" class="block text-xs text-gray-400 mb-1">Crates</label>
          <div class="inline-flex items-center rounded border border-gray-600 bg-gray-900" role="group" aria-label="Crates of ${escapeHtml(item.itemName)}">
            <button type="button" data-action="decrease-crates" ${crates <= minimumCrates ? 'disabled' : ''}
              aria-label="Decrease ${escapeHtml(item.itemName)} crates"
              class="px-2 py-1 hover:bg-gray-700 rounded-l disabled:opacity-40 disabled:cursor-not-allowed">−</button>
            <input id="tl-crates-${item.id}" type="number" inputmode="numeric" min="${minimumCrates}" max="${item.maxCrates}" step="1" value="${crates}"
              data-action="set-crates" aria-label="Crates of ${escapeHtml(item.itemName)}"
              class="production-crate-input w-10 bg-transparent text-center text-sm tabular-nums py-1 focus:outline-none focus:ring-1 focus:ring-blue-500" />
            <button type="button" data-action="increase-crates" ${crates >= item.maxCrates ? 'disabled' : ''}
              aria-label="Increase ${escapeHtml(item.itemName)} crates"
              class="px-2 py-1 hover:bg-gray-700 rounded-r disabled:opacity-40 disabled:cursor-not-allowed">+</button>
          </div>
        </div>` : `<label class="text-xs text-gray-400 flex items-center gap-1">
          x
          <input type="number" min="1" value="${item.orderCount}"
            data-action="set-count"
            aria-label="Number of ${escapeHtml(item.itemName)} orders"
            class="w-14 bg-gray-900 border border-gray-700 rounded px-1 py-0.5 text-sm" />
        </label>`}
        <button data-action="delete" class="text-red-400 hover:text-red-300 text-sm" title="Delete">✕</button>
      </li>
    `;
  }

  private anchorValue(a: TextAnchor): string {
    if (a.kind === 'top') return 'top';
    if (a.kind === 'footer') return 'footer';
    return `cat:${a.category}`;
  }

  private renderTextBlock(block: TextBlock): string {
    const currentValue = this.anchorValue(block.anchor);
    const options = [
      `<option value="top" ${currentValue === 'top' ? 'selected' : ''}>↑ Header</option>`,
      ...TODO_CATEGORIES.map(c => {
        const v = `cat:${c}`;
        return `<option value="${v}" ${currentValue === v ? 'selected' : ''}>↳ Before ${TODO_CATEGORY_LABELS[c]}</option>`;
      }),
      `<option value="footer" ${currentValue === 'footer' ? 'selected' : ''}>↓ Footer</option>`,
    ].join('');

    // Dropdown emoji picker items
    const emojiItems = [
      { insert: '💡', label: ':bulb:' },
      { insert: '❗', label: ':exclamation:' },
      { insert: '❕', label: ':grey_exclamation:' },
      { insert: '⚠️', label: ':warning:' },
    ].map(e =>
      `<button type="button" data-insert="${e.insert}" title="${e.label}" class="emoji-btn flex items-center gap-2 w-full px-3 py-1.5 text-sm hover:bg-gray-600 transition-colors text-left">
        <span>${e.insert}</span><span class="text-gray-400 font-mono text-xs">${e.label}</span>
      </button>`
    ).join('');
    const alarmItem = `<button type="button" data-insert="<a:alarm:1308239734618984508>" title="<a:alarm:...>" class="emoji-btn flex items-center gap-2 w-full px-3 py-1.5 text-sm hover:bg-gray-600 transition-colors text-left">
      <img src="${BASE_URL}assets/emojis/alarm_icon.gif" alt="alarm" class="w-5 h-5" onerror="this.outerHTML='⏰'" />
      <span class="text-gray-400 font-mono text-xs">&#x3C;a:alarm:...&#x3E;</span>
    </button>`;

    return `
      <div class="bg-gray-800 border border-gray-700 rounded-lg p-3" data-block-id="${block.id}">
        <div class="flex items-center gap-2 mb-2">
          <span class="text-xs text-gray-400">📝 Free text</span>
          <div class="flex gap-1">
            <button type="button" data-format="bold" title="Bold (**text**)"
              class="px-2 py-0.5 bg-gray-700 hover:bg-blue-600 rounded text-sm font-bold transition-colors leading-none">
              B
            </button>
            <button type="button" data-format="italic" title="Italic (*text*)"
              class="px-2 py-0.5 bg-gray-700 hover:bg-blue-600 rounded text-sm italic transition-colors leading-none">
              I
            </button>
            <button type="button" data-format="underline" title="Underline (__text__)"
              class="px-2 py-0.5 bg-gray-700 hover:bg-blue-600 rounded text-sm underline transition-colors leading-none">
              U
            </button>
          </div>
          <div class="relative emoji-picker-wrapper">
            <button type="button" data-action="toggle-emoji" title="Insert emoji"
              class="px-2 py-0.5 bg-gray-700 hover:bg-blue-600 rounded text-sm transition-colors leading-none">
              😀 ▾
            </button>
            <div data-emoji-dropdown class="hidden absolute left-0 top-full mt-1 z-20 bg-gray-800 border border-gray-600 rounded-lg shadow-xl min-w-max py-1">
              ${emojiItems}
              ${alarmItem}
            </div>
          </div>
          <select data-action="set-anchor" class="ml-auto bg-gray-900 border border-gray-700 rounded px-2 py-0.5 text-xs">
            ${options}
          </select>
          <button data-action="delete-block" class="text-red-400 hover:text-red-300 text-sm" title="Delete">✕</button>
        </div>
        <textarea data-block-id="${block.id}" data-action="set-content"
          rows="2"
          placeholder="Raw Discord markdown, multi-line..."
          class="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-sm font-mono resize-y focus:outline-none focus:border-blue-500"
        >${escapeHtml(block.content)}</textarea>
      </div>
    `;
  }

  private parseAnchor(value: string): TextAnchor | null {
    if (value === 'top') return { kind: 'top' };
    if (value === 'footer') return { kind: 'footer' };
    if (value.startsWith('cat:')) {
      const cat = value.slice(4) as TodoCategory;
      if ((TODO_CATEGORIES as string[]).includes(cat)) return { kind: 'category', category: cat };
    }
    return null;
  }

  private renderLoading(): string {
    const summary = loadingSummary(store.productionDocument.items, store.productionRunTransport, store.itemData);
    const isFactory = store.productionRunSource === 'factory';
    const isTruck = store.productionRunTransport === 'truck';
    const unit = isTruck ? 'slots' : 'crates';
    const over = summary.used > summary.capacity;
    const deposit = isTruck && over ? truckPredeposit(summary.totals) : null;
    return `<div class="p-4" id="tl-loading-summary">
      <h3 class="text-sm font-medium mb-3">Materials to load</h3>
      <div aria-live="polite">
        ${MATERIAL_KEYS.filter(material => summary.totals[material] > 0).map(material => {
          const metadata = MATERIALS[material];
          const icon = store.itemData.find(item => item.itemName === metadata.name)?.iconFilename ?? metadata.iconFilename;
          return `<div class="flex items-center gap-2 py-2 border-b border-gray-700" data-loading-material="${material}">
            <img src="${iconAssetUrl(icon, BASE_URL)}" alt="" class="w-7 h-7 object-contain shrink-0">
            <span class="text-sm">${metadata.label}</span>
            <div class="ml-auto text-right tabular-nums">
              ${!isFactory && !isTruck ? `
                <div class="text-sm font-semibold">${summary.loads[material]} ${summary.loads[material] === 1 ? 'crate' : 'crates'}</div>
                <div class="text-xs text-gray-400" data-material-total>${summary.totals[material].toLocaleString('en-GB')} units</div>
              ` : `
                <div class="text-sm" data-material-total>${summary.totals[material].toLocaleString('en-GB')}</div>
                <div class="text-xs text-gray-400">${summary.loads[material]} ${summary.loads[material] === 1 ? 'stack' : 'stacks'}</div>
              `}
            </div>
          </div>`;
        }).join('') || '<div class="text-xs text-gray-500 py-2">No production orders yet.</div>'}
        <div class="flex justify-between gap-2 text-sm pt-3">
          <span>${isTruck ? 'Total truck slots' : 'Total crates'}</span>
          <div class="flex items-center gap-2 ${!isTruck && over ? 'text-amber-300' : ''}">
            <strong id="tl-total-load" data-unit="${unit}" class="tabular-nums">${summary.used}</strong>
          </div>
        </div>
      </div>
      <details id="tl-transport-details" ${this.transportOpen ? 'open' : ''} class="mt-4 pt-3 border-t border-gray-700">
        <summary class="text-xs text-blue-300 hover:text-blue-200 cursor-pointer">Check transport capacity</summary>
        ${isFactory ? '<div class="text-xs text-gray-300 mt-3">Standard Truck</div>' : `<label class="sr-only" for="tl-transport">Transport</label>
        <select id="tl-transport" class="w-full bg-gray-900 border border-gray-600 rounded px-2 py-2 text-xs mt-3">
          <option value="container" ${store.productionRunTransport === 'container' ? 'selected' : ''}>Flatbed + Shipping Container</option>
          <option value="truck" ${store.productionRunTransport === 'truck' ? 'selected' : ''}>Standard Truck</option>
        </select>`}
        <div class="flex justify-between gap-2 text-xs mt-3 text-gray-400">
          <span>${store.productionRunTransport === 'truck' ? 'Truck inventory' : 'Container capacity'}</span>
          <span id="tl-transport-capacity" class="text-gray-200 tabular-nums">${summary.used} / ${summary.capacity} ${unit}</span>
        </div>
        <div role="progressbar" aria-label="Transport capacity used" aria-valuemin="0" aria-valuemax="${summary.capacity}"
          aria-valuenow="${Math.min(summary.used, summary.capacity)}" aria-valuetext="${summary.used} of ${summary.capacity} ${unit}"
          class="h-1.5 rounded-full bg-gray-700 overflow-hidden mt-2">
          <div class="h-full rounded-full ${over ? 'bg-amber-400' : 'bg-blue-400'}" style="width:${Math.min(100, summary.used / summary.capacity * 100)}%"></div>
        </div>
        <p id="tl-transport-status" aria-live="polite" class="text-xs mt-2 ${over ? 'text-amber-300' : 'text-gray-400'}">
          ${over ? `${summary.used - summary.capacity} ${summary.used - summary.capacity === 1 ? isTruck ? 'slot' : 'crate' : unit} over capacity` : `Fits · ${summary.capacity - summary.used} ${unit} available`}
        </p>
        ${deposit ? `<p id="tl-predeposit" class="text-xs text-amber-300 mt-2">Deposit ${MATERIAL_KEYS.filter(material => deposit[material] > 0).map(material => `${deposit[material].toLocaleString('en-GB')} ${MATERIALS[material].label}`).join(' + ')} in the ${isFactory ? 'Factory' : 'MPF'} inventory beforehand so the remaining load fits in your truck.</p>` : ''}
        ${store.productionRunTransport === 'truck' ? `<div class="text-xs text-gray-500 mt-2">${MATERIAL_KEYS.filter(material => summary.loads[material]).map(material => `${summary.loads[material]} ${MATERIALS[material].label} ${summary.loads[material] === 1 ? 'stack' : 'stacks'}`).join(' · ')}<br>100 loose materials per stack · 15 slots</div>` : ''}
      </details>
    </div>`;
  }

  private attachEvents(): void {
    if (!this.container) return;
    const workspace = store.productionWorkspace;

    const selectWorkspace = (target: ProductionWorkspace) => {
      store.setProductionWorkspace(target);
      this.container?.querySelector<HTMLButtonElement>(`#tl-workspace-${target}`)?.focus();
    };
    this.container.querySelectorAll<HTMLButtonElement>('[data-workspace]').forEach(button => {
      button.addEventListener('click', () => selectWorkspace(button.dataset.workspace as ProductionWorkspace));
      button.addEventListener('keydown', event => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        selectWorkspace(event.key === 'Home' ? 'todolist' : event.key === 'End' ? 'run' : workspace === 'todolist' ? 'run' : 'todolist');
      });
    });
    this.container.querySelectorAll<HTMLButtonElement>('[data-production-source]').forEach(button => {
      button.addEventListener('click', () => {
        const source = button.dataset.productionSource as ProductionSource;
        store.setTodoListProductionSource(source, workspace);
        this.container?.querySelector<HTMLButtonElement>(`[data-production-source="${source}"]`)?.focus();
      });
    });
    const transportDetails = this.container.querySelector<HTMLDetailsElement>('#tl-transport-details');
    transportDetails?.addEventListener('toggle', () => {
      if (transportDetails.isConnected) this.transportOpen = transportDetails.open;
    });
    const transport = this.container.querySelector<HTMLSelectElement>('#tl-transport');
    transport?.addEventListener('change', () => {
      this.transportOpen = true;
      store.setProductionRunTransport(transport.value as LoadingTransport);
      this.container?.querySelector<HTMLSelectElement>('#tl-transport')?.focus();
    });

    // Header controls
    const titleInput = this.container.querySelector('#tl-title') as HTMLInputElement | null;
    const commitTitle = () => {
      if (titleInput && titleInput.value !== store.getProductionDocument(workspace).title) {
        store.setTodoListTitle(titleInput.value, workspace);
      }
    };
    titleInput?.addEventListener('change', commitTitle);
    titleInput?.addEventListener('blur', commitTitle);

    const autoDate = this.container.querySelector('#tl-autodate') as HTMLInputElement | null;
    autoDate?.addEventListener('change', () => store.setTodoListAutoDate(autoDate.checked, workspace));

    // Item rows: count + delete + drag reorder
    let dragSrcId: string | null = null;
    let dragSrcCategory: string | null = null;

    const clearDropIndicators = () => {
      this.container?.querySelectorAll('li[data-item-id]').forEach(el => {
        (el as HTMLElement).style.boxShadow = '';
      });
    };

    this.container.querySelectorAll('li[data-item-id]').forEach(li => {
      const liEl = li as HTMLElement;
      const id = liEl.dataset.itemId!;
      const category = liEl.dataset.category!;

      const crateInput = li.querySelector<HTMLInputElement>('[data-action="set-crates"]');
      const updateCrates = (value: number, focusAction?: string) => {
        const item = store.getProductionDocument(workspace).items.find(item => item.id === id);
        if (!item || !Number.isFinite(value)) return;
        const crates = orderCrateCount({ ...item, cratesPerOrder: value });
        if (crates !== orderCrateCount(item)) store.setTodoListCratesPerOrder(id, crates, workspace);
        const row = this.container?.querySelector<HTMLElement>(`[data-item-id="${id}"]`);
        const input = row?.querySelector<HTMLInputElement>('[data-action="set-crates"]');
        if (input) input.value = String(crates);
        if (focusAction) {
          const control = row?.querySelector<HTMLButtonElement | HTMLInputElement>(`[data-action="${focusAction}"]`);
          if (control && !control.disabled) control.focus(); else input?.focus();
        }
      };
      crateInput?.addEventListener('input', () => updateCrates(crateInput.valueAsNumber, 'set-crates'));
      crateInput?.addEventListener('change', () => {
        const item = store.getProductionDocument(workspace).items.find(item => item.id === id);
        if (item) updateCrates(Number.isFinite(crateInput.valueAsNumber) ? crateInput.valueAsNumber : orderCrateCount(item));
      });
      for (const [action, delta] of [['decrease-crates', -1], ['increase-crates', 1]] as const) {
        li.querySelector(`[data-action="${action}"]`)?.addEventListener('click', () => {
          const item = store.getProductionDocument(workspace).items.find(item => item.id === id);
          if (item) updateCrates(orderCrateCount(item) + delta, action);
        });
      }

      const countInput = li.querySelector('input[data-action="set-count"]') as HTMLInputElement | null;
      countInput?.addEventListener('change', () => {
        const v = parseInt(countInput.value, 10);
        if (Number.isFinite(v) && v >= 1) store.setTodoListOrderCount(id, v, workspace);
      });
      li.querySelector('[data-action="delete"]')?.addEventListener('click', () => {
        store.removeTodoListItem(id, workspace);
      });

      // Drag to reorder within the same category
      liEl.addEventListener('dragstart', (e) => {
        dragSrcId = id;
        dragSrcCategory = category;
        e.dataTransfer!.setData('application/x-todolist-item', id);
        e.dataTransfer!.effectAllowed = 'move';
        liEl.classList.add('opacity-50');
      });

      liEl.addEventListener('dragend', () => {
        liEl.classList.remove('opacity-50');
        clearDropIndicators();
        dragSrcId = null;
        dragSrcCategory = null;
      });

      liEl.addEventListener('dragover', (e) => {
        if (!e.dataTransfer?.types.includes('application/x-todolist-item')) return;
        if (dragSrcId === id || dragSrcCategory !== category) return;
        e.preventDefault();
        e.stopPropagation();
        clearDropIndicators();
        const rect = liEl.getBoundingClientRect();
        const insertBefore = e.clientY < rect.top + rect.height / 2;
        liEl.style.boxShadow = insertBefore
          ? 'inset 0 2px 0 0 #60a5fa'
          : 'inset 0 -2px 0 0 #60a5fa';
      });

      liEl.addEventListener('dragleave', (e) => {
        if (!liEl.contains(e.relatedTarget as Node)) {
          liEl.style.boxShadow = '';
        }
      });

      liEl.addEventListener('drop', (e) => {
        if (!e.dataTransfer?.types.includes('application/x-todolist-item')) return;
        if (!dragSrcId || dragSrcCategory !== category) return;
        e.preventDefault();
        e.stopPropagation();
        const items = store.productionDocument.items.filter(i => i.category === category);
        const orderedIds = items.map(i => i.id);
        const srcIndex = orderedIds.indexOf(dragSrcId);
        const dstIndex = orderedIds.indexOf(id);
        if (srcIndex === -1 || dstIndex === -1 || srcIndex === dstIndex) {
          clearDropIndicators();
          return;
        }
        const rect = liEl.getBoundingClientRect();
        const insertBefore = e.clientY < rect.top + rect.height / 2;
        orderedIds.splice(srcIndex, 1);
        const newDstIndex = orderedIds.indexOf(id);
        orderedIds.splice(insertBefore ? newDstIndex : newDstIndex + 1, 0, dragSrcId);
        store.reorderTodoListItems(category, orderedIds, workspace);
        clearDropIndicators();
      });
    });

    // Copy + download
    const previewEl = this.container.querySelector('#tl-preview') as HTMLPreElement | null;
    this.container.querySelector('#tl-copy')?.addEventListener('click', async () => {
      const text = previewEl?.dataset.raw ?? previewEl?.textContent ?? '';
      try {
        await navigator.clipboard.writeText(text);
        showToast('Copied!', { type: 'success' });
      } catch {
        showToast('Copy failed', { type: 'error' });
      }
    });
    this.container.querySelector('#tl-download')?.addEventListener('click', () => {
      const text = previewEl?.dataset.raw ?? previewEl?.textContent ?? '';
      const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `todolist_${new Date().toISOString().slice(0, 10)}.txt`;
      a.click();
      URL.revokeObjectURL(url);
    });

    // Drop zone
    const dropzone = this.container.querySelector('#todolist-dropzone') as HTMLElement | null;
    if (dropzone) {
      dropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropzone.classList.add('ring', 'ring-blue-500');
      });
      dropzone.addEventListener('dragleave', () => {
        dropzone.classList.remove('ring', 'ring-blue-500');
      });
      dropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropzone.classList.remove('ring', 'ring-blue-500');
        const data = e.dataTransfer?.getData('application/json');
        if (!data) return;
        try {
          const payload = JSON.parse(data) as { filename?: string; displayName?: string };
          if (!payload.filename) return;
          const result = store.addTodoListItemFromIcon(payload.filename, workspace);
          if (result === 'not-mpf') {
            showToast(`"${payload.displayName ?? payload.filename}" cannot be produced in ${store.productionDocument.productionSource === 'factory' ? 'a Factory' : 'an MPF'}.`, { type: 'error' });
          } else if (result === 'wrong-faction') {
            showToast(`"${payload.displayName ?? payload.filename}" belongs to the opposing faction.`, { type: 'error' });
          }
        } catch (err) {
          console.error('drop parse failed:', err);
        }
      });
    }

    // Text blocks: anchor select, content textarea, delete button + autoresize
    this.container.querySelectorAll('[data-block-id]').forEach(el => {
      const wrapper = el as HTMLElement;
      // We attach to the wrapper div (which has data-block-id) — textarea also has data-block-id
      // so skip if this element is a textarea (handled via wrapper child queries below).
      if (wrapper.tagName === 'TEXTAREA') return;
      const id = wrapper.dataset.blockId!;

      const anchorSel = wrapper.querySelector('select[data-action="set-anchor"]') as HTMLSelectElement | null;
      anchorSel?.addEventListener('change', () => {
        const a = this.parseAnchor(anchorSel.value);
        if (a) store.updateTextBlock(id, { anchor: a });
      });

      const ta = wrapper.querySelector('textarea[data-action="set-content"]') as HTMLTextAreaElement | null;
      if (ta) {
        const autoresize = () => {
          ta.style.height = 'auto';
          ta.style.height = ta.scrollHeight + 'px';
        };
        autoresize();
        // Live preview without committing to store (avoid re-render stealing focus)
        ta.addEventListener('input', () => {
          autoresize();
          if (previewEl) {
            const tlSnapshot = {
              ...store.productionDocument,
              textBlocks: store.productionDocument.textBlocks.map(b =>
                b.id === id ? { ...b, content: ta.value } : b
              ),
            };
            const rawText = renderTodoList(tlSnapshot);
            previewEl.dataset.raw = rawText;
            previewEl.innerHTML = renderPreviewHtml(rawText);
            const charCountEl = this.container?.querySelector('#tl-char-count') as HTMLElement | null;
            if (charCountEl) {
              charCountEl.textContent = `${rawText.length} / 4000`;
              charCountEl.className = `text-xs font-mono ${rawText.length > 4000 ? 'text-red-400 font-bold' : 'text-gray-400'}`;
            }
          }
        });
        // Commit on blur / change
        ta.addEventListener('change', () => {
          store.updateTextBlock(id, { content: ta.value });
        });
      }

      wrapper.querySelector('[data-action="delete-block"]')?.addEventListener('click', () => {
        store.removeTextBlock(id);
      });

      // Emoji dropdown toggle
      const toggleBtn = wrapper.querySelector('[data-action="toggle-emoji"]');
      const dropdown = wrapper.querySelector('[data-emoji-dropdown]') as HTMLElement | null;

      // Save cursor position before the textarea loses focus on button click
      let savedSelectionStart = 0;
      let savedSelectionEnd = 0;
      ta?.addEventListener('blur', () => {
        savedSelectionStart = ta.selectionStart ?? 0;
        savedSelectionEnd = ta.selectionEnd ?? 0;
      });

      toggleBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        dropdown?.classList.toggle('hidden');
      });

      // Emoji quick-insert: insert at saved cursor position then close dropdown
      wrapper.querySelectorAll('[data-insert]').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          dropdown?.classList.add('hidden');
          if (!ta) return;
          const text = (btn as HTMLElement).dataset.insert!;
          const start = savedSelectionStart;
          const end = savedSelectionEnd;
          ta.value = ta.value.slice(0, start) + text + ta.value.slice(end);
          ta.focus();
          ta.selectionStart = ta.selectionEnd = start + text.length;
          savedSelectionStart = savedSelectionEnd = start + text.length;
          ta.dispatchEvent(new Event('input', { bubbles: true }));
        });
      });

      // Text formatting buttons (Bold, Italic, Underline)
      wrapper.querySelectorAll('[data-format]').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          if (!ta) return;
          
          const start = ta.selectionStart ?? 0;
          const end = ta.selectionEnd ?? 0;
          const selectedText = ta.value.slice(start, end);

          if (selectedText.length === 0) {
            showToast('Please select text to format', { type: 'error' });
            return;
          }

          const format = (btn as HTMLElement).dataset.format!;
          let prefix = '', suffix = '';
          
          if (format === 'bold') {
            prefix = suffix = '**';
          } else if (format === 'italic') {
            prefix = suffix = '*';
          } else if (format === 'underline') {
            prefix = suffix = '__';
          }

          const formattedText = prefix + selectedText + suffix;
          ta.value = ta.value.slice(0, start) + formattedText + ta.value.slice(end);
          
          // Keep selection on the formatted text (excluding the markup)
          ta.selectionStart = start + prefix.length;
          ta.selectionEnd = start + prefix.length + selectedText.length;
          ta.focus();
          ta.dispatchEvent(new Event('input', { bubbles: true }));
        });
      });
    });

    // Close any open emoji dropdown on outside click
    document.addEventListener('click', () => {
      this.container?.querySelectorAll('[data-emoji-dropdown]').forEach(d => {
        (d as HTMLElement).classList.add('hidden');
      });
    }, { capture: true, once: false });

    // If a focus was requested before render, apply now
    this.applyPendingFocus();
  }
}
