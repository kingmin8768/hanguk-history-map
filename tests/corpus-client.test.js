import test from 'node:test';
import assert from 'node:assert/strict';
import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';

const module = await import('../dist/corpus-client.js').catch(() => ({}));
const manifest = { schemaVersion: 1, recordCount: 3, dataset: { id: '15051036', title: '공식 연표', provider: '제공기관', landingUrl: 'https://example.org/dataset', license: { name: '공공누리 제1유형', url: 'https://example.org/license', attribution: '제공기관' } }, collections: [{ id: 'a', label: '자료', count: 3, fromYear: -57, toYear: 1446 }], coverage: { fromYear: -57, toYear: 1446 }, data: { path: 'records.json.gz', compression: 'gzip', sha256: 'fixture-sha256', byteLength: 123, uncompressedByteLength: 456 } };
const fixtureRecord = { id: 'first', year: 1446, originalDate: '1446-99-99', title: '훈민정음', body: '문자의 반포', collectionId: 'a', sourceUrl: 'https://example.org/original', originalMetadataUrl: 'https://example.org/metadata', calendar: 'lunar', precision: 'year', sourceRecordId: 'first' };

class ControlledWorker extends EventTarget {
  sent = [];
  terminated = false;
  postMessage(message) { this.sent.push(message); }
  terminate() { this.terminated = true; }
  reply(request, result) { this.dispatchEvent(Object.assign(new Event('message'), { data: { id: request.id, result } })); }
  reject(request, message, code = 'CORPUS_LOAD_FAILED') { this.dispatchEvent(Object.assign(new Event('message'), { data: { id: request.id, error: { message, code } } })); }
  crash() { this.dispatchEvent(Object.assign(new Event('error'), { message: 'Worker failed' })); }
}
const tick = () => new Promise(resolve => setImmediate(resolve));
async function until(condition) {
  const deadline = Date.now() + 1000;
  while (!condition() && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 1));
  assert.ok(condition(), 'asynchronous request became observable');
}
function bootstrapFixture(records = Array.from({ length: 50 }, (_, n) => ({ ...fixtureRecord, id: `boot-${n}`, sourceRecordId: String(n), year: 1000 + Math.floor(n / 3) }))) {
  const bytes = new TextEncoder().encode(JSON.stringify({ schemaVersion: 1, records }));
  const firstPage = { path: 'first-page.json', sha256: createHash('sha256').update(bytes).digest('hex'), byteLength: bytes.byteLength, limit: 50 };
  return { bytes, records, metadata: { ...manifest, recordCount: 123, firstPage } };
}
function setupBootstrap({ fixture = bootstrapFixture(), fetchPage, options = {} } = {}) {
  const fetched = [];
  const environment = setup({
    ...options,
    fetchResource: async (url, init) => {
      fetched.push({ url: String(url), init });
      if (new URL(url).pathname.endsWith('/manifest.json')) return new Response(JSON.stringify(fixture.metadata));
      return fetchPage ? fetchPage(url, init) : new Response(fixture.bytes);
    }
  });
  return { ...environment, fetched, fixture };
}
async function completeQuery(environment, pending, result = { items: [fixtureRecord], total: 123, offset: 0, limit: 50 }) {
  await until(() => environment.workers[0]?.sent.some(request => request.type === 'load'));
  const worker = environment.workers[0];
  worker.reply(worker.sent.find(request => request.type === 'load'), { recordCount: 123 });
  await until(() => worker.sent.some(request => request.type === 'query'));
  worker.reply(worker.sent.find(request => request.type === 'query'), result);
  return pending;
}
function setup(extra = {}) {
  assert.equal(typeof module.createCorpusStore, 'function');
  const workers = []; const fetched = [];
  const store = module.createCorpusStore({ fetchResource: async url => { fetched.push(String(url)); return { ok: true, json: async () => manifest }; }, workerFactory: () => { const worker = new ControlledWorker(); workers.push(worker); return worker; }, ...extra });
  return { store, workers, fetched };
}
async function ready(store, workers) {
  const pending = store.query({ q: 'first' });
  await tick();
  const worker = workers.at(-1);
  const load = worker.sent.find(item => item.type === 'load');
  assert.ok(load, 'query starts a worker load');
  worker.reply(load, { recordCount: 3 });
  await tick();
  const query = worker.sent.find(item => item.type === 'query');
  worker.reply(query, { items: [fixtureRecord], total: 1, offset: 0, limit: 50 });
  await pending;
  return worker;
}

