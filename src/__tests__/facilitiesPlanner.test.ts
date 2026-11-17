import { readFileSync } from 'node:fs';
import { buildWikiCatalog } from '../services/wikiCatalog';
import { projectFacilitiesCatalog, defaultFacilityRecipe, isFacilityObjective } from '../services/facilitiesCatalog';
import type { FacilitiesCatalog, FacilityItem, FacilityRecipe } from '../services/facilitiesCatalog';
import { canSupplyByPipeline, emptyFacilityMission, emptyFacilityProfile, isFacilityProfile, planFacilities, exportFacilityMission, facilityAmount, facilityDiscordChunks, facilityLiquidSupply, facilityResourceSupply, facilityStageAmount, facilitySupplyAmount, facilitySupplyTooltip, groupFacilitySupplies } from '../services/facilitiesPlanner';
import { FacilitiesWorkspace, FACILITY_MISSION_KEY, FACILITY_PROFILE_KEY, loadFacilitiesCatalog } from '../services/facilitiesStorage';

const json = (path: string) => JSON.parse(readFileSync(path, 'utf8'));
const compatibility = json('scripts/data/wiki.compatibility.json');
const raw = buildWikiCatalog(json('scripts/data/wiki.snapshot.json'), json('scripts/data/iconMapping.legacy.json'), compatibility.assetOverrides, compatibility.assetAnnotations);
const real = projectFacilitiesCatalog(raw, compatibility.iconVariants);
const item = (name: string) => real.items.find(item => item.name === name && item.unit !== 'crates')!;
const recipe = (id: string, inputs: FacilityRecipe['inputs'], amount = 1): FacilityRecipe => ({ id, source: 'Materials Factory', amount, inputs, byproducts: [], crated: false });
const node = (id: string, recipes: FacilityRecipe[] = []): FacilityItem => ({ id, name: id, kind: 'item', unit: 'units', factions: [], recipes });
const simple: FacilitiesCatalog = { schemaVersion: 1, capturedOn: '2026-11-16', items: [
  node('Salvage'), { ...node('Petrol'), unit: 'L' },
  node('CMAT', [recipe('batch-3', [{ itemId: 'Salvage', amount: 15 }, { itemId: 'Petrol', amount: 25 }], 3)]),
  node('A', [recipe('a', [{ itemId: 'CMAT', amount: 1 }])]),
  node('B', [recipe('b', [{ itemId: 'CMAT', amount: 1 }])]),
] };
const mission = (...goals: Array<[string, number]>) => ({ ...emptyFacilityMission(), objectives: goals.map(([itemId, quantity]) => ({ itemId, quantity })) });

