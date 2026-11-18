import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { createCorpusIndex } from '../dist/corpus-query.js';
import { buildCityHistories } from '../dist/catalogue.js';
import { SNAPSHOTS } from '../dist/data.js';
import { PLACE_RECORD_LINKS } from '../dist/place-record-links.js';

const manifest = JSON.parse(await readFile(new URL('../dist/corpus/manifest.json', import.meta.url), 'utf8'));
const compressed = await readFile(new URL(`../dist/corpus/${manifest.data.path}`, import.meta.url));
const unpacked = gunzipSync(compressed);
const { records, schemaVersion } = JSON.parse(unpacked.toString('utf8'));

test('the deployed official corpus matches its reproducible manifest and licensed source', () => {
  assert.equal(schemaVersion, 1);
  assert.equal(records.length, manifest.recordCount);
  assert.ok(records.length > 200_000);
  assert.equal(compressed.length, manifest.data.byteLength);
  assert.equal(unpacked.length, manifest.data.uncompressedByteLength);
  assert.equal(createHash('sha256').update(compressed).digest('hex'), manifest.data.sha256);
  assert.equal(manifest.dataset.id, '15051036');
  assert.match(manifest.dataset.license.name, /1/);
  assert.match(manifest.dataset.license.attribution, /국사편찬위원회/);
});

test('the lightweight initial page exactly matches the full corpus query in the default order', async () => {
  const { path, sha256, byteLength, limit } = manifest.firstPage;
  const fastPage = await readFile(new URL(`../dist/corpus/${path}`, import.meta.url));
  assert.equal(fastPage.length, byteLength);
  assert.equal(createHash('sha256').update(fastPage).digest('hex'), sha256);
  const page = JSON.parse(fastPage);
  assert.equal(page.schemaVersion, manifest.schemaVersion);
  assert.deepEqual(page.records, createCorpusIndex(records).query({ limit }).items);
});

test('all imported entries retain stable IDs, original dates and current official source URLs', () => {
  const ids = new Set();
  const collections = new Set(manifest.collections.map(collection => collection.id));
  for (const record of records) {
    assert.ok(!ids.has(record.id), `duplicate record ${record.id}`);
    ids.add(record.id);
    assert.ok(record.sourceRecordId && record.title && record.originalDate, record.id);
    assert.equal(typeof record.body, 'string');
    assert.ok(record.year === null || Number.isInteger(record.year) && record.year !== 0, record.id);
    assert.ok(['lunar', 'unspecified'].includes(record.calendar), record.id);
    assert.ok(['day', 'month', 'year', 'unknown'].includes(record.precision), record.id);
    assert.ok(collections.has(record.collectionId), record.id);
    const url = new URL(record.sourceUrl);
    assert.equal(url.protocol, 'https:');
    assert.equal(url.hostname, 'db.history.go.kr');
    assert.ok(record.sourceLinkType === 'collection' ? url.pathname === '/diachronic/level.do' && url.searchParams.get('itemId') === 'tcmd' : url.pathname.startsWith('/id/'), record.id);
  }
  assert.equal(manifest.collections.reduce((total, collection) => total + collection.count, 0), records.length);
});

test('same-year records and date uncertainty survive corpus normalization', () => {
  assert.ok(records.filter(record => record.year === 1945).length > 100);
  assert.ok(records.some(record => record.year < 0));
  assert.ok(records.some(record => record.calendar === 'lunar' && /L\d+/.test(record.originalDate)));
  assert.ok(records.some(record => record.precision === 'year' && record.originalDate.includes('99')));
  assert.ok(records.some(record => record.precision === 'month' && record.originalDate.includes('99')));
  assert.ok(records.some(record => record.year === 782 && record.originalDate.endsWith('L10')));
});

test('the city reader links to real official records and preserves the supplied titles and years', () => {
  const cities = new Set(buildCityHistories(SNAPSHOTS).map(city => city.id));
  const expected = new Map();
  for (const [city, links] of Object.entries(PLACE_RECORD_LINKS)) {
    assert.ok(cities.has(city), city);
    assert.equal(new Set(links.map(link => link.recordId)).size, links.length);
    for (const link of links) {
      assert.ok(link.note.trim(), link.recordId);
      if (!expected.has(link.recordId)) expected.set(link.recordId, []);
      expected.get(link.recordId).push(link);
    }
  }
  assert.ok(expected.size > 0);
  for (const record of records) {
    const links = expected.get(record.id);
    if (!links) continue;
    for (const link of links) {
      assert.equal(link.year, record.year, record.id);
      assert.equal(link.title, record.title, record.id);
    }
    expected.delete(record.id);
  }
  assert.deepEqual([...expected.keys()], []);
});

test('retired modern-history article IDs point to the official collection without impersonating a current article', () => {
  const retired = records.find(record => record.sourceRecordId === 'tc_md_1905_04_01_0030');
  assert.ok(retired);
  assert.equal(retired.sourceLinkType, 'collection');
  assert.equal(retired.sourceUrl, 'https://db.history.go.kr/diachronic/level.do?itemId=tcmd');
  assert.equal(retired.originalDate, '1905-04-01');
  for (const record of records) if (record.collectionId === 'tcmd') {
    assert.equal(record.sourceLinkType, 'collection');
    assert.equal(record.sourceUrl, 'https://db.history.go.kr/diachronic/level.do?itemId=tcmd');
  }
});
