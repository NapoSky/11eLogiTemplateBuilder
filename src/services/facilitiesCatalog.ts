import type { WikiCatalog } from './wikiCatalog';
import type { IconVariants } from './gameData';
import { normalizeGameName } from './gameData.ts';

export const FACILITY_SOURCES = new Set([
  'Materials Factory', 'Metalworks Factory', 'Coal Refinery', 'Oil Refinery',
  'Ammunition Factory', 'Infantry Kit Factory', 'Aircraft Maintenance Factory',
  'Small Assembly Station', 'Large Assembly Station', 'Dry Dock',
  'Large Structure Foundation', 'Concrete Mixer', 'Water Pump',
]);

export interface FacilityRecipe {
  /** Includes the recipe contents so an updated recipe cannot silently replace a saved choice. */
  id: string;
  source: string;
  category?: string;
  amount: number;
  crated: boolean;
  inputs: Array<{ itemId: string; amount: number }>;
  power?: number;
  byproducts: Array<{ itemId: string; amount: number }>;
}

export interface FacilityItem {
  id: string;
  name: string;
  kind: 'item' | 'vehicle' | 'structure';
  factions: ('warden' | 'colonial')[];
  unit: string;
  icon?: string;
  recipes: FacilityRecipe[];
}

export interface FacilitiesCatalog {
  schemaVersion: 1;
  capturedOn: string;
  items: FacilityItem[];
}

export function projectFacilitiesCatalog(catalog: WikiCatalog, variants: IconVariants = {}): FacilitiesCatalog {
  const key = (name: string) => normalizeGameName(name).toLowerCase();
  const names = new Map<string, typeof catalog.items>();
  const crates = new Map<string, { item: (typeof catalog.items)[number]; capacity: number }>();
  for (const item of catalog.items) names.set(key(item.name), [...(names.get(key(item.name)) ?? []), item]);
  const resolveItem = (name: string, kind: 'item' | 'vehicle' | 'crate' | 'part' = 'item') => {
    const matches = names.get(key(name)) ?? [];
    const typed = matches.filter(item => item.kind === (kind === 'vehicle' ? 'vehicle' : 'item'));
    const candidates = typed.length ? typed : matches;
    if (candidates.length !== 1) throw new Error(`Unresolved facility ingredient: ${name}`);
    return candidates[0];
  };
  const items: FacilityItem[] = catalog.items.map(item => {
    const bindings = catalog.assets.filter(asset => asset.itemSourceKey === item.sourceKey);
    const preferred = variants[normalizeGameName(item.name)]?.facilities;
    const icon = bindings.find(asset => asset.iconFilename === preferred)?.iconFilename ?? bindings[0]?.iconFilename;
    const recipes = item.production.filter(recipe => FACILITY_SOURCES.has(recipe.source) || recipe.source === 'Refinery').map(recipe => {
      if (recipe.output.high !== undefined || recipe.status) return null;
      const capacity = recipe.output.crateCapacity ?? item.declaredCrateCapacity;
      if (recipe.output.crated && !capacity) throw new Error(`Unknown facility output crate: ${item.name}`);
      // Expose the recipe's physical output as an objective, just like a crate input.
      // Keep the loose identity for ingredients, allocated stock and saved missions.
      if (recipe.output.crated && item.kind === 'item') {
        crates.set(`${item.sourceKey}:crate:${capacity}`, { item, capacity: capacity! });
      }
      const inputs = recipe.inputs.map(input => {
        const ingredient = resolveItem(input.name, input.kind);
        const crateCapacity = input.crateCapacity ?? ingredient.declaredCrateCapacity;
        if (input.kind === 'crate' && !crateCapacity) throw new Error(`Unknown facility input crate: ${input.name}`);
        if (input.unit && input.unit !== (ingredient.unit ?? 'units')) throw new Error(`Incompatible facility input unit: ${input.name}`);
        if (input.kind === 'crate') {
          const crateId = `${ingredient.sourceKey}:crate:${crateCapacity}`;
          crates.set(crateId, { item: ingredient, capacity: crateCapacity! });
          return { itemId: crateId, amount: input.amount };
        }
        return { itemId: ingredient.sourceKey, amount: input.amount };
      });
      const byproducts = (recipe.byproducts ?? []).map(output => {
        const byproduct = resolveItem(output.name);
        if (output.unit && output.unit !== (byproduct.unit ?? 'units')) throw new Error(`Incompatible byproduct unit: ${output.name}`);
        return { itemId: byproduct.sourceKey, amount: output.amount };
      });
      return {
        id: JSON.stringify([recipe.source, recipe.category ?? '', recipe.rank, recipe.inputs, recipe.output, recipe.power ?? null, recipe.byproducts ?? []]),
        source: recipe.source, ...(recipe.category ? { category: recipe.category } : {}),
        amount: recipe.output.amount * (recipe.output.crated ? capacity! : 1), crated: recipe.output.crated, inputs, byproducts,
        ...(recipe.power ? { power: recipe.power } : {}),
      } satisfies FacilityRecipe;
    }).filter((recipe): recipe is NonNullable<typeof recipe> => recipe !== null);
    return {
      id: item.sourceKey, name: normalizeGameName(item.name), kind: item.kind,
      factions: item.factions ?? [], unit: item.unit ?? 'units', recipes,
      ...(icon ? { icon } : {}),
    };
  });
  // A recipe requiring a physical crate cannot consume the same number of loose items.
  for (const [id, { item, capacity }] of crates) {
    const base = items.find(entry => entry.id === item.sourceKey)!;
    items.push({ ...base, id, unit: 'crates', recipes: base.recipes.filter(recipe => recipe.crated && recipe.amount % capacity === 0)
      .map(recipe => ({ ...recipe, id: `${recipe.id}:crate:${capacity}`, amount: recipe.amount / capacity })) });
  }
  return { schemaVersion: 1, capturedOn: catalog.capturedOn, items };
}

export function defaultFacilityRecipe(item: FacilityItem): FacilityRecipe | undefined {
  // Gathering/extraction is outside the default material-production chain.
  if (['Salvage', 'Components', 'Coal', 'Sulfur', 'Oil', 'Water'].includes(item.name)) return undefined;
  return item.recipes.find(recipe => FACILITY_SOURCES.has(recipe.source));
}

/** Objective quantities follow recipe packaging; vehicles and structures stay individual. */
export function isFacilityObjective(item: FacilityItem): boolean {
  return item.recipes.some(recipe => FACILITY_SOURCES.has(recipe.source) &&
    (item.kind !== 'item' || item.unit === 'crates' || !recipe.crated));
}
