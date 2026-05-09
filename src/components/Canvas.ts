import { store } from '../store';
import { SectionComponent } from './Section';
import { Section } from '../types';
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
  private sectionComponents: Map<string, SectionComponent> = new Map();
  private unsubscribe: (() => void) | null = null;
  private lastIconScale: string = store.iconScale;
  private resizeHandler: (() => void) | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private resizeDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private currentScale: number = 1;

  mount(container: HTMLElement): void {
    this.container = container;
    
    // Create the canvas element
    this.canvas = document.createElement('div');
    this.canvas.id = 'template-canvas';
    this.canvas.className = 'relative';
    // URL absolue : html2canvas-pro rend dans un iframe dont le baseURI est about:blank,
    // donc une URL relative (BASE_URL = './' en dev) ne s'y résout pas. En prod
    // (BASE_URL = '/11eLogiTemplateBuilder/'), l'URL est déjà absolue depuis l'origine.
    const bgUrl = new URL(`${BASE_URL}assets/template_background.png`, window.location.href).href;
    this.canvas.style.backgroundImage = `url(${bgUrl})`;
    this.canvas.style.backgroundSize = 'contain';
    this.canvas.style.backgroundRepeat = 'no-repeat';
    this.canvas.style.backgroundPosition = 'center';
    this.canvas.style.width = `${CANVAS_LOGICAL_WIDTH}px`;
    this.canvas.style.height = `${CANVAS_LOGICAL_HEIGHT}px`;
    this.canvas.style.transformOrigin = 'top left';
    this.canvas.style.flexShrink = '0';
    
    this.container.appendChild(this.canvas);
    
    // Initial render
    this.renderSections();
    
    // Subscribe to store changes
    this.unsubscribe = store.subscribe(() => this.renderSections());
    
    // Fit-to-screen : ajuste le canvas à la taille du conteneur, recalculé au resize.
    this.applyFitScale();
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
        // rect inclut déjà le scale CSS : on divise par currentScale pour obtenir
        // des coordonnées logiques dans le repère 1920x1080.
        const scale = this.currentScale || 1;
        const x = (e.clientX - rect.left) / scale;
        const y = (e.clientY - rect.top) / scale;
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
    const scale = Math.min(availW / CANVAS_LOGICAL_WIDTH, availH / CANVAS_LOGICAL_HEIGHT);
    this.currentScale = scale;
    this.canvas.style.transform = `scale(${scale})`;
    // Exposer le scale courant via dataset pour que les composants enfants
    // (drag/resize via interact.js) puissent compenser leurs deltas pixel.
    this.canvas.dataset.scale = String(scale);
  }

  private renderSections(): void {
    if (!this.canvas) return;
    
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
  }

  getCanvasElement(): HTMLElement | null {
    return this.canvas;
  }

  destroy(): void {
    this.unsubscribe?.();
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
