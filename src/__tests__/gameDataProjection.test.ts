import { readFileSync } from 'node:fs';
import { buildWikiCatalog } from '../services/wikiCatalog';
import { projectWikiData, normalizeGameName } from '../services/gameData';
import { parseTodoList } from '../services/todoListParser';
import { MPF_CATEGORY_LABELS } from '../types';
import type { MpfDataEntry } from '../types';
import { IconSidebar } from '../components/IconSidebar';
import { store } from '../store';
import { loadItemData } from '../services/itemDataLoader';
import { loadIcons, loadSubtypes } from '../services/iconLoader';
import { buildComparison } from '../components/StockpileView';
import type { Section } from '../types';

const json = (path: string) => JSON.parse(readFileSync(path, 'utf8'));
const legacyMapping = json('scripts/data/iconMapping.legacy.json');
const legacyMpf: MpfDataEntry[] = json('scripts/data/mpf.legacy.json');
const compatibility = json('scripts/data/wiki.compatibility.json');
const catalog = buildWikiCatalog(json('scripts/data/wiki.snapshot.json'), legacyMapping, compatibility.assetOverrides, compatibility.assetAnnotations);
const data = projectWikiData(catalog, legacyMapping, compatibility.aliases, legacyMpf, compatibility.iconVariants);

describe('wiki projections preserve application contracts', () => {
  test('the generated files match their validated source projections', () => {
    expect(json('public/mpfData.json')).toEqual(data.mpfData);
    expect(json('public/itemData.json')).toEqual(data.itemData);
    expect(json('public/iconMapping.json')).toEqual(data.iconMapping);
  });

  test('each eligible entity has exactly one compatible MPF entry and keeps the existing material shape', () => {
    expect(data.mpfData).toHaveLength(catalog.items.filter(item => item.mpf).length);
    expect(new Set(data.mpfData.map(entry => entry.iconFilename)).size).toBe(data.mpfData.length);
    for (const entry of data.mpfData) {
      expect([5, 9]).toContain(entry.maxCrates);
      expect(entry.faction).toContain('neutral');
      expect(Object.keys(entry.cost).every(material => ['bmat', 'rmat', 'emat', 'hemat'].includes(material))).toBe(true);
      expect(entry).not.toHaveProperty('crateBonus');
    }
  });

  test('projects Factory-only items without inferring Factory costs for refinery materials, vehicles or generic artwork', () => {
    for (const name of ['First Aid Kit', 'Trauma Kit', 'Binoculars']) {
      const source = catalog.items.find(item => item.name === name)!;
      expect(data.itemData.find(item => item.itemName === name)!.factory)
        .toEqual({ cost: source.factory!.baseCostPerCrate, maxCrates: 4 });
      expect(data.mpfData.some(item => item.itemName === name)).toBe(false);
    }
    for (const name of ['Basic Materials', 'Silverhand - Mk. IV', 'Assembly Materials', 'Metal Beam Pallet (legacy)']) {
      expect(data.itemData.find(item => item.itemName === name)!.factory).toBeUndefined();
    }
  });

  test('every historical MPF name remains importable without binding it to another vehicle', () => {
    for (const historical of legacyMpf) {
      const text = `__**Legacy**__\n\n__${MPF_CATEGORY_LABELS[historical.itemCategory]}__\nA・${historical.itemName} (x2)\n`;
      const { result, warnings } = parseTodoList(text, data.mpfData);
      expect(warnings).toEqual([]);
      expect(result.items).toHaveLength(1);
      const expected = data.mpfData.find(entry => [entry.itemName, ...(entry.aliases ?? [])]
        .some(name => normalizeGameName(name).toLowerCase() === normalizeGameName(historical.itemName).toLowerCase()));
      expect(result.items[0].iconFilename).toBe(expected?.iconFilename);
      expect(result.items[0].orderCount).toBe(2);
    }
  });

  test('corrects Falchion/Ballista labels while retaining the old labels only as historical metadata', () => {
    const filename = 'Textures/UI/VehicleIcons/MortarTankVehicleIcon.png';
    expect(data.iconMapping[filename]).toBe('HC-7 "Ballista"');
    const item = data.itemData.find(item => item.iconFilename === filename)!;
    expect(item.legacyItemName).toBe('85K-b "Falchion" Mortar Tank');
    expect(item.aliases).not.toContain('85K-b "Falchion"');
    expect(data.mpfData.find(entry => entry.itemName === '85K-b "Falchion"')!.iconFilename)
      .toBe('Textures/UI/VehicleIcons/ColonialMediumTankIcon.png');
    expect(item.legacyMpf!.itemName).toBe('85K-b "Falchion"');
  });

  test('refuses an alias that would make two different entities interchangeable', () => {
    expect(() => projectWikiData(catalog, legacyMapping, {
      ...compatibility.aliases, 'Toxot-902 “Blind Silver”': ['85K-b "Falchion"'],
    }, legacyMpf)).toThrow('Ambiguous item alias');
  });

  test('canonical labels containing quotes survive sidebar HTML attributes and drag payloads', () => {
    store.setViewMode('template'); store.setTemplateFaction('all'); store.setCategory('Toutes'); store.setSearch('');
    const filename = 'Textures/UI/VehicleIcons/ColonialMediumTankIcon.png';
    store.setIcons([{ id: filename, filename, displayName: data.iconMapping[filename], category: 'Vehicles', path: `/assets/icons/${filename}` }]);
    const el = document.createElement('div');
    const sidebar = new IconSidebar(); sidebar.mount(el);
    expect((el.querySelector('[data-icon-name]') as HTMLElement).dataset.iconName).toBe('85K-b "Falchion"');
    expect(el.querySelector('img')!.getAttribute('alt')).toBe('85K-b "Falchion"');
    sidebar.destroy();
  });
});

