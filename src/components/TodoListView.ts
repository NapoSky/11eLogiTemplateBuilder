import { store } from '../store';
import { TodoListItem, MPF_CATEGORIES, MPF_CATEGORY_LABELS, MpfCategory, FactionFilter, TextBlock, TextAnchor } from '../types';
import { displayedCost } from '../services/mpfCalculator';
import { renderTodoList } from '../services/todoListExporter';
import { getBaseUrl } from '../config';

const BASE_URL = getBaseUrl();

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

/** Renders raw Discord text as safe HTML, replacing the alarm custom emoji with a visual <img>. */
function renderPreviewHtml(raw: string): string {
  const escaped = escapeHtml(raw);
  // After escapeHtml, '<a:alarm:1308239734618984508>' becomes '&lt;a:alarm:1308239734618984508&gt;'
  return escaped.replaceAll(
    '&lt;a:alarm:1308239734618984508&gt;',
    `<img src="${BASE_URL}assets/emojis/alarm_icon.gif" alt="<a:alarm:1308239734618984508>" title="alarm" class="inline w-5 h-5 align-middle" onerror="this.outerHTML='\u23F0'" />`
  );
}

function regionalIndicator(index: number): string {
  if (index < 0 || index > 25) return '•';
  return String.fromCodePoint(0x1F1E6 + index);
}

function showToast(message: string): void {
  const toast = document.createElement('div');
  toast.className = 'fixed bottom-6 right-6 bg-red-600 text-white px-4 py-2 rounded shadow-lg z-50 transition-opacity';
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, 2200);
}

export class TodoListView {
  private container: HTMLElement | null = null;
  private unsubscribe: (() => void) | null = null;
  private focusBlockHandler: ((e: Event) => void) | null = null;
  private pendingFocusBlockId: string | null = null;

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
    const tl = store.todolist;

