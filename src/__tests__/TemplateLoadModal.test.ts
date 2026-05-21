/**
 * Tests for TemplateLoadModal
 *
 * Covers:
 * - mount & open: container state, rendered elements
 * - Closing: close button, backdrop click, Escape key, re-open
 * - Reference template: fetch success, fetch failure
 * - Custom file: file input change, drag & drop
 */

import { TemplateLoadModal } from '../components/TemplateLoadModal';
import { store } from '../store';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function mountModal(): { container: HTMLElement; modal: TemplateLoadModal } {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const modal = new TemplateLoadModal();
  modal.mount(container);
  return { container, modal };
}

function openModal(): void {
  window.dispatchEvent(new Event('open-template-load-modal'));
}

const VALID_TEMPLATE_JSON = JSON.stringify({ sections: [] });

/** Wait for a condition to become true (polls every 5 ms, up to ~500 ms). */
async function waitFor(predicate: () => boolean, attempts = 100): Promise<void> {
  for (let i = 0; i < attempts; i++) {
    if (predicate()) return;
    await new Promise(r => setTimeout(r, 5));
  }
}

// ─── mount & open ─────────────────────────────────────────────────────────────

describe('TemplateLoadModal – mount & open', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    jest.restoreAllMocks();
  });

  test('container is empty before the event', () => {
    const { container } = mountModal();
    expect(container.innerHTML).toBe('');
  });

  test('open-template-load-modal renders the backdrop', () => {
    const { container } = mountModal();
    openModal();
    expect(container.querySelector('#tpl-load-modal-backdrop')).toBeTruthy();
  });

  test('close button is present', () => {
    const { container } = mountModal();
    openModal();
    expect(container.querySelector('#tpl-load-close')).toBeTruthy();
  });

  test('reference template card is present', () => {
    const { container } = mountModal();
    openModal();
    expect(container.querySelector('#tpl-load-reference')).toBeTruthy();
  });

  test('dropzone and file input are present', () => {
    const { container } = mountModal();
    openModal();
    expect(container.querySelector('#tpl-load-dropzone')).toBeTruthy();
    expect(container.querySelector('#tpl-load-file-input')).toBeTruthy();
  });
});

// ─── Closing ─────────────────────────────────────────────────────────────────

describe('TemplateLoadModal – closing', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    jest.restoreAllMocks();
  });

  test('close button clears the container', () => {
    const { container } = mountModal();
    openModal();
    (container.querySelector('#tpl-load-close') as HTMLButtonElement).click();
    expect(container.innerHTML).toBe('');
  });

  test('clicking the backdrop closes the modal', () => {
    const { container } = mountModal();
    openModal();
    const backdrop = container.querySelector('#tpl-load-modal-backdrop') as HTMLElement;
    const event = new MouseEvent('click', { bubbles: true });
    Object.defineProperty(event, 'target', { value: backdrop });
    backdrop.dispatchEvent(event);
    expect(container.innerHTML).toBe('');
  });

  test('clicking inside the inner panel does not close the modal', () => {
    const { container } = mountModal();
    openModal();
    const inner = container.querySelector('#tpl-load-reference') as HTMLElement;
    // Simulate a click whose target is the inner panel, not the backdrop
    inner.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(container.querySelector('#tpl-load-modal-backdrop')).toBeTruthy();
  });

  test('Escape key closes the modal', () => {
    const { container } = mountModal();
    openModal();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(container.innerHTML).toBe('');
  });

  test('Escape has no effect when modal is already closed', () => {
    const { container } = mountModal();
    expect(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    }).not.toThrow();
    expect(container.innerHTML).toBe('');
  });

  test('modal can be re-opened after closing', () => {
    const { container } = mountModal();
    openModal();
    (container.querySelector('#tpl-load-close') as HTMLButtonElement).click();
    expect(container.innerHTML).toBe('');
    openModal();
    expect(container.querySelector('#tpl-load-modal-backdrop')).toBeTruthy();
  });
});

// ─── Reference template ───────────────────────────────────────────────────────

