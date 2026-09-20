import { store } from '../store';
import { SectionComponent } from './Section';
import { Section, TemplateBackground } from '../types';
import { getBaseUrl } from '../config';

// Obtenir le base path pour les assets
const BASE_URL = getBaseUrl();

// Dimensions canoniques du canvas (format de template). Indépendantes de la résolution
// d'écran : un fit visuel via CSS transform: scale est appliqué pour que le canvas
// rentre intégralement dans #canvas-container. L'export PNG capture toujours 1920x1080.
const CANVAS_LOGICAL_WIDTH = 1920;
const CANVAS_LOGICAL_HEIGHT = 1080;

export class Canvas {
  private container: HTMLElement | null = null;
  private canvas: HTMLElement | null = null;
  private backdrop: HTMLElement | null = null;
  private sectionComponents: Map<string, SectionComponent> = new Map();
  private unsubscribe: (() => void) | null = null;
  private lastIconScale: string = store.iconScale;
  private lastBackgroundKey: string = '';
  private resizeHandler: (() => void) | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private resizeDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private currentScale: number = 1;

  mount(container: HTMLElement): void {
    this.container = container;
    this.container.classList.add('flex', 'items-center', 'justify-center', 'relative');

    // Fond flouté : remplit tout le conteneur en extrapolant le fond du template
    // (couleur ou image), pour qu'un écran plus large que le ratio 16:9 du canvas
    // n'affiche plus le fond brut du site dans les bandes vides (letterboxing).
    // Purement décoratif : jamais capturé par l'export PNG (qui ne clone que #template-canvas).
    this.backdrop = document.createElement('div');
    this.backdrop.id = 'canvas-backdrop';
    this.backdrop.className = 'absolute inset-0 pointer-events-none';
    this.backdrop.style.backgroundSize = 'cover';
    this.backdrop.style.backgroundPosition = 'center';
    this.backdrop.style.backgroundRepeat = 'no-repeat';
    this.backdrop.style.filter = 'blur(60px) brightness(0.55) saturate(1.15)';
    this.backdrop.style.transform = 'scale(1.15)';
    this.container.appendChild(this.backdrop);

    // Create the canvas element
    this.canvas = document.createElement('div');
    this.canvas.id = 'template-canvas';
    this.canvas.className = 'relative';
    this.applyBackground(store.background);
    this.canvas.style.width = `${CANVAS_LOGICAL_WIDTH}px`;
    this.canvas.style.height = `${CANVAS_LOGICAL_HEIGHT}px`;
    this.canvas.style.transformOrigin = 'center center';
    this.canvas.style.flexShrink = '0';
    
    this.container.appendChild(this.canvas);
    
    // Initial render
    this.renderSections();
    
    // Subscribe to store changes
    this.unsubscribe = store.subscribe(() => this.renderSections());
    
    // Fit-to-screen : ajuste le canvas à la taille du conteneur, recalculé au resize.
    // Différé via rAF pour laisser le browser calculer les dimensions du conteneur
    // après insertion dans le DOM (notamment lors du switch de vue TodoList → Template).
    requestAnimationFrame(() => this.applyFitScale());
    this.resizeHandler = () => this.scheduleFitScale();
    window.addEventListener('resize', this.resizeHandler);
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => this.scheduleFitScale());
      this.resizeObserver.observe(this.container);
    }
    
    // Double-click to create section
    this.canvas.addEventListener('dblclick', (e) => {
      if (e.target === this.canvas) {
        const rect = this.canvas!.getBoundingClientRect();
        // rect inclut déjà le scale CSS : on divise par scaleX/scaleY pour obtenir
        // des coordonnées logiques dans le repère 1920x1080.
        const scaleX = parseFloat(this.canvas!.dataset.scaleX || '1') || 1;
        const scaleY = parseFloat(this.canvas!.dataset.scaleY || '1') || 1;
        const x = (e.clientX - rect.left) / scaleX;
        const y = (e.clientY - rect.top) / scaleY;
        window.dispatchEvent(new CustomEvent('open-section-modal', { detail: { x, y } }));
      }
    });
  }

  private scheduleFitScale(): void {
    if (this.resizeDebounceTimer) clearTimeout(this.resizeDebounceTimer);
    this.resizeDebounceTimer = setTimeout(() => this.applyFitScale(), 80);
  }

  private applyFitScale(): void {
    if (!this.container || !this.canvas) return;
    const availW = this.container.clientWidth;
    const availH = this.container.clientHeight;
    if (availW <= 0 || availH <= 0) return;
    // Scale uniforme : on prend le plus petit des deux ratios pour que le canvas
    // tienne entièrement dans le conteneur sans déformation (WYSIWYG avec l'export
    // PNG, qui force toujours 1920x1080). Le conteneur centre le canvas via flex.
    const scaleX = availW / CANVAS_LOGICAL_WIDTH;
    const scaleY = availH / CANVAS_LOGICAL_HEIGHT;
    const scale = Math.min(scaleX, scaleY);
    this.currentScale = scale;
    this.canvas.style.transform = `scale(${scale})`;
    this.canvas.dataset.scale = String(scale);
    this.canvas.dataset.scaleX = String(scale);
    this.canvas.dataset.scaleY = String(scale);
  }

  private renderSections(): void {
    if (!this.canvas) return;

    // Reapply background if it changed in the store
    const bgKey = JSON.stringify(store.background);
    if (bgKey !== this.lastBackgroundKey) {
      this.lastBackgroundKey = bgKey;
      this.applyBackground(store.background);
    }

    // Si iconScale a changé, recréer toutes les sections pour le nouveau sizing
    const iconScaleChanged = this.lastIconScale !== store.iconScale;
    if (iconScaleChanged) {
      this.lastIconScale = store.iconScale;
      // Forcer la destruction et recréation de toutes les sections
      for (const component of this.sectionComponents.values()) {
        component.destroy();
      }
      this.sectionComponents.clear();
    }
    
    const currentIds = new Set(store.sections.map(s => s.id));
    
    // Remove deleted sections
    for (const [id, component] of this.sectionComponents) {
      if (!currentIds.has(id)) {
        component.destroy();
        this.sectionComponents.delete(id);
      }
    }
    
    // Add or update sections
    for (const section of store.sections) {
      if (this.sectionComponents.has(section.id)) {
        this.sectionComponents.get(section.id)!.update(section);
      } else {
        const component = new SectionComponent(
          section,
          (id) => store.deleteSection(id),
          (id) => window.dispatchEvent(new CustomEvent('open-section-modal', { detail: { editId: id } }))
        );
        this.sectionComponents.set(section.id, component);
        this.canvas.appendChild(component.getElement());
      }
    }

    this.updateEmptyStateHint();
  }

  /** Shows a subtle onboarding hint over the canvas when there are no sections yet. */
  private updateEmptyStateHint(): void {
    if (!this.canvas) return;
    let hint = this.canvas.querySelector('#canvas-empty-hint') as HTMLElement | null;
    if (store.sections.length === 0) {
      if (!hint) {
        hint = document.createElement('div');
        hint.id = 'canvas-empty-hint';
        hint.className = 'absolute inset-0 flex items-center justify-center pointer-events-none';
        hint.innerHTML = `
          <p class="text-white/40 text-2xl font-medium text-center px-8" style="text-shadow: 0 2px 6px rgba(0,0,0,0.8);">
            Double-click anywhere to create your first section
          </p>
        `;
        this.canvas.appendChild(hint);
      }
    } else {
      hint?.remove();
    }
  }

  getCanvasElement(): HTMLElement | null {
    return this.canvas;
  }

  /**
   * Apply a background to the canvas. Handles all 4 kinds:
   * - color: solid color, no image
   * - preset: relative path resolved against BASE_URL
   * - upload: data: URL used directly
   * - url: external URL used directly (CORS may affect PNG export)
   */
  private applyBackground(bg: TemplateBackground): void {
    if (!this.canvas) return;
    // Common image properties
    this.canvas.style.backgroundSize = 'contain';
    this.canvas.style.backgroundRepeat = 'no-repeat';
    this.canvas.style.backgroundPosition = 'center';

    switch (bg.kind) {
      case 'color':
        this.canvas.style.backgroundImage = 'none';
        this.canvas.style.backgroundColor = bg.color;
        break;
      case 'preset': {
        this.canvas.style.backgroundColor = bg.fillColor ?? '#1b2a38';
        const cleaned = bg.path.replace(/^\//, '');
        const url = new URL(`${BASE_URL}${cleaned}`, window.location.href).href;
        this.canvas.style.backgroundImage = `url("${url}")`;
        break;
      }
      case 'upload':
        this.canvas.style.backgroundColor = bg.fillColor ?? '#1b2a38';
        this.canvas.style.backgroundImage = `url("${bg.dataUrl}")`;
        break;
      case 'url':
        this.canvas.style.backgroundColor = bg.fillColor ?? '#1b2a38';
        this.canvas.style.backgroundImage = `url("${bg.url}")`;
        break;
    }
    this.lastBackgroundKey = JSON.stringify(bg);

    // Le backdrop reprend exactement la même couleur/image (mais en 'cover' + flou),
    // pour prolonger visuellement le fond du template dans les bandes vides.
    if (this.backdrop) {
      this.backdrop.style.backgroundColor = this.canvas.style.backgroundColor;
      this.backdrop.style.backgroundImage = this.canvas.style.backgroundImage;
    }
  }

  destroy(): void {
    this.unsubscribe?.();
    this.container?.classList.remove('flex', 'items-center', 'justify-center', 'relative');
    this.backdrop?.remove();
    this.backdrop = null;
    if (this.resizeHandler) {
      window.removeEventListener('resize', this.resizeHandler);
      this.resizeHandler = null;
    }
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    if (this.resizeDebounceTimer) {
      clearTimeout(this.resizeDebounceTimer);
      this.resizeDebounceTimer = null;
    }
    for (const component of this.sectionComponents.values()) {
      component.destroy();
    }
    this.sectionComponents.clear();
  }
}
