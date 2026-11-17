import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';

const module = await import('../dist/explorer.js').catch(() => ({}));
const sources = [{ id: 'safe', title: '공식 원문', publisher: '기록기관', url: 'https://example.org/source' }, { id: 'unsafe', title: '잘못된 주소', publisher: '자료', url: 'javascript:alert(1)' }];
const figures = [{ id: 'sejong', name: '세종', years: '1397~1450', role: '조선의 왕', polityId: 'joseon', summary: '문자와 학문을 장려했다.', sections: [{ heading: '문자 정책', body: '소리를 적는 원리를 마련했다.', sourceIds: ['safe'] }], sourceIds: ['safe', 'unsafe'], stops: [{ year: 1446, label: '한양', coord: [127, 37], description: '훈민정음 반포', sourceIds: ['safe'] }] }, { id: 'unknown', name: '미상 인물', years: '활동 시기 미상', role: '기록 속 인물', summary: '활동 위치를 확인하지 못했다.', sections: [], stops: [], sourceIds: [] }];
const polities = [{ id: 'joseon', name: '조선', period: '1392~1897', summary: '한양을 중심으로 이어진 왕조.', capitalNames: ['개경', '한양'], sections: [{ heading: '제도', body: '정치 제도를 정비했다.', sourceIds: ['safe'] }, { heading: '사회', body: '사회의 변화가 이어졌다.', sourceIds: ['safe'] }], sourceIds: ['safe', 'unsafe'] }];
const snapshots = [{ id: 'foundation', year: 1394, era: 'joseon', title: '한양 천도', summary: '도읍을 옮겼다.', note: '', tags: ['천도'], sections: [{ heading: '도시', body: '새 도성의 구상', sourceIds: ['safe'] }], events: [{ year: 1394, title: '천도', description: '한양으로 이전', category: 'politics', sourceIds: ['safe'] }], figureIds: [], polityIds: ['joseon'], sourceIds: ['safe'], places: [{ id: 'hanyang', name: '한양', modernName: '서울', polity: '조선', note: '도시 단위의 개략 위치', coord: [127, 37], sourceIds: ['safe'] }] }, { id: 'letters', year: 1446, era: 'joseon', title: '훈민정음 반포', summary: '글자를 알렸다.', note: '', tags: ['문자'], sections: [], events: [{ year: 1446, title: '해례본', description: '소리와 문자', category: 'culture', sourceIds: ['safe'] }], figureIds: ['sejong'], polityIds: ['joseon'], sourceIds: ['safe'], places: [{ id: 'seoul', name: '서울', modernName: '서울', polity: '조선', note: '한양 일대', coord: [127, 37], sourceIds: ['safe'] }] }];

function setup({ sceneData = snapshots, corpus, onOpenRecord } = {}) {
  assert.equal(typeof module.createExplorer, 'function');
  const { document, window } = parseHTML('<html><body><button id="launch">탐색 열기</button></body></html>');
  const selections = []; const routes = []; const openedPlaces = []; let cleared = 0;
  const explorer = module.createExplorer({ document, snapshots: sceneData, eras: [{ id: 'joseon', label: '조선 전기' }], sources, figures, polities, corpus, onOpenRecord, onSelectSnapshot: id => selections.push(id), onRoute: figure => routes.push(figure), onClearRoute: () => cleared++, onOpenPlace: place => openedPlaces.push(place) });
  return { explorer, document, window, selections, routes, openedPlaces, get cleared() { return cleared; } };
}
const findButton = (document, text) => [...document.querySelectorAll('button')].find(button => button.textContent.includes(text));
// LinkeDOM has no select.value setter; selected attributes model a real selection.
const selectOption = (select, value) => {
  for (const option of select.options) option.removeAttribute('selected');
  [...select.options].find(option => option.value === value).setAttribute('selected', '');
};

test('explorer preserves the original keyboard-operable sections alongside the official records tab', () => {
  const { explorer, document, window } = setup();
  explorer.open();
  const dialog = document.querySelector('#explorer-dialog');
  assert.ok(dialog.hasAttribute('open'));
  assert.ok(document.getElementById(dialog.getAttribute('aria-labelledby')));
  assert.deepEqual([...dialog.querySelectorAll('[role="tab"]')].map(node => node.textContent), ['전체 연표', '정치체', '인물', '도시 기록', '자료 연표']);
  assert.equal(dialog.querySelector('[aria-selected="true"]').textContent, '전체 연표');
  const event = new window.Event('keydown', { bubbles: true, cancelable: true }); event.key = 'ArrowRight';
  dialog.querySelector('[role="tab"]').dispatchEvent(event);
  assert.equal(dialog.querySelector('[aria-selected="true"]').textContent, '정치체');
  const escape = new window.Event('keydown', { bubbles: true, cancelable: true }); escape.key = 'Escape';
  dialog.dispatchEvent(escape);
  assert.equal(dialog.hasAttribute('open'), false);
  explorer.open('timeline');
  explorer.destroy();
  assert.equal(document.querySelector('#explorer-dialog'), null);
});

