import { access, readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { SNAPSHOTS, SOURCES } from '../dist/data.js';

const root = resolve(import.meta.dirname, '../dist');
for (const path of ['index.html', 'app.js', 'model.js', 'data.js', 'styles.css', 'assets/favicon.svg', 'assets/land.geojson']) {
  await access(resolve(root, path));
  if (!(await stat(resolve(root, path))).size) throw new Error(`Empty asset: ${path}`);
}
const geography = JSON.parse(await readFile(resolve(root, 'assets/land.geojson'), 'utf8'));
if (geography.type !== 'FeatureCollection' || !geography.features.length) throw new Error('Missing coastline');
const html = await readFile(resolve(root, 'index.html'), 'utf8');
for (const match of html.matchAll(/(?:src|href)="(\.\/[^"]+)"/g)) await access(resolve(root, match[1]));
for (const source of SOURCES) if (new URL(source.url).protocol !== 'https:') throw new Error(`Non-HTTPS source: ${source.id}`);
console.log(`Static build ready: ${SNAPSHOTS.length} snapshots, ${SOURCES.length} sources, ${geography.features.length} geographic features.`);
