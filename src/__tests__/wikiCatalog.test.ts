import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildWikiCatalog, normalizeWikiImageName, parseWikiSnapshot } from '../services/wikiCatalog';
import type { WikiCatalog, WikiSnapshot } from '../services/wikiCatalog';

// Frozen game facts test the algorithm independently of scheduled live-data changes.
const snapshot: WikiSnapshot = JSON.parse(readFileSync(resolve('src/__tests__/fixtures/wiki-core.snapshot.json'), 'utf8'));
const mapping: Record<string, string> = JSON.parse(readFileSync(resolve('scripts/data/iconMapping.legacy.json'), 'utf8'));
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
let catalog: WikiCatalog;

beforeAll(() => { catalog = buildWikiCatalog(snapshot, mapping); });

function item(name: string) {
  const result = catalog.items.find(x => x.name === name);
  if (!result) throw new Error(`Missing fixture item ${name}`);
  return result;
}

describe('offline wiki catalogue and asset identity', () => {
  test('the accepted snapshot preserves every eligible recipe and accounts for every local asset', () => {
    const accepted: WikiSnapshot = JSON.parse(readFileSync(resolve('scripts/data/wiki.snapshot.json'), 'utf8'));
    const current = buildWikiCatalog(accepted, mapping);
    const expected = accepted.tables.Production.filter(row => row.IsMPFable === '1' || row.IsMPFable === 1 || row.IsMPFable === true)
      .map(row => `${row.OutputType}:${row.Output}`).sort();
    expect(current.items.filter(x => x.mpf).map(x => `${x.kind}:${x.name}`).sort()).toEqual(expected);
    expect(current.assets.map(x => x.iconFilename).sort()).toEqual(Object.keys(mapping).filter(name => !name.startsWith('_')).sort());
  });

  test('joins by image filename even when the current display name describes another vehicle', () => {
    const binding = catalog.assets.find(x => x.iconFilename === 'Textures/UI/VehicleIcons/MortarTankVehicleIcon.png')!;
    expect(binding.legacyDisplayName).toBe('85K-b "Falchion" Mortar Tank');
    expect(binding.itemSourceKey).toBe(item('HC-7 “Ballista”').sourceKey);
    expect(item('HC-7 “Ballista”').mpf).toBeNull();
    const falchion = catalog.assets.find(x => x.itemSourceKey === item('85K-b “Falchion”').sourceKey)!;
    expect(falchion.iconFilename).toBe('Textures/UI/VehicleIcons/ColonialMediumTankIcon.png');
  });

  test('normalizes MediaWiki file underscores without removing arbitrary copy suffixes', () => {
    expect(normalizeWikiImageName('File:HeavyTruckWItemIcon_copy.png')).toBe('heavytruckwitemicon copy.png');
    const binding = catalog.assets.find(x => x.iconFilename.endsWith('HeavyTruckWItemIcon_copy.png'))!;
    expect(binding.itemSourceKey).toBe(item('Cnute Cliffwrest').sourceKey);
    const copy = buildWikiCatalog(snapshot, { 'Textures/UI/VehicleIcons/AircraftDiveCIcon_copy.png': 'Unreviewed copy' });
    expect(copy.assets[0].match).toBe('unresolved');
  });

  test('keeps factions outside MPF and does not let the lore Flask claim Maintenance Supplies', () => {
    expect(item('H-19 “Vulcan”').factions).toEqual(['colonial']);
    expect(item('H-19 “Vulcan”').mpf).toBeNull();
    const binding = catalog.assets.find(x => x.iconFilename.endsWith('/MaintenanceSuppliesIcon.png'))!;
    expect(binding.itemSourceKey).toBe(item('Maintenance Supplies').sourceKey);
    expect(item('Maintenance Supplies').factions).toEqual(['colonial', 'warden']);
  });

  test('retains unknown and ambiguous images instead of selecting the first match', () => {
    const unknown = catalog.assets.find(x => x.iconFilename.endsWith('/LargeshipAircraftCIcon.png'))!;
    expect(unknown).toMatchObject({ match: 'unresolved', itemSourceKey: null, candidateSourceKeys: [] });
    const shared = catalog.assets.find(x => x.iconFilename.endsWith('/FortGarrisonStationIcon.png'))!;
    expect(shared.match).toBe('ambiguous');
    expect(shared.itemSourceKey).toBeNull();
    expect(shared.candidateSourceKeys).toHaveLength(2);
  });

  test('allows a documented exact override and rejects guessed or orphan overrides', () => {
    const filename = 'Textures/UI/VehicleIcons/AircraftFigtherCIcon.png';
    const fighter = item('Toxot-902 “Blind Silver”');
    const override = { pageId: fighter.pageId, kind: fighter.kind, name: fighter.name, reason: 'Wiki image filename spells Figther; explicit reviewed identity.' };
    const result = buildWikiCatalog(snapshot, mapping, { [filename]: override });
    expect(result.assets.find(x => x.iconFilename === filename)).toMatchObject({ match: 'explicit', itemSourceKey: fighter.sourceKey });
    expect(() => buildWikiCatalog(snapshot, mapping, { [filename]: { ...override, reason: '' } })).toThrow('Invalid asset override');
    expect(() => buildWikiCatalog(snapshot, mapping, { 'absent.png': override })).toThrow('Orphan asset override');
  });

  test('does not mutate historical mappings or the source and is deterministic across row ordering', () => {
    const input = clone(snapshot);
    const labels = clone(mapping);
    const before = JSON.stringify({ input, labels });
    buildWikiCatalog(input, labels);
    expect(JSON.stringify({ input, labels })).toBe(before);
    Object.values(input.tables).forEach(rows => rows.reverse());
    expect(buildWikiCatalog(input, Object.fromEntries(Object.entries(labels).reverse()))).toEqual(catalog);
  });

  test('rejects orphan, conflicting or incomplete annotations instead of concealing current identities', () => {
    const filename = 'Textures/UI/ItemIcons/FacilityMaterials4Icon.png';
    const annotation = { classification: 'generic' as const, displayName: 'Assembly Materials', reason: 'Reviewed common artwork without a grade.' };
    expect(() => buildWikiCatalog(snapshot, mapping, {}, { 'absent.png': annotation })).toThrow('Orphan asset annotation');
    expect(() => buildWikiCatalog(snapshot, mapping, {}, { [filename]: { ...annotation, reason: '' } })).toThrow('Invalid asset annotation');
    const fighter = item('Toxot-902 “Blind Silver”');
    const fighterFilename = 'Textures/UI/VehicleIcons/AircraftFigtherCIcon.png';
    const override = { pageId: fighter.pageId, kind: fighter.kind, name: fighter.name, reason: 'Reviewed identity.' };
    expect(() => buildWikiCatalog(snapshot, mapping, { [fighterFilename]: override }, { [fighterFilename]: annotation }))
      .toThrow('Invalid asset annotation');
    expect(() => buildWikiCatalog(snapshot, mapping, {}, { [fighterFilename]: annotation }))
      .toThrow('Annotated asset now matches a current entity');
  });
});

