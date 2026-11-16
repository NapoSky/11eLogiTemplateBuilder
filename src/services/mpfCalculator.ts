import { TodoListItem, MPF_CATEGORY_LABELS, TODO_CATEGORY_LABELS, ProductionSource } from '../types';

/**
 * MPF cost calculator.
 *
 * Pricing model (calibrated against the Foxhole wiki + the example
 * Discord message in current_examples/TODOLIST_1.txt):
 *
 *   - Per crate within a single full order, applied to the *per-crate*
 *     base cost from the normalized MPF dataset:
 *       crate 1 → 10% off, crate 2 → 20% off, ..., crate 5+ → 50% off (cap).
 *   - Each crate cost is FLOORED to an integer.
 *   - Full-order cost = sum of all crates (9 for items, 5 for vehicles/shipables).
 *
 * Verified against:
 *   - "Dusk" ce.III: 15 Rmats/crate × 9 → 79 Rmats.
 *   - Bonesaw MK.3:  100 Bmats/crate × 9 → 550, 25 Rmats/crate × 9 → 134.
 *   - Carnyx ATGL:   125 Bmats/crate × 9 → 684, 15 Rmats/crate × 9 → 79.
 *   - Noble Widow:   480 Rmats/crate × 5 → 1680.
 *
 * The user's `orderCount` is presentational only (rendered as the `(xN)` suffix);
 * it does NOT multiply the displayed cost.
 */
/** Returns the discount as an integer number of tenths (1 = 10%, 5 = 50%). */
function discountTenthsForCrateIndex(i: number): number {
  // i is 0-indexed: crate 1 = i=0 (10% off), crate 5+ capped at 50%.
  return Math.min(5, i + 1);
}

/** Cost for one full MPF order (all crates). */
export function fullOrderCost(
  baseCost: { bmat?: number; rmat?: number; emat?: number; hemat?: number },
  maxCrates: 9 | 5,
): { bmat: number; rmat: number; emat: number; hemat: number } {
  return mpfOrderCost(baseCost, maxCrates);
}

/** Cost of one MPF order. Each order starts again at the first discount tier. */
function mpfOrderCost(baseCost: TodoListItem['cost'], crates: number) {
  const totals = { bmat: 0, rmat: 0, emat: 0, hemat: 0 };
  for (let i = 0; i < crates; i++) {
    // Use integer arithmetic (×numerator then ÷10) to avoid floating-point
    // precision errors (e.g. 0.1 * 3 = 0.30000000000000004 in JS).
    const numerator = 10 - discountTenthsForCrateIndex(i);
    totals.bmat += Math.floor((baseCost.bmat ?? 0) * numerator / 10);
    totals.rmat += Math.floor((baseCost.rmat ?? 0) * numerator / 10);
    totals.emat += Math.floor((baseCost.emat ?? 0) * numerator / 10);
    totals.hemat += Math.floor((baseCost.hemat ?? 0) * numerator / 10);
  }
  return totals;
}

/**
 * Displayed cost for a TodoList row.
 *
 * One order, independently of orderCount. Historical documents without a crate
 * quantity or production source keep their recorded full MPF order calculation.
 */
export function displayedCost(item: TodoListItem): { bmat: number; rmat: number; emat: number; hemat: number } {
  const crates = orderCrateCount(item);
  if (productionSource(item) === 'mpf') return mpfOrderCost(item.cost, crates);
  return {
    bmat: (item.cost.bmat ?? 0) * crates, rmat: (item.cost.rmat ?? 0) * crates,
    emat: (item.cost.emat ?? 0) * crates, hemat: (item.cost.hemat ?? 0) * crates,
  };
}

export function productionSource(item: TodoListItem): ProductionSource {
  return item.productionSource ?? (item.maxCrates === 4 ? 'factory' : 'mpf');
}

export function orderCrateCount(item: TodoListItem): number {
  const minimum = productionSource(item) === 'factory' ? 1 : 3;
  return Math.max(minimum, Math.min(item.maxCrates,
    Number.isFinite(item.cratesPerOrder) ? Math.floor(item.cratesPerOrder!) : item.maxCrates));
}

/** Total crates produced for one full order (used for stats). */
export function cratesPerOrder(item: TodoListItem): number {
  const bonus = item.crateBonus ?? 1;
  return item.maxCrates * bonus;
}

export function categoryLabel(cat: string): string {
  return MPF_CATEGORY_LABELS[cat as keyof typeof MPF_CATEGORY_LABELS]
    ?? TODO_CATEGORY_LABELS[cat as keyof typeof TODO_CATEGORY_LABELS] ?? cat;
}
