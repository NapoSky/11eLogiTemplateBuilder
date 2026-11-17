import { readFileSync } from 'node:fs';
import { StockpileView } from '../components/StockpileView';
import type { ItemDataEntry } from '../services/gameData';
import { store } from '../store';

const itemData: ItemDataEntry[] = JSON.parse(readFileSync('public/itemData.json', 'utf8'));
const mapping = JSON.parse(readFileSync('public/iconMapping.json', 'utf8'));
const wardenName = 'Silverhand - Mk. IV';
const colonialNames = ['85K-b "Falchion"', 'H-19 "Vulcan"'];
const sharedName = '7.92mm';
const unknownName = 'Unrecognized Cargo';
const emptyTemplate = { sections: [], quantityMode: 'crate-equivalents-v1' };
const tick = () => new Promise(resolve => setTimeout(resolve, 15));

describe('Stockpile official template faction visibility', () => {
  let view: StockpileView;
  let container: HTMLDivElement;
  const originalFetch = global.fetch;

  beforeEach(() => {
    store.setItemData(itemData);
    store.quantityMode = 'crate-equivalents-v1';
    store.sections = [];
    // The sidebar faction must not restrict Current or Loaded file.
    store.setTemplateFaction('warden');
    localStorage.setItem('stockpile_tpl_source', 'current');
    localStorage.setItem('stockpile_csv_entries', JSON.stringify([{
      id: 'main', header: null, label: 'Main', depotName: 'Main', role: 'intermediate',
      items: Object.fromEntries([wardenName, ...colonialNames, sharedName, unknownName]
        .flatMap(name => [[name, 2], [`${name} (Crate)`, 1]])),
    }]));
    global.fetch = jest.fn(async input => ({
      ok: true,
      json: async () => String(input).includes('iconMapping') ? mapping : emptyTemplate,
    } as Response));
    container = document.createElement('div');
    document.body.appendChild(container);
    view = new StockpileView();
  });

  afterEach(() => {
    view.unmount();
    document.body.innerHTML = '';
    global.fetch = originalFetch;
    store.setItemData([]);
    store.quantityMode = 'legacy';
    store.setTemplateFaction('all');
  });

  function expectVisible(faction: 'warden' | 'colonial' | null, mode: 'global' | 'depots'): void {
    const key = mode === 'global' ? '__surplus__' : 'Not in template';
    const section = container.querySelector(`[data-section-key="${key}"]`)!;
    expect(section).not.toBeNull();
    const content = section.nextElementSibling!.textContent;
    const visibleNames = [sharedName, unknownName,
      ...(faction !== 'colonial' ? [wardenName] : []),
      ...(faction !== 'warden' ? colonialNames : [])];
    for (const name of [wardenName, ...colonialNames, sharedName, unknownName]) {
      if (visibleNames.includes(name)) expect(content).toContain(name);
      else expect(content).not.toContain(name);
    }
    expect(section.textContent).toContain(`${visibleNames.length} items`);
  }

  test.each(['global', 'depots'] as const)('updates faction visibility when switching template sources in %s view', async mode => {
    view.mount(container);
    await tick();
    (container.querySelector('#btn-hide-ok') as HTMLButtonElement).click();
    if (mode === 'depots') (container.querySelector('[data-stock-view="depots"]') as HTMLButtonElement).click();
    expectVisible(null, mode);
    const originalStock = localStorage.getItem('stockpile_csv_entries');

    window.dispatchEvent(new CustomEvent('stockpile:set-tpl-official'));
    await tick();
    expectVisible('warden', mode);

    window.dispatchEvent(new CustomEvent('stockpile:set-tpl-official-colonial'));
    await tick();
    expectVisible('colonial', mode);

    window.dispatchEvent(new CustomEvent('stockpile:set-tpl-current'));
    expectVisible(null, mode);

    window.dispatchEvent(new CustomEvent('stockpile:set-tpl-official'));
    await tick();
    window.dispatchEvent(new CustomEvent('stockpile:load-tpl', {
      detail: { file: { name: 'custom.json', text: async () => JSON.stringify(emptyTemplate) } },
    }));
    await tick();
    expect(store.stockpileTplSource).toBe('file');
    expectVisible(null, mode);
    expect(localStorage.getItem('stockpile_csv_entries')).toBe(originalStock);
  });

  test.each(['official', 'official-colonial', 'current', 'file'] as const)(
    'restores the visibility rules for saved source %s in both views', async source => {
      localStorage.setItem('stockpile_tpl_source', source);
      if (source === 'file') localStorage.setItem('stockpile_tpl_file', JSON.stringify(emptyTemplate));
      view.mount(container);
      await tick();
      (container.querySelector('#btn-hide-ok') as HTMLButtonElement).click();
      const faction = source === 'official' ? 'warden' : source === 'official-colonial' ? 'colonial' : null;
      expectVisible(faction, 'global');
      (container.querySelector('[data-stock-view="depots"]') as HTMLButtonElement).click();
      expectVisible(faction, 'depots');
    },
  );
});
