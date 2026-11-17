const defaults = Object.freeze({ q: '', collection: 'all', fromYear: null, toYear: null, sort: 'asc' });

function copy(value) {
  if (Array.isArray(value)) return value.map(copy);
  if (value instanceof Error) {
    const error = new Error(value.message);
    error.name = value.name;
    if (value.code !== undefined) error.code = value.code;
    return error;
  }
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, copy(item)]));
  return value;
}
function parseYear(value) {
  if (value === null || value === undefined || value === '') return null;
  const year = Number(value);
  if (!Number.isInteger(year) || year === 0) throw new RangeError('연도는 0이 아닌 정수로 입력하세요.');
  return year;
}
function normalizeFilters(filters) {
  return {
    q: String(filters.q ?? ''),
    collection: String(filters.collection || 'all'),
    fromYear: parseYear(filters.fromYear),
    toYear: parseYear(filters.toYear),
    sort: filters.sort === 'desc' ? 'desc' : 'asc'
  };
}

/** Owns one page and navigation intent; the root owns the shared corpus lifetime. */
export function createRecordBrowser({ corpus, onChange = () => {}, pageSize = 50 }) {
  const number = Number(pageSize);
  const size = Number.isFinite(number) ? Math.min(100, Math.max(1, Math.trunc(number))) : 50;
  const state = { status: 'idle', manifest: null, record: null, index: 0, total: 0, filters: { ...defaults }, error: null };
  let disposed = false;
  let generation = 0;
  let intentIndex = 0;
  let totalKnown = false;
  let manifestPromise = null;
  let manifest = null;
  let cache = null;
  let retryTarget = null;
  const pendingPages = new Map();
  const snapshot = () => copy(state);
  const active = version => !disposed && generation === version;
  const filtersKey = filters => JSON.stringify(filters);
  const publish = () => { onChange(snapshot()); return snapshot(); };

  function fail(version, error) {
    if (active(version)) {
      state.status = 'error';
      state.error = error instanceof Error ? error : new Error(String(error));
      publish();
    }
    return snapshot();
  }
  function start() {
    const version = ++generation;
    state.status = 'loading';
    state.error = null;
    publish();
    return version;
  }
  async function getManifest(version) {
    if (!manifest) {
      if (!manifestPromise) {
        manifestPromise = Promise.resolve().then(() => corpus.getManifest()).then(value => {
          manifest = value;
          return value;
        }).catch(error => { manifestPromise = null; throw error; });
      }
      await manifestPromise;
    }
    if (active(version) && state.manifest !== manifest) {
      state.manifest = manifest;
      publish();
    }
    return manifest;
  }
  function page(filters, offset) {
    const key = `${filtersKey(filters)}:${offset}`;
    if (!pendingPages.has(key)) {
      const pending = Promise.resolve().then(() => corpus.query({ ...filters, offset, limit: size })).finally(() => {
        if (pendingPages.get(key) === pending) pendingPages.delete(key);
      });
      pendingPages.set(key, pending);
    }
    return pendingPages.get(key);
  }
  function normalizedIndex(value) {
    const number = Number(value);
    const index = Number.isFinite(number) ? Math.max(0, Math.trunc(number)) : number === Infinity && totalKnown ? Math.max(0, state.total - 1) : 0;
    return totalKnown ? Math.min(index, Math.max(0, state.total - 1)) : index;
  }
  function usePage(result, target, filters) {
    cache = { ...result, key: filtersKey(filters) };
    state.total = result.total;
    totalKnown = true;
    intentIndex = Math.min(target, Math.max(0, result.total - 1));
    state.index = intentIndex;
    state.record = result.total ? result.items[intentIndex - result.offset] ?? null : null;
    state.status = 'ready';
    state.error = null;
    return publish();
  }
  async function select(target, version, filters) {
    try {
      if (cache?.key === filtersKey(filters) && (cache.total === 0 || target >= cache.offset && target < cache.offset + cache.items.length)) {
        if (active(version)) return usePage(cache, target, filters);
        return snapshot();
      }
      await getManifest(version);
      if (!active(version)) return snapshot();
      const result = await page(filters, Math.floor(target / size) * size);
      if (!active(version)) return snapshot();
      return usePage(result, target, filters);
    } catch (error) { return fail(version, error); }
  }
  function resetContext(filters) {
    state.filters = filters;
    state.record = null;
    state.index = 0;
    state.total = 0;
    totalKnown = false;
    intentIndex = 0;
  }
  async function goTo(index) {
    if (disposed) return snapshot();
    retryTarget = null;
    intentIndex = normalizedIndex(index);
    const target = intentIndex;
    const version = start();
    return select(target, version, { ...state.filters });
  }
  async function locate(target, filters, version) {
    try {
      await getManifest(version);
      if (!active(version)) return snapshot();
      const located = await corpus.locate({ ...filters, ...target });
      if (!active(version)) return snapshot();
      if (!located) throw new Error(target.id !== undefined ? '현재 조건에서 해당 기록을 찾을 수 없습니다.' : '현재 조건에서 연도를 확인할 수 있는 기록이 없습니다.');
      intentIndex = located.index;
      state.total = located.total;
      totalKnown = true;
      return select(located.index, version, filters);
    } catch (error) { return fail(version, error); }
  }

  return {
    get state() { return snapshot(); },
    async init() {
      if (disposed) return snapshot();
      return state.status === 'error' && retryTarget ? locate(retryTarget, { ...state.filters }, start()) : goTo(intentIndex);
    },
    goTo,
    async next() { return disposed ? snapshot() : goTo(intentIndex + 1); },
    async previous() { return disposed ? snapshot() : goTo(intentIndex - 1); },
    async setFilters(partial = {}) {
      if (disposed) return snapshot();
      retryTarget = null;
      let filters;
      try { filters = normalizeFilters({ ...state.filters, ...partial }); }
      catch (error) { return fail(++generation, error); }
      resetContext(filters);
      return goTo(0);
    },
    async seekYear(value) {
      if (disposed) return snapshot();
      retryTarget = null;
      let year;
      try { year = parseYear(value); if (year === null) throw new RangeError('이동할 연도를 입력하세요.'); }
      catch (error) { return fail(++generation, error); }
      const filters = { ...state.filters };
      retryTarget = { year };
      return locate(retryTarget, filters, start());
    },
    async openRecord(id, suppliedFilters = {}) {
      if (disposed) return snapshot();
      retryTarget = null;
      let filters;
      try { filters = normalizeFilters({ ...defaults, ...suppliedFilters }); }
      catch (error) { return fail(++generation, error); }
      resetContext(filters);
      retryTarget = { id };
      return locate(retryTarget, filters, start());
    },
    async dispose() {
      disposed = true;
      generation++;
      pendingPages.clear();
      cache = null;
      return snapshot();
    }
  };
}
