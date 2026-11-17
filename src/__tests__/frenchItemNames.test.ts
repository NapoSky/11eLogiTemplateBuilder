import { readFileSync } from 'node:fs';
import { parseCSV, buildComparison, StockpileView } from '../components/StockpileView';
import { migrateStoredStockpileNames, translateFrenchItemName } from '../services/frenchItemNames';
import { normalizeGameName, type ItemDataEntry } from '../services/gameData';
import { normalizeStockItems } from '../services/stockpileLogistics';
import type { Section, Template } from '../types';
import frenchNames from './fixtures/french-stockpile-names.json';
import { store } from '../store';
import { localStorageMock } from './setup';

const itemData: ItemDataEntry[] = JSON.parse(readFileSync('public/itemData.json', 'utf8'));
const snapshot = JSON.parse(readFileSync('scripts/data/wiki.snapshot.json', 'utf8'));
const knownEnglishNames = new Set([
  ...Object.values(snapshot.tables as Record<string, { name?: string }[]>).flat()
    .flatMap(row => row.name ? [normalizeGameName(row.name)] : []),
  ...itemData.flatMap(item => item.aliases),
  // English spelling present in both supplied exports; unrelated to FR translation.
  "O'Brien v.200 Squire",
]);

// Names only from drafts/message (9).txt: no depot, coordinates or stock quantities.
// Every row is exercised, including zero-stock rows and both physical packaging forms.
describe('French stockpile export coverage', () => {
  test('every exported name resolves to a known English item', () => {
    const unresolved = frenchNames.flatMap(name => {
      const { items } = parseCSV(`${name},1`);
      const translated = [...items.keys()][0].replace(/ \(Crate\)$/, '');
      return knownEnglishNames.has(translated) ? [] : [{ name, translated }];
    });
    expect(unresolved).toEqual([]);
  });

  test('translated rows match template icons without false surplus for supported items', () => {
    const { items } = parseCSV(frenchNames.map(name => `${name},3`).join('\n'));
    const mapping = Object.fromEntries(itemData.map(item => [item.iconFilename, item.itemName]));
    const section: Section = {
      id: 'all-items', title: 'All items', color: '#fff', x: 0, y: 0, width: 100, height: 100,
      icons: itemData.map((item, index) => ({
        id: String(index), filename: item.iconFilename, path: `/assets/icons/${item.iconFilename}`,
        x: 0, y: 0, width: 32, height: 32, quantity: 1,
      })),
    };
    const result = buildComparison([section], items, mapping, null, {
      quantityMode: 'crate-equivalents-v1', itemData,
    });
    // These English identities have no matching sidebar metadata (or differ in
    // English capitalization). They must remain distinct, not map to other items.
    expect([...new Set(result.surplus.map(item => item.itemName))].sort()).toEqual([
      'Assembly Materials I', 'Assembly Materials II', 'Assembly Materials III',
      'Assembly Materials IV', 'Assembly Materials V',
      'Damaged Colonial Aircraft Engine (Small)',
      'Damaged Colonial Aircraft Mechanical Parts (Small)',
      'Damaged Warden Aircraft Engine (Small)',
      'Damaged Warden Aircraft Mechanical Parts (Small)',
      "O'Brien v.200 Squire", 'Underground Fortress Parts',
    ].sort());
    expect(result.rows.find(row => row.itemName === 'BMS - Packmule Flatbed')?.status).toBe('ok');
  });
});