describe('facility batch planning', () => {
  test('Discord omits inputs, surplus and requires while preserving Coke and the complete material plan', () => {
    const catalog: FacilitiesCatalog = { ...simple, items: [node('Coal'),
      node('Coke', [recipe('coke', [{ itemId: 'Coal', amount: 2 }], 10)]),
      node('Product', [recipe('product', [{ itemId: 'Coke', amount: 3 }, { itemId: 'Coal', amount: 1 }])]),
    ] };
    const doc = { ...mission(['Product', 4], ['Coke', 2]), available: { Coke: 1 } };
    const profile = emptyFacilityProfile();
    const plan = planFacilities(catalog, doc, profile);
    const before = JSON.stringify(plan);
    const text = exportFacilityMission(catalog, doc, profile, plan);
    expect(text).toContain('Produce 4 Product'); expect(text).toContain('Bring 1 Resource Containers of Coal (x1)');
    expect(text).not.toMatch(/Inputs:|Surplus:|Requires:/);
    expect(text).toContain('- 2 Coke'); expect(text).toContain('- 1 Coke'); expect(text).toContain('Produce 20 Coke');
    expect(plan.steps.find(step => step.item.id === 'Coke')).toMatchObject({ produced: 20, surplus: 7 });
    expect(JSON.stringify(plan)).toBe(before);
    profile.recipes.Coke = 'supply';
    const supplied = planFacilities(catalog, doc, profile);
    expect(supplied.supplies.find(row => row.item.id === 'Coke')!.amount).toBe(13);
    expect(exportFacilityMission(catalog, doc, profile, supplied)).toContain('Bring 13 Coke');
  });

  test.each([2015, 4000])('keeps a %i-character Discord briefing in one message', length => {
    const briefing = 'x'.repeat(length);
    expect(facilityDiscordChunks(briefing)).toEqual([briefing]);
  });

  test('splits long Discord briefings into copyable messages without losing any text', () => {
    const briefing = Array.from({ length: 300 }, (_, index) => `- Produce item ${index}`).join('\n');
    const chunks = facilityDiscordChunks(briefing);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every(chunk => chunk.length <= 4000)).toBe(true);
    expect(chunks.join('\n')).toBe(briefing);
    expect(facilityDiscordChunks('')).toEqual([]);
    expect(facilityDiscordChunks('x'.repeat(4001))).toEqual(['x'.repeat(4000), 'x']);
    const unicode = `${'x'.repeat(3999)}🚂`;
    expect(facilityDiscordChunks(unicode)).toEqual(['x'.repeat(3999), '🚂']);
  });
  test('combines shared requirements before rounding and reports actual surplus', () => {
    const plan = planFacilities(simple, mission(['A', 1], ['B', 1]), emptyFacilityProfile());
    expect(plan.errors).toEqual([]);
    expect(plan.steps.find(step => step.item.id === 'CMAT')).toMatchObject({ needed: 2, batches: 1, produced: 3, surplus: 1, level: 1 });
    expect(plan.supplies.map(row => [row.item.id, row.amount])).toEqual([['Petrol', 25], ['Salvage', 15]]);
    expect(plan.steps.filter(step => step.level === 2).map(step => step.item.id)).toEqual(['A', 'B']);
  });

  test('subtracts shared allocated stock once and stops upstream production when sufficient', () => {
    const doc = { ...mission(['A', 1], ['B', 1]), available: { CMAT: 2 } };
    const plan = planFacilities(simple, doc, emptyFacilityProfile());
    expect(plan.steps.map(step => step.item.id)).toEqual(['A', 'B']);
    expect(plan.supplies).toEqual([]);
    expect(plan.stock.map(row => [row.item.id, row.amount])).toEqual([['CMAT', 2]]);
    doc.available.CMAT = 1;
    const partial = planFacilities(simple, doc, emptyFacilityProfile());
    expect(partial.steps.find(step => step.item.id === 'CMAT')).toMatchObject({ needed: 1, batches: 1, surplus: 2 });
  });

  test('creates one production step when an objective is also an ingredient', () => {
    const doc = mission(['A', 1], ['CMAT', 2]);
    const profile = emptyFacilityProfile();
    const plan = planFacilities(simple, doc, profile);
    expect(plan.steps.filter(step => step.item.id === 'CMAT')).toHaveLength(1);
    expect(plan.steps.find(step => step.item.id === 'CMAT')!.produced).toBe(3);
    const exported = exportFacilityMission(simple, doc, profile, plan);
    expect(exported.match(/Produce 3 CMAT/g)).toHaveLength(1);
    expect(exported).not.toContain('Requires:');
  });

  test('an external supply choice stops a chain, while a stale saved recipe blocks export', () => {
    const doc = mission(['A', 1]);
    const profile = { ...emptyFacilityProfile(), recipes: { CMAT: 'supply' } };
    expect(planFacilities(simple, doc, profile).supplies.map(row => [row.item.id, row.amount])).toEqual([['CMAT', 1]]);
    profile.recipes.CMAT = 'old-recipe';
    const invalid = planFacilities(simple, doc, profile);
    expect(invalid.errors[0]).toContain('Saved recipe for CMAT has changed');
    expect(exportFacilityMission(simple, doc, profile, invalid)).toBe('');
  });

  test('handles deep chains and rejects cycles with an actionable error', () => {
    const catalog = { ...simple, items: [node('0'), ...Array.from({ length: 12 }, (_, i) => node(String(i + 1), [recipe(String(i + 1), [{ itemId: String(i), amount: 1 }])]))] };
    expect(planFacilities(catalog, mission(['12', 1]), emptyFacilityProfile()).steps).toHaveLength(12);
    catalog.items[0].recipes = [recipe('cycle', [{ itemId: '12', amount: 1 }])];
    expect(planFacilities(catalog, mission(['12', 1]), emptyFacilityProfile()).errors.join(' ')).toContain('Recipe cycle');
    expect(planFacilities(catalog, mission(['12', 1]), { ...emptyFacilityProfile(), recipes: { '0': 'supply' } }).errors).toEqual([]);
  });

  test('does not credit byproducts against another requirement', () => {
    const catalog = { ...simple, items: [...simple.items, node('C', [{ ...recipe('c', [{ itemId: 'Salvage', amount: 10 }]), byproducts: [{ itemId: 'Petrol', amount: 100 }] }])] };
    const plan = planFacilities(catalog, mission(['C', 1], ['CMAT', 1]), emptyFacilityProfile());
    expect(plan.supplies.find(row => row.item.id === 'Petrol')!.amount).toBe(25);
    expect(plan.steps.find(step => step.item.id === 'C')!.byproducts[0].amount).toBe(100);
    expect(exportFacilityMission(catalog, mission(['C', 1], ['CMAT', 1]), emptyFacilityProfile(), plan)).toContain('Byproducts are not deducted');
  });

  test('rejects invalid quantities, missing items, wrong factions and unsafe totals', () => {
    expect(planFacilities(simple, mission(['A', 0]), emptyFacilityProfile()).errors).toHaveLength(1);
    expect(planFacilities(simple, mission(['absent', 1]), emptyFacilityProfile()).errors.join(' ')).toContain('no longer in the catalogue');
    const catalog = { ...simple, items: [...simple.items, { ...node('Warden'), factions: ['warden' as const] }] };
    expect(planFacilities(catalog, { ...mission(['Warden', 1]), faction: 'colonial' }, emptyFacilityProfile()).errors.join(' ')).toContain('selected faction');
    const huge = { ...simple, items: [node('X', [recipe('huge', [{ itemId: 'Salvage', amount: Number.MAX_SAFE_INTEGER }])]), node('Salvage')] };
    expect(planFacilities(huge, mission(['X', 2]), emptyFacilityProfile()).errors.join(' ')).toContain('too large');
  });
});

