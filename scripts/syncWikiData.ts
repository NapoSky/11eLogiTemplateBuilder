import { readFile, writeFile, rename, access } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { collectWikiSnapshot, semanticWikiSnapshot } from '../src/services/wikiSource.ts';
import { buildWikiCatalog } from '../src/services/wikiCatalog.ts';
import { projectWikiData } from '../src/services/gameData.ts';

const args = process.argv.slice(2);
if (args.length && (args.length !== 1 || args[0] !== '--check')) throw new Error('Usage: syncWikiData.ts [--check]');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const readJSON = async (path: string) => JSON.parse(await readFile(resolve(root, path), 'utf8'));
const [previous, mapping, compatibility, legacyMpf] = await Promise.all([
  readJSON('scripts/data/wiki.snapshot.json'), readJSON('scripts/data/iconMapping.legacy.json'),
  readJSON('scripts/data/wiki.compatibility.json'), readJSON('scripts/data/mpf.legacy.json'),
]);
const collected = await collectWikiSnapshot();
const catalog = buildWikiCatalog(collected, mapping, compatibility.assetOverrides, compatibility.assetAnnotations);
const projection = projectWikiData(catalog, mapping, compatibility.aliases, legacyMpf, compatibility.iconVariants);
const oldCatalog = buildWikiCatalog(previous, mapping, compatibility.assetOverrides, compatibility.assetAnnotations);
const oldMpfCount = oldCatalog.items.filter(item => item.mpf).length;
if (projection.mpfData.length < oldMpfCount) throw new Error('MPF references disappeared; inspect the change before accepting this snapshot.');
for (const table of ['itemdata', 'vehicles', 'structures', 'Production'] as const) {
  if (collected.tables[table].length < previous.tables[table].length * 0.9) throw new Error(`Suspicious row loss in ${table}`);
}
await Promise.all(catalog.assets.map(asset => access(resolve(root, 'public/assets/icons', asset.iconFilename))));
const changed = semanticWikiSnapshot(previous) !== semanticWikiSnapshot(collected);
console.log(JSON.stringify({ changed, checkOnly: args.includes('--check'), mpf: projection.mpfData.length,
  tables: Object.fromEntries(Object.entries(collected.tables).map(([table, rows]) => [table, rows.length])) }, null, 2));
if (changed && !args.includes('--check')) {
  const path = resolve(root, 'scripts/data/wiki.snapshot.json');
  const accepted = { ...collected, collectedAt: new Date().toISOString(),
    semanticSha256: createHash('sha256').update(semanticWikiSnapshot(collected)).digest('hex') };
  await writeFile(`${path}.tmp`, `${JSON.stringify(accepted, null, 2)}\n`);
  await rename(`${path}.tmp`, path);
}
