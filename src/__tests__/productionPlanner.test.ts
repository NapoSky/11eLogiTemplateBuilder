import { readFileSync } from 'node:fs';
import { store } from '../store';
import { Icon, MpfDataEntry, TodoList, TodoListItem } from '../types';
import type { ItemDataEntry } from '../services/gameData';
import { displayedCost, orderCrateCount } from '../services/mpfCalculator';
import { factoryTodoEntries, loadingSummary, materialLoads, productionTotals, truckPredeposit } from '../services/productionPlanner';
import { parseTodoList } from '../services/todoListParser';
import { renderTodoList } from '../services/todoListExporter';
import { TodoListView } from '../components/TodoListView';
import { IconSidebar } from '../components/IconSidebar';

const fixture = JSON.parse(readFileSync('src/__tests__/fixtures/production-planner.snapshot.json', 'utf8')) as {
  itemData: ItemDataEntry[]; mpfData: MpfDataEntry[]; icons: Array<{ filename: string; category: string }>;
};
const catalogue = fixture.itemData;
const mpf = fixture.mpfData;
const icons: Icon[] = fixture.icons.map(icon => ({
  ...icon, id: icon.filename, path: `/assets/icons/${icon.filename}`, displayName: icon.filename,
}));
const factories = factoryTodoEntries(catalogue, icons, mpf);
const tankEntry = mpf.find(item => item.iconFilename.endsWith('/WardenMediumTankIcon.png'))!;
const tank: TodoListItem = { ...tankEntry, id: 'tank', category: 'vehicles', orderCount: 1 };
const havoc: TodoListItem = { ...factories.find(item => item.itemName === 'Havoc Charge')!, id: 'havoc', orderCount: 2 };
const shirts: TodoListItem = { ...factories.find(item => item.itemName === 'Soldier Supplies')!, id: 'shirts', orderCount: 2 };
const list = (items: TodoListItem[]): TodoList => ({ title: 'RUN', autoDate: false, faction: 'all', items, textBlocks: [] });
let view: TodoListView | undefined;
let sidebar: IconSidebar | undefined;

beforeEach(() => {
  store.load();
  store.clearTodoList();
  store.clearProductionRun();
  store.setProductionWorkspace('todolist');
  store.setTodoListProductionSource('mpf', 'run');
  store.setProductionRunTransport('container');
  store.setTodoListProductionSource('factory', 'run');
  store.setItemData(catalogue);
  store.setMpfData(mpf);
  store.setIcons(icons);
  store.setSearch('');
  store.setCategory('Toutes');
  store.setViewMode('todolist');
});

afterEach(() => {
  sidebar?.destroy(); sidebar = undefined;
  view?.unmount(); view = undefined; document.body.innerHTML = '';
  store.clearTodoList(); store.setItemData([]); store.setIcons([]); store.setViewMode('template');
  store.setProductionWorkspace('todolist');
});

describe('production costs and input loads', () => {
  test.each([
    [{ bmat: 0, rmat: 1575, emat: 0, hemat: 0 }, { bmat: 0, rmat: 75, emat: 0, hemat: 0 }],
    [{ bmat: 0, rmat: 1600, emat: 0, hemat: 0 }, { bmat: 0, rmat: 100, emat: 0, hemat: 0 }],
    [{ bmat: 0, rmat: 1500, emat: 0, hemat: 0 }, { bmat: 0, rmat: 0, emat: 0, hemat: 0 }],
    [{ bmat: 0, rmat: 0, emat: 0, hemat: 0 }, { bmat: 0, rmat: 0, emat: 0, hemat: 0 }],
    [{ bmat: 1375, rmat: 101, emat: 40, hemat: 0 }, { bmat: 0, rmat: 1, emat: 40, hemat: 0 }],
    [{ bmat: 3000, rmat: 175, emat: 0, hemat: 0 }, { bmat: 1600, rmat: 75, emat: 0, hemat: 0 }],
  ])('identifies exact materials to predeposit for truck load %j', (totals, expected) => {
    expect(truckPredeposit(totals)).toEqual(expected);
    const remaining = { ...totals };
    for (const material of Object.keys(expected) as Array<keyof typeof expected>) remaining[material] -= expected[material];
    expect(Object.values(materialLoads(remaining, 'truck')).reduce((sum, slots) => sum + slots, 0)).toBeLessThanOrEqual(15);
  });

  test('Silverhand full and partial orders use successive discounts per order', () => {
    expect(displayedCost(tank).rmat).toBe(1680);
    const partial = { ...tank, cratesPerOrder: 3, orderCount: 2 };
    expect(displayedCost(partial).rmat).toBe(1152);
    expect(productionTotals([partial]).rmat).toBe(2304);
    expect(orderCrateCount({ ...tank, cratesPerOrder: 2 })).toBe(3);
    expect(orderCrateCount({ ...tank, cratesPerOrder: NaN })).toBe(5);
  });

  test('two Factory orders of Havoc and shirts have no MPF discounts', () => {
    expect(productionTotals([havoc, shirts])).toEqual({ bmat: 1240, rmat: 0, emat: 0, hemat: 320 });
    expect(loadingSummary([havoc, shirts], 'container', catalogue)).toMatchObject({ used: 24, capacity: 60, fits: true });
    expect(loadingSummary([havoc, shirts], 'truck', catalogue)).toMatchObject({ used: 17, capacity: 15, fits: false });
    expect(displayedCost({ ...havoc, cratesPerOrder: 1 })).toEqual({ bmat: 75, rmat: 0, emat: 0, hemat: 40 });
  });

  test('rounds per material after aggregating all lines and uses catalogue crate capacities', () => {
    const total = { bmat: 101, rmat: 21, emat: 41, hemat: 31 };
    expect(materialLoads(total, 'container', catalogue)).toEqual({ bmat: 2, rmat: 2, emat: 2, hemat: 2 });
    expect(materialLoads(total, 'truck', catalogue)).toEqual({ bmat: 2, rmat: 1, emat: 1, hemat: 1 });
    const one = { ...shirts, cratesPerOrder: 1, orderCount: 1, cost: { bmat: 40 } };
    expect(loadingSummary([one, { ...one, id: 'other' }], 'container').used).toBe(1);
    const custom = catalogue.map(item => item.itemName === 'Refined Materials' ? { ...item, unitsPerCrate: 40 } : item);
    expect(materialLoads(total, 'container', custom).rmat).toBe(1);
    expect(loadingSummary([], 'truck').used).toBe(0);
  });


});