test('timeline composes search and category filters, reports emptiness, and opens a selected scene', () => {
  const { explorer, document, window, selections } = setup();
  explorer.open();
  assert.equal(document.querySelectorAll('.chronology-row').length, 2);
  const search = document.querySelector('.explorer-search');
  search.value = '문자'; search.dispatchEvent(new window.Event('input'));
  const category = document.querySelector('[data-filter="category"]');
  selectOption(category, 'politics'); category.dispatchEvent(new window.Event('change'));
  assert.ok(document.querySelector('.explorer-empty'));
  selectOption(category, 'culture'); category.dispatchEvent(new window.Event('change'));
  assert.equal(document.querySelectorAll('.chronology-row').length, 1);
  assert.match(document.querySelector('.explorer-count').textContent, /1/);
  findButton(document, '지도에서 보기').click();
  assert.deepEqual(selections, ['letters']);
  assert.equal(document.querySelector('#explorer-dialog').hasAttribute('open'), false);
});

test('polity details expose periods, capitals, actual sections, safe sources, and related scenes', () => {
  const { explorer, document, selections } = setup();
  explorer.open('polities', 'joseon');
  const detail = document.querySelector('.explorer-detail');
  assert.match(detail.textContent, /1392~1897/);
  assert.match(detail.textContent, /개경.*한양/);
  assert.match(detail.textContent, /정치 제도를 정비했다/);
  assert.ok(detail.querySelector('a[href="https://example.org/source"]'));
  assert.equal(detail.querySelector('a[href^="javascript:"]'), null);
  findButton(document, '훈민정음 반포').click();
  assert.deepEqual(selections, ['letters']);
  explorer.open('polities', 'joseon');
  findButton(document, '목록으로').click();
  assert.equal(document.querySelector('.explorer-detail'), null);
  assert.ok(document.querySelector('.catalogue-card'));
});

test('figure biographies show verified stops and route action while unlocated figures explain the disabled action', () => {
  const { explorer, document, routes } = setup();
  explorer.open('figures', 'sejong');
  assert.match(document.querySelector('.explorer-detail').textContent, /소리를 적는 원리/);
  assert.match(document.querySelector('.explorer-detail').textContent, /1446년.*한양/);
  findButton(document, '활동 지점 지도에서 보기').click();
  assert.equal(routes[0], figures[0]);
  assert.equal(document.querySelector('#explorer-dialog').hasAttribute('open'), false);
  explorer.open('figures', 'unknown');
  assert.equal(findButton(document, '활동 지점 지도에서 보기').disabled, true);
  assert.match(document.querySelector('.explorer-detail').textContent, /확인된 활동 지점이 없/);
});

test('city details order historical names, clarify approximate grouping, and select scene before opening its place', () => {
  const { explorer, document, selections, openedPlaces } = setup();
  explorer.open('places', 'hanyang');
  const records = document.querySelectorAll('.city-record');
  assert.equal(records.length, 2);
  assert.match(records[0].textContent, /1394년.*한양/);
  assert.match(records[1].textContent, /1446년.*서울/);
  assert.match(document.querySelector('.explorer-detail').textContent, /도시 단위/);
  assert.match(document.querySelector('.explorer-detail').textContent, /같은 궁궐/);
  records[0].querySelector('button').click();
  assert.deepEqual(selections, ['foundation']);
  assert.equal(openedPlaces[0], snapshots[0].places[0]);
  assert.equal(document.querySelector('#explorer-dialog').hasAttribute('open'), false);
});

test('dialog supports native cancellation, restores opener focus, and refresh marks the current scene', () => {
  const { explorer, document, window } = setup();
  const launch = document.querySelector('#launch'); let restored = 0;
  launch.focus = () => { restored++; };
  Object.defineProperty(document, 'activeElement', { configurable: true, get: () => launch });
  explorer.refresh(snapshots[1]);
  explorer.open();
  assert.match(document.querySelector('.chronology-row[aria-current="true"]').textContent, /훈민정음/);
  const cancel = new window.Event('cancel', { cancelable: true });
  document.querySelector('#explorer-dialog').dispatchEvent(cancel);
  assert.equal(document.querySelector('#explorer-dialog').hasAttribute('open'), false);
  assert.equal(restored, 1);
});

