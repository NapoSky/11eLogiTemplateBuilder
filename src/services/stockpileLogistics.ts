import { translateFrenchItemName } from './frenchItemNames';
import { isTransportSupply } from './transportScope';

export type DepotRole = 'backline' | 'intermediate' | 'front';
export type CargoKind = 'container-crate' | 'direct-crate' | 'assembled';
// 'container' abstracts away the vehicle entirely: no per-trip capacity, just the raw quantity to transport.
export type TransportMode = 'container' | 'flatbed' | 'freighter' | 'train';

export interface StockpileSnapshot {
  id: string;
  header: { location: string; date: string } | null;
  items: Map<string, number>;
  label: string;
  depotName: string;
  role: DepotRole;
}

export interface NormalizedStockItem {
  itemName: string;
  crates: number;
  assembled: number;
  loose?: number;
}

export interface TransportCargoItem {
  itemName: string;
  quantity: number;
  kind: CargoKind;
}

export interface TransportMission {
  mode: TransportMode;
  tripCount: number;
  trainCars?: number;
  cargo: TransportCargoItem[];
}

export interface TransportRoute {
  source: string;
  destination: string;
  notes?: string[];
  missions: TransportMission[];
}

export interface TransportList {
  title?: string;
  date: Date;
  notes?: string[];
  routes: TransportRoute[];
}

export const DEFAULT_TRANSPORT_EXCLUSIONS = new Set([
  'Heavy Explosive Powder',
  'Refined Materials',
]);

export function inferDepotName(location: string): string {
  const parts = location.split(' - ').map(part => part.trim()).filter(Boolean);
  return parts.length >= 2 ? parts[1] : location.trim();
}

/**
 * Strips the trailing "X: ... Y: ..." coordinates and the depot's own city name (already shown
 * as the depot/tile name elsewhere) from a raw Foxhole location string, keeping the rest
 * (region, POI type, depot code...) for a less redundant/noisy display.
 */
export function formatLocationLabel(location: string, depotName: string): string {
  const withoutCoords = location.replace(/\s*-\s*X:\s*-?[\d.]+\s+Y:\s*-?[\d.]+\s*$/i, '');
  const parts = withoutCoords.split(' - ').map(part => part.trim()).filter(Boolean);
  const withoutCity = parts.filter(part => part.toLowerCase() !== depotName.trim().toLowerCase());
  const result = withoutCity.join(' - ');
  return result || withoutCoords.trim();
}

const RAW_MATERIAL_NAMES = new Set([
  'Basic Materials',
  'Refined Materials',
  'Explosive Powder',
  'Heavy Explosive Powder',
  'Rare Metal',
  'Rare Alloys',
]);

const RAW_MATERIAL_TYPES_THRESHOLD = 3;
const RAW_MATERIAL_MIN_QUANTITY = 50;
const AVG_OTHER_QTY_INTERMEDIATE_THRESHOLD = 60;

/**
 * Rough content-based guess of a depot's role, since we have no knowledge of the map or war plan:
 * seeing at least 3 distinct raw material types (Bmat/Rmat/Emat/HEmat/Rare Metal/Rare Alloys),
 * each with at least 50 units (to ignore trace amounts that just happen to pass through), is enough
 * on its own to suggest backline — backline depots stock a real variety of raw materials, front/
 * intermediate depots at most carry trace amounts of one or two in transit. Otherwise, large
 * quantities spread across many item types → intermediate, small quantities of many item types →
 * front (a real CSV export always lists the whole item catalog, so zero-quantity items are excluded
 * from that average — otherwise it would always be diluted down to near-zero).
 */
export function suggestDepotRole(items: Map<string, number>): DepotRole {
  let otherQty = 0;
  const otherItemNames = new Set<string>();
  const presentRawMaterials = new Set<string>();

  for (const [rawName, quantity] of items) {
    const translated = translateFrenchItemName(rawName);
    // Real exports always suffix crated items with "(Crate)" — strip it before
    // matching against the raw material names, which are never crate-suffixed.
    const itemName = translated.endsWith(' (Crate)') ? translated.slice(0, -8) : translated;
    if (RAW_MATERIAL_NAMES.has(itemName)) {
      if (quantity >= RAW_MATERIAL_MIN_QUANTITY) presentRawMaterials.add(itemName);
    } else if (quantity > 0) {
      otherQty += quantity;
      otherItemNames.add(itemName);
    }
  }

  if (presentRawMaterials.size >= RAW_MATERIAL_TYPES_THRESHOLD) return 'backline';

  if (otherQty === 0) return 'intermediate';
  const avgOtherQty = otherQty / Math.max(otherItemNames.size, 1);
  return avgOtherQty >= AVG_OTHER_QTY_INTERMEDIATE_THRESHOLD ? 'intermediate' : 'front';
}

