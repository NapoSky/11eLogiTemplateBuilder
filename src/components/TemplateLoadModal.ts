import { store } from '../store';
import { getBaseUrl } from '../config';

const OPEN_EVENT = 'open-template-load-modal';

export class TemplateLoadModal {
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
    this.render();
    this.keydownHandler = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && this.isOpen) this.close();
    };
    window.addEventListener('keydown', this.keydownHandler);
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

  private loadFile(file: File): void {
    const reader = new FileReader();
    reader.onload = () => {
      store.importJSON(reader.result as string);
      this.close();
    };
    reader.readAsText(file);
  }

  private render(): void {
    if (!this.container) return;
    this.container.innerHTML = `
      <div id="tpl-load-modal-backdrop" class="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div class="bg-gray-800 rounded-lg shadow-xl p-6 w-[600px] max-w-[95vw]">
          <!-- Header -->
          <div class="flex items-center justify-between mb-5">
            <h2 class="text-lg font-semibold">Load template</h2>
            <button id="tpl-load-close" class="text-gray-400 hover:text-white transition-colors" title="Close">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
              </svg>
            </button>
          </div>
          <!-- Two panels -->
          <div class="grid grid-cols-2 gap-4">
            <!-- Left: Reference template -->
            <div id="tpl-load-reference" class="flex flex-col items-center justify-center gap-3 p-5 bg-gray-700/50 rounded-lg border border-gray-600 hover:border-blue-500 hover:bg-gray-700 cursor-pointer transition-colors group">
              <svg class="w-10 h-10 text-blue-400 group-hover:text-blue-300 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6H8.5l-1-1H5a2 2 0 00-2 2zm9-13.5V9"/>
              </svg>
              <p class="font-semibold text-sm text-center text-white">11e Brigade<br/>Reference Template</p>
              <p class="text-xs text-gray-400 text-center">Load the official 11e Brigade template</p>
            </div>
            <!-- Right: Custom file (drag & drop) -->
            <div id="tpl-load-dropzone" class="flex flex-col items-center justify-center gap-3 p-5 bg-gray-700/50 rounded-lg border border-dashed border-gray-600 hover:border-gray-400 transition-colors">
              <svg class="w-10 h-10 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/>
              </svg>
              <p class="font-semibold text-sm text-center text-white">Custom file</p>
              <p class="text-xs text-gray-400 text-center">Drag &amp; drop or</p>
              <label class="px-3 py-1.5 bg-gray-600 hover:bg-gray-500 rounded text-sm cursor-pointer transition-colors">
                Browse file
                <input type="file" accept=".json" id="tpl-load-file-input" class="hidden" />
              </label>
            </div>
          </div>
        </div>
      </div>
    `;
    this.attachEvents();
  }

  private attachEvents(): void {
    if (!this.container) return;

    // Close button
    this.container.querySelector('#tpl-load-close')?.addEventListener('click', () => this.close());

    // Backdrop click
    this.container.querySelector('#tpl-load-modal-backdrop')?.addEventListener('click', (e) => {
      if (e.target === this.container!.querySelector('#tpl-load-modal-backdrop')) this.close();
    });

    // Reference template
    this.container.querySelector('#tpl-load-reference')?.addEventListener('click', async () => {
      try {
        const baseUrl = getBaseUrl();
        const res = await fetch(`${baseUrl}referenceTemplate.json`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const text = await res.text();
        store.importJSON(text);
        this.close();
      } catch (e) {
        console.error('TemplateLoadModal: failed to load reference template', e);
      }
    });

    // File input
    this.container.querySelector('#tpl-load-file-input')?.addEventListener('change', (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      this.loadFile(file);
      (e.target as HTMLInputElement).value = '';
    });

    // Drag & drop on dropzone
    const dropzone = this.container.querySelector('#tpl-load-dropzone') as HTMLElement | null;
    dropzone?.addEventListener('dragover', (e) => {
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
      dropzone.classList.add('border-blue-400', 'bg-gray-700');
    });
    dropzone?.addEventListener('dragleave', () => {
      dropzone.classList.remove('border-blue-400', 'bg-gray-700');
    });
    dropzone?.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzone.classList.remove('border-blue-400', 'bg-gray-700');
      const file = e.dataTransfer?.files[0];
      if (file) this.loadFile(file);
    });
  }
}
