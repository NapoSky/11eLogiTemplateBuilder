/**
 * Tests du service confirmDialog (src/services/confirmDialog.ts)
 */

import { confirmDialog } from '../services/confirmDialog';

describe('confirmDialog', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  test('résout true au clic sur le bouton de confirmation', async () => {
    const promise = confirmDialog('Are you sure?');
    (document.querySelector('#confirm-dialog-ok') as HTMLButtonElement).click();
    await expect(promise).resolves.toBe(true);
    expect(document.body.innerHTML).toBe('');
  });

  test('résout false au clic sur Annuler', async () => {
    const promise = confirmDialog('Are you sure?');
    (document.querySelector('#confirm-dialog-cancel') as HTMLButtonElement).click();
    await expect(promise).resolves.toBe(false);
  });

  test('résout false au clic sur le backdrop', async () => {
    const promise = confirmDialog('Are you sure?');
    const backdrop = document.body.firstElementChild as HTMLElement;
    backdrop.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await expect(promise).resolves.toBe(false);
  });

  test('résout false sur Escape', async () => {
    const promise = confirmDialog('Are you sure?');
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await expect(promise).resolves.toBe(false);
  });

  test('utilise les labels et le variant fournis', () => {
    confirmDialog('Delete everything?', { confirmLabel: 'Delete', cancelLabel: 'Keep', variant: 'danger' });
    const okBtn = document.querySelector('#confirm-dialog-ok') as HTMLButtonElement;
    const cancelBtn = document.querySelector('#confirm-dialog-cancel') as HTMLButtonElement;
    expect(okBtn.textContent).toBe('Delete');
    expect(cancelBtn.textContent).toBe('Keep');
    expect(okBtn.className).toContain('bg-red-600');
  });
});
