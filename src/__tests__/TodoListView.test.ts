/**
 * Tests du composant TodoListView
 * Vérifie : mount/render, réactivité au store, unmount,
 * affichage des items et blocs texte, interactions UI.
 */

import { TodoListView } from '../components/TodoListView';
import { store } from '../store';
import { MpfDataEntry } from '../types';

const mpfFixture: MpfDataEntry[] = [
  {
    iconFilename: 'UI/ItemIcons/RifleCItemIcon.png',
    itemName: 'Argenti r.II Rifle',
    itemCategory: 'small_arms',
    faction: ['neutral', 'colonial'],
    cost: { bmat: 100 },
    numberProduced: 20,
    maxCrates: 9,
  },
  {
    iconFilename: 'UI/ItemIcons/MortarItemIcon.png',
    itemName: 'Cremari Mortar',
    itemCategory: 'heavy_arms',
    faction: ['neutral', 'colonial', 'warden'],
    cost: { bmat: 100, rmat: 25 },
    numberProduced: 5,
    maxCrates: 9,
  },
];

function resetStore() {
  store.setMpfData([]);
  store.clearTodoList();
  store.setTodoListFaction('all');
  store.setTodoListTitle('TODOLIST');
  store.setTodoListAutoDate(true);
}

let currentView: TodoListView | null = null;

beforeEach(() => {
  resetStore();
  localStorage.clear();
});

afterEach(() => {
  currentView?.unmount();
  currentView = null;
  document.body.innerHTML = '';
  jest.restoreAllMocks();
});

function mountView(): { container: HTMLElement; view: TodoListView } {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const view = new TodoListView();
  view.mount(container);
  currentView = view;
  return { container, view };
}

// ============================================================
// Rendu initial
// ============================================================

describe('TodoListView – rendu initial', () => {
  test('mount rend la zone de drop', () => {
    const { container } = mountView();
    expect(container.querySelector('#todolist-dropzone')).toBeTruthy();
  });

  test('le champ titre est présent avec la valeur du store', () => {
    store.setTodoListTitle('Ma Liste');
    const { container } = mountView();
    const titleInput = container.querySelector('#tl-title') as HTMLInputElement;
    expect(titleInput).toBeTruthy();
    expect(titleInput.value).toBe('Ma Liste');
  });

  test('le sélecteur de faction est présent', () => {
    const { container } = mountView();
    expect(container.querySelector('#tl-faction')).toBeTruthy();
  });

  test('le message placeholder est affiché quand la liste est vide', () => {
    const { container } = mountView();
    expect(container.textContent).toMatch(/No items|Drag an icon/i);
  });

  test('le panneau de prévisualisation Discord est présent', () => {
    const { container } = mountView();
    expect(container.querySelector('#tl-preview')).toBeTruthy();
  });

  test('les boutons Copy et Download sont présents', () => {
    const { container } = mountView();
    expect(container.querySelector('#tl-copy')).toBeTruthy();
    expect(container.querySelector('#tl-download')).toBeTruthy();
  });
});

// ============================================================
// Réactivité au store
// ============================================================

describe('TodoListView – réactivité', () => {
  test('un changement de titre dans le store re-render la vue', () => {
    const { container } = mountView();
    store.setTodoListTitle('NOUVELLE LISTE');
    const titleInput = container.querySelector('#tl-title') as HTMLInputElement;
    expect(titleInput.value).toBe('NOUVELLE LISTE');
  });

  test('un item ajouté au store est visible dans la liste', () => {
    store.setMpfData(mpfFixture);
    const { container } = mountView();

    store.addTodoListItemFromIcon('UI/ItemIcons/RifleCItemIcon.png');

    const items = container.querySelectorAll('li[data-item-id]');
    expect(items.length).toBeGreaterThan(0);
    const itemText = Array.from(items).map(li => li.textContent).join(' ');
    expect(itemText).toContain('Argenti r.II Rifle');
  });

  test('un item supprimé disparaît de la vue', () => {
    store.setMpfData(mpfFixture);
    const { container } = mountView();

    store.addTodoListItemFromIcon('UI/ItemIcons/RifleCItemIcon.png');
    const id = store.todolist.items[0].id;
    store.removeTodoListItem(id);

    const items = container.querySelectorAll('li[data-item-id]');
    expect(items.length).toBe(0);
  });

  test('le grand total est mis à jour après ajout d\'un item', () => {
    store.setMpfData(mpfFixture);
    const { container } = mountView();

    store.addTodoListItemFromIcon('UI/ItemIcons/RifleCItemIcon.png');

    // Trouver le div de résumé qui contient "item(s)"
    const summaryDivs = Array.from(container.querySelectorAll('.text-xs.text-gray-500'));
    const summary = summaryDivs.find(el => el.textContent?.includes('item(s)'));
    expect(summary?.textContent).toContain('Bmat');
  });
});

// ============================================================
// Groupement par catégorie
// ============================================================

describe('TodoListView – groupement par catégorie', () => {
  test('les items sont groupés par leur catégorie MPF', () => {
    store.setMpfData(mpfFixture);
    const { container } = mountView();

    store.addTodoListItemFromIcon('UI/ItemIcons/RifleCItemIcon.png');   // small_arms
    store.addTodoListItemFromIcon('UI/ItemIcons/MortarItemIcon.png'); // heavy_arms

    const sections = container.querySelectorAll('section.bg-gray-800');
    expect(sections.length).toBeGreaterThanOrEqual(2);

    const headers = Array.from(sections).map(s => s.querySelector('header')?.textContent ?? '');
    const hasSmall = headers.some(h => /small arms/i.test(h));
    const hasHeavy = headers.some(h => /heavy arms/i.test(h));
    expect(hasSmall).toBe(true);
    expect(hasHeavy).toBe(true);
  });
});

