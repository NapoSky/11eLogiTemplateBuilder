import type { ItemDataEntry } from './gameData';
import { normalizeGameName } from './gameData';
import { translateFrenchItemName } from './frenchItemNames';

// Business scope, independent of artwork, template section names and production buildings.
// Finished goods made in facilities still belong to depot replenishment logistics.
const INDUSTRIAL_AND_BULK_RESOURCES = new Set([
  'Construction Materials', 'Processed Construction Materials', 'Steel Construction Materials',
  'Assembly Materials', 'Assembly Materials I', 'Assembly Materials II', 'Assembly Materials III',
  'Assembly Materials IV', 'Assembly Materials V', 'Rare Metal', 'Rare Alloys', 'Rare Materials',
  'Unstable Substances', 'Thermal Shielding', 'Heavy Oil', 'Enriched Oil', 'Water',
  'Coal', 'Coke', 'Salvage', 'Components', 'Damaged Components', 'Sulfur', 'Oil',
  'Copper', 'Copper Alloy', 'Gravel', 'Wreckage', 'Relic Materials',
].map(name => name.toLowerCase()));

export function isTransportSupply(
  name: string,
  metadata?: Pick<ItemDataEntry, 'itemName' | 'legacyItemName' | 'aliases'>,
): boolean {
  const names = [name, ...(metadata ? [metadata.itemName, metadata.legacyItemName, ...metadata.aliases] : [])];
  return !names.some(value => INDUSTRIAL_AND_BULK_RESOURCES.has(
    normalizeGameName(translateFrenchItemName(value)).replace(/ \(Crate\)$/i, '').toLowerCase(),
  ));
}
