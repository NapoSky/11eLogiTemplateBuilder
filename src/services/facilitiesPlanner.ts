import type { FacilitiesCatalog, FacilityItem, FacilityRecipe } from './facilitiesCatalog';
import { defaultFacilityRecipe } from './facilitiesCatalog';
import { regionalIndicator } from './discordPreview';

export interface FacilityProfile {
  version: 1;
  name: string;
  location: string;
  recipes: Record<string, string>; // Recipe id or "supply". Absent = displayed default.
  piped?: string[]; // Liquids continuously supplied by an existing pipeline; preserves recipe choices.
}
export interface FacilityMission {
  version: 1;
  title: string;
  faction: 'all' | 'warden' | 'colonial';
  objectives: Array<{ itemId: string; quantity: number }>;
  available: Record<string, number>; // Units/litres explicitly allocated to this mission.
}
export interface FacilityStep {
  item: FacilityItem;
  recipe: FacilityRecipe;
  needed: number;
  batches: number;
  produced: number;
  surplus: number;
  level: number;
  inputs: Array<{ item: FacilityItem; amount: number }>;
  byproducts: Array<{ item: FacilityItem; amount: number }>;
}
export interface FacilityPlan {
  steps: FacilityStep[];
  supplies: Array<{ item: FacilityItem; amount: number }>;
  stock: Array<{ item: FacilityItem; amount: number }>;
  piped: Array<{ item: FacilityItem; amount: number }>;
  relevant: FacilityItem[];
  errors: string[];
}

export type FacilitySupplyGroup = 'raw' | 'liquids' | 'other';
const SUPPLY_GROUPS: Array<{ id: FacilitySupplyGroup; label: string }> = [
  { id: 'raw', label: 'Raw resources to gather' },
  { id: 'liquids', label: 'Liquids to supply' },
  { id: 'other', label: 'Other supplies' },
];

/** Display grouping only: quantities and production choices remain unchanged. */
export function groupFacilitySupplies(supplies: FacilityPlan['supplies']) {
  const groupFor = (item: FacilityItem): FacilitySupplyGroup => {
    if (item.unit === 'L') return 'liquids';
    if (item.kind === 'item' && item.unit === 'units' && ['Coal', 'Salvage', 'Sulfur', 'Components'].includes(item.name)) return 'raw';
    return 'other';
  };
  return SUPPLY_GROUPS.map(group => ({ ...group, items: supplies.filter(row => groupFor(row.item) === group.id) }))
    .filter(group => group.items.length);
}

export const emptyFacilityProfile = (): FacilityProfile => ({ version: 1, name: 'Regiment facility', location: '', recipes: {} });
export const emptyFacilityMission = (): FacilityMission => ({ version: 1, title: '', faction: 'all', objectives: [], available: {} });
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const positive = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value > 0 && value <= 1_000_000;
const text = (value: unknown): value is string => typeof value === 'string' && value.length <= 1000;

export function isFacilityProfile(value: unknown): value is FacilityProfile {
  return record(value) && value.version === 1 && text(value.name) && text(value.location) && record(value.recipes) &&
    Object.keys(value.recipes).length <= 1000 && Object.values(value.recipes).every(id => typeof id === 'string' && id.length > 0 && id.length <= 20_000) &&
    (value.piped === undefined || (Array.isArray(value.piped) && value.piped.length <= 1000 && new Set(value.piped).size === value.piped.length && value.piped.every(id => typeof id === 'string' && id.length > 0 && id.length <= 1000)));
}
export function isFacilityMission(value: unknown): value is FacilityMission {
  return record(value) && value.version === 1 && text(value.title) && ['all', 'warden', 'colonial'].includes(value.faction as string) &&
    Array.isArray(value.objectives) && value.objectives.length <= 100 && value.objectives.every(goal => record(goal) && text(goal.itemId) && positive(goal.quantity)) &&
    record(value.available) && Object.keys(value.available).length <= 1000 && Object.values(value.available).every(amount => amount === 0 || positive(amount));
}