// ============================================================
// Interactions UI
// ============================================================

describe('TodoListView – interactions UI', () => {
  test('changement du titre via l\'input met à jour le store (blur)', () => {
    const { container } = mountView();
    const titleInput = container.querySelector('#tl-title') as HTMLInputElement;
    titleInput.value = 'Nouvelle Valeur';
    titleInput.dispatchEvent(new Event('blur'));
    expect(store.todolist.title).toBe('Nouvelle Valeur');
  });

  test('changement du titre via l\'input met à jour le store (change)', () => {
    const { container } = mountView();
    const titleInput = container.querySelector('#tl-title') as HTMLInputElement;
    titleInput.value = 'Via Change';
    titleInput.dispatchEvent(new Event('change'));
    expect(store.todolist.title).toBe('Via Change');
  });

  test('changement de faction met à jour le store', () => {
    const { container } = mountView();
    const factionSelect = container.querySelector('#tl-faction') as HTMLSelectElement;
    factionSelect.value = 'colonial';
    factionSelect.dispatchEvent(new Event('change'));
    expect(store.todolist.faction).toBe('colonial');
  });

  test('changement d\'autoDate met à jour le store', () => {
    store.setTodoListAutoDate(true);
    const { container } = mountView();
    const autoDate = container.querySelector('#tl-autodate') as HTMLInputElement;
    autoDate.checked = false;
    autoDate.dispatchEvent(new Event('change'));
    expect(store.todolist.autoDate).toBe(false);
  });

  test('bouton delete d\'un item appelle store.removeTodoListItem', () => {
    store.setMpfData(mpfFixture);
    const { container } = mountView();
    store.addTodoListItemFromIcon('UI/ItemIcons/RifleCItemIcon.png');

    const deleteBtn = container.querySelector('[data-action="delete"]') as HTMLButtonElement;
    expect(deleteBtn).toBeTruthy();
    deleteBtn.click();

    expect(store.todolist.items.length).toBe(0);
  });

  test('compteur d\'ordre met à jour le store', () => {
    store.setMpfData(mpfFixture);
    const { container } = mountView();
    store.addTodoListItemFromIcon('UI/ItemIcons/RifleCItemIcon.png');

    const countInput = container.querySelector('[data-action="set-count"]') as HTMLInputElement;
    expect(countInput).toBeTruthy();
    countInput.value = '5';
    countInput.dispatchEvent(new Event('change'));
    expect(store.todolist.items[0].orderCount).toBe(5);
  });
});

// ============================================================
// Blocs texte
// ============================================================

describe('TodoListView – blocs texte', () => {
  test('un bloc texte ajouté via le store est visible', () => {
    const { container } = mountView();
    store.addTextBlock({ kind: 'top' });

    const blocks = container.querySelectorAll('[data-block-id]');
    expect(blocks.length).toBeGreaterThan(0);
  });

  test('la textarea du bloc texte est modifiable et commit sur change', () => {
    const { container } = mountView();
    store.addTextBlock({ kind: 'top' });
    const blockId = store.todolist.textBlocks[0].id;

    const ta = container.querySelector('textarea[data-action="set-content"]') as HTMLTextAreaElement;
    expect(ta).toBeTruthy();
    ta.value = 'Mon texte libre';
    ta.dispatchEvent(new Event('change'));
    expect(store.todolist.textBlocks.find(b => b.id === blockId)?.content).toBe('Mon texte libre');
  });

  test('le bouton delete d\'un bloc texte supprime le bloc', () => {
    const { container } = mountView();
    store.addTextBlock({ kind: 'top' });
    expect(store.todolist.textBlocks.length).toBe(1);

    const deleteBtn = container.querySelector('[data-action="delete-block"]') as HTMLButtonElement;
    expect(deleteBtn).toBeTruthy();
    deleteBtn.click();
    expect(store.todolist.textBlocks.length).toBe(0);
  });
});

// ============================================================
// unmount
// ============================================================

describe('TodoListView – unmount', () => {
  test('unmount vide le container', () => {
    const { container, view } = mountView();
    expect(container.innerHTML).not.toBe('');
    view.unmount();
    expect(container.innerHTML).toBe('');
  });

  test('unmount se désabonne du store (pas de re-render après)', () => {
    const { container, view } = mountView();
    view.unmount();
    const prevHtml = container.innerHTML;
    store.setTodoListTitle('Post Unmount');
    expect(container.innerHTML).toBe(prevHtml);
  });
});

// ============================================================
// Warning de faction
// ============================================================

describe('TodoListView – avertissement de faction', () => {
  test('un item de la faction opposée affiche un badge ⚠️', () => {
    // Item purement colonial (sans 'neutral') pour déclencher le warning en mode warden
    const pureColonialMpf: MpfDataEntry[] = [{
      iconFilename: 'UI/ItemIcons/ColonialOnlyItem.png',
      itemName: 'Colonial Only Item',
      itemCategory: 'small_arms',
      faction: ['colonial'], // pas de 'neutral'
      cost: { bmat: 50 },
      numberProduced: 10,
      maxCrates: 9,
    }];
    store.setMpfData(pureColonialMpf);
    store.setTodoListFaction('all'); // ajouter avec 'all' pour bypasser le filtre

    const { container } = mountView();

    store.addTodoListItemFromIcon('UI/ItemIcons/ColonialOnlyItem.png'); // ajouté
    store.setTodoListFaction('warden'); // passer en warden → warning

    const warning = container.querySelector('[title*="faction"]');
    expect(warning).toBeTruthy();
  });
});
