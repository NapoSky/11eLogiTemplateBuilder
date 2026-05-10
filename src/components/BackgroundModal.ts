import { store } from '../store';
import { TemplateBackground, BackgroundPreset, isValidBackground } from '../types';
import { getBaseUrl } from '../config';

const OPEN_EVENT = 'open-background-modal';
const BASE_URL = getBaseUrl();
const UPLOAD_WARN_BYTES = 2 * 1024 * 1024; // 2 MB

type Tab = 'color' | 'preset' | 'upload' | 'url';

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

function presetUrl(path: string): string {
  return new URL(`${BASE_URL}${path.replace(/^\//, '')}`, window.location.href).href;
}

export class BackgroundModal {
  private container: HTMLElement | null = null;
  private isOpen = false;
  private tab: Tab = 'color';
  private draft: TemplateBackground = store.background;
  private keydownHandler: ((e: KeyboardEvent) => void) | null = null;

  mount(container: HTMLElement): void {
    this.container = container;
    window.addEventListener(OPEN_EVENT, () => this.open());
  }

  private open(): void {
    if (!this.container) return;
    this.isOpen = true;
    this.draft = store.background;
    this.tab = this.draft.kind === 'color'
      ? 'color'
      : this.draft.kind === 'preset' ? 'preset'
      : this.draft.kind === 'upload' ? 'upload' : 'url';
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

  private render(): void {
    if (!this.container) return;

    const presets = store.backgroundPresets;
    const tabBtn = (id: Tab, label: string): string =>
      `<button data-tab="${id}" class="px-3 py-1.5 rounded text-sm ${this.tab === id ? 'bg-blue-600 text-white' : 'bg-gray-700 hover:bg-gray-600 text-gray-200'}">${label}</button>`;

    this.container.innerHTML = `
      <div id="bg-modal-backdrop" class="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div class="bg-gray-800 rounded-lg shadow-xl p-6 w-[700px] max-w-[95vw] max-h-[90vh] flex flex-col">
          <div class="flex items-center justify-between mb-4">
            <h2 class="text-lg font-semibold">Fond du template</h2>
            <button id="bg-modal-close" class="text-gray-400 hover:text-white" title="Fermer">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
              </svg>
            </button>
          </div>

          <!-- Aperçu -->
          <div class="mb-3">
            <div class="text-xs text-gray-400 mb-1">Aperçu</div>
            <div id="bg-preview" class="w-full h-32 rounded border border-gray-700" style="${this.previewStyle()}"></div>
          </div>

          <!-- Onglets -->
          <div class="flex gap-2 mb-3">
            ${tabBtn('color', '🎨 Couleur')}
            ${tabBtn('preset', '🖼️ Preset')}
            ${tabBtn('upload', '⬆️ Upload')}
            ${tabBtn('url', '🔗 URL')}
          </div>

          <div class="flex-1 min-h-[180px] overflow-auto">
            ${this.renderTabContent(presets)}
          </div>

          <div class="flex justify-end gap-2 mt-4">
            <button id="bg-modal-cancel" class="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded text-sm">Annuler</button>
            <button id="bg-modal-apply" class="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 rounded text-sm">Appliquer</button>
          </div>
        </div>
      </div>
    `;

    this.attachEvents();
  }

  private getDraftFillColor(): string {
    if (this.draft.kind !== 'color') return this.draft.fillColor ?? '#1b2a38';
    return '#1b2a38';
  }

  private setDraftFillColor(color: string): void {
    if (this.draft.kind === 'preset') {
      this.draft = { ...this.draft, fillColor: color };
    } else if (this.draft.kind === 'upload') {
      this.draft = { ...this.draft, fillColor: color };
    } else if (this.draft.kind === 'url') {
      this.draft = { ...this.draft, fillColor: color };
    }
  }

  private previewStyle(): string {
    const bg = this.draft;
    const fill = this.getDraftFillColor();
    const base = `background-size:contain;background-repeat:no-repeat;background-position:center;background-color:${fill};`;
    switch (bg.kind) {
      case 'color': return `background-color:${bg.color};`;
      case 'preset': return `${base}background-image:url("${presetUrl(bg.path)}");`;
      case 'upload': return `${base}background-image:url("${bg.dataUrl}");`;
      case 'url': return `${base}background-image:url("${bg.url}");`;
    }
  }

  private renderTabContent(presets: BackgroundPreset[]): string {
    const draftColor = this.draft.kind === 'color' ? this.draft.color : '#1b2a38';
    const draftUrl = this.draft.kind === 'url' ? this.draft.url : '';
    const fillColor = this.getDraftFillColor();

    const fillRow = `
      <div class="flex items-center gap-3 mt-3 pt-3 border-t border-gray-700">
        <span class="text-xs text-gray-400 shrink-0">Couleur de fond :</span>
        <input id="bg-fill-picker" type="color" value="${escapeHtml(fillColor)}" class="w-10 h-8 rounded cursor-pointer bg-gray-900 border border-gray-700"/>
        <input id="bg-fill-hex" type="text" value="${escapeHtml(fillColor)}" maxlength="7" class="w-24 bg-gray-900 border border-gray-700 rounded px-2 py-1 text-xs font-mono"/>
        <span class="text-xs text-gray-500">Visible autour de l'image si elle ne remplit pas tout l'espace.</span>
      </div>
    `;

    switch (this.tab) {
      case 'color':
        return `
          <div class="space-y-3">
            <label class="block text-sm text-gray-300">Couleur unie</label>
            <div class="flex items-center gap-3">
              <input id="bg-color-picker" type="color" value="${escapeHtml(draftColor)}" class="w-16 h-10 rounded cursor-pointer bg-gray-900 border border-gray-700"/>
              <input id="bg-color-hex" type="text" value="${escapeHtml(draftColor)}" maxlength="7" class="w-32 bg-gray-900 border border-gray-700 rounded px-2 py-1 text-sm font-mono"/>
              <span class="text-xs text-gray-500">Défaut : <code>#1b2a38</code> (bleu)</span>
            </div>
          </div>
        `;
      case 'preset':
        if (presets.length === 0) {
          return `<p class="text-sm text-gray-400">Aucun preset disponible. Vérifiez <code>public/assets/backgrounds/manifest.json</code>.</p>`;
        }
        return `
          <div class="space-y-2">
            <div class="grid grid-cols-3 gap-3">
              ${presets.map(p => {
                const selected = this.draft.kind === 'preset' && this.draft.path === p.path;
                return `
                  <button data-preset-path="${escapeHtml(p.path)}" class="bg-preset-btn text-left rounded border ${selected ? 'border-blue-500 ring-2 ring-blue-500' : 'border-gray-700 hover:border-gray-500'} p-2 bg-gray-900">
                    <div class="w-full h-20 rounded mb-2" style="background:url('${presetUrl(p.path)}') center/contain no-repeat ${escapeHtml(fillColor)};"></div>
                    <div class="text-xs text-gray-200 truncate">${escapeHtml(p.name)}</div>
                  </button>
                `;
              }).join('')}
            </div>
            ${fillRow}
          </div>
        `;
      case 'upload':
        return `
          <div class="space-y-3">
            <label class="block text-sm text-gray-300">Importer une image locale</label>
            <input id="bg-upload-input" type="file" accept="image/*" class="block text-sm text-gray-300 file:mr-3 file:py-1 file:px-3 file:rounded file:border-0 file:bg-blue-600 file:text-white hover:file:bg-blue-700"/>
            <p class="text-xs text-gray-500">L'image est encodée en base64 et embarquée dans le template JSON exporté (template autonome). Avertissement au-delà de 2 Mo.</p>
            <div id="bg-upload-status" class="text-xs"></div>
            ${fillRow}
          </div>
        `;
      case 'url':
        return `
          <div class="space-y-3">
            <label class="block text-sm text-gray-300">URL externe (http/https)</label>
            <input id="bg-url-input" type="url" value="${escapeHtml(draftUrl)}" placeholder="https://example.com/fond.png" class="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-sm"/>
            <p class="text-xs text-amber-400">⚠️ L'export PNG peut échouer si le serveur ne renvoie pas l'en-tête CORS <code>Access-Control-Allow-Origin</code>.</p>
            ${fillRow}
          </div>
        `;
    }
  }

  private attachEvents(): void {
    if (!this.container) return;

    this.container.querySelector('#bg-modal-close')?.addEventListener('click', () => this.close());
    this.container.querySelector('#bg-modal-cancel')?.addEventListener('click', () => this.close());
    this.container.querySelector('#bg-modal-backdrop')?.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).id === 'bg-modal-backdrop') this.close();
    });

    this.container.querySelectorAll<HTMLElement>('[data-tab]').forEach(btn => {
      btn.addEventListener('click', () => {
        const newTab = btn.dataset.tab as Tab;
        this.tab = newTab;
        // Sync draft kind to the selected tab so Apply always applies the correct type
        // Preserve fillColor when moving between image-based tabs
        const prevFill = this.draft.kind !== 'color' ? this.draft.fillColor : undefined;
        if (this.draft.kind !== newTab) {
          switch (newTab) {
            case 'color':
              this.draft = { kind: 'color', color: '#1b2a38' };
              break;
            case 'preset': {
              const first = store.backgroundPresets[0];
              if (first) this.draft = { kind: 'preset', path: first.path, fillColor: prevFill };
              break;
            }
            case 'upload':
              // Keep draft only if already an upload; otherwise user must pick a file
              if (this.draft.kind !== 'upload') this.draft = { kind: 'upload', dataUrl: '', fillColor: prevFill };
              break;
            case 'url':
              this.draft = { kind: 'url', url: this.draft.kind === 'url' ? this.draft.url : '', fillColor: prevFill };
              break;
          }
        }
        this.render();
      });
    });

    // Color tab
    const colorPicker = this.container.querySelector('#bg-color-picker') as HTMLInputElement | null;
    const colorHex = this.container.querySelector('#bg-color-hex') as HTMLInputElement | null;
    colorPicker?.addEventListener('input', () => {
      const v = colorPicker.value;
      this.draft = { kind: 'color', color: v };
      if (colorHex) colorHex.value = v;
      this.refreshPreview();
    });
    colorHex?.addEventListener('input', () => {
      const v = colorHex.value.trim();
      if (/^#[0-9a-fA-F]{6}$/.test(v)) {
        this.draft = { kind: 'color', color: v };
        if (colorPicker) colorPicker.value = v;
        this.refreshPreview();
      }
    });

    // Preset tab
    this.container.querySelectorAll<HTMLElement>('.bg-preset-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const path = btn.dataset.presetPath;
        if (!path) return;
        // Preserve fillColor when changing preset selection
        const prevFill = this.draft.kind === 'preset' ? this.draft.fillColor : undefined;
        this.draft = { kind: 'preset', path, fillColor: prevFill };
        this.render(); // re-render to highlight selection
      });
    });

    // Fill color (preset / upload / url tabs)
    const fillPicker = this.container.querySelector('#bg-fill-picker') as HTMLInputElement | null;
    const fillHex = this.container.querySelector('#bg-fill-hex') as HTMLInputElement | null;
    fillPicker?.addEventListener('input', () => {
      this.setDraftFillColor(fillPicker.value);
      if (fillHex) fillHex.value = fillPicker.value;
      this.refreshPreview();
    });
    fillHex?.addEventListener('input', () => {
      const v = fillHex.value.trim();
      if (/^#[0-9a-fA-F]{6}$/.test(v)) {
        this.setDraftFillColor(v);
        if (fillPicker) fillPicker.value = v;
        this.refreshPreview();
      }
    });

    // Upload tab
    const uploadInput = this.container.querySelector('#bg-upload-input') as HTMLInputElement | null;
    uploadInput?.addEventListener('change', () => {
      const file = uploadInput.files?.[0];
      if (!file) return;
      const status = this.container?.querySelector('#bg-upload-status') as HTMLElement | null;
      if (status) {
        status.textContent = file.size > UPLOAD_WARN_BYTES
          ? `⚠️ Fichier volumineux (${(file.size / 1024 / 1024).toFixed(1)} Mo) — risque de saturation localStorage.`
          : `OK (${(file.size / 1024).toFixed(0)} Ko)`;
        status.className = file.size > UPLOAD_WARN_BYTES ? 'text-xs text-amber-400' : 'text-xs text-green-400';
      }
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = String(reader.result || '');
        if (!dataUrl.startsWith('data:')) return;
        this.draft = { kind: 'upload', dataUrl, name: file.name };
        this.refreshPreview();
      };
      reader.readAsDataURL(file);
    });

    // URL tab
    const urlInput = this.container.querySelector('#bg-url-input') as HTMLInputElement | null;
    urlInput?.addEventListener('input', () => {
      const v = urlInput.value.trim();
      if (/^https?:\/\//i.test(v)) {
        this.draft = { kind: 'url', url: v };
        this.refreshPreview();
      }
    });

    // Apply
    this.container.querySelector('#bg-modal-apply')?.addEventListener('click', () => {
      if (!isValidBackground(this.draft)) {
        alert('Configuration invalide.');
        return;
      }
      store.setBackground(this.draft);
      this.close();
    });
  }

  private refreshPreview(): void {
    const preview = this.container?.querySelector('#bg-preview') as HTMLElement | null;
    if (preview) preview.setAttribute('style', this.previewStyle());
  }
}
