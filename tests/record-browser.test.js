import test from 'node:test';
import assert from 'node:assert/strict';
import { createCorpusIndex } from '../dist/corpus-query.js';

const module = await import('../dist/record-browser.js').catch(() => ({}));
const defaultFilters = { q: '', collection: 'all', fromYear: null, toYear: null, sort: 'asc' };
const records = Array.from({ length: 123 }, (_, n) => ({ id: `record-${n}`, year: 1000 + Math.floor(n / 3), originalDate: `${1000 + Math.floor(n / 3)}-99-99`, title: `기록 ${n}`, body: n === 122 ? '매우 드문 끝 기록' : '공통 본문', collectionId: n % 2 ? 'b' : 'a', sourceUrl: 'https://example.org/original', originalMetadataUrl: 'https://example.org/metadata', calendar: 'lunar', precision: 'year', sourceRecordId: String(n) }));
const manifest = { schemaVersion: 1, recordCount: 123, dataset: { title: '공식 기록', license: { name: '제1유형' } }, collections: [{ id: 'a', label: '가', count: 62 }, { id: 'b', label: '나', count: 61 }] };
const tick = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve; let reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };

function setup(overrides = {}, options = {}) {
  assert.equal(typeof module.createRecordBrowser, 'function');
  const model = createCorpusIndex(records);
  const calls = { manifests: 0, query: [], locate: [], disposed: 0 };
  const changes = [];
  const corpus = {
    async getManifest() { calls.manifests++; return manifest; },
    async query(filters) { calls.query.push({ ...filters }); return model.query(filters); },
    async locate(filters) { calls.locate.push({ ...filters }); return model.locate(filters); },
    async dispose() { calls.disposed++; },
    ...overrides
  };
  const browser = module.createRecordBrowser({ corpus, onChange: state => changes.push(state), ...options });
  return { browser, calls, changes, model, corpus };
}

test('initialization selects the first original row and cached moves preserve distinct same-year records', async () => {
  const { browser, calls } = setup();
  assert.equal(browser.state.status, 'idle');
  const first = await browser.init();
  assert.deepEqual([first.status, first.index, first.total, first.record.id], ['ready', 0, 123, 'record-0']);
  const second = await browser.next();
  assert.deepEqual([second.index, second.record.id, second.record.year], [1, 'record-1', 1000]);
  assert.equal((await browser.previous()).record.id, 'record-0');
  assert.equal(calls.query.length, 1);
  assert.equal(calls.query[0].limit, 50);
  assert.equal(calls.manifests, 1);
});

test('page boundaries fetch once, indices clamp, and last/empty navigation stays safe', async () => {
  const { browser, calls } = setup();
  await browser.init();
  await browser.goTo(49);
  assert.equal((await browser.next()).record.id, 'record-50');
  assert.equal(calls.query.length, 2);
  assert.equal(calls.query[1].offset, 50);
  assert.equal((await browser.next()).record.id, 'record-51');
  assert.equal(calls.query.length, 2);
  assert.equal((await browser.goTo(99999)).index, 122);
  assert.equal((await browser.next()).index, 122);
  assert.equal((await browser.goTo(-5)).index, 0);
  assert.equal((await browser.goTo(NaN)).index, 0);
  const empty = await browser.setFilters({ q: '일치하지않음' });
  assert.deepEqual([empty.status, empty.record, empty.index, empty.total], ['ready', null, 0, 0]);
  assert.equal((await browser.next()).record, null);
});

test('filters reset to the first result and state snapshots cannot mutate internal selection or provenance', async () => {
  const { browser } = setup();
  await browser.init();
  await browser.goTo(70);
  const filtered = await browser.setFilters({ collection: 'b', fromYear: 1001, toYear: 1003, sort: 'desc' });
  assert.deepEqual([filtered.index, filtered.total, filtered.record.id], [0, 5, 'record-9']);
  filtered.filters.q = 'tampered'; filtered.record.title = 'tampered'; filtered.manifest.dataset.license.name = 'tampered';
  const later = browser.state;
  assert.equal(later.filters.q, '');
  assert.equal(later.record.title, '기록 9');
  assert.equal(later.manifest.dataset.license.name, '제1유형');
  const impossible = await browser.setFilters({ fromYear: 1500, toYear: 1400 });
  assert.deepEqual([impossible.status, impossible.total, impossible.record], ['ready', 0, null]);
});

test('openRecord locates the exact requested row using defaults plus a fresh supplied context', async () => {
  const { browser, calls } = setup();
  await browser.setFilters({ q: '끝', collection: 'a', fromYear: 1040, sort: 'desc' });
  const opened = await browser.openRecord('record-51');
  assert.deepEqual(opened.filters, defaultFilters);
  assert.deepEqual([opened.index, opened.record.id], [51, 'record-51']);
  const supplied = await browser.openRecord('record-51', { collection: 'b', sort: 'desc' });
  assert.equal(supplied.record.id, 'record-51');
  assert.equal(supplied.filters.q, '');
  assert.equal(supplied.filters.fromYear, null);
  assert.equal(calls.locate.at(-1).collection, 'b');
  assert.equal(supplied.record.originalDate, '1017-99-99');
  assert.equal((await browser.openRecord('missing')).status, 'error');
});

