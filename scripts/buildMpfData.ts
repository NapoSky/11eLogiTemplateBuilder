/**
 * Build script: génère public/mpfData.json en croisant :
 *  - public/iconMapping.json (filename -> displayName)
 *  - foxhole.json (https://foxholelogi.com/assets/foxhole.json) ou un snapshot local
 *
 * Usage: `npm run build:mpf`
 *
 * Matching: displayName (iconMapping) === itemName (foxhole.json),
 * insensible à la casse, normalisation des apostrophes/guillemets typographiques.
 */

import { readFile, writeFile, access } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');
const ICON_MAPPING_PATH = resolve(repoRoot, 'public/iconMapping.json');
const SNAPSHOT_PATH = resolve(repoRoot, 'scripts/foxhole.snapshot.json');
const OUT_PATH = resolve(repoRoot, 'public/mpfData.json');
const FOXHOLE_URL = 'https://foxholelogi.com/assets/foxhole.json';

type Faction = 'neutral' | 'colonial' | 'warden';
type ItemCategory =
  | 'small_arms'
  | 'heavy_arms'
  | 'heavy_ammunition'
  | 'vehicles'
  | 'shipables'
  | 'uniforms'
  | 'supplies';

interface FoxholeItem {
  faction: Faction[];
  imgName?: string;
  itemName: string;
  itemCategory: string;
  numberProduced: number;
  isMpfCraftable?: boolean;
  craftLocation?: string[];
  cost?: { bmat?: number; rmat?: number; emat?: number; hemat?: number };
  numberProducedBonus?: string;
}

interface MpfDataEntry {
  iconFilename: string;
  itemName: string;
  itemCategory: ItemCategory;
  faction: Faction[];
  cost: { bmat?: number; rmat?: number; emat?: number; hemat?: number };
  numberProduced: number;
  crateBonus?: number;
  maxCrates: 9 | 5;
}

const MPF_CATEGORIES: ItemCategory[] = [
  'small_arms',
  'heavy_arms',
  'heavy_ammunition',
  'vehicles',
  'shipables',
  'uniforms',
  'supplies',
];

function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Aggressive normalization for fuzzy matching: strip all punctuation,
 * keep only alphanumerics + spaces, collapse spaces.
 */
