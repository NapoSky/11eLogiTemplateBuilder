import type { Icon, MpfDataEntry, TodoCategory, TodoListItem, TodoProductionEntry } from '../types';
import type { ItemDataEntry } from './gameData';
import { canonicalIconFilename } from './iconPaths';
import { displayedCost, orderCrateCount } from './mpfCalculator';

export type Material = 'bmat' | 'rmat' | 'emat' | 'hemat';
export type MaterialTotals = Record<Material, number>;
export type LoadingTransport = 'container' | 'truck';

/** Standard logistics trucks: 15 slots, 100 loose materials per stack.
 * Shipping containers: 60 crated inputs. These are input loads, not output cargo.
 * https://foxhole.wiki.gg/wiki/Dunne_Transport
 * https://foxhole.wiki.gg/wiki/Shipping_Container
 */
export const LOADING_CAPACITIES = { container: 60, truck: 15 } as const;
export const MATERIALS: Record<Material, { label: string; name: string; crateCapacity: number; stackCapacity: number; iconFilename: string }> = {
  bmat: { label: 'Bmats', name: 'Basic Materials', crateCapacity: 100, stackCapacity: 100, iconFilename: 'Textures/UI/ItemIcons/BasicMaterialsIcon.png' },
  rmat: { label: 'Rmats', name: 'Refined Materials', crateCapacity: 20, stackCapacity: 100, iconFilename: 'Textures/UI/ItemIcons/RefinedMaterialsIcon.png' },
  emat: { label: 'Emats', name: 'Explosive Powder', crateCapacity: 40, stackCapacity: 100, iconFilename: 'Textures/UI/ItemIcons/ExplosiveMaterialIcon.png' },
  hemat: { label: 'HEmats', name: 'Heavy Explosive Powder', crateCapacity: 30, stackCapacity: 100, iconFilename: 'Textures/UI/ItemIcons/Facilities/HeavyExplosiveMaterialsIcon.png' },
};
export const MATERIAL_KEYS = Object.keys(MATERIALS) as Material[];

export function factoryTodoEntries(items: ItemDataEntry[], icons: Icon[], mpf: MpfDataEntry[]): TodoProductionEntry[] {
  const categories: Record<string, TodoCategory> = {
    'Small Arms': 'small_arms', 'Heavy Arms': 'heavy_arms', 'Heavy Ammunition': 'heavy_ammunition',
    'Uniforms': 'uniforms', 'Utility': 'utility', 'Medical': 'medical', 'Resources': 'supplies',
  };
  return items.filter(item => item.factory && item.iconUsage !== 'facilities').map(item => {
    const filename = canonicalIconFilename(item.iconFilename);
    const mpfEntry = mpf.find(entry => canonicalIconFilename(entry.iconFilename) === filename);
    const icon = icons.find(entry => canonicalIconFilename(entry.filename) === filename);
    return {
      iconFilename: filename, itemName: item.itemName,
      category: categories[icon?.category ?? ''] ?? mpfEntry?.itemCategory ?? 'supplies',
      faction: item.faction ?? ['neutral'], cost: { ...item.factory!.cost }, maxCrates: 4,
      numberProduced: item.unitsPerCrate ?? 1, productionSource: 'factory',
      subtypeFilename: mpfEntry?.subtypeFilename, aliases: item.aliases,
    };
  });
}

export function productionTotals(items: TodoListItem[]): MaterialTotals {
  const totals = { bmat: 0, rmat: 0, emat: 0, hemat: 0 };
  for (const item of items) {
    const cost = displayedCost(item);
    for (const material of MATERIAL_KEYS) totals[material] += cost[material] * item.orderCount;
  }
  return totals;
}

export function materialLoads(totals: MaterialTotals, transport: LoadingTransport, catalogue: ItemDataEntry[] = []): MaterialTotals {
  const loads = { bmat: 0, rmat: 0, emat: 0, hemat: 0 };
  for (const material of MATERIAL_KEYS) {
    const rule = MATERIALS[material];
    const capacity = transport === 'truck' ? rule.stackCapacity
      : catalogue.find(item => item.itemName === rule.name)?.unitsPerCrate ?? rule.crateCapacity;
    // Aggregate each material before rounding: half crates from separate lines share a slot.
    loads[material] = Math.ceil(totals[material] / capacity);
  }
  return loads;
}

export function loadingSummary(items: TodoListItem[], transport: LoadingTransport, catalogue: ItemDataEntry[] = []) {
  const totals = productionTotals(items);
  const loads = materialLoads(totals, transport, catalogue);
  const used = MATERIAL_KEYS.reduce((sum, material) => sum + loads[material], 0);
  const capacity = LOADING_CAPACITIES[transport];
  return { totals, loads, used, capacity, fits: used <= capacity };
}

/** Materials to deposit first so the remaining load fits in one truck.
 * Empty the smallest partial stacks first, then remove full stacks as needed.
 */
export function truckPredeposit(totals: MaterialTotals): MaterialTotals {
  const deposit = { bmat: 0, rmat: 0, emat: 0, hemat: 0 };
  const loads = materialLoads(totals, 'truck');
  let slotsToFree = MATERIAL_KEYS.reduce((sum, material) => sum + loads[material], 0) - LOADING_CAPACITIES.truck;
  const partialStacks = MATERIAL_KEYS.filter(material => loads[material] > 0).map(material => ({
    material, amount: totals[material] % MATERIALS[material].stackCapacity || MATERIALS[material].stackCapacity,
  })).sort((a, b) => a.amount - b.amount);
  for (const { material, amount } of partialStacks) {
    if (slotsToFree <= 0) break;
    deposit[material] += amount;
    slotsToFree--;
  }
  for (const material of MATERIAL_KEYS) {
    if (slotsToFree <= 0) break;
    const stackSize = MATERIALS[material].stackCapacity;
    const stacks = Math.min(slotsToFree, Math.floor((totals[material] - deposit[material]) / stackSize));
    deposit[material] += stacks * stackSize;
    slotsToFree -= stacks;
  }
  return deposit;
}

export function producedCrates(items: TodoListItem[]): number {
  return items.reduce((sum, item) => sum + orderCrateCount(item) * item.orderCount, 0);
}
