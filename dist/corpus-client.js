const manifestUrl = new URL('./corpus/manifest.json', import.meta.url);
const maxBootstrapBytes = 2 * 1024 * 1024;
const yearBound = value => {
  const year = Number(value);
  return Number.isInteger(year) && year !== 0 ? year : null;
};
const pageNumber = (value, fallback) => Number.isFinite(Number(value)) ? Math.trunc(Number(value)) : fallback;
const unfiltered = filters => !String(filters.q ?? '').normalize('NFKC').trim() && !(filters.collection && filters.collection !== 'all');
function firstPageLimit(filters) {
  const limit = Math.min(100, Math.max(1, pageNumber(filters.limit === undefined ? 50 : filters.limit, 50)));
  return unfiltered(filters) && yearBound(filters.fromYear) === null && yearBound(filters.toYear) === null && filters.sort !== 'desc' && Math.max(0, pageNumber(filters.offset ?? 0, 0)) === 0 && limit <= 50 ? limit : null;
}
function manifestDistribution(manifest, filters) {
  const years = manifest.coverage?.years;
  if (!unfiltered(filters) || !Array.isArray(years) || !Number.isSafeInteger(manifest.recordCount) || manifest.recordCount < 0) return null;
  const seen = new Set();
  let dated = 0;
  for (const bin of years) {
    if (!bin || !Number.isInteger(bin.year) || bin.year === 0 || !Number.isSafeInteger(bin.count) || bin.count <= 0 || seen.has(bin.year)) return null;
    seen.add(bin.year);
    dated += bin.count;
    if (dated > manifest.recordCount) return null;
  }
  const unknown = manifest.recordCount - dated;
  if (manifest.counts?.withoutParsedYear !== undefined && manifest.counts.withoutParsedYear !== unknown) return null;
  const from = yearBound(filters.fromYear); const to = yearBound(filters.toYear);
  const bins = years.filter(bin => (from === null || bin.year >= from) && (to === null || bin.year <= to)).map(bin => ({ year: bin.year, count: bin.count })).sort((a, b) => a.year - b.year);
  const undated = from === null && to === null ? unknown : 0;
  return { total: bins.reduce((total, bin) => total + bin.count, undated), years: bins, undated };
}
function corpusError(message, code) {
  return Object.assign(new Error(message), { code });
}
function defaultWorkerFactory(url, options) {
  if (typeof globalThis.Worker !== 'function') {
    throw corpusError('이 브라우저는 자료 검색 작업(Worker)을 지원하지 않습니다. 최신 브라우저에서 다시 시도하세요.', 'CORPUS_WORKER_UNSUPPORTED');
  }
  return new Worker(url, options);
}