describe('accepted wiki facility recipes', () => {
  test('72 litres of Heavy Oil become three complete cans with the exact resources for 90 litres', () => {
    const heavy = item('Heavy Oil');
    const doc = mission([heavy.id, 72]);
    const plan = planFacilities(real, doc, emptyFacilityProfile());
    expect(plan.errors).toEqual([]);
    expect(plan.steps.find(step => step.item.id === heavy.id)).toMatchObject({ needed: 72, batches: 3, produced: 90, surplus: 18 });
    expect(plan.supplies.find(row => row.item.name === 'Oil')!.amount).toBe(150);
    expect(exportFacilityMission(real, doc, emptyFacilityProfile(), plan)).toContain('Produce 3 cans of Heavy Oil');
    expect(facilityStageAmount(18, heavy, true)).toBe('Less than 1 can of Heavy Oil');
    expect(doc.objectives[0].quantity).toBe(72);
  });

  test('liquid batch rounding funds complete cans even when recipe output is smaller than a can', () => {
    const catalog: FacilitiesCatalog = { ...simple, items: [node('Salvage'), { ...node('Heavy Oil', [recipe('small-output', [{ itemId: 'Salvage', amount: 10 }], 18)]), unit: 'L' }] };
    const plan = planFacilities(catalog, mission(['Heavy Oil', 72]), emptyFacilityProfile());
    expect(plan.steps[0]).toMatchObject({ batches: 5, produced: 90, inputs: [{ amount: 50 }] });
    const partial = planFacilities(catalog, mission(['Heavy Oil', 31]), emptyFacilityProfile());
    expect(partial.steps[0]).toMatchObject({ batches: 4, produced: 72 });
    expect(facilityStageAmount(partial.steps[0].produced, partial.steps[0].item, true)).toBe('2 cans of Heavy Oil');
  });

  test('pipeline Heavy Oil stops only its upstream chain and retains independently required Oil', () => {
    const heavy = item('Heavy Oil'), enriched = item('Enriched Oil'), petrol = item('Petrol');
    const doc = mission([enriched.id, 30], [petrol.id, 50]);
    const profile = { ...emptyFacilityProfile(), piped: [heavy.id] };
    const plan = planFacilities(real, doc, profile);
    expect(plan.errors).toEqual([]);
    expect(plan.piped.map(row => [row.item.name, row.amount])).toEqual([['Heavy Oil', 30]]);
    expect(plan.steps.map(step => step.item.name)).toEqual(['Enriched Oil', 'Petrol']);
    expect(Object.fromEntries(plan.supplies.map(row => [row.item.name, row.amount]))).toEqual({ Oil: 50, Sulfur: 60 });
    const text = exportFacilityMission(real, doc, profile, plan);
    expect(text).toContain('__Already allocated — do not gather again__');
    expect(text).toContain('- Heavy Oil (Piped)');
    expect(text).not.toContain('__Supplied by pipeline__');
    expect(text).not.toContain('Produce 1 can of Heavy Oil');
  });

  test('Oil and Heavy Oil connections both remain visible when the Heavy Oil pipeline cuts upstream Oil demand', () => {
    const heavy = item('Heavy Oil'), oil = item('Oil'), enriched = item('Enriched Oil');
    const doc = { ...mission([enriched.id, 30]), available: { [item('Sulfur').id]: 10 } };
    const profile = { ...emptyFacilityProfile(), piped: [oil.id, heavy.id] };
    const plan = planFacilities(real, doc, profile);
    expect(plan.errors).toEqual([]);
    expect(plan.piped.map(row => [row.item.name, row.amount])).toEqual([['Heavy Oil', 30], ['Oil', 0]]);
    expect(plan.steps.map(step => step.item.name)).toEqual(['Enriched Oil']);
    expect(plan.supplies.map(row => [row.item.name, row.amount])).toEqual([['Sulfur', 50]]);
    const text = exportFacilityMission(real, doc, profile, plan);
    const pipelines = text.split('__Already allocated — do not gather again__')[1].split('__Raw resources')[0];
    expect(pipelines).toContain('- 10 Sulfur');
    expect(pipelines).toContain('- Heavy Oil (Piped)'); expect(pipelines).toContain('- Oil (Piped)');
    expect(text.match(/__Already allocated — do not gather again__/g)).toHaveLength(1);
    expect(pipelines).not.toContain('0 L');
    profile.piped = [heavy.id];
    expect(planFacilities(real, doc, profile).piped.map(row => row.item.name)).toEqual(['Heavy Oil']);
  });

  test('piped field Oil and Water leave the selected refinery recipe active and require no manual liquid supply', () => {
    const petrol = item('Petrol'), oil = item('Oil'), water = item('Water');
    const reformer = petrol.recipes.find(recipe => recipe.category === 'Reformer')!;
    const profile = { ...emptyFacilityProfile(), recipes: { [petrol.id]: reformer.id, [water.id]: water.recipes[0].id }, piped: [oil.id, water.id] };
    const doc = mission([petrol.id, 100]);
    const plan = planFacilities(real, doc, profile);
    expect(plan.errors).toEqual([]);
    expect(plan.steps).toHaveLength(1);
    expect(plan.steps[0]).toMatchObject({ recipe: { id: reformer.id }, produced: 100, batches: 2 });
    expect(plan.supplies).toEqual([]);
    expect(Object.fromEntries(plan.piped.map(row => [row.item.name, row.amount]))).toEqual({ Oil: 80, Water: 20 });
    const text = exportFacilityMission(real, doc, profile, plan);
    expect(text).toContain('Produce 2 cans of Petrol');
    expect(text).toContain('- Oil (Piped)'); expect(text).toContain('- Water (Piped)');
    expect(text).not.toContain('Inputs:');
    profile.piped = [];
    const restored = planFacilities(real, doc, profile);
    expect(restored.steps.some(step => step.item.name === 'Water')).toBe(true);
    expect(restored.supplies.find(row => row.item.name === 'Oil')!.amount).toBe(80);
    expect(profile.recipes[petrol.id]).toBe(reformer.id);
  });

  test('pipeline settings validate their shape and reject reachable non-liquid exclusions', () => {
    expect(isFacilityProfile(emptyFacilityProfile())).toBe(true);
    expect(isFacilityProfile({ ...emptyFacilityProfile(), piped: 'all' })).toBe(false);
    expect(isFacilityProfile({ ...emptyFacilityProfile(), piped: ['Water', 'Water'] })).toBe(false);
    expect(canSupplyByPipeline(item('Water'))).toBe(true);
    expect(canSupplyByPipeline(item('Coal'))).toBe(false);
    const doc = mission([item('Construction Materials').id, 1]);
    const profile = { ...emptyFacilityProfile(), piped: [item('Salvage').id] };
    const plan = planFacilities(real, doc, profile);
    expect(plan.errors.join(' ')).toContain('cannot be supplied by pipeline');
    expect(exportFacilityMission(real, doc, profile, plan)).toBe('');
  });

  test('raw deliveries round up to whole Resource Containers while recipe quantities stay exact', () => {
    for (const name of ['Coal', 'Components', 'Salvage', 'Sulfur', 'Damaged Components', 'Aluminum', 'Iron', 'Copper']) {
      const raw = item(name);
      expect(facilitySupplyAmount(1, raw)).toBe(`1 Resource Container of ${name}`);
      expect(facilitySupplyAmount(4_999, raw)).toBe(`1 Resource Container of ${name}`);
      expect(facilitySupplyAmount(5_000, raw)).toBe(`1 Resource Container of ${name}`);
      expect(facilitySupplyAmount(10_000, raw)).toBe(`2 Resource Containers of ${name}`);
      expect(facilitySupplyAmount(12_500, raw)).toBe(`3 Resource Containers of ${name}`);
      expect(facilityResourceSupply(5_001, raw)).toEqual({ containers: 2, capacity: 5_000 });
      expect(facilityAmount(12_500, raw)).toBe(`12,500 ${name}`);
    }
    expect(facilitySupplyTooltip(12_500, item('Coal'))).toContain('12,500 units required\n5,000 units per Resource Container · Rounded up for delivery');
    expect(facilitySupplyTooltip(10_000, item('Coal'))).not.toContain('Partial load');
    const rare = item('Rare Metal');
    expect(facilitySupplyAmount(3_200, rare)).toBe('3,200 Rare Metal');
    expect(facilitySupplyAmount(5_001, rare)).toBe('5,001 Rare Metal');
    expect(facilityResourceSupply(3_200, rare)).toBeUndefined();
    const rareMission = mission([rare.id, 3_200]);
    expect(exportFacilityMission(real, rareMission, emptyFacilityProfile(), planFacilities(real, rareMission, emptyFacilityProfile())))
      .toContain('Bring 3,200 Rare Metal');
    const coalMission = mission([item('Coal').id, 160_000]);
    expect(exportFacilityMission(real, coalMission, emptyFacilityProfile(), planFacilities(real, coalMission, emptyFacilityProfile())))
      .toContain('🇦・Bring 1 Resource Containers of Coal (x32)');
    expect(facilitySupplyAmount(10_000, item('Coke'))).toBe('10,000 Coke');
    expect(facilitySupplyAmount(10_000, item('Construction Materials'))).toBe('10,000 Construction Materials');
    expect(facilitySupplyAmount(3, { ...item('Coal'), unit: 'crates' })).toBe('3 crates of Coal');
    expect(facilityResourceSupply(10_000, { ...item('Coal'), kind: 'vehicle' })).toBeUndefined();
    expect(facilitySupplyTooltip(2, item('BMS Black Bolt'))).toBe('');
  });

  test('raw container presentation is applied after allocated stock, with unchanged exact production and saved units', () => {
    const doc = { ...mission(['CMAT', 3_000]), available: { Salvage: 2_500 } };
    const before = JSON.stringify(doc);
    const profile = emptyFacilityProfile();
    const plan = planFacilities(simple, doc, profile);
    expect(plan.supplies.find(row => row.item.id === 'Salvage')!.amount).toBe(12_500);
    expect(plan.steps[0].inputs.find(row => row.item.id === 'Salvage')!.amount).toBe(15_000);
    const text = exportFacilityMission(simple, doc, profile, plan);
    expect(text).toContain('Bring 1 Resource Containers of Salvage (x3)');
    expect(text).toContain('Bring 500 cans of Petrol');
    expect(text).not.toContain('Inputs:');
    expect(text).toContain('- 2,500 Salvage');
    expect(JSON.stringify(doc)).toBe(before);
  });

  test('liquid deliveries use each full can capacity without changing recipe units or physical crates', () => {
    for (const [name, litres] of [['Diesel', 100], ['Enriched Oil', 30], ['Heavy Oil', 30], ['Oil', 50], ['Petrol', 50], ['Water', 50]] as const) {
      const liquid = item(name);
      expect(facilitySupplyAmount(litres, liquid)).toBe(`1 can of ${name}`);
      expect(facilitySupplyAmount(litres * 2, liquid)).toBe(`2 cans of ${name}`);
      expect(facilitySupplyAmount(litres * 2 + 1, liquid)).toBe(`3 cans of ${name}`);
      expect(facilityAmount(litres * 2 + 1, liquid)).toBe(`${litres * 2 + 1} L ${name}`);
    }
    expect(facilityLiquidSupply(61, item('Enriched Oil'))).toEqual({ cans: 3, litresPerCan: 30 });
    const unknown = { ...node('Unmapped liquid'), unit: 'L' };
    expect(facilitySupplyAmount(61, unknown)).toBe('61 L Unmapped liquid');
    expect(facilitySupplyAmount(2, { ...item('Petrol'), unit: 'crates' })).toBe('2 crates of Petrol');
    expect(facilitySupplyAmount(100, item('Salvage'))).toBe('1 Resource Container of Salvage');
  });

  test('Discord rounds only liquid deliveries after stock subtraction, preserving exact stage inputs and cached stock', () => {
    const doc = { ...mission(['CMAT', 6]), available: { Petrol: 1 } };
    const before = JSON.stringify(doc);
    const profile = emptyFacilityProfile();
    const plan = planFacilities(simple, doc, profile);
    expect(plan.supplies.find(row => row.item.id === 'Petrol')!.amount).toBe(49);
    expect(plan.steps[0].inputs.find(row => row.item.id === 'Petrol')!.amount).toBe(50);
    const text = exportFacilityMission(simple, doc, profile, plan);
    expect(text).toContain('Bring 1 can of Petrol');
    expect(text).not.toContain('Inputs:');
    expect(text).toContain('- 1 L Petrol');
    expect(JSON.stringify(doc)).toBe(before);
  });

  test('Callahan produces Assembly Materials II by default and only supplies them with an explicit override', () => {
    const assembly = item('Assembly Materials II');
    const doc = { ...mission([item('Callahan').id, 1]), faction: 'warden' as const };
    const profile = emptyFacilityProfile();
    const plan = planFacilities(real, doc, profile);
    expect(plan.errors).toEqual([]);
    expect(plan.steps.find(step => step.item.id === assembly.id)).toMatchObject({ needed: 840, produced: 840, recipe: { source: 'Materials Factory', category: 'Forge' } });
    expect(plan.supplies.some(row => row.item.id === assembly.id)).toBe(false);
    profile.recipes[assembly.id] = 'supply';
    const external = planFacilities(real, doc, profile);
    expect(external.steps.some(step => step.item.id === assembly.id)).toBe(false);
    expect(external.supplies.find(row => row.item.id === assembly.id)!.amount).toBe(840);
    expect(exportFacilityMission(real, doc, profile, external)).toContain('Bring 840 Assembly Materials II (external supply selected)');
    profile.recipes[assembly.id] = defaultFacilityRecipe(assembly)!.id;
    expect(planFacilities(real, doc, profile).supplies.some(row => row.item.id === assembly.id)).toBe(false);
    doc.available[assembly.id] = 40;
    expect(planFacilities(real, doc, profile).steps.find(step => step.item.id === assembly.id)!.produced).toBe(800);
  });

  test('supply groups distinguish classic gathering, liquids and other deliveries without changing quantities', () => {
    const supplies = [
      ...['Coal', 'Salvage', 'Sulfur', 'Components'].map(name => ({ item: item(name), amount: 100 })),
      ...['Oil', 'Heavy Oil', 'Enriched Oil', 'Petrol', 'Water'].map(name => ({ item: item(name), amount: 250 })),
      { item: item('Rare Metal'), amount: 10 }, { item: item('Assembly Materials II'), amount: 5 },
    ];
    const before = JSON.stringify(supplies);
    const groups = groupFacilitySupplies(supplies);
    expect(groups.map(group => [group.id, group.items.length])).toEqual([['raw', 4], ['liquids', 5], ['other', 2]]);
    expect(groups.flatMap(group => group.items)).toHaveLength(supplies.length);
    expect(JSON.stringify(supplies)).toBe(before);
    const plan = planFacilities(real, mission([item('Callahan').id, 1]), emptyFacilityProfile());
    const text = exportFacilityMission(real, mission([item('Callahan').id, 1]), emptyFacilityProfile(), plan);
    expect(text).toContain('__Raw resources to gather__');
    expect(text).toContain('__Liquids to supply__');
    expect(text).toContain('__Other supplies__');
  });

  test('publishes every Assembly Materials grade independently of icons and keeps existing projections untouched', () => {
    for (const grade of ['I', 'II', 'III', 'IV', 'V']) expect(defaultFacilityRecipe(item(`Assembly Materials ${grade}`))).toBeDefined();
    expect(real.items.find(entry => entry.name === 'Heavy Oil')!.icon).toBe(compatibility.iconVariants['Heavy Oil'].facilities);
    expect(projectFacilitiesCatalog(raw, compatibility.iconVariants)).toEqual(real);
  });

  test('calculates two trains using whole Cmat and Pcmat batches', () => {
    const doc = mission(...[['BMS Black Bolt', 2], ['BMS Holdout', 2], ['BMS Roadhouse', 2], ['BMS Longrider', 20]].map(([name, quantity]) => [item(name as string).id, quantity as number] as [string, number]));
    const profile = emptyFacilityProfile();
    profile.recipes[item('Construction Materials').id] = item('Construction Materials').recipes.find(recipe => recipe.category === 'Metal Press')!.id;
    profile.recipes[item('Processed Construction Materials').id] = item('Processed Construction Materials').recipes.find(recipe => recipe.category === 'Blast Furnace')!.id;
    for (const name of ['Coke', 'Petrol', 'Heavy Oil']) profile.recipes[item(name).id] = 'supply';
    const plan = planFacilities(real, doc, profile);
    expect(plan.errors).toEqual([]);
    expect(plan.steps.find(step => step.item.name === 'Processed Construction Materials')).toMatchObject({ needed: 980, produced: 981, batches: 327 });
    expect(plan.steps.find(step => step.item.name === 'Construction Materials')).toMatchObject({ needed: 1641, produced: 1641, batches: 547 });
    expect(Object.fromEntries(plan.supplies.map(row => [row.item.name, row.amount]))).toEqual({ Salvage: 15405, Components: 17985, Coke: 9000, Sulfur: 4400, Petrol: 31675, 'Heavy Oil': 8562 });
  });

  test('expands aircraft engines and mechanical parts and preserves base vehicles for upgrades', () => {
    const plane = real.items.find(item => item.recipes.some(recipe => recipe.category === 'Aircraft Assembly'))!;
    const aircraft = planFacilities(real, mission([plane.id, 3]), emptyFacilityProfile());
    expect(aircraft.errors).toEqual([]);
    expect(aircraft.steps.filter(step => step.recipe.source === 'Aircraft Maintenance Factory').length).toBeGreaterThanOrEqual(2);
    const vehicle = item("O'Brien V.200 Squire");
    const upgrade = planFacilities(real, mission([vehicle.id, 15]), emptyFacilityProfile());
    expect(upgrade.errors).toEqual([]);
    expect(upgrade.supplies.filter(row => row.item.kind === 'vehicle').map(row => row.amount)).toEqual([15]);
  });

  test('keeps required physical crates separate from loose units and their stock', () => {
    const sniper = item('Clancy-Raca M4');
    const rifle = item('No.2 Loughcaster');
    const doc = { ...mission([sniper.id, 1]), available: { [rifle.id]: 1000 } };
    const plan = planFacilities(real, doc, emptyFacilityProfile());
    const crate = plan.supplies.find(row => row.item.name === 'No.2 Loughcaster')!;
    expect(crate.item.unit).toBe('crates'); expect(crate.amount).toBe(1);
    expect(facilityAmount(1, crate.item)).toBe('1 crate of No.2 Loughcaster');
    expect(plan.stock.find(row => row.item.id === rifle.id)).toBeUndefined();
  });

  test('50 sniper crates require 50 rifle crates, with crate outputs throughout the briefing', () => {
    const sniper = real.items.find(entry => entry.name === 'Clancy-Raca M4' && entry.unit === 'crates')!;
    expect(isFacilityObjective(sniper)).toBe(true);
    expect(isFacilityObjective(item('Clancy-Raca M4'))).toBe(false);
    const doc = mission([sniper.id, 50]);
    const plan = planFacilities(real, doc, emptyFacilityProfile());
    expect(plan.errors).toEqual([]);
    const step = plan.steps.find(step => step.item.id === sniper.id)!;
    expect(step).toMatchObject({ needed: 50, produced: 50, batches: 50, surplus: 0 });
    expect(step.inputs.map(input => [input.item.name, input.amount])).toEqual([
      ['Construction Materials', 2500], ['Processed Construction Materials', 2000], ['No.2 Loughcaster', 50],
    ]);
    expect(plan.supplies.find(row => row.item.name === 'No.2 Loughcaster')).toMatchObject({ amount: 50, item: { unit: 'crates' } });
    const briefing = exportFacilityMission(real, doc, emptyFacilityProfile(), plan);
    expect(briefing).toContain('- 50 crates of Clancy-Raca M4');
    expect(briefing).toContain('Produce 50 crates of Clancy-Raca M4');
    expect(briefing).toContain('Bring 50 crates of No.2 Loughcaster');
  });

  test('ammunition crate objectives still round to the recipe batch, while vehicles stay individual', () => {
    const ammo = real.items.find(entry => entry.name === '40mm' && entry.unit === 'crates')!;
    const plan = planFacilities(real, mission([ammo.id, 11]), emptyFacilityProfile());
    expect(plan.errors).toEqual([]);
    expect(plan.steps.find(step => step.item.id === ammo.id)).toMatchObject({ needed: 11, produced: 20, batches: 2, surplus: 9 });
    const callahan = item('Callahan');
    expect(isFacilityObjective(callahan)).toBe(true);
    expect(planFacilities(real, mission([callahan.id, 2]), emptyFacilityProfile()).steps.find(step => step.item.id === callahan.id))
      .toMatchObject({ needed: 2, produced: 2, batches: 2, item: { unit: 'units' } });
    expect(real.items.some(entry => entry.kind === 'vehicle' && entry.unit === 'crates')).toBe(false);
  });

  test('crate objective stock never consumes loose weapons and legacy goals retain their quantities', () => {
    const loose = item('Clancy-Raca M4');
    const crate = real.items.find(entry => entry.name === loose.name && entry.unit === 'crates')!;
    const doc = { ...mission([crate.id, 50]), available: { [loose.id]: 150, [crate.id]: 2 } };
    const plan = planFacilities(real, doc, emptyFacilityProfile());
    expect(plan.stock.map(row => [row.item.id, row.amount])).toEqual([[crate.id, 2]]);
    expect(plan.steps.find(step => step.item.id === crate.id)).toMatchObject({ produced: 48, batches: 48 });
    const workspace = new FacilitiesWorkspace();
    const legacy = mission([loose.id, 50]);
    workspace.importDocument(JSON.stringify({ version: 1, mission: legacy, profile: emptyFacilityProfile() }), 'mission');
    expect(workspace.mission).toEqual(legacy);
    expect(planFacilities(real, workspace.mission, workspace.profile).steps.find(step => step.item.id === loose.id))
      .toMatchObject({ needed: 50, produced: 51, batches: 17 });
    workspace.mission = doc; workspace.save();
    const restored = new FacilitiesWorkspace(); restored.load();
    expect(restored.mission).toEqual(doc);
  });

  test('all default facility objectives form calculable graphs with no unresolved ingredients', () => {
    for (const target of real.items.filter(defaultFacilityRecipe)) {
      expect({ name: target.name, errors: planFacilities(real, mission([target.id, 1]), emptyFacilityProfile()).errors }).toEqual({ name: target.name, errors: [] });
    }
  });

  test('exports readable stages and removes mentions or injected Markdown from user fields', () => {
    const doc = { ...mission([item('BMS Black Bolt').id, 1]), title: '@everyone\n**Train**' };
    const plan = planFacilities(real, doc, emptyFacilityProfile());
    const text = exportFacilityMission(real, doc, emptyFacilityProfile(), plan);
    expect(text).toContain('Task Force — everyone Train');
    expect(text).not.toContain('@everyone');
    expect(text).toContain('__Stage 1__');
    expect(text).toContain('🇦・Bring ');
    expect(text).toContain('🇦・Produce ');
    expect(text).not.toContain('- [ ]');
    expect(text).not.toMatch(/Material plan only|Power generation|Wiki data:/);
  });

  test('large sections keep A–Z checkable points by creating labelled continuation sections', () => {
    const catalog = { ...simple, items: Array.from({ length: 28 }, (_, index) => node(`Item ${index}`, [recipe(`recipe-${index}`, [])])) };
    const doc = mission(...catalog.items.map(item => [item.id, 1] as [string, number]));
    const profile = emptyFacilityProfile();
    const exported = exportFacilityMission(catalog, doc, profile, planFacilities(catalog, doc, profile));
    expect(exported).toContain('__Stage 1 (1/2)__');
    expect(exported).toContain('__Stage 1 (2/2)__');
    expect(exported.match(/^🇦・Produce /gm)).toHaveLength(2);
    expect(exported.match(/^🇿・Produce /gm)).toHaveLength(1);
    expect(exported).not.toContain('•・Produce');
  });
});

