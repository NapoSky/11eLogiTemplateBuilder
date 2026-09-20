// Shared toast notification helper.
// Provides a consistent visual style (success/error/info) across the app,
// and an optional inline action button (e.g. "Undo").

export type ToastType = 'success' | 'error' | 'info';

export interface ToastOptions {
  type?: ToastType;
  duration?: number;
  actionLabel?: string;
  onAction?: () => void;
}

const COLORS: Record<ToastType, string> = {
  success: 'bg-emerald-600',
  error: 'bg-red-600',
  info: 'bg-gray-800 border border-gray-600',
};

export function showToast(message: string, options: ToastOptions = {}): void {
  const { type = 'info', duration = 4000, actionLabel, onAction } = options;

  const toast = document.createElement('div');
  toast.className = `fixed bottom-6 right-6 ${COLORS[type]} text-white px-4 py-3 rounded-lg shadow-2xl z-[100] flex items-center gap-3 text-sm animate-fade-in`;

  const text = document.createElement('span');
  text.textContent = message;
  toast.appendChild(text);

  if (actionLabel && onAction) {
    const btn = document.createElement('button');
    btn.textContent = actionLabel;
    btn.className = 'font-semibold underline underline-offset-2 hover:text-gray-200 transition-colors shrink-0';
    btn.addEventListener('click', () => {
      onAction();
      toast.remove();
    });
    toast.appendChild(btn);
  }

  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), duration);
}
