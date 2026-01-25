import { store } from './store';
import { IconSidebar } from './components/IconSidebar';
import { Canvas } from './components/Canvas';
import { Toolbar } from './components/Toolbar';
import { SectionModal } from './components/SectionModal';
import { IconContextMenu } from './components/IconContextMenu';
import { PreviewPanel } from './components/PreviewPanel';
import { loadIcons, loadSubtypes } from './services/iconLoader';

export class App {
  private container: HTMLElement | null = null;
  private sidebar: IconSidebar;
  private canvas: Canvas;
  private toolbar: Toolbar;
  private modal: SectionModal;
  private contextMenu: IconContextMenu;
  private previewPanel: PreviewPanel;

  constructor() {
    this.sidebar = new IconSidebar();
    this.canvas = new Canvas();
    this.toolbar = new Toolbar();
    this.modal = new SectionModal();
    this.contextMenu = new IconContextMenu();
    this.previewPanel = new PreviewPanel();
  }

  async mount(container: HTMLElement): Promise<void> {
    this.container = container;
    
    // Load icons and subtypes from JSON
    const [icons, subtypes] = await Promise.all([loadIcons(), loadSubtypes()]);
    store.setIcons(icons);
    store.setSubtypes(subtypes);
    
    // Load saved template
    store.load();
    
    // Build layout
    this.container.className = 'h-screen flex flex-col bg-gray-900 text-white overflow-hidden';
    this.container.innerHTML = `
      <header id="toolbar" class="shrink-0"></header>
      <main class="flex flex-1 overflow-hidden">
        <aside id="sidebar" class="w-72 shrink-0 border-r border-gray-700 overflow-hidden flex flex-col"></aside>
        <div id="canvas-container" class="flex-1 overflow-auto relative"></div>
      </main>
      <div id="modal-container"></div>
      <div id="context-menu-container"></div>
      <div id="preview-panel-container"></div>
    `;
    
    // Mount components
    this.toolbar.mount(this.container.querySelector('#toolbar')!);
    this.sidebar.mount(this.container.querySelector('#sidebar')!);
    this.canvas.mount(this.container.querySelector('#canvas-container')!);
    this.modal.mount(this.container.querySelector('#modal-container')!);
    this.contextMenu.mount(this.container.querySelector('#context-menu-container')!);
    this.previewPanel.mount(this.container.querySelector('#preview-panel-container')!);
  }
}
