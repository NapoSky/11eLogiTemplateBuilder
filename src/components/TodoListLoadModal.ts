import { store } from '../store';
import { parseTodoList } from '../services/todoListParser';

const OPEN_EVENT = 'open-tl-load-modal';

export class TodoListLoadModal {
  private container: HTMLElement | null = null;
  private isOpen = false;
  private keydownHandler: ((e: KeyboardEvent) => void) | null = null;

  mount(container: HTMLElement): void {
    this.container = container;

    window.addEventListener(OPEN_EVENT, () => this.open());
  }

  private open(): void {
    if (!this.container) return;
    this.isOpen = true;
    this.render('');
    this.attachEvents();
    this.keydownHandler = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && this.isOpen) this.close();
    };
    window.addEventListener('keydown', this.keydownHandler);
    // Focus textarea
    requestAnimationFrame(() => {
      const ta = this.container?.querySelector('#tl-load-input') as HTMLTextAreaElement | null;
      ta?.focus();
    });
  }

  private close(): void {
    if (!this.container) return;
    this.isOpen = false;
    this.container.innerHTML = '';
    if (this.keydownHandler) {
      window.removeEventListener('keydown', this.keydownHandler);
      this.keydownHandler = null;
    }
  }

  private render(warningsHtml: string): void {
    if (!this.container) return;

    this.container.innerHTML = `
      <div id="tl-load-backdrop" class="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div class="bg-gray-800 rounded-lg shadow-xl p-6 w-[700px] max-w-[95vw] max-h-[90vh] flex flex-col" id="tl-load-content">
          <div class="flex items-center justify-between mb-4">
            <h2 class="text-lg font-semibold">Importer une todolist</h2>
            <button id="tl-load-close" class="text-gray-400 hover:text-white" title="Fermer">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
              </svg>
            </button>
          </div>

          <p class="text-xs text-gray-400 mb-2">
            Collez ici le contenu d'une todolist Discord (format export <code>.txt</code>).
            Les coûts sont recalculés depuis <code>mpfData.json</code>. La faction courante est conservée.
          </p>

          <textarea
            id="tl-load-input"
            class="flex-1 min-h-[280px] w-full bg-gray-900 border border-gray-700 rounded p-3 text-xs font-mono text-gray-200 focus:outline-none focus:border-blue-500"
            placeholder="__**TODOLIST 02/03**__&#10;&#10;__Small arms__&#10;🇦・Argenti r.II Rifle – 100 Bmats (x2)"
          ></textarea>

          <div id="tl-load-warnings" class="mt-3 text-xs text-amber-400 max-h-32 overflow-auto">${warningsHtml}</div>

          <div class="flex justify-end gap-2 mt-4">
            <button id="tl-load-cancel" class="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded text-sm">Annuler</button>
            <button id="tl-load-submit" class="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 rounded text-sm">Importer</button>
          </div>
        </div>
      </div>
    `;
  }

  private attachEvents(): void {
    if (!this.container) return;

    this.container.querySelector('#tl-load-close')?.addEventListener('click', () => this.close());
    this.container.querySelector('#tl-load-cancel')?.addEventListener('click', () => this.close());

    this.container.querySelector('#tl-load-backdrop')?.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).id === 'tl-load-backdrop') this.close();
    });

    this.container.querySelector('#tl-load-submit')?.addEventListener('click', () => this.handleSubmit());
  }

  private handleSubmit(): void {
    if (!this.container) return;
    const ta = this.container.querySelector('#tl-load-input') as HTMLTextAreaElement | null;
    const raw = ta?.value ?? '';
    if (!raw.trim()) {
      this.showWarnings(['Le champ est vide.']);
      return;
    }

    const hasExisting = store.todolist.items.length > 0 || store.todolist.textBlocks.length > 0;
    if (hasExisting && !confirm('Remplacer la todolist actuelle ?')) {
      return;
    }

    const { result, warnings } = parseTodoList(raw, store.mpfData);

    if (result.items.length === 0 && result.textBlocks.length === 0) {
      this.showWarnings(['Aucun item ni bloc texte reconnu. Vérifiez le format.', ...warnings]);
      return;
    }

    store.replaceTodoList(result);

    if (warnings.length > 0) {
      this.showWarnings([
        `Import effectué avec ${warnings.length} avertissement(s) :`,
        ...warnings,
      ]);
      // Leave modal open so the user sees warnings; they can close manually.
    } else {
      this.close();
    }
  }

  private showWarnings(lines: string[]): void {
    if (!this.container) return;
    const box = this.container.querySelector('#tl-load-warnings');
    if (!box) return;
    box.innerHTML = lines.map(l => `<div>${escapeHtml(l)}</div>`).join('');
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}