describe('facility cache and loading boundaries', () => {
  test('mission and profile round-trip independently of existing module caches', () => {
    localStorage.setItem('todolist', '{"old":true}'); localStorage.setItem('template', '{"saved":true}');
    const workspace = new FacilitiesWorkspace(); workspace.load();
    workspace.mission = mission(['A', 2]); workspace.profile.location = 'Test depot'; workspace.save();
    const restored = new FacilitiesWorkspace(); restored.load();
    expect(restored.mission).toEqual(workspace.mission); expect(restored.profile).toEqual(workspace.profile);
    expect(localStorage.getItem('todolist')).toBe('{"old":true}'); expect(localStorage.getItem('template')).toBe('{"saved":true}');
  });

  test('pipeline selections round-trip through profile import and mission JSON without changing quantities or recipe choices', () => {
    const workspace = new FacilitiesWorkspace();
    workspace.mission = mission([item('Enriched Oil').id, 72]);
    workspace.profile = { ...emptyFacilityProfile(), piped: [item('Heavy Oil').id], recipes: { [item('Heavy Oil').id]: item('Heavy Oil').recipes[0].id } };
    workspace.save();
    const restored = new FacilitiesWorkspace(); restored.load();
    expect(restored.profile).toEqual(workspace.profile);
    restored.importDocument(JSON.stringify({ version: 1, mission: workspace.mission, profile: workspace.profile }), 'mission');
    expect(restored.mission.objectives[0].quantity).toBe(72);
    restored.importDocument(JSON.stringify(workspace.profile), 'profile');
    expect(restored.profile.piped).toEqual([item('Heavy Oil').id]);
    expect(planFacilities(real, restored.mission, restored.profile).piped[0].item.name).toBe('Heavy Oil');
  });

  test('a corrupt mission does not discard the profile; invalid imports are atomic', () => {
    const workspace = new FacilitiesWorkspace(); workspace.profile.name = '11e'; workspace.save();
    localStorage.setItem(FACILITY_MISSION_KEY, '{broken'); workspace.load();
    expect(workspace.mission.objectives).toEqual([]); expect(workspace.profile.name).toBe('11e'); expect(workspace.warning).not.toBe('');
    const saved = localStorage.getItem(FACILITY_PROFILE_KEY);
    expect(() => workspace.importDocument('{"version":1,"name":15}', 'profile')).toThrow();
    expect(localStorage.getItem(FACILITY_PROFILE_KEY)).toBe(saved);
    const doc = mission(['A', 3]);
    workspace.importDocument(JSON.stringify({ version: 1, mission: doc, profile: emptyFacilityProfile() }), 'mission');
    expect(workspace.mission).toEqual(doc);
  });

  test('loads the complete generated catalogue and rejects broken references or network failures', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => real });
    expect(await loadFacilitiesCatalog()).toEqual(real);
    expect(fetch).toHaveBeenCalledWith('/facilitiesData.json');
    (fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => ({ ...simple, items: [node('X', [recipe('bad', [{ itemId: 'absent', amount: 1 }])])] }) });
    await expect(loadFacilitiesCatalog()).rejects.toThrow('references');
    (fetch as jest.Mock).mockResolvedValue({ ok: false });
    await expect(loadFacilitiesCatalog()).rejects.toThrow('could not be loaded');
  });

  test('reports storage failures while retaining the in-memory mission for export', () => {
    const workspace = new FacilitiesWorkspace();
    workspace.mission = mission(['A', 3]);
    const original = localStorage.setItem;
    (localStorage.setItem as jest.Mock).mockImplementationOnce(() => { throw new Error('Quota'); });
    workspace.save();
    expect(workspace.warning).toContain('could not be saved');
    expect(workspace.mission.objectives).toEqual([{ itemId: 'A', quantity: 3 }]);
    expect(localStorage.setItem).toBe(original);
  });
});
