import { access, readFile, stat, readdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { SNAPSHOTS, SOURCES, FIGURES, POLITIES } from '../dist/data.js';

const root = resolve(import.meta.dirname, '../dist');
for (const path of ['index.html', 'app.js', 'model.js', 'data.js', 'assemble.js', 'catalogue.js', 'explorer.js', 'styles.css', 'assets/favicon.svg', 'assets/land.geojson']) {
  await access(resolve(root, path));
  if (!(await stat(resolve(root, path))).size) throw new Error(`Empty asset: ${path}`);
}
const geography = JSON.parse(await readFile(resolve(root, 'assets/land.geojson'), 'utf8'));
if (geography.type !== 'FeatureCollection' || !geography.features.length) throw new Error('Missing coastline');
const html = await readFile(resolve(root, 'index.html'), 'utf8');
for (const match of html.matchAll(/(?:src|href)="(\.\/[^"]+)"/g)) await access(resolve(root, match[1]));
for (const source of SOURCES) if (new URL(source.url).protocol !== 'https:') throw new Error(`Non-HTTPS source: ${source.id}`);
const corpus = JSON.parse(await readFile(resolve(root, 'corpus/manifest.json'), 'utf8'));
if (corpus.schemaVersion !== 1 || corpus.recordCount < 200_000 || corpus.dataset.id !== '15051036') throw new Error('Missing official chronology corpus');
const corpusData = resolve(root, 'corpus', corpus.data.path);
await access(corpusData);
if ((await stat(corpusData)).size !== corpus.data.byteLength) throw new Error('Corpus archive size does not match its manifest');
async function inspectModules(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) { await inspectModules(path); continue; }
    if (!entry.name.endsWith('.js')) continue;
    const parsed = spawnSync(process.execPath, ['--check', path], { encoding: 'utf8' });
    if (parsed.status !== 0) throw new Error(parsed.stderr || `Invalid JavaScript: ${path}`);
    const source = await readFile(path, 'utf8');
    for (const match of source.matchAll(/\b(?:import|export)\s+(?:[^'";]+?\s+from\s+)?['"]([^'"]+)['"]/g)) {
      if (!match[1].startsWith('.')) throw new Error(`Unexpected runtime module dependency in ${entry.name}: ${match[1]}`);
      await access(resolve(dirname(path), match[1]));
    }
  }
}
await inspectModules(root);
console.log(`Static build ready: ${corpus.recordCount.toLocaleString('en')} official records, ${SNAPSHOTS.length} map scenes, ${FIGURES.length} people, ${POLITIES.length} profiles, ${SOURCES.length} curated sources.`);
