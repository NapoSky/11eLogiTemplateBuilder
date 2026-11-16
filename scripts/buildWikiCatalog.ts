/** Offline preview only. Existing application datasets are not overwritten. */
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildWikiCatalog } from '../src/services/wikiCatalog.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
if (args.length > 1 || args[0]?.startsWith('-')) {
  throw new Error('Usage: node scripts/buildWikiCatalog.ts [output-directory]');
}
const outputDirectory = args[0] ? resolve(args[0]) : resolve(root, 'data/wiki-preview');
if ([resolve(root, 'public'), resolve(root, 'scripts/data')].some(path =>
  outputDirectory === path || outputDirectory.startsWith(`${path}/`))) {
  throw new Error('Preview output must not overwrite application data or source snapshots');
}

const readJSON = async (path: string) => JSON.parse(await readFile(path, 'utf8'));
const snapshot = await readJSON(resolve(root, 'scripts/data/wiki.snapshot.json'));
const mapping: Record<string, string> = await readJSON(resolve(root, 'scripts/data/iconMapping.legacy.json'));
const compatibility = await readJSON(resolve(root, 'scripts/data/wiki.compatibility.json'));
const catalog = buildWikiCatalog(snapshot, mapping, compatibility.assetOverrides, compatibility.assetAnnotations);
await Promise.all(catalog.assets.map(asset => access(resolve(root, 'public/assets/icons', asset.iconFilename))));
const items = new Map(catalog.items.map(item => [item.sourceKey, item]));
const summary = {
  schemaVersion: 1,
  capturedOn: catalog.capturedOn,
  previewOnly: true,
  quantityPolicy: {
    templateTargets: 'crates',
    stockpileInput: 'preserve crates and assembled units separately',
    legacyDocuments: 'retain historical calculations until explicit migration',
    bundledWardenTemplate: 'explicit crate representation may be added during migration',
    stockpileConversionImplemented: true,
    assembledUnitsContributeToTargets: true,
  },
  counts: {
    items: catalog.items.length,
    mpfRecipes: catalog.items.filter(item => item.mpf).length,
    factoryRecipes: catalog.items.filter(item => item.factory).length,
    otherProductionRecipes: catalog.items.reduce((total, item) => total + item.production.length, 0),
    assets: catalog.assets.length,
    matchedAssets: catalog.assets.filter(asset => asset.itemSourceKey).length,
    unresolvedAssets: catalog.assets.filter(asset => asset.match === 'unresolved').length,
    ambiguousAssets: catalog.assets.filter(asset => asset.match === 'ambiguous').length,
    genericAssets: catalog.assets.filter(asset => asset.match === 'generic').length,
    retiredAssets: catalog.assets.filter(asset => asset.match === 'retired').length,
  },
  // Candidates for review: differing strings include harmless punctuation changes.
  labelDifferences: catalog.assets.flatMap(asset => {
    const item = asset.itemSourceKey ? items.get(asset.itemSourceKey) : null;
    return item && item.name !== asset.legacyDisplayName
      ? [{ iconFilename: asset.iconFilename, currentLabel: asset.legacyDisplayName, wikiLabel: item.name, codename: item.codename }]
      : [];
  }),
  unresolvedAssets: catalog.assets.filter(asset => asset.match === 'unresolved' || asset.match === 'ambiguous'),
  annotatedAssets: catalog.assets.filter(asset => asset.annotation),
  iconVariants: compatibility.iconVariants ?? {},
};
await mkdir(outputDirectory, { recursive: true });
await writeFile(resolve(outputDirectory, 'catalog.json'), `${JSON.stringify(catalog, null, 2)}\n`);
await writeFile(resolve(outputDirectory, 'comparison.json'), `${JSON.stringify(summary, null, 2)}\n`);
console.log(JSON.stringify({ outputDirectory, ...summary.counts }, null, 2));