test('a selected timeline topic limits both event descriptions and category chips in a mixed-topic scene', () => {
  const mixed = { ...snapshots[1], title: '여러 주제를 기록한 장면', events: [
    { year: 1446, title: '수군의 방어', description: '해상 보급로를 지켰다.', category: 'war', sourceIds: ['safe'] },
    { year: 1446, title: '서적의 간행', description: '책을 펴냈다.', category: 'culture', sourceIds: ['safe'] },
    { year: 1446, title: '사신의 왕래', description: '외교 협상을 진행했다.', category: 'diplomacy', sourceIds: ['safe'] }
  ] };
  const { explorer, document, window } = setup({ sceneData: [mixed] });
  explorer.open();
  const category = document.querySelector('[data-filter="category"]');
  selectOption(category, 'war'); category.dispatchEvent(new window.Event('change'));
  const row = document.querySelector('.chronology-row');
  assert.deepEqual([...row.querySelectorAll('ul li strong')].map(node => node.textContent), ['1446년 · 수군의 방어']);
  assert.deepEqual([...row.querySelectorAll('.category-chip')].map(node => node.textContent), ['전쟁']);
  assert.match(row.textContent, /해상 보급로를 지켰다/);
  assert.doesNotMatch(row.textContent, /책을 펴냈다|외교 협상을 진행했다/);
  selectOption(category, 'all'); category.dispatchEvent(new window.Event('change'));
  assert.equal(document.querySelectorAll('.chronology-row ul li').length, 3);
  assert.equal(document.querySelectorAll('.category-chip').length, 3);
});

test('city profiles distinguish unique scene counts from multiple place records in one scene', () => {
  const sceneData = [{ ...snapshots[0], places: [...snapshots[0].places, { ...snapshots[0].places[0], id: 'palace', name: '도성 안 궁궐', siteId: 'seoul' }] }, snapshots[1]];
  const { explorer, document } = setup({ sceneData });
  explorer.open('places', 'seoul');
  const detail = document.querySelector('.explorer-detail');
  const meta = detail.querySelector('.catalogue-meta').textContent;
  assert.match(meta, /2개 시점/);
  assert.match(meta, /3개 기록 항목/);
  assert.equal(detail.querySelectorAll('.city-record').length, 3);
});

test('opening an entity starts its reading viewport at the top after a long previous view', () => {
  const { explorer, document } = setup();
  explorer.open('timeline');
  const body = document.querySelector('.explorer-body');
  body.scrollTop = 740;
  explorer.open('figures', 'sejong');
  assert.equal(body.scrollTop, 0);
  assert.equal(document.querySelector('.detail-heading').textContent, '세종');
  body.scrollTop = 420;
  explorer.close(); explorer.open('places', 'seoul');
  assert.equal(body.scrollTop, 0);
});

test('switching explorer tabs starts each list at the top of the shared viewport', () => {
  const { explorer, document } = setup();
  explorer.open('timeline');
  const body = document.querySelector('.explorer-body');
  body.scrollTop = 740;
  document.querySelector('[data-section="polities"]').click();
  assert.equal(body.scrollTop, 0);
  assert.equal(document.querySelector('[aria-selected="true"]').textContent, '정치체');
});

const corpusManifest = { recordCount: 57, collections: [{ id: 'a', label: '자료 갑', count: 28, fromYear: 1401, toYear: 1455 }, { id: 'b', label: '자료 을', count: 29, fromYear: 1400, toYear: 1456 }], dataset: { title: '공식 연표 메타데이터', provider: '국사편찬위원회', landingUrl: 'https://www.data.go.kr/data/15051036/fileData.do', license: { name: '공공누리 제1유형', url: 'https://www.kogl.or.kr/info/licenseType1.do', attribution: '국사편찬위원회 제공 자료' } }, coverage: { fromYear: 1400, toYear: 1456 } };
const corpusRecords = Array.from({ length: 57 }, (_, index) => ({ id: `record-${index}`, year: 1400 + index, originalDate: `${1400 + index}-01-01`, title: `제공 제목 ${index}`, body: index === 56 ? '마지막권에서만 찾는 본문 검색어' : `제공된 초록 ${index}. ${'원문 문장입니다. '.repeat(30)}`, collectionId: index % 2 ? 'a' : 'b', sourceUrl: `https://db.history.go.kr/id/fixture_${index}`, originalMetadataUrl: `https://db.history.go.kr/item/level.do?itemId=fixture&levelId=${index}`, calendar: 'unspecified', precision: 'day', sourceRecordId: `fixture_${index}` }));
function fixtureCorpus(records = corpusRecords, overrides = {}) {
  const queries = []; let manifestCalls = 0;
  const api = {
    async getManifest() { manifestCalls++; return corpusManifest; },
    async query(options) {
      queries.push(options);
      const q = options.q.toLocaleLowerCase('ko');
      const items = records.filter(record => `${record.title} ${record.body}`.toLocaleLowerCase('ko').includes(q) && (options.collection === 'all' || record.collectionId === options.collection) && (options.fromYear === null || record.year !== null && record.year >= options.fromYear) && (options.toYear === null || record.year !== null && record.year <= options.toYear)).sort((a, b) => options.sort === 'desc' ? b.year - a.year : a.year - b.year);
      return { items: items.slice(options.offset, options.offset + options.limit), total: items.length, offset: options.offset, limit: options.limit };
    },
    async getRecord(id) { return records.find(record => record.id === id) || null; },
    ...overrides
  };
  return { api, queries, get manifestCalls() { return manifestCalls; } };
}
const settle = () => new Promise(resolve => setImmediate(resolve));

