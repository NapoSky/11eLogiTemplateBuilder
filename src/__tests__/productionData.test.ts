import { readFileSync } from 'node:fs';
import { buildWikiCatalog } from '../services/wikiCatalog';
import type { WikiSnapshot } from '../services/wikiCatalog';
import { projectWikiData } from '../services/gameData';
import { isProductionRecipe, productionTooltip } from '../services/productionData';

// Frozen recipes keep domain assertions independent of future wiki updates.
const snapshot: WikiSnapshot = JSON.parse(readFileSync('src/__tests__/fixtures/production-hover.snapshot.json', 'utf8'));
const mapping = JSON.parse(readFileSync('scripts/data/iconMapping.legacy.json', 'utf8'));
const catalog = buildWikiCatalog(snapshot, mapping);
const data = projectWikiData(catalog, mapping).itemData;
const item = (name: string) => data.find(item => item.itemName === name)!;
const recipes = (name: string) => item(name).production!;
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));

test('lists the three Materials Factory variants with their actual output batch quantities', () => {
  const variants = recipes('Construction Materials');
  expect(variants.map(r => [r.source, r.category, r.output.amount]))
    .toEqual([['Materials Factory', undefined, 1], ['Materials Factory', 'Metal Press', 3], ['Materials Factory', 'Smelter', 3]]);
  const text = productionTooltip(item('Construction Materials'))!;
  expect(text).toContain('Materials Factory (1 unit)');
  expect(text).toContain('Materials Factory — Metal Press (3 units)');
  expect(text).toContain('15 Salvage, 25 L Petrol');
  expect(text).toContain('Power: 2 MW');
});

test('preserves the Oil Refinery upgrade, alternative building and liquid units', () => {
  const text = productionTooltip(item('Enriched Oil'))!;
  expect(text).toContain('Oil Refinery — Petrochemical Plant (30 L)');
  expect(text).toContain('60 Sulfur, 30 L Heavy Oil');
  expect(text).toContain('Offshore Platform (30 L)');
  expect(text).toContain('100 Coal');
});

test('vehicle upgrades require the base vehicle as well as materials', () => {
  const text = productionTooltip(item('H-8 "Kranesca"'))!;
  expect(text).toContain('Small Assembly Station — Tank Factory (1 unit)');
  expect(text).toContain('1 H-5 “Hatchet” (base vehicle)');
  expect(text).toContain('20 Assembly Materials I');
});

test('aircraft recipes retain the extra engines and mechanical parts outside the six material inputs', () => {
  const recipe = recipes('Daimon aK-5 "Harpy"')[0];
  expect(recipe.inputs.filter(input => input.kind === 'part').map(input => [input.name, input.amount]))
    .toEqual([['Colonial Aircraft Engine (Small)', 2], ['Colonial Aircraft Mechanical Parts (Small)', 7]]);
  expect(productionTooltip(item('Daimon aK-5 "Harpy"'))).toContain('Large Assembly Station — Aircraft Assembly');
});

test('crate inputs distinguish a physical crate from one weapon', () => {
  const text = productionTooltip(item('KRR3-792 Auger'))!;
  expect(text).toContain('1 crate of Argenti r.II Rifle (20 per crate)');
  expect(text).toContain('Infantry Kit Factory — Special-Issue Firearms Assembly (1 crate)');
});

test('retains extraction ranges and coproduced materials', () => {
  expect(productionTooltip(item('Sulfur'))).toContain('Sulfur Mine (9–15 units)');
  const coke = recipes('Coke').find(recipe => recipe.byproducts?.length)!;
  expect(coke.byproducts!.length).toBeGreaterThan(0);
  expect(productionTooltip(item('Coke'))).toContain('Byproducts:');
});

test('keeps the existing four-crate Factory tooltip and omits unknown generic identities', () => {
  expect(productionTooltip(item('First Aid Kit'))).toBe('Production\nFactory (4 crates)\nInputs: 240 Bmats');
  expect(productionTooltip(undefined)).toBeNull();
  expect(productionTooltip(item('Assembly Materials'))).toBeNull();
});

test('shows both Factory and facility ammunition recipes with separate batch sizes and costs', () => {
  const text = productionTooltip(item('68mm'))!;
  expect(text).toContain('Factory (4 crates)');
  expect(text).toContain('Infantry Kit Factory');
  expect(text).toContain('(10 crates)');
  expect(item('68mm').factory).toBeDefined();
  expect(item('68mm').production).toHaveLength(1);
  expect(text.indexOf('Factory (4 crates)')).toBeLessThan(text.indexOf('Infantry Kit Factory'));
});

test.each([
  { source: '' }, { source: 'Factory' }, { rank: 0 }, { inputs: [{ name: 'Coal', amount: -1, kind: 'item' }] },
  { output: { amount: 1, crated: false, high: 0 } }, { power: Infinity },
  { byproducts: [{ name: 'Sulfur', amount: 0 }] },
])('rejects invalid recipe metadata: %s', change => {
  expect(isProductionRecipe({ ...recipes('Construction Materials')[0], ...change })).toBe(false);
});

test('rejects malformed raw inputs and duplicate variants instead of silently losing recipe information', () => {
  const input = clone(snapshot);
  const first = input.tables.Production.find(row => row.Output === 'Construction Materials')!;
  first.InputItem1Amount = 0;
  expect(() => buildWikiCatalog(input, mapping)).toThrow('Invalid production recipe');
  const duplicate = clone(snapshot);
  duplicate.tables.Production.push(clone(duplicate.tables.Production.find(row => row.Output === 'Construction Materials')!));
  duplicate.manifest.Production.rowCount++;
  expect(() => buildWikiCatalog(duplicate, mapping)).toThrow('Duplicate production recipe');
});
