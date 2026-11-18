import test from 'node:test';
import assert from 'node:assert/strict';

const module = await import('../dist/corpus-query.js').catch(() => ({}));
const record = (id, year, extra = {}) => ({ id, year, originalDate: `${year ?? '미상'}년`, title: id, body: '', collectionId: 'a', sourceUrl: 'https://example.org/original', originalMetadataUrl: 'https://example.org/metadata', calendar: 'unspecified', precision: year === null ? 'unknown' : 'year', sourceRecordId: id, ...extra });
function index(records) {
  assert.equal(typeof module.createCorpusIndex, 'function');
  return module.createCorpusIndex(records);
}

test('chronology preserves separate same-year rows and their metadata order in either direction', () => {
  const records = [record('later-a', 1446), record('early', -57), record('later-b', 1446), record('middle', 1000)];
  const corpus = index(records);
  assert.deepEqual(corpus.query().items.map(item => item.id), ['early', 'middle', 'later-a', 'later-b']);
  assert.deepEqual(corpus.query({ sort: 'desc' }).items.map(item => item.id), ['later-a', 'later-b', 'middle', 'early']);
  assert.deepEqual(records.map(item => item.id), ['later-a', 'early', 'later-b', 'middle']);
  assert.equal(corpus.getRecord('later-b'), records[2]);
  assert.equal(corpus.getRecord('missing'), null);
});

test('unknown dates remain unchanged and unknown years are excluded only by an active year bound', () => {
  const unknownDay = record('unknown-day', 1446, { originalDate: '1446-99-99', calendar: 'lunar', precision: 'year' });
  const unknownYear = record('unknown-year', null, { originalDate: '연대 미상' });
  const invalidYear = record('invalid-year', 0, { originalDate: '왕대 미상' });
  const corpus = index([unknownYear, unknownDay, invalidYear]);
  assert.deepEqual(corpus.query().items.map(item => item.id), ['unknown-day', 'unknown-year', 'invalid-year']);
  assert.deepEqual(corpus.query({ sort: 'desc' }).items.map(item => item.id), ['unknown-day', 'unknown-year', 'invalid-year']);
  assert.deepEqual(corpus.query({ fromYear: 1400 }).items.map(item => item.id), ['unknown-day']);
  assert.deepEqual(corpus.query({ toYear: 1400 }).items, []);
  assert.equal(corpus.getRecord('unknown-day'), unknownDay);
  assert.equal(unknownDay.originalDate, '1446-99-99');
  assert.equal(unknownDay.calendar, 'lunar');
  assert.equal(unknownDay.precision, 'year');
  assert.equal('month' in unknownDay, false);
});

test('normalized multiword AND search combines title, body, original date, collection and inclusive years', () => {
  const corpus = index([
    record('first', 1446, { title: '훈민정음 ＡＢＣ', body: '백성에게 알리다', originalDate: '세종 28년 9월', collectionId: 'letters' }),
    record('other-collection', 1446, { title: '훈민정음 abc', body: '백성에게 알리다', collectionId: 'other' }),
    record('older', 1443, { title: '훈민정음 ABC', body: '백성에게 알리다', collectionId: 'letters' }),
    record('missing-word', 1446, { title: '훈민정음', body: '새 글자', collectionId: 'letters' })
  ]);
  const result = corpus.query({ q: '  abc 백성 훈민정음  ', collection: 'letters', fromYear: 1446, toYear: 1446 });
  assert.deepEqual(result.items.map(item => item.id), ['first']);
  assert.equal(result.total, 1);
  assert.deepEqual(corpus.query({ q: '세종 9월' }).items.map(item => item.id), ['first']);
  assert.equal(corpus.query({ fromYear: 1446, toYear: 1443 }).total, 0);
  assert.equal(corpus.query({ collection: 'absent' }).total, 0);
});

test('all matches beyond forty remain reachable with real totals and clamped page boundaries', () => {
  const corpus = index(Array.from({ length: 123 }, (_, n) => record(`row-${n}`, 1000 + n, { title: `공통 ${n}`, body: n === 122 ? '아주드문기록' : '' })));
  const first = corpus.query({ q: '공통' });
  assert.deepEqual([first.total, first.offset, first.limit, first.items.length], [123, 0, 50, 50]);
  const next = corpus.query({ q: '공통', offset: 50 });
  assert.equal(next.items[0].id, 'row-50');
  assert.equal(next.items.at(-1).id, 'row-99');
  const last = corpus.query({ q: '공통', offset: 99999 });
  assert.deepEqual([last.total, last.offset, last.items.length], [123, 100, 23]);
  assert.equal(last.items.at(-1).id, 'row-122');
  assert.equal(corpus.query({ q: '아주드문기록' }).items[0].id, 'row-122');
  assert.deepEqual(corpus.query({ q: '없는검색', offset: 999 }), { items: [], total: 0, offset: 0, limit: 50 });
  const capped = corpus.query({ offset: -5, limit: 1000 });
  assert.deepEqual([capped.offset, capped.limit, capped.items.length], [0, 100, 100]);
  assert.deepEqual([corpus.query({ offset: NaN, limit: NaN }).offset, corpus.query({ limit: 0 }).limit], [0, 1]);
});

