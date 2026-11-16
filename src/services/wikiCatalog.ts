/**
 * Wiki acquisition model, separate from the existing application contracts.
 * No stored template or stockpile quantity is converted by this module.
 */
import { isProductionRecipe } from './productionData.ts';
import type { ProductionRecipe, ProductionInput } from './productionData';
export type WikiRow = Record<string, unknown>;
export type WikiKind = 'item' | 'vehicle' | 'structure';
export type WikiFaction = 'colonial' | 'warden';
export type MaterialCost = Partial<Record<'bmat' | 'rmat' | 'emat' | 'hemat', number>>;

export interface WikiSnapshot {
  schemaVersion: 1;
  capturedOn: string;
  source: string;
  manifest: Record<'itemdata' | 'vehicles' | 'structures' | 'Production', {
    rowCount: number; fields?: readonly string[]; orderBy?: string; pageSize?: number;
  }>;
  tables: {
    itemdata: WikiRow[];
    vehicles: WikiRow[];
    structures: WikiRow[];
    Production: WikiRow[];
  };
}

export interface WikiMpfRecipe {
  /** Factory recipes price a crate; Garage/Yard/Shipyard recipes price a unit. */
  sourceBasis: 'crate' | 'unit';
  unitsPerCrate: number;
  maxCratesPerOrder: 9 | 5;
  /** Cost before the progressive MPF discounts; already expressed per crate. */
  baseCostPerCrate: MaterialCost;
  source: string;
  productionCategory: string | null;
}

export interface WikiFactoryRecipe {
  /** Ordinary Factory price for one crate, without MPF discounts. */
  baseCostPerCrate: MaterialCost;
  unitsPerCrate: number;
  maxCratesPerOrder: 4;
}

export interface WikiCatalogItem {
  /** Source lookup key, never written into existing saved documents. */
  sourceKey: string;
  kind: WikiKind;
  pageId: number;
  pageName: string;
  codename: string | null;
  name: string;
  image: string | null;
  imageOverride: string | null;
  factions: WikiFaction[] | null;
  status: string | null;
  /** Distinguishes a discrete object from e.g. a liquid measured in litres. */
  unit: string | null;
  /** Infobox value only: null means unknown, not zero. */
  declaredCrateCapacity: number | null;
  mpf: WikiMpfRecipe | null;
  factory: WikiFactoryRecipe | null;
  production: ProductionRecipe[];
}

export interface WikiAssetBinding {
  /** Existing game asset path, never replaced with a wiki image URL. */
  iconFilename: string;
  legacyDisplayName: string;
  /** A historical label is not automatically a canonical import alias. */
  itemSourceKey: string | null;
  match: 'image' | 'explicit' | 'generic' | 'retired' | 'unresolved' | 'ambiguous';
  candidateSourceKeys: string[];
  annotation?: WikiAssetAnnotation;
}

/** A generic family or historical graphic has no single current recipe identity. */
export interface WikiAssetAnnotation {
  classification: 'generic' | 'retired';
  displayName: string;
  reason: string;
}

export interface WikiAssetOverride {
  pageId: number;
  kind: WikiKind;
  name: string;
  reason: string;
}

export interface WikiCatalog {
  schemaVersion: 1;
  source: string;
  capturedOn: string;
  items: WikiCatalogItem[];
  assets: WikiAssetBinding[];
}

const materials: Record<string, keyof MaterialCost> = {
  'Basic Materials': 'bmat',
  'Refined Materials': 'rmat',
  'Explosive Powder': 'emat',
  'Heavy Explosive Powder': 'hemat',
};

function record(value: unknown, label: string): WikiRow {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as WikiRow;
}

/** cargoquery converts underscores in unaliased field names to spaces. */
function field(row: WikiRow, name: string): unknown {
  return row[name] ?? row[name.replaceAll('_', ' ')];
}

function string(row: WikiRow, name: string): string | null {
  const value = field(row, name);
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string') throw new Error(`${name} must be a string`);
  return value;
}