test('only the manifest loads initially, while records render 50 rows with reachable last and first pages', async () => {
  const corpus = fixtureCorpus();
  const { explorer, document, window } = setup({ corpus: corpus.api });
  await settle();
  assert.equal(corpus.manifestCalls, 1);
  assert.equal(corpus.queries.length, 0);
  explorer.open('records');
  assert.ok(document.querySelector('.corpus-loading'));
  await settle();
  assert.equal(document.querySelectorAll('.corpus-record').length, 50);
  assert.match(document.querySelector('.explorer-count').textContent, /57/);
  assert.match(document.querySelector('.corpus-provenance').textContent, /국사편찬위원회.*공공누리 제1유형/s);
  assert.ok(document.querySelector('.corpus-provenance a[href="https://www.data.go.kr/data/15051036/fileData.do"]'));
  assert.match(document.querySelector('.corpus-provenance').textContent, /공식 자료.*57건.*지도 해설.*2개/s);
  findButton(document, '다음').click(); await settle();
  assert.equal(document.querySelectorAll('.corpus-record').length, 7);
  assert.match(document.querySelector('.corpus-record-title').textContent, /제공 제목 50$/);
  assert.equal(findButton(document, '다음').disabled, true);
  findButton(document, '첫 페이지').click(); await settle();
  assert.equal(document.querySelectorAll('.corpus-record').length, 50);
  findButton(document, '마지막 페이지').click(); await settle();
  assert.match(document.querySelector('.corpus-record-title').textContent, /제공 제목 50$/);
  const pageInput = document.querySelector('[data-corpus-page]'); pageInput.value = '1';
  pageInput.closest('form').dispatchEvent(new window.Event('submit', { cancelable: true })); await settle();
  assert.match(document.querySelector('.corpus-record-title').textContent, /제공 제목 0$/);
  assert.equal(findButton(document, '이전').disabled, true);
});

test('debounced body search can find a record beyond the first 40 and handles reset and zero matches', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const corpus = fixtureCorpus();
  const { explorer, document, window } = setup({ corpus: corpus.api });
  explorer.open('records'); await settle();
  const search = document.querySelector('.explorer-search');
  search.value = '마지막권'; search.dispatchEvent(new window.Event('input'));
  t.mock.timers.tick(149); await settle();
  assert.equal(corpus.queries.length, 1);
  t.mock.timers.tick(1); await settle();
  assert.equal(document.querySelectorAll('.corpus-record').length, 1);
  assert.match(document.querySelector('.corpus-record-title').textContent, /제공 제목 56$/);
  search.value = '없는자료검색'; search.dispatchEvent(new window.Event('input'));
  t.mock.timers.tick(150); await settle();
  assert.ok(document.querySelector('.explorer-empty'));
  assert.match(document.querySelector('.explorer-count').textContent, /0건/);
  findButton(document, '초기화').click(); await settle();
  assert.equal(search.value, '');
  assert.equal(document.querySelectorAll('.corpus-record').length, 50);
});