test('manifest access is lazy and never starts a worker or fetches the compressed corpus', async () => {
  const { store, workers, fetched } = setup();
  const [first, second] = await Promise.all([store.getManifest(), store.getManifest()]);
  assert.equal(first, manifest);
  assert.equal(second, manifest);
  assert.equal(workers.length, 0);
  assert.equal(fetched.length, 1);
  assert.match(fetched[0], /\/corpus\/manifest\.json$/);
  store.dispose();
});

test('query loads a versioned local corpus and correlates out-of-order query and record responses', async () => {
  const { store, workers } = setup();
  const worker = await ready(store, workers);
  const dataUrl = new URL(worker.sent[0].payload.dataUrl);
  assert.match(dataUrl.pathname, /\/corpus\/records\.json\.gz$/);
  assert.equal(dataUrl.searchParams.get('v'), 'fixture-sha256');
  const older = store.query({ q: 'old', offset: 50 });
  const newer = store.query({ q: 'new' });
  const detail = store.getRecord('first');
  await tick();
  const oldRequest = worker.sent.find(item => item.type === 'query' && item.payload.q === 'old');
  const newRequest = worker.sent.find(item => item.type === 'query' && item.payload.q === 'new');
  const getRequest = worker.sent.find(item => item.type === 'get');
  worker.reply(newRequest, { items: [], total: 0, offset: 0, limit: 50 });
  worker.reply(getRequest, fixtureRecord);
  worker.reply(oldRequest, { items: [fixtureRecord], total: 51, offset: 50, limit: 50 });
  assert.equal((await newer).total, 0);
  assert.equal(await detail, fixtureRecord);
  assert.equal((await older).offset, 50);
  store.dispose();
});

test('failed data load rejects with the worker error and a later query retries', async () => {
  const { store, workers } = setup();
  const pending = store.query();
  const rejection = assert.rejects(pending, /압축 자료/);
  await tick();
  workers[0].reject(workers[0].sent[0], '압축 자료를 불러올 수 없습니다');
  await rejection;
  const again = store.query();
  await tick();
  const worker = workers.at(-1);
  const load = worker.sent.filter(item => item.type === 'load').at(-1);
  worker.reply(load, { recordCount: 3 });
  await tick();
  worker.reply(worker.sent.filter(item => item.type === 'query').at(-1), { items: [], total: 0, offset: 0, limit: 50 });
  assert.equal((await again).total, 0);
  store.dispose();
});

test('worker crashes reject all pending requests and allow a fresh worker on retry', async () => {
  const { store, workers } = setup();
  const worker = await ready(store, workers);
  const first = store.query({ q: 'one' });
  const second = store.getRecord('first');
  const rejected = Promise.all([assert.rejects(first, /Worker|작업/), assert.rejects(second, /Worker|작업/)]);
  await tick();
  worker.crash();
  await rejected;
  assert.equal(worker.terminated, true);
  await ready(store, workers);
  assert.equal(workers.length, 2);
  store.dispose();
});

test('dispose terminates the worker and rejects pending and future work', async () => {
  const { store, workers } = setup();
  const pending = store.query();
  const rejection = assert.rejects(pending, /종료|disposed/i);
  await tick();
  store.dispose();
  await rejection;
  assert.equal(workers[0].terminated, true);
  await assert.rejects(store.query(), /종료|disposed/i);
  await assert.rejects(store.getRecord('first'), /종료|disposed/i);
  await assert.rejects(store.locate({ id: 'first' }), /종료|disposed/i);
  await assert.rejects(store.distribution(), /종료|disposed/i);
  await assert.rejects(store.getManifest(), /종료|disposed/i);
});

test('locate routes only its target and filter context to the worker and correlates its reply', async () => {
  const { store, workers } = setup();
  const worker = await ready(store, workers);
  assert.equal(typeof store.locate, 'function');
  const pending = store.locate({ id: 'first', q: '문자', collection: 'a', sort: 'desc' });
  await tick();
  const request = worker.sent.find(item => item.type === 'locate');
  assert.deepEqual(request.payload, { id: 'first', q: '문자', collection: 'a', sort: 'desc' });
  worker.reply(request, { index: 9, total: 30, record: fixtureRecord });
  assert.deepEqual(await pending, { index: 9, total: 30, record: fixtureRecord });
  await store.dispose();
});

