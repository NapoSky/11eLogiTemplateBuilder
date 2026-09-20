// Reusable centered confirmation dialog (replaces native window.confirm()).
// Returns a Promise<boolean> resolved with the user's choice (Escape/backdrop = cancel).

export interface ConfirmDialogOptions {
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'default' | 'danger';
}

export function confirmDialog(message: string, options: ConfirmDialogOptions = {}): Promise<boolean> {
  const { confirmLabel = 'Continue', cancelLabel = 'Cancel', variant = 'default' } = options;
  const confirmBtnClass = variant === 'danger' ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700';

  return new Promise(resolve => {
    const backdrop = document.createElement('div');
    backdrop.className = 'fixed inset-0 bg-black/60 flex items-center justify-center z-[60]';
    backdrop.innerHTML = `
      <div class="bg-gray-800 rounded-lg shadow-2xl p-6 w-96 max-w-[90vw]">
        <p class="text-sm text-gray-200 mb-5">${escapeHtml(message)}</p>
        <div class="flex justify-end gap-2">
          <button id="confirm-dialog-cancel" class="px-3 py-1.5 border border-gray-500 hover:bg-gray-700 rounded text-sm text-white">${escapeHtml(cancelLabel)}</button>
          <button id="confirm-dialog-ok" class="px-3 py-1.5 ${confirmBtnClass} rounded text-sm font-medium text-white">${escapeHtml(confirmLabel)}</button>
        </div>
      </div>
    `;

    const finish = (result: boolean): void => {
      window.removeEventListener('keydown', onKeydown);
      backdrop.remove();
      resolve(result);
    };
    const onKeydown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') finish(false);
    };
    window.addEventListener('keydown', onKeydown);
    backdrop.addEventListener('click', e => {
      if (e.target === backdrop) finish(false);
    });
    backdrop.querySelector('#confirm-dialog-cancel')?.addEventListener('click', () => finish(false));
    backdrop.querySelector('#confirm-dialog-ok')?.addEventListener('click', () => finish(true));

    document.body.appendChild(backdrop);
    (backdrop.querySelector('#confirm-dialog-ok') as HTMLButtonElement)?.focus();
  });
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}
