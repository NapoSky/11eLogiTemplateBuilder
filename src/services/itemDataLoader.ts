import { getBaseUrl } from '../config';
import type { ItemDataEntry } from './gameData';
import { isProductionRecipe } from './productionData';

export async function loadItemData(): Promise<ItemDataEntry[]> {
  try {
    const response = await fetch(`${getBaseUrl()}itemData.json`);
    if (!response.ok) return [];
    const data: unknown = await response.json();
    if (!Array.isArray(data) || !data.every(item => item && typeof item.iconFilename === 'string' &&
      typeof item.itemName === 'string' && typeof item.legacyItemName === 'string' &&
      [null, 'item', 'vehicle', 'structure'].includes(item.kind) &&
      ['units', 'crates'].includes(item.uncratedStockUnit) &&
      (item.assetStatus === undefined || ['generic', 'retired'].includes(item.assetStatus)) &&
      (item.iconUsage === undefined || ['logistics', 'facilities'].includes(item.iconUsage)) &&
      (item.production === undefined || (item.kind !== null && Array.isArray(item.production) &&
        item.production.length > 0 && item.production.every(isProductionRecipe))) &&
      (item.factory === undefined || (item.kind === 'item' && item.factory?.maxCrates === 4 &&
        item.factory.cost && typeof item.factory.cost === 'object' && !Array.isArray(item.factory.cost) &&
        Object.keys(item.factory.cost).length > 0 && Object.entries(item.factory.cost).every(([material, amount]) =>
          ['bmat', 'rmat', 'emat', 'hemat'].includes(material) && typeof amount === 'number' &&
          Number.isSafeInteger(amount) && amount > 0 && Number.isSafeInteger(amount * 4)))) &&
      (item.unitsPerCrate === null || (Number.isSafeInteger(item.unitsPerCrate) && item.unitsPerCrate > 0)) &&
      (item.faction === null || (Array.isArray(item.faction) && item.faction.length > 0 && item.faction.every((f: unknown) => f === 'warden' || f === 'colonial'))) &&
      Array.isArray(item.aliases) && item.aliases.every((alias: unknown) => typeof alias === 'string'))) throw new Error('Invalid item catalogue');
    return data as ItemDataEntry[];
  } catch (error) {
    console.warn('Item catalogue unavailable; unknown metadata will remain unresolved.', error);
    return [];
  }
}
