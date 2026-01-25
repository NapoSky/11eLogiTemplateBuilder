import { store } from '../store';
import { SectionComponent } from './Section';
import { Section } from '../types';

// Obtenir le base path pour les assets (défini par Vite)
const BASE_URL = import.meta.env.BASE_URL;

export class Canvas {
  private container: HTMLElement | null = null;
  private canvas: HTMLElement | null = null;
  private sectionComponents: Map<string, SectionComponent> = new Map();
  private unsubscribe: (() => void) | null = null;

  mount(container: HTMLElement): void {
    this.container = container;
    
    // Create the canvas element
    this.canvas = document.createElement('div');
    this.canvas.id = 'template-canvas';
    this.canvas.className = 'relative min-w-full min-h-full';
    this.canvas.style.backgroundImage = `url(${BASE_URL}assets/template_background.png)`;
    this.canvas.style.backgroundSize = 'contain';
    this.canvas.style.backgroundRepeat = 'no-repeat';
    this.canvas.style.backgroundPosition = 'center';
    this.canvas.style.width = '1920px';
    this.canvas.style.height = '1080px';
    
    this.container.appendChild(this.canvas);
    
    // Initial render
    this.renderSections();
    
    // Subscribe to store changes
    this.unsubscribe = store.subscribe(() => this.renderSections());
    
    // Double-click to create section
    this.canvas.addEventListener('dblclick', (e) => {
      if (e.target === this.canvas) {
        const rect = this.canvas!.getBoundingClientRect();
        const x = e.clientX - rect.left + this.container!.scrollLeft;
        const y = e.clientY - rect.top + this.container!.scrollTop;
        window.dispatchEvent(new CustomEvent('open-section-modal', { detail: { x, y } }));
      }
    });
  }

  private renderSections(): void {
    if (!this.canvas) return;
    
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
    for (const component of this.sectionComponents.values()) {
      component.destroy();
    }
    this.sectionComponents.clear();
  }
}