describe('TemplateLoadModal – reference template', () => {
  beforeEach(() => {
    store.sections.forEach(s => store.deleteSection(s.id));
  });

  afterEach(() => {
    document.body.innerHTML = '';
    jest.restoreAllMocks();
  });

  test('clicking the reference card triggers a fetch', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      text: async () => VALID_TEMPLATE_JSON,
    } as unknown as Response);

    const { container } = mountModal();
    openModal();
    (container.querySelector('#tpl-load-reference') as HTMLElement).click();
    await Promise.resolve(); // flush microtasks

    expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('referenceTemplate.json'));
  });

  test('successful fetch calls store.importJSON and closes the modal', async () => {
    const importSpy = jest.spyOn(store, 'importJSON');
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      text: async () => VALID_TEMPLATE_JSON,
    } as unknown as Response);

    const { container } = mountModal();
    openModal();
    (container.querySelector('#tpl-load-reference') as HTMLElement).click();
    await new Promise(r => setTimeout(r, 0)); // flush async chain

    expect(importSpy).toHaveBeenCalledWith(VALID_TEMPLATE_JSON);
    expect(container.innerHTML).toBe('');
  });

  test('failed fetch (non-ok response) does not close the modal', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 404,
    } as unknown as Response);

    const { container } = mountModal();
    openModal();
    (container.querySelector('#tpl-load-reference') as HTMLElement).click();
    await new Promise(r => setTimeout(r, 0));

    expect(container.querySelector('#tpl-load-modal-backdrop')).toBeTruthy();
  });

  test('fetch network error does not close the modal', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('network error'));

    const { container } = mountModal();
    openModal();
    (container.querySelector('#tpl-load-reference') as HTMLElement).click();
    await new Promise(r => setTimeout(r, 0));

    expect(container.querySelector('#tpl-load-modal-backdrop')).toBeTruthy();
  });
});

// ─── Custom file ─────────────────────────────────────────────────────────────

describe('TemplateLoadModal – custom file', () => {
  beforeEach(() => {
    store.sections.forEach(s => store.deleteSection(s.id));
  });

  afterEach(() => {
    document.body.innerHTML = '';
    jest.restoreAllMocks();
  });

  test('selecting a valid JSON file calls store.importJSON and closes the modal', async () => {
    const importSpy = jest.spyOn(store, 'importJSON');
    const { container } = mountModal();
    openModal();

    const input = container.querySelector('#tpl-load-file-input') as HTMLInputElement;
    const file = new File([VALID_TEMPLATE_JSON], 'template.json', { type: 'application/json' });
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    input.dispatchEvent(new Event('change'));

    await waitFor(() => importSpy.mock.calls.length > 0);

    expect(importSpy).toHaveBeenCalledWith(VALID_TEMPLATE_JSON);
    expect(container.innerHTML).toBe('');
  });

  test('change event with no file does not throw', () => {
    const { container } = mountModal();
    openModal();
    const input = container.querySelector('#tpl-load-file-input') as HTMLInputElement;
    Object.defineProperty(input, 'files', { value: [], configurable: true });
    expect(() => input.dispatchEvent(new Event('change'))).not.toThrow();
    expect(container.querySelector('#tpl-load-modal-backdrop')).toBeTruthy();
  });
});

// ─── Drag & drop ─────────────────────────────────────────────────────────────

describe('TemplateLoadModal – drag & drop', () => {
  beforeEach(() => {
    store.sections.forEach(s => store.deleteSection(s.id));
  });

  afterEach(() => {
    document.body.innerHTML = '';
    jest.restoreAllMocks();
  });

  test('dragover adds highlight classes to the dropzone', () => {
    const { container } = mountModal();
    openModal();
    const dropzone = container.querySelector('#tpl-load-dropzone') as HTMLElement;
    const dragover = new Event('dragover');
    Object.defineProperty(dragover, 'dataTransfer', { value: { dropEffect: '' } });
    dropzone.dispatchEvent(dragover);
    expect(dropzone.classList.contains('border-blue-400')).toBe(true);
    expect(dropzone.classList.contains('bg-gray-700')).toBe(true);
  });

  test('dragleave removes highlight classes from the dropzone', () => {
    const { container } = mountModal();
    openModal();
    const dropzone = container.querySelector('#tpl-load-dropzone') as HTMLElement;
    dropzone.classList.add('border-blue-400', 'bg-gray-700');
    dropzone.dispatchEvent(new Event('dragleave'));
    expect(dropzone.classList.contains('border-blue-400')).toBe(false);
    expect(dropzone.classList.contains('bg-gray-700')).toBe(false);
  });

  test('dropping a valid JSON file calls store.importJSON and closes the modal', async () => {
    const importSpy = jest.spyOn(store, 'importJSON');
    const { container } = mountModal();
    openModal();

    const file = new File([VALID_TEMPLATE_JSON], 'template.json', { type: 'application/json' });
    const dropzone = container.querySelector('#tpl-load-dropzone') as HTMLElement;
    const drop = new Event('drop');
    Object.defineProperty(drop, 'dataTransfer', { value: { files: [file] } });
    dropzone.dispatchEvent(drop);

    await waitFor(() => importSpy.mock.calls.length > 0);

    expect(importSpy).toHaveBeenCalledWith(VALID_TEMPLATE_JSON);
    expect(container.innerHTML).toBe('');
  });

  test('dropping no file does not throw', () => {
    const { container } = mountModal();
    openModal();
    const dropzone = container.querySelector('#tpl-load-dropzone') as HTMLElement;
    const drop = new Event('drop');
    Object.defineProperty(drop, 'dataTransfer', { value: { files: [] } });
    expect(() => dropzone.dispatchEvent(drop)).not.toThrow();
  });
});
