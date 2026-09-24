/**
 * Tests du service actionGate (src/services/actionGate.ts) — notice pédagogique
 * avant les outils de génération automatique.
 */

import {
  isCautionNoticeDismissed,
  resetCautionNotice,
  dismissCautionNotice,
  withActionGate,
} from '../services/actionGate';

const RISK_PARAGRAPHS = [
  { en: 'This tool only works from data currently loaded and may not reflect reality.', fr: 'Cet outil ne se base que sur les données actuellement chargées et peut ne pas refléter la réalité.' },
];

describe('actionGate (caution notice)', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
    document.body.innerHTML = '';
    resetCautionNotice();
  });

  test("n'est pas dismiss par défaut", () => {
    expect(isCautionNoticeDismissed()).toBe(false);
  });

  test("spammer withActionGate (ex: touche Entrée qui reclique le bouton déclencheur) n'empile pas plusieurs notices", () => {
    const action = jest.fn();
    withActionGate('Generate Todolist', RISK_PARAGRAPHS, action);
    withActionGate('Generate Todolist', RISK_PARAGRAPHS, action);
    withActionGate('Generate Todolist', RISK_PARAGRAPHS, action);

    expect(document.querySelectorAll('#caution-notice-backdrop').length).toBe(1);

    jest.advanceTimersByTime(10_000);
    (document.querySelector('#caution-notice-close') as HTMLButtonElement).click();
    expect(action).toHaveBeenCalledTimes(1);
    expect(document.body.innerHTML).toBe('');

    // Une fois fermée, une nouvelle notice doit pouvoir s'ouvrir normalement.
    withActionGate('Generate Todolist', RISK_PARAGRAPHS, action);
    expect(document.querySelectorAll('#caution-notice-backdrop').length).toBe(1);
  });

  test('withActionGate affiche la notice (avec les paragraphes fournis) et exécute action seulement après le délai de lecture', () => {
    const action = jest.fn();
    withActionGate('Generate Todolist', RISK_PARAGRAPHS, action);

    // Le bouton "Close" n'existe pas immédiatement.
    expect(document.querySelector('#caution-notice-close')).toBeNull();
    expect(document.querySelector('#caution-notice-countdown')?.textContent).toContain('10s');
    expect(document.body.textContent).toContain(RISK_PARAGRAPHS[0].en);
    expect(document.body.textContent).toContain('Generate Todolist');

    jest.advanceTimersByTime(10_000);

    const closeBtn = document.querySelector('#caution-notice-close') as HTMLButtonElement;
    expect(closeBtn).not.toBeNull();
    expect(closeBtn.textContent).toBe('Close');
    closeBtn.click();
    expect(action).toHaveBeenCalledTimes(1);
    expect(document.body.innerHTML).toBe('');
  });

  test('le bouton EN/FR bascule tout le texte de la notice sans réinitialiser le countdown', () => {
    withActionGate('Generate Todolist', RISK_PARAGRAPHS, jest.fn());
    jest.advanceTimersByTime(3_000);

    (document.querySelector('#caution-notice-lang-fr') as HTMLButtonElement).click();

    expect(document.body.textContent).toContain(RISK_PARAGRAPHS[0].fr);
    expect(document.querySelector('#caution-notice-countdown')?.textContent).toContain('7s');
    expect(document.querySelector('#caution-notice-dismiss-link-text')?.textContent).toBe('Ne plus afficher ce message');

    jest.advanceTimersByTime(7_000);
    const closeBtn = document.querySelector('#caution-notice-close') as HTMLButtonElement;
    expect(closeBtn.textContent).toBe('Fermer');

    (document.querySelector('#caution-notice-lang-en') as HTMLButtonElement).click();
    expect(closeBtn.textContent).toBe('Close');
  });

  test('le countdown décompte seconde par seconde', () => {
    withActionGate('Generate Todolist', RISK_PARAGRAPHS, jest.fn());
    jest.advanceTimersByTime(3_000);
    expect(document.querySelector('#caution-notice-countdown')?.textContent).toContain('7s');
  });

  test('Escape et le clic sur le backdrop sont ignorés avant la fin du délai', () => {
    const action = jest.fn();
    withActionGate('Generate Todolist', RISK_PARAGRAPHS, action);

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    const backdrop = document.body.firstElementChild as HTMLElement;
    backdrop.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(action).not.toHaveBeenCalled();
    expect(document.body.innerHTML).not.toBe('');
  });

  test('Escape fonctionne après le délai de lecture', () => {
    const action = jest.fn();
    withActionGate('Generate Todolist', RISK_PARAGRAPHS, action);
    jest.advanceTimersByTime(10_000);

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(action).toHaveBeenCalledTimes(1);
    expect(document.body.innerHTML).toBe('');
  });

  test('clic sur le backdrop fonctionne après le délai de lecture', () => {
    const action = jest.fn();
    withActionGate('Generate Todolist', RISK_PARAGRAPHS, action);
    jest.advanceTimersByTime(10_000);

    const backdrop = document.body.firstElementChild as HTMLElement;
    backdrop.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(action).toHaveBeenCalledTimes(1);
  });

  test('"Don\'t show this again" avec le bon mot de passe dismiss immédiatement, sans attendre', () => {
    const action = jest.fn();
    withActionGate('Generate Todolist', RISK_PARAGRAPHS, action);

    (document.querySelector('#caution-notice-dismiss-link') as HTMLButtonElement).click();
    const input = document.querySelector('#caution-notice-password') as HTMLInputElement;
    input.value = 'Roger';
    (document.querySelector('#caution-notice-confirm-dismiss') as HTMLButtonElement).click();

    expect(action).toHaveBeenCalledTimes(1);
    expect(isCautionNoticeDismissed()).toBe(true);
    expect(document.body.innerHTML).toBe('');
  });

  test('le bouton Annuler du prompt mot de passe revient au lien, sans dismiss', () => {
    const action = jest.fn();
    withActionGate('Generate Todolist', RISK_PARAGRAPHS, action);

    (document.querySelector('#caution-notice-dismiss-link') as HTMLButtonElement).click();
    expect(document.querySelector('#caution-notice-password')).not.toBeNull();

    (document.querySelector('#caution-notice-dismiss-cancel') as HTMLButtonElement).click();

    expect(document.querySelector('#caution-notice-password')).toBeNull();
    expect(document.querySelector('#caution-notice-dismiss-link-text')?.textContent).toBe("Don't show this again");
    expect(action).not.toHaveBeenCalled();
    expect(isCautionNoticeDismissed()).toBe(false);
  });

  test('"Don\'t show this again" accepte le mot de passe indépendamment de la casse', () => {
    const action = jest.fn();
    withActionGate('Generate Todolist', RISK_PARAGRAPHS, action);

    (document.querySelector('#caution-notice-dismiss-link') as HTMLButtonElement).click();
    const input = document.querySelector('#caution-notice-password') as HTMLInputElement;
    input.value = 'rOgEr';
    (document.querySelector('#caution-notice-confirm-dismiss') as HTMLButtonElement).click();

    expect(action).toHaveBeenCalledTimes(1);
    expect(isCautionNoticeDismissed()).toBe(true);
  });

  test('"Don\'t show this again" avec un mauvais mot de passe affiche une erreur et ne dismiss pas', () => {
    const action = jest.fn();
    withActionGate('Generate Todolist', RISK_PARAGRAPHS, action);

    (document.querySelector('#caution-notice-dismiss-link') as HTMLButtonElement).click();
    const input = document.querySelector('#caution-notice-password') as HTMLInputElement;
    input.value = 'wrong';
    (document.querySelector('#caution-notice-confirm-dismiss') as HTMLButtonElement).click();

    expect(document.querySelector('#caution-notice-dismiss-error')?.textContent).toBe('Incorrect password.');
    expect(action).not.toHaveBeenCalled();
    expect(isCautionNoticeDismissed()).toBe(false);
  });

  test('soumission du mot de passe via Enter', () => {
    const action = jest.fn();
    withActionGate('Generate Todolist', RISK_PARAGRAPHS, action);

    (document.querySelector('#caution-notice-dismiss-link') as HTMLButtonElement).click();
    const input = document.querySelector('#caution-notice-password') as HTMLInputElement;
    input.value = 'Roger';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));

    expect(action).toHaveBeenCalledTimes(1);
  });

  test('withActionGate exécute action immédiatement (sans notice) si déjà dismiss', () => {
    dismissCautionNotice();
    const action = jest.fn();
    withActionGate('Generate Todolist', RISK_PARAGRAPHS, action);
    expect(action).toHaveBeenCalledTimes(1);
    expect(document.body.innerHTML).toBe('');
  });

  test('le dismiss est partagé entre différentes actions (même storage, même mot de passe)', () => {
    const generateAction = jest.fn();
    withActionGate('Generate Todolist', RISK_PARAGRAPHS, generateAction);
    (document.querySelector('#caution-notice-dismiss-link') as HTMLButtonElement).click();
    (document.querySelector('#caution-notice-password') as HTMLInputElement).value = 'Roger';
    (document.querySelector('#caution-notice-confirm-dismiss') as HTMLButtonElement).click();
    expect(generateAction).toHaveBeenCalledTimes(1);

    // Une action différente ("Prepare Transport") ne réaffiche pas la notice après ce dismiss.
    const transportAction = jest.fn();
    withActionGate('Prepare Transport', [{ en: 'Another risk paragraph.', fr: 'Autre paragraphe de risque.' }], transportAction);
    expect(transportAction).toHaveBeenCalledTimes(1);
    expect(document.body.innerHTML).toBe('');
  });
});

