import type { FacilityItem } from './facilitiesCatalog';
import type { FacilityPlan } from './facilitiesPlanner';

interface FacilityTechnology {
  tier?: 1 | 2 | 3;
  research?: string;
  worldStructure?: boolean;
}

interface BuildingRequirements {
  base: FacilityTechnology;
  upgrades?: Record<string, FacilityTechnology>;
}

// Construction and Upgrades sections of the linked wiki pages, checked 2026-11-17.
// These are technology requirements, NOT the structure's damage-resistance tier.
// Cargo's ProductionCategory supplies the upgrade name but not its unlock condition.
const buildings: Record<string, BuildingRequirements> = {
  'Materials Factory': { base: { tier: 1 }, upgrades: {
    'Assembly Bay': { tier: 1 }, Forge: { tier: 1 }, 'Metal Press': { tier: 1 }, Smelter: { tier: 1 },
  } },
  'Metalworks Factory': { base: { tier: 2 }, upgrades: {
    Recycler: { tier: 2 }, 'Blast Furnace': { tier: 2 }, 'Engineering Station': { tier: 3 },
  } },
  'Oil Refinery': { base: { tier: 1 }, upgrades: {
    Reformer: { tier: 1 }, 'Cracking Unit': { tier: 2 }, 'Petrochemical Plant': { tier: 3 },
  } },
  'Coal Refinery': { base: { tier: 1 }, upgrades: {
    'Coke Furnace': { tier: 1 }, 'Coal Liquefier': { tier: 2 }, 'Advanced Coal Liquefier': { tier: 3 },
  } },
  'Small Assembly Station': { base: { tier: 1 }, upgrades: {
    'Motor Pool': { tier: 1 }, 'Battery Line': { tier: 2 }, 'Field Station': { tier: 2 },
    'Tank Factory': { tier: 2 }, 'Weapons Platform': { tier: 3 },
    'Naval Works': { research: 'Dry Dock' }, 'Advanced Structure Manufactory': { tier: 2 },
  } },
  'Large Assembly Station': { base: { tier: 2 }, upgrades: {
    'Aircraft Assembly': { tier: 2 }, 'Train Assembly': { tier: 3 }, 'Heavy Tank Assembly': { tier: 3 },
  } },
  'Ammunition Factory': { base: { tier: 2 }, upgrades: {
    'Tripod Factory': { tier: 2 }, 'Rocket Battery Workshop': { tier: 2 }, 'Large Shell Factory': { tier: 2 },
  } },
  'Infantry Kit Factory': { base: { tier: 1 }, upgrades: {
    'Special-Issue Firearms Assembly': { tier: 2 }, 'Small Arms Workshop': { tier: 2 }, 'Heavy Munitions Foundry': { tier: 2 },
  } },
  'Aircraft Maintenance Factory': { base: { tier: 2 }, upgrades: {
    'Strategic Maintenance Hangar': { tier: 2 },
  } },
  'Dry Dock': { base: { research: 'Dry Dock' } },
  'Large Structure Foundation': { base: { research: 'Support Bunkers (Tier 3)' } },
  'Concrete Mixer': { base: { research: 'Concrete Mixer' } },
  'Water Pump': { base: { tier: 1 } },
  Refinery: { base: { worldStructure: true } },
};

export interface FacilityRequirement {
  source: string;
  upgrade?: string;
  technology?: FacilityTechnology;
  wikiUrl: string;
  products: FacilityItem[];
}

export interface RequiredFacilityBuilding {
  source: string;
  wikiUrl: string;
  upgrade?: string;
  sharedBase?: boolean;
  tier?: 1 | 2 | 3;
  research: string[];
  worldStructure: boolean;
  unverified: boolean;
  setups: FacilityRequirement[];
}

/** One configuration per upgrade: a facility cannot have two upgrades installed together. */
export function requiredFacilityBuildings(plan: FacilityPlan): RequiredFacilityBuilding[] {
  const bySource = new Map<string, RequiredFacilityBuilding>();
  for (const setup of requiredFacilities(plan)) {
    let building = bySource.get(setup.source);
    if (!building) {
      const base = Object.hasOwn(buildings, setup.source) ? buildings[setup.source].base : undefined;
      building = { source: setup.source, wikiUrl: setup.wikiUrl, tier: base?.tier,
        research: base?.research ? [base.research] : [], worldStructure: base?.worldStructure ?? false,
        unverified: !base, setups: [] };
      bySource.set(setup.source, building);
    }
    building.setups.push(setup);
  }
  const configurations = [...bySource.values()].flatMap(building => {
    const upgraded = building.setups.filter(setup => setup.upgrade);
    const base = building.setups.filter(setup => !setup.upgrade);
    if (!upgraded.length) return [building];
    // Reviewed upgrades add production options; recipes without a required upgrade
    // remain usable. Show those once, without inventing an extra unmodified building.
    // Do not assume that a future, unreviewed upgrade retains base recipes.
    const baseHost = upgraded.findIndex(setup => !!setup.technology);
    const rows: RequiredFacilityBuilding[] = upgraded.map((setup, index) => ({
      ...building, upgrade: setup.upgrade,
      sharedBase: index === baseHost && base.length > 0 && upgraded.filter(setup => !!setup.technology).length > 1,
      setups: index === baseHost ? [setup, ...base] : [setup],
    }));
    if (base.length && baseHost === -1) rows.unshift({ ...building, setups: base });
    return rows;
  });
  return configurations.sort((a, b) => (a.tier ?? 4) - (b.tier ?? 4) || a.source.localeCompare(b.source, 'en') ||
    (a.upgrade ?? '').localeCompare(b.upgrade ?? '', 'en'));
}

/** Only actual production steps count: supplied, piped and fully allocated items need no local setup. */
export function requiredFacilities(plan: FacilityPlan): FacilityRequirement[] {
  if (plan.errors.length) return [];
  const setups = new Map<string, FacilityRequirement>();
  for (const step of plan.steps) {
    const { source, category } = step.recipe;
    const key = JSON.stringify([source, category ?? '']);
    let setup = setups.get(key);
    if (!setup) {
      const building = Object.hasOwn(buildings, source) ? buildings[source] : undefined;
      // An unknown upgrade must not inherit its base building's tier silently.
      const technology = category
        ? building?.upgrades && Object.hasOwn(building.upgrades, category) ? building.upgrades[category] : undefined
        : building?.base;
      setup = { source, ...(category ? { upgrade: category } : {}), technology,
        wikiUrl: `https://foxhole.wiki.gg/wiki/${encodeURIComponent(source.replaceAll(' ', '_'))}`,
        products: [] };
      setups.set(key, setup);
    }
    if (!setup.products.some(item => item.id === step.item.id)) setup.products.push(step.item);
  }
  return [...setups.values()].sort((a, b) => a.source.localeCompare(b.source, 'en') || (a.upgrade ?? '').localeCompare(b.upgrade ?? '', 'en'))
    .map(setup => ({ ...setup, products: setup.products.sort((a, b) => a.name.localeCompare(b.name, 'en')) }));
}
