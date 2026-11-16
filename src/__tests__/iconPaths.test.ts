import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { canonicalIconFilename, iconAssetUrl, iconFilenameFromPath, migrateSectionIcon,
  migrateTemplateAssets, migrateTodoListItem, resolveIconPath } from '../services/iconPaths';
import { buildComparison, StockpileView } from '../components/StockpileView';
import { store } from '../store';
import type { MpfDataEntry, Template, TodoListItem } from '../types';

const json = (path: string) => JSON.parse(readFileSync(path, 'utf8'));
const historical = json('src/__tests__/fixtures/legacy-data-contract.json');
const mapping: Record<string, string> = json('public/iconMapping.json');
const registry: Record<string, string> = json('scripts/data/iconMapping.legacy.json');

describe('canonical game-pack paths and reviewed renames', () => {
  test.each([
    ['UI/ItemIcons/RifleCItemIcon.png', 'Textures/UI/ItemIcons/RifleCItemIcon.png'],
    ['Vehicles/HalftrackTwinW.png', 'Textures/Vehicles/HalftrackTwinW.png'],
    ['Slate/Images/ResourceFuelIcon.png', 'Slate/Images/ResourceFuelIcon.png'],
    ['subtypes/SubtypeCrateIcon.png', 'subtypes/SubtypeCrateIcon.png'],
    ['UI/VehicleIcons/AircraftDiveCIcon_copy.png', 'Textures/UI/VehicleIcons/AircraftDiveCIcon.png'],
    ['UI/VehicleIcons/AircraftFighterCIcon.png', 'Textures/UI/VehicleIcons/AircraftFigtherCIcon.png'],
    ['UI/VehicleIcons/LargeShipBattleshipAircraftCIcon.png', 'Textures/UI/ItemIcons/LargeshipAircraftCIcon.png'],
    ['UI/VehicleIcons/LargeShipAircraftCIcon.png', 'Textures/UI/ItemIcons/LargeshipAircraftCIcon.png'],
  ])('resolves %s and remains idempotent', (oldPath, newPath) => {
    expect(canonicalIconFilename(oldPath)).toBe(newPath);
    expect(canonicalIconFilename(newPath)).toBe(newPath);
    expect(existsSync(resolve('public/assets/icons', newPath))).toBe(true);
  });

  test('keeps arbitrary copy suffixes instead of guessing an identity', () => {
    expect(canonicalIconFilename('UI/VehicleIcons/Other_copy.png'))
      .toBe('Textures/UI/VehicleIcons/Other_copy.png');
    expect(resolveIconPath('/custom/image.png')).toBe('/custom/image.png');
  });

  test('rebases old and current hosted URLs without duplicating the deployment base', () => {
    const path = '/previous-site/assets/icons/UI/ItemIcons/RifleCItemIcon.png';
    const expected = '/builder/assets/icons/Textures/UI/ItemIcons/RifleCItemIcon.png';
    expect(resolveIconPath(path, '/builder/')).toBe(expected);
    expect(resolveIconPath(expected, '/builder/')).toBe(expected);
    expect(iconFilenameFromPath(expected)).toBe('Textures/UI/ItemIcons/RifleCItemIcon.png');
    expect(iconAssetUrl('UI/ItemIcons/RifleCItemIcon.png', '/builder/')).toBe(expected);
  });

  test('only Textures, Slate and the unchanged subtypes remain at the icon root', () => {
    expect(readdirSync('public/assets/icons').sort()).toEqual(['Slate', 'Textures', 'subtypes']);
    expect(existsSync('public/NEW')).toBe(false);
  });

  test('every historical registered icon resolves and retains its historical label', () => {
    for (const [filename, label] of Object.entries(historical.iconMapping)) {
      if (filename.startsWith('_')) continue;
      const canonical = canonicalIconFilename(filename);
      expect(existsSync(resolve('public/assets/icons', canonical))).toBe(true);
      expect(registry[canonical]).toBe(label);
    }
  });

  test('all current mappings, categories, MPF data and template references have concrete canonical files', () => {
    const paths = Object.keys(mapping).filter(key => !key.startsWith('_'));
    for (const category of Object.values(json('public/categoryMapping.json'))) {
      if (typeof category === 'object' && category) paths.push(...(category as { items: string[] }).items);
    }
    paths.push(...json('public/mpfData.json').map((item: MpfDataEntry) => item.iconFilename));
    for (const name of ['referenceTemplate.json', 'referenceTemplateColonial.json']) {
      for (const section of (json(`public/${name}`) as Template).sections) {
        for (const icon of section.icons) {
          paths.push(iconFilenameFromPath(icon.path));
          expect(icon.filename).toBe(iconFilenameFromPath(icon.path));
          if (icon.subtype) expect(existsSync(resolve('public', icon.subtype.slice(1)))).toBe(true);
        }
      }
    }
    for (const path of paths) {
      expect(path).toMatch(/^(Textures|Slate)\//);
      expect(path).toBe(canonicalIconFilename(path));
      expect(existsSync(resolve('public/assets/icons', path))).toBe(true);
    }
  });

  test('the three retained mortar variants keep four distinct item identities and MPF eligibility', () => {
    const items = json('public/itemData.json') as { itemName: string; iconFilename: string; kind: string }[];
    const names = ['Mortar Shell', 'Flare Mortar Shell', 'Shrapnel Mortar Shell', 'Incendiary Mortar Shell'];
    const entries = names.map(name => items.find(entry => entry.itemName === name)!);
    expect(entries.every(Boolean)).toBe(true);
    expect(entries.every(entry => entry.kind === 'item')).toBe(true);
    expect(new Set(entries.map(entry => entry.iconFilename)).size).toBe(4);
    for (const entry of entries) expect(existsSync(resolve('public/assets/icons', entry.iconFilename))).toBe(true);
    const recipes: MpfDataEntry[] = json('public/mpfData.json');
    expect(names.filter(name => recipes.some(entry => entry.itemName === name)))
      .toEqual(['Mortar Shell', 'Flare Mortar Shell', 'Shrapnel Mortar Shell']);
  });

  test('the reviewed aircraft images now join the wiki directly', () => {
    expect(mapping['Textures/UI/VehicleIcons/AircraftDiveCIcon.png']).toBe('Mergo-4 "Myrmidon"');
    expect(mapping['Textures/UI/VehicleIcons/AircraftFigtherCIcon.png']).toBe('Toxot-902 "Blind Silver"');
    expect(mapping['Textures/UI/ItemIcons/LargeshipAircraftCIcon.png']).toBe('Poseidon');
  });
});

describe('saved documents migrate image references only', () => {
  const old: Template = historical.template;

  test('migrates paths without mutating the source or changing quantities, overlays or instance IDs', () => {
    const before = JSON.stringify(old);
    const migrated = migrateTemplateAssets(old);
    expect(JSON.stringify(old)).toBe(before);
    expect(migrateTemplateAssets(migrated)).toEqual(migrated);
    expect(migrated).not.toHaveProperty('quantityMode');
    for (let i = 0; i < old.sections[0].icons.length; i++) {
      const original = old.sections[0].icons[i];
      expect(migrated.sections[0].icons[i]).toMatchObject({
        id: original.id, quantity: original.quantity, gridRow: original.gridRow, gridCol: original.gridCol,
      });
      expect(migrated.sections[0].icons[i].subtype).toBe(original.subtype);
    }
    const custom = { ...old.sections[0].icons[0], path: '/custom.png' };
    expect(migrateSectionIcon(custom)).toEqual(custom);
  });

  test('imports and reloads old templates, keeping legacy quantity calculations and saving canonical paths', () => {
    const savedSections = store.sections;
    const savedMode = store.quantityMode;
    try {
      expect(store.importJSON(JSON.stringify(old))).toBe(true);
      expect(store.quantityMode).toBe('legacy');
      expect(JSON.parse(store.exportJSON()).sections).toEqual(migrateTemplateAssets(old).sections);
      localStorage.setItem('template', JSON.stringify(old));
      store.load();
      expect(store.sections).toEqual(migrateTemplateAssets(old).sections);
      expect(store.quantityMode).toBe('legacy');
      store.save();
      expect(JSON.parse(localStorage.getItem('template')!).sections).toEqual(store.sections);
    } finally { store.sections = savedSections; store.quantityMode = savedMode; }
  });

  test('old Stockpile paths find the canonical catalogue while keeping the historical quantities', () => {
    const image = old.sections[0].icons[0];
    const key = canonicalIconFilename(iconFilenameFromPath(image.path));
    const name = mapping[key];
    const result = buildComparison([old.sections[0]], new Map([[`${name} (Crate)`, 2], [name, 3]]), mapping, null);
    expect(result.rows[0]).toMatchObject({ itemName: name, stockpileQty: 5, iconPath: resolveIconPath(image.path) });
  });

  test('old TodoList paths migrate without refreshing recorded production data', () => {
    const entry: MpfDataEntry = historical.mpfData[0];
    const item: TodoListItem = { ...entry, id: 'saved-todo', category: entry.itemCategory, orderCount: 7 };
    expect(migrateTodoListItem(item)).toEqual({ ...item, iconFilename: canonicalIconFilename(item.iconFilename) });
    const saved = store.todolist;
    try {
      localStorage.setItem('todolist', JSON.stringify({ title: 'OLD', autoDate: false, faction: 'all', items: [item] }));
      store.load();
      expect(store.todolist.items).toEqual([migrateTodoListItem(item)]);
    } finally { store.todolist = saved; }
  });

  test('Stockpile restores an external old template with canonical image paths', async () => {
    const originalFetch = global.fetch;
    const el = document.createElement('div');
    const view = new StockpileView();
    try {
      localStorage.setItem('stockpile_tpl_file', JSON.stringify(old));
      localStorage.setItem('stockpile_tpl_source', 'file');
      global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => mapping });
      view.mount(el);
      await new Promise(resolve => setTimeout(resolve, 15));
      expect((view as unknown as { externalTemplate: Template }).externalTemplate)
        .toEqual(migrateTemplateAssets(old, '/'));
    } finally { view.unmount(); global.fetch = originalFetch; }
  });
});