export function upsertStockpileSnapshot(
  snapshots: StockpileSnapshot[],
  next: StockpileSnapshot
): StockpileSnapshot[] {
  const location = next.header?.location;
  if (!location) return [...snapshots, next];

  const index = snapshots.findIndex(snapshot => snapshot.header?.location === location);
  if (index === -1) return [...snapshots, next];

  const existing = snapshots[index];
  const replacement: StockpileSnapshot = {
    ...next,
    id: existing.id,
    depotName: existing.depotName,
    role: existing.role,
  };
  return snapshots.map((snapshot, snapshotIndex) => snapshotIndex === index ? replacement : snapshot);
}

export function aggregateStockpileItems(
  snapshots: StockpileSnapshot[],
  includeFront = false
): Map<string, number> {
  const result = new Map<string, number>();
  for (const snapshot of snapshots) {
    if (!includeFront && snapshot.role === 'front') continue;
    for (const [name, quantity] of snapshot.items) {
      result.set(name, (result.get(name) ?? 0) + quantity);
    }
  }
  return result;
}

export function normalizeStockItems(
  items: Map<string, number>,
  directCargoNames: ReadonlySet<string>,
  looseItemNames?: ReadonlySet<string>,
): NormalizedStockItem[] {
  const normalized = new Map<string, NormalizedStockItem>();

  for (const [rawName, quantity] of items) {
    const translatedName = translateFrenchItemName(rawName);
    const isCrate = translatedName.endsWith(' (Crate)');
    const itemName = isCrate ? translatedName.slice(0, -8) : translatedName;
    const current = normalized.get(itemName) ?? { itemName, crates: 0, assembled: 0 };

    if (!isCrate && looseItemNames?.has(itemName)) {
      current.loose = (current.loose ?? 0) + quantity;
    } else if (isCrate || !directCargoNames.has(itemName)) {
      current.crates += quantity;
    } else {
      current.assembled += quantity;
    }
    normalized.set(itemName, current);
  }

  return [...normalized.values()].sort((left, right) => left.itemName.localeCompare(right.itemName));
}

export function buildBacklineCargo(
  items: Map<string, number>,
  directCargoNames: ReadonlySet<string>,
  exclusions: ReadonlySet<string> = DEFAULT_TRANSPORT_EXCLUSIONS,
  looseItemNames?: ReadonlySet<string>,
): TransportCargoItem[] {
  return normalizeStockItems(items, directCargoNames, looseItemNames).flatMap(item => {
    if (!isTransportSupply(item.itemName) || exclusions.has(item.itemName)) return [];
    const cargo: TransportCargoItem[] = [];
    if (item.crates > 0) {
      cargo.push({
        itemName: item.itemName,
        quantity: item.crates,
        kind: directCargoNames.has(item.itemName) ? 'direct-crate' : 'container-crate',
      });
    }
    if (item.assembled > 0) cargo.push({ itemName: item.itemName, quantity: item.assembled, kind: 'assembled' });
    return cargo;
  });
}

export function suggestCargoPerTrip(
  availableCargo: TransportCargoItem[],
  mode: TransportMode,
  tripCount: number,
  trainCars?: number
): TransportCargoItem[] {
  const safeTripCount = Math.max(1, Math.floor(tripCount));
  const capacity = transportSlotsPerTrip({ mode, tripCount: safeTripCount, trainCars, cargo: [] });
  let remainingDirectSlots = capacity;
  const result: TransportCargoItem[] = [];

  for (const item of availableCargo.filter(candidate => candidate.kind !== 'container-crate')) {
    const quantity = Math.min(Math.floor(item.quantity / safeTripCount), remainingDirectSlots);
    if (quantity > 0) {
      result.push({ ...item, quantity });
      remainingDirectSlots -= quantity;
    }
  }

  let remainingCrateCapacity = remainingDirectSlots * 60;
  for (const item of availableCargo.filter(candidate => candidate.kind === 'container-crate')) {
    const quantity = Math.min(Math.floor(item.quantity / safeTripCount), remainingCrateCapacity);
    if (quantity > 0) {
      result.push({ ...item, quantity });
      remainingCrateCapacity -= quantity;
    }
  }

  return result;
}

