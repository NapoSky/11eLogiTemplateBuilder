import { readFileSync } from 'node:fs';
import type { ItemDataEntry } from '../services/gameData';
import { readStockQuantities, calculateCrateShortage } from '../services/stockQuantities';
import { buildComparison, StockpileView } from '../components/StockpileView';
import { dismissCautionNotice } from '../services/actionGate';
import { store } from '../store';
import { normalizeStockItems, buildBacklineCargo } from '../services/stockpileLogistics';
import type { MpfDataEntry, Section, Template } from '../types';
import { migrateTemplateAssets } from '../services/iconPaths';

const itemData: ItemDataEntry[] = JSON.parse(readFileSync('public/itemData.json', 'utf8'));
const mpfData: MpfDataEntry[] = JSON.parse(readFileSync('public/mpfData.json', 'utf8'));
const mapping: Record<string, string> = JSON.parse(readFileSync('public/iconMapping.json', 'utf8'));
const silverhand = itemData.find(item => item.itemName === 'Silverhand - Mk. IV')!;
const falchion = itemData.find(item => item.itemName === '85K-b "Falchion"')!;
const bardiche = itemData.find(item => item.itemName === '86K-a "Bardiche"')!;
const stock = (meta: ItemDataEntry, crates: number, units: number) =>
  readStockQuantities(new Map([[`${meta.itemName} (Crate)`, crates], [meta.itemName, units]]), meta.itemName, meta, 'crate-equivalents-v1');
const section = (target = 10): Section => ({
  id: 'tanks', title: 'Tanks', color: '#123456', x: 0, y: 0, width: 200, height: 200,
  icons: [{ id: 'saved-tank', filename: silverhand.iconFilename.split('/').pop()!, iconId: 'old-basename',
    path: `/assets/icons/${silverhand.iconFilename}`, subtype: '/assets/icons/subtypes/SubtypeCrateIcon.png', quantity: target, gridRow: 0, gridCol: 0 }],
});
const unitSection = (target = 5, metadata = silverhand): Section => ({ ...section(target), icons: [{ ...section(target).icons[0],
  filename: metadata.iconFilename, path: `/assets/icons/${metadata.iconFilename}`, subtype: undefined }] });

