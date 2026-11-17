import { generateId } from '../types';
import { inferDepotName, suggestDepotRole, upsertStockpileSnapshot } from '../services/stockpileLogistics';
import type { DepotRole, StockpileSnapshot } from '../services/stockpileLogistics';

type ParsedCsv = Pick<StockpileSnapshot, 'header' | 'items'> & { frenchDetected: boolean };
type Candidate = { snapshot: StockpileSnapshot; selected: boolean; french: boolean };

interface ImportOptions {
  existing: StockpileSnapshot[];
  parse: (text: string) => ParsedCsv;
  knownItemNames: ReadonlySet<string>;
  onImport: (snapshots: StockpileSnapshot[], frenchDetected: boolean) => void;
}

const ROLES: Record<DepotRole, string> = { backline: 'Backline', intermediate: 'Main', front: 'Front' };
const ROLE_BUTTON_COLORS: Record<DepotRole, { selected: string; idle: string }> = {
  backline: { selected: 'bg-lime-900/30 border-lime-700/40 text-lime-400', idle: 'hover:bg-lime-900/20 hover:text-lime-400' },
  intermediate: { selected: 'bg-amber-900/30 border-amber-700/40 text-amber-400', idle: 'hover:bg-amber-900/20 hover:text-amber-400' },
  front: { selected: 'bg-cyan-900/30 border-cyan-700/40 text-cyan-400', idle: 'hover:bg-cyan-900/20 hover:text-cyan-400' },
};
const roleButtonClass = (role: DepotRole, selected: boolean): string =>
  `px-3 py-1.5 rounded border text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white ${selected
    ? `${ROLE_BUTTON_COLORS[role].selected} font-semibold`
    : `bg-gray-900/40 border-gray-600 text-gray-400 ${ROLE_BUTTON_COLORS[role].idle}`}`;
const escapeHtml = (value: string): string => value.replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

function validDate(value: string): boolean {
  if (!/^\d{4}\.\d{2}\.\d{2}-\d{2}\.\d{2}\.\d{2}$/.test(value)) return false;
  const [year, month, day, hour, minute, second] = value.split(/[.\-]/).map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
    && date.getUTCHours() === hour && date.getUTCMinutes() === minute && date.getUTCSeconds() === second;
}

function sameContent(a: StockpileSnapshot, b: StockpileSnapshot): boolean {
  return (a.header || b.header ? a.header?.location === b.header?.location : a.label === b.label) && a.header?.date === b.header?.date
    && a.items.size === b.items.size && [...a.items].every(([name, quantity]) => b.items.get(name) === quantity);
}

/** A temporary import basket. Closing it never changes the loaded stockpiles. */
export class StockpileImportModal {
  private element = document.createElement('div');
  private candidates: Candidate[] = [];
  private roles = new Map<string, DepotRole>();
  private pending = 0;
  private closed = false;
  private replaceMain = false;
  private errors: string[] = [];
  private previousFocus = document.activeElement as HTMLElement | null;