function looseNormalize(s: string): string {
  return normalizeName(s)
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function fetchFoxholeData(): Promise<FoxholeItem[]> {
  // Try snapshot first, fall back to network
  try {
    await access(SNAPSHOT_PATH);
    console.log(`[mpfData] Using local snapshot ${SNAPSHOT_PATH}`);
    const raw = await readFile(SNAPSHOT_PATH, 'utf-8');
    return JSON.parse(raw);
  } catch {
    console.log(`[mpfData] No snapshot, fetching ${FOXHOLE_URL}`);
    const res = await fetch(FOXHOLE_URL);
    if (!res.ok) throw new Error(`Failed to fetch foxhole.json: ${res.status}`);
    const data = (await res.json()) as FoxholeItem[];
    // Save snapshot for reproducibility
    await writeFile(SNAPSHOT_PATH, JSON.stringify(data, null, 2), 'utf-8');
    console.log(`[mpfData] Snapshot saved to ${SNAPSHOT_PATH}`);
    return data;
  }
}

async function main() {
  const iconMappingRaw = await readFile(ICON_MAPPING_PATH, 'utf-8');
  const iconMapping: Record<string, string> = JSON.parse(iconMappingRaw);

  // Build reverse lookup: normalized displayName -> filename(s)
  const nameToFilenames = new Map<string, string[]>();
  // Also keep an array for prefix/substring fallback matching
  const allEntries: { filename: string; normalized: string; loose: string; raw: string }[] = [];
  for (const [filename, displayName] of Object.entries(iconMapping)) {
    const key = normalizeName(displayName);
    const arr = nameToFilenames.get(key) ?? [];
    arr.push(filename);
    nameToFilenames.set(key, arr);
    allEntries.push({
      filename,
      normalized: key,
      loose: looseNormalize(displayName),
      raw: displayName,
    });
  }

  /**
   * Find the best icon filename for a given foxhole itemName.
   * Strategy:
   *  1. exact normalized match
   *  2. icon displayName starts with itemName (e.g. "T3 \"Xiphos\" Armoured Car" matches "T3 \"Xiphos\"")
   *  3. icon displayName contains itemName as substring (normalized)
   *  4. loose normalization (strip all punctuation): icon contains foxhole name
   * Among candidates of fallback steps, prefer the shortest displayName (closest to base name).
   */
  function findIconFor(itemName: string): { candidates: string[]; ambiguous: boolean } {
    const key = normalizeName(itemName);
    // 1. Exact
    const exact = nameToFilenames.get(key);
    if (exact && exact.length > 0) {
      return { candidates: exact, ambiguous: exact.length > 1 };
    }
    // 2. Prefix
    const prefix = allEntries.filter(e => e.normalized.startsWith(key + ' ') || e.normalized === key);
    if (prefix.length > 0) {
      prefix.sort((a, b) => a.normalized.length - b.normalized.length);
      const top = prefix[0];
      const tied = prefix.filter(p => p.normalized.length === top.normalized.length);
      return { candidates: tied.map(t => t.filename), ambiguous: tied.length > 1 };
    }
    // 3. Substring (normalized)
    const sub = allEntries.filter(e => e.normalized.includes(key));
    if (sub.length > 0) {
      sub.sort((a, b) => a.normalized.length - b.normalized.length);
      const top = sub[0];
      const tied = sub.filter(p => p.normalized.length === top.normalized.length);
      return { candidates: tied.map(t => t.filename), ambiguous: tied.length > 1 };
    }
    // 4. Loose normalization (strip all punctuation)
    const looseKey = looseNormalize(itemName);
    if (looseKey.length === 0) return { candidates: [], ambiguous: false };
    const loose = allEntries.filter(e => e.loose === looseKey || e.loose.includes(looseKey));
    if (loose.length > 0) {
      loose.sort((a, b) => a.loose.length - b.loose.length);
      const top = loose[0];
      const tied = loose.filter(p => p.loose.length === top.loose.length);
      return { candidates: tied.map(t => t.filename), ambiguous: tied.length > 1 };
    }
    return { candidates: [], ambiguous: false };
  }

  const foxholeData = await fetchFoxholeData();

  const entries: MpfDataEntry[] = [];
  const orphanItems: string[] = [];
  const ambiguousItems: string[] = [];

  for (const item of foxholeData) {
    if (!item.isMpfCraftable) continue;
    if (!item.craftLocation?.includes('mpf')) continue;
    if (!MPF_CATEGORIES.includes(item.itemCategory as ItemCategory)) {
      // Skip items in categories we don't handle (shouldn't happen normally)
      continue;
    }

    const key = normalizeName(item.itemName);
    const { candidates, ambiguous } = findIconFor(item.itemName);

    if (!candidates || candidates.length === 0) {
      orphanItems.push(item.itemName);
      continue;
    }
    if (ambiguous) {
      ambiguousItems.push(`${item.itemName} -> [${candidates.join(', ')}]`);
    }

    const iconFilename = candidates[0]; // Take first match for ambiguous
    const cat = item.itemCategory as ItemCategory;
    const maxCrates: 9 | 5 = (cat === 'vehicles' || cat === 'shipables') ? 5 : 9;
    const crateBonus = item.numberProducedBonus?.includes('2x') ? 2 : undefined;

    entries.push({
      iconFilename,
      itemName: item.itemName,
      itemCategory: cat,
      faction: item.faction,
      cost: item.cost ?? {},
      numberProduced: item.numberProduced,
      ...(crateBonus ? { crateBonus } : {}),
      maxCrates,
    });
  }

  // Sort by category then name for stable output
  entries.sort((a, b) => {
    const catCmp = a.itemCategory.localeCompare(b.itemCategory);
    return catCmp !== 0 ? catCmp : a.itemName.localeCompare(b.itemName);
  });

  await writeFile(OUT_PATH, JSON.stringify(entries, null, 2), 'utf-8');

  console.log(`[mpfData] Wrote ${entries.length} entries to ${OUT_PATH}`);
  if (orphanItems.length) {
    console.warn(`[mpfData] ${orphanItems.length} foxhole MPF items without icon match:`);
    for (const n of orphanItems) console.warn(`  - ${n}`);
  }
  if (ambiguousItems.length) {
    console.warn(`[mpfData] ${ambiguousItems.length} ambiguous matches (took first):`);
    for (const n of ambiguousItems) console.warn(`  - ${n}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