function requiredString(row: WikiRow, name: string): string {
  const value = string(row, name);
  if (!value?.trim()) throw new Error(`Missing ${name}`);
  return value;
}

function number(row: WikiRow, name: string): number | null {
  const value = field(row, name);
  if (value === '' || value === null || value === undefined) return null;
  if (typeof value !== 'number' && typeof value !== 'string') {
    throw new Error(`${name} must be numeric`);
  }
  if (typeof value === 'string' && !value.trim()) throw new Error(`${name} must be numeric`);
  const result = Number(value);
  if (!Number.isFinite(result) || result < 0) throw new Error(`Invalid ${name}`);
  return result;
}

function positiveInteger(row: WikiRow, name: string): number {
  const value = number(row, name);
  if (value === null || !Number.isSafeInteger(value) || value <= 0) throw new Error(`Invalid ${name}`);
  return value;
}

function bool(row: WikiRow, name: string): boolean {
  const value = field(row, name);
  if (value === true || value === 1 || value === '1') return true;
  if (value === false || value === 0 || value === '0' || value === '' || value == null) return false;
  throw new Error(`Invalid boolean ${name}`);
}

function factions(value: string | null): WikiFaction[] | null {
  switch (value) {
    case 'Both': return ['colonial', 'warden'];
    case 'Col': return ['colonial'];
    case 'War': return ['warden'];
    // Unknown and lore are not silently classified as common equipment.
    case null: case 'Lore': return null;
    default: throw new Error(`Unknown wiki faction ${value}`);
  }
}

export function parseWikiSnapshot(value: unknown): WikiSnapshot {
  const root = record(value, 'Wiki snapshot');
  if (root.schemaVersion !== 1) throw new Error('Unsupported wiki snapshot schema');
  requiredString(root, 'capturedOn');
  requiredString(root, 'source');
  const tables = record(root.tables, 'Wiki tables');
  const manifest = record(root.manifest, 'Wiki manifest');
  for (const table of ['itemdata', 'vehicles', 'structures', 'Production']) {
    const rows = tables[table];
    if (!Array.isArray(rows) || rows.length === 0) throw new Error(`Missing or empty table ${table}`);
    const metadata = record(manifest[table], `${table} manifest`);
    if (positiveInteger(metadata, 'rowCount') !== rows.length) throw new Error(`Truncated or inconsistent table ${table}`);
    rows.forEach(row => record(row, `${table} row`));
  }
  return value as WikiSnapshot;
}

function mpfRecipe(row: WikiRow, kind: WikiKind): WikiMpfRecipe {
  if (positiveInteger(row, 'RecipeRank') !== 1) throw new Error('MPF recipe must be primary');
  if (positiveInteger(row, 'OutputAmount') !== 1) throw new Error('Unsupported MPF batch output');
  const source = requiredString(row, 'Source');
  const crated = bool(row, 'IsCrateOutput');
  const itemRecipe = kind === 'item';
  if ((itemRecipe && (!crated || source !== 'Factory')) ||
      (!itemRecipe && (crated || !['Garage', 'Shipyard', 'Construction Yard'].includes(source)))) {
    throw new Error(`Unsupported MPF source or packaging: ${source}`);
  }
  const declaredCapacity = number(row, 'CrateCapacity');
  const capacity = declaredCapacity ?? (itemRecipe ? null : 3);
  if (capacity === null || !Number.isSafeInteger(capacity) || capacity <= 0) {
    throw new Error(`Unknown MPF crate capacity for ${requiredString(row, 'Output')}`);
  }
  const cost: MaterialCost = {};
  for (let i = 1; i <= 6; i++) {
    const item = string(row, `InputItem${i}`);
    const amount = number(row, `InputItem${i}Amount`);
    if (!item && amount !== null) throw new Error('MPF ingredient amount without an item');
    if (!item) continue;
    const key = materials[item];
    if (!key || amount === null || amount <= 0 || !Number.isSafeInteger(amount)) {
      throw new Error(`Unsupported MPF ingredient ${item}`);
    }
    // Wiki MPF vehicle costs use three units even for a Falchion crate of five.
    cost[key] = (cost[key] ?? 0) + amount * (itemRecipe ? 1 : 3);
    if (!Number.isSafeInteger(cost[key])) throw new Error(`MPF cost exceeds safe integer range for ${item}`);
  }
  if (Object.keys(cost).length === 0) throw new Error('Empty MPF cost');
  return {
    sourceBasis: itemRecipe ? 'crate' : 'unit',
    unitsPerCrate: capacity,
    maxCratesPerOrder: itemRecipe ? 9 : 5,
    baseCostPerCrate: cost,
    source,
    productionCategory: string(row, 'ProductionCategory'),
  };
}