test('collection, signed year bounds, and sort combine without querying year zero', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const corpus = fixtureCorpus();
  const { explorer, document, window } = setup({ corpus: corpus.api });
  explorer.open('records'); await settle();
  const collection = document.querySelector('[data-corpus-filter="collection"]');
  selectOption(collection, 'b'); collection.dispatchEvent(new window.Event('change')); await settle();
  const from = document.querySelector('[data-corpus-filter="fromYear"]');
  const to = document.querySelector('[data-corpus-filter="toYear"]');
  from.value = '1450'; to.value = '1456'; from.dispatchEvent(new window.Event('input')); to.dispatchEvent(new window.Event('input'));
  const sort = document.querySelector('[data-corpus-filter="sort"]'); selectOption(sort, 'desc'); sort.dispatchEvent(new window.Event('change')); await settle();
  assert.deepEqual([...document.querySelectorAll('.corpus-record-title')].map(node => node.textContent), ['제공 제목 56', '제공 제목 54', '제공 제목 52', '제공 제목 50']);
  const calls = corpus.queries.length;
  from.value = '0'; from.dispatchEvent(new window.Event('input')); t.mock.timers.tick(150); await settle();
  assert.equal(corpus.queries.length, calls);
  assert.match(document.querySelector('.corpus-error').textContent, /0년/);
  from.value = '-108'; to.value = '-1'; from.dispatchEvent(new window.Event('input')); to.dispatchEvent(new window.Event('input')); t.mock.timers.tick(150); await settle();
  assert.equal(corpus.queries.at(-1).fromYear, -108);
  assert.equal(corpus.queries.at(-1).toYear, -1);
});

test('record detail preserves supplied titles and full bodies, explains raw dates, and links only a preceding map scene', async () => {
  const record = { ...corpusRecords[0], id: 'raw', year: 1430, title: '제공 제목의 일부…', originalDate: '1430-99-99', calendar: 'lunar', precision: 'year', body: '첫째 원문 문장.\n' + '본문이 이어집니다. '.repeat(100) };
  const corpus = fixtureCorpus([record]);
  const { explorer, document, selections, openedPlaces } = setup({ corpus: corpus.api });
  explorer.open('records'); await settle();
  assert.match(document.querySelector('.corpus-snippet').textContent, /…$/);
  document.querySelector('.corpus-record-title button').click(); await settle();
  assert.equal(document.querySelector('.corpus-body').textContent, record.body);
  assert.equal(document.querySelector('.detail-heading').textContent, '제공 제목의 일부…');
  assert.match(document.querySelector('.corpus-detail').textContent, /1430-99-99/);
  assert.match(document.querySelector('.corpus-date-note').textContent, /음력.*미상/s);
  assert.ok(document.querySelector('.corpus-detail a[href="https://db.history.go.kr/id/fixture_0"]'));
  assert.ok(document.querySelector('.corpus-detail a[href^="https://db.history.go.kr/item/"]'));
  assert.match(document.querySelector('.corpus-metadata summary').textContent, /기존.*보존/);
  assert.match(document.querySelector('.corpus-metadata').textContent, /현재 열리지 않을 수/);
  assert.match(document.querySelector('.corpus-detail').textContent, /새로 작성한 해설/);
  findButton(document, '가까운 해설 장면 · 1394년').click();
  assert.deepEqual(selections, ['foundation']);
  assert.deepEqual(openedPlaces, []);
});

test('unknown dates and unsafe source links do not become fabricated dates, external links, or map points', async () => {
  const record = { ...corpusRecords[0], id: 'unknown-date', year: null, originalDate: '연대 미상', calendar: 'unspecified', precision: 'unknown', sourceUrl: 'https://db.history.go.kr.evil.example/id/fake', originalMetadataUrl: 'javascript:alert(1)' };
  const corpus = fixtureCorpus([record]);
  const { explorer, document } = setup({ corpus: corpus.api });
  explorer.open('records', 'unknown-date'); await settle();
  assert.match(document.querySelector('.corpus-date-note').textContent, /역법 미표기/);
  assert.match(document.querySelector('.corpus-detail').textContent, /연대 미상/);
  assert.equal(document.querySelector('.corpus-detail a'), null);
  assert.equal(findButton(document, '가까운 해설 장면'), undefined);
});

test('record query failures show a retry that recovers without closing the explorer', async () => {
  let attempts = 0;
  const corpus = fixtureCorpus();
  const original = corpus.api.query;
  corpus.api.query = options => { if (++attempts === 1) return Promise.reject(new Error('network failed')); return original(options); };
  const { explorer, document } = setup({ corpus: corpus.api });
  explorer.open('records'); await settle();
  assert.match(document.querySelector('.corpus-error').textContent, /불러오지 못/);
  findButton(document, '다시 시도').click(); await settle();
  assert.equal(document.querySelectorAll('.corpus-record').length, 50);
  assert.equal(document.querySelector('.corpus-error'), null);
});

