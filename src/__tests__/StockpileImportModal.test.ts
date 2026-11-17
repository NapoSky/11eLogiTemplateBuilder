import { StockpileImportModal } from '../components/StockpileImportModal';
import { parseCSV } from '../components/StockpileView';
import type { StockpileSnapshot } from '../services/stockpileLogistics';
import { TextDecoder, TextEncoder } from 'util';

Object.assign(global, { TextDecoder, TextEncoder });

const csv = (stock = '11e-LOC-2', date = '2026.11.17-11.00.00', quantity = 10, depot = 'Lochan') =>
  `Callahan - ${depot} - Seaport - ${stock},${date}\nArgenti r.II Rifle,${quantity}\n`;
const snapshot = (overrides: Partial<StockpileSnapshot> = {}): StockpileSnapshot => ({
  id: 'existing', ...parseCSV(csv()), label: 'Callahan - Lochan - Seaport - 11e-LOC-2',
  depotName: 'Lochan', role: 'front', ...overrides,
});
const button = (id: string) => document.querySelector<HTMLButtonElement>(`#${id}`)!;
const selected = () => [...document.querySelectorAll<HTMLInputElement>('[data-candidate]')];
const paste = (text: string) => {
  const event = new Event('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'clipboardData', { value: { getData: () => text } });
  document.querySelector('#csv-modal-text')!.dispatchEvent(event);
  return event;
};
const role = (index: number, value: string) => {
  document.querySelector<HTMLButtonElement>(`[data-role-group="${index}"] [data-depot-role="${value}"]`)!.click();
};
const file = (text: string, name = 'stock.csv') => {
  const result = new File([text], name);
  Object.defineProperty(result, 'arrayBuffer', { configurable: true, value: async () => new TextEncoder().encode(text).buffer });
  return result;
};
const drop = (files: File[]) => {
  const event = new Event('drop', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'dataTransfer', { value: { files } });
  document.querySelector('#csv-modal-dropzone')!.dispatchEvent(event);
};
const flush = () => new Promise(resolve => setTimeout(resolve, 0));

describe('StockpileImportModal', () => {
  let modal: StockpileImportModal;
  let onImport: jest.Mock;
  const open = (existing: StockpileSnapshot[] = []) => {
    modal = new StockpileImportModal({
      existing, parse: parseCSV, knownItemNames: new Set(['Argenti r.II Rifle', 'Basic Materials']), onImport,
    });
  };

  beforeEach(() => { onImport = jest.fn(); });
  afterEach(() => { modal?.close(); document.body.innerHTML = ''; jest.restoreAllMocks(); });

  test('accumulates pastes, assigns one role per depot and commits once', () => {
    open();
    expect(document.activeElement?.id).toBe('csv-modal-text');
    expect(paste(csv()).defaultPrevented).toBe(true);
    paste(csv('11e-LOC-3'));
    paste(csv('11e-PRO-1', undefined, 10, 'Procession'));
    expect(selected()).toHaveLength(3);
    expect(document.querySelectorAll('[data-role-group]')).toHaveLength(2);
    expect(onImport).not.toHaveBeenCalled();
    role(0, 'backline');
    expect(document.querySelector('[data-role-group="0"] [aria-pressed="true"]')?.textContent).toBe('Backline');
    button('csv-modal-import').click();
    expect(onImport).toHaveBeenCalledTimes(1);
    const [result] = onImport.mock.calls[0];
    expect(result).toHaveLength(3);
    expect(result.filter((entry: StockpileSnapshot) => entry.depotName === 'Lochan').map((entry: StockpileSnapshot) => entry.role)).toEqual(['backline', 'backline']);
    expect(document.querySelector('#csv-load-modal')).toBeNull();
  });

  test('deduplicates each stockpile, retains newest and refuses same-date conflicts', () => {
    open();
    paste(csv());
    paste(csv());
    expect(selected()).toHaveLength(1);
    expect(document.body.textContent).toContain('already in the basket');
    paste(csv(undefined, '2026.11.17-12.00.00', 20));
    paste(csv(undefined, '2026.11.17-10.00.00', 30));
    expect(document.body.textContent).toContain('older snapshot was ignored');
    paste(csv(undefined, '2026.11.17-12.00.00', 40));
    expect(document.body.textContent).toContain('Conflicting contents');
    button('csv-modal-import').click();
    expect(onImport.mock.calls[0][0][0].items.get('Argenti r.II Rifle')).toBe(20);
  });

  test('recognizes loaded snapshots and requires explicit selection of an older version', () => {
    const existing = snapshot({ depotName: 'Custom depot', role: 'backline' });
    open([existing]);
    paste(csv());
    expect(selected()[0].disabled).toBe(true);
    expect(button('csv-modal-import').disabled).toBe(true);
    paste(csv(undefined, '2026.11.16-11.00.00', 5));
    // The newer copy in the basket is retained, even if already loaded.
    expect(selected()).toHaveLength(1);
    button('csv-modal-clear').click();
    paste(csv(undefined, '2026.11.16-11.00.00', 5));
    expect(selected()[0].checked).toBe(false);
    expect(button('csv-modal-import').disabled).toBe(true);
    selected()[0].click();
    button('csv-modal-import').click();
    const [result] = onImport.mock.calls[0];
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ id: 'existing', depotName: 'Custom depot', role: 'backline' });
    expect(result[0].items.get('Argenti r.II Rifle')).toBe(5);
    expect(existing.items.get('Argenti r.II Rifle')).toBe(10);
  });

  test('rejects unrelated text, invalid dates, partial quantities and concatenated exports', () => {
    open();
    for (const text of ['meeting at 8pm', 'Shopping,2026.11.17-11.00.00\nBananas,12',
      csv(undefined, '2026.02.30-11.00.00'), csv().replace('Rifle,10', 'Rifle,10oops'),
      csv() + csv('other'), csv().replace('Rifle,10', 'Rifle,-2'),
      csv().replace('Rifle,10', 'Rifle,99999999999999999999')]) {
      paste(text);
      expect(selected()).toHaveLength(0);
      expect(button('csv-modal-import').disabled).toBe(true);
    }
    expect(document.body.textContent).not.toContain('meeting at 8pm');
    paste(csv(undefined, undefined, 0));
    expect(selected()).toHaveLength(1);
  });

  test('requires explicit selection for conflicting contents at a loaded snapshot date', () => {
    open([snapshot()]);
    paste(csv(undefined, undefined, 20));
    expect(selected()[0].checked).toBe(false);
    expect(document.body.textContent).toContain('Conflicting contents at the same date');
    expect(button('csv-modal-import').disabled).toBe(true);
    selected()[0].click();
    button('csv-modal-import').click();
    expect(onImport.mock.calls[0][0][0].items.get('Argenti r.II Rifle')).toBe(20);
  });

  test('allows only one selected Main and confirms demotion of the loaded Main', () => {
    const main = snapshot({ role: 'intermediate' });
    open([main]);
    paste(csv('new', undefined, 10, 'Procession'));
    paste(csv('other', undefined, 10, 'Mercy'));
    role(0, 'intermediate');
    expect(button('csv-modal-import').disabled).toBe(true);
    role(1, 'intermediate');
    expect(document.body.textContent).toContain('Only one depot can be Main');
    role(1, 'front');
    document.querySelector<HTMLInputElement>('#csv-modal-replace-main')!.click();
    expect(button('csv-modal-import').disabled).toBe(false);
    button('csv-modal-import').click();
    const [result] = onImport.mock.calls[0];
    expect(result.find((entry: StockpileSnapshot) => entry.depotName === 'Lochan').role).toBe('backline');
    expect(result.find((entry: StockpileSnapshot) => entry.depotName === 'Procession').role).toBe('intermediate');
    expect(main.role).toBe('intermediate');
  });

  test('role change applies to loaded siblings of a selected stockpile', () => {
    open([snapshot(), snapshot({ id: 'sibling', ...parseCSV(csv('11e-LOC-3')) })]);
    paste(csv(undefined, '2026.11.17-12.00.00'));
    role(0, 'backline');
    button('csv-modal-import').click();
    expect(onImport.mock.calls[0][0].map((entry: StockpileSnapshot) => entry.role)).toEqual(['backline', 'backline']);
  });

  test('imports multiple files, permits retrying the file picker and isolates read errors', async () => {
    open();
    const unreadable = { name: 'broken.csv', arrayBuffer: async () => { throw new Error('read failed'); } } as File;
    drop([file(csv()), unreadable, file(csv('other')), file(csv(), 'wrong.png')]);
    expect(button('csv-modal-import').disabled).toBe(true);
    await flush();
    expect(selected()).toHaveLength(2);
    expect(document.querySelector('#csv-modal-errors')!.textContent).toContain('Could not read broken.csv');
    const input = document.querySelector<HTMLInputElement>('#csv-modal-file-input')!;
    expect(input.multiple).toBe(true);
    Object.defineProperty(input, 'files', { value: [file(csv('third'))] });
    input.dispatchEvent(new Event('change'));
    await flush();
    expect(selected()).toHaveLength(3);
    button('csv-modal-import').click();
    expect(onImport.mock.calls[0][0]).toHaveLength(3);
  });

  test('keeps separate headerless files with identical quantities', async () => {
    open();
    drop([file('Argenti r.II Rifle,10', 'Depot A.csv'), file('Argenti r.II Rifle,10', 'Depot B.csv')]);
    await flush();
    expect(selected()).toHaveLength(2);
  });

  test('normalizes French item names and reports French crate exports once for the batch', () => {
    open();
    paste(csv().replace('Argenti r.II Rifle', 'Fusil Argenti r.II (Caisse)'));
    paste(csv('other').replace('Argenti r.II Rifle', 'Matériaux Basiques'));
    button('csv-modal-import').click();
    const [result, frenchDetected] = onImport.mock.calls[0];
    expect(result[0].items.get('Argenti r.II Rifle (Crate)')).toBe(10);
    expect(result[1].items.get('Basic Materials')).toBe(10);
    expect(frenchDetected).toBe(true);
  });

  test('decodes Windows-1252 file exports without losing accented item names', async () => {
    open();
    const text = csv().replace('Argenti r.II Rifle', 'Matériaux Basiques');
    const legacy = file(text);
    Object.defineProperty(legacy, 'arrayBuffer', { value: async () => Uint8Array.from(text, char => char.charCodeAt(0)).buffer });
    drop([legacy]);
    await flush();
    button('csv-modal-import').click();
    expect(onImport.mock.calls[0][0][0].items.get('Basic Materials')).toBe(10);
  });

  test('falls back to native paste when clipboard access is refused', async () => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { readText: jest.fn().mockRejectedValue(new Error('denied')) } });
    open();
    button('csv-modal-paste').click();
    await flush();
    expect(document.body.textContent).toContain('Paste with Ctrl+V');
    expect(document.activeElement?.id).toBe('csv-modal-text');
    paste(csv());
    expect(selected()).toHaveLength(1);
  });

  test('clearing and cancelling never changes loaded stocks; late reads are ignored', async () => {
    let resolve!: (value: string) => void;
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { readText: () => new Promise<string>(r => { resolve = r; }) } });
    const existing = snapshot();
    open([existing]);
    paste(csv('new'));
    button('csv-modal-clear').click();
    expect(selected()).toHaveLength(0);
    expect(onImport).not.toHaveBeenCalled();
    button('csv-modal-paste').click();
    button('csv-modal-close').click();
    resolve(csv('late'));
    await flush();
    expect(document.querySelector('#csv-load-modal')).toBeNull();
    expect(onImport).not.toHaveBeenCalled();
    expect(existing.items.get('Argenti r.II Rifle')).toBe(10);
  });

  test('supports keyboard focus containment and Escape cancellation', () => {
    const trigger = document.createElement('button');
    document.body.appendChild(trigger);
    trigger.focus();
    open();
    button('csv-modal-clear').focus();
    button('csv-modal-clear').dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
    expect(document.activeElement?.id).toBe('csv-modal-close');
    button('csv-modal-close').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    expect(document.activeElement).toBe(trigger);
    expect(onImport).not.toHaveBeenCalled();
  });
});
