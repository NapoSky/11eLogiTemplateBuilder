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
    
    // Create the canvas element
    this.canvas = document.createElement('div');
    this.canvas.id = 'template-canvas';
    this.canvas.className = 'relative';
    this.applyBackground(store.background);
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
    // Scale non-uniforme : on remplit toute la place dispo (largeur ET hauteur).
    // L'export PNG via html2canvas force 1920x1080 sur un clone avec transform:none,
    // donc l'aperçu à l'écran peut être légèrement déformé sans affecter l'export.
    const scaleX = availW / CANVAS_LOGICAL_WIDTH;
    const scaleY = availH / CANVAS_LOGICAL_HEIGHT;
    // currentScale est utilisé par les enfants (drag/resize) pour compenser les
    // deltas pixel : on expose la moyenne géométrique comme approximation.
    this.currentScale = Math.sqrt(scaleX * scaleY);
    this.canvas.style.transform = `scale(${scaleX}, ${scaleY})`;
    this.canvas.dataset.scale = String(this.currentScale);
    this.canvas.dataset.scaleX = String(scaleX);
    this.canvas.dataset.scaleY = String(scaleY);
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