test('a late earlier search response cannot replace the latest records result', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const pending = [];
  const corpus = fixtureCorpus(corpusRecords, { query: options => new Promise(resolve => pending.push({ options, resolve })) });
  const { explorer, document, window } = setup({ corpus: corpus.api });
  explorer.open('records'); await settle();
  pending[0].resolve({ items: [corpusRecords[0]], total: 1, offset: 0, limit: 50 }); await settle();
  const search = document.querySelector('.explorer-search');
  search.value = '과거요청'; search.dispatchEvent(new window.Event('input')); t.mock.timers.tick(150); await settle();
  search.value = '최신요청'; search.dispatchEvent(new window.Event('input')); t.mock.timers.tick(150); await settle();
  pending[2].resolve({ items: [corpusRecords[56]], total: 1, offset: 0, limit: 50 }); await settle();
  pending[1].resolve({ items: [corpusRecords[1]], total: 1, offset: 0, limit: 50 }); await settle();
  assert.match(document.querySelector('.corpus-record-title').textContent, /제공 제목 56$/);
  assert.equal(document.querySelector('.explorer-search').value, '최신요청');
});

test('global record search opens the records tab with its own query on the first page', async () => {
  const corpus = fixtureCorpus();
  const { explorer, document } = setup({ corpus: corpus.api });
  assert.equal(typeof explorer.searchRecords, 'function');
  explorer.open('records'); await settle();
  findButton(document, '마지막 페이지').click(); await settle();
  explorer.searchRecords('마지막권'); await settle();
  assert.equal(document.querySelector('[aria-selected="true"]').textContent, '자료 연표');
  assert.equal(document.querySelector('.explorer-search').value, '마지막권');
  assert.equal(corpus.queries.at(-1).offset, 0);
  assert.match(document.querySelector('.corpus-record-title').textContent, /제공 제목 56$/);
});

for (const code of ['CORPUS_WORKER_UNSUPPORTED', 'CORPUS_DECOMPRESSION_UNSUPPORTED']) {
  for (const detail of [false, true]) {
    test(`${code} in ${detail ? 'record detail' : 'record search'} explains browser support without an ineffective retry`, async () => {
      const unsupported = Object.assign(new Error('This browser does not support the required corpus capability.'), { code });
      const corpus = fixtureCorpus(corpusRecords, { query: async () => { throw unsupported; }, getRecord: async () => { throw unsupported; } });
      const { explorer, document } = setup({ corpus: corpus.api });
      explorer.open('records', detail ? 'record-0' : null); await settle();
      const error = document.querySelector('.corpus-error');
      assert.match(error.textContent, /현재 브라우저.*지원하지 않.*최신 브라우저/s);
      assert.ok(error.querySelector('a[href="https://db.history.go.kr/"]'));
      assert.equal(findButton(document, '다시 시도'), undefined);
      explorer.destroy();
    });
  }
}

test('BCE 2333 records preserve raw dates while distinguishing classified traditions from dated events', async () => {
  const record = { ...corpusRecords[0], id: 'tradition', year: -2333, originalDate: '-2333-99-99', title: '기자의 8조 법금 관련 기록', precision: 'year' };
  const corpus = fixtureCorpus([record]);
  const { explorer, document } = setup({ corpus: corpus.api });
  explorer.open('records'); await settle();
  assert.match(document.querySelector('.corpus-provenance').textContent, /분류 연대.*전승.*확정.*연도/s);
  const row = document.querySelector('.corpus-record');
  assert.match(row.querySelector('.corpus-date').textContent, /원자료의 연대 표기.*-2333-99-99/s);
  assert.match(row.querySelector('.corpus-date-note').textContent, /기원전 2333년.*전승.*그해 발생한 확정 사건.*아닙니다/s);
  row.querySelector('.corpus-record-title button').click(); await settle();
  assert.match(document.querySelector('.corpus-original-date').textContent, /원자료의 연대 표기.*-2333-99-99/s);
  assert.match(document.querySelector('.corpus-detail .corpus-date-note').textContent, /기원전 2333년.*전승.*그해 발생한 확정 사건.*아닙니다/s);
  assert.equal(record.year, -2333);
  assert.equal(record.originalDate, '-2333-99-99');
});