  constructor(private options: ImportOptions) {
    for (const entry of options.existing) this.roles.set(entry.depotName, entry.role);
    this.element.id = 'csv-load-modal';
    this.element.className = 'fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-3';
    this.element.innerHTML = `
      <div role="dialog" aria-modal="true" aria-labelledby="csv-modal-title" class="bg-gray-800 border border-gray-700 rounded-xl shadow-2xl text-white w-full max-w-3xl flex flex-col max-h-[90vh] overflow-y-auto">
        <div class="flex items-center justify-between px-5 py-4 border-b border-gray-700">
          <h2 id="csv-modal-title" class="text-lg font-semibold">Load Stockpile CSV</h2>
          <button id="csv-modal-close" aria-label="Close import" class="px-2 py-1 rounded hover:bg-gray-700">✕</button>
        </div>
        <div class="p-4 border-b border-gray-700 space-y-3" id="csv-modal-dropzone">
          <p class="text-sm text-gray-300">Add several exports, then import them together. Nothing is applied until you click Import.</p>
          <div class="flex flex-wrap gap-2">
            <button id="csv-modal-paste" class="px-3 py-2 bg-blue-600 hover:bg-blue-700 rounded text-sm">Paste from clipboard</button>
            <button id="csv-modal-files" class="px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded text-sm">Add files…</button>
            <input type="file" accept=".csv,.txt" multiple id="csv-modal-file-input" class="hidden" />
          </div>
          <label for="csv-modal-text" class="block text-sm text-gray-300">Paste a CSV here (Ctrl+V), or drop .csv / .txt files into this window</label>
          <textarea id="csv-modal-text" rows="2" class="w-full bg-gray-900 border border-gray-600 rounded p-2 text-sm" placeholder="Keep pasting here to add more stockpiles…" aria-describedby="csv-modal-help"></textarea>
          <div class="flex flex-wrap justify-between gap-2 items-center">
            <p id="csv-modal-help" class="text-xs text-gray-400">Windows: use Win+V here to choose previous copies one at a time.</p>
            <button id="csv-modal-add-text" class="text-sm text-blue-300 hover:underline">Add entered text</button>
          </div>
          <p id="csv-modal-message" role="status" aria-live="polite" class="text-sm text-amber-300"></p>
          <ul id="csv-modal-errors" role="alert" class="text-sm text-red-300 max-h-24 overflow-y-auto list-disc pl-4"></ul>
        </div>
        <div id="csv-modal-list" class="overflow-y-auto flex-1 min-h-0 p-4 space-y-3"></div>
        <div id="csv-modal-main-warning" class="px-4 text-sm text-amber-300"></div>
        <div class="px-4 py-3 border-t border-gray-700 flex flex-wrap items-center gap-3">
          <p id="csv-modal-summary" role="status" class="text-sm text-gray-300 flex-1"></p>
          <button id="csv-modal-clear" class="px-3 py-2 rounded bg-gray-700 hover:bg-gray-600 text-sm">Clear basket</button>
          <button id="csv-modal-import" class="px-3 py-2 rounded bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-semibold"></button>
        </div>
      </div>`;
    document.body.appendChild(this.element);
    this.element.querySelector('#csv-modal-close')!.addEventListener('click', this.close);
    this.element.addEventListener('click', e => { if (e.target === this.element) this.close(); });
    this.element.addEventListener('keydown', this.onKeyDown);
    this.element.addEventListener('paste', e => {
      const target = e.target as HTMLElement;
      if (target.closest('input, [contenteditable="true"]')) return;
      const text = e.clipboardData?.getData('text/plain');
      if (!text) return;
      e.preventDefault();
      this.addText(text, null);
    });
    this.element.querySelector('#csv-modal-paste')!.addEventListener('click', () => { void this.readClipboard(); });
    const input = this.element.querySelector<HTMLInputElement>('#csv-modal-file-input')!;
    this.element.querySelector('#csv-modal-files')!.addEventListener('click', () => input.click());
    input.addEventListener('change', () => {
      const files = [...(input.files ?? [])];
      input.value = '';
      void this.addFiles(files);
    });
    this.element.addEventListener('dragover', e => { e.preventDefault(); });
    this.element.addEventListener('drop', e => {
      e.preventDefault();
      void this.addFiles([...(e.dataTransfer?.files ?? [])]);
    });
    this.element.querySelector('#csv-modal-add-text')!.addEventListener('click', () => {
      const textarea = this.textarea;
      this.addText(textarea.value, null);
      textarea.value = '';
      textarea.focus();
    });
    this.element.querySelector('#csv-modal-clear')!.addEventListener('click', () => {
      this.candidates = [];
      this.roles = new Map(this.options.existing.map(entry => [entry.depotName, entry.role]));
      this.replaceMain = false;
      this.errors = [];
      this.element.querySelector('#csv-modal-errors')!.replaceChildren();
      this.textarea.value = '';
      this.message('Basket cleared. Loaded stockpiles are unchanged.');
      this.renderList();
      this.textarea.focus();
    });
    this.element.querySelector('#csv-modal-import')!.addEventListener('click', () => this.commit());
    this.renderList();
    this.textarea.focus();
  }

  private get textarea(): HTMLTextAreaElement {
    return this.element.querySelector<HTMLTextAreaElement>('#csv-modal-text')!;
  }

  focus(): void { this.textarea.focus(); }