test('pagination reuses normalized search fields without rereading or serializing record bodies', () => {
  const reads = { title: 0, body: 0, originalDate: 0 };
  const records = Array.from({ length: 110 }, (_, n) => {
    const item = record(`cached-${n}`, n + 1);
    for (const [field, value] of Object.entries({ title: '검증 ＡＢＣ', body: '검색 본문', originalDate: '미상 ９９월' })) {
      Object.defineProperty(item, field, { get() { reads[field]++; return value; } });
    }
    item.toJSON = () => { throw new Error('Records must not be serialized for search'); };
    return item;
  });
  const corpus = index(records);
  assert.equal(corpus.query({ q: '검색' }).total, 110);
  const firstReads = { ...reads };
  assert.equal(corpus.query({ q: '검색 abc 99월', offset: 50 }).items[0].id, 'cached-50');
  assert.equal(corpus.query({ q: '본문 미상 검증', offset: 100 }).items[0].id, 'cached-100');
  assert.deepEqual(reads, firstReads);
  assert.equal(records[0].title, '검증 ＡＢＣ');
  assert.equal(records[0].originalDate, '미상 ９９월');
});

test('locate finds the exact row inside the same filtered and ordered chronology as query', () => {
  const corpus = index([
    record('late-a', 1446, { title: '문자 기록', collectionId: 'letters' }),
    record('early', 1000, { title: '문자 기록', collectionId: 'letters' }),
    record('late-b', 1446, { title: '문자 기록', collectionId: 'letters' }),
    record('excluded', 1446, { title: '문자 기록', collectionId: 'other' })
  ]);
  assert.equal(typeof corpus.locate, 'function');
  const options = { q: '문자', collection: 'letters', fromYear: 1000, sort: 'desc' };
  const located = corpus.locate({ ...options, id: 'late-b' });
  assert.deepEqual([located.index, located.total, located.record.id], [1, 3, 'late-b']);
  assert.equal(located.record, corpus.query(options).items[1]);
  assert.equal(corpus.locate({ ...options, id: 'excluded' }), null);
  assert.equal(corpus.locate({ id: 'missing' }), null);
  assert.equal(corpus.locate({ id: 'missing', year: 1446 }), null);
});

test('year locate chooses the nearest known year with earlier-year ties and first same-year metadata row', () => {
  const corpus = index([record('unknown', null), record('late-a', 1200), record('early-a', 1000), record('early-b', 1000), record('late-b', 1200), record('bce', -57)]);
  assert.equal(typeof corpus.locate, 'function');
  assert.deepEqual([corpus.locate({ year: 1100 }).index, corpus.locate({ year: 1100 }).record.id], [1, 'early-a']);
  assert.deepEqual([corpus.locate({ year: 1100, sort: 'desc' }).index, corpus.locate({ year: 1100, sort: 'desc' }).record.id], [2, 'early-a']);
  assert.equal(corpus.locate({ year: 1199 }).record.id, 'late-a');
  assert.equal(corpus.locate({ year: -100 }).record.id, 'bce');
  assert.equal(corpus.locate({ year: 0 }), null);
  assert.equal(corpus.locate({ year: 1.5 }), null);
  assert.equal(corpus.locate({ year: 1100, fromYear: 1101 }).record.id, 'late-a');
  assert.equal(corpus.locate({ year: 1100, q: 'unknown' }), null);
});

test('distribution counts every same-year row and undated record in numeric ascending years regardless of sort', () => {
  const corpus = index([
    record('late-a', 1446), record('bce', -57), record('late-b', 1446),
    record('ten', 10), record('two', 2), record('unknown', null), record('zero', 0)
  ]);
  assert.equal(typeof corpus.distribution, 'function');
  const expected = { total: 7, years: [{ year: -57, count: 1 }, { year: 2, count: 1 }, { year: 10, count: 1 }, { year: 1446, count: 2 }], undated: 2 };
  assert.deepEqual(corpus.distribution(), expected);
  assert.deepEqual(corpus.distribution({ sort: 'desc' }), expected);
  assert.equal(corpus.query({ limit: 1 }).total, 7);
});

test('distribution shares normalized text, collection and inclusive year filters with query without pagination', () => {
  const corpus = index([
    record('first', 1446, { title: '훈민정음 ＡＢＣ', body: '백성에게 문자를 알리다', originalDate: '세종 28년 9월', collectionId: 'letters' }),
    record('second', 1446, { title: '훈민정음 abc', body: '문자 기록', collectionId: 'letters' }),
    record('older', 1443, { title: '훈민정음 abc', body: '문자 기록', collectionId: 'letters' }),
    record('unknown', null, { title: 'ABC 문자', collectionId: 'letters' }),
    record('other', 1446, { title: 'ABC 문자', collectionId: 'other' })
  ]);
  assert.equal(typeof corpus.distribution, 'function');
  const filters = { q: '  abc 문자  ', collection: 'letters', fromYear: 1446, toYear: 1446, sort: 'desc' };
  assert.equal(corpus.query({ ...filters, limit: 1 }).total, 2);
  assert.deepEqual(corpus.distribution({ ...filters, offset: 99999, limit: 1 }), { total: 2, years: [{ year: 1446, count: 2 }], undated: 0 });
  assert.deepEqual(corpus.distribution({ q: 'abc 문자', collection: 'letters' }), { total: 4, years: [{ year: 1443, count: 1 }, { year: 1446, count: 2 }], undated: 1 });
  assert.deepEqual(corpus.distribution({ q: '세종 9월' }), { total: 1, years: [{ year: 1446, count: 1 }], undated: 0 });
  assert.deepEqual(corpus.distribution({ q: '일치하지않음' }), { total: 0, years: [], undated: 0 });
  assert.deepEqual(corpus.distribution({ fromYear: 1500, toYear: 1400 }), { total: 0, years: [], undated: 0 });
});
