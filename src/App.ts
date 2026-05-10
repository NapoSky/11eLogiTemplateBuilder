import { store } from './store';
import { IconSidebar } from './components/IconSidebar';
import { Canvas } from './components/Canvas';
import { Toolbar } from './components/Toolbar';
import { SectionModal } from './components/SectionModal';
import { IconContextMenu } from './components/IconContextMenu';
import { PreviewPanel } from './components/PreviewPanel';
import { TodoListView } from './components/TodoListView';
import { loadIcons, loadSubtypes } from './services/iconLoader';
import { loadMpfData } from './services/mpfDataLoader';

export class App {
  private container: HTMLElement | null = null;
  private sidebar: IconSidebar;
  private canvas: Canvas;
  private todolistView: TodoListView;
  private toolbar: Toolbar;
  private modal: SectionModal;
  private contextMenu: IconContextMenu;
  private previewPanel: PreviewPanel;
  private currentMode: 'template' | 'todolist' = 'template';

  constructor() {
    this.sidebar = new IconSidebar();
    this.canvas = new Canvas();
    this.todolistView = new TodoListView();
    this.toolbar = new Toolbar();
    this.modal = new SectionModal();
    this.contextMenu = new IconContextMenu();
    this.previewPanel = new PreviewPanel();
  }

  async mount(container: HTMLElement): Promise<void> {
    this.container = container;

    // Load icons, subtypes and MPF data in parallel
    const [icons, subtypes, mpfData] = await Promise.all([
      loadIcons(),
      loadSubtypes(),
      loadMpfData(),
    ]);
    store.setIcons(icons);
    store.setSubtypes(subtypes);
    store.setMpfData(mpfData);

    // Load saved template + todolist + viewMode
    store.load();

    // Build layout
    this.container.className = 'h-screen flex flex-col bg-gray-900 text-white overflow-hidden';
    this.container.innerHTML = `
      <header id="toolbar" class="shrink-0"></header>
      <main class="flex flex-1 overflow-hidden">
        <aside id="sidebar" class="w-72 shrink-0 border-r border-gray-700 overflow-hidden flex flex-col"></aside>
        <div id="main-view" class="flex-1 overflow-hidden relative"></div>
      </main>
      <div id="modal-container"></div>
      <div id="context-menu-container"></div>
      <div id="preview-panel-container"></div>
    `;

    // Mount persistent components
    this.toolbar.mount(this.container.querySelector('#toolbar')!);
    this.sidebar.mount(this.container.querySelector('#sidebar')!);
    this.modal.mount(this.container.querySelector('#modal-container')!);
    this.contextMenu.mount(this.container.querySelector('#context-menu-container')!);
    this.previewPanel.mount(this.container.querySelector('#preview-panel-container')!);

    // Mount the right view based on initial mode
    this.mountView(null); // null = no previous view to unmount

    // Re-mount when viewMode changes
    this.currentMode = store.viewMode;
    store.subscribe(() => {
      if (store.viewMode !== this.currentMode) {
        const previous = this.currentMode;
        this.currentMode = store.viewMode;
        this.mountView(previous);
      }
    });
  }

  private mountView(previous: 'template' | 'todolist' | null): void {
    const mainView = this.container?.querySelector('#main-view') as HTMLElement | null;
    if (!mainView) return;

    // Unmount previous view cleanly
    if (previous === 'todolist') {
      this.todolistView.unmount();
    } else if (previous === 'template') {
      this.canvas.destroy();
    }

    mainView.innerHTML = '';

    if (store.viewMode === 'todolist') {
      this.todolistView.mount(mainView);
    } else {
      this.canvas.mount(mainView);
    }
  }
}