describe('counts stock in units and only then derives crate equivalents', () => {
  test('Silverhand: 2 crates + 15 assembled = 21 units, short of 3 crates / 9 units', () => {
    const quantity = stock(silverhand, 2, 15);
    expect(quantity).toEqual({ crates: 2, units: 15, unitsPerCrate: 3, totalUnits: 21, equivalentCrates: 7 });
    expect(calculateCrateShortage(10, quantity, null, 5)).toEqual({
      cratesNeeded: 3, backlineAvailable: 0, toProduce: 3, orderCount: 1, missingUnits: 9,
    });
  });

  test('Falchion: the same physical stock represents 5 crates, not 7 or 17', () => {
    expect(stock(falchion, 2, 15).equivalentCrates).toBe(5);
    expect(calculateCrateShortage(10, stock(falchion, 2, 15), null, 5)).toMatchObject({ toProduce: 5, missingUnits: 25, orderCount: 1 });
  });

  test('subtracts Backline units before rounding the remaining production', () => {
    expect(calculateCrateShortage(1, stock(silverhand, 0, 1), stock(silverhand, 0, 2), 5)).toMatchObject({
      toProduce: 0, orderCount: 0, missingUnits: 0,
    });
    expect(calculateCrateShortage(6, stock(silverhand, 0, 2), stock(silverhand, 0, 1), 5)).toMatchObject({
      toProduce: 5, orderCount: 1, missingUnits: 15,
    });
  });

  test('one missing vehicle requires one produced crate; never a fractional order', () => {
    expect(calculateCrateShortage(1, stock(silverhand, 0, 2), null, 5)).toMatchObject({
      toProduce: 1, orderCount: 1, missingUnits: 1,
    });
  });

  test('surplus does not produce a negative shortage', () => {
    expect(calculateCrateShortage(1, stock(silverhand, 2, 15), null, 5)).toMatchObject({ toProduce: 0, orderCount: 0 });
  });

  test('unknown capacity does not guess how many vehicles make a crate', () => {
    const unknown = { ...silverhand, unitsPerCrate: null };
    const quantity = stock(unknown, 2, 1);
    expect(quantity.equivalentCrates).toBeNull();
    expect(calculateCrateShortage(10, quantity, null, 5)).toBeNull();
    expect(stock(unknown, 2, 0).equivalentCrates).toBe(2);
    expect(calculateCrateShortage(5, stock(unknown, 0, 0), null, 5, false)).toBeNull();
  });

  test('bare equipment CSV quantities are units in the new mode', () => {
    const rifle = itemData.find(item => item.itemName === 'Argenti r.II Rifle')!;
    expect(stock(rifle, 2, 3)).toMatchObject({ crates: 2, units: 3, totalUnits: 43, equivalentCrates: 2.15 });
  });

  test('the same rule applies to the actual CSV forms of ammunition and resources', () => {
    // Sanitized quantities from the two local public-depot examples, without their locations.
    const ammo = itemData.find(item => item.itemName === '7.92mm')!;
    const bmats = itemData.find(item => item.itemName === 'Basic Materials')!;
    expect(stock(ammo, 2, 103)).toMatchObject({ crates: 2, units: 103, totalUnits: 163 });
    expect(calculateCrateShortage(10, stock(ammo, 2, 103), null, 9)).toMatchObject({ missingUnits: 137, toProduce: 5, orderCount: 1 });
    expect(stock(bmats, 0, 400)).toMatchObject({ crates: 0, units: 400, equivalentCrates: 4 });
  });

  test('unpacked equipment is reported separately and is never relabelled as container crates or shippables', () => {
    const items = new Map([['7.92mm', 103], ['7.92mm (Crate)', 2], [silverhand.itemName, 9]]);
    const direct = new Set([silverhand.itemName]);
    const loose = new Set(['7.92mm']);
    expect(normalizeStockItems(items, direct, loose).find(item => item.itemName === '7.92mm'))
      .toEqual({ itemName: '7.92mm', crates: 2, assembled: 0, loose: 103 });
    expect(buildBacklineCargo(items, direct, new Set(), loose)).toEqual([
      { itemName: '7.92mm', quantity: 2, kind: 'container-crate' },
      { itemName: silverhand.itemName, quantity: 9, kind: 'assembled' },
    ]);
  });

  test('explicit import aliases are counted once and do not rewrite physical stock', () => {
    const shell = itemData.find(item => item.itemName === 'Flare Mortar Shell')!;
    const quantities = new Map([['Mortar Flare Shell (Crate)', 2], ['Flare Mortar Shell (Crate)', 3]]);
    expect(readStockQuantities(quantities, shell.itemName, shell, 'crate-equivalents-v1').crates).toBe(5);
    expect(quantities.size).toBe(2);
  });

  test('accepts the native slash spelling as well as the canonical ASCII ammunition name', () => {
    const ammo = itemData.find(item => item.itemName === 'AP/RPG')!;
    const quantities = new Map([['AP⧸RPG (Crate)', 2], ['AP/RPG', 3]]);
    expect(readStockQuantities(quantities, ammo.itemName, ammo, 'crate-equivalents-v1'))
      .toMatchObject({ crates: 2, units: 3, totalUnits: 2 * ammo.unitsPerCrate! + 3 });
  });

  test('legacy mode still adds the raw two forms without conversion', () => {
    expect(readStockQuantities(new Map([[`${silverhand.itemName} (Crate)`, 2], [silverhand.itemName, 15]]), silverhand.itemName, silverhand)
      .equivalentCrates).toBe(17);
  });

  test.each([-1, Infinity, 0.5])('rejects invalid inventory counts: %s', amount => {
    expect(() => stock(silverhand, amount, 0)).toThrow('Invalid stock quantity');
  });

  test('comparison exposes physical counters and the nine-unit Silverhand shortage', () => {
    const { rows } = buildComparison([section()], new Map([[`${silverhand.itemName} (Crate)`, 2], [silverhand.itemName, 15]]), mapping, null,
      { quantityMode: 'crate-equivalents-v1', itemData });
    expect(rows[0]).toMatchObject({ targetQty: 10, stockpileQty: 7, status: 'partial',
      quantities: { crates: 2, units: 15, totalUnits: 21, unitsPerCrate: 3 } });
  });

  test.each([bardiche, itemData.find(item => item.itemName === 'Shipping Container')!])('unmarked vehicle/structure targets use units: $itemName', metadata => {
    const csv = new Map([[metadata.itemName, 13]]);
    const target = unitSection(5, metadata);
    const context = { quantityMode: 'crate-equivalents-v1' as const, itemData };
    expect(buildComparison([target], csv, mapping, null, context).rows[0])
      .toMatchObject({ targetQty: 5, isCrateTarget: false, stockpileQty: 13, status: 'ok' });
    // An unrelated subtype must not turn the target into crates either.
    target.icons[0].subtype = '/assets/icons/subtypes/SubtypeFLIcon.png';
    expect(buildComparison([target], csv, mapping, null, context).rows[0].stockpileQty).toBe(13);
    target.icons[0].subtype = '/assets/icons/subtypes/SubtypeCrateIcon.png';
    expect(buildComparison([target], csv, mapping, null, context).rows[0])
      .toMatchObject({ targetQty: 5, isCrateTarget: true, stockpileQty: 13 / 3, status: 'partial' });
  });

  test('unit targets count both assembled stock and the actual contents of crates', () => {
    const csv = new Map([[`${bardiche.itemName} (Crate)`, 1], [bardiche.itemName, 10]]);
    expect(buildComparison([unitSection(5, bardiche)], csv, mapping, null,
      { quantityMode: 'crate-equivalents-v1', itemData }).rows[0])
      .toMatchObject({ stockpileQty: 13, quantities: { crates: 1, units: 10, totalUnits: 13 }, status: 'ok' });
    const unknown = { ...bardiche, unitsPerCrate: null };
    expect(buildComparison([unitSection(5, unknown)], new Map([[unknown.itemName, 13]]), mapping, null,
      { quantityMode: 'crate-equivalents-v1', itemData: [unknown] }).rows[0]).toMatchObject({ stockpileQty: 13, status: 'ok' });
    expect(buildComparison([unitSection(5, unknown)], csv, mapping, null,
      { quantityMode: 'crate-equivalents-v1', itemData: [unknown] }).rows[0].status).toBe('unknown');
  });

  test('unit targets convert only the remaining MPF production into crates, after subtracting Backline units', () => {
    expect(calculateCrateShortage(5, stock(silverhand, 0, 2), stock(silverhand, 0, 1), 5, false))
      .toMatchObject({ cratesNeeded: 1, backlineAvailable: 1 / 3, toProduce: 1, orderCount: 1, missingUnits: 2 });
    expect(calculateCrateShortage(5, stock(bardiche, 0, 13), null, 5, false))
      .toMatchObject({ toProduce: 0, orderCount: 0, missingUnits: 0 });
  });
});