export function planFacilities(catalog: FacilitiesCatalog, mission: FacilityMission, profile: FacilityProfile): FacilityPlan {
  const plan: FacilityPlan = { steps: [], supplies: [], stock: [], piped: [], relevant: [], errors: [] };
  if (!isFacilityMission(mission) || !isFacilityProfile(profile)) {
    plan.errors.push('Invalid mission or facility settings.'); return plan;
  }
  const items = new Map(catalog.items.map(item => [item.id, item]));
  const recipes = new Map<string, FacilityRecipe>();
  const order: string[] = [];
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const demand = new Map<string, number>();
  const piped = new Set(profile.piped ?? []);
  const fail = (message: string) => { if (!plan.errors.includes(message)) plan.errors.push(message); };
  const add = (id: string, amount: number) => {
    const total = (demand.get(id) ?? 0) + amount;
    if (!Number.isFinite(total) || total > Number.MAX_SAFE_INTEGER || amount < 0) throw new Error('Mission quantities are too large to calculate safely.');
    demand.set(id, total);
  };
  const visit = (id: string): void => {
    const item = items.get(id);
    if (!item) { fail('An item is no longer in the catalogue. Remove it from the mission and choose it again.'); return; }
    if (visiting.has(id)) { fail(`Recipe cycle involving ${item.name}. Choose another recipe or supply this item.`); return; }
    if (visited.has(id)) return;
    visiting.add(id); plan.relevant.push(item);
    if (piped.has(id)) {
      if (!canSupplyByPipeline(item)) fail(`${item.name} cannot be supplied by pipeline. Only supported liquids can use this setting.`);
      visiting.delete(id); visited.add(id); order.push(id); return;
    }
    const choice = Object.hasOwn(profile.recipes, id) ? profile.recipes[id] : undefined;
    const recipe = choice === 'supply' ? undefined : choice ? item.recipes.find(r => r.id === choice) : defaultFacilityRecipe(item);
    if (choice && choice !== 'supply' && !recipe) fail(`Saved recipe for ${item.name} has changed. Choose a recipe in Facility settings.`);
    if (recipe) {
      recipes.set(id, recipe);
      for (const input of recipe.inputs) visit(input.itemId);
    }
    visiting.delete(id); visited.add(id); order.push(id);
  };
  try {
    for (const objective of mission.objectives) {
      const item = items.get(objective.itemId);
      if (item && mission.faction !== 'all' && item.factions.length && !item.factions.includes(mission.faction)) fail(`${item.name} is not available for the selected faction.`);
      add(objective.itemId, objective.quantity); visit(objective.itemId);
    }
    if (plan.errors.length) return plan;
    // Parents contribute their full demand before a shared ingredient is rounded into batches.
    const steps = new Map<string, FacilityStep>();
    for (const id of [...order].reverse()) {
      const item = items.get(id)!;
      const needed = demand.get(id) ?? 0;
      if (piped.has(id)) {
        if (needed > 0) plan.piped.push({ item, amount: needed });
        continue;
      }
      const fromStock = Math.min(needed, mission.available[id] ?? 0);
      if (fromStock > 0) plan.stock.push({ item, amount: fromStock });
      const remaining = needed - fromStock;
      if (remaining <= 0) continue;
      const recipe = recipes.get(id);
      if (!recipe) { plan.supplies.push({ item, amount: remaining }); continue; }
      if (mission.faction !== 'all' && item.factions.length && !item.factions.includes(mission.faction)) {
        fail(`${item.name} cannot be produced for the selected faction. Supply it instead.`); continue;
      }
      // Produce enough liquid to fill complete cans; recipe batches and costs remain exact in litres.
      const liquid = facilityLiquidSupply(remaining, item);
      const productionTarget = liquid ? liquid.cans * liquid.litresPerCan : remaining;
      const batches = Math.ceil(productionTarget / recipe.amount);
      const produced = batches * recipe.amount;
      if (!Number.isSafeInteger(batches) || !Number.isSafeInteger(produced)) throw new Error('Mission quantities are too large to calculate safely.');
      const inputs = recipe.inputs.map(input => {
        add(input.itemId, input.amount * batches);
        return { item: items.get(input.itemId)!, amount: input.amount * batches };
      });
      steps.set(id, { item, recipe, needed: remaining, batches, produced, surplus: produced - remaining,
        inputs, level: 1, byproducts: recipe.byproducts.map(output => ({ item: items.get(output.itemId)!, amount: output.amount * batches })) });
    }
    // Dependencies first; independent operations share a stage rather than implying a schedule.
    for (const id of order) {
      const step = steps.get(id);
      if (!step) continue;
      step.level = 1 + Math.max(0, ...step.inputs.map(input => steps.get(input.item.id)?.level ?? 0));
      plan.steps.push(step);
    }
    // Keep every declared connection visible, including an upstream liquid whose
    // consumption disappeared when a downstream liquid was also marked as piped.
    for (const id of piped) {
      const item = items.get(id);
      if (item && canSupplyByPipeline(item) && !plan.piped.some(row => row.item.id === id)) {
        plan.piped.push({ item, amount: 0 });
      }
    }
    plan.steps.sort((a, b) => a.level - b.level || a.item.name.localeCompare(b.item.name, 'en'));
    plan.supplies.sort((a, b) => a.item.name.localeCompare(b.item.name, 'en'));
    plan.piped.sort((a, b) => a.item.name.localeCompare(b.item.name, 'en'));
  } catch (error) {
    fail(error instanceof Error ? error.message : 'The mission could not be calculated.');
  }
  return plan;
}

