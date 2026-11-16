import type { MpfCategory, MpfDataEntry } from '../types';
import type { MaterialCost, WikiCatalog } from './wikiCatalog';
import type { ProductionRecipe } from './productionData';

export type QuantityMode = 'legacy' | 'crate-equivalents-v1';

/** Runtime projection: game assets stay local and their historical paths stay valid. */
export interface ItemDataEntry {
  iconFilename: string;
  itemName: string;
  legacyItemName: string;
  kind: 'item' | 'vehicle' | 'structure' | null;
  faction: ('colonial' | 'warden')[] | null;
  unitsPerCrate: number | null;
  /** The accepted CSV model distinguishes explicitly crated rows from bare units. */
  uncratedStockUnit: 'crates' | 'units';
  aliases: string[];
  legacyMpf?: MpfDataEntry;
  /** Recognized artwork that represents a family or an element removed from the game. */
  assetStatus?: 'generic' | 'retired';
  /** Alternate game artwork reserved for the corresponding module. */
  iconUsage?: 'logistics' | 'facilities';
  /** Standard Factory cost per crate, including items outside MPF eligibility. */
  factory?: { cost: MaterialCost; maxCrates: 4 };
  production?: ProductionRecipe[];
}

export type IconVariants = Record<string, { logistics: string; facilities: string }>;

export function normalizeGameName(name: string): string {
  return name.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replaceAll('⧸', '/')
    .replace(/\s+/g, ' ').trim();
}

export function projectWikiData(
  catalog: WikiCatalog,
  legacyMapping: Record<string, string>,
  historicalAliases: Record<string, string[]> = {},
  legacyMpfData: MpfDataEntry[] = [],
  iconVariants: IconVariants = {},
): { itemData: ItemDataEntry[]; mpfData: MpfDataEntry[]; iconMapping: Record<string, string> } {
  const items = new Map(catalog.items.map(item => [item.sourceKey, item]));
  const iconMapping = { ...legacyMapping };
  const itemData: ItemDataEntry[] = [];
  const mpfData: MpfDataEntry[] = [];
  const projectedMpf = new Set<string>();
  const legacyByFilename = new Map(legacyMpfData.map(entry => [entry.iconFilename, entry]));
  const aliasOwners = new Map<string, string>();
  const usageByFilename = new Map<string, 'logistics' | 'facilities'>();
  for (const [name, variants] of Object.entries(iconVariants)) {
    const logistics = catalog.assets.find(asset => asset.iconFilename === variants.logistics);
    const facilities = catalog.assets.find(asset => asset.iconFilename === variants.facilities);
    if (!logistics?.itemSourceKey || !facilities?.itemSourceKey || variants.logistics === variants.facilities ||
      logistics.itemSourceKey !== facilities.itemSourceKey ||
      normalizeGameName(items.get(logistics.itemSourceKey)!.name) !== name ||
      usageByFilename.has(variants.logistics) || usageByFilename.has(variants.facilities)) {
      throw new Error(`Invalid icon variants for ${name}`);
    }
    usageByFilename.set(variants.logistics, 'logistics');
    usageByFilename.set(variants.facilities, 'facilities');
  }
  const categories: Record<string, MpfCategory> = {
    'Small Arms': 'small_arms', 'Heavy Arms': 'heavy_arms',
    'Heavy Ammunition': 'heavy_ammunition', Uniforms: 'uniforms', Resources: 'supplies',
  };
  for (const asset of catalog.assets) {
    const item = asset.itemSourceKey ? items.get(asset.itemSourceKey) : undefined;
    const name = normalizeGameName(item?.name ?? asset.annotation?.displayName ?? asset.legacyDisplayName);
    const aliases = item
      ? [...new Set([name, ...(historicalAliases[item.name] ?? []).map(normalizeGameName),
        // CSV parsing normalizes quotes, but a native mathematical slash may remain.
        item.name.replace(/[‘’]/g, "'").replace(/[“”]/g, '"')])]
      : [name];
    if (item) {
      for (const alias of aliases) {
        const key = normalizeGameName(alias).toLowerCase();
        const owner = aliasOwners.get(key);
        if (owner && owner !== item.sourceKey) throw new Error(`Ambiguous item alias ${alias}`);
        aliasOwners.set(key, item.sourceKey);
      }
    }
    iconMapping[asset.iconFilename] = name;
    itemData.push({
      iconFilename: asset.iconFilename, itemName: name, legacyItemName: asset.legacyDisplayName,
      kind: item?.kind ?? null, faction: item?.factions ?? null,
      unitsPerCrate: item?.mpf?.unitsPerCrate ?? item?.factory?.unitsPerCrate ?? item?.declaredCrateCapacity ?? null,
      uncratedStockUnit: 'units', aliases,
      ...(asset.annotation ? { assetStatus: asset.annotation.classification } : {}),
      ...(usageByFilename.has(asset.iconFilename) ? { iconUsage: usageByFilename.get(asset.iconFilename)! } : {}),
      ...(item?.factory ? { factory: { cost: item.factory.baseCostPerCrate, maxCrates: item.factory.maxCratesPerOrder } } : {}),
      ...(item?.production.length ? { production: item.production } : {}),
      ...(legacyByFilename.has(asset.iconFilename) ? { legacyMpf: legacyByFilename.get(asset.iconFilename)! } : {}),
    });
    if (!item?.mpf) continue;
    if (projectedMpf.has(item.sourceKey)) throw new Error(`Multiple MPF assets for ${item.name}`);
    projectedMpf.add(item.sourceKey);
    const category = item.kind === 'vehicle' ? 'vehicles'
      : item.kind === 'structure' ? 'shipables' : categories[item.mpf.productionCategory ?? ''];
    if (!category || !item.factions?.length) throw new Error(`Unsupported MPF metadata for ${item.name}`);
    mpfData.push({
      iconFilename: asset.iconFilename, itemName: name, itemCategory: category,
      faction: ['neutral', ...item.factions], cost: item.mpf.baseCostPerCrate,
      numberProduced: item.mpf.unitsPerCrate, maxCrates: item.mpf.maxCratesPerOrder,
      ...(aliases.length > 1 ? { aliases: aliases.filter(alias => alias !== name) } : {}),
    });
  }
  const expected = catalog.items.filter(item => item.mpf);
  if (projectedMpf.size !== expected.length) {
    throw new Error(`MPF outputs without local asset: ${expected.filter(item => !projectedMpf.has(item.sourceKey)).map(item => item.name).join(', ')}`);
  }
  mpfData.sort((a, b) => a.itemCategory.localeCompare(b.itemCategory, 'en') || a.itemName.localeCompare(b.itemName, 'en'));
  return { itemData, mpfData, iconMapping };
}