describe('Factory catalogue, saved lists and Discord compatibility', () => {
  test('makes Factory-only tools and medical supplies available with their actual categories', () => {
    expect(havoc.category).toBe('utility');
    expect(shirts.category).toBe('medical');
    expect(factories.find(item => item.itemName === 'First Aid Kit')).toMatchObject({ category: 'medical', maxCrates: 4 });
    const variant: ItemDataEntry = { ...catalogue.find(item => item.itemName === 'Havoc Charge')!, iconFilename: 'facility-variant.png', iconUsage: 'facilities' };
    expect(factoryTodoEntries([...catalogue, variant], icons, mpf).some(item => item.iconFilename === variant.iconFilename)).toBe(false);
    store.setProductionWorkspace('run');
    expect(store.filteredIcons.some(icon => icon.filename === havoc.iconFilename)).toBe(true);
    expect(store.filteredIcons.some(icon => icon.filename === tank.iconFilename)).toBe(false);
  });

  test('MPF Todolist always uses the MPF catalogue, regardless of old saved building preferences', () => {
    const common = mpf.find(item => factories.some(factory => factory.iconFilename === item.iconFilename))!;
    store.addTodoListItemFromIcon(common.iconFilename);
    const old = JSON.parse(JSON.stringify(store.todolist.items[0]));
    store.setTodoListProductionSource('factory');
    expect(store.todolist.items[0]).toEqual(old);
    expect(store.addTodoListItemFromIcon(havoc.iconFilename)).toBe('not-mpf');
    store.todolist = { ...store.todolist, productionSource: 'factory' };
    store.addTodoListItemFromIcon(common.iconFilename);
    expect(store.todolist.items).toHaveLength(1);
    expect(store.todolist.items[0]).toMatchObject({ orderCount: 2, maxCrates: 9 });
    expect(store.filteredIcons.some(icon => icon.filename === havoc.iconFilename)).toBe(false);
  });

  test('persists a partial order without refreshing its recorded costs', () => {
    store.setTodoListProductionSource('mpf', 'run');
    store.productionRun = { ...list([{ ...tank, cost: { rmat: 465 } }]), productionSource: 'mpf' };
    store.setTodoListCratesPerOrder(tank.id, 3, 'run');
    store.setTodoListOrderCount(tank.id, 2, 'run');
    store.setMpfData([]);
    store.load();
    expect(store.productionRun.items[0]).toMatchObject({ cost: { rmat: 465 }, cratesPerOrder: 3, orderCount: 1 });
    expect(displayedCost(store.productionRun.items[0]).rmat).toBe(1115);
    store.setTodoListCratesPerOrder(tank.id, 2, 'run');
    expect(store.productionRun.items[0].cratesPerOrder).toBe(3);
    store.setTodoListCratesPerOrder(tank.id, Infinity, 'run');
    store.setTodoListOrderCount(tank.id, NaN, 'run');
    expect(store.productionRun.items[0]).toMatchObject({ cratesPerOrder: 3, orderCount: 1 });
  });

  test('round-trips mixed buildings and partial orders in Discord text', () => {
    const document = list([{ ...tank, cratesPerOrder: 3, orderCount: 2 }, havoc, shirts]);
    const exported = renderTodoList(document);
    expect(exported).toContain('[MPF: 3 crates/order]');
    expect(exported).toContain('[Factory: 4 crates/order]');
    const { result, warnings } = parseTodoList(exported, mpf, factories);
    expect(warnings).toEqual([]);
    expect(renderTodoList({ ...result, faction: 'all' })).toBe(exported);
    expect(productionTotals(result.items)).toEqual(productionTotals(document.items));
  });

  test('rejects impossible partial quantities rather than silently importing a full order', () => {
    const raw = renderTodoList(list([{ ...tank, cratesPerOrder: 3 }])).replace('3 crates/order', '2 crates/order');
    const { result, warnings } = parseTodoList(raw, mpf, factories);
    expect(result.items).toHaveLength(0);
    expect(warnings).toHaveLength(1);
  });

  test('keeps full historical MPF exports byte-compatible', () => {
    const exported = renderTodoList(list([tank]));
    expect(exported).not.toContain('crates/order');
    expect(exported).toContain('1680 Rmats');
    const { result } = parseTodoList(exported, mpf, factories);
    expect(result.items[0].cratesPerOrder).toBeUndefined();
    expect(result.items[0].productionSource).toBeUndefined();
    expect(renderTodoList({ ...result, faction: 'all' })).toBe(exported);
  });
});