export function facilityAmount(amount: number, item: FacilityItem): string {
  if (item.unit === 'crates') return `${amount.toLocaleString('en-GB')} crate${amount === 1 ? '' : 's'} of ${item.name}`;
  return `${amount.toLocaleString('en-GB', { maximumFractionDigits: 3 })}${item.unit === 'units' ? '' : ` ${item.unit}`} ${item.name}`;
}

// Full can capacities, verified against each resource's Volume infobox on 2026-11-17:
// https://foxhole.wiki.gg/wiki/{Diesel,Enriched_Oil,Heavy_Oil,Oil,Petrol,Water}
// Cargo's crate amount is not a liquid volume, nor is a production batch's output.
const LIQUID_CAN_LITRES: Readonly<Record<string, number>> = {
  Diesel: 100, 'Enriched Oil': 30, 'Heavy Oil': 30, Oil: 50, Petrol: 50, Water: 50,
};

/** Delivery display only; recipe calculations and saved stock remain in litres. */
export function facilityLiquidSupply(amount: number, item: FacilityItem): { cans: number; litresPerCan: number } | undefined {
  const litresPerCan = item.unit === 'L' && item.kind === 'item' && Object.hasOwn(LIQUID_CAN_LITRES, item.name)
    ? LIQUID_CAN_LITRES[item.name] : undefined;
  return litresPerCan ? { cans: Math.ceil(amount / litresPerCan), litresPerCan } : undefined;
}

export function canSupplyByPipeline(item: FacilityItem): boolean {
  return facilityLiquidSupply(0, item) !== undefined;
}

/** Stage inputs are cans to provide; outputs count only full cans actually produced. */
export function facilityStageAmount(amount: number, item: FacilityItem, output = false): string {
  const liquid = facilityLiquidSupply(amount, item);
  if (!liquid) return facilityAmount(amount, item);
  const cans = output ? Math.floor(amount / liquid.litresPerCan) : liquid.cans;
  if (output && cans === 0 && amount > 0) return `Less than 1 can of ${item.name}`;
  return `${cans.toLocaleString('en-GB')} can${cans === 1 ? '' : 's'} of ${item.name}`;
}

// Solid raw resources accepted by the Resource Container (5,000 units total).
// https://foxhole.wiki.gg/wiki/Resource_Container — verified 2026-11-17.
// Rare Metal stays exact in units; intermediate resources also keep their current display.
const RESOURCE_CONTAINER_CAPACITY = 5_000;
const RESOURCE_CONTAINER_RAW_NAMES = new Set(['Coal', 'Components', 'Salvage', 'Sulfur',
  'Damaged Components', 'Aluminum', 'Iron', 'Copper']);

/** Delivery display only: round up to whole containers; recipe quantities stay exact. */
export function facilityResourceSupply(amount: number, item: FacilityItem): { containers: number; capacity: number } | undefined {
  if (item.kind !== 'item' || item.unit !== 'units' || !RESOURCE_CONTAINER_RAW_NAMES.has(item.name)) return undefined;
  return { containers: Math.ceil(amount / RESOURCE_CONTAINER_CAPACITY), capacity: RESOURCE_CONTAINER_CAPACITY };
}

export function facilitySupplyAmount(amount: number, item: FacilityItem): string {
  const liquid = facilityLiquidSupply(amount, item);
  if (liquid) return `${liquid.cans.toLocaleString('en-GB')} can${liquid.cans === 1 ? '' : 's'} of ${item.name}`;
  const resource = facilityResourceSupply(amount, item);
  if (resource) return `${resource.containers.toLocaleString('en-GB')} Resource Container${resource.containers === 1 ? '' : 's'} of ${item.name}`;
  return facilityAmount(amount, item);
}