test('distribution lazily loads the worker and correlates filtered aggregate replies without requesting records', async () => {
  const { store, workers, fetched } = setup();
  assert.equal(typeof store.distribution, 'function');
  const filters = { q: '문자', collection: 'a', fromYear: -57, toYear: 1446, sort: 'desc' };
  const older = store.distribution(filters);
  await tick();
  const worker = workers[0];
  const load = worker.sent.find(request => request.type === 'load');
  worker.reply(load, { recordCount: 3 });
  await tick();
  const oldRequest = worker.sent.find(request => request.type === 'distribution');
  assert.deepEqual(oldRequest.payload, filters);
  const newer = store.distribution({ q: '빈 검색' });
  await tick();
  const newRequest = worker.sent.find(request => request.type === 'distribution' && request.id !== oldRequest.id);
  worker.reply(newRequest, { total: 0, years: [], undated: 0 });
  worker.reply(oldRequest, { total: 3, years: [{ year: -57, count: 1 }, { year: 1446, count: 2 }], undated: 0 });
  assert.deepEqual(await newer, { total: 0, years: [], undated: 0 });
  assert.deepEqual(await older, { total: 3, years: [{ year: -57, count: 1 }, { year: 1446, count: 2 }], undated: 0 });
  assert.deepEqual(worker.sent.map(request => request.type), ['load', 'distribution', 'distribution']);
  assert.equal(fetched.length, 1);
  await store.dispose();
});

test('a valid first page answers unfiltered startup with exact totals and effective limits without creating a worker', async () => {
  const environment = setupBootstrap();
  const { store, workers, fetched, fixture } = environment;
  const initial = store.query().catch(error => error);
  try {
    await tick();
    assert.equal(workers.length, 0);
    const result = await initial;
    assert.deepEqual([result.total, result.offset, result.limit, result.items.length], [123, 0, 50, 50]);
    assert.deepEqual(result.items, fixture.records);
    assert.deepEqual((await store.query({ limit: 7 })).items, fixture.records.slice(0, 7));
    const equivalent = await store.query({ q: '　 ', collection: '', fromYear: '', toYear: 0, offset: -9, limit: 0, sort: 'other' });
    assert.deepEqual([equivalent.total, equivalent.offset, equivalent.limit, equivalent.items.length], [123, 0, 1, 1]);
    assert.equal(fetched.length, 2);
    assert.equal(new URL(fetched[1].url).searchParams.get('v'), fixture.metadata.firstPage.sha256);
    assert.equal(workers.length, 0);
  } finally { await store.dispose(); }
});

test('search, collection, years, descending order, offsets and larger pages use exact worker queries', async () => {
  for (const options of [{ q: '문자' }, { collection: 'a' }, { fromYear: 1000 }, { toYear: 1400 }, { sort: 'desc' }, { offset: 1 }, { limit: 51 }]) {
    const environment = setupBootstrap();
    const pending = environment.store.query(options);
    try {
      await completeQuery(environment, pending);
      assert.deepEqual(environment.workers[0].sent.find(request => request.type === 'query').payload, options);
      assert.equal(environment.fetched.length, 1);
    } finally { await environment.store.dispose(); }
  }
});

test('bootstrap network, shape, byte length and integrity failures quietly fall back to the worker', async () => {
  for (const kind of ['network', 'shape', 'size', 'hash']) {
    const fixture = kind === 'shape' ? bootstrapFixture([fixtureRecord]) : bootstrapFixture();
    if (kind === 'size') fixture.metadata.firstPage.byteLength++;
    if (kind === 'hash') fixture.metadata.firstPage.sha256 = '0'.repeat(64);
    const environment = setupBootstrap({ fixture, fetchPage: kind === 'network' ? async () => { throw new Error('network unavailable'); } : undefined });
    const pending = environment.store.query();
    try {
      const result = await completeQuery(environment, pending);
      assert.deepEqual([result.total, result.items[0].id], [123, 'first']);
    } finally { await environment.store.dispose(); }
  }
});

test('a stalled first page is aborted and falls back while disposal rejects a pending bootstrap', async () => {
  let signal;
  const environment = setupBootstrap({ options: { bootstrapTimeoutMs: 10 }, fetchPage: async (_url, init) => { signal = init.signal; return new Promise(() => {}); } });
  const pending = environment.store.query();
  try {
    await completeQuery(environment, pending);
    assert.equal(signal?.aborted, true);
  } finally { await environment.store.dispose(); }

  const disposed = setupBootstrap({ fetchPage: async () => new Promise(() => {}) });
  const waiting = disposed.store.query().then(value => value, error => error);
  await until(() => disposed.fetched.length === 2);
  await disposed.store.dispose();
  assert.equal((await waiting).code, 'CORPUS_DISPOSED');
  assert.equal(disposed.workers.length, 0);
});