function factoryRecipe(row: WikiRow, kind: WikiKind): WikiFactoryRecipe {
  if (kind !== 'item' || string(row, 'Source') !== 'Factory' || !bool(row, 'IsCrateOutput') ||
    positiveInteger(row, 'RecipeRank') !== 1 || positiveInteger(row, 'OutputAmount') !== 1) {
    throw new Error('Unsupported Factory source or packaging');
  }
  const cost: MaterialCost = {};
  for (let i = 1; i <= 6; i++) {
    const name = string(row, `InputItem${i}`);
    const amount = number(row, `InputItem${i}Amount`);
    if (!name && amount !== null) throw new Error('Factory ingredient amount without an item');
    if (!name) continue;
    const material = materials[name];
    if (!material || amount === null || !Number.isSafeInteger(amount) || amount <= 0) {
      throw new Error(`Unsupported Factory ingredient ${name}`);
    }
    cost[material] = (cost[material] ?? 0) + amount;
    if (!Number.isSafeInteger(cost[material]! * 4)) throw new Error('Factory order cost exceeds safe integer range');
  }
  if (!Object.keys(cost).length) throw new Error('Empty Factory cost');
  return { baseCostPerCrate: cost, unitsPerCrate: positiveInteger(row, 'CrateCapacity'), maxCratesPerOrder: 4 };
}

function productionRecipe(row: WikiRow): ProductionRecipe {
  const inputs: ProductionInput[] = [];
  for (let i = 1; i <= 6; i++) {
    const name = string(row, `InputItem${i}`);
    const amount = number(row, `InputItem${i}Amount`);
    const unit = string(row, `InputItem${i}Unit`);
    if (!name && (amount !== null || unit)) throw new Error('Production ingredient without an item');
    if (name) inputs.push({ name, amount: amount!, kind: 'item', ...(unit ? { unit } : {}) });
  }
  const vehicle = string(row, 'InputVehicle');
  if (vehicle) inputs.push({ name: vehicle, amount: 1, kind: 'vehicle' });
  const crate = string(row, 'InputCrate');
  const inputCapacity = number(row, 'InputCrateCapacity');
  if (!crate && inputCapacity !== null) throw new Error('Input crate capacity without an item');
  if (crate) inputs.push({ name: crate, amount: 1, kind: 'crate', ...(inputCapacity === null ? {} : { crateCapacity: inputCapacity }) });
  for (let i = 1; i <= 2; i++) {
    const name = string(row, `ExtraPart${i}`);
    const amount = number(row, `ExtraPart${i}Amount`);
    if (!name && amount !== null) throw new Error('Extra part amount without an item');
    if (name) inputs.push({ name, amount: amount!, kind: 'part' });
  }
  const byproducts: NonNullable<ProductionRecipe['byproducts']> = [];
  for (const prefix of ['Secondary', 'Tertiary']) {
    const name = string(row, `${prefix}Output`);
    const amount = number(row, `${prefix}OutputAmount`);
    const unit = string(row, `${prefix}OutputUnit`);
    if (!name && (amount !== null || unit)) throw new Error('Byproduct amount without an item');
    if (name) byproducts.push({ name, amount: amount!, ...(unit ? { unit } : {}) });
  }
  const category = string(row, 'ProductionCategory');
  const unit = string(row, 'OutputUnit');
  const high = number(row, 'OutputAmountHigh');
  const outputCapacity = number(row, 'CrateCapacity');
  const power = number(row, 'InputPower');
  const status = string(row, 'SpecialStatus');
  const recipe: ProductionRecipe = {
    source: requiredString(row, 'Source'), rank: positiveInteger(row, 'RecipeRank'), inputs,
    ...(category && category !== 'None' ? { category } : {}),
    output: { amount: number(row, 'OutputAmount')!, crated: bool(row, 'IsCrateOutput'),
      ...(unit ? { unit } : {}), ...(high === null ? {} : { high }),
      ...(outputCapacity === null ? {} : { crateCapacity: outputCapacity }) },
    ...(power === null ? {} : { power }), ...(status ? { status } : {}),
    ...(byproducts.length ? { byproducts } : {}),
  };
  if (!isProductionRecipe(recipe)) throw new Error(`Invalid production recipe for ${string(row, 'Output')}`);
  return recipe;
}

