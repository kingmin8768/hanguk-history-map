const manifestUrl = new URL('./corpus/manifest.json', import.meta.url);
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
export function createCorpusStore({ fetchResource = (...args) => globalThis.fetch(...args), workerFactory = defaultWorkerFactory } = {}) {
  let manifestPromise = null;
  let worker = null;
  let loadPromise = null;
  let nextId = 1;
  let disposed = false;
  const pending = new Map();
  let rejectDisposal;
  const disposal = new Promise((_, reject) => { rejectDisposal = reject; });
  disposal.catch(() => {});
  const disposedError = () => corpusError('자료 검색이 종료되었습니다 (disposed).', 'CORPUS_DISPOSED');
  const assertActive = () => { if (disposed) throw disposedError(); };

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

  function request(target, type, payload) {
    assertActive();
    const id = nextId++;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      try { target.postMessage({ id, type, payload }); }
      catch (error) { pending.delete(id); reject(error); }
    });
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
      worker = null;
      loadPromise = null;
      target.terminate();
      for (const waiting of pending.values()) waiting.reject(error);
      pending.clear();
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
      loadPromise = request(target, 'load', { dataUrl: dataUrl.href, compression: manifest.data.compression }).catch(error => {
        if (worker === target) loadPromise = null;
        throw error;
      });
    }
    await loadPromise;
    assertActive();
    return worker;
  }

  return {
    getManifest,
    async query(options = {}) { return request(await ensureLoaded(), 'query', options); },
    async getRecord(id) { return request(await ensureLoaded(), 'get', { id }); },
    async dispose() {
      if (disposed) return;
      disposed = true;
      const error = disposedError();
      rejectDisposal(error);
      worker?.terminate();
      worker = null;
      loadPromise = null;
      for (const waiting of pending.values()) waiting.reject(error);
      pending.clear();
    }
  };
}