// Additionne deux cargaisons item par item (utilisé pour cumuler le total réel d'une mission
// regroupant plusieurs voyages identiques).
export function mergeCargoTotals(base: TransportCargoItem[], addition: TransportCargoItem[]): TransportCargoItem[] {
  const merged = base.map(item => ({ ...item }));
  for (const item of addition) {
    const existing = merged.find(candidate => candidate.itemName === item.itemName && candidate.kind === item.kind);
    if (existing) existing.quantity += item.quantity;
    else merged.push({ ...item });
  }
  return merged;
}

export function suggestTransportMissions(
  availableCargo: TransportCargoItem[],
  mode: TransportMode,
  trainCars?: number
): TransportMission[] {
  const remaining = availableCargo.map(item => ({ ...item }));
  const missions: TransportMission[] = [];
  const capacity = transportSlotsPerTrip({ mode, tripCount: 1, trainCars, cargo: [] });
  // Référence du dernier voyage généré (une seule cargaison plafonnée à la capacité) : sert
  // uniquement à détecter des voyages identiques consécutifs, indépendamment du cumul total
  // stocké dans mission.cargo.
  let previousTripCargo: TransportCargoItem[] | null = null;

  while (remaining.some(item => item.quantity > 0)) {
    let remainingSlots = capacity;
    const cargo: TransportCargoItem[] = [];

    for (const item of remaining.filter(candidate => candidate.kind !== 'container-crate')) {
      const quantity = Math.min(item.quantity, remainingSlots);
      if (quantity === 0) continue;
      cargo.push({ ...item, quantity });
      item.quantity -= quantity;
      remainingSlots -= quantity;
    }

    let remainingCrateCapacity = remainingSlots * 60;
    for (const item of remaining.filter(candidate => candidate.kind === 'container-crate')) {
      const quantity = Math.min(item.quantity, remainingCrateCapacity);
      if (quantity === 0) continue;
      cargo.push({ ...item, quantity });
      item.quantity -= quantity;
      remainingCrateCapacity -= quantity;
    }

    if (cargo.length === 0) break;
    const previous = missions.at(-1);
    const sameAsPrevious = previousTripCargo !== null && JSON.stringify(previousTripCargo) === JSON.stringify(cargo);
    if (sameAsPrevious && previous) {
      previous.tripCount += 1;
      previous.cargo = mergeCargoTotals(previous.cargo, cargo);
    } else {
      missions.push({ mode, tripCount: 1, trainCars, cargo: cargo.map(item => ({ ...item })) });
    }
    previousTripCargo = cargo;
  }

  return missions;
}

export function transportSlotsPerTrip(mission: TransportMission): number {
  if (mission.mode === 'container') return Infinity;
  if (mission.mode === 'flatbed') return 1;
  if (mission.mode === 'freighter') return 5;
  return Math.min(14, Math.max(1, Math.floor(mission.trainCars ?? 1)));
}

/** Fill shared 60-crate containers in cargo order, preserving each item's exact quantity. */
export function packShippingContainers(cargo: readonly TransportCargoItem[]): Array<Array<{ itemName: string; quantity: number }>> {
  const bins: Array<Array<{ itemName: string; quantity: number }>> = [];
  let bin: Array<{ itemName: string; quantity: number }> = [];
  let space = 60;
  for (const item of cargo) {
    if (item.kind !== 'container-crate') continue;
    let remaining = item.quantity;
    while (remaining > 0) {
      if (space === 0) {
        bins.push(bin);
        bin = [];
        space = 60;
      }
      const take = Math.min(remaining, space);
      const existing = bin.find(entry => entry.itemName === item.itemName);
      if (existing) existing.quantity += take;
      else bin.push({ itemName: item.itemName, quantity: take });
      space -= take;
      remaining -= take;
    }
  }
  if (bin.length) bins.push(bin);
  return bins;
}