export function facilitySupplyTooltip(amount: number, item: FacilityItem): string {
  const liquid = facilityLiquidSupply(amount, item);
  if (liquid) return `${amount.toLocaleString('en-GB', { maximumFractionDigits: 3 })} L required\n${liquid.litresPerCan} L per full can · Rounded up for delivery`;
  const resource = facilityResourceSupply(amount, item);
  return resource ? `${amount.toLocaleString('en-GB')} units required\n${resource.capacity.toLocaleString('en-GB')} units per Resource Container · Rounded up for delivery` : '';
}

export function exportFacilityMission(catalog: FacilitiesCatalog, mission: FacilityMission, profile: FacilityProfile, plan: FacilityPlan): string {
  if (plan.errors.length || !mission.objectives.length) return '';
  const safe = (value: string) => value.replace(/[\r\n]+/g, ' ').replace(/[\\`*_~|<>@]/g, '');
  const amount = (quantity: number, item: FacilityItem) => safe(facilityAmount(quantity, item));
  const lines = [`__**Task Force — ${safe(mission.title.trim() || 'Facility mission')}**__`, `Facility: ${safe(profile.name)}`];
  if (profile.location.trim()) lines.push(`Deliver to: ${safe(profile.location)}`);
  const items = new Map(catalog.items.map(item => [item.id, item]));
  const goals = new Map<string, number>();
  for (const goal of mission.objectives) {
    goals.set(goal.itemId, (goals.get(goal.itemId) ?? 0) + goal.quantity);
  }
  if (goals.size) lines.push('', '__Objectives__');
  for (const [id, quantity] of goals) lines.push(`- ${amount(quantity, items.get(id)!)}`);
  if (plan.stock.length || plan.piped.length) {
    lines.push('', '__Already allocated — do not gather again__');
    plan.stock.forEach(row => lines.push(`- ${amount(row.amount, row.item)}`));
    plan.piped.forEach(row => lines.push(`- ${safe(row.item.name)} (Piped)`));
  }
  const section = <T>(title: string, rows: T[], render: (row: T, point: string) => void) => {
    const pages = Math.ceil(rows.length / 26);
    for (let page = 0; page < pages; page++) {
      lines.push('', `__${title}${pages > 1 ? ` (${page + 1}/${pages})` : ''}__`);
      rows.slice(page * 26, (page + 1) * 26).forEach((row, index) => render(row, regionalIndicator(index)));
    }
  };
  for (const group of groupFacilitySupplies(plan.supplies)) {
    section(group.label, group.items, (row, point) => {
      const external = profile.recipes[row.item.id] === 'supply' && defaultFacilityRecipe(row.item);
      const containers = group.id === 'raw' ? facilityResourceSupply(row.amount, row.item) : undefined;
      const quantity = containers ? `1 Resource Containers of ${row.item.name} (x${containers.containers})` : facilitySupplyAmount(row.amount, row.item);
      lines.push(`${point}・Bring ${safe(quantity)}${external ? ' (external supply selected)' : ''}`);
    });
  }
  const steps = plan.steps;
  for (const stage of [...new Set(steps.map(step => step.level))]) {
    section(`Stage ${stage}`, steps.filter(step => step.level === stage), (step, point) => {
      lines.push(`${point}・Produce ${safe(facilityStageAmount(step.produced, step.item, true))} — ${safe(step.recipe.source)}${step.recipe.category ? ` / ${safe(step.recipe.category)}` : ''} (${step.batches} batch${step.batches === 1 ? '' : 'es'})`);
    });
  }
  if (steps.some(step => step.byproducts.length)) lines.push('Byproducts are not deducted from requirements.');
  return lines.join('\n');
}

export const FACILITY_DISCORD_LIMIT = 4000;

/** Keep copy/paste useful for long briefings; prefer splitting at line boundaries. */
export function facilityDiscordChunks(text: string): string[] {
  if (!text) return [];
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > FACILITY_DISCORD_LIMIT) {
    let cut = remaining.lastIndexOf('\n', FACILITY_DISCORD_LIMIT);
    if (cut < 1) cut = FACILITY_DISCORD_LIMIT;
    const code = remaining.charCodeAt(cut - 1);
    if (code >= 0xD800 && code <= 0xDBFF) cut--;
    chunks.push(remaining.slice(0, cut));
    remaining = remaining.slice(cut);
    if (remaining.startsWith('\n')) remaining = remaining.slice(1);
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}