describe('visually reviewed artwork does not invent recipe identities', () => {
  test.each([
    ['FacilityOil1Icon.png', 'HeavyOilIcon.png', 'Heavy Oil'],
    ['FacilityOil2Icon.png', 'EnrichedOilIcon.png', 'Enriched Oil'],
  ])('associates %s with the same Cargo item as %s', (local, primary, name) => {
    const alternative = data.itemData.find(item => item.iconFilename === `Textures/UI/ItemIcons/${local}`)!;
    const canonical = data.itemData.find(item => item.iconFilename === `Textures/UI/ItemIcons/Facilities/${primary}`)!;
    expect(alternative).toMatchObject({ itemName: name, kind: 'item', faction: canonical.faction,
      unitsPerCrate: canonical.unitsPerCrate, aliases: canonical.aliases });
    expect(catalog.assets.find(asset => asset.iconFilename === alternative.iconFilename)!.match).toBe('explicit');
  });

  test('identifies the common Assembly Materials artwork without selecting grade IV or grade I', () => {
    const generic = data.itemData.find(item => item.iconFilename.endsWith('/FacilityMaterials4Icon.png'))!;
    expect(generic).toMatchObject({ itemName: 'Assembly Materials', legacyItemName: 'Assembly Materials IV',
      assetStatus: 'generic', kind: null, unitsPerCrate: null, aliases: ['Assembly Materials'] });
    expect(catalog.assets.find(asset => asset.iconFilename === generic.iconFilename))
      .toMatchObject({ match: 'generic', itemSourceKey: null, candidateSourceKeys: [] });
    expect(data.mpfData.some(item => item.iconFilename === generic.iconFilename)).toBe(false);
  });

  test('retains the historical pallet without assigning current Rare Materials recipes or stock', () => {
    const pallet = data.itemData.find(item => item.iconFilename.endsWith('/MetalBeamPlatformItemIcon.png'))!;
    expect(pallet).toMatchObject({ itemName: 'Metal Beam Pallet (legacy)', legacyItemName: 'Metal Beam Platform',
      assetStatus: 'retired', kind: null, unitsPerCrate: null });
    expect(pallet.aliases).not.toContain('Rare Materials');
    expect(catalog.assets.find(asset => asset.iconFilename === pallet.iconFilename)!.match).toBe('retired');
    const currentRareMaterials = catalog.items.find(item => item.name === 'Rare Materials')!;
    expect(currentRareMaterials.image).toBe('FacilityMaterials12Icon.png');
    expect(catalog.assets.find(asset => asset.itemSourceKey === currentRareMaterials.sourceKey)!.iconFilename)
      .toBe('Textures/UI/ItemIcons/FacilityMaterials12Icon.png');
  });

  test('selects the deployed fortress rather than the Parts page that incorrectly reuses its icon', () => {
    const binding = catalog.assets.find(asset => asset.iconFilename.endsWith('/FortGarrisonStationIcon.png'))!;
    const entity = catalog.items.find(item => item.sourceKey === binding.itemSourceKey)!;
    expect(entity).toMatchObject({ name: 'Underground Fortress', codename: 'FortGarrisonStation', kind: 'structure' });
    expect(binding.match).toBe('explicit');
  });

  test('an old Assembly IV target keeps its historical comparison, while the generic icon never consumes graded stock in the new mode', () => {
    const generic = data.itemData.find(item => item.iconFilename.endsWith('/FacilityMaterials4Icon.png'))!;
    const section: Section = { id: 'old', title: 'Old facilities', x: 0, y: 0, width: 100, height: 100, color: '#123456',
      icons: [{ id: 'generic', iconId: generic.iconFilename, filename: generic.iconFilename,
        path: `/assets/icons/${generic.iconFilename}`, quantity: 10, gridRow: 0, gridCol: 0 }] };
    const stock = new Map([['Assembly Materials IV', 12]]);
    const legacyIconMapping = Object.fromEntries(data.itemData.map(item => [item.iconFilename, item.legacyItemName]));
    expect(buildComparison([section], stock, data.iconMapping, null,
      { quantityMode: 'legacy', itemData: data.itemData, legacyIconMapping }).rows[0])
      .toMatchObject({ itemName: 'Assembly Materials IV', stockpileQty: 12, status: 'ok' });
    const current = buildComparison([section], stock, data.iconMapping, null,
      { quantityMode: 'crate-equivalents-v1', itemData: data.itemData });
    expect(current.rows[0]).toMatchObject({ itemName: 'Assembly Materials', status: 'unknown', stockpileQty: 0 });
    expect(current.surplus).toEqual([{ itemName: 'Assembly Materials IV', crates: 0, units: 12 }]);
  });
});