test('valid manifest year coverage answers default and year-only distributions without a worker', async () => {
  const metadata = { ...manifest, recordCount: 7, counts: { withoutParsedYear: 2 }, coverage: { years: [{ year: -57, count: 1 }, { year: 1000, count: 1 }, { year: 1446, count: 3 }] } };
  const { store, workers } = setup({ fetchResource: async () => new Response(JSON.stringify(metadata)) });
  const pending = store.distribution().catch(error => error);
  try {
    await tick();
    assert.equal(workers.length, 0);
    assert.deepEqual(await pending, { total: 7, years: metadata.coverage.years, undated: 2 });
    assert.deepEqual(await store.distribution({ fromYear: 1000, toYear: 1446, sort: 'desc' }), { total: 4, years: [{ year: 1000, count: 1 }, { year: 1446, count: 3 }], undated: 0 });
    assert.deepEqual(await store.distribution({ fromYear: 1500, toYear: 1400 }), { total: 0, years: [], undated: 0 });
    assert.equal(workers.length, 0);
  } finally { await store.dispose(); }
});

test('invalid coverage and text or collection filters still request worker distribution', async () => {
  for (const { filters, years } of [
    { filters: { q: '문자' }, years: [{ year: 1446, count: 3 }] },
    { filters: { collection: 'a' }, years: [{ year: 1446, count: 3 }] },
    { filters: {}, years: [{ year: 1446, count: 4 }] },
    { filters: {}, years: [{ year: null, count: 3 }] },
    { filters: {}, years: [{ year: 1446, count: 1 }, { year: 1446, count: 2 }] }
  ]) {
    const metadata = { ...manifest, coverage: { years } };
    const { store, workers } = setup({ fetchResource: async () => new Response(JSON.stringify(metadata)) });
    const pending = store.distribution(filters);
    try {
      await until(() => workers[0]?.sent.some(request => request.type === 'load'));
      const worker = workers[0];
      worker.reply(worker.sent[0], { recordCount: 3 });
      await until(() => worker.sent.some(request => request.type === 'distribution'));
      const request = worker.sent.find(request => request.type === 'distribution');
      assert.deepEqual(request.payload, filters);
      worker.reply(request, { total: 0, years: [], undated: 0 });
      assert.equal((await pending).total, 0);
    } finally { await store.dispose(); }
  }
});

test('a stalled worker load times out all waiting work and retry creates a fresh worker', async () => {
  const { store, workers } = setup({ loadTimeoutMs: 10 });
  const first = store.query().then(value => value, error => error);
  const second = store.getRecord('first').then(value => value, error => error);
  try {
    await new Promise(resolve => setTimeout(resolve, 30));
    assert.equal(workers[0].terminated, true);
    assert.equal((await first).code, 'CORPUS_LOAD_TIMEOUT');
    assert.equal((await second).code, 'CORPUS_LOAD_TIMEOUT');
    const retried = store.query();
    await tick();
    assert.equal(workers.length, 2);
    const worker = workers[1];
    worker.reply(worker.sent[0], { recordCount: 3 });
    await tick();
    worker.reply(worker.sent.find(request => request.type === 'query'), { items: [fixtureRecord], total: 1, offset: 0, limit: 50 });
    assert.equal((await retried).items[0].id, 'first');
  } finally { await store.dispose(); }
});

test('manifest network errors retry and unsupported workers return an actionable error', async () => {
  let attempts = 0;
  const { store } = setup({ fetchResource: async () => { attempts++; if (attempts === 1) throw new Error('Network unavailable'); return { ok: true, json: async () => manifest }; }, workerFactory: () => { throw new Error('이 브라우저는 Worker를 지원하지 않습니다. 최신 브라우저에서 다시 시도하세요.'); } });
  await assert.rejects(store.getManifest(), /Network/);
  assert.equal(await store.getManifest(), manifest);
  await assert.rejects(store.query(), /Worker.*브라우저/);
  store.dispose();
});

