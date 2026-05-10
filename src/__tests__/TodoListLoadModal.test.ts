/**
 * Tests du composant TodoListLoadModal
 * Vérifie : mount/open via événement, rendu, fermeture, soumission,
 * validation du contenu vide, et affichage des warnings.
 */

import { TodoListLoadModal } from '../components/TodoListLoadModal';
import { store } from '../store';
import { MpfDataEntry } from '../types';

// MPF minimal pour que parseTodoList reconnaisse au moins un item
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
];

function resetStore() {
  store.setMpfData([]);
  store.clearTodoList();
}

beforeEach(() => {
  resetStore();
  localStorage.clear();
});

afterEach(() => {
  document.body.innerHTML = '';
  jest.restoreAllMocks();
});

// Helper
function mountModal(): { container: HTMLElement; modal: TodoListLoadModal } {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const modal = new TodoListLoadModal();
  modal.mount(container);
  return { container, modal };
}

function openModal(): void {
  window.dispatchEvent(new Event('open-tl-load-modal'));
}

// ============================================================
// mount & open
// ============================================================

describe('TodoListLoadModal – mount & open', () => {
  test('le container est vide avant l\'événement', () => {
    const { container } = mountModal();
    expect(container.innerHTML).toBe('');
  });

  test('open-tl-load-modal rend le backdrop et la textarea', () => {
    const { container } = mountModal();
    openModal();
    expect(container.querySelector('#tl-load-backdrop')).toBeTruthy();
    expect(container.querySelector('#tl-load-input')).toBeTruthy();
  });

  test('le bouton Import est présent', () => {
    const { container } = mountModal();
    openModal();
    expect(container.querySelector('#tl-load-submit')).toBeTruthy();
  });

  test('les boutons Cancel et Close sont présents', () => {
    const { container } = mountModal();
    openModal();
    expect(container.querySelector('#tl-load-cancel')).toBeTruthy();
    expect(container.querySelector('#tl-load-close')).toBeTruthy();
  });
});

// ============================================================
// Fermeture
// ============================================================

describe('TodoListLoadModal – fermeture', () => {
  test('bouton Close vide le container', () => {
    const { container } = mountModal();
    openModal();
    (container.querySelector('#tl-load-close') as HTMLButtonElement).click();
    expect(container.innerHTML).toBe('');
  });

  test('bouton Cancel vide le container', () => {
    const { container } = mountModal();
    openModal();
    (container.querySelector('#tl-load-cancel') as HTMLButtonElement).click();
    expect(container.innerHTML).toBe('');
  });

  test('clic sur le backdrop ferme le modal', () => {
    const { container } = mountModal();
    openModal();
    const backdrop = container.querySelector('#tl-load-backdrop') as HTMLElement;
    const event = new MouseEvent('click', { bubbles: true });
    Object.defineProperty(event, 'target', { value: backdrop });
    backdrop.dispatchEvent(event);
    expect(container.innerHTML).toBe('');
  });

  test('touche Escape ferme le modal', () => {
    const { container } = mountModal();
    openModal();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(container.innerHTML).toBe('');
  });

  test('Escape n\'a pas d\'effet si le modal est déjà fermé', () => {
    const { container } = mountModal();
    expect(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    }).not.toThrow();
    expect(container.innerHTML).toBe('');
  });
});

// ============================================================
// Soumission – validation
// ============================================================

describe('TodoListLoadModal – soumission', () => {
  test('soumission avec textarea vide affiche un warning', () => {
    const { container } = mountModal();
    openModal();
    (container.querySelector('#tl-load-submit') as HTMLButtonElement).click();
    const warnings = container.querySelector('#tl-load-warnings');
    expect(warnings?.textContent).toMatch(/empty/i);
  });

  test('soumission avec texte non reconnu affiche un warning', () => {
    store.setMpfData([]);
    const { container } = mountModal();
    openModal();
    const ta = container.querySelector('#tl-load-input') as HTMLTextAreaElement;
    // Un item avec préfixe lettre + séparateur mais aucune entrée MPF reconnue
    ta.value = '__**TODOLIST**__\n\n__Small arms__\nA・Weapon That Does Not Exist 9000 – 50 Bmats\n';
    (container.querySelector('#tl-load-submit') as HTMLButtonElement).click();
    const warnings = container.querySelector('#tl-load-warnings');
    expect(warnings?.textContent).toBeTruthy();
  });

  test('soumission avec données valides met à jour le store et ferme le modal', () => {
    store.setMpfData(mpfFixture);
    // S'assurer que la todolist est vide (pas de confirm() à simuler)
    store.clearTodoList();

    const { container } = mountModal();
    openModal();

    const ta = container.querySelector('#tl-load-input') as HTMLTextAreaElement;
    ta.value = '__**TODOLIST 01/05**__\n\n__Small arms__\n🇦・Argenti r.II Rifle – 100 Bmats (x2)\n';

    (container.querySelector('#tl-load-submit') as HTMLButtonElement).click();

    // Le modal doit être fermé (import sans warnings)
    expect(container.innerHTML).toBe('');
    // Le store doit avoir l'item importé
    expect(store.todolist.items.length).toBeGreaterThan(0);
    expect(store.todolist.items[0].itemName).toBe('Argenti r.II Rifle');
  });

  test('soumission quand todolist non vide demande confirmation puis remplace', () => {
    store.setMpfData(mpfFixture);

    // Pré-remplir la todolist
    store.addTodoListItemFromIcon('UI/ItemIcons/RifleCItemIcon.png');

    // Mocker confirm() pour renvoyer true
    const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(true);

    const { container } = mountModal();
    openModal();

    const ta = container.querySelector('#tl-load-input') as HTMLTextAreaElement;
    ta.value = '__**TODOLIST 01/05**__\n\n__Small arms__\n🇦・Argenti r.II Rifle – 100 Bmats (x2)\n';

    (container.querySelector('#tl-load-submit') as HTMLButtonElement).click();

    expect(confirmSpy).toHaveBeenCalled();
    expect(store.todolist.items.length).toBeGreaterThan(0);
  });

  test('soumission refusée par confirm() laisse la todolist intacte', () => {
    store.setMpfData(mpfFixture);
    store.addTodoListItemFromIcon('UI/ItemIcons/RifleCItemIcon.png');
    const itemsBefore = store.todolist.items.length;

    jest.spyOn(window, 'confirm').mockReturnValue(false);

    const { container } = mountModal();
    openModal();

    const ta = container.querySelector('#tl-load-input') as HTMLTextAreaElement;
    ta.value = '__**TODOLIST 01/05**__\n\n__Small arms__\n🇦・Argenti r.II Rifle – 100 Bmats (x1)\n';

    (container.querySelector('#tl-load-submit') as HTMLButtonElement).click();

    // Rien ne change
    expect(store.todolist.items.length).toBe(itemsBefore);
    // Modal reste ouvert
    expect(container.querySelector('#tl-load-backdrop')).toBeTruthy();
  });
});

// ============================================================
// Réouverture
// ============================================================

describe('TodoListLoadModal – réouverture', () => {
  test('le modal peut être rouvert après fermeture', () => {
    const { container } = mountModal();
    openModal();
    (container.querySelector('#tl-load-close') as HTMLButtonElement).click();
    expect(container.innerHTML).toBe('');
    openModal();
    expect(container.querySelector('#tl-load-backdrop')).toBeTruthy();
  });
});