test('collection source fallbacks explain how to find the preserved provider ID in both list and detail', async () => {
  const record = { ...corpusRecords[0], id: 'collection-fallback', sourceLinkType: 'collection', sourceUrl: 'https://db.history.go.kr/id/tcmd', sourceRecordId: 'tcmd_1902_001_0010' };
  const corpus = fixtureCorpus([record]);
  const { explorer, document } = setup({ corpus: corpus.api });
  explorer.open('records'); await settle();
  const row = document.querySelector('.corpus-record');
  assert.equal(row.querySelector('a[href="https://db.history.go.kr/id/tcmd"]').textContent, '공식 자료군에서 원문 찾기 ↗');
  assert.match(row.textContent, /개별 기사 주소를 확인할 수 없어.*자료군.*제공기관 기록 ID/s);
  assert.match(row.textContent, /tcmd_1902_001_0010/);
  assert.doesNotMatch(row.textContent, /공식 원문 현재 링크/);
  assert.match(document.querySelector('.corpus-provenance').textContent, /서비스 개편.*모든 개별 기록.*대조한 것은 아닙니다/s);
  row.querySelector('.corpus-record-title button').click(); await settle();
  const detail = document.querySelector('.corpus-detail');
  assert.equal(detail.querySelector('a[href="https://db.history.go.kr/id/tcmd"]').textContent, '공식 자료군에서 원문 찾기 ↗');
  assert.match(detail.textContent, /개별 기사 주소를 확인할 수 없어.*자료군.*제공기관 기록 ID/s);
  assert.match(detail.textContent, /tcmd_1902_001_0010/);
  assert.doesNotMatch(detail.textContent, /공식 원문 현재 링크/);
});

test('record source links retain their individual label without a collection fallback claim', async () => {
  const corpus = fixtureCorpus([corpusRecords[0], { ...corpusRecords[1], sourceLinkType: 'record' }]);
  const { explorer, document } = setup({ corpus: corpus.api });
  explorer.open('records'); await settle();
  for (const row of document.querySelectorAll('.corpus-record')) {
    assert.equal(row.querySelector('a').textContent, '공식 원문 현재 링크 ↗');
    assert.doesNotMatch(row.textContent, /개별 기사 주소를 확인할 수 없어/);
  }
});

test('an out-of-range numeric month is explained without changing the raw date or treating L10 as an error', async () => {
  const abnormal = { ...corpusRecords[0], id: 'month-17', year: 1902, originalDate: '1902-17-99', precision: 'month' };
  const leap = { ...corpusRecords[1], id: 'leap-code', year: 1902, originalDate: '1902-L10-99', calendar: 'lunar', precision: 'month' };
  const corpus = fixtureCorpus([abnormal, leap]);
  const { explorer, document } = setup({ corpus: corpus.api });
  explorer.open('records'); await settle();
  const rows = document.querySelectorAll('.corpus-record');
  assert.match(rows[0].querySelector('.corpus-date').textContent, /1902-17-99/);
  assert.match(rows[0].querySelector('.corpus-date-note').textContent, /일반적인 월 범위.*연도만/s);
  assert.match(rows[1].querySelector('.corpus-date').textContent, /1902-L10-99/);
  assert.doesNotMatch(rows[1].querySelector('.corpus-date-note').textContent, /월 범위|오타|오류/);
  rows[0].querySelector('.corpus-record-title button').click(); await settle();
  assert.match(document.querySelector('.corpus-detail .corpus-date-note').textContent, /일반적인 월 범위.*연도만/s);
  assert.equal(abnormal.originalDate, '1902-17-99');
  assert.equal(leap.originalDate, '1902-L10-99');
});

test('the canonical modern-history collection root remains a visible source link in list and detail', async () => {
  const sourceUrl = 'https://db.history.go.kr/diachronic/level.do?itemId=tcmd';
  const record = { ...corpusRecords[0], id: 'canonical-collection', sourceLinkType: 'collection', sourceUrl, sourceRecordId: 'tc_md_1902_01_99_0010' };
  const corpus = fixtureCorpus([record]);
  const { explorer, document } = setup({ corpus: corpus.api });
  explorer.open('records'); await settle();
  const row = document.querySelector('.corpus-record');
  assert.equal(row.querySelector('a')?.href, sourceUrl);
  assert.match(row.querySelector('a').textContent, /공식 자료군에서 원문 찾기/);
  row.querySelector('.corpus-record-title button').click(); await settle();
  assert.equal(document.querySelector('.corpus-detail a')?.href, sourceUrl);
});

test('collection-root exceptions reject extra parameters, other item IDs, and unrecognized collection paths', async () => {
  const urls = [
    'https://db.history.go.kr/diachronic/level.do?itemId=tcmd&redirect=https://evil.example',
    'https://db.history.go.kr/diachronic/level.do?itemId=other',
    'https://db.history.go.kr/diachronic/level.do?itemId=tcmd&itemId=tcmd',
    'https://db.history.go.kr/diachronic/level.do/extra?itemId=tcmd',
    'https://db.history.go.kr/id/tcmd?redirect=https://evil.example'
  ];
  for (const sourceUrl of urls) {
    const corpus = fixtureCorpus([{ ...corpusRecords[0], sourceLinkType: 'collection', sourceUrl }]);
    const { explorer, document } = setup({ corpus: corpus.api });
    explorer.open('records'); await settle();
    assert.equal(Boolean(document.querySelector('.corpus-record a')), false, sourceUrl);
    explorer.destroy();
  }
});

