import { createCorpusIndex } from './corpus-query.js';

// No records or normalized search fields cross into the UI until a page is requested.
const scope = globalThis.self;
let corpus = null;
let loadPromise = null;
let recordCount = 0;

function failure(message, code) { return Object.assign(new Error(message), { code }); }

async function load({ dataUrl, compression } = {}) {
  if (corpus) return { recordCount };
  if (!loadPromise) {
    loadPromise = (async () => {
      if (compression !== 'gzip' || typeof globalThis.DecompressionStream !== 'function') {
        throw failure('이 브라우저는 압축 자료 검색을 지원하지 않습니다. 최신 브라우저에서 다시 시도하세요.', 'CORPUS_DECOMPRESSION_UNSUPPORTED');
      }
      const response = await fetch(dataUrl);
      if (!response.ok) throw failure(`압축 자료를 불러오지 못했습니다 (${response.status}). 다시 시도하세요.`, 'CORPUS_LOAD_FAILED');
      let data;
      try {
        const stream = response.body.pipeThrough(new DecompressionStream('gzip'));
        data = JSON.parse(await new Response(stream).text());
      } catch (error) {
        throw failure('압축 자료를 읽지 못했습니다. 새로고침하거나 다시 시도하세요.', 'CORPUS_DECOMPRESSION_FAILED');
      }
      if (data?.schemaVersion !== 1 || !Array.isArray(data.records)) {
        throw failure('지원하지 않는 연표 자료입니다. 새로고침한 뒤 다시 시도하세요.', 'CORPUS_DATA_INVALID');
      }
      recordCount = data.records.length;
      corpus = createCorpusIndex(data.records);
      return { recordCount };
    })().catch(error => { loadPromise = null; throw error; });
  }
  return loadPromise;
}

scope.addEventListener('message', async event => {
  const { id, type, payload } = event.data ?? {};
  try {
    let result;
    if (type === 'load') result = await load(payload);
    else {
      if (loadPromise) await loadPromise;
      if (!corpus) throw failure('자료를 먼저 불러온 뒤 다시 시도하세요.', 'CORPUS_NOT_READY');
      if (type === 'query') result = corpus.query(payload);
      else if (type === 'distribution') result = corpus.distribution(payload);
      else if (type === 'locate') result = corpus.locate(payload);
      else if (type === 'get') result = corpus.getRecord(payload?.id);
      else throw failure('지원하지 않는 자료 검색 요청입니다.', 'CORPUS_REQUEST_INVALID');
    }
    scope.postMessage({ id, result });
  } catch (error) {
    scope.postMessage({ id, error: { message: error.message || '자료 검색에 실패했습니다. 다시 시도하세요.', code: error.code || 'CORPUS_WORKER_FAILED' } });
  }
});
