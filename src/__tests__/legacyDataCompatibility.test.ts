/**
 * Characterization before the wiki migration. These are historical inputs,
 * including incorrect labels. They do not prescribe future unit semantics.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { SectionComponent } from '../components/Section';
import { TodoListView } from '../components/TodoListView';
import { buildComparison, parseCSV } from '../components/StockpileView';
import { normalizeStockItems } from '../services/stockpileLogistics';
import { displayedCost } from '../services/mpfCalculator';
import { parseTodoList } from '../services/todoListParser';
import { renderTodoList } from '../services/todoListExporter';
import { store } from '../store';
import { MPF_CATEGORIES, MpfDataEntry, Template, TodoList, TodoListItem } from '../types';
import { migrateTemplateAssets, migrateTodoListItem, resolveIconPath } from '../services/iconPaths';

jest.mock('interactjs', () => {
  const interact = jest.fn().mockReturnValue({
    draggable: jest.fn().mockReturnThis(),
    resizable: jest.fn().mockReturnThis(),
    dropzone: jest.fn().mockReturnThis(),
    unset: jest.fn(),
  });
  interact.modifiers = { restrictRect: jest.fn(), restrictSize: jest.fn() };
  return interact;
});

const fixture = JSON.parse(readFileSync(resolve(
  process.cwd(), 'src/__tests__/fixtures/legacy-data-contract.json',
), 'utf8')) as {
  iconMapping: Record<string, string>;
  mpfData: MpfDataEntry[];
  template: Template;
};

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const tankFilename = 'UI/VehicleIcons/MortarTankVehicleIcon.png';
const historicalTankName = fixture.iconMapping[tankFilename];
let sectionView: SectionComponent | undefined;
let todoView: TodoListView | undefined;

beforeEach(() => {
  store.sections = [];
  store.setMpfData(clone(fixture.mpfData));
  store.clearTodoList();
  store.setViewMode('template');
  store.setTemplateFaction('all');
  store.setCategory('Toutes');
  store.setSearch('');
});

afterEach(() => {
  sectionView?.destroy();
  todoView?.unmount();
  sectionView = undefined;
  todoView = undefined;
  document.body.innerHTML = '';
  jest.restoreAllMocks();
});

describe('historical template documents and rendering', () => {
  test('migrates asset references while retaining quantities, overlays and instance identifiers', () => {
    expect(store.importJSON(JSON.stringify(fixture.template))).toBe(true);
    const exported = JSON.parse(store.exportJSON()) as Template;
    expect(exported.sections).toEqual(migrateTemplateAssets(fixture.template).sections);
    expect(store.sections[0].icons[0].filename).toBe('Textures/UI/VehicleIcons/MortarTankVehicleIcon.png');
    expect(store.sections[0].icons[0].id).toBe(fixture.template.sections[0].icons[0].id);
  });

  test.each(['referenceTemplate.json', 'referenceTemplateColonial.json'])(
    'round-trips the bundled %s without changing assets or targets while repairing overlaps', filename => {
      const template = JSON.parse(readFileSync(resolve('public', filename), 'utf8')) as Template;
      expect(store.importJSON(JSON.stringify(template))).toBe(true);
      const exported = JSON.parse(store.exportJSON()) as Template;
      const withoutPositions = (sections: Template['sections']) => sections.map(section => ({
        ...section, icons: section.icons.map(({ gridRow: _row, gridCol: _col, ...icon }) => icon),
      }));
      expect(withoutPositions(exported.sections)).toEqual(withoutPositions(template.sections));
      for (const section of exported.sections) {
        expect(new Set(section.icons.map(icon => `${icon.gridRow},${icon.gridCol}`)).size).toBe(section.icons.length);
      }
    },
  );

  test('all historical image paths and overlay paths still resolve to local assets', () => {
    for (const section of fixture.template.sections) {
      for (const icon of section.icons) {
        expect(existsSync(resolve('public', resolveIconPath(icon.path).slice(1)))).toBe(true);
        if (icon.subtype) expect(existsSync(resolve('public', icon.subtype.slice(1)))).toBe(true);
      }
    }
  });

  test('draws the saved image and crate overlay without deriving either from the display name', () => {
    const section = clone(fixture.template.sections[0]);
    sectionView = new SectionComponent(section, jest.fn(), jest.fn());
    const el = sectionView.getElement();
    const normal = el.querySelector('[data-icon-instance-id="legacy-icon-0"]')!;
    const crated = el.querySelector('[data-icon-instance-id="legacy-icon-1"]')!;
    expect(normal.querySelector('img')!.getAttribute('src')).toBe(resolveIconPath(section.icons[0].path));
    expect(normal.querySelectorAll('img')).toHaveLength(1);
    expect(crated.querySelectorAll('img')).toHaveLength(2);
    expect(crated.querySelectorAll('img')[1].getAttribute('src')).toBe(section.icons[1].subtype);
    expect(normal.textContent).toContain('20');
    expect(crated.textContent).toContain('5');
  });

  test('preserves the ?, star and implicit single-item quantity rendering', () => {
    sectionView = new SectionComponent(clone(fixture.template.sections[0]), jest.fn(), jest.fn());
    const el = sectionView.getElement();
    expect(el.querySelector('[data-icon-instance-id="legacy-icon-2"]')!.textContent).toContain('?');
    expect(el.querySelector('[data-icon-instance-id="legacy-icon-3"]')!.textContent).toContain('★');
    expect(el.querySelector('[data-icon-instance-id="legacy-icon-4"]')!.querySelector('span')).toBeNull();
  });
});

describe('historical stockpile quantities (before choosing explicit unit semantics)', () => {
  test('CSV import preserves separate crate and assembled quantities', () => {
    const { items } = parseCSV(`${historicalTankName} (Crate),2\n${historicalTankName},3\n`);
    expect(items.get(`${historicalTankName} (Crate)`)).toBe(2);
    expect(items.get(historicalTankName)).toBe(3);
    expect(normalizeStockItems(items, new Set([historicalTankName]))).toEqual([
      { itemName: historicalTankName, crates: 2, assembled: 3 },
    ]);
  });

  test('legacy comparison adds 2 crates and 3 assembled objects as 5 for both overlays', () => {
    const section = clone(fixture.template.sections[0]);
    section.icons = section.icons.slice(0, 2);
    const { items } = parseCSV(`${historicalTankName} (Crate),2\n${historicalTankName},3\n`);
    const { rows } = buildComparison([section], items, fixture.iconMapping, null);
    expect(rows.map(row => ({ quantity: row.stockpileQty, crated: row.isCrateTarget, status: row.status }))).toEqual([
      { quantity: 5, crated: false, status: 'partial' },
      { quantity: 5, crated: true, status: 'ok' },
    ]);
  });

  test('a saved image with an incorrect historical label misses the canonical CSV name', () => {
    const section = clone(fixture.template.sections[0]);
    section.icons = section.icons.slice(0, 1);
    const { rows, surplus } = buildComparison(
      [section], new Map([['85K-b "Falchion"', 20]]), fixture.iconMapping, null,
    );
    expect(rows[0].itemName).toBe('85K-b "Falchion" Mortar Tank');
    expect(rows[0].status).toBe('missing');
    expect(surplus).toEqual([{ itemName: '85K-b "Falchion"', crates: 0, units: 20 }]);
  });
});

describe('historical TodoList contracts', () => {
  const discord = '__**LEGACY**__\n\n__Heavy arms__\n🇦・Bonesaw MK.3 – 550 Bmats – 134 Rmats (x2)\n';

  test('imports a historical Discord line with its asset, category and per-full-order cost', () => {
    const { result, warnings } = parseTodoList(discord, clone(fixture.mpfData));
    expect(warnings).toEqual([]);
    expect(result.items).toHaveLength(1);
    expect(MPF_CATEGORIES).toContain(result.items[0].category);
    expect(result.items[0]).toMatchObject({
      iconFilename: 'UI/ItemIcons/ATMortarItemIcon.png', category: 'heavy_arms',
      cost: { bmat: 100, rmat: 25 }, maxCrates: 9, numberProduced: 5, orderCount: 2,
    });
    expect(displayedCost(result.items[0])).toEqual({ bmat: 550, rmat: 134, emat: 0, hemat: 0 });
    expect(renderTodoList({ ...result, faction: 'all' })).toBe(discord);
  });

  test('saved TodoLists retain recorded data when the live catalogue changes', () => {
    const { result } = parseTodoList(discord, clone(fixture.mpfData));
    const saved: TodoList = { ...result, faction: 'all' };
    localStorage.setItem('todolist', JSON.stringify(saved));
    const changed = clone(fixture.mpfData);
    const entry = changed.find(x => x.itemName === 'Bonesaw MK.3')!;
    entry.cost = { bmat: 999 };
    entry.numberProduced = 99;
    store.setMpfData(changed);
    store.load();
    expect(store.todolist.items).toEqual(saved.items.map(migrateTodoListItem));
    expect(renderTodoList(store.todolist)).toBe(discord);
  });

  test('renders historical asset paths and items-per-crate tooltip independently of order count', () => {
    const entry = fixture.mpfData.find(x => x.itemName === '85K-b "Falchion"')!;
    const item: TodoListItem = {
      ...clone(entry), id: 'legacy-todo', category: entry.itemCategory, orderCount: 2,
    };
    store.replaceTodoList({ title: 'LEGACY', autoDate: false, items: [item], textBlocks: [] });
    const container = document.createElement('div');
    document.body.appendChild(container);
    todoView = new TodoListView();
    todoView.mount(container);
    const row = container.querySelector('[data-item-id="legacy-todo"]')!;
    expect(row.querySelector('img')!.getAttribute('src')).toBe(resolveIconPath(`/assets/icons/${entry.iconFilename}`));
    expect(row.querySelector('[title="5 items/crate"]')).not.toBeNull();
    expect(container.querySelector('#tl-preview')!.textContent).toContain('(x2)');
  });
});