describe('new icon declarations and game artwork contexts', () => {
  const savedFetch = global.fetch;
  const savedState = () => ({ icons: store.icons, itemData: store.itemData, viewMode: store.viewMode,
    templateFaction: store.templateFaction, selectedCategory: store.selectedCategory, searchQuery: store.searchQuery,
    sections: store.sections, quantityMode: store.quantityMode });
  const prepareIcons = async () => {
    global.fetch = jest.fn().mockImplementation(async (url: string) => ({ ok: true, json: async () =>
      url.endsWith('categoryMapping.json') ? json('public/categoryMapping.json')
        : url.endsWith('subtypeMapping.json') ? json('public/subtypeMapping.json') : data.iconMapping }));
    return loadIcons();
  };
  afterEach(() => { global.fetch = savedFetch; });

  test('loads the four game icons in their categories and makes Paratrooper available as an overlay', async () => {
    const icons = await prepareIcons();
    expect(icons.find(icon => icon.filename.endsWith('/FacilityMaterials12Icon.png')))
      .toMatchObject({ displayName: 'Rare Materials', category: 'Resources' });
    expect(icons.find(icon => icon.filename.endsWith('/AircraftFighter2CIcon.png')))
      .toMatchObject({ displayName: 'Daimon aK-5 "Harpy"', category: 'Planes' });
    expect(icons.find(icon => icon.filename.endsWith('/LargeShipLiquidShipIcon.png')))
      .toMatchObject({ displayName: 'Tümmler by VAC', category: 'Naval' });
    expect(icons.find(icon => icon.filename.endsWith('/LargeCraneItemIcon.png')))
      .toMatchObject({ displayName: 'BMS - Overseer Sky-Hauler', category: 'Vehicles' });
    expect((await loadSubtypes()).find(subtype => subtype.filename === 'SubtypeParatrooperIcon.png'))
      .toMatchObject({ displayName: 'Paratrooper', path: '/assets/icons/subtypes/SubtypeParatrooperIcon.png' });
  });

  test('keeps facilities artwork and the Sky-Hauler addressable while hiding them from template choices', async () => {
    const saved = savedState();
    try {
      store.icons = await prepareIcons(); store.itemData = data.itemData;
      store.viewMode = 'template'; store.templateFaction = 'all'; store.selectedCategory = 'Toutes'; store.searchQuery = '';
      const visible = store.filteredIcons.map(icon => icon.filename);
      for (const variants of Object.values(compatibility.iconVariants) as { logistics: string; facilities: string }[]) {
        expect(visible).toContain(variants.logistics);
        expect(visible).not.toContain(variants.facilities);
        expect(store.icons.some(icon => icon.filename === variants.facilities)).toBe(true);
        expect(data.itemData.find(item => item.iconFilename === variants.logistics)!.iconUsage).toBe('logistics');
        expect(data.itemData.find(item => item.iconFilename === variants.facilities)!.iconUsage).toBe('facilities');
      }
      expect(visible).not.toContain('Textures/UI/LargeCraneItemIcon.png');
      expect(store.icons.some(icon => icon.filename === 'Textures/UI/LargeCraneItemIcon.png')).toBe(true);
      expect(visible).toHaveLength(store.icons.length - 5);
    } finally { Object.assign(store, saved); }
  });

  test('applies the general faction filter to the new non-MPF aircraft', async () => {
    const saved = savedState();
    try {
      store.icons = await prepareIcons(); store.itemData = data.itemData;
      store.viewMode = 'template'; store.selectedCategory = 'Toutes'; store.searchQuery = '';
      store.templateFaction = 'warden';
      expect(store.filteredIcons.some(icon => icon.filename.endsWith('/AircraftFighter2CIcon.png'))).toBe(false);
      expect(store.filteredIcons.some(icon => icon.filename.endsWith('/LargeShipLiquidShipIcon.png'))).toBe(true);
      store.templateFaction = 'colonial';
      expect(store.filteredIcons.some(icon => icon.filename.endsWith('/AircraftFighter2CIcon.png'))).toBe(true);
      expect(store.filteredIcons.some(icon => icon.filename.endsWith('/LargeCraneItemIcon.png'))).toBe(false);
    } finally { Object.assign(store, saved); }
  });

  test('keeps a saved facilities image and its quantity even though logistics now offers another variant', () => {
    const saved = savedState();
    const path = compatibility.iconVariants.Water.facilities;
    const section: Section = { id: 'old', title: 'Old', x: 0, y: 0, width: 100, height: 100, color: '#123456',
      icons: [{ id: 'old-water', iconId: path, filename: path, path: `/assets/icons/${path}`, quantity: 2, gridRow: 0, gridCol: 0 }] };
    try {
      store.itemData = data.itemData;
      expect(store.importJSON(JSON.stringify({ sections: [section], quantityMode: 'crate-equivalents-v1' }))).toBe(true);
      expect(store.sections).toEqual([section]);
      expect(buildComparison(store.sections, new Map([['Water (Crate)', 2]]), data.iconMapping, null,
        { quantityMode: 'crate-equivalents-v1', itemData: data.itemData }).rows[0])
        .toMatchObject({ itemName: 'Water', stockpileQty: 2, status: 'ok', iconPath: `/assets/icons/${path}` });
    } finally { Object.assign(store, saved); }
  });

  test('refuses variants belonging to different objects or pointing at absent files', () => {
    expect(() => projectWikiData(catalog, legacyMapping, compatibility.aliases, legacyMpf, {
      'Heavy Oil': { ...compatibility.iconVariants['Heavy Oil'], facilities: compatibility.iconVariants.Water.facilities },
    })).toThrow('Invalid icon variants');
    expect(() => projectWikiData(catalog, legacyMapping, compatibility.aliases, legacyMpf, {
      Water: { ...compatibility.iconVariants.Water, logistics: 'missing.png' },
    })).toThrow('Invalid icon variants');
  });
});

describe('runtime item data loading', () => {
  const originalFetch = global.fetch;
  afterEach(() => { global.fetch = originalFetch; });
  test('loads the generated metadata', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => data.itemData });
    expect(await loadItemData()).toEqual(data.itemData);
  });
  test.each([null, [{ ...data.itemData[0], unitsPerCrate: -1 }], [{ ...data.itemData[0], faction: ['unknown'] }],
    [{ ...data.itemData[0], assetStatus: 'guessed' }], [{ ...data.itemData[0], iconUsage: 'guessed' }],
    [{ ...data.itemData[0], factory: { cost: { bmat: -1 }, maxCrates: 4 } }],
    [{ ...data.itemData[0], factory: { cost: {}, maxCrates: 4 } }],
    [{ ...data.itemData[0], factory: { cost: { bmat: 60 }, maxCrates: 9 } }],
    [{ ...data.itemData[0], production: [] }], [{ ...data.itemData[0], production: [{ source: 'Unknown' }] }]])(
    'does not accept malformed metadata: %s', async malformed => {
      global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => malformed });
      expect(await loadItemData()).toEqual([]);
    },
  );
  test('returns unknown metadata when the file is unavailable', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false });
    expect(await loadItemData()).toEqual([]);
  });
});
