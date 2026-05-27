import { readFileSync } from 'fs';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

const icon = JSON.parse(readFileSync(resolve(root, 'public/iconMapping.json'), 'utf-8'));
const cat = JSON.parse(readFileSync(resolve(root, 'public/categoryMapping.json'), 'utf-8'));

const inCat = new Set();
for (const [catName, val] of Object.entries(cat)) {
  if (catName.startsWith('_')) continue;
  if (val && val.items) val.items.forEach(i => inCat.add(i));
}

const inIcon = new Set(Object.keys(icon).filter(k => !k.startsWith('_')));

const missingInCat = [...inIcon].filter(k => !inCat.has(k));
const missingInIcon = [...inCat].filter(k => !inIcon.has(k));

console.log('=== Dans iconMapping MAIS PAS dans categoryMapping ===');
missingInCat.forEach(k => console.log(`  ${k}  ->  ${icon[k]}`));

console.log('');
console.log('=== Dans categoryMapping MAIS PAS dans iconMapping ===');
missingInIcon.forEach(k => console.log(`  ${k}`));