    // Group items by category, preserving insertion order within categories
    const grouped: Record<MpfCategory, TodoListItem[]> = {
      small_arms: [], heavy_arms: [], heavy_ammunition: [],
      vehicles: [], shipables: [], uniforms: [], supplies: [],
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
    const blocksByCategory: Record<MpfCategory, TextBlock[]> = {
      small_arms: [], heavy_arms: [], heavy_ammunition: [],
      vehicles: [], shipables: [], uniforms: [], supplies: [],
    };
    for (const b of tl.textBlocks) {
      if (b.anchor.kind === 'category') blocksByCategory[b.anchor.category].push(b);
    }

    const exportText = renderTodoList(tl);

    // Wrapper interne : ne jamais toucher this.container.className (partagé avec Canvas)
    this.container.innerHTML = `<div class="h-full overflow-auto p-6 bg-gray-900 text-gray-100">
      <div class="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-6">

        <!-- LEFT: builder -->
        <div id="todolist-dropzone" class="space-y-4">
          <!-- Header controls -->
          <div class="bg-gray-800 rounded-lg border border-gray-700 p-4 flex flex-wrap gap-4 items-end">
            <div class="flex-1 min-w-[180px]">
              <label class="block text-xs text-gray-400 mb-1">Titre</label>
              <input id="tl-title" type="text" value="${escapeHtml(tl.title)}"
                class="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-sm focus:outline-none focus:border-blue-500" />
            </div>
            <label class="flex items-center gap-2 text-sm cursor-pointer">
              <input id="tl-autodate" type="checkbox" ${tl.autoDate ? 'checked' : ''} class="accent-blue-500" />
              <span>Date auto (DD/MM)</span>
            </label>
            <div>
              <label class="block text-xs text-gray-400 mb-1">Faction</label>
              <select id="tl-faction" class="bg-gray-900 border border-gray-700 rounded px-2 py-1 text-sm">
                <option value="all" ${tl.faction === 'all' ? 'selected' : ''}>Toutes</option>
                <option value="colonial" ${tl.faction === 'colonial' ? 'selected' : ''}>Colonial</option>
                <option value="warden" ${tl.faction === 'warden' ? 'selected' : ''}>Warden</option>
              </select>
            </div>
          </div>

          <!-- Drop hint -->
          <div class="bg-blue-900/20 border border-blue-700/40 rounded-lg p-3 text-sm text-blue-200">
            👉 Glissez une icône MPF-craftable depuis la sidebar pour l'ajouter à la todolist.
          </div>

          ${topBlocks.map(b => this.renderTextBlock(b)).join('')}

          ${tl.items.length === 0 && tl.textBlocks.length === 0 ? `
            <div class="text-center py-12 text-gray-500 italic border-2 border-dashed border-gray-700 rounded-lg">
              Aucun item. Glissez une icône ici, ou cliquez sur « + Texte ».
            </div>
          ` : MPF_CATEGORIES.map(cat => {
            const items = grouped[cat];
            const catBlocks = blocksByCategory[cat];
            if ((!items || items.length === 0) && catBlocks.length === 0) return '';
            return `
              <section class="bg-gray-800 rounded-lg border border-gray-700">
                <header class="px-4 py-2 border-b border-gray-700 font-semibold text-gray-200">
                  ${MPF_CATEGORY_LABELS[cat]}
                  <span class="text-xs text-gray-500 ml-2">(${items.length})</span>
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
        </div>

        <!-- RIGHT: preview -->
        <div class="space-y-3 lg:sticky lg:top-4 self-start">
          <div class="bg-gray-800 rounded-lg border border-gray-700">
            <header class="px-4 py-2 border-b border-gray-700 font-semibold text-gray-200 flex items-center justify-between">
              <span>Aperçu Discord</span>
              <div class="flex gap-1">
                <button id="tl-copy" class="px-2 py-1 bg-blue-600 hover:bg-blue-700 rounded text-xs">📋 Copier</button>
                <button id="tl-download" class="px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded text-xs">⬇️ .txt</button>
              </div>
            </header>
            <pre id="tl-preview" data-raw="${escapeHtml(exportText)}" class="p-4 text-xs whitespace-pre-wrap font-mono text-gray-200 max-h-[70vh] overflow-auto">${renderPreviewHtml(exportText)}</pre>
          </div>
          <div class="text-xs text-gray-500">
            ${tl.items.length} item(s), total = ${this.computeGrandTotal()}.
          </div>
        </div>
      </div>
    </div>
    `;

    this.attachEvents();
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
    const factionBadge = warnFaction
      ? `<span title="Cet item n'appartient pas à la faction sélectionnée" class="text-amber-400 text-xs">⚠️</span>`
      : '';

    return `
      <li class="flex items-center gap-3 px-3 py-2 hover:bg-gray-700/30" data-item-id="${item.id}">
        <span class="text-lg select-none w-7 text-center">${letter}</span>
        <img src="${BASE_URL}assets/icons/${item.iconFilename}" alt=""
             class="w-8 h-8 object-contain shrink-0"
             onerror="this.style.visibility='hidden'" />
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2">
            <span class="font-medium text-sm truncate">${escapeHtml(item.itemName)}</span>
            ${factionBadge}
          </div>
          <div class="text-xs text-gray-400 truncate">${matsHtml || '<span class="italic text-gray-600">no cost data</span>'}</div>
        </div>
        <label class="text-xs text-gray-400 flex items-center gap-1">
          x
          <input type="number" min="1" value="${item.orderCount}"
            data-action="set-count"
            class="w-14 bg-gray-900 border border-gray-700 rounded px-1 py-0.5 text-sm" />
        </label>
        <span class="text-xs text-gray-500 w-12 text-right">/${item.maxCrates}</span>
        <button data-action="delete" class="text-red-400 hover:text-red-300 text-sm" title="Supprimer">✕</button>
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
      `<option value="top" ${currentValue === 'top' ? 'selected' : ''}>↑ En tête</option>`,
      ...MPF_CATEGORIES.map(c => {
        const v = `cat:${c}`;
        return `<option value="${v}" ${currentValue === v ? 'selected' : ''}>↳ Avant ${MPF_CATEGORY_LABELS[c]}</option>`;
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
          <span class="text-xs text-gray-400">📝 Texte libre</span>
          <div class="relative emoji-picker-wrapper">
            <button type="button" data-action="toggle-emoji" title="Insérer un émoji"
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
          <button data-action="delete-block" class="text-red-400 hover:text-red-300 text-sm" title="Supprimer">✕</button>
        </div>
        <textarea data-block-id="${block.id}" data-action="set-content"
          rows="2"
          placeholder="Markdown Discord brut, multi-ligne..."
          class="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-sm font-mono resize-y focus:outline-none focus:border-blue-500"
        >${escapeHtml(block.content)}</textarea>
      </div>
    `;
  }

  private parseAnchor(value: string): TextAnchor | null {
    if (value === 'top') return { kind: 'top' };
    if (value === 'footer') return { kind: 'footer' };
    if (value.startsWith('cat:')) {
      const cat = value.slice(4) as MpfCategory;
      if ((MPF_CATEGORIES as string[]).includes(cat)) return { kind: 'category', category: cat };
    }
    return null;
  }

  private computeGrandTotal(): string {
    const total = { bmat: 0, rmat: 0, emat: 0, hemat: 0 };
    for (const item of store.todolist.items) {
      const c = displayedCost(item);
      total.bmat += c.bmat;
      total.rmat += c.rmat;
      total.emat += c.emat;
      total.hemat += c.hemat;
    }
    const parts: string[] = [];
    if (total.bmat) parts.push(`${total.bmat} Bmats`);
    if (total.rmat) parts.push(`${total.rmat} Rmats`);
    if (total.emat) parts.push(`${total.emat} Emats`);
    if (total.hemat) parts.push(`${total.hemat} HEmats`);
    return parts.length ? parts.join(' / ') : '—';
  }

  private attachEvents(): void {
    if (!this.container) return;

    // Header controls
    const titleInput = this.container.querySelector('#tl-title') as HTMLInputElement | null;
    titleInput?.addEventListener('change', () => store.setTodoListTitle(titleInput.value));
    titleInput?.addEventListener('blur', () => store.setTodoListTitle(titleInput.value));

    const autoDate = this.container.querySelector('#tl-autodate') as HTMLInputElement | null;
    autoDate?.addEventListener('change', () => store.setTodoListAutoDate(autoDate.checked));

    const faction = this.container.querySelector('#tl-faction') as HTMLSelectElement | null;
    faction?.addEventListener('change', () => store.setTodoListFaction(faction.value as FactionFilter));

    // Item rows: count + delete
    this.container.querySelectorAll('li[data-item-id]').forEach(li => {
      const id = (li as HTMLElement).dataset.itemId!;
      const countInput = li.querySelector('input[data-action="set-count"]') as HTMLInputElement | null;
      countInput?.addEventListener('change', () => {
        const v = parseInt(countInput.value, 10);
        if (Number.isFinite(v) && v >= 1) store.setTodoListOrderCount(id, v);
      });
      li.querySelector('[data-action="delete"]')?.addEventListener('click', () => {
        store.removeTodoListItem(id);
      });
    });

    // Copy + download
    const previewEl = this.container.querySelector('#tl-preview') as HTMLPreElement | null;
    this.container.querySelector('#tl-copy')?.addEventListener('click', async () => {
      const text = previewEl?.dataset.raw ?? previewEl?.textContent ?? '';
      try {
        await navigator.clipboard.writeText(text);
        showToast('Copié !');
      } catch {
        showToast('Échec de la copie');
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
          const ok = store.addTodoListItemFromIcon(payload.filename);
          if (!ok) {
            showToast(`"${payload.displayName ?? payload.filename}" n'est pas craftable au MPF.`);
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
              ...store.todolist,
              textBlocks: store.todolist.textBlocks.map(b =>
                b.id === id ? { ...b, content: ta.value } : b
              ),
            };
            const rawText = renderTodoList(tlSnapshot);
            previewEl.dataset.raw = rawText;
            previewEl.innerHTML = renderPreviewHtml(rawText);
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
      toggleBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        dropdown?.classList.toggle('hidden');
      });

      // Emoji quick-insert: insert at cursor then close dropdown
      wrapper.querySelectorAll('[data-insert]').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          dropdown?.classList.add('hidden');
          if (!ta) return;
          const text = (btn as HTMLElement).dataset.insert!;
          const start = ta.selectionStart ?? ta.value.length;
          const end = ta.selectionEnd ?? ta.value.length;
          ta.value = ta.value.slice(0, start) + text + ta.value.slice(end);
          ta.selectionStart = ta.selectionEnd = start + text.length;
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
