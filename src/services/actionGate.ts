// Educational/warning notice shown before automatic-generation tools (e.g. "Generate Todolist").
// Its goal is to remind less experienced members, kindly, that blindly trusting a generated plan
// can hurt the regiment: a stockpile snapshot is never guaranteed to be up to date, complete, or
// aware of the current state of the war — generation only applies a template on top of it.
//
// This is NOT a security gate: closing the notice always lets the action proceed. The only thing
// gated by a password is the option to permanently silence this reminder on this browser, and the
// "Close" button itself only appears after a short reading delay so it can't be dismissed unread.

export interface LocalizedText {
  en: string;
  fr: string;
}

const STORAGE_KEY = '11e-caution-notice-dismissed';
const READING_DELAY_MS = 10_000;

// FNV-1a 32-bit, non-cryptographic — this only keeps the password from being trivially grep-able
// in the source/bundle, it is NOT meant to withstand a serious offline attack.
function fnv1a(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

function doubleHash(s: string): string {
  return fnv1a(fnv1a(s));
}

// Double FNV-1a hash of the (lowercased) password required to permanently silence this reminder —
// comparison is case-insensitive. Regenerate with `doubleHash('newpassword')` if changed.
const DISMISS_PASSWORD_HASH = 'cf6b64de';

const STRINGS = {
  title: { en: '⚠️ Before you continue', fr: '⚠️ Un instant avant de continuer' },
  introSuffix: {
    en: "is part of our automatic generation tools. It's meant for experienced members who understand its limits.",
    fr: 'fait partie de nos outils de génération automatique. Ils sont pensés pour des membres expérimentés qui en connaissent les limites.',
  },
  outro: {
    en: "Please double-check the numbers and the current context before acting on this — this isn't a reproach, just a helpful reminder 🙂",
    fr: "Merci de vérifier les chiffres et le contexte avant d'agir dessus — ce n'est pas un reproche, juste un rappel utile 🙂",
  },
  dismissLink: { en: "Don't show this again", fr: 'Ne plus afficher ce message' },
  close: { en: 'Close', fr: 'Fermer' },
  passwordHint: { en: 'Password required', fr: 'Mot de passe requis' },
  passwordPlaceholder: { en: 'Password', fr: 'Mot de passe' },
  confirm: { en: 'Confirm', fr: 'Confirmer' },
  cancel: { en: 'Cancel', fr: 'Annuler' },
  incorrectPassword: { en: 'Incorrect password.', fr: 'Mot de passe incorrect.' },
} satisfies Record<string, LocalizedText>;

function closingLabel(seconds: number, lang: 'en' | 'fr'): string {
  return lang === 'en' ? `Closing available in ${seconds}s…` : `Fermeture possible dans ${seconds}s…`;
}

export function isCautionNoticeDismissed(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

export function resetCautionNotice(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

// Forces the dismissed state without going through the password prompt (e.g. for automated tests).
export function dismissCautionNotice(): void {
  try {
    localStorage.setItem(STORAGE_KEY, 'true');
  } catch {
    /* ignore */
  }
}

/**
 * Shows the caution notice (unless already permanently dismissed), then runs `action`.
 * Runs `action` synchronously when the notice is already dismissed, so callers can use it as a
 * drop-in replacement for a plain click handler. `paragraphs` are the risk-specific explanation
 * lines shown below the common intro — kept per-caller so each gated action can spell out its own
 * risk (e.g. stale stock numbers vs. a stale/incomplete transport plan), in both languages.
 */
export function withActionGate(actionLabel: string, paragraphs: LocalizedText[], action: () => void | Promise<void>): void {
  if (isCautionNoticeDismissed()) {
    void action();
    return;
  }
  // Guards against stacked backdrops: the triggering button often keeps focus after the click that
  // opened the notice, so holding/spamming Enter re-fires its click handler — without this check
  // each repeat would pile up another (semi-transparent) backdrop on top of the previous ones.
  // Checked via the DOM (not a module variable) so it can't go stale if the notice gets removed by
  // something other than its own `finish()` (e.g. a test resetting `document.body.innerHTML`).
  if (document.getElementById(BACKDROP_ID)) return;
  showCautionNotice(actionLabel, paragraphs, () => void action());
}

const BACKDROP_ID = 'caution-notice-backdrop';

function showCautionNotice(actionLabel: string, paragraphs: LocalizedText[], onProceed: () => void): void {
  let lang: 'en' | 'fr' = 'en';

  const backdrop = document.createElement('div');
  backdrop.id = BACKDROP_ID;
  backdrop.className = 'fixed inset-0 bg-black/60 flex items-center justify-center z-[60]';
  backdrop.innerHTML = `
    <div class="bg-gray-800 rounded-lg shadow-2xl p-6 w-120 max-w-[95vw]">
      <div class="flex items-start justify-between gap-3 mb-2">
        <p id="caution-notice-title" class="text-base font-semibold text-amber-400"></p>
        <div class="flex rounded overflow-hidden border border-gray-600 shrink-0" title="Switch language">
          <button id="caution-notice-lang-en" class="px-2 py-0.5 text-xs transition-colors">🇬🇧 EN</button>
          <button id="caution-notice-lang-fr" class="px-2 py-0.5 text-xs transition-colors">🇫🇷 FR</button>
        </div>
      </div>
      <p id="caution-notice-intro" class="text-sm text-gray-200 mb-3"></p>
      <div id="caution-notice-paragraphs">
        ${paragraphs.map((_, i) => `<p id="caution-notice-p-${i}" class="text-sm text-gray-300 mb-3"></p>`).join('')}
      </div>
      <p id="caution-notice-outro" class="text-sm text-gray-300 mb-4"></p>
      <div class="flex items-center justify-between gap-3">
        <div id="caution-notice-dismiss-zone" class="relative flex-1">
          <button id="caution-notice-dismiss-link" class="inline-flex items-center gap-1.5 -ml-1.5 px-1.5 py-1 rounded text-xs text-gray-400 hover:text-gray-200 hover:bg-gray-700/50 transition-colors">
            <span aria-hidden="true">🔒</span>
            <span id="caution-notice-dismiss-link-text" class="underline underline-offset-2"></span>
          </button>
        </div>
        <div id="caution-notice-close-zone" class="text-right shrink-0">
          <span id="caution-notice-countdown" class="text-xs text-gray-400"></span>
        </div>
      </div>
    </div>
  `;

  const titleEl = backdrop.querySelector('#caution-notice-title') as HTMLElement;
  const introEl = backdrop.querySelector('#caution-notice-intro') as HTMLElement;
  const paragraphsEl = backdrop.querySelector('#caution-notice-paragraphs') as HTMLElement;
  const outroEl = backdrop.querySelector('#caution-notice-outro') as HTMLElement;
  const closeZone = backdrop.querySelector('#caution-notice-close-zone') as HTMLElement;
  const dismissZone = backdrop.querySelector('#caution-notice-dismiss-zone') as HTMLElement;
  const langEnBtn = backdrop.querySelector('#caution-notice-lang-en') as HTMLButtonElement;
  const langFrBtn = backdrop.querySelector('#caution-notice-lang-fr') as HTMLButtonElement;

  let canProceed = false;
  let remainingSeconds = Math.ceil(READING_DELAY_MS / 1000);
  let countdownTimer: ReturnType<typeof setInterval> | undefined;
  let fadeInTimer: ReturnType<typeof setTimeout> | undefined;

  const finish = (): void => {
    window.removeEventListener('keydown', onKeydown);
    if (countdownTimer !== undefined) clearInterval(countdownTimer);
    if (fadeInTimer !== undefined) clearTimeout(fadeInTimer);
    backdrop.remove();
    onProceed();
  };

  const onKeydown = (e: KeyboardEvent): void => {
    if (e.key !== 'Escape') return;
    if (popoverEl) { closeDismissPopover(); return; }
    if (canProceed) finish();
  };
  window.addEventListener('keydown', onKeydown);
  backdrop.addEventListener('click', e => {
    if (e.target === backdrop && canProceed) finish();
  });

  // Re-applies the current language to every piece of text already on screen, without touching
  // interactive state (input value/focus, which zone is open) so it's safe to call at any time
  // (language toggle, countdown ticks, dismiss prompt opening…).
  const applyTranslations = (): void => {
    titleEl.textContent = STRINGS.title[lang];
    introEl.innerHTML = `<strong>${escapeHtml(actionLabel)}</strong> ${escapeHtml(STRINGS.introSuffix[lang])}`;
    paragraphs.forEach((p, i) => {
      const el = paragraphsEl.querySelector(`#caution-notice-p-${i}`);
      if (el) el.textContent = p[lang];
    });
    outroEl.textContent = STRINGS.outro[lang];

    const linkText = dismissZone.querySelector('#caution-notice-dismiss-link-text');
    if (linkText) linkText.textContent = STRINGS.dismissLink[lang];

    if (popoverEl) {
      const hint = popoverEl.querySelector('#caution-notice-password-hint');
      const input = popoverEl.querySelector('#caution-notice-password') as HTMLInputElement | null;
      const confirmBtn = popoverEl.querySelector('#caution-notice-confirm-dismiss') as HTMLButtonElement | null;
      const cancelBtn = popoverEl.querySelector('#caution-notice-dismiss-cancel') as HTMLButtonElement | null;
      const error = popoverEl.querySelector('#caution-notice-dismiss-error') as HTMLElement | null;
      if (hint) hint.textContent = STRINGS.passwordHint[lang];
      if (input) input.placeholder = STRINGS.passwordPlaceholder[lang];
      if (confirmBtn) confirmBtn.textContent = STRINGS.confirm[lang];
      if (cancelBtn) cancelBtn.setAttribute('aria-label', STRINGS.cancel[lang]);
      if (error && error.textContent) error.textContent = STRINGS.incorrectPassword[lang];
    }

    const countdownEl = closeZone.querySelector('#caution-notice-countdown');
    if (countdownEl) countdownEl.textContent = closingLabel(remainingSeconds, lang);
    const closeBtn = closeZone.querySelector('#caution-notice-close');
    if (closeBtn) closeBtn.textContent = STRINGS.close[lang];

    langEnBtn.className = `px-2 py-0.5 text-xs transition-colors ${lang === 'en' ? 'bg-blue-600 text-white' : 'bg-gray-700 hover:bg-gray-600 text-gray-300'}`;
    langFrBtn.className = `px-2 py-0.5 text-xs transition-colors ${lang === 'fr' ? 'bg-blue-600 text-white' : 'bg-gray-700 hover:bg-gray-600 text-gray-300'}`;
  };

  langEnBtn.addEventListener('click', () => { lang = 'en'; applyTranslations(); });
  langFrBtn.addEventListener('click', () => { lang = 'fr'; applyTranslations(); });

  // The "Close" button only appears once the reading delay has elapsed, so the warning can't be
  // dismissed without at least having had time to read it.
  countdownTimer = setInterval(() => {
    remainingSeconds -= 1;
    if (remainingSeconds <= 0) {
      clearInterval(countdownTimer);
      canProceed = true;
      closeZone.innerHTML = `
        <button id="caution-notice-close" class="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 rounded text-sm font-medium text-white opacity-0 transition-opacity duration-500"></button>
      `;
      const closeBtn = closeZone.querySelector('#caution-notice-close') as HTMLButtonElement;
      closeBtn.addEventListener('click', finish);
      applyTranslations();
      // Deferred so the browser paints the initial opacity-0 state before transitioning, letting the CSS fade-in play.
      fadeInTimer = setTimeout(() => closeBtn.classList.remove('opacity-0'), 20);
    } else {
      applyTranslations();
    }
  }, 1000);

  // "Don't show this again" is password-protected but not subject to the reading delay: entering
  // the correct password already implies an experienced/authorized user. It opens as a floating
  // popover (position: absolute, anchored above the link) instead of expanding inline, so the
  // modal's own layout/height never shifts when it's opened or closed.
  let popoverEl: HTMLElement | null = null;

  const closeDismissPopover = (): void => {
    popoverEl?.remove();
    popoverEl = null;
  };

  const openDismissPopover = (): void => {
    if (popoverEl) return;
    popoverEl = document.createElement('div');
    popoverEl.id = 'caution-notice-dismiss-popover';
    popoverEl.className = 'absolute bottom-full left-0 mb-2 z-10 w-64 max-w-[80vw] bg-gray-900 border border-gray-600 rounded-md shadow-lg p-2';
    popoverEl.innerHTML = `
      <div class="flex items-center justify-between gap-2 mb-1.5">
        <span class="inline-flex items-center gap-1.5 text-xs text-gray-400">
          <span aria-hidden="true">🔒</span>
          <span id="caution-notice-password-hint"></span>
        </span>
        <button id="caution-notice-dismiss-cancel" class="text-gray-500 hover:text-gray-300 leading-none">✕</button>
      </div>
      <div class="flex items-center gap-2">
        <input id="caution-notice-password" type="password" autocomplete="off"
          class="flex-1 min-w-0 px-2 py-1.5 bg-gray-950 border border-gray-600 rounded text-xs text-white focus:outline-none focus:border-blue-500" />
        <button id="caution-notice-confirm-dismiss" class="px-2 py-1.5 bg-gray-700 hover:bg-gray-600 rounded text-xs text-white shrink-0"></button>
      </div>
      <p id="caution-notice-dismiss-error" class="text-xs text-red-400 mt-1 h-4"></p>
    `;
    dismissZone.appendChild(popoverEl);

    const input = popoverEl.querySelector('#caution-notice-password') as HTMLInputElement;
    const error = popoverEl.querySelector('#caution-notice-dismiss-error') as HTMLElement;
    const attempt = (): void => {
      if (doubleHash(input.value.toLowerCase()) === DISMISS_PASSWORD_HASH) {
        dismissCautionNotice();
        finish();
      } else {
        error.textContent = STRINGS.incorrectPassword[lang];
        input.value = '';
        input.focus();
      }
    };
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') attempt();
    });
    popoverEl.querySelector('#caution-notice-confirm-dismiss')?.addEventListener('click', attempt);
    popoverEl.querySelector('#caution-notice-dismiss-cancel')?.addEventListener('click', closeDismissPopover);
    applyTranslations();
    queueMicrotask(() => input.focus());
  };

  dismissZone.querySelector('#caution-notice-dismiss-link')?.addEventListener('click', openDismissPopover);

  applyTranslations();
  document.body.appendChild(backdrop);
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}