describe('saved templates and explicit comparison migration', () => {
  let view: StockpileView;
  let container: HTMLDivElement;
  const originalFetch = global.fetch;
  const tick = () => new Promise(resolve => setTimeout(resolve, 15));
  beforeEach(() => {
    store.setItemData(itemData);
    store.setMpfData(mpfData);
    store.quantityMode = 'legacy';
    store.sections = [section()];
    localStorage.setItem('stockpile_tpl_source', 'current');
    localStorage.setItem('stockpile_csv_entries', JSON.stringify([{ id: 'main', header: null,
      items: { [`${silverhand.itemName} (Crate)`]: 2, [silverhand.itemName]: 15 }, label: 'Main', depotName: 'Main', role: 'intermediate' }]));
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => mapping });
    container = document.createElement('div'); document.body.appendChild(container);
    view = new StockpileView();
  });
  afterEach(() => {
    view.unmount(); document.body.innerHTML = '';
    global.fetch = originalFetch;
    store.setItemData([]); store.quantityMode = 'legacy';
  });

  test('an old document keeps its format until the user explicitly changes the calculation', async () => {
    const old: Template = { sections: [section()] };
    expect(store.importJSON(JSON.stringify(old))).toBe(true);
    expect(JSON.parse(store.exportJSON())).not.toHaveProperty('quantityMode');
    view.mount(container); await tick();
    expect(container.querySelector('[data-quantity-mode="legacy"]')).not.toBeNull();
    (container.querySelector('#btn-use-crate-equivalents') as HTMLButtonElement).click();
    const row = [...container.querySelectorAll('tbody tr')].find(row => row.textContent?.includes(silverhand.itemName))!;
    const cells = row.querySelectorAll('td');
    expect(cells[2].textContent?.trim()).toBe('7');
    expect(cells[4].textContent?.trim()).toBe('7');
    expect(cells[5].textContent?.trim()).toBe('10');
    expect(cells[6].textContent?.trim()).toBe('-3');
    expect(cells[4].dataset.quantityTooltip).toContain('2 crates + 15 unpacked units');
    expect(cells[6].dataset.quantityTooltip).toContain('9 units missing (or 3 crates missing)');
    expect(cells[6].hasAttribute('title')).toBe(false);
    expect(container.textContent).not.toContain('cr eq.');
    expect(container.textContent).not.toContain('units missing');
    expect(container.querySelector('thead')!.textContent).toContain('(crates)');
    cells[6].dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    const tooltip = document.querySelector<HTMLElement>('#stockpile-quantity-tooltip')!;
    expect(tooltip.classList.contains('hidden')).toBe(false);
    expect(tooltip.classList.contains('bg-gray-950')).toBe(true);
    expect(tooltip.querySelector('.text-red-400')!.textContent).toBe('9 units missing (or 3 crates missing)');
    expect(cells[6].getAttribute('aria-describedby')).toBe(tooltip.id);
    cells[6].dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(tooltip.classList.contains('hidden')).toBe(true);
    expect(cells[6].hasAttribute('aria-describedby')).toBe(false);
    cells[4].dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    expect(tooltip.textContent).toContain('21 units (3 per crate)');
    (container.querySelector('[data-stock-view="depots"]') as HTMLButtonElement).click();
    expect(tooltip.classList.contains('hidden')).toBe(true);
    const mainStock = [...container.querySelectorAll<HTMLTableCellElement>('td[data-quantity-tooltip]')]
      .find(cell => cell.dataset.quantityTooltip?.includes('2 crates + 15 unpacked units'))!;
    expect(mainStock.textContent?.trim()).toBe('7');
    expect(mainStock.dataset.quantityTooltip).toContain('9 units missing (or 3 crates missing)');
    expect(store.sections).toEqual(migrateTemplateAssets(old).sections);
    expect(JSON.parse(store.exportJSON()).quantityMode).toBe('crate-equivalents-v1');
    store.load(); expect(store.quantityMode).toBe('crate-equivalents-v1');
  });

  test('the new mode persists through JSON and localStorage without changing the target', () => {
    expect(store.importJSON(JSON.stringify({ sections: [section()], quantityMode: 'crate-equivalents-v1' }))).toBe(true);
    store.save(); store.quantityMode = 'legacy'; store.load();
    expect(store.quantityMode).toBe('crate-equivalents-v1');
    expect(store.sections[0].icons[0].quantity).toBe(10);
  });

  test.each([false, true])('Bardiche target packaging is respected in both tables and gap hovers (crated: %s)', async crated => {
    store.quantityMode = 'crate-equivalents-v1';
    store.sections = [unitSection(5, bardiche)];
    if (crated) store.sections[0].icons[0].subtype = '/assets/icons/subtypes/SubtypeCrateIcon.png';
    const before = JSON.stringify(store.sections);
    localStorage.setItem('stockpile_csv_entries', JSON.stringify([{ id: 'main', header: null,
      items: { [bardiche.itemName]: 13 }, label: 'Main', depotName: 'Main', role: 'intermediate' }]));
    view.mount(container); await tick();
    (container.querySelector('#btn-hide-ok') as HTMLButtonElement).click();
    const cells = [...container.querySelectorAll('tbody tr')].find(row => row.textContent?.includes(bardiche.itemName))!.querySelectorAll('td');
    expect(cells[2].textContent?.trim()).toBe(crated ? '4.33' : '13');
    expect(cells[4].textContent?.trim()).toBe(crated ? '4.33' : '13');
    expect(cells[5].textContent?.trim()).toBe('5');
    expect(cells[6].textContent?.trim()).toBe(crated ? '-1' : '+8');
    expect(cells[6].dataset.quantityTooltip).toContain(crated ? '2 units missing' : '8 units above target');
    expect(cells[7].textContent).toContain(crated ? 'Partial' : 'OK');
    expect(container.querySelector('thead')!.textContent).toContain(crated ? '(crates)' : '(units)');
    (container.querySelector('[data-stock-view="depots"]') as HTMLButtonElement).click();
    expect(container.querySelector('[data-intermediate-readiness]')!.textContent).toContain(crated ? '0%' : '100%');
    const depotCells = [...container.querySelectorAll('tbody tr')].find(row => row.textContent?.includes(bardiche.itemName))!.querySelectorAll('td');
    expect(depotCells[1].textContent?.trim()).toBe(crated ? '4.33' : '13');
    expect(depotCells[2].textContent?.trim()).toBe('5');
    expect(depotCells[3].textContent?.trim()).toBe(crated ? '-1' : '+8');
    expect(depotCells[3].dataset.quantityTooltip).toContain(crated ? '2 units missing' : '8 units above target');
    expect(JSON.stringify(store.sections)).toBe(before);
  });

  test('keeps ammunition depot tooltips in crates only in both Stockpile views', async () => {
    const ammo = itemData.find(item => item.itemName === '7.92mm')!;
    store.quantityMode = 'crate-equivalents-v1';
    store.sections = [{ ...section(), title: 'Ammo', icons: [{ ...section().icons[0],
      filename: ammo.iconFilename, path: `/assets/icons/${ammo.iconFilename}`, quantity: 10 }] }];
    localStorage.setItem('stockpile_csv_entries', JSON.stringify([{ id: 'main', header: null,
      items: { '7.92mm (Crate)': 2 }, label: 'Main', depotName: 'Main', role: 'intermediate' }]));
    view.mount(container); await tick();
    const row = [...container.querySelectorAll('tbody tr')].find(row => row.textContent?.includes('7.92mm'))!;
    const cells = row.querySelectorAll('td');
    expect(cells[4].textContent?.trim()).toBe('2');
    expect(cells[4].dataset.quantityTooltip).toBe('2 crates');
    expect(cells[6].textContent?.trim()).toBe('-8');
    expect(cells[6].dataset.quantityTooltip).toBe('2 crates\n8 crates missing');
    cells[6].dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    const tooltip = document.querySelector<HTMLElement>('#stockpile-quantity-tooltip')!;
    expect(tooltip.textContent).not.toContain('units');
    expect(tooltip.querySelector('.text-red-400')!.textContent).toBe('8 crates missing');
    (container.querySelector('[data-stock-view="depots"]') as HTMLButtonElement).click();
    const gap = [...container.querySelectorAll<HTMLTableCellElement>('td[data-quantity-tooltip]')]
      .find(cell => cell.dataset.quantityTooltip === '2 crates\n8 crates missing')!;
    expect(gap).toBeDefined();
    gap.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    expect(tooltip.textContent).not.toContain('units');
  });

  test.each(['legacy', 'crate-equivalents-v1'] as const)('shows the ordinary four-crate Factory cost on item hover in %s mode', async mode => {
    const firstAid = itemData.find(item => item.itemName === 'First Aid Kit')!;
    store.setItemData(itemData.map(item => item === firstAid
      ? { ...item, factory: { cost: { bmat: 60 }, maxCrates: 4 } } : item));
    store.quantityMode = mode;
    store.sections = [{ ...section(), title: 'Medical', icons: [{ ...section().icons[0],
      filename: firstAid.iconFilename, path: `/assets/icons/${firstAid.iconFilename}`, quantity: 100 }] }];
    view.mount(container); await tick();
    const item = container.querySelector<HTMLElement>('[data-production-tooltip]')!;
    expect(item.dataset.productionTooltip).toBe('Production\nFactory (4 crates)\nInputs: 240 Bmats');
    expect(item.hasAttribute('title')).toBe(false);
    expect(container.textContent).not.toContain('Factory (4 crates)');
    item.querySelector('img')!.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    const tooltip = document.querySelector<HTMLElement>('#stockpile-quantity-tooltip')!;
    expect(tooltip.classList.contains('hidden')).toBe(false);
    expect(tooltip.textContent).toContain('Factory (4 crates)Inputs: 240 Bmats');
    item.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(tooltip.classList.contains('hidden')).toBe(true);
    (container.querySelector('[data-stock-view="depots"]') as HTMLButtonElement).click();
    const depotItem = container.querySelector<HTMLElement>('[data-production-tooltip]')!;
    expect(depotItem.dataset.productionTooltip).toBe(item.dataset.productionTooltip);
    depotItem.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    expect(tooltip.textContent).toContain('Factory (4 crates)Inputs: 240 Bmats');
    expect(tooltip.classList.contains('hidden')).toBe(false);
  });

  test('shows the Garage unit cost, without applying a Factory queue or MPF crate multiplier', async () => {
    store.useCrateEquivalentQuantities();
    view.mount(container); await tick();
    const tooltip = container.querySelector<HTMLElement>('[data-production-tooltip]')!.dataset.productionTooltip!;
    expect(tooltip).toContain('Garage (1 unit)');
    expect(tooltip).toContain('160 Refined Materials');
    expect(tooltip).not.toContain('Factory');
  });

  test('displays Factory and facility options together in the themed Stockpile item tooltip', async () => {
    const ammo = itemData.find(item => item.itemName === '68mm')!;
    store.sections = [{ ...section(), title: 'Ammunition', icons: [{ ...section().icons[0],
      filename: ammo.iconFilename, path: `/assets/icons/${ammo.iconFilename}` }] }];
    view.mount(container); await tick();
    const item = container.querySelector<HTMLElement>('[data-production-tooltip]')!;
    item.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    const tooltip = document.querySelector<HTMLElement>('#stockpile-quantity-tooltip')!;
    expect(tooltip.classList.contains('hidden')).toBe(false);
    expect(tooltip.textContent).toContain('Factory (4 crates)');
    expect(tooltip.textContent).toContain('Infantry Kit Factory');
    expect(tooltip.textContent).toContain('(10 crates)');
    expect(tooltip.querySelectorAll('.text-blue-300')).toHaveLength(2);
    expect(container.textContent).not.toContain('Infantry Kit Factory');
  });

  test('refuses a future unknown quantity mode instead of silently choosing the historical calculation', async () => {
    const future = { sections: [section()], quantityMode: 'future-v2' };
    expect(store.importJSON(JSON.stringify(future))).toBe(false);
    const alert = jest.spyOn(window, 'alert').mockImplementation(() => {});
    view.mount(container); await tick();
    window.dispatchEvent(new CustomEvent('stockpile:load-tpl', {
      detail: { file: { name: 'future.json', text: async () => JSON.stringify(future) } },
    }));
    await tick();
    expect(alert).toHaveBeenCalledWith('Invalid template JSON');
    expect(store.stockpileTplSource).toBe('current');
    alert.mockRestore();
  });

  test('faction filtering uses the general catalogue for non-MPF vehicle variants', () => {
    const vulcan = itemData.find(item => item.itemName === 'H-19 "Vulcan"')!;
    store.setIcons([{ id: vulcan.iconFilename, filename: vulcan.iconFilename, displayName: vulcan.itemName,
      category: 'Vehicles', path: `/assets/icons/${vulcan.iconFilename}` }]);
    store.setViewMode('template'); store.setCategory('Toutes'); store.setSearch('');
    store.setTemplateFaction('warden'); expect(store.filteredIcons).toHaveLength(0);
    store.setTemplateFaction('colonial'); expect(store.filteredIcons).toHaveLength(1);
  });

  test.each([true, false])('MPF generation and transport Fit respect target packaging (crated: %s)', async crated => {
    if (!crated) store.sections = [unitSection(30)];
    const snapshots = JSON.parse(localStorage.getItem('stockpile_csv_entries')!);
    snapshots.push({ id: 'back', header: null, items: { [silverhand.itemName]: 60 }, label: 'Back', depotName: 'Back', role: 'backline' });
    localStorage.setItem('stockpile_csv_entries', JSON.stringify(snapshots));
    store.useCrateEquivalentQuantities();
    dismissCautionNotice();
    view.mount(container); await tick();
    (container.querySelector('#btn-generate-todolist') as HTMLButtonElement).click();
    expect(document.querySelector<HTMLTextAreaElement>('#discord-textarea')!.value).toContain('nothing to order');
    (document.querySelector('#close-shortage-modal') as HTMLButtonElement).click();
    (container.querySelector('[data-stock-view="depots"]') as HTMLButtonElement).click();
    (container.querySelector('#btn-prepare-transport') as HTMLButtonElement).click();
    const row = [...document.querySelectorAll('#transport-cargo-rows tr')].find(row => row.textContent?.includes(silverhand.itemName))!;
    expect(row.textContent).toContain('Assembled shippable');
    (row.querySelector('.transport-qty-fit') as HTMLButtonElement).click();
    expect(row.querySelector<HTMLInputElement>('.transport-qty')!.value).toBe('9');
    expect(row.querySelector('.transport-gap-cell')!.textContent).toBe('0');
  });

  test('transport Fit loads one physical crate for three missing vehicles in a unit target', async () => {
    store.sections = [unitSection(5)]; store.useCrateEquivalentQuantities();
    localStorage.setItem('stockpile_csv_entries', JSON.stringify([
      { id: 'main', header: null, items: { [silverhand.itemName]: 2 }, label: 'Main', depotName: 'Main', role: 'intermediate' },
      { id: 'back', header: null, items: { [`${silverhand.itemName} (Crate)`]: 5 }, label: 'Back', depotName: 'Back', role: 'backline' },
    ]));
    dismissCautionNotice(); view.mount(container); await tick();
    (container.querySelector('[data-stock-view="depots"]') as HTMLButtonElement).click();
    (container.querySelector('#btn-prepare-transport') as HTMLButtonElement).click();
    const row = [...document.querySelectorAll('#transport-cargo-rows tr')].find(row => row.textContent?.includes(silverhand.itemName))!;
    (row.querySelector('.transport-qty-fit') as HTMLButtonElement).click();
    expect(row.querySelector<HTMLInputElement>('.transport-qty')!.value).toBe('1');
    expect(row.querySelector('.transport-gap-cell')!.textContent).toBe('0');
  });

  test.each(['flatbed', 'train'])('replans missing physical crates in %s without counting the replaced delivery', async mode => {
    store.sections = [unitSection(5)]; store.useCrateEquivalentQuantities();
    localStorage.setItem('stockpile_csv_entries', JSON.stringify([
      { id: 'main', header: null, items: { [silverhand.itemName]: 2 }, label: 'Main', depotName: 'Main', role: 'intermediate' },
      { id: 'back', header: null, items: { [`${silverhand.itemName} (Crate)`]: 5 }, label: 'Back', depotName: 'Back', role: 'backline' },
    ]));
    dismissCautionNotice(); view.mount(container); await tick();
    (container.querySelector('[data-stock-view="depots"]') as HTMLButtonElement).click();
    (container.querySelector('#btn-prepare-transport') as HTMLButtonElement).click();
    const select = document.querySelector<HTMLSelectElement>('#transport-mode')!;
    select.value = mode;
    select.dispatchEvent(new Event('change'));
    (document.querySelector('#transport-auto-fill-gap') as HTMLButtonElement).click();
    const preview = (document.querySelector('#transport-preview') as HTMLTextAreaElement).value;
    expect(preview).toContain(`1 crated ${silverhand.itemName}`);
    expect(document.querySelector('#transport-summary')?.textContent).toContain('1 units planned');
    (document.querySelector('#transport-auto-fill-gap') as HTMLButtonElement).click();
    expect((document.querySelector('#transport-preview') as HTMLTextAreaElement).value).toBe(preview);
  });
});