export function normalizeWikiImageName(name: string): string {
  return name.replace(/^File:/i, '').replaceAll('_', ' ').trim().toLowerCase();
}

const sort = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0;

export function buildWikiCatalog(
  input: unknown,
  iconMapping: Record<string, string>,
  overrides: Record<string, WikiAssetOverride> = {},
  annotations: Record<string, WikiAssetAnnotation> = {},
): WikiCatalog {
  const snapshot = parseWikiSnapshot(input);
  const items: WikiCatalogItem[] = [];
  const imageIndex = new Map<string, WikiCatalogItem[]>();
  const recipes = new Map<string, WikiRow[]>();
  const factoryRecipes = new Map<string, WikiRow[]>();
  const otherRecipes = new Map<string, WikiRow[]>();
  for (const row of snapshot.tables.Production) {
    if (string(row, 'Source') === 'Factory') {
      const key = `${requiredString(row, 'OutputType')}:${requiredString(row, 'Output')}`;
      factoryRecipes.set(key, [...(factoryRecipes.get(key) ?? []), row]);
    } else {
      const key = `${requiredString(row, 'OutputType')}:${requiredString(row, 'Output')}`;
      otherRecipes.set(key, [...(otherRecipes.get(key) ?? []), row]);
    }
    if (!bool(row, 'IsMPFable')) continue;
    const key = `${requiredString(row, 'OutputType')}:${requiredString(row, 'Output')}`;
    const matches = recipes.get(key) ?? [];
    matches.push(row);
    recipes.set(key, matches);
  }
  const keys = new Set<string>();
  for (const [table, kind] of [
    ['itemdata', 'item'], ['vehicles', 'vehicle'], ['structures', 'structure'],
  ] as const) {
    for (const row of snapshot.tables[table]) {
      if (string(row, 'status')?.toLowerCase() === 'chinese' || string(row, 'faction') === 'Lore') continue;
      const name = requiredString(row, 'name');
      const pageId = positiveInteger(row, '_pageID');
      const codename = string(row, 'codename');
      // Some infobox variants share both page and codename (e.g. Town Base).
      const key = `${kind}:${pageId}:${codename ?? ''}:${name}`;
      if (keys.has(key)) throw new Error(`Duplicate wiki entity ${key}`);
      keys.add(key);
      const matches = recipes.get(`${kind}:${name}`) ?? [];
      if (matches.length > 1) throw new Error(`Ambiguous MPF recipes for ${name}`);
      const factoryMatches = factoryRecipes.get(`${kind}:${name}`) ?? [];
      if (factoryMatches.length > 1) throw new Error(`Ambiguous Factory recipes for ${name}`);
      const capacity = number(row, 'crate_amount');
      if (capacity !== null && (!Number.isSafeInteger(capacity) || capacity === 0)) {
        throw new Error(`Invalid declared crate capacity for ${name}`);
      }
      const item: WikiCatalogItem = {
        sourceKey: key, kind, pageId, codename, name,
        pageName: requiredString(row, '_pageName'),
        image: string(row, 'image'), imageOverride: string(row, 'imageOverride'),
        factions: factions(string(row, 'faction')),
        status: string(row, 'status'), unit: string(row, 'unit'),
        declaredCrateCapacity: capacity,
        mpf: matches.length ? mpfRecipe(matches[0], kind) : null,
        factory: factoryMatches.length ? factoryRecipe(factoryMatches[0], kind) : null,
        production: (otherRecipes.get(`${kind}:${name}`) ?? []).map(productionRecipe)
          .sort((a, b) => a.rank - b.rank || sort(a.source, b.source) || sort(a.category ?? '', b.category ?? '')),
      };
      const productionKeys = item.production.map(recipe => `${recipe.source}:${recipe.category ?? ''}:${recipe.rank}`);
      if (new Set(productionKeys).size !== productionKeys.length) throw new Error(`Duplicate production recipe for ${name}`);
      items.push(item);
      if (item.image) {
        const imageKey = normalizeWikiImageName(item.image);
        const candidates = imageIndex.get(imageKey) ?? [];
        candidates.push(item);
        imageIndex.set(imageKey, candidates);
      }
    }
  }
  for (const [key] of recipes) {
    if (!items.some(item => `${item.kind}:${item.name}` === key)) throw new Error(`Unresolved MPF output ${key}`);
  }
  for (const [key] of factoryRecipes) {
    if (!items.some(item => `${item.kind}:${item.name}` === key)) throw new Error(`Unresolved Factory output ${key}`);
  }

  for (const filename of Object.keys(overrides)) {
    if (!(filename in iconMapping) || filename.startsWith('_')) throw new Error(`Orphan asset override ${filename}`);
  }
  for (const [filename, annotation] of Object.entries(annotations)) {
    if (!(filename in iconMapping) || filename.startsWith('_')) throw new Error(`Orphan asset annotation ${filename}`);
    if (overrides[filename] || !['generic', 'retired'].includes(annotation.classification) ||
      typeof annotation.displayName !== 'string' || !annotation.displayName.trim() ||
      typeof annotation.reason !== 'string' || !annotation.reason.trim()) {
      throw new Error(`Invalid asset annotation ${filename}`);
    }
  }
  const assets = Object.entries(iconMapping)
    .filter(([filename]) => !filename.startsWith('_'))
    .sort(([a], [b]) => sort(a, b))
    .map(([filename, legacyDisplayName]): WikiAssetBinding => {
      const override = overrides[filename];
      const annotation = annotations[filename];
      const candidates = override
        ? items.filter(item => item.pageId === override.pageId && item.kind === override.kind && item.name === override.name)
        : imageIndex.get(normalizeWikiImageName(filename.split('/').pop()!)) ?? [];
      if (override && (!override.reason.trim() || candidates.length !== 1)) {
        throw new Error(`Invalid asset override ${filename}`);
      }
      if (annotation && candidates.length) throw new Error(`Annotated asset now matches a current entity; review ${filename}`);
      return {
        iconFilename: filename, legacyDisplayName,
        itemSourceKey: candidates.length === 1 ? candidates[0].sourceKey : null,
        match: annotation ? annotation.classification
          : candidates.length === 1 ? (override ? 'explicit' : 'image') : candidates.length ? 'ambiguous' : 'unresolved',
        candidateSourceKeys: candidates.map(item => item.sourceKey).sort(sort),
        ...(annotation ? { annotation } : {}),
      };
    });
  return {
    schemaVersion: 1, source: snapshot.source, capturedOn: snapshot.capturedOn,
    items: items.sort((a, b) => sort(a.sourceKey, b.sourceKey)), assets,
  };
}
