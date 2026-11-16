import type { ItemDataEntry } from './gameData';

export interface ProductionInput {
  name: string;
  amount: number;
  kind: 'item' | 'vehicle' | 'crate' | 'part';
  unit?: string;
  crateCapacity?: number;
}

export interface ProductionRecipe {
  source: string;
  category?: string;
  rank: number;
  inputs: ProductionInput[];
  output: { amount: number; high?: number; unit?: string; crated: boolean; crateCapacity?: number };
  power?: number;
  byproducts?: Array<{ name: string; amount: number; unit?: string }>;
  status?: string;
}

const positive = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0 && n <= Number.MAX_SAFE_INTEGER;
const text = (s: unknown): s is string => typeof s === 'string' && s.trim().length > 0;
const optionalText = (s: unknown): boolean => s === undefined || text(s);
const capacity = (n: unknown): boolean => n === undefined || (positive(n) && Number.isSafeInteger(n));

export function isProductionRecipe(value: unknown): value is ProductionRecipe {
  if (!value || typeof value !== 'object') return false;
  const r = value as ProductionRecipe;
  return text(r.source) && r.source !== 'Factory' && optionalText(r.category) && positive(r.rank) && Number.isSafeInteger(r.rank) &&
    Array.isArray(r.inputs) && r.inputs.every(i => i && text(i.name) && positive(i.amount) &&
      ['item', 'vehicle', 'crate', 'part'].includes(i.kind) && optionalText(i.unit) && capacity(i.crateCapacity)) &&
    !!r.output && positive(r.output.amount) && typeof r.output.crated === 'boolean' && optionalText(r.output.unit) &&
    capacity(r.output.crateCapacity) && (r.output.high === undefined || (positive(r.output.high) && r.output.high >= r.output.amount)) &&
    (r.power === undefined || positive(r.power)) && optionalText(r.status) &&
    (r.byproducts === undefined || (Array.isArray(r.byproducts) && r.byproducts.every(p =>
      p && text(p.name) && positive(p.amount) && optionalText(p.unit))));
}

export function productionTooltip(item: ItemDataEntry | undefined): string | null {
  if (!item) return null;
  const alternatives: string[] = [];
  if (item.factory) {
    const labels = { bmat: 'Bmats', rmat: 'Rmats', emat: 'Emats', hemat: 'HEmats' } as const;
    const cost = (Object.keys(labels) as Array<keyof typeof labels>)
      .filter(material => item.factory!.cost[material])
      .map(material => `${item.factory!.cost[material]! * item.factory!.maxCrates} ${labels[material]}`).join(', ');
    alternatives.push(`Factory (${item.factory.maxCrates} crates)\nInputs: ${cost}`);
  }
  if (!item.production?.length) return alternatives.length ? `Production\n${alternatives.join('\n\n')}` : null;
  const named = (amount: number, name: string, unit?: string): string => `${amount}${unit ? ` ${unit}` : ''} ${name}`;
  const recipes = item.production.map(r => {
    const amount = r.output.high === undefined ? `${r.output.amount}` : `${r.output.amount}–${r.output.high}`;
    const unit = r.output.unit ?? (r.output.crated ? 'crate' : 'unit') + (amount === '1' ? '' : 's');
    const heading = `${r.source}${r.category ? ` — ${r.category}` : ''} (${amount} ${unit})`;
    const inputs = r.inputs.map(i => i.kind === 'crate'
      ? `${i.amount} crate${i.amount === 1 ? '' : 's'} of ${i.name}${i.crateCapacity ? ` (${i.crateCapacity} per crate)` : ''}`
      : `${named(i.amount, i.name, i.unit)}${i.kind === 'vehicle' ? ' (base vehicle)' : ''}`);
    const lines = [heading, `Inputs: ${inputs.join(', ') || 'No material input listed'}`];
    if (r.power !== undefined) lines.push(`Power: ${r.power} MW`);
    if (r.byproducts?.length) lines.push(`Byproducts: ${r.byproducts.map(p => named(p.amount, p.name, p.unit)).join(', ')}`);
    if (r.status) lines.push(`Status: ${r.status}`);
    return lines.join('\n');
  });
  return `Production\n${[...alternatives, ...recipes].join('\n\n')}`;
}
