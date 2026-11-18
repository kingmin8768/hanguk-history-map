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
    byId.set(record.id, index);
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

  function matchingIndices({ q = '', collection = 'all', fromYear = null, toYear = null, sort = 'asc' } = {}) {
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
    return matches;
  }

  return {
    query({ offset = 0, limit = 50, ...filters } = {}) {
      const matches = matchingIndices(filters);
      const pageSize = Math.min(100, Math.max(1, pageNumber(limit, 50)));
      const total = matches.length;
      const lastPage = total ? Math.floor((total - 1) / pageSize) * pageSize : 0;
      const start = Math.max(0, Math.min(pageNumber(offset, 0), lastPage));
      const items = matches.slice(start, start + pageSize).map(index => records[index]);
      return { items, total, offset: start, limit: pageSize };
    },
    distribution(filters = {}) {
      const matches = matchingIndices(filters);
      const counts = new Map();
      let undated = 0;
      for (let position = 0; position < matches.length; position++) {
        const year = years[matches[position]];
        if (year === null) undated++;
        else counts.set(year, (counts.get(year) ?? 0) + 1);
      }
      const bins = Array.from(counts, ([year, count]) => ({ year, count })).sort((a, b) => a.year - b.year);
      return { total: matches.length, years: bins, undated };
    },
    locate({ id, year, ...filters } = {}) {
      const matches = matchingIndices(filters);
      let position = -1;
      if (id !== undefined && id !== null) {
        const sourceIndex = byId.get(id);
        if (sourceIndex === undefined) return null;
        position = matches.indexOf(sourceIndex);
      } else {
        const target = yearBound(year);
        if (target === null) return null;
        let closestDistance = Infinity;
        let closestYear = Infinity;
        for (let index = 0; index < matches.length; index++) {
          const candidate = years[matches[index]];
          if (candidate === null) continue;
          const distance = Math.abs(candidate - target);
          if (distance < closestDistance || distance === closestDistance && candidate < closestYear) {
            position = index;
            closestDistance = distance;
            closestYear = candidate;
          }
        }
      }
      return position < 0 ? null : { index: position, total: matches.length, record: records[matches[position]] };
    },
    getRecord(id) {
      const index = byId.get(id);
      return index === undefined ? null : records[index];
    }
  };
}