/** The main UI only reads the manifest; the worker owns the compressed corpus. */
export function createCorpusStore({ fetchResource = (...args) => globalThis.fetch(...args), workerFactory = defaultWorkerFactory, loadTimeoutMs = 45000, bootstrapTimeoutMs = 5000 } = {}) {
  let manifestPromise = null;
  let worker = null;
  let loadPromise = null;
  let nextId = 1;
  let disposed = false;
  let loadTimer = null;
  let bootstrapPromise = null;
  let bootstrapController = null;
  let bootstrapTimer = null;
  let cancelBootstrap = null;
  const pending = new Map();
  let rejectDisposal;
  const disposal = new Promise((_, reject) => { rejectDisposal = reject; });
  disposal.catch(() => {});
  const disposedError = () => corpusError('자료 검색이 종료되었습니다 (disposed).', 'CORPUS_DISPOSED');
  const assertActive = () => { if (disposed) throw disposedError(); };
  const timeout = (value, fallback) => Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : fallback;

  async function getManifest() {
    assertActive();
    if (!manifestPromise) {
      manifestPromise = Promise.race([
        (async () => {
          const response = await fetchResource(manifestUrl);
          if (!response.ok) throw corpusError(`자료 목록을 불러오지 못했습니다 (${response.status ?? 'network'}). 다시 시도하세요.`, 'CORPUS_MANIFEST_FAILED');
          const manifest = await response.json();
          if (manifest?.schemaVersion !== 1 || !manifest.data?.path || !manifest.data?.sha256 || manifest.data.compression !== 'gzip') {
            throw corpusError('지원하지 않는 자료 목록입니다. 새로고침한 뒤 다시 시도하세요.', 'CORPUS_MANIFEST_INVALID');
          }
          assertActive();
          return manifest;
        })(),
        disposal
      ]).catch(error => { manifestPromise = null; throw error; });
    }
    return manifestPromise;
  }

  async function readFirstPage(manifest, signal) {
    const metadata = manifest.firstPage;
    if (!metadata || typeof metadata.path !== 'string' || !metadata.path || !/^[a-f0-9]{64}$/i.test(metadata.sha256) || metadata.limit !== 50 || !Number.isSafeInteger(metadata.byteLength) || metadata.byteLength <= 0 || metadata.byteLength > maxBootstrapBytes || !Number.isSafeInteger(manifest.recordCount) || manifest.recordCount < 0) return null;
    const url = new URL(metadata.path, manifestUrl);
    if (url.origin !== manifestUrl.origin || url.protocol !== manifestUrl.protocol) return null;
    url.searchParams.set('v', metadata.sha256);
    const response = await fetchResource(url, { signal });
    if (!response.ok || Number(response.headers?.get('content-length')) > maxBootstrapBytes) return null;
    let bytes;
    if (response.body?.getReader) {
      const reader = response.body.getReader();
      const chunks = [];
      let length = 0;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          length += value.byteLength;
          if (length > metadata.byteLength || length > maxBootstrapBytes) { await reader.cancel(); return null; }
          chunks.push(value);
        }
      } finally { reader.releaseLock(); }
      if (length !== metadata.byteLength) return null;
      bytes = new Uint8Array(length);
      let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    } else {
      if (typeof response.arrayBuffer !== 'function') return null;
      bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.byteLength !== metadata.byteLength) return null;
    }
    if (globalThis.crypto?.subtle) {
      const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
      const hash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
      if (hash !== metadata.sha256.toLowerCase()) return null;
    }
    const data = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    if (data?.schemaVersion !== 1 || !Array.isArray(data.records) || data.records.length !== Math.min(manifest.recordCount, 50)) return null;
    const ids = new Set();
    let lastYear = -Infinity;
    let undated = false;
    for (const record of data.records) {
      if (!record || typeof record !== 'object' || Array.isArray(record) || typeof record.id !== 'string' || !record.id || ids.has(record.id) || !['title', 'body', 'originalDate', 'collectionId', 'sourceUrl', 'originalMetadataUrl', 'sourceRecordId'].every(field => typeof record[field] === 'string') || !['lunar', 'unspecified'].includes(record.calendar) || !['day', 'month', 'year', 'unknown'].includes(record.precision)) return null;
      ids.add(record.id);
      if (record.year === null) undated = true;
      else {
        if (yearBound(record.year) !== record.year || undated || record.year < lastYear) return null;
        lastYear = record.year;
      }
    }
    return data.records;
  }

  async function firstPage(manifest) {
    if (!manifest.firstPage) return null;
    if (!bootstrapPromise) {
      bootstrapController = typeof AbortController === 'function' ? new AbortController() : null;
      const deadline = new Promise((_, reject) => {
        cancelBootstrap = reject;
        bootstrapTimer = setTimeout(() => {
          bootstrapController?.abort();
          reject(corpusError('초기 기록 요청의 응답 시간이 초과되었습니다.', 'CORPUS_BOOTSTRAP_TIMEOUT'));
        }, timeout(bootstrapTimeoutMs, 5000));
      });
      bootstrapPromise = Promise.race([readFirstPage(manifest, bootstrapController?.signal), deadline]).catch(() => null).finally(() => {
        clearTimeout(bootstrapTimer);
        bootstrapTimer = null;
        bootstrapController = null;
        cancelBootstrap = null;
      });
    }
    const records = await Promise.race([bootstrapPromise, disposal]);
    assertActive();
    return records;
  }

  function request(target, type, payload) {
    assertActive();
    const id = nextId++;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      try { target.postMessage({ id, type, payload }); }
      catch (error) { pending.delete(id); reject(error); }
    });
  }

  function stopWorker(target, error) {
    if (worker !== target) return;
    clearTimeout(loadTimer);
    loadTimer = null;
    worker = null;
    loadPromise = null;
    target.terminate();
    for (const waiting of pending.values()) waiting.reject(error);
    pending.clear();
  }

  function startWorker() {
    const target = workerFactory(new URL('./corpus-worker.js', import.meta.url), { type: 'module' });
    const receive = event => {
      if (worker !== target) return;
      const message = event.data;
      const waiting = pending.get(message?.id);
      if (!waiting) return;
      pending.delete(message.id);
      if (message.error) {
        const detail = message.error;
        waiting.reject(corpusError(typeof detail === 'string' ? detail : detail.message || '자료 검색에 실패했습니다. 다시 시도하세요.', detail.code || 'CORPUS_WORKER_FAILED'));
      } else waiting.resolve(message.result);
    };
    const fail = event => {
      if (worker !== target) return;
      const error = corpusError(`자료 검색 작업(Worker)이 중단되었습니다. 다시 시도하세요.${event.message ? ` ${event.message}` : ''}`, 'CORPUS_WORKER_FAILED');
      stopWorker(target, error);
    };
    if (typeof target.addEventListener === 'function') {
      target.addEventListener('message', receive);
      target.addEventListener('error', fail);
      target.addEventListener('messageerror', fail);
    } else {
      target.onmessage = receive;
      target.onerror = fail;
      target.onmessageerror = fail;
    }
    worker = target;
    return target;
  }

  async function ensureLoaded() {
    const manifest = await getManifest();
    assertActive();
    if (!loadPromise) {
      const target = worker || startWorker();
      const dataUrl = new URL(manifest.data.path, manifestUrl);
      dataUrl.searchParams.set('v', manifest.data.sha256);
      loadPromise = request(target, 'load', { dataUrl: dataUrl.href, compression: manifest.data.compression }).then(result => {
        if (worker === target) { clearTimeout(loadTimer); loadTimer = null; }
        return result;
      }).catch(error => {
        if (worker === target) { clearTimeout(loadTimer); loadTimer = null; loadPromise = null; }
        throw error;
      });
      loadTimer = setTimeout(() => stopWorker(target, corpusError('자료를 불러오는 작업의 응답 시간이 초과되었습니다. 다시 시도하세요.', 'CORPUS_LOAD_TIMEOUT')), timeout(loadTimeoutMs, 45000));
    }
    await loadPromise;
    assertActive();
    return worker;
  }

  return {
    getManifest,
    async query(options = {}) {
      const manifest = await getManifest();
      const limit = firstPageLimit(options);
      if (limit !== null) {
        const records = await firstPage(manifest);
        if (records) return { items: records.slice(0, limit).map(record => ({ ...record })), total: manifest.recordCount, offset: 0, limit };
      }
      return request(await ensureLoaded(), 'query', options);
    },
    async distribution(filters = {}) {
      const manifest = await getManifest();
      const result = manifestDistribution(manifest, filters);
      assertActive();
      return result ?? request(await ensureLoaded(), 'distribution', filters);
    },
    async locate(options = {}) { return request(await ensureLoaded(), 'locate', options); },
    async getRecord(id) { return request(await ensureLoaded(), 'get', { id }); },
    async dispose() {
      if (disposed) return;
      disposed = true;
      const error = disposedError();
      rejectDisposal(error);
      clearTimeout(loadTimer);
      loadTimer = null;
      clearTimeout(bootstrapTimer);
      bootstrapController?.abort();
      cancelBootstrap?.(error);
      worker?.terminate();
      worker = null;
      loadPromise = null;
      for (const waiting of pending.values()) waiting.reject(error);
      pending.clear();
    }
  };
}
