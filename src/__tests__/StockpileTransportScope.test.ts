import { readFileSync } from 'node:fs';
import { StockpileView } from '../components/StockpileView';
import { store } from '../store';
import { dismissCautionNotice } from '../services/actionGate';
import type { ItemDataEntry } from '../services/gameData';
import type { Section, Template } from '../types';

const metadata: ItemDataEntry[] = JSON.parse(readFileSync('public/itemData.json', 'utf8'));
const mapping = JSON.parse(readFileSync('public/iconMapping.json', 'utf8'));
const itemSection = (title: string, targets: Record<string, number>): Section => ({
  id: title, title, color: '#123456', x: 0, y: 0, width: 300, height: 200,
  icons: Object.entries(targets).map(([name, quantity]) => {
    const item = metadata.find(item => item.itemName === name && item.iconUsage !== 'facilities')!;
    return { id: name, iconId: name, filename: item.iconFilename, path: `/assets/icons/${item.iconFilename}`, quantity, gridRow: 0, gridCol: 0 };
  }),
});
const snapshots = () => [
  { id: 'main', header: null, label: 'Main', depotName: 'Main', role: 'intermediate', items: {
    '120mm (Crate)': 0, '150mm (Crate)': 0, 'Construction Materials (Crate)': 200,
  } },
  { id: 'back', header: null, label: 'Back', depotName: 'Back', role: 'backline', items: {
    '120mm (Crate)': 30, '150mm (Crate)': 20, 'Bandages (Crate)': 0,
    'Construction Materials (Crate)': 400, 'Processed Construction Materials (Crate)': 50,
    'Assembly Materials II (Crate)': 70, 'Rare Metal (Crate)': 10, 'Rare Alloys (Crate)': 10,
    'Heavy Oil (Crate)': 10, 'Enriched Oil (Crate)': 10, 'Water (Crate)': 10, Coal: 5000,
    'Basic Materials (Crate)': 10, 'Refined Materials (Crate)': 4,
    'Explosive Powder (Crate)': 3, 'Heavy Explosive Powder (Crate)': 2,
    'Petrol (Crate)': 5, 'Diesel (Crate)': 7,
    'Unknown supply (Crate)': 8, 'Empty unknown supply (Crate)': 0, '8mm (Crate)': 0,
  } },
];
const click = (selector: string) => document.querySelector<HTMLButtonElement>(selector)!.click();
const targetCell = (name: string): Element | null | undefined => {
  const cell = [...document.querySelectorAll('tbody td')].find(cell =>
    cell.querySelector('span.block.text-gray-200.truncate')?.textContent === name);
  return cell?.nextElementSibling?.nextElementSibling?.nextElementSibling;
};

