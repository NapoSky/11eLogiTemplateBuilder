import { readFileSync } from 'node:fs';
import type { FacilitiesCatalog } from '../services/facilitiesCatalog';
import { requiredFacilities, requiredFacilityBuildings } from '../services/facilityRequirements';
import { emptyFacilityMission, emptyFacilityProfile, planFacilities } from '../services/facilitiesPlanner';

const catalog = JSON.parse(readFileSync('public/facilitiesData.json', 'utf8')) as FacilitiesCatalog;
const item = (name: string) => catalog.items.find(item => item.name === name && item.unit !== 'crates')!;
const mission = (name: string) => ({ ...emptyFacilityMission(), objectives: [{ itemId: item(name).id, quantity: 1 }] });

test('Callahan groups its three naval parts into one Naval Works setup and retains specific research requirements', () => {
  const plan = planFacilities(catalog, mission('Callahan'), emptyFacilityProfile());
  expect(plan.errors).toEqual([]);
  const before = JSON.stringify(plan);
  const requirements = requiredFacilities(plan);
  const naval = requirements.filter(setup => setup.upgrade === 'Naval Works');
  expect(naval).toHaveLength(1);
  expect(naval[0].products.map(item => item.name)).toEqual(['Naval Hull Segments', 'Naval Shell Plating', 'Naval Turbine Components']);
  expect(naval[0].technology).toEqual({ research: 'Dry Dock' });
  expect(requirements.find(setup => setup.source === 'Dry Dock')!.technology).toEqual({ research: 'Dry Dock' });
  expect(requirements.find(setup => setup.upgrade === 'Engineering Station')!.technology).toEqual({ tier: 3 });
  expect(JSON.stringify(plan)).toBe(before);
});

test('Large Assembly base and Heavy Tank Assembly have different technology requirements', () => {
  const trainPlan = planFacilities(catalog, mission('BMS Black Bolt'), emptyFacilityProfile());
  const tankPlan = planFacilities(catalog, mission('Flood Mk. I'), emptyFacilityProfile());
  expect(trainPlan.errors).toEqual([]); expect(tankPlan.errors).toEqual([]);
  expect(requiredFacilities(trainPlan).find(setup => setup.source === 'Large Assembly Station')!.technology).toEqual({ tier: 2 });
  expect(requiredFacilities(tankPlan).find(setup => setup.upgrade === 'Heavy Tank Assembly')!.technology).toEqual({ tier: 3 });
});

test('building headers sort by base tier then name and keep upgrade unlocks on their setups', () => {
  const goal = mission('Callahan');
  const profile = emptyFacilityProfile();
  const plan = planFacilities(catalog, goal, profile);
  const buildings = requiredFacilityBuildings(plan);
  expect(buildings.map(building => [building.source, building.tier])).toEqual([
    ['Coal Refinery', 1], ['Materials Factory', 1], ['Oil Refinery', 1], ['Small Assembly Station', 1],
    ['Ammunition Factory', 2], ['Metalworks Factory', 2], ['Dry Dock', undefined],
  ]);
  const metalworks = buildings.find(building => building.source === 'Metalworks Factory')!;
  expect(metalworks.setups.map(setup => setup.upgrade)).toEqual([undefined, 'Blast Furnace', 'Engineering Station']);
  expect(metalworks.setups.find(setup => setup.upgrade === 'Engineering Station')!.technology).toEqual({ tier: 3 });
  const assembly = buildings.find(building => building.source === 'Small Assembly Station')!;
  expect(assembly.research).toEqual([]);
  expect(assembly.setups[0].technology).toEqual({ research: 'Dry Dock' });
  for (const step of plan.steps.filter(step => step.recipe.category === 'Engineering Station')) goal.available[step.item.id] = step.needed;
  const updated = requiredFacilityBuildings(planFacilities(catalog, goal, profile));
  expect(updated.find(building => building.source === 'Metalworks Factory')!.tier).toBe(2);
  expect(updated.filter(building => building.tier === 2).map(building => building.source)).toEqual(['Ammunition Factory', 'Metalworks Factory']);
  expect(updated.find(building => building.source === 'Small Assembly Station')!.tier).toBe(1);
});