export function usedTransportSlots(mission: TransportMission): number {
  const containerCrates = mission.cargo
    .filter(item => item.kind === 'container-crate')
    .reduce((total, item) => total + item.quantity, 0);
  const directSlots = mission.cargo
    .filter(item => item.kind !== 'container-crate')
    .reduce((total, item) => total + item.quantity, 0);
  return Math.ceil(containerCrates / 60) + directSlots;
}

export function missionFits(mission: TransportMission): boolean {
  // mission.cargo représente le total (sur tous les voyages) : la capacité disponible se
  // compare donc à la capacité d'un voyage multipliée par le nombre de voyages.
  return usedTransportSlots(mission) <= transportSlotsPerTrip(mission) * Math.max(1, mission.tripCount);
}

function formatDate(date: Date): string {
  return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function formatCargoItem(item: TransportCargoItem): string {
  const state = item.kind === 'assembled' ? 'assembled ' : item.kind === 'direct-crate' ? 'crated ' : '';
  return `${item.quantity} ${state}${item.itemName}`;
}

function formatShippable(item: TransportCargoItem): string {
  return `${formatCargoItem({ ...item, quantity: 1 })} (x${item.quantity})`;
}

function joinCargo(items: string[]): string {
  return items.length < 3 ? items.join(' and ') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`;
}

function formatContainers(cargo: TransportCargoItem[]): string[] {
  const loads: Array<{ text: string; count: number }> = [];
  for (const bin of packShippingContainers(cargo)) {
    // (xN) stays reserved for 11eForge's task factor. Item quantities describe ONE container.
    const text = `Container of ${joinCargo(bin.map(item => formatCargoItem({ ...item, kind: 'container-crate' })))}`;
    const previous = loads.at(-1);
    if (previous?.text === text) previous.count++;
    else loads.push({ text, count: 1 });
  }
  return loads.map(load => `${load.text} (x${load.count})`);
}

function formatMission(mission: TransportMission): string {
  const cars = transportSlotsPerTrip(mission);
  const carrier = mission.mode === 'train'
    ? `One train (${cars} flatbed car${cars === 1 ? '' : 's'})`
    : `One ${mission.mode}`;
  // Planned cargo contains totals across all identical trips. Describe just ONE load;
  // 11eForge's final factor repeats that load, not the full cargo total.
  const cargoItems = mission.cargo.map(item => formatCargoItem({ ...item, quantity: item.quantity / mission.tripCount }));
  const cargo = joinCargo(cargoItems);
  const factor = mission.tripCount > 1 ? ` (x${mission.tripCount})` : '';
  return `${carrier} with ${cargo}${factor}`;
}

export function renderTransportList(list: TransportList): string {
  const lines = [
    `__**${list.title ?? 'TRANSPORT LIST'} -- ${formatDate(list.date)}**__`,
    'Quantities per load: crates, or units for assembled shippables.',
    '',
  ];
  for (const note of list.notes ?? []) lines.push(note);
  if (list.notes?.length) lines.push('');

  let missionIndex = 0;
  for (const route of list.routes) {
    lines.push(`__${route.source} -> ${route.destination}__`);
    for (const note of route.notes ?? []) lines.push(note);
    for (const mission of route.missions) {
      if (mission.mode === 'container') {
        const tasks = [
          ...formatContainers(mission.cargo),
          ...mission.cargo.filter(item => item.kind !== 'container-crate').map(formatShippable),
        ];
        for (const task of tasks) {
          const letter = String.fromCharCode(65 + (missionIndex % 26));
          lines.push(`${letter}-${task}`);
          missionIndex += 1;
        }
        continue;
      }
      // A manually scaled mission can end with a different, incomplete vehicle. Use the
      // same direct-slot / 60-crate packing order as the meter, grouping identical loads only.
      for (const load of suggestTransportMissions(mission.cargo, mission.mode, mission.trainCars)) {
        const letter = String.fromCharCode(65 + (missionIndex % 26));
        lines.push(`${letter}-${formatMission(load)}`);
        missionIndex += 1;
      }
    }
    lines.push('');
  }

  return lines.join('\n').trimEnd() + '\n';
}