describe('Stockpile transport scope with real item metadata', () => {
  let view: StockpileView;
  let container: HTMLElement;
  const originalFetch = global.fetch;
  const open = async () => {
    view.mount(container);
    await new Promise(resolve => setTimeout(resolve, 15));
    click('[data-stock-view="depots"]');
  };

  beforeEach(() => {
    store.setItemData(metadata);
    store.quantityMode = 'crate-equivalents-v1';
    store.sections = [
      itemSection('Medical', { Bandages: 15 }),
      itemSection('Heavy Ammo (Facility)', { '120mm': 20, '150mm': 10 }),
      itemSection('Industrial inputs', { 'Construction Materials': 100 }),
    ];
    localStorage.setItem('stockpile_tpl_source', 'current');
    localStorage.setItem('stockpile_csv_entries', JSON.stringify(snapshots()));
    localStorage.setItem('stockpile_transport_exclusions', '[]');
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => mapping });
    container = document.createElement('div');
    document.body.appendChild(container);
    view = new StockpileView();
    dismissCautionNotice();
  });

  afterEach(() => {
    view.unmount();
    document.body.innerHTML = '';
    global.fetch = originalFetch;
    store.setItemData([]);
    store.sections = [];
    store.quantityMode = 'legacy';
  });

  test.each(['legacy', 'crate-equivalents-v1'] as const)('filters industrial resources and empty extras while keeping targets and positive supplies in %s', async mode => {
    store.quantityMode = mode;
    await open();
    const tables = [...container.querySelectorAll('table')].map(table => table.textContent).join(' ');
    for (const name of ['Construction Materials', 'Assembly Materials II', 'Rare Metal', 'Rare Alloys', 'Heavy Oil', 'Enriched Oil', 'Water', 'Coal', 'Empty unknown supply', '8mm']) {
      expect(tables).not.toContain(name);
    }
    for (const name of ['120mm', '150mm', 'Bandages', 'Basic Materials', 'Refined Materials', 'Explosive Powder', 'Heavy Explosive Powder', 'Petrol', 'Diesel', 'Unknown supply']) {
      expect(tables).toContain(name);
    }
    expect(targetCell('Bandages')?.textContent).toBe('15');
    expect(targetCell('120mm')?.textContent).toBe('20');
    expect(targetCell('150mm')?.textContent).toBe('10');
    expect(targetCell('Unknown supply')?.textContent).toBe('—');
    expect(JSON.parse(localStorage.getItem('stockpile_csv_entries')!)).toEqual(snapshots());
  });

  test('counts readiness and depot totals within the same scope and signals excluded template objectives', async () => {
    await open();
    const readiness = container.querySelector('[data-intermediate-readiness]')!.textContent!;
    expect(readiness).toContain('0%');
    expect(readiness).toContain('✗ 3');
    expect(readiness).toContain('✓ 0');
    expect(container.querySelector('[data-role-card="backline"] .text-lg')?.textContent).toBe('89');
    const notice = container.querySelector('[data-transport-scope-notice]')!;
    expect(notice.textContent).toContain('1 template objective outside transport scope');
    expect(notice.textContent).toContain('Construction Materials');
  });

  test('keeps an explicit unlimited target distinct from an unconfigured target', async () => {
    store.sections[0].icons[0].quantity = -1;
    await open();
    expect(targetCell('Bandages')?.textContent).toBe('∞');
    expect(targetCell('Unknown supply')?.textContent).toBe('—');
  });

  test.each(['all', 'gap'])('shares scope with manual cargo and automatic %s planning', async plan => {
    await open();
    click('#btn-prepare-transport');
    const cargoTable = document.querySelector('#transport-cargo-rows')!.textContent!;
    for (const name of ['Construction Materials', 'Assembly Materials II', 'Rare Metal', 'Rare Alloys', 'Heavy Oil', 'Enriched Oil', 'Water', 'Coal']) {
      expect(cargoTable).not.toContain(name);
    }
    expect(cargoTable).toContain('120mm');
    expect(cargoTable).toContain('Refined Materials');
    click(`#transport-auto-fill-${plan}`);
    const preview = document.querySelector<HTMLTextAreaElement>('#transport-preview')!.value;
    expect(preview).toContain(plan === 'all' ? '30 120mm' : '20 120mm');
    expect(preview).toContain(plan === 'all' ? '20 150mm' : '10 150mm');
    expect(preview).not.toContain('Construction Materials');
    expect(preview).not.toContain('Heavy Oil');
    expect(document.querySelector('#transport-summary')!.textContent).toContain(`${plan === 'all' ? 89 : 30} units planned`);
  });

  test('old exclusion settings cannot expose industrial resources or inflate the exclusion count', async () => {
    localStorage.setItem('stockpile_transport_exclusions', JSON.stringify(['Rare Metal', 'Construction Materials', 'Refined Materials']));
    await open();
    click('#btn-prepare-transport');
    expect(document.querySelector('#transport-exclusions-details summary')!.textContent).toContain('1 blocked');
    expect(document.querySelector('.transport-exclusion-toggle[value="Rare Metal"]')).toBeNull();
    click('#transport-auto-fill-all');
    const preview = document.querySelector<HTMLTextAreaElement>('#transport-preview')!.value;
    expect(preview).not.toContain('Refined Materials');
    expect(preview).not.toContain('Rare Metal');
    expect(preview).not.toContain('Construction Materials');
  });

  test.each(['public/referenceTemplate.json', 'public/referenceTemplateColonial.json'])('preserves 120/150 mm targets in bundled template %s', async file => {
    const template: Template = JSON.parse(readFileSync(file, 'utf8'));
    store.sections = template.sections;
    await open();
    expect(targetCell('120mm')?.textContent).toBe('3000');
    expect(targetCell('150mm')?.textContent).toBe('3000');
  });
});