describe('explicit packaging metadata, independent of stockpile arithmetic', () => {
  test('keeps Factory costs per crate and exposes item count per crate separately', () => {
    expect(item('“Dusk” ce.III').mpf).toMatchObject({
      sourceBasis: 'crate', unitsPerCrate: 20, maxCratesPerOrder: 9,
      baseCostPerCrate: { rmat: 15 },
    });
  });

  test('converts the unit build cost into a vehicle crate cost before discounts', () => {
    expect(item('Noble Widow MK. XIV').declaredCrateCapacity).toBeNull();
    expect(item('Noble Widow MK. XIV').mpf).toMatchObject({
      sourceBasis: 'unit', unitsPerCrate: 3, maxCratesPerOrder: 5,
      baseCostPerCrate: { rmat: 480 },
    });
  });

  test('Falchion has five vehicles per crate but its base cost still uses three unit costs', () => {
    expect(item('85K-b “Falchion”').mpf).toMatchObject({
      sourceBasis: 'unit', unitsPerCrate: 5, maxCratesPerOrder: 5,
      baseCostPerCrate: { rmat: 405 },
    });
    expect(item('85K-b “Falchion”').mpf).not.toHaveProperty('crateBonus');
  });

  test('retains the two crate capacities explicitly settled in favour of the wiki', () => {
    expect(item('7.92mm').mpf!.unitsPerCrate).toBe(30);
    expect(item('KRF1-750 Dragonfly').mpf!.unitsPerCrate).toBe(15);
  });

  test('unknown faction stays unknown instead of becoming available to both factions', () => {
    const input = clone(snapshot);
    const row = input.tables.itemdata.find(x => x.name === '7.92mm')!;
    delete row.faction;
    expect(buildWikiCatalog(input, mapping).items.find(x => x.name === '7.92mm')!.factions).toBeNull();
  });
});