test('a missing browser Worker returns a readable error without fetching the full corpus', async () => {
  assert.equal(typeof module.createCorpusStore, 'function');
  const originalWorker = globalThis.Worker;
  globalThis.Worker = undefined;
  try {
    const store = module.createCorpusStore({ fetchResource: async () => ({ ok: true, json: async () => manifest }) });
    await assert.rejects(store.query(), error => error.code === 'CORPUS_WORKER_UNSUPPORTED' && /최신 브라우저/.test(error.message));
    await store.dispose();
  } finally { globalThis.Worker = originalWorker; }
});

test('dispose rejects a manifest fetch that has not completed', async () => {
  const { store } = setup({ fetchResource: () => new Promise(() => {}) });
  const pending = store.getManifest();
  const rejection = assert.rejects(pending, /종료|disposed/i);
  await store.dispose();
  await rejection;
});

test('real worker decompresses a gzip fixture, answers query/get, and retries after decompression failure', { timeout: 5000 }, async () => {
  const workerScope = new EventTarget();
  const replies = new Map();
  workerScope.postMessage = data => replies.get(data.id)?.(data);
  const originalSelf = globalThis.self;
  const originalFetch = globalThis.fetch;
  let attempts = 0;
  globalThis.self = workerScope;
  globalThis.fetch = async () => {
    attempts++;
    if (attempts === 1) return new Response('broken gzip');
    return new Response(gzipSync(JSON.stringify({ schemaVersion: 1, records: [fixtureRecord] })));
  };
  try {
    await import(`../dist/corpus-worker.js?fixture=${Date.now()}`);
    const request = (id, type, payload) => {
      const response = new Promise(resolve => replies.set(id, resolve));
      workerScope.dispatchEvent(Object.assign(new Event('message'), { data: { id, type, payload } }));
      return response;
    };
    assert.ok((await request(1, 'load', { dataUrl: 'https://example.org/fixture.gz', compression: 'gzip' })).error);
    assert.deepEqual((await request(2, 'load', { dataUrl: 'https://example.org/fixture.gz', compression: 'gzip' })).result, { recordCount: 1 });
    const result = (await request(3, 'query', { q: '문자 훈민정음' })).result;
    assert.equal(result.total, 1);
    assert.equal(result.items[0].originalDate, '1446-99-99');
    assert.equal((await request(4, 'get', { id: 'first' })).result.sourceUrl, fixtureRecord.sourceUrl);
    assert.equal((await request(5, 'get', { id: 'missing' })).result, null);
    const located = (await request(6, 'locate', { year: 1445 })).result;
    assert.deepEqual([located.index, located.total, located.record.id], [0, 1, 'first']);
    assert.deepEqual((await request(7, 'distribution', { q: '문자', collection: 'a', sort: 'desc' })).result, { total: 1, years: [{ year: 1446, count: 1 }], undated: 0 });
    assert.deepEqual((await request(8, 'distribution', { fromYear: 1500 })).result, { total: 0, years: [], undated: 0 });
  } finally {
    globalThis.self = originalSelf;
    globalThis.fetch = originalFetch;
  }
});

test('real worker reports missing decompression support and retries when support is available', { timeout: 5000 }, async () => {
  const workerScope = new EventTarget();
  const replies = new Map();
  workerScope.postMessage = data => replies.get(data.id)?.(data);
  const originalSelf = globalThis.self;
  const originalFetch = globalThis.fetch;
  const originalDecompression = globalThis.DecompressionStream;
  globalThis.self = workerScope;
  globalThis.fetch = async () => new Response(gzipSync(JSON.stringify({ schemaVersion: 1, records: [fixtureRecord] })));
  globalThis.DecompressionStream = undefined;
  try {
    await import(`../dist/corpus-worker.js?unsupported-fixture=${Date.now()}`);
    const request = (id, type, payload) => {
      const response = new Promise(resolve => replies.set(id, resolve));
      workerScope.dispatchEvent(Object.assign(new Event('message'), { data: { id, type, payload } }));
      return response;
    };
    const unsupported = await request(1, 'load', { dataUrl: 'https://example.org/fixture.gz', compression: 'gzip' });
    assert.equal(unsupported.error.code, 'CORPUS_DECOMPRESSION_UNSUPPORTED');
    assert.match(unsupported.error.message, /최신 브라우저/);
    globalThis.DecompressionStream = originalDecompression;
    assert.deepEqual((await request(2, 'load', { dataUrl: 'https://example.org/fixture.gz', compression: 'gzip' })).result, { recordCount: 1 });
  } finally {
    globalThis.self = originalSelf;
    globalThis.fetch = originalFetch;
    globalThis.DecompressionStream = originalDecompression;
  }
});