test('record cards and details open the main view after closing and preserve their current filter context', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const corpus = fixtureCorpus();
  const opened = []; const order = [];
  const { explorer, document, window } = setup({ corpus: corpus.api, onOpenRecord: (record, filters) => { order.push('main'); opened.push({ record, filters }); assert.equal(document.querySelector('#explorer-dialog').hasAttribute('open'), false); } });
  const launch = document.querySelector('#launch'); launch.focus = () => order.push('focus restored');
  Object.defineProperty(document, 'activeElement', { configurable: true, get: () => launch });
  explorer.open('records'); await settle();
  const collection = document.querySelector('[data-corpus-filter="collection"]'); selectOption(collection, 'b'); collection.dispatchEvent(new window.Event('change')); await settle();
  const from = document.querySelector('[data-corpus-filter="fromYear"]'); const to = document.querySelector('[data-corpus-filter="toYear"]');
  from.value = '1450'; to.value = '1456'; from.dispatchEvent(new window.Event('input')); to.dispatchEvent(new window.Event('input'));
  const sort = document.querySelector('[data-corpus-filter="sort"]'); selectOption(sort, 'desc'); sort.dispatchEvent(new window.Event('change')); await settle();
  const search = document.querySelector('.explorer-search'); search.value = '제공 제목'; search.dispatchEvent(new window.Event('input')); t.mock.timers.tick(150); await settle();
  const mainButton = document.querySelector('.corpus-record [data-action="open-main-record"]');
  assert.ok(mainButton);
  mainButton.click();
  assert.equal(opened[0].record.id, 'record-56');
  assert.deepEqual(opened[0].filters, { q: '제공 제목', collection: 'b', fromYear: 1450, toYear: 1456, sort: 'desc' });
  assert.deepEqual(order, ['focus restored', 'main']);
  explorer.open('records'); await settle();
  const nextSearch = document.querySelector('.explorer-search'); nextSearch.value = '제공 제목'; nextSearch.dispatchEvent(new window.Event('input')); t.mock.timers.tick(150); await settle();
  document.querySelector('.corpus-record-title button').click(); await settle();
  document.querySelector('.corpus-detail [data-action="open-main-record"]').click();
  assert.equal(opened[1].record.id, 'record-56');
  assert.deepEqual(opened[1].filters, { q: '제공 제목', collection: 'b', fromYear: 1450, toYear: 1456, sort: 'desc' });
});

test('opening a record from the main view preserves its full archive context in details, controls, list, and return action', async () => {
  const corpus = fixtureCorpus(); const returned = [];
  const { explorer, document } = setup({ corpus: corpus.api, onOpenRecord: (record, filters) => returned.push({ record, filters }) });
  assert.equal(typeof explorer.openRecord, 'function');
  const context = { q: '제공 제목', collection: 'b', fromYear: 1450, toYear: 1456, sort: 'desc' };
  explorer.openRecord('record-54', context); await settle();
  assert.match(document.querySelector('.detail-heading').textContent, /제공 제목 54$/);
  assert.equal(document.querySelector('.explorer-search').value, '제공 제목');
  assert.equal(document.querySelector('[data-corpus-filter="collection"]').value, 'b');
  assert.equal(document.querySelector('[data-corpus-filter="fromYear"]').value, '1450');
  assert.equal(document.querySelector('[data-corpus-filter="toYear"]').value, '1456');
  assert.equal(document.querySelector('[data-corpus-filter="sort"]').value, 'desc');
  findButton(document, '목록으로').click(); await settle();
  assert.deepEqual([...document.querySelectorAll('.corpus-record-title')].map(node => node.textContent), ['제공 제목 56', '제공 제목 54', '제공 제목 52', '제공 제목 50']);
  const selected = [...document.querySelectorAll('.corpus-record')].find(row => row.dataset.recordId === 'record-54');
  selected.querySelector('[data-action="open-main-record"]').click();
  assert.equal(returned[0].record.id, 'record-54');
  assert.deepEqual(returned[0].filters, context);
  assert.notEqual(returned[0].filters, context);
  explorer.openRecord('record-1'); await settle();
  findButton(document, '목록으로').click(); await settle();
  assert.equal(document.querySelector('.explorer-search').value, '');
  assert.equal(document.querySelector('[data-corpus-filter="collection"]').value, 'all');
  assert.equal(document.querySelectorAll('.corpus-record').length, 50);
  assert.match(document.querySelector('.corpus-record-title').textContent, /제공 제목 0$/);
});