describe('restoring stockpiles imported before the translation update', () => {
  let view: StockpileView | undefined;
  const originalFetch = global.fetch;
  afterEach(() => {
    view?.unmount();
    view = undefined;
    store.setItemData([]);
    document.body.innerHTML = '';
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  test('merges old English translations and French names without merging packaging or unrelated identities', () => {
    const result = migrateStoredStockpileNames({
      'BMS - Packmule Flatbed Truck': 14,
      'Camion Plateau BMS - Packmule': 2,
      'BMS - Packmule Flatbed': 1,
      'BMS - Packmule Flatbed Truck (Crate)': 4,
      'Liquid Container (Fuel Tank)': 4,
      'Détonateur de Charge Havoc (Crate)': 56,
      'Havoc Charge Detonator (Crate)': 2,
      'Unknown Item': 8,
      '85K-b "Falchion" Mortar Tank': 3,
    });
    expect(Object.fromEntries(result)).toEqual({
      'BMS - Packmule Flatbed': 17,
      'BMS - Packmule Flatbed (Crate)': 4,
      'Liquid Container': 4,
      'Havoc Charge Detonator (Crate)': 58,
      'Unknown Item': 8,
      '85K-b "Falchion" Mortar Tank': 3,
    });
    expect(migrateStoredStockpileNames(Object.fromEntries(result))).toEqual(result);
  });

  test.each([
    ['entries', 'colonial'], ['single-csv', 'colonial'],
    ['entries', 'warden'], ['single-csv', 'warden'],
  ])('%s storage matches the actual %s reference after reload', async (format, faction) => {
    const reference = JSON.parse(readFileSync(`public/${faction === 'warden' ? 'referenceTemplate.json' : 'referenceTemplateColonial.json'}`, 'utf8'));
    const mapping = JSON.parse(readFileSync('public/iconMapping.json', 'utf8'));
    const cachedItems: Record<string, number> = {
      'Détonateur de Charge Havoc (Crate)': 56,
      'Munitions Incendiaires (Crate)': 30,
      'Sirène de Raid Aérien (Crate)': 10,
      'Bouée Navale (Crate)': 24,
      'BMS - Packmule Flatbed Truck': 14,
      'Liquid Container (Fuel Tank)': 4,
      'Gravel (Crate)': 466,
    };
    if (faction === 'warden') {
      cachedItems['No.1 "The Liar" (Crate)'] = 7;
      cachedItems['No.1 "The Liar" Submachine Gun (Crate)'] = 3;
      cachedItems["Airship Pilot's Flight Suit (Crate)"] = 9;
      cachedItems["Vêtement d'Aviateur (Crate)"] = 2;
    }
    const header = { location: 'Region - Depot - Seaport', date: 'old snapshot' };
    const entry = { id: 'saved-import', items: cachedItems, header, label: 'Saved stock', depotName: 'My depot', role: 'intermediate' };
    localStorage.setItem('stockpile_tpl_source', faction === 'warden' ? 'official' : 'official-colonial');
    if (format === 'entries') localStorage.setItem('stockpile_csv_entries', JSON.stringify([entry]));
    else {
      localStorage.setItem('stockpile_csv_items', JSON.stringify(cachedItems));
      localStorage.setItem('stockpile_csv_header', JSON.stringify(header));
    }
    const original = localStorage.getItem('stockpile_csv_entries');
    store.setItemData(itemData);
    global.fetch = jest.fn(async input => ({
      ok: true,
      json: async () => String(input).includes('iconMapping') ? mapping : reference,
    } as Response));
    const container = document.createElement('div');
    document.body.appendChild(container);
    view = new StockpileView();
    view.mount(container);
    await new Promise(resolve => setTimeout(resolve, 10));

    const result = view['result']!;
    expect(result).not.toBeNull();
    const matched: [string, number][] = [['Havoc Charge Detonator', 56], ['Flame Ammo', 30]];
    if (faction === 'colonial') matched.push(['Air Raid Siren', 10]);
    else matched.push(['No.1 "The Liar" Submachine Gun', 10], ["Aviator's Raiment", 11]);
    for (const [name, crates] of matched) {
      expect(result.rows.find(row => row.itemName === name)?.stockpileQty).toBe(crates);
      expect(result.surplus.some(row => row.itemName === name)).toBe(false);
    }
    // These items really are absent from both current reference templates.
    expect(result.surplus).toEqual(expect.arrayContaining([
      { itemName: 'Naval Buoy', qty: 24, isCrate: true },
      { itemName: 'BMS - Packmule Flatbed', qty: 14, isCrate: false },
      { itemName: 'Liquid Container', qty: 4, isCrate: false },
      { itemName: 'Gravel', qty: 466, isCrate: true },
    ]));
    expect(result.rows.find(row => row.itemName === 'Air Raid Siren')?.stockpileQty).toBe(10);
    expect(result.surplus).toHaveLength(4);
    expect(view['csvEntries'][0].header).toEqual(header);
    if (format === 'entries') {
      expect(view['csvEntries'][0]).toMatchObject({ id: entry.id, role: entry.role, depotName: entry.depotName, label: entry.label });
      expect(localStorage.getItem('stockpile_csv_entries')).toBe(original);
    } else {
      const saved = JSON.parse(localStorage.getItem('stockpile_csv_entries')!);
      expect(saved[0].items['Havoc Charge Detonator (Crate)']).toBe(56);
      expect(localStorage.getItem('stockpile_csv_items')).toBeNull();
    }
  });
});

describe('Warden reference without a user stockpile sample', () => {
  const template: Template = JSON.parse(readFileSync('public/referenceTemplate.json', 'utf8'));
  const mapping = JSON.parse(readFileSync('public/iconMapping.json', 'utf8'));
  const metadata = new Map(itemData.map(item => [item.iconFilename, item]));

  test.each(['fresh CSV', 'stored CSV'])('all 132 reference rows match a synthetic %s with crates and loose units', source => {
    const assets = template.sections.flatMap(section => section.icons.map(icon => {
      const item = metadata.get(icon.filename);
      expect(item).toBeDefined();
      return item!;
    }));
    expect(assets).toHaveLength(132);
    const names = [...new Set(assets.map(item => item.itemName))];
    // A real CSV contains stock once per item, even when the template uses that
    // item in several sections or with different target units.
    const synthetic = Object.fromEntries(names.flatMap(name => [[`${name} (Crate)`, 2], [name, 3]]));
    const items = source === 'fresh CSV'
      ? parseCSV(Object.entries(synthetic).map(([name, qty]) => `${name},${qty}`).join('\n')).items
      : migrateStoredStockpileNames(synthetic);
    const result = buildComparison(template.sections, items, mapping, null, {
      quantityMode: 'crate-equivalents-v1', itemData,
    });
    expect(result.rows).toHaveLength(132);
    expect(result.surplus).toEqual([]);
    // Identity is recognized even when the catalogue lacks a crate capacity.
    // Mixed stock must retain an explicit unknown calculation in those cases.
    expect(result.rows.filter(row => row.status === 'unknown').map(row => row.itemName).sort())
      .toEqual([
        'Gallagher Outlaw Mk. II', 'Gallagher Outlaw Mk. II', 'Moray Torpedo',
        'Niska-Rycker Mk. IX Skycaller', 'Silverhand Chieftain - Mk. VI',
        'Silverhand Lordscar - Mk. X', 'Tenta Torpedo',
      ]);
    for (const [index, row] of result.rows.entries()) {
      const capacity = assets[index].unitsPerCrate;
      if (capacity === null) {
        expect(row.quantities).toMatchObject({ crates: 2, units: 3, totalUnits: null, equivalentCrates: null });
        continue;
      }
      expect(row.status).not.toBe('unknown');
      expect(row.quantities).toMatchObject({ crates: 2, units: 3, totalUnits: 2 * capacity + 3 });
      expect(row.stockpileQty).toBeCloseTo(row.isCrateTarget ? 2 + 3 / capacity : 2 * capacity + 3);
    }
  });

  test('French Warden equipment merges with its English counterpart without false surplus', () => {
    // Explicit associations from the supplied French export, independent of the
    // translator, including the Warden weapons and uniforms affected by renames.
    const pairs = [
      ["Fusil d'Assaut Booker Model 838", 'Booker Storm Rifle Model 838'],
      ["Fusil d'Assaut Aalto 24", 'Aalto Storm Rifle 24'],
      ['Le Hangman 757', 'The Hangman 757'],
      ['Fusil Auto Sampo 77', 'Sampo Auto-Rifle 77'],
      ['Pistolet-mitrailleur No.1 "The Liar"', 'No.1 "The Liar" Submachine Gun'],
      ['Pistolet-mitrailleur Fiddler Model 868', 'Fiddler Submachine Gun Model 868'],
      ['Lance-Roquette Antichar Carnyx', 'Carnyx Anti-Tank Rocket Launcher'],
      ['Bonesaw MK.3 Monté', 'Mounted Bonesaw MK.3'],
      ['Fusil Antichar Neville', 'Neville Anti-Tank Rifle'],
      ['Grenade à Fragmentation A3 Harpa', 'A3 Harpa Fragmentation Grenade'],
      ['Grenade Flacon BF5 White Ash', 'BF5 White Ash Flask Grenade'],
      ['Détonateur de Charge Havoc', 'Havoc Charge Detonator'],
      ['Munitions Incendiaires', 'Flame Ammo'],
      ['Munitions Antiaériennes Absol', 'Absol Anti-Aircraft Rounds'],
      ['Roquette Incendiaire 4C', '4C-Fire Rocket'],
      ["Munition pour Willow's Bane", "Willow's Bane Ammo"],
      ["L'Ospreay", 'The Ospreay'],
      ['Manteau de Spécialiste', "Specialist's Overcoat"],
      ['Cuirasse', "Gunner's Breastplate"],
      ['Tenue de Sapeur', 'Sapper Gear'],
      ['Veste de Médecin', "Physician's Jacket"],
      ["Parure d'Officier", "Officer's Regalia"],
      ["Manteau d'Éclaireur", "Outrider's Mantle"],
      ['Parka Caoivienne', 'Caoivish Parka'],
      ['Combinaison Rembourrée', 'Padded Boiler Suit'],
      ["Vêtement d'Aviateur", "Aviator's Raiment"],
    ];
    const { items, frenchDetected } = parseCSV(pairs.flatMap(([french, english]) => [
      `${french} (Caisse),2`, `${english} (Crate),1`,
    ]).join('\n'));
    expect(frenchDetected).toBe(true);
    const result = buildComparison(template.sections, items, mapping, null, {
      quantityMode: 'crate-equivalents-v1', itemData,
    });
    expect(result.surplus).toEqual([]);
    for (const [, english] of pairs) {
      expect(items.get(`${english} (Crate)`)).toBe(3);
      const rows = result.rows.filter(row => row.itemName === english);
      expect(rows.length).toBeGreaterThan(0);
      for (const row of rows) expect(row.quantities).toMatchObject({ crates: 3, units: 0 });
    }
  });
});

describe('French item translation', () => {
  test.each([
    ['Pistolet-mitrailleur No.1 "The Liar"', 'No.1 "The Liar" Submachine Gun'],
    ['Sac de Parachutiste', "Paratrooper's Ruck"],
    ['Transmetteur de Liaison', 'Liaison Transmitter'],
    ['Tuyau', 'Pipe'],
    ['Matériaux Rares', 'Rare Materials'],
    ['Anciens Matériaux', 'Relic Materials'],
    ['Conteneur de Liquide', 'Liquid Container'],
    ["Vêtement d'Aviateur", "Aviator's Raiment"],
    ['Camion Plateau BMS - Packmule', 'BMS - Packmule Flatbed'],
    ['Chenillette T14 "Vesta"', 'T14 "Vesta" Tankette'],
    ['Batterie de Roquette T13 "Deioneus"', 'T13 "Deioneus" Rocket Battery'],
    ['AA-2 "Battering Ram"', 'AA-2 Battering Ram'],
    ['Propulseur de Fusée A0E-9', 'A0E-9 Rocket Booster'],
    ['Corps de Fusée A0E-9', 'A0E-9 Rocket Body'],
    ['Ogive de Fusée A0E-9', 'A0E-9 Rocket Warhead'],
    ['Pièces de Construction', 'Construction Parts'],
    ['Pièces de Structure', 'Structure Parts'],
    ['Pièces de Canon Storm', 'Storm Cannon Parts'],
    ["Pièces de Radar d'Avion", 'Aircraft Radar Parts'],
    ['Pièces de Centre de renseignement', 'Intelligence Center Parts'],
    ['Pièces de Station Météo', 'Weather Station Parts'],
    ['Ferraille', 'Salvage'], ['Soufre', 'Sulfur'], ['Charbon', 'Coal'],
    ['Composants', 'Components'], ['Composants Endommagés', 'Damaged Components'],
    ['Cuivre', 'Copper'], ['Aluminium', 'Aluminum'], ['Fer', 'Iron'], ['Débris', 'Wreckage'],
  ])('%s uses the English CSV identity', (french, english) => {
    expect(translateFrenchItemName(french)).toBe(english);
    expect(translateFrenchItemName(`${french} (Caisse)`)).toBe(`${english} (Crate)`);
    expect(translateFrenchItemName(`${french} (Crate)`)).toBe(`${english} (Crate)`);
  });

  test.each(['Colonial', 'Warden'])('%s aircraft parts retain size and damage state', faction => {
    for (const [size, englishSize] of [['Petit', 'Small'], ['Grand', 'Large']]) {
      for (const damaged of [false, true]) {
        const engine = `Moteur d'Avion ${faction}${damaged ? ' Endommagé' : ''} (${size})`;
        const parts = `Pièces Mécaniques d'Avion ${faction}${damaged ? ' Endommagées' : ''} (${size})`;
        const prefix = damaged ? 'Damaged ' : '';
        for (const [french, english] of [
          [engine, `${prefix}${faction} Aircraft Engine (${englishSize})`],
          [parts, `${prefix}${faction} Aircraft Mechanical Parts (${englishSize})`],
        ]) {
          expect(knownEnglishNames.has(english)).toBe(true);
          expect(translateFrenchItemName(french)).toBe(english);
        }
      }
    }
  });

  test('normalizes French typographic quotes and nonbreaking spaces for direct callers', () => {
    expect(translateFrenchItemName('Camion-citerne RR-3 “Stolon” (Caisse)')).toBe('RR-3 "Stolon" Tanker (Crate)');
    expect(translateFrenchItemName('Matériaux d’Assemblage\u00a0IV (caisse)')).toBe('Assembly Materials IV (Crate)');
  });

  test.each(['Unknown item', 'BMS - Universal Assembly Rig', 'Radio', '__proto__', 'constructor', ''])('preserves %s', name => {
    expect(translateFrenchItemName(name)).toBe(name);
  });

  test('merges bilingual stock while keeping crates and assembled vehicles separate', () => {
    const { items } = parseCSV(`Camion Plateau BMS - Packmule,4
BMS - Packmule Flatbed,2
Camion Plateau BMS - Packmule (Caisse),1
BMS - Packmule Flatbed (Crate),3`);
    expect(normalizeStockItems(items, new Set(['BMS - Packmule Flatbed']))).toEqual([
      { itemName: 'BMS - Packmule Flatbed', crates: 4, assembled: 6 },
    ]);
  });
});
