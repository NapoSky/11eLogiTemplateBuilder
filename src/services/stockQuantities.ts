import type { ItemDataEntry, QuantityMode } from './gameData';

export interface StockQuantities {
  crates: number;
  units: number;
  unitsPerCrate: number | null;
  totalUnits: number | null;
  equivalentCrates: number | null;
}

/** Keep physical packaging intact; equivalence is a separate calculation. */
export function readStockQuantities(
  items: ReadonlyMap<string, number>,
  itemName: string,
  metadata?: ItemDataEntry,
  mode: QuantityMode = 'legacy',
): StockQuantities {
  const names = mode === 'legacy' ? [itemName] : [...new Set([itemName, ...(metadata?.aliases ?? [])])];
  const physicalCrates = names.reduce((sum, name) => sum + (items.get(`${name} (Crate)`) ?? 0), 0);
  const bare = names.reduce((sum, name) => sum + (items.get(name) ?? 0), 0);
  if (![physicalCrates, bare].every(value => Number.isSafeInteger(value) && value >= 0)) {
    throw new Error(`Invalid stock quantity for ${itemName}`);
  }
  if (mode === 'legacy') {
    return { crates: physicalCrates, units: bare, unitsPerCrate: null, totalUnits: null, equivalentCrates: physicalCrates + bare };
  }
  const bareIsCrates = metadata?.kind !== null && metadata?.kind !== undefined && metadata.uncratedStockUnit === 'crates';
  const crates = physicalCrates + (bareIsCrates ? bare : 0);
  const units = bareIsCrates ? 0 : bare;
  const capacity = metadata?.unitsPerCrate ?? null;
  if (capacity !== null && (!Number.isSafeInteger(capacity) || capacity <= 0)) throw new Error('Invalid crate capacity');
  if (capacity === null) {
    return { crates, units, unitsPerCrate: null, totalUnits: null, equivalentCrates: units === 0 ? crates : null };
  }
  const totalUnits = crates * capacity + units;
  if (!Number.isSafeInteger(totalUnits)) throw new Error('Stock total exceeds safe integer range');
  return { crates, units, unitsPerCrate: capacity, totalUnits, equivalentCrates: totalUnits / capacity };
}

export function calculateCrateShortage(
  targetCrates: number,
  stock: StockQuantities,
  backline: StockQuantities | null,
  maxCratesPerOrder: number,
): { cratesNeeded: number; backlineAvailable: number; toProduce: number; orderCount: number; missingUnits: number | null } | null {
  if (stock.equivalentCrates === null || backline?.equivalentCrates === null) return null;
  if (!Number.isSafeInteger(targetCrates) || targetCrates < 0 || !Number.isSafeInteger(maxCratesPerOrder) || maxCratesPerOrder <= 0) {
    throw new Error('Invalid production target');
  }
  if (stock.totalUnits !== null && stock.unitsPerCrate !== null) {
    const capacity = stock.unitsPerCrate;
    if (backline && (backline.unitsPerCrate !== capacity || backline.totalUnits === null)) return null;
    const targetUnits = targetCrates * capacity;
    if (!Number.isSafeInteger(targetUnits)) throw new Error('Target exceeds safe integer range');
    const gapUnits = Math.max(0, targetUnits - stock.totalUnits);
    const deduction = Math.min(gapUnits, backline?.totalUnits ?? 0);
    const missingUnits = gapUnits - deduction;
    return {
      cratesNeeded: gapUnits / capacity, backlineAvailable: deduction / capacity,
      // Round only after all depots' units have been deducted.
      toProduce: Math.ceil(missingUnits / capacity),
      orderCount: Math.ceil(missingUnits / (capacity * maxCratesPerOrder)), missingUnits,
    };
  }
  const gap = Math.max(0, targetCrates - stock.equivalentCrates);
  const deduction = Math.min(gap, backline?.equivalentCrates ?? 0);
  const toProduce = Math.max(0, gap - deduction);
  return { cratesNeeded: gap, backlineAvailable: deduction, toProduce, orderCount: Math.ceil(toProduce / maxCratesPerOrder), missingUnits: null };
}

export function formatCrateQuantity(value: number): string {
  return `${Math.round(value * 100) / 100}`;
}

/** Show a whole-crate gap, rounding its magnitude up and retaining its sign. */
export function formatGapQuantity(value: number): string {
  return `${Math.sign(value) * Math.ceil(Math.abs(value))}`;
}