describe('compact production UI', () => {
  test('shared faction buttons filter the active workspace and preserve the other faction choices', () => {
    const container = document.createElement('div'); document.body.append(container);
    store.setTemplateFaction('all'); store.setViewMode('template');
    sidebar = new IconSidebar(); sidebar.mount(container);
    const click = (faction: string) => container.querySelector<HTMLButtonElement>(`[data-faction="${faction}"]`)!.click();
    const active = () => container.querySelector<HTMLElement>('[data-faction][aria-pressed="true"]')?.dataset.faction;
    expect(Array.from(container.querySelectorAll<HTMLButtonElement>('[data-faction]')).map(button => button.textContent?.trim())).toEqual(['All', 'Warden', 'Colonial']);
    click('warden'); expect(store.templateFaction).toBe('warden');
    store.setViewMode('todolist');
    expect(active()).toBe('all');
    click('colonial');
    expect(store.todolist.faction).toBe('colonial');
    expect(container.querySelector(`[data-icon-filename="${tank.iconFilename}"]`)).toBeNull();
    click('all');
    expect(container.querySelector(`[data-icon-filename="${tank.iconFilename}"]`)).not.toBeNull();
    click('colonial');
    store.setProductionWorkspace('run');
    expect(active()).toBe('all');
    click('warden');
    expect(store.productionRun.faction).toBe('warden');
    expect(store.todolist.faction).toBe('colonial');
    store.setProductionWorkspace('todolist'); expect(active()).toBe('colonial');
    store.setViewMode('template'); expect(active()).toBe('warden');
  });

  test('sidebar categories follow Factory/MPF, remain stable while searching and return in Template', () => {
    const container = document.createElement('div'); document.body.append(container);
    sidebar = new IconSidebar(); sidebar.mount(container);
    const visible = () => Array.from(container.querySelectorAll<HTMLButtonElement>('[data-category]'))
      .filter(button => !button.hidden).map(button => button.dataset.category);
    expect(visible()).toEqual(['Toutes', 'heavy_ammunition', 'vehicles']);
    store.setProductionWorkspace('run');
    expect(visible()).toEqual(['Toutes', 'heavy_ammunition', 'utility', 'medical']);
    container.querySelector<HTMLButtonElement>('[data-category="medical"]')!.click();
    expect(store.filteredIcons.map(icon => icon.filename).sort()).toEqual([shirts.iconFilename, factories.find(item => item.itemName === 'First Aid Kit')!.iconFilename].sort());
    const input = container.querySelector<HTMLInputElement>('#search-input')!;
    input.focus(); input.value = 'No matching item'; input.dispatchEvent(new Event('input'));
    expect(visible()).toEqual(['Toutes', 'heavy_ammunition', 'utility', 'medical']);
    expect(document.activeElement).toBe(input);
    expect(container.querySelectorAll('.sidebar-icon')).toHaveLength(0);
    store.setCategory('medical');
    store.setTodoListProductionSource('mpf', 'run');
    expect(visible()).toEqual(['Toutes', 'heavy_ammunition', 'vehicles']);
    expect(store.selectedCategory).toBe('Toutes');
    store.setViewMode('template');
    expect(visible()).toContain('Planes');
    expect(visible()).toContain('Medical');
    store.setTodoListProductionSource('factory', 'run');
    store.setCategory('Vehicles');
    store.setViewMode('todolist');
    expect(store.selectedCategory).toBe('Toutes');
    expect(visible()).not.toContain('Vehicles');
  });

  test('groups the Production menu by recipe categories without changing icon categories or saved lists', () => {
    const extraIcons: Icon[] = [
      { id: 'field', filename: 'test-field.png', displayName: 'Field weapon', path: '/test-field.png', category: 'Field Weapons' },
      { id: 'naval', filename: 'test-naval.png', displayName: 'Boat', path: '/test-naval.png', category: 'Naval' },
      { id: 'structure', filename: 'test-structure.png', displayName: 'Structure', path: '/test-structure.png', category: 'Structures' },
      { id: 'supplies', filename: 'test-supplies.png', displayName: 'Supplies', path: '/test-supplies.png', category: 'Resources' },
    ];
    const extraEntries: MpfDataEntry[] = extraIcons.map(icon => ({
      ...tankEntry, iconFilename: icon.filename, itemName: icon.displayName,
      itemCategory: icon.id === 'supplies' ? 'supplies' : icon.id === 'structure' ? 'shipables' : 'vehicles',
    }));
    store.setIcons([...icons, ...extraIcons]);
    store.setMpfData([...mpf, ...extraEntries]);
    store.replaceTodoList(list([tank]));
    const savedTodo = localStorage.getItem('todolist');
    const savedRun = localStorage.getItem('productionRun');
    const originalIcons = JSON.stringify(store.icons);
    const originalRecipes = JSON.stringify(store.mpfData);
    const container = document.createElement('div'); document.body.append(container);
    sidebar = new IconSidebar(); sidebar.mount(container);
    const visibleLabels = () => Array.from(container.querySelectorAll<HTMLButtonElement>('[data-category]'))
      .filter(button => !button.hidden).map(button => button.textContent!.trim());
    expect(visibleLabels()).toEqual(['All', 'Heavy ammunition', 'Resources', 'Vehicles', 'Structures']);
    const vehicles = container.querySelector<HTMLButtonElement>('[data-category="vehicles"]')!;
    vehicles.focus(); vehicles.click();
    expect(document.activeElement).toBe(vehicles);
    expect(store.filteredIcons.map(icon => icon.filename).sort()).toEqual([tank.iconFilename, 'test-field.png', 'test-naval.png'].sort());
    store.setSearch('test-field');
    expect(store.filteredIcons.map(icon => icon.filename)).toEqual(['test-field.png']);
    expect(visibleLabels()).toEqual(['All', 'Heavy ammunition', 'Resources', 'Vehicles', 'Structures']);
    store.setSearch('');
    container.querySelector<HTMLButtonElement>('[data-category="shipables"]')!.click();
    expect(store.filteredIcons.map(icon => icon.filename)).toEqual(['test-structure.png']);
    container.querySelector<HTMLButtonElement>('[data-category="supplies"]')!.click();
    expect(store.filteredIcons.map(icon => icon.filename)).toEqual(['test-supplies.png']);
    store.setViewMode('template');
    expect(store.selectedCategory).toBe('Toutes');
    expect(visibleLabels()).toContain('Field Weapons');
    expect(visibleLabels()).toContain('Naval');
    container.querySelector<HTMLButtonElement>('[data-category="Field Weapons"]')!.click();
    expect(store.filteredIcons.map(icon => icon.filename)).toEqual(['test-field.png']);
    store.setViewMode('todolist');
    expect(store.selectedCategory).toBe('Toutes');
    expect(store.filteredIcons.map(icon => icon.filename)).toContain('test-naval.png');
    expect(JSON.stringify(store.icons)).toBe(originalIcons);
    expect(JSON.stringify(store.mpfData)).toBe(originalRecipes);
    expect(localStorage.getItem('todolist')).toBe(savedTodo);
    expect(localStorage.getItem('productionRun')).toBe(savedRun);
  });

  function mount() {
    const container = document.createElement('div');
    document.body.append(container);
    view = new TodoListView(); view.mount(container);
    return container;
  }

  test('explains the truck overflow in materials and hides the advice for containers or fitting loads', () => {
    store.setTodoListProductionSource('mpf', 'run');
    store.productionRun = { ...list([{ ...tank, cost: { rmat: 450 } }]), productionSource: 'mpf' };
    store.setProductionWorkspace('run');
    store.setProductionRunTransport('truck');
    const container = mount();
    expect(container.querySelector('#tl-transport-status')!.textContent).toContain('1 slot over capacity');
    expect(container.querySelector('#tl-predeposit')!.textContent).toBe('Deposit 75 Rmats in the MPF inventory beforehand so the remaining load fits in your truck.');
    store.setProductionRunTransport('container');
    expect(container.querySelector('#tl-predeposit')).toBeNull();
    store.setProductionRunTransport('truck');
    store.setTodoListCratesPerOrder(tank.id, 3, 'run');
    expect(container.querySelector('#tl-predeposit')).toBeNull();
    expect(container.querySelector('#tl-transport-status')!.textContent).toContain('Fits');
  });

  test('switches independent workspaces without loading the regiment shortage into the run', () => {
    store.replaceTodoList(list([tank]));
    const container = mount();
    expect(container.querySelector('#tl-preview')).not.toBeNull();
    expect(container.querySelector('#tl-panel-loading')).toBeNull();
    container.querySelector<HTMLButtonElement>('#tl-workspace-run')!.click();
    expect(container.querySelector('#tl-preview')).toBeNull();
    expect(container.querySelector('#tl-title')).toBeNull();
    expect(container.textContent).not.toContain('Personal draft');
    expect(container.querySelector('#tl-total-load')!.textContent).toBe('0');
    store.setTodoListProductionSource('mpf', 'run');
    store.addTodoListItemFromIcon(tank.iconFilename, 'run');
    store.setTodoListOrderCount(tank.id, 2);
    expect(container.querySelector('#tl-total-load')!.textContent).toBe('84');
    container.querySelector('#tl-workspace-run')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }));
    expect(container.querySelector('#tl-workspace-todolist')!.getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement?.id).toBe('tl-workspace-todolist');
    expect(container.querySelector('#tl-preview')!.textContent).toContain('(x2)');
    expect(store.productionRun.items[0].orderCount).toBe(1);
  });

  test('MPF Todolist has no building or crate controls and retains its saved order', () => {
    store.replaceTodoList(list([tank]));
    const saved = localStorage.getItem('todolist');
    const container = mount();
    expect(container.querySelector('#tl-workspace-todolist')!.textContent).toBe('MPF Todolist');
    expect(container.querySelector('[data-production-source]')).toBeNull();
    expect(container.querySelector('[data-action="toggle-crates"]')).toBeNull();
    expect(container.querySelector('[data-action="set-crates"]')).toBeNull();
    expect(container.querySelector('[data-action="add-to-run"]')).toBeNull();
    expect(container.textContent).not.toContain('Add to production run');
    store.setTodoListCratesPerOrder(tank.id, 3);
    expect(localStorage.getItem('todolist')).toBe(saved);
  });

  test('MPF crates are immediately editable with one queue and no multiplier or expander', () => {
    store.productionRun = { ...list([tank]), productionSource: 'mpf' };
    store.setProductionWorkspace('run');
    const container = mount();
    expect(container.querySelector('[data-action="set-count"]')).toBeNull();
    expect(container.querySelector('[data-action="toggle-crates"]')).toBeNull();
    expect(container.querySelector<HTMLDetailsElement>('#tl-transport-details')!.open).toBe(true);
    const initial = container.querySelector<HTMLInputElement>('[data-action="set-crates"]')!;
    expect(initial.value).toBe('5'); expect(initial.min).toBe('3'); expect(initial.max).toBe('5');
    expect(container.querySelector<HTMLButtonElement>('[data-action="increase-crates"]')!.disabled).toBe(true);
    container.querySelector<HTMLButtonElement>('[data-action="decrease-crates"]')!.click();
    expect(store.productionRun.items[0].cratesPerOrder).toBe(4);
    container.querySelector<HTMLButtonElement>('[data-action="decrease-crates"]')!.click();
    expect(store.productionRun.items[0].cratesPerOrder).toBe(3);
    expect(container.querySelector('#tl-total-load')!.textContent).toBe('58');
    expect(container.querySelector<HTMLButtonElement>('[data-action="decrease-crates"]')!.disabled).toBe(true);
    expect(container.querySelector('li[data-item-id]')!.textContent).toContain('1152 Rmats');
    expect(container.querySelector('#tl-transport-status')!.textContent).toContain('Fits');
    const transport = container.querySelector<HTMLSelectElement>('#tl-transport')!;
    transport.value = 'truck'; transport.dispatchEvent(new Event('change'));
    const quantity = container.querySelector<HTMLInputElement>('[data-action="set-crates"]')!;
    quantity.value = '4'; quantity.dispatchEvent(new Event('input'));
    expect(store.productionRun.items[0].cratesPerOrder).toBe(4);
    expect(container.querySelector('#tl-transport-capacity')!.textContent).toBe('15 / 15 slots');
    expect(document.activeElement?.getAttribute('data-action')).toBe('set-crates');
    const belowMinimum = container.querySelector<HTMLInputElement>('[data-action="set-crates"]')!;
    belowMinimum.value = '2'; belowMinimum.dispatchEvent(new Event('input'));
    expect(store.productionRun.items[0].cratesPerOrder).toBe(3);
    const empty = container.querySelector<HTMLInputElement>('[data-action="set-crates"]')!;
    empty.value = ''; empty.dispatchEvent(new Event('input')); empty.dispatchEvent(new Event('change'));
    expect(container.querySelector<HTMLInputElement>('[data-action="set-crates"]')!.value).toBe('3');
    container.querySelector<HTMLButtonElement>('[data-action="increase-crates"]')!.click();
    expect(store.productionRun.items[0].cratesPerOrder).toBe(4);
    expect(container.textContent).not.toContain('Fit to transport');
  });

  test('new MPF queues default to 9 crates for items and 5 for vehicles', () => {
    store.setProductionWorkspace('run');
    store.setTodoListProductionSource('mpf', 'run');
    const ammo = mpf.find(item => item.itemCategory === 'heavy_ammunition')!;
    store.addTodoListItemFromIcon(ammo.iconFilename, 'run');
    store.addTodoListItemFromIcon(tank.iconFilename, 'run');
    const container = mount();
    expect(container.querySelector<HTMLInputElement>('[data-category="heavy_ammunition"] [data-action="set-crates"]')!.value).toBe('9');
    expect(container.querySelector<HTMLInputElement>('[data-category="vehicles"] [data-action="set-crates"]')!.value).toBe('5');
    expect(container.querySelector('[data-action="set-count"]')).toBeNull();
  });

  test('three direct building buttons replace the profile selector and retain each saved production', () => {
    store.setProductionWorkspace('run');
    store.addTodoListItemFromIcon(havoc.iconFilename, 'run');
    const container = mount();
    expect(Array.from(container.querySelectorAll('[data-production-source]')).map(button => button.textContent?.trim())).toEqual(['Factory 1', 'Factory 2', 'MPF']);
    expect(container.querySelector('#tl-run-profile')).toBeNull();
    const factory = (profile: 1 | 2) => container.querySelector<HTMLButtonElement>(`[data-production-source="factory"][data-production-profile="${profile}"]`)!;
    const firstLoad = container.querySelector('#tl-total-load')!.textContent;
    factory(2).click();
    expect(document.activeElement).toBe(factory(2));
    expect(container.querySelector('#tl-total-load')!.textContent).toBe('0');
    expect(container.querySelector('h2')!.textContent).toContain('Factory 2');
    store.addTodoListItemFromIcon(shirts.iconFilename, 'run');
    expect(container.textContent).not.toContain('Havoc Charge');
    factory(1).click();
    expect(container.querySelector('#tl-total-load')!.textContent).toBe(firstLoad);
    expect(container.textContent).toContain('Havoc Charge');
    expect(container.textContent).not.toContain('Soldier Supplies');
    container.querySelector<HTMLButtonElement>('[data-production-source="mpf"]')!.click();
    expect(container.querySelector('h2')!.textContent?.trim()).toBe('Loading MPF');
    // Previously saved MPF profiles remain intact; the single MPF button opens the last active one.
    store.setProductionRunProfile(2); store.addTodoListItemFromIcon(tank.iconFilename, 'run');
    factory(2).click();
    expect(store.productionRunProfile).toBe(2);
    expect(container.textContent).toContain('Soldier Supplies');
    container.querySelector<HTMLButtonElement>('[data-production-source="mpf"]')!.click();
    expect(store.productionRunProfile).toBe(2);
    expect(container.textContent).toContain(tank.itemName);
    expect(container.querySelectorAll('[data-production-source][aria-pressed="true"]')).toHaveLength(1);
  });

  test('both factories share one truck calculation, allow 4+4 per category and warn when the combined materials exceed 15 slots', () => {
    store.setProductionWorkspace('run');
    store.addTodoListItemFromIcon(shirts.iconFilename, 'run');
    store.setProductionRunProfile(2);
    store.addTodoListItemFromIcon(shirts.iconFilename, 'run');
    const before = JSON.stringify([store.getProductionRunItems('factory', 1), store.getProductionRunItems('factory', 2)]);
    const container = mount();
    const toggle = () => container.querySelector<HTMLInputElement>('#tl-load-both-factories')!;
    expect(toggle().checked).toBe(false);
    toggle().checked = true; toggle().dispatchEvent(new Event('change'));
    expect(document.activeElement).toBe(toggle());
    expect(container.querySelector('h2')!.textContent).toContain('Both factories');
    expect(container.querySelector('[data-loading-material="bmat"]')!.textContent).toContain('640');
    // Eight crates of shirts cost 640 Bmats: pool them before rounding to 100-unit stacks.
    expect(container.querySelector('#tl-total-load')!.textContent).toBe('7');
    expect(container.querySelector('#tl-transport-capacity')!.textContent).toBe('7 / 15 slots');
    expect(container.querySelector('#tl-transport-status')!.textContent).toContain('Fits');
    expect(container.querySelector('section header')!.textContent).toContain('8 / 8 across both factories');
    expect(container.querySelector<HTMLInputElement>('[data-action="set-crates"]')!.max).toBe('4');
    expect(container.textContent).toContain('Produces 8 crates across both factories');
    expect(JSON.stringify([store.getProductionRunItems('factory', 1), store.getProductionRunItems('factory', 2)])).toBe(before);
    store.addTodoListItemFromIcon(havoc.iconFilename, 'run');
    store.setProductionRunProfile(1); store.addTodoListItemFromIcon(havoc.iconFilename, 'run');
    expect(container.querySelector('#tl-total-load')!.textContent).toBe('17');
    expect(container.querySelector('#tl-total-load')!.parentElement!.classList.contains('text-amber-300')).toBe(true);
    expect(container.querySelector('#tl-transport-status')!.textContent).toContain('2 slots over capacity');
    expect(container.querySelector('#tl-transport-status')!.classList.contains('text-amber-300')).toBe(true);
    expect(container.querySelector('#tl-predeposit')!.textContent).toContain('Deposit 40 Bmats + 20 HEmats in the Factory inventories');
    toggle().checked = false; toggle().dispatchEvent(new Event('change'));
    expect(container.querySelector('#tl-total-load')!.textContent).toBe('9');
    expect(container.querySelector('#tl-predeposit')).toBeNull();
    store.setTodoListProductionSource('mpf', 'run');
    expect(container.querySelector('#tl-load-both-factories')).toBeNull();
  });

  test('Factory mode in the run does not add anything to the regiment list', () => {
    store.replaceTodoList(list([tank]));
    store.productionRun = { ...list([tank]), productionSource: 'mpf' };
    store.setProductionWorkspace('run');
    const container = mount();
    container.querySelector<HTMLButtonElement>('[data-production-source="factory"]')!.click();
    store.addTodoListItemFromIcon(havoc.iconFilename, 'run');
    expect(store.todolist.items[0]).toEqual(tank);
    expect(container.querySelectorAll('li[data-item-id]')).toHaveLength(1);
    expect(store.todolist.items).toHaveLength(1);
    expect(container.querySelector('#tl-preview')).toBeNull();
    const newRow = container.querySelector<HTMLElement>(`[data-item-id="${store.productionRun.items[0].id}"]`)!;
    const input = newRow.querySelector<HTMLInputElement>('[data-action="set-crates"]')!;
    expect(input.value).toBe('4'); expect(input.min).toBe('1'); expect(input.max).toBe('4');
    expect(newRow.querySelector('[data-action="set-count"]')).toBeNull();
    expect(newRow.querySelector('[data-action="toggle-crates"]')).toBeNull();
    for (let n = 0; n < 3; n++) container.querySelector<HTMLButtonElement>('[data-action="decrease-crates"]')!.click();
    expect(store.productionRun.items[0].cratesPerOrder).toBe(1);
    expect(container.querySelector<HTMLButtonElement>('[data-action="decrease-crates"]')!.disabled).toBe(true);
    expect(container.querySelector('li[data-item-id]')!.textContent).toContain('75 Bmats');
  });

  test('Factory mixed assets share four crates, show their category total and clamp direct edits without changing siblings', () => {
    store.setProductionWorkspace('run');
    store.addTodoListItemFromIcon(shirts.iconFilename, 'run');
    const shirtId = store.productionRun.items[0].id;
    const aid = factories.find(item => item.itemName === 'First Aid Kit')!;
    const container = mount();
    const menu = document.createElement('div'); document.body.append(menu);
    sidebar = new IconSidebar(); sidebar.mount(menu);
    const addAid = () => Array.from(menu.querySelectorAll<HTMLElement>('.sidebar-icon'))
      .find(icon => icon.dataset.iconFilename === aid.iconFilename)!.dispatchEvent(new MouseEvent('dblclick'));
    addAid();
    expect(store.productionRun.items).toHaveLength(1);
    expect(document.body.textContent).toContain('Factory category full (4/4 crates)');
    const drop = new Event('drop', { bubbles: true, cancelable: true });
    Object.defineProperty(drop, 'dataTransfer', { value: { getData: () => JSON.stringify({ filename: aid.iconFilename, displayName: aid.itemName }) } });
    container.querySelector('#todolist-dropzone')!.dispatchEvent(drop);
    expect(store.productionRun.items.map(item => item.id)).toEqual([shirtId]);
    const edit = (id: string, value: string) => {
      const input = container.querySelector<HTMLInputElement>(`[data-item-id="${id}"] [data-action="set-crates"]`)!;
      input.value = value; input.dispatchEvent(new Event('input'));
    };
    edit(shirtId, '2'); addAid();
    expect(container.querySelectorAll('li[data-category="medical"]')).toHaveLength(2);
    expect(container.querySelector('section header')!.textContent).toContain('2 assets, 4 / 4 crates');
    const aidItem = { ...store.productionRun.items.find(item => item.itemName === 'First Aid Kit')! };
    const shirtInput = () => container.querySelector<HTMLInputElement>(`[data-item-id="${shirtId}"] [data-action="set-crates"]`)!;
    expect(shirtInput().max).toBe('2');
    expect(Array.from(container.querySelectorAll<HTMLButtonElement>('[data-action="increase-crates"]')).every(button => button.disabled)).toBe(true);
    const expected = loadingSummary(store.productionRun.items, 'truck');
    expect(container.querySelector('#tl-total-load')!.textContent).toBe(String(expected.used));
    edit(shirtId, '4');
    expect(shirtInput().value).toBe('2');
    expect(store.productionRun.items.find(item => item.id === aidItem.id)).toEqual(aidItem);
    container.querySelector<HTMLButtonElement>(`[data-item-id="${aidItem.id}"] [data-action="delete"]`)!.click();
    expect(shirtInput().max).toBe('4');
    container.querySelector<HTMLButtonElement>(`[data-item-id="${shirtId}"] [data-action="increase-crates"]`)!.click();
    expect(shirtInput().value).toBe('3');
    expect(container.querySelector('section header')!.textContent).toContain('1 asset, 3 / 4 crates');
  });

  test('Factory only allows loose truck loads, while MPF keeps its transport choice', () => {
    store.productionRun = { ...list([havoc, shirts].map(item => ({ ...item, orderCount: 1 }))), productionSource: 'factory' };
    store.setProductionWorkspace('run');
    const container = mount();
    expect(container.querySelector('#tl-transport')).toBeNull();
    expect(store.productionRunTransport).toBe('truck');
    expect(container.querySelector('#tl-total-load')!.textContent).toBe('9');
    expect(container.querySelector('#tl-total-load')!.getAttribute('data-unit')).toBe('slots');
    store.setProductionRunTransport('container');
    expect(store.productionRunTransport).toBe('truck');
    container.querySelector<HTMLButtonElement>('[data-production-source="mpf"]')!.click();
    expect(container.querySelectorAll('li[data-item-id]')).toHaveLength(0);
    expect(container.querySelectorAll('#tl-transport option')).toHaveLength(2);
    store.addTodoListItemFromIcon(tank.iconFilename, 'run');
    expect(container.querySelector('#tl-total-load')!.textContent).toBe('84');
    store.setProductionRunTransport('truck');
    expect(container.querySelector('#tl-total-load')!.textContent).toBe('17');
    container.querySelector<HTMLButtonElement>('[data-production-source="factory"]')!.click();
    expect(container.querySelectorAll('li[data-item-id]')).toHaveLength(2);
    container.querySelector<HTMLButtonElement>('[data-production-source="mpf"]')!.click();
    expect(container.querySelectorAll('li[data-item-id]')).toHaveLength(1);
    expect(store.productionRunTransport).toBe('truck');
  });

  test('copies the explicit partial-order export from the Discord tab', async () => {
    store.replaceTodoList(list([{ ...tank, cratesPerOrder: 3 }]));
    const writeText = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    const container = mount();
    container.querySelector<HTMLButtonElement>('#tl-copy')!.click();
    await Promise.resolve();
    expect(writeText).toHaveBeenCalledWith(renderTodoList(store.todolist));
    expect(writeText.mock.calls[0][0]).toContain('[MPF: 3 crates/order]');
  });


});