test('allocated naval parts remove their entire local production chain, while partial stock retains it', () => {
  const goal = mission('Callahan');
  const parts = item('Callahan').recipes[0].inputs;
  goal.available = Object.fromEntries(parts.map(input => [input.itemId, input.amount]));
  let plan = planFacilities(catalog, goal, emptyFacilityProfile());
  expect(plan.errors).toEqual([]);
  expect(requiredFacilities(plan).map(setup => setup.source)).toEqual(['Dry Dock']);
  goal.available[parts[0].itemId]--;
  plan = planFacilities(catalog, goal, emptyFacilityProfile());
  expect(requiredFacilities(plan).some(setup => setup.upgrade === 'Naval Works')).toBe(true);
});

test('external and piped liquids remove upstream setups, while changed recipes replace their upgrades', () => {
  const goal = mission('Enriched Oil');
  const profile = emptyFacilityProfile();
  let plan = planFacilities(catalog, goal, profile);
  expect(requiredFacilities(plan).some(setup => setup.upgrade === 'Cracking Unit')).toBe(true);
  profile.piped = [item('Heavy Oil').id];
  plan = planFacilities(catalog, goal, profile);
  expect(requiredFacilities(plan).map(setup => setup.upgrade)).toEqual(['Petrochemical Plant']);
  delete profile.piped;
  profile.recipes[item('Heavy Oil').id] = 'supply';
  expect(requiredFacilities(planFacilities(catalog, goal, profile)).map(setup => setup.upgrade)).toEqual(['Petrochemical Plant']);
  const cmatProfile = emptyFacilityProfile();
  cmatProfile.recipes[item('Construction Materials').id] = item('Construction Materials').recipes.find(recipe => recipe.category === 'Metal Press')!.id;
  const changed = requiredFacilities(planFacilities(catalog, mission('Construction Materials'), cmatProfile));
  expect(changed.some(setup => setup.upgrade === 'Metal Press')).toBe(true);
  expect(changed.some(setup => setup.source === 'Materials Factory' && !setup.upgrade)).toBe(false);
});

test('no production or invalid plans have no requirements', () => {
  expect(requiredFacilities(planFacilities(catalog, emptyFacilityMission(), emptyFacilityProfile()))).toEqual([]);
  const goal = mission('Callahan'); goal.available[item('Callahan').id] = 1;
  expect(requiredFacilities(planFacilities(catalog, goal, emptyFacilityProfile()))).toEqual([]);
  const profile = emptyFacilityProfile(); profile.recipes[item('Callahan').id] = 'removed-recipe';
  expect(requiredFacilities(planFacilities(catalog, mission('Callahan'), profile))).toEqual([]);
});

test('new or renamed buildings and upgrades remain explicitly unverified instead of inheriting a base tier', () => {
  for (const source of ['Materials Factory', 'Future Facility']) {
    const custom: FacilitiesCatalog = { schemaVersion: 1, capturedOn: '2026-11-17', items: [{
      id: 'test', name: 'Test output', kind: 'item', unit: 'units', factions: [], recipes: [{
        id: 'recipe', source, category: 'Future upgrade', amount: 1, crated: false, inputs: [], byproducts: [],
      }],
    }] };
    const profile = emptyFacilityProfile(); profile.recipes.test = 'recipe';
    const plan = planFacilities(custom, { ...emptyFacilityMission(), objectives: [{ itemId: 'test', quantity: 1 }] }, profile);
    expect(plan.errors).toEqual([]);
    expect(requiredFacilities(plan)[0].technology).toBeUndefined();
  }
});

test('all currently imported building and upgrade combinations have reviewed technology metadata', () => {
  for (const product of catalog.items) for (const recipe of product.recipes) {
    const profile = emptyFacilityProfile(); profile.recipes[product.id] = recipe.id;
    // Supply ingredients to isolate this recipe and its required production setup.
    for (const input of recipe.inputs) profile.recipes[input.itemId] = 'supply';
    const plan = planFacilities(catalog, { ...emptyFacilityMission(), objectives: [{ itemId: product.id, quantity: 1 }] }, profile);
    expect(plan.errors).toEqual([]);
    const requirement = requiredFacilities(plan).find(setup => setup.source === recipe.source && setup.upgrade === recipe.category);
    expect({ source: recipe.source, upgrade: recipe.category, verified: !!requirement?.technology }).toEqual({ source: recipe.source, upgrade: recipe.category, verified: true });
  }
});
