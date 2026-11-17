function normalizeText(value) {
  const original = String(value ?? '');
  const normalized = original.normalize('NFKC').toLowerCase();
  // Most Korean bodies need no changes: retain their existing string storage.
  return normalized === original ? original : normalized;
}
const knownYear = value => Number.isInteger(value) && value !== 0 ? value : null;
function yearBound(value) {
  if (value === null || value === undefined || value === '') return null;
  return knownYear(Number(value));
}
function pageNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.trunc(number) : fallback;
}

/** Index original metadata once; never infer dates, locations, or subjects. */
export function createCorpusIndex(records) {
  if (!Array.isArray(records)) throw new TypeError('연표 기록 배열이 필요합니다.');
  const byId = new Map();
  const years = new Array(records.length);
  const searchTitles = new Array(records.length);
  const searchBodies = new Array(records.length);
  const searchDates = new Array(records.length);
  const ascending = Array.from({ length: records.length }, (_, index) => {
    const record = records[index];
    years[index] = knownYear(record.year);
    byId.set(record.id, record);
    return index;
  });
  const compare = direction => (left, right) => {
    const a = years[left]; const b = years[right];
    if (a === null) return b === null ? left - right : 1;
    if (b === null) return -1;
    return direction * (a - b) || left - right;
  };
  ascending.sort(compare(1));
  const descending = ascending.slice().sort(compare(-1));
  let cachedKey = null;
  let cachedMatches = null;

  return {
    query({ q = '', collection = 'all', fromYear = null, toYear = null, offset = 0, limit = 50, sort = 'asc' } = {}) {
      const terms = normalizeText(q).trim().split(/\s+/u).filter(Boolean);
      const from = yearBound(fromYear); const to = yearBound(toYear);
      const order = sort === 'desc' ? descending : ascending;
      const collectionId = collection || 'all';
      const key = JSON.stringify([terms, collectionId, from, to, sort === 'desc']);
      let matches;
      if (key === cachedKey) {
        matches = cachedMatches;
      } else if (!terms.length && collectionId === 'all' && from === null && to === null) {
        matches = order;
      } else {
        matches = [];
        for (let position = 0; position < order.length; position++) {
          const index = order[position];
          const record = records[index];
          if (collectionId !== 'all' && record.collectionId !== collectionId) continue;
          const year = years[index];
          if ((from !== null || to !== null) && year === null) continue;
          if (from !== null && year < from || to !== null && year > to) continue;
          if (terms.length) {
            // Separate fields avoid retaining a second concatenated copy of every body.
            const title = searchTitles[index] ??= normalizeText(record.title);
            const body = searchBodies[index] ??= normalizeText(record.body);
            const date = searchDates[index] ??= normalizeText(record.originalDate);
            let matched = true;
            for (let termIndex = 0; termIndex < terms.length; termIndex++) {
              const term = terms[termIndex];
              if (!title.includes(term) && !body.includes(term) && !date.includes(term)) {
                matched = false;
                break;
              }
            }
            if (!matched) continue;
          }
          matches.push(index);
        }
      }
      cachedKey = key;
      cachedMatches = matches;
      const pageSize = Math.min(100, Math.max(1, pageNumber(limit, 50)));
      const total = matches.length;
      const lastPage = total ? Math.floor((total - 1) / pageSize) * pageSize : 0;
      const start = Math.max(0, Math.min(pageNumber(offset, 0), lastPage));
      const items = matches.slice(start, start + pageSize).map(index => records[index]);
      return { items, total, offset: start, limit: pageSize };
    },
    getRecord(id) { return byId.get(id) ?? null; }
  };
}