describe('ordinary Factory recipes, including items outside MPF eligibility', () => {
  function medicalSnapshot(): WikiSnapshot {
    const input = clone(snapshot);
    input.tables.itemdata.push({ _pageID: 2303, _pageName: 'First Aid Kit', name: 'First Aid Kit',
      codename: 'FirstAidKit', image: 'FirstAidKitItem.png', faction: 'Both', crate_amount: 10 });
    input.manifest.itemdata.rowCount++;
    input.tables.Production.push({ _pageID: 2303, _pageName: 'First Aid Kit', Output: 'First Aid Kit',
      OutputType: 'item', Source: 'Factory', RecipeRank: 1, IsCrateOutput: true, CrateCapacity: 10,
      OutputAmount: 1, InputItem1: 'Basic Materials', InputItem1Amount: 60 });
    input.manifest.Production.rowCount++;
    return input;
  }

  test('retains the per-crate medical cost and the four-crate Factory limit without making it MPF eligible', () => {
    const medical = buildWikiCatalog(medicalSnapshot(), mapping).items.find(item => item.name === 'First Aid Kit')!;
    expect(medical.mpf).toBeNull();
    expect(medical.factory).toEqual({ baseCostPerCrate: { bmat: 60 }, unitsPerCrate: 10, maxCratesPerOrder: 4 });
  });

  test('keeps the undiscounted Factory price distinct from MPF order sizes', () => {
    const dusk = item('“Dusk” ce.III');
    expect(dusk.factory).toEqual({ baseCostPerCrate: { rmat: 15 }, unitsPerCrate: 20, maxCratesPerOrder: 4 });
    expect(dusk.mpf!.maxCratesPerOrder).toBe(9);
    expect(item('85K-b “Falchion”').factory).toBeNull();
  });

  test('uses only the Factory recipe when the same item can also be made at a facility', () => {
    const input = medicalSnapshot();
    input.tables.Production.push({ ...input.tables.Production.at(-1)!, Source: 'Infantry Kit Factory', InputItem1Amount: 5 });
    input.manifest.Production.rowCount++;
    expect(buildWikiCatalog(input, mapping).items.find(item => item.name === 'First Aid Kit')!.factory!.baseCostPerCrate)
      .toEqual({ bmat: 60 });
  });

  test('rejects ambiguous Factory recipes instead of selecting an arbitrary price', () => {
    const input = medicalSnapshot();
    input.tables.Production.push({ ...input.tables.Production.at(-1)!, RecipeRank: 2 });
    input.manifest.Production.rowCount++;
    expect(() => buildWikiCatalog(input, mapping)).toThrow('Ambiguous Factory recipes');
  });

  test.each([
    { IsCrateOutput: false }, { InputItem1Amount: -1 }, { InputItem1: 'Unknown Material' },
    { InputItem1Amount: Number.MAX_SAFE_INTEGER }, { CrateCapacity: 0 },
  ])('rejects an invalid non-MPF Factory recipe: %s', change => {
    const input = medicalSnapshot();
    Object.assign(input.tables.Production.at(-1)!, change);
    expect(() => buildWikiCatalog(input, mapping)).toThrow();
  });
});

describe('invalid or incomplete data must not silently become an accepted catalogue', () => {
  test('rejects API errors and empty/truncated source tables', () => {
    expect(() => parseWikiSnapshot({ error: { code: 'ratelimited' } })).toThrow();
    const input = clone(snapshot);
    input.tables.vehicles = [];
    expect(() => buildWikiCatalog(input, mapping)).toThrow('Missing or empty table vehicles');
  });

  test('rejects duplicate MPF recipes instead of keeping the first one', () => {
    const input = clone(snapshot);
    const recipe = input.tables.Production.find(x => x.Output === '7.92mm' && x.IsMPFable === '1')!;
    input.tables.Production.push(clone(recipe));
    input.manifest.Production.rowCount++;
    expect(() => buildWikiCatalog(input, mapping)).toThrow('Ambiguous MPF recipes');
  });

  test('detects a truncated nonempty table using the capture manifest', () => {
    const input = clone(snapshot);
    input.tables.Production.pop();
    expect(() => buildWikiCatalog(input, mapping)).toThrow('Truncated or inconsistent table Production');
  });

  test.each(['bad', -1, NaN])('rejects invalid production amounts: %s', amount => {
    const input = clone(snapshot);
    const recipe = input.tables.Production.find(x => x.Output === '7.92mm' && x.IsMPFable === '1')!;
    recipe.InputItem1Amount = amount;
    expect(() => buildWikiCatalog(input, mapping)).toThrow();
  });

  test('rejects unknown MPF materials rather than dropping a portion of the cost', () => {
    const input = clone(snapshot);
    const recipe = input.tables.Production.find(x => x.Output === '7.92mm' && x.IsMPFable === '1')!;
    recipe.InputItem1 = 'Unknown Future Resource';
    expect(() => buildWikiCatalog(input, mapping)).toThrow('Unsupported MPF ingredient');
  });

  test('accepts typed numeric/boolean CargoExport values as well as cargoquery strings', () => {
    const input = clone(snapshot);
    const recipe = input.tables.Production.find(x => x.Output === '7.92mm' && x.IsMPFable === '1')!;
    recipe.IsMPFable = true;
    recipe.IsCrateOutput = true;
    recipe.RecipeRank = 1;
    recipe.OutputAmount = 1;
    recipe.CrateCapacity = 30;
    recipe.InputItem1Amount = 120;
    const result = buildWikiCatalog(input, mapping);
    expect(result.items.find(x => x.name === '7.92mm')!.mpf).toEqual(item('7.92mm').mpf);
  });
});
