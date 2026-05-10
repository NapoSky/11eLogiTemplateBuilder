/**
 * Tests du composant BackgroundModal
 * Vérifie : mount/open via événement, rendu des onglets,
 * fermeture (bouton, Escape, backdrop), et application du fond.
 */

import { BackgroundModal } from '../components/BackgroundModal';
import { store } from '../store';
import { DEFAULT_BACKGROUND, BackgroundPreset } from '../types';

// ----- Setup store minimal avant chaque test -----
beforeEach(() => {
  store.setBackground(DEFAULT_BACKGROUND);
  store.setBackgroundPresets([]);
  localStorage.clear();
});

afterEach(() => {
  document.body.innerHTML = '';
});

// ----- Helpers -----
function openModal(): void {
  window.dispatchEvent(new Event('open-background-modal'));
}

function mountModal(): { container: HTMLElement; modal: BackgroundModal } {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const modal = new BackgroundModal();
  modal.mount(container);
  return { container, modal };
}

// ============================================================
// mount & open
// ============================================================

describe('BackgroundModal – mount & open', () => {
  test('le container est vide avant l\'événement open', () => {
    const { container } = mountModal();
    expect(container.innerHTML).toBe('');
  });

  test('l\'événement open-background-modal remplit le container', () => {
    const { container } = mountModal();
    openModal();
    expect(container.querySelector('#bg-modal-backdrop')).toBeTruthy();
  });

  test('les 4 onglets sont rendus', () => {
    const { container } = mountModal();
    openModal();
    const tabBtns = container.querySelectorAll('[data-tab]');
    const tabIds = Array.from(tabBtns).map(b => (b as HTMLElement).dataset.tab);
    expect(tabIds).toContain('color');
    expect(tabIds).toContain('preset');
    expect(tabIds).toContain('upload');
    expect(tabIds).toContain('url');
  });

  test('l\'onglet actif au démarrage correspond au kind du fond courant (color)', () => {
    store.setBackground({ kind: 'color', color: '#ff0000' });
    const { container } = mountModal();
    openModal();
    const activeTab = container.querySelector('[data-tab="color"].bg-blue-600');
    expect(activeTab).toBeTruthy();
  });

  test('l\'onglet actif est preset quand le fond est un preset', () => {
    store.setBackgroundPresets([{ name: 'A', path: '/assets/backgrounds/a.png' }]);
    store.setBackground({ kind: 'preset', path: '/assets/backgrounds/a.png' });
    const { container } = mountModal();
    openModal();
    const activeTab = container.querySelector('[data-tab="preset"].bg-blue-600');
    expect(activeTab).toBeTruthy();
  });
});

// ============================================================
// Fermeture
// ============================================================

describe('BackgroundModal – fermeture', () => {
  test('le bouton Close vide le container', () => {
    const { container } = mountModal();
    openModal();
    (container.querySelector('#bg-modal-close') as HTMLButtonElement).click();
    expect(container.innerHTML).toBe('');
  });

  test('le bouton Cancel vide le container', () => {
    const { container } = mountModal();
    openModal();
    (container.querySelector('#bg-modal-cancel') as HTMLButtonElement).click();
    expect(container.innerHTML).toBe('');
  });

  test('un clic sur le backdrop (lui-même) ferme le modal', () => {
    const { container } = mountModal();
    openModal();
    const backdrop = container.querySelector('#bg-modal-backdrop') as HTMLElement;
    // Simuler un clic dont la cible est le backdrop lui-même
    const clickEvent = new MouseEvent('click', { bubbles: true });
    Object.defineProperty(clickEvent, 'target', { value: backdrop });
    backdrop.dispatchEvent(clickEvent);
    expect(container.innerHTML).toBe('');
  });

  test('Escape ferme le modal', () => {
    const { container } = mountModal();
    openModal();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(container.innerHTML).toBe('');
  });

  test('Escape n\'a aucun effet si le modal est fermé', () => {
    const { container } = mountModal();
    // modal déjà fermé : pas d'erreur attendue
    expect(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    }).not.toThrow();
    expect(container.innerHTML).toBe('');
  });
});

