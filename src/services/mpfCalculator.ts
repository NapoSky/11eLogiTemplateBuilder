import { TodoListItem, MPF_CATEGORY_LABELS } from '../types';

/**
 * MPF cost calculator.
 *
 * Pricing model (calibrated against the Foxhole wiki + the example
 * Discord message in current_examples/TODOLIST_1.txt):
 *
 *   - Per crate within a single full order, applied to the *per-crate*
 *     base cost from foxhole.json:
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
function discountForCrateIndex(i: number): number {
  // i is 0-indexed: crate 1 = i=0 (10% off), crate 5+ capped at 50%.
  return Math.min(0.5, 0.1 * (i + 1));
}

/** Cost for one full MPF order (all crates). */
export function fullOrderCost(
  baseCost: { bmat?: number; rmat?: number; emat?: number; hemat?: number },
  maxCrates: 9 | 5,
): { bmat: number; rmat: number; emat: number; hemat: number } {
  const totals = { bmat: 0, rmat: 0, emat: 0, hemat: 0 };
  for (let i = 0; i < maxCrates; i++) {
    const factor = 1 - discountForCrateIndex(i);
    totals.bmat += Math.floor((baseCost.bmat ?? 0) * factor);
    totals.rmat += Math.floor((baseCost.rmat ?? 0) * factor);
    totals.emat += Math.floor((baseCost.emat ?? 0) * factor);
    totals.hemat += Math.floor((baseCost.hemat ?? 0) * factor);
  }
  return totals;
}

/**
 * Displayed cost for a TodoList row.
 *
 * Per the user spec, this is *always* the cost of a single full MPF order;
 * `orderCount` is purely a presentational suffix and is intentionally NOT
 * multiplied here.
 */
export function displayedCost(item: TodoListItem): { bmat: number; rmat: number; emat: number; hemat: number } {
  return fullOrderCost(item.cost, item.maxCrates);
}

/** Total crates produced for one full order (used for stats). */
export function cratesPerOrder(item: TodoListItem): number {
  const bonus = item.crateBonus ?? 1;
  return item.maxCrates * bonus;
}

export function categoryLabel(cat: string): string {
  return MPF_CATEGORY_LABELS[cat as keyof typeof MPF_CATEGORY_LABELS] ?? cat;
}
