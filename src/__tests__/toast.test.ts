/**
 * Tests du helper de notification toast (src/services/toast.ts)
 */

import { showToast } from '../services/toast';

describe('showToast', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('affiche un toast de succès en vert (emerald), pas en rouge', () => {
    showToast('Copied!', { type: 'success' });
    const toast = document.body.lastElementChild as HTMLElement;
    expect(toast.className).toContain('bg-emerald-600');
    expect(toast.className).not.toContain('bg-red-600');
    expect(toast.textContent).toContain('Copied!');
  });

  test('affiche un toast d\'erreur en rouge', () => {
    showToast('Copy failed', { type: 'error' });
    const toast = document.body.lastElementChild as HTMLElement;
    expect(toast.className).toContain('bg-red-600');
  });

  test('affiche un toast info par défaut si aucun type fourni', () => {
    showToast('Just info');
    const toast = document.body.lastElementChild as HTMLElement;
    expect(toast.className).toContain('bg-gray-800');
  });

  test('affiche un bouton d\'action (Undo) et l\'exécute au clic', () => {
    const onAction = jest.fn();
    showToast('Section "Foo" deleted', { type: 'info', actionLabel: 'Undo', onAction });
    const toast = document.body.lastElementChild as HTMLElement;
    const btn = toast.querySelector('button') as HTMLButtonElement;
    expect(btn).toBeTruthy();
    expect(btn.textContent).toBe('Undo');

    btn.click();
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(document.body.contains(toast)).toBe(false);
  });

  test('ne montre pas de bouton d\'action si actionLabel/onAction absents', () => {
    showToast('No action here');
    const toast = document.body.lastElementChild as HTMLElement;
    expect(toast.querySelector('button')).toBeNull();
  });

  test('retire automatiquement le toast après la durée par défaut', () => {
    showToast('Auto remove');
    const toast = document.body.lastElementChild as HTMLElement;
    expect(document.body.contains(toast)).toBe(true);
    jest.advanceTimersByTime(4000);
    expect(document.body.contains(toast)).toBe(false);
  });

  test('respecte une durée personnalisée', () => {
    showToast('Custom duration', { duration: 1000 });
    const toast = document.body.lastElementChild as HTMLElement;
    jest.advanceTimersByTime(999);
    expect(document.body.contains(toast)).toBe(true);
    jest.advanceTimersByTime(1);
    expect(document.body.contains(toast)).toBe(false);
  });
});