describe('independent workspace persistence', () => {
  test('combined Factory loading persists without merging profiles or changing MPF loading and Clear remains profile-specific', () => {
    store.addTodoListItemFromIcon(shirts.iconFilename, 'run');
    store.setProductionRunProfile(2); store.addTodoListItemFromIcon(shirts.iconFilename, 'run');
    store.setFactoryCombinedLoading(true);
    store.load();
    expect(store.factoryCombinedLoading).toBe(true);
    expect(store.productionRunProfile).toBe(2);
    expect(store.productionRun.items).toHaveLength(1);
    expect(store.productionLoadingItems).toHaveLength(2);
    expect(loadingSummary(store.productionLoadingItems, 'truck').used).toBe(7);
    store.setTodoListProductionSource('mpf', 'run');
    store.addTodoListItemFromIcon(tank.iconFilename, 'run');
    expect(store.productionLoadingItems).toEqual(store.productionRun.items);
    expect(store.productionLoadingItems).toHaveLength(1);
    store.setTodoListProductionSource('factory', 'run'); store.clearProductionRun();
    expect(store.productionRun.items).toHaveLength(0);
    expect(store.productionLoadingItems).toHaveLength(1);
    expect(orderCrateCount(store.productionLoadingItems[0])).toBe(4);
    store.load(); expect(store.productionLoadingItems).toHaveLength(1);
  });

  test('all four profiles retain their own quantities, factions and MPF transport after reload, and Clear affects one profile', () => {
    store.replaceTodoList(list([tank]));
    const originalTodo = localStorage.getItem('todolist');
    store.addTodoListItemFromIcon(shirts.iconFilename, 'run');
    store.setTodoListCratesPerOrder(store.productionRun.items[0].id, 2, 'run');
    store.setTodoListFaction('warden', 'run');
    const factory1 = JSON.parse(JSON.stringify(store.productionRun));
    store.setProductionRunProfile(2);
    expect(store.productionRun.items).toHaveLength(0);
    store.addTodoListItemFromIcon(shirts.iconFilename, 'run');
    expect(orderCrateCount(store.productionRun.items[0])).toBe(4);
    store.setTodoListFaction('colonial', 'run');
    const factory2 = JSON.parse(JSON.stringify(store.productionRun));
    store.setTodoListProductionSource('mpf', 'run');
    store.addTodoListItemFromIcon(tank.iconFilename, 'run');
    store.setTodoListCratesPerOrder(store.productionRun.items[0].id, 3, 'run');
    store.setProductionRunTransport('container');
    const mpf1 = JSON.parse(JSON.stringify(store.productionRun));
    store.setProductionRunProfile(2);
    expect(store.productionRunTransport).toBe('truck');
    store.addTodoListItemFromIcon(tank.iconFilename, 'run');
    expect(orderCrateCount(store.productionRun.items[0])).toBe(5);
    const mpf2 = JSON.parse(JSON.stringify(store.productionRun));
    store.load();
    expect(store.productionRunProfile).toBe(2); expect(store.productionRun).toEqual(mpf2);
    expect(store.productionRunTransport).toBe('truck');
    store.setProductionRunProfile(1);
    expect(store.productionRun).toEqual(mpf1); expect(store.productionRunTransport).toBe('container');
    store.setTodoListProductionSource('factory', 'run');
    expect(store.productionRunProfile).toBe(2); expect(store.productionRun).toEqual(factory2);
    expect(store.productionRunTransport).toBe('truck');
    store.clearProductionRun(); store.load();
    expect(store.productionRunProfile).toBe(2); expect(store.productionRun.items).toHaveLength(0);
    store.setProductionRunProfile(1); expect(store.productionRun).toEqual(factory1);
    store.setTodoListProductionSource('mpf', 'run'); expect(store.productionRun).toEqual(mpf1);
    store.setProductionRunProfile(2); expect(store.productionRun).toEqual(mpf2);
    expect(localStorage.getItem('todolist')).toBe(originalTodo);
  });

  test('version 2 drafts migrate into profile 1 unchanged and profile 2 starts empty for both buildings', () => {
    const factory = { ...list([{ ...shirts, orderCount: 1, cratesPerOrder: 2 }, { ...factories.find(item => item.itemName === 'First Aid Kit')!, id: 'aid', orderCount: 1, cratesPerOrder: 2 }]), productionSource: 'factory' };
    const oldMpf = { ...list([{ ...tank, cost: { rmat: 465 }, cratesPerOrder: 3 }]), productionSource: 'mpf' };
    localStorage.setItem('productionRun', JSON.stringify({ version: 2, source: 'mpf', runs: { factory, mpf: oldMpf }, mpfTransport: 'container' }));
    store.load();
    expect(store.productionRunProfile).toBe(1); expect(store.productionRun).toEqual(oldMpf);
    expect(store.productionRunTransport).toBe('container');
    store.setProductionRunProfile(2);
    expect(store.productionRun.items).toHaveLength(0); expect(store.productionRunTransport).toBe('truck');
    store.setTodoListProductionSource('factory', 'run');
    expect(store.productionRunProfile).toBe(1); expect(store.productionRun).toEqual(factory);
    store.setProductionRunProfile(2); expect(store.productionRun.items).toHaveLength(0);
    const saved = JSON.parse(localStorage.getItem('productionRun')!);
    expect(saved.version).toBe(3); expect(saved.runs.factory[0]).toEqual(factory); expect(saved.runs.mpf[0]).toEqual(oldMpf);
  });

  test('a damaged profile leaves the other three intact and invalid profile selections fall back to 1/2', () => {
    const factory = { ...list([{ ...shirts, orderCount: 1 }]), productionSource: 'factory' };
    const mpfDraft = { ...list([tank]), productionSource: 'mpf' };
    localStorage.setItem('productionRun', JSON.stringify({ version: 3, source: 'factory', selectedProfiles: { factory: 99, mpf: 2 },
      runs: { factory: [{ items: null }, factory], mpf: [mpfDraft, mpfDraft] }, mpfTransports: ['container', 'truck'] }));
    store.load();
    expect(store.productionRunProfile).toBe(1); expect(store.productionRun.items).toHaveLength(0);
    store.setProductionRunProfile(2); expect(store.productionRun).toEqual(factory);
    store.setTodoListProductionSource('mpf', 'run');
    expect(store.productionRunProfile).toBe(2); expect(store.productionRun).toEqual(mpfDraft);
    store.setProductionRunProfile(1); expect(store.productionRun).toEqual(mpfDraft);
    expect(store.productionRunTransport).toBe('container');
  });

  test('old run multipliers become one queue, with an untouched backup and unchanged regiment todo', () => {
    store.replaceTodoList(list([{ ...tank, orderCount: 40 }]));
    const savedTodo = localStorage.getItem('todolist');
    const old = JSON.stringify({ version: 2, source: 'mpf', mpfTransport: 'container', runs: {
      factory: { ...list([havoc, shirts]), productionSource: 'factory' },
      mpf: { ...list([{ ...tank, cratesPerOrder: 3, orderCount: 4 }]), productionSource: 'mpf' },
    } });
    localStorage.setItem('productionRun', old);
    store.load();
    expect(store.productionRun.items[0]).toMatchObject({ orderCount: 1, cratesPerOrder: 3 });
    expect(loadingSummary(store.productionRun.items, 'container').used).toBe(58);
    expect(localStorage.getItem('productionRun_beforeSingleOrder')).toBe(old);
    store.setTodoListCratesPerOrder(tank.id, 4, 'run');
    store.setTodoListOrderCount(tank.id, 20, 'run');
    expect(store.productionRun.items[0].orderCount).toBe(1);
    store.setTodoListProductionSource('factory', 'run');
    expect(store.productionRun.items.map(item => item.orderCount)).toEqual([1, 1]);
    expect(loadingSummary(store.productionRun.items, 'truck').used).toBe(9);
    store.load();
    expect(localStorage.getItem('productionRun_beforeSingleOrder')).toBe(old);
    expect(localStorage.getItem('todolist')).toBe(savedTodo);
  });

  test('MPF run replaces an occupied category while retaining other categories and the regiment todo', () => {
    const alternative: MpfDataEntry = { ...tankEntry, iconFilename: 'other-tank.png', itemName: 'Other tank', cost: { rmat: 300 } };
    store.setMpfData([...mpf, alternative]);
    store.addTodoListItemFromIcon(tank.iconFilename);
    store.addTodoListItemFromIcon(alternative.iconFilename);
    expect(store.todolist.items).toHaveLength(2);
    const savedTodo = localStorage.getItem('todolist');
    store.setProductionWorkspace('run');
    store.setTodoListProductionSource('mpf', 'run');
    store.addTodoListItemFromIcon(tank.iconFilename, 'run');
    const oldId = store.productionRun.items[0].id;
    store.setTodoListCratesPerOrder(oldId, 3, 'run');
    store.setTodoListOrderCount(oldId, 4, 'run');
    const ammo = mpf.find(item => item.itemCategory === 'heavy_ammunition')!;
    store.addTodoListItemFromIcon(ammo.iconFilename, 'run');
    const otherCategory = { ...store.productionRun.items.find(item => item.category === 'heavy_ammunition')! };
    store.addTodoListItemFromIcon(alternative.iconFilename, 'run');
    expect(store.productionRun.items).toHaveLength(2);
    expect(store.productionRun.items.find(item => item.category === 'vehicles')).toMatchObject({ itemName: 'Other tank', orderCount: 1, cost: { rmat: 300 } });
    expect(store.productionRun.items.find(item => item.category === 'vehicles')!.id).not.toBe(oldId);
    expect(store.productionRun.items.find(item => item.category === 'heavy_ammunition')).toEqual(otherCategory);
    store.addTodoListItemFromIcon(alternative.iconFilename, 'run');
    expect(store.productionRun.items).toHaveLength(2);
    expect(store.productionRun.items.find(item => item.category === 'vehicles')!.orderCount).toBe(1);
    store.load();
    expect(store.productionRun.items.filter(item => item.category === 'vehicles')).toHaveLength(1);
    expect(localStorage.getItem('todolist')).toBe(savedTodo);
  });

  test('Factory run mixes assets within its category budget without changing other categories or the MPF draft', () => {
    store.setProductionWorkspace('run');
    store.setTodoListProductionSource('mpf', 'run');
    store.addTodoListItemFromIcon(tank.iconFilename, 'run');
    const mpfDraft = JSON.parse(JSON.stringify(store.productionRun));
    store.setTodoListProductionSource('factory', 'run');
    store.addTodoListItemFromIcon(havoc.iconFilename, 'run');
    store.addTodoListItemFromIcon(shirts.iconFilename, 'run');
    const utility = { ...store.productionRun.items[0] };
    const aid = factories.find(item => item.itemName === 'First Aid Kit')!;
    const savedFull = localStorage.getItem('productionRun');
    expect(store.addTodoListItemFromIcon(aid.iconFilename, 'run')).toBe('category-full');
    expect(localStorage.getItem('productionRun')).toBe(savedFull);
    const shirtId = store.productionRun.items.find(item => item.itemName === 'Soldier Supplies')!.id;
    store.setTodoListCratesPerOrder(shirtId, 2, 'run');
    expect(store.addTodoListItemFromIcon(aid.iconFilename, 'run')).toBe('added');
    expect(store.productionRun.items).toHaveLength(3);
    expect(store.productionRun.items.filter(item => item.category === 'medical').map(item => [item.itemName, orderCrateCount(item)]))
      .toEqual([['Soldier Supplies', 2], ['First Aid Kit', 2]]);
    const aidId = store.productionRun.items.find(item => item.itemName === 'First Aid Kit')!.id;
    store.setTodoListCratesPerOrder(aidId, 4, 'run');
    expect(orderCrateCount(store.productionRun.items.find(item => item.id === aidId)!)).toBe(2);
    const factoryDraft = JSON.parse(JSON.stringify(store.productionRun));
    expect(store.productionRun.items.find(item => item.category === 'utility')).toEqual(utility);
    store.load();
    expect(store.productionRun).toEqual(factoryDraft);
    expect(localStorage.getItem('productionRun_beforeFactoryCapacity')).toBeNull();
    store.setTodoListProductionSource('mpf', 'run');
    expect(store.productionRun).toEqual(mpfDraft);
  });

  test('Factory can mix four distinct one-crate assets and refuses a fifth without replacing any', () => {
    store.setProductionWorkspace('run');
    const base = catalogue.find(item => item.itemName === 'First Aid Kit')!;
    const candidates = Array.from({ length: 5 }, (_, index) => ({ ...base, itemName: `Medical item ${index}`, iconFilename: `test-medical-${index}.png` }));
    store.setItemData([...catalogue, ...candidates]);
    store.setIcons([...icons, ...candidates.map(item => ({ id: item.iconFilename, filename: item.iconFilename, displayName: item.itemName, path: item.iconFilename, category: 'Medical' as const }))]);
    for (const entry of candidates.slice(0, 4)) {
      expect(store.addTodoListItemFromIcon(entry.iconFilename, 'run')).toBe('added');
      const added = store.productionRun.items.find(item => item.itemName === entry.itemName)!;
      store.setTodoListCratesPerOrder(added.id, 1, 'run');
    }
    const before = JSON.stringify(store.productionRun);
    expect(store.addTodoListItemFromIcon(candidates[4].iconFilename, 'run')).toBe('category-full');
    expect(JSON.stringify(store.productionRun)).toBe(before);
    expect(store.productionRun.items.map(orderCrateCount)).toEqual([1, 1, 1, 1]);
    store.load();
    expect(JSON.stringify(store.productionRun)).toBe(before);
  });

  test('old duplicate queues keep their last selection and retain a copy of the original cache', () => {
    store.replaceTodoList(list([{ ...tank, orderCount: 40 }]));
    const savedTodo = localStorage.getItem('todolist');
    const latest = { ...tank, id: 'latest-tank', cratesPerOrder: 3, orderCount: 2, cost: { rmat: 465 } };
    const aid: TodoListItem = { ...factories.find(item => item.itemName === 'First Aid Kit')!, id: 'aid', orderCount: 1 };
    const old = JSON.stringify({ version: 2, source: 'mpf', mpfTransport: 'truck', runs: {
      factory: { ...list([shirts, havoc, aid]), productionSource: 'factory' },
      mpf: { ...list([tank, latest]), productionSource: 'mpf' },
    } });
    localStorage.setItem('productionRun', old);
    store.load();
    expect(store.productionRun.items).toEqual([{ ...latest, orderCount: 1 }]);
    expect(localStorage.getItem('productionRun_beforeSingleQueue')).toBe(old);
    store.setTodoListProductionSource('factory', 'run');
    expect(store.productionRun.items.map(item => item.id)).toEqual(['havoc', 'aid']);
    expect(localStorage.getItem('productionRun_beforeFactoryCapacity')).toBe(old);
    store.load();
    expect(store.productionRun.items.map(item => item.id)).toEqual(['havoc', 'aid']);
    expect(localStorage.getItem('productionRun_beforeSingleQueue')).toBe(old);
    expect(localStorage.getItem('todolist')).toBe(savedTodo);
  });

  test('overfull historical mixed Factory crates retain the latest quantities within four and back up the original', () => {
    const aid = { ...factories.find(item => item.itemName === 'First Aid Kit')!, id: 'aid', orderCount: 1, cratesPerOrder: 3 };
    const old = JSON.stringify({ version: 2, source: 'factory', runs: {
      factory: { ...list([{ ...shirts, orderCount: 1, cratesPerOrder: 3 }, aid]), productionSource: 'factory' },
      mpf: { ...list([tank]), productionSource: 'mpf' },
    } });
    localStorage.setItem('productionRun', old); store.load();
    expect(store.productionRun.items.map(item => [item.id, orderCrateCount(item)])).toEqual([['shirts', 1], ['aid', 3]]);
    expect(localStorage.getItem('productionRun_beforeFactoryCapacity')).toBe(old);
    store.setTodoListCratesPerOrder('aid', 2, 'run'); store.load();
    expect(store.productionRun.items.map(item => [item.id, orderCrateCount(item)])).toEqual([['shirts', 1], ['aid', 2]]);
    expect(localStorage.getItem('productionRun_beforeFactoryCapacity')).toBe(old);
  });

  test('a category shared by Factory and MPF remains separate when an old mixed draft is loaded', () => {
    const ammo = mpf.find(item => item.itemCategory === 'heavy_ammunition')!;
    const factory = factories.find(item => item.iconFilename === ammo.iconFilename)!;
    const factoryAmmo: TodoListItem = { ...factory, id: 'factory-ammo', orderCount: 1 };
    const mpfAmmo: TodoListItem = { ...ammo, category: ammo.itemCategory, id: 'mpf-ammo', orderCount: 1 };
    localStorage.setItem('productionRun', JSON.stringify({ ...list([factoryAmmo, mpfAmmo]), productionSource: 'factory' }));
    store.load();
    expect(store.productionRun.items).toEqual([factoryAmmo]);
    store.setTodoListProductionSource('mpf', 'run');
    expect(store.productionRun.items).toEqual([mpfAmmo]);
    expect(localStorage.getItem('productionRun_beforeSingleQueue')).toBeNull();
  });

  test('Factory and MPF keep separate titles, factions, quantities and clear operations after reload', () => {
    store.replaceTodoList(list([{ ...tank, orderCount: 40 }]));
    const savedTodo = localStorage.getItem('todolist');
    store.setProductionWorkspace('run');
    store.addTodoListItemFromIcon(havoc.iconFilename, 'run');
    store.setTodoListTitle('Factory loop', 'run');
    store.setTodoListFaction('warden', 'run');
    const factoryId = store.productionRun.items[0].id;
    store.setTodoListOrderCount(factoryId, 2, 'run');
    store.setTodoListProductionSource('mpf', 'run');
    expect(store.productionRun.items).toHaveLength(0);
    store.addTodoListItemFromIcon(tank.iconFilename, 'run');
    store.setTodoListTitle('MPF trip', 'run');
    store.setTodoListFaction('colonial', 'run');
    store.setTodoListCratesPerOrder(store.productionRun.items[0].id, 3, 'run');
    store.setProductionRunTransport('truck');
    store.setTodoListProductionSource('factory', 'run');
    expect(store.productionRun).toMatchObject({ title: 'Factory loop', faction: 'warden' });
    expect(store.productionRun.items[0]).toMatchObject({ id: factoryId, orderCount: 1 });
    store.clearProductionRun();
    store.load();
    expect(store.productionRunSource).toBe('factory');
    expect(store.productionRun.items).toHaveLength(0);
    store.setTodoListProductionSource('mpf', 'run');
    expect(store.productionRun).toMatchObject({ title: 'MPF trip', faction: 'colonial' });
    expect(store.productionRun.items[0]).toMatchObject({ cratesPerOrder: 3, cost: { rmat: 480 } });
    expect(store.productionRunTransport).toBe('truck');
    expect(localStorage.getItem('todolist')).toBe(savedTodo);
  });

  test('splits an old mixed run into both building drafts without losing recorded prices or quantities', () => {
    store.replaceTodoList(list([{ ...tank, orderCount: 40 }]));
    const savedTodo = localStorage.getItem('todolist');
    const old = { ...list([{ ...tank, cost: { rmat: 465 }, orderCount: 3 }, havoc, shirts]), productionSource: 'factory' };
    localStorage.setItem('productionRun', JSON.stringify(old));
    store.load();
    expect(store.productionRun.items.map(item => item.id)).toEqual(['havoc', 'shirts']);
    store.setTodoListProductionSource('mpf', 'run');
    expect(store.productionRun.items).toHaveLength(1);
    expect(store.productionRun.items[0]).toMatchObject({ id: 'tank', cost: { rmat: 465 }, orderCount: 1 });
    expect(JSON.parse(localStorage.getItem('productionRun')!).version).toBe(3);
    store.load();
    expect(store.productionRun.items[0].cost.rmat).toBe(465);
    store.setTodoListProductionSource('factory', 'run');
    expect(store.productionRun.items).toEqual([havoc, shirts].map(item => ({ ...item, orderCount: 1 })));
    expect(store.productionRunTransport).toBe('truck');
    expect(localStorage.getItem('todolist')).toBe(savedTodo);
  });

  test('one corrupted building draft does not discard the other building or the MPF todo', () => {
    store.replaceTodoList(list([tank]));
    localStorage.setItem('productionRun', JSON.stringify({
      version: 2, source: 'mpf', mpfTransport: 'truck', runs: { factory: { items: null }, mpf: list([tank]) },
    }));
    store.load();
    expect(store.productionRun.items).toEqual([tank]);
    expect(store.productionRunTransport).toBe('truck');
    store.setTodoListProductionSource('factory', 'run');
    expect(store.productionRun.items).toHaveLength(0);
    expect(store.todolist.items).toEqual([tank]);
  });

  test('edits, reorder, delete and clear in the run never save over the cached todo', () => {
    store.replaceTodoList(list([{ ...tank, orderCount: 40 }]));
    const original = localStorage.getItem('todolist');
    store.setProductionWorkspace('run');
    store.setTodoListTitle('Personal loop', 'run');
    store.setTodoListFaction('warden', 'run');
    store.addTodoListItemFromIcon(havoc.iconFilename, 'run');
    store.addTodoListItemFromIcon(shirts.iconFilename, 'run');
    const id = store.productionRun.items[0].id;
    store.setTodoListOrderCount(id, 2, 'run');
    store.setTodoListCratesPerOrder(id, 3, 'run');
    store.reorderTodoListItems('utility', [id], 'run');
    expect(localStorage.getItem('todolist')).toBe(original);
    expect(JSON.parse(localStorage.getItem('productionRun')!).runs.factory[0].items.find((item: TodoListItem) => item.id === id)).toMatchObject({ orderCount: 1, cratesPerOrder: 3 });
    store.removeTodoListItem(id, 'run');
    store.clearProductionRun();
    expect(store.productionRun.items).toHaveLength(0);
    expect(localStorage.getItem('todolist')).toBe(original);
  });

  test('restores both documents, the active workspace and transport after reload', () => {
    store.replaceTodoList(list([{ ...tank, orderCount: 20, cost: { rmat: 465 } }]));
    const original = localStorage.getItem('todolist');
    store.setTodoListTitle('My loop', 'run');
    store.setTodoListFaction('colonial', 'run');
    store.addTodoListItemFromIcon(havoc.iconFilename, 'run');
    store.setTodoListOrderCount(store.productionRun.items[0].id, 2, 'run');
    store.setProductionRunTransport('truck');
    store.setProductionWorkspace('run');
    const personal = JSON.parse(localStorage.getItem('productionRun')!);
    store.todolist = list([]); store.productionRun = list([]);
    store.load();
    expect(store.productionRun).toEqual(personal.runs.factory[0]);
    expect(store.todolist.items[0]).toMatchObject({ orderCount: 20, cost: { rmat: 465 } });
    expect(store.productionWorkspace).toBe('run');
    expect(store.productionRunTransport).toBe('truck');
    expect(localStorage.getItem('todolist')).toBe(original);
    const runBefore = localStorage.getItem('productionRun');
    store.clearTodoList();
    expect(localStorage.getItem('productionRun')).toBe(runBefore);
  });

  test('a corrupted personal draft does not prevent loading the existing todo', () => {
    store.replaceTodoList(list([tank]));
    localStorage.setItem('productionRun', '{broken');
    store.load();
    expect(store.todolist.items).toEqual([tank]);
    expect(store.productionRun.items).toHaveLength(0);
    expect(store.productionRun.productionSource).toBe('factory');
    localStorage.setItem('productionRun', JSON.stringify({ items: null }));
    store.load();
    expect(store.todolist.items).toEqual([tank]);
  });

  test('an old browser with only a cached todo starts with an empty independent run', () => {
    store.replaceTodoList(list([{ ...tank, orderCount: 40 }]));
    localStorage.removeItem('productionRun');
    localStorage.removeItem('productionWorkspace');
    store.load();
    expect(store.productionWorkspace).toBe('todolist');
    expect(store.productionRun.items).toHaveLength(0);
    expect(store.todolist.items[0].orderCount).toBe(40);
    store.setTodoListProductionSource('mpf', 'run');
    expect(store.productionRunTransport).toBe('truck');
  });





  test('the sidebar follows each workspace’s own faction and building', () => {
    store.setTodoListFaction('warden');
    store.setTodoListProductionSource('mpf', 'run');
    store.setTodoListFaction('colonial', 'run');
    store.setProductionWorkspace('run');
    expect(store.filteredIcons.some(icon => icon.filename === tank.iconFilename)).toBe(false);
    store.setProductionWorkspace('todolist');
    expect(store.filteredIcons.some(icon => icon.filename === tank.iconFilename)).toBe(true);
    expect(store.productionRun.faction).toBe('colonial');
  });
});