test('year seek keeps sorting and selects the first row of the nearest dated year while rejecting zero', async () => {
  const { browser, calls } = setup();
  await browser.setFilters({ collection: 'all', sort: 'desc' });
  const nearest = await browser.seekYear(1017);
  assert.deepEqual([nearest.record.id, nearest.index, nearest.filters.sort], ['record-51', 69, 'desc']);
  const invalid = await browser.seekYear(0);
  assert.equal(invalid.status, 'error');
  assert.match(invalid.error.message, /0|연도/);
  assert.equal(calls.locate.length, 1);
  assert.equal((await browser.seekYear(1017)).status, 'ready');
});

test('rapid next intents accumulate across an asynchronous page boundary and reuse its pending page', async () => {
  let delayed;
  const { browser, calls, model, corpus } = setup();
  const originalQuery = corpus.query;
  corpus.query = async filters => {
    if (filters.offset === 50) {
      calls.query.push({ ...filters }); delayed ??= deferred();
      return delayed.promise;
    }
    return originalQuery(filters);
  };
  await browser.init(); await browser.goTo(49);
  const first = browser.next(); const second = browser.next();
  await tick();
  assert.equal(calls.query.filter(query => query.offset === 50).length, 1);
  delayed.resolve(model.query({ offset: 50 }));
  await Promise.all([first, second]);
  assert.deepEqual([browser.state.index, browser.state.record.id], [51, 'record-51']);
});

test('a filter changed while initial loading wins over the older manifest and result work', async () => {
  const waiting = deferred();
  const { browser, calls } = setup({ getManifest: () => waiting.promise });
  const initial = browser.init();
  const latest = browser.setFilters({ q: '드문' });
  waiting.resolve(manifest);
  await Promise.all([initial, latest]);
  assert.equal(browser.state.record.id, 'record-122');
  assert.equal(browser.state.total, 1);
  assert.equal(calls.query.length, 1);
  assert.equal(calls.query[0].q, '드문');
});

test('a late page response cannot overwrite a newer selection or its cached page', async () => {
  const waiting = deferred();
  const { browser, model, corpus, calls } = setup();
  const originalQuery = corpus.query;
  corpus.query = filters => filters.offset === 50 ? waiting.promise : originalQuery(filters);
  await browser.init();
  const old = browser.goTo(50);
  await tick();
  await browser.goTo(100);
  waiting.resolve(model.query({ offset: 50 }));
  await old;
  assert.equal(browser.state.record.id, 'record-100');
  const queryCount = calls.query.length;
  assert.equal((await browser.next()).record.id, 'record-101');
  assert.equal(calls.query.length, queryCount);
});

test('manifest and page errors are retryable through init and do not poison pending page caches', async () => {
  let failManifest = true; let failQuery = true;
  const model = createCorpusIndex(records);
  const { browser } = setup({
    async getManifest() { if (failManifest) { failManifest = false; throw new Error('manifest failed'); } return manifest; },
    async query(filters) { if (failQuery) { failQuery = false; throw new Error('page failed'); } return model.query(filters); }
  });
  assert.equal((await browser.init()).error.message, 'manifest failed');
  assert.equal((await browser.init()).error.message, 'page failed');
  assert.equal((await browser.init()).record.id, 'record-0');
});

test('retry after an openRecord lookup error preserves the requested URL record and its filter context', async () => {
  let failed = false;
  const { browser, corpus } = setup();
  const originalLocate = corpus.locate;
  corpus.locate = async filters => {
    if (!failed) { failed = true; throw new Error('lookup failed'); }
    return originalLocate(filters);
  };
  assert.equal((await browser.openRecord('record-51', { collection: 'b' })).status, 'error');
  const retried = await browser.init();
  assert.deepEqual([retried.status, retried.record.id, retried.filters.collection], ['ready', 'record-51', 'b']);
});

test('a late record lookup cannot override newly selected filters and zero-year filters never reach the corpus', async () => {
  const waiting = deferred();
  const { browser, calls, model } = setup({ locate: () => waiting.promise });
  const opening = browser.openRecord('record-51');
  await tick();
  await browser.setFilters({ q: '드문' });
  waiting.resolve(model.locate({ id: 'record-51' }));
  await opening;
  assert.equal(browser.state.record.id, 'record-122');
  const queryCount = calls.query.length;
  const invalid = await browser.setFilters({ fromYear: 0 });
  assert.equal(invalid.status, 'error');
  assert.equal(invalid.filters.fromYear, null);
  assert.equal(calls.query.length, queryCount);
});

test('disposal ignores pending responses and leaves shared corpus lifetime to the root', async () => {
  const waiting = deferred();
  const { browser, changes, calls, model } = setup({ query: () => waiting.promise });
  const pending = browser.init();
  await tick();
  await browser.dispose();
  const count = changes.length;
  waiting.resolve(model.query());
  await pending;
  assert.equal(changes.length, count);
  assert.equal(calls.disposed, 0);
  assert.equal((await browser.next()).status, browser.state.status);
});