  close = (): void => {
    if (this.closed) return;
    this.closed = true;
    this.element.remove();
    if (this.previousFocus?.isConnected) this.previousFocus.focus();
  };

  private onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); this.close(); }
    if (event.key !== 'Tab') return;
    const controls = [...this.element.querySelectorAll<HTMLElement>('button:not(:disabled), select, textarea, input:not(.hidden):not(:disabled)')];
    const first = controls[0];
    const last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  };

  private message(text: string): void {
    if (!this.closed) this.element.querySelector('#csv-modal-message')!.textContent = text;
  }

  private reportError(text: string): void {
    if (this.closed) return;
    if (!this.errors.includes(text)) this.errors.push(text);
    const list = this.element.querySelector('#csv-modal-errors')!;
    list.innerHTML = this.errors.map(error => `<li>${escapeHtml(error)}</li>`).join('');
  }

  private async readClipboard(): Promise<void> {
    this.pending++;
    this.renderSummary();
    try {
      const text = await navigator.clipboard.readText();
      if (!this.closed) this.addText(text, null);
    } catch {
      this.message('Clipboard access unavailable. Paste with Ctrl+V in the field instead.');
    } finally {
      this.pending--;
      if (!this.closed) { this.renderSummary(); this.textarea.focus(); }
    }
  }

  private async addFiles(files: File[]): Promise<void> {
    if (!files.length) return;
    this.pending++;
    this.renderSummary();
    try {
      for (const file of files) {
        if (this.closed) break;
        if (!/\.(csv|txt)$/i.test(file.name)) { this.reportError(`${file.name}: choose .csv or .txt exports.`); continue; }
        try {
          const buffer = await file.arrayBuffer();
          if (this.closed) break;
          let text: string;
          try { text = new TextDecoder('utf-8', { fatal: true }).decode(buffer); }
          catch { text = new TextDecoder('windows-1252').decode(buffer); }
          this.addText(text, file.name);
        } catch { this.reportError(`Could not read ${file.name}. Other files can still be imported.`); }
      }
    } finally {
      this.pending--;
      if (!this.closed) this.renderSummary();
    }
  }

  private addText(text: string, fileName: string | null): void {
    const { header, items, frenchDetected } = this.options.parse(text);
    const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    const itemLines = header ? lines.slice(1) : lines;
    // The comparison parser is intentionally permissive. Clipboard import must reject unrelated
    // text, malformed quantities and concatenated exports instead of loading a partial snapshot.
    const validItems = itemLines.length > 0 && itemLines.every(line => {
      const comma = line.lastIndexOf(',');
      const quantity = line.slice(comma + 1).trim();
      return comma > 0 && /^\d+$/.test(quantity) && Number.isSafeInteger(Number(quantity));
    });
    const knownItem = [...items.keys()].some(name => this.options.knownItemNames.has(name.replace(/ \(Crate\)$/, '')));
    if (!validItems || !knownItem || ![...items.values()].every(Number.isSafeInteger)
      || (!header && !fileName) || (header && (!header.location || !validDate(header.date)))) {
      this.reportError(`${fileName ? `${fileName}: ` : ''}CSV not recognized. Add one complete Foxhole stockpile export at a time; this entry was not added.`);
      return;
    }
    const label = header?.location ?? fileName ?? `Stockpile ${this.candidates.length + 1}`;
    const loaded = header ? this.options.existing.find(entry => entry.header?.location === header.location) : undefined;
    const depotName = loaded?.depotName ?? inferDepotName(header?.location ?? label);
    if (!this.roles.has(depotName)) this.roles.set(depotName, suggestDepotRole(items));
    const snapshot: StockpileSnapshot = { id: generateId(), header, items, label, depotName, role: this.roles.get(depotName)! };
    const duplicate = this.candidates.find(entry => sameContent(entry.snapshot, snapshot));
    if (duplicate) { this.message('This snapshot is already in the basket.'); return; }
    const previousIndex = header ? this.candidates.findIndex(entry => entry.snapshot.header?.location === header.location) : -1;
    if (previousIndex >= 0) {
      const previousDate = this.candidates[previousIndex].snapshot.header!.date;
      if (previousDate > header!.date) { this.message('An older snapshot was ignored. The newer version stays in the basket.'); return; }
      if (previousDate === header!.date) {
        this.message('Conflicting contents for the same stockpile and date. Remove its row before adding another version.');
        return;
      }
    }
    const identical = loaded && sameContent(loaded, snapshot);
    const older = loaded?.header && validDate(loaded.header.date) && header && header.date < loaded.header.date;
    const conflict = loaded?.header && header && header.date === loaded.header.date && !identical;
    const candidate = { snapshot, selected: !identical && !older && !conflict, french: frenchDetected };
    if (previousIndex >= 0) this.candidates[previousIndex] = candidate;
    else this.candidates.push(candidate);
    this.message(conflict ? 'Different contents for the same loaded snapshot date. Select it explicitly only if you want to replace the loaded version.'
      : older ? 'Older snapshot added but not selected. Select it explicitly only if you want to replace the loaded version.'
      : identical ? 'This snapshot is already loaded.' : previousIndex >= 0 ? 'The newer snapshot replaced the earlier version in the basket.' : 'Snapshot added. You can keep pasting or adding files.');
    this.renderList();
  }

  private selected(): Candidate[] { return this.candidates.filter(entry => entry.selected); }

  private mainConflict(): { multiple: boolean; displaced: string[] } {
    const selectedDepots = new Set(this.selected().map(entry => entry.snapshot.depotName));
    const mains = [...selectedDepots].filter(name => this.roles.get(name) === 'intermediate');
    const displaced = mains.length === 1 ? [...new Set(this.options.existing
      .filter(entry => entry.role === 'intermediate' && entry.depotName !== mains[0]
        && (!selectedDepots.has(entry.depotName) || this.roles.get(entry.depotName) === 'intermediate'))
      .map(entry => entry.depotName))] : [];
    return { multiple: mains.length > 1, displaced };
  }

  private renderSummary(): void {
    if (this.closed) return;
    const count = this.selected().length;
    const conflict = this.mainConflict();
    this.element.querySelector('#csv-modal-summary')!.textContent = this.pending ? 'Reading exports…'
      : `${count} selected / ${this.candidates.length} snapshots`;
    const button = this.element.querySelector<HTMLButtonElement>('#csv-modal-import')!;
    button.textContent = `Import ${count} snapshot${count === 1 ? '' : 's'}`;
    button.disabled = !count || this.pending > 0 || conflict.multiple || (!!conflict.displaced.length && !this.replaceMain);
    this.element.querySelector<HTMLButtonElement>('#csv-modal-clear')!.disabled = this.pending > 0;
  }

  private renderList(): void {
    const list = this.element.querySelector('#csv-modal-list')!;
    const depots = [...new Set(this.candidates.map(entry => entry.snapshot.depotName))];
    list.innerHTML = depots.length ? depots.map((name, groupIndex) => `
      <section class="border border-gray-600 rounded-lg p-3 space-y-2">
        <div class="flex flex-wrap gap-2 items-center justify-between">
          <h3 class="font-semibold break-words">${escapeHtml(name)}</h3>
          <div class="flex flex-wrap gap-2 items-center">
            <span class="text-xs text-gray-400">${this.options.existing.some(entry => entry.depotName === name) ? 'Saved role' : 'Suggested role'}</span>
            <div data-role-group="${groupIndex}" role="group" aria-label="Role for ${escapeHtml(name)}" class="flex flex-wrap gap-1.5">
              ${(Object.entries(ROLES) as [DepotRole, string][]).map(([role, label]) => `<button type="button" data-depot-role="${role}" aria-pressed="${this.roles.get(name) === role}" class="${roleButtonClass(role, this.roles.get(name) === role)}">${label}</button>`).join('')}
            </div>
          </div>
        </div>
        ${this.candidates.map((candidate, index) => {
          const entry = candidate.snapshot;
          if (entry.depotName !== name) return '';
          const loaded = entry.header ? this.options.existing.find(previous => previous.header?.location === entry.header!.location) : undefined;
          const identical = !!loaded && sameContent(loaded, entry);
          const older = loaded?.header && validDate(loaded.header.date) && entry.header && entry.header.date < loaded.header.date;
          const conflict = loaded?.header && entry.header && entry.header.date === loaded.header.date && !identical;
          const status = identical ? 'Already loaded' : older ? 'Older than loaded — select to replace'
            : conflict ? 'Conflicting contents at the same date — select to replace' : loaded ? 'Update' : 'New';
          return `<div class="flex gap-2 items-start border-t border-gray-700 pt-2">
            <input type="checkbox" data-candidate="${index}" id="csv-candidate-${index}" ${candidate.selected ? 'checked' : ''} ${identical ? 'disabled' : ''} class="mt-1" />
            <label for="csv-candidate-${index}" class="flex-1 min-w-0 text-sm break-words">
              <span class="block">${escapeHtml(entry.label)}</span>
              <span class="block text-xs ${older || conflict ? 'text-amber-300' : 'text-gray-400'}">${status} · ${escapeHtml(entry.header?.date ?? 'No recorded date')} · ${entry.items.size} item types</span>
            </label>
            <button data-remove="${index}" aria-label="Remove ${escapeHtml(entry.label)} from basket" class="px-2 text-gray-400 hover:text-red-300">✕</button>
          </div>`;
        }).join('')}
      </section>`).join('') : '<p class="text-sm text-gray-400 text-center py-5">No snapshots added yet.</p>';
    list.querySelectorAll<HTMLInputElement>('[data-candidate]').forEach(input => input.addEventListener('change', () => {
      this.candidates[Number(input.dataset.candidate)].selected = input.checked;
      this.replaceMain = false;
      this.renderMainWarning();
      this.renderSummary();
    }));
    list.querySelectorAll<HTMLButtonElement>('[data-depot-role]').forEach(button => button.addEventListener('click', () => {
      const group = button.closest<HTMLElement>('[data-role-group]')!;
      const role = button.dataset.depotRole as DepotRole;
      this.roles.set(depots[Number(group.dataset.roleGroup)], role);
      group.querySelectorAll<HTMLButtonElement>('[data-depot-role]').forEach(option => {
        const optionRole = option.dataset.depotRole as DepotRole;
        option.setAttribute('aria-pressed', String(optionRole === role));
        option.className = roleButtonClass(optionRole, optionRole === role);
      });
      this.replaceMain = false;
      this.renderMainWarning();
      this.renderSummary();
    }));
    list.querySelectorAll<HTMLButtonElement>('[data-remove]').forEach(button => button.addEventListener('click', () => {
      this.candidates.splice(Number(button.dataset.remove), 1);
      this.replaceMain = false;
      this.renderList();
      this.textarea.focus();
    }));
    this.renderMainWarning();
    this.renderSummary();
  }

  private renderMainWarning(): void {
    const conflict = this.mainConflict();
    const warning = this.element.querySelector('#csv-modal-main-warning')!;
    warning.innerHTML = conflict.multiple ? '<p class="pb-3" role="alert">Only one depot can be Main. Change a role or deselect the other depot before importing.</p>'
      : conflict.displaced.length ? `<label class="flex gap-2 pb-3"><input id="csv-modal-replace-main" type="checkbox" ${this.replaceMain ? 'checked' : ''} />Move the current Main (${escapeHtml(conflict.displaced.join(', '))}) to Backline when importing.</label>` : '';
    warning.querySelector<HTMLInputElement>('input')?.addEventListener('change', event => {
      this.replaceMain = (event.target as HTMLInputElement).checked;
      this.renderSummary();
    });
  }

  private commit(): void {
    const selected = this.selected();
    const conflict = this.mainConflict();
    if (!selected.length || this.pending || conflict.multiple || (conflict.displaced.length && !this.replaceMain)) return;
    const selectedDepots = new Set(selected.map(entry => entry.snapshot.depotName));
    let snapshots = this.options.existing.map(entry => ({
      ...entry,
      role: conflict.displaced.includes(entry.depotName) ? 'backline' as DepotRole
        : selectedDepots.has(entry.depotName) ? this.roles.get(entry.depotName)! : entry.role,
    }));
    for (const candidate of selected) {
      snapshots = upsertStockpileSnapshot(snapshots, { ...candidate.snapshot, role: this.roles.get(candidate.snapshot.depotName)! });
    }
    this.options.onImport(snapshots, selected.some(entry => entry.french));
    this.close();
  }
}