// ============================================================
// Onglet couleur
// ============================================================

describe('BackgroundModal – onglet couleur', () => {
  test('le color picker est présent dans l\'onglet color', () => {
    const { container } = mountModal();
    openModal();
    expect(container.querySelector('#bg-color-picker')).toBeTruthy();
    expect(container.querySelector('#bg-color-hex')).toBeTruthy();
  });

  test('Apply sur l\'onglet couleur met à jour store.background', () => {
    const { container } = mountModal();
    openModal();

    // Simuler un changement de couleur via l'input hex
    const hexInput = container.querySelector('#bg-color-hex') as HTMLInputElement;
    hexInput.value = '#abcdef';
    hexInput.dispatchEvent(new Event('input'));

    // Cliquer Apply
    (container.querySelector('#bg-modal-apply') as HTMLButtonElement).click();
    expect(store.background).toEqual({ kind: 'color', color: '#abcdef' });
  });

  test('Apply sans modification conserve la couleur courante', () => {
    store.setBackground({ kind: 'color', color: '#334455' });
    const { container } = mountModal();
    openModal();
    (container.querySelector('#bg-modal-apply') as HTMLButtonElement).click();
    expect((store.background as { kind: string; color: string }).color).toBe('#334455');
  });
});

// ============================================================
// Onglet preset
// ============================================================

describe('BackgroundModal – onglet preset', () => {
  const presets: BackgroundPreset[] = [
    { name: 'Alpha', path: '/assets/backgrounds/alpha.png' },
    { name: 'Beta', path: '/assets/backgrounds/beta.png' },
  ];

  beforeEach(() => {
    store.setBackgroundPresets(presets);
  });

  test('les boutons de preset sont affichés', () => {
    const { container } = mountModal();
    openModal();
    // Passer sur l'onglet preset
    (container.querySelector('[data-tab="preset"]') as HTMLButtonElement).click();
    const presetBtns = container.querySelectorAll('.bg-preset-btn');
    expect(presetBtns.length).toBe(2);
  });

  test('Apply sur un preset met à jour store.background', () => {
    store.setBackground({ kind: 'preset', path: '/assets/backgrounds/alpha.png' });
    const { container } = mountModal();
    openModal();
    (container.querySelector('#bg-modal-apply') as HTMLButtonElement).click();
    expect(store.background).toMatchObject({ kind: 'preset', path: '/assets/backgrounds/alpha.png' });
  });
});

// ============================================================
// Onglet URL
// ============================================================

describe('BackgroundModal – onglet URL', () => {
  test('un champ URL est rendu dans l\'onglet url', () => {
    const { container } = mountModal();
    openModal();
    (container.querySelector('[data-tab="url"]') as HTMLButtonElement).click();
    expect(container.querySelector('#bg-url-input')).toBeTruthy();
  });

  test('Apply avec une URL https met à jour store.background', () => {
    store.setBackground({ kind: 'url', url: 'https://example.com/bg.png' });
    const { container } = mountModal();
    openModal();
    (container.querySelector('#bg-modal-apply') as HTMLButtonElement).click();
    expect(store.background).toMatchObject({ kind: 'url', url: 'https://example.com/bg.png' });
  });
});

// ============================================================
// Onglet upload
// ============================================================

describe('BackgroundModal – onglet upload', () => {
  test('un input file est rendu dans l\'onglet upload', () => {
    const { container } = mountModal();
    openModal();
    (container.querySelector('[data-tab="upload"]') as HTMLButtonElement).click();
    expect(container.querySelector('#bg-upload-input')).toBeTruthy();
  });
});

// ============================================================
// Réouverture
// ============================================================

describe('BackgroundModal – réouverture', () => {
  test('le modal peut être rouvert après fermeture', () => {
    const { container } = mountModal();
    openModal();
    (container.querySelector('#bg-modal-close') as HTMLButtonElement).click();
    expect(container.innerHTML).toBe('');
    openModal();
    expect(container.querySelector('#bg-modal-backdrop')).toBeTruthy();
  });
});
