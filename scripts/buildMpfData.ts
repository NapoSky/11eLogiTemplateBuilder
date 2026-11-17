/** Build compatible runtime projections offline from the accepted wiki snapshot. */
import { readFile, writeFile, access } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildWikiCatalog } from '../src/services/wikiCatalog.ts';
import { projectWikiData } from '../src/services/gameData.ts';
import { projectFacilitiesCatalog } from '../src/services/facilitiesCatalog.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const readJSON = async (path: string) => JSON.parse(await readFile(resolve(root, path), 'utf8'));
const [snapshot, legacyMapping, compatibility, legacyMpf] = await Promise.all([
  readJSON('scripts/data/wiki.snapshot.json'),
  readJSON('scripts/data/iconMapping.legacy.json'),
  readJSON('scripts/data/wiki.compatibility.json'),
  readJSON('scripts/data/mpf.legacy.json'),
]);
const catalog = buildWikiCatalog(snapshot, legacyMapping, compatibility.assetOverrides, compatibility.assetAnnotations);
const data = projectWikiData(catalog, legacyMapping, compatibility.aliases, legacyMpf, compatibility.iconVariants);
const facilities = projectFacilitiesCatalog(catalog, compatibility.iconVariants);
// Finish validation before writing any application data.
await Promise.all(catalog.assets.map(asset => access(resolve(root, 'public/assets/icons', asset.iconFilename))));
for (const [file, value] of [
  ['mpfData.json', data.mpfData], ['itemData.json', data.itemData],
  ['iconMapping.json', data.iconMapping],
  ['facilitiesData.json', facilities],
] as const) {
  await writeFile(resolve(root, 'public', file), `${JSON.stringify(value, null, 2)}\n`);
}
console.log(`[wikiData] ${data.mpfData.length} MPF entries; ${data.itemData.length} local assets; source ${catalog.capturedOn}`);
