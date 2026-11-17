import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';

const module = await import('../dist/main-record-view.js').catch(() => ({}));
const manifest = { recordCount: 212574, collections: [{ id: 'tcmd', label: '근대사 연표' }, { id: 'tc', label: '한국사 연표' }], dataset: { title: '공식 연표 자료', provider: '교육부 국사편찬위원회', landingUrl: 'https://www.data.go.kr/data/15051036/fileData.do', license: { name: '공공누리 제1유형', url: 'https://www.kogl.or.kr/info/licenseType1.do', attribution: '국사편찬위원회 제공' } } };
const record = { id: 'record-1902', sourceRecordId: 'tc_md_1902_01_99_0010', year: 1902, originalDate: '1902-01-99', title: '제공 제목', body: '제공된 원문 초록.\n' + '잘리지 않아야 하는 원문 문장. '.repeat(70), calendar: 'lunar', precision: 'month', collectionId: 'tcmd', sourceLinkType: 'collection', sourceUrl: 'https://db.history.go.kr/diachronic/level.do?itemId=tcmd', originalMetadataUrl: 'https://db.history.go.kr/item/level.do?itemId=tc_md&levelId=1902' };
const filters = { q: '원문', collection: 'tcmd', fromYear: 1900, toYear: 1910, sort: 'asc' };
const ready = (changes = {}) => ({ status: 'ready', record, manifest, error: null, index: 4, total: 170, filters, ...changes });
function setup() {
  assert.equal(typeof module.createMainRecordView, 'function');
  const { document } = parseHTML('<html><body><div id="target"></div><button id="outside">지도 해설</button></body></html>');
  const target = document.querySelector('#target'); const archives = []; let retries = 0;
  const view = module.createMainRecordView({ document, target, onOpenArchive: (record, filters) => archives.push({ record, filters }), onRetry: () => retries++ });
  return { document, target, view, archives, get retries() { return retries; } };
}

test('the main record reader preserves the complete supplied body, date metadata, provenance, and collection fallback', () => {
  const { target, view } = setup(); view.render(ready());
  assert.equal(target.querySelector('.corpus-body').textContent, record.body);
  assert.match(target.querySelector('.corpus-original-date').textContent, /원자료의 연대 표기.*1902-01-99/s);
  assert.match(target.querySelector('.corpus-date-note').textContent, /음력.*미상/s);
  assert.match(target.textContent, /정밀도.*월 단위/s);
  assert.match(target.textContent, /근대사 연표.*tc_md_1902_01_99_0010/s);
  assert.match(target.textContent, /자료 건수.*독립적인 사건 수.*같지 않/s);
  assert.match(target.textContent, /확인된 좌표가 없/);
  assert.match(target.querySelector('.corpus-provenance').textContent, /교육부 국사편찬위원회.*공공누리 제1유형/s);
  assert.ok(target.querySelector('a[href="https://www.data.go.kr/data/15051036/fileData.do"]'));
  assert.ok(target.querySelector('a[href="https://www.kogl.or.kr/info/licenseType1.do"]'));
  assert.equal(target.querySelector('a[href="https://db.history.go.kr/diachronic/level.do?itemId=tcmd"]').textContent, '공식 자료군에서 원문 찾기 ↗');
  assert.match(target.textContent, /개별 기사 주소를 확인할 수 없어/);
  assert.match(target.querySelector('.corpus-metadata').textContent, /기존 메타데이터.*보존.*현재 열리지 않을 수/s);
  assert.equal(target.querySelector('h1, h2'), null);
});

test('the archive action passes the shown record with a separate snapshot of its filter context', () => {
  const { target, view, archives } = setup();
  const mutableFilters = { ...filters }; view.render(ready({ filters: mutableFilters }));
  mutableFilters.q = '나중에 변경한 값';
  target.querySelector('[data-action="open-record-archive"]').click();
  assert.equal(archives[0].record, record);
  assert.deepEqual(archives[0].filters, { q: '원문', collection: 'tcmd', fromYear: 1900, toYear: 1910, sort: 'asc' });
});

test('raw traditions, anomalous numeric months, and leap codes keep their original values and relevant explanations', () => {
  const { target, view } = setup();
  view.render(ready({ record: { ...record, year: -2333, originalDate: '-2333-99-99', calendar: 'unspecified', precision: 'year' } }));
  assert.match(target.querySelector('.corpus-original-date').textContent, /-2333-99-99/);
  assert.match(target.querySelector('.corpus-date-note').textContent, /역법 미표기.*기원전 2333년.*확정 사건.*아닙니다/s);
  view.render(ready({ record: { ...record, originalDate: '1902-17-99' } }));
  assert.match(target.querySelector('.corpus-date-note').textContent, /일반적인 월 범위.*연도만/s);
  view.render(ready({ record: { ...record, originalDate: '1902-L10-99' } }));
  assert.match(target.querySelector('.corpus-original-date').textContent, /1902-L10-99/);
  assert.doesNotMatch(target.querySelector('.corpus-date-note').textContent, /월 범위|오타|오류/);
});

test('source exceptions remain narrow, body markup stays plain text, and missing bodies are clearly identified', () => {
  const { target, view } = setup();
  view.render(ready({ record: { ...record, body: '<img src=x onerror=alert(1)>원문', sourceUrl: 'https://db.history.go.kr/diachronic/level.do?itemId=tcmd&redirect=https://evil.example', originalMetadataUrl: 'javascript:alert(1)' } }));
  assert.equal(target.querySelector('.corpus-body').textContent, '<img src=x onerror=alert(1)>원문');
  assert.equal(target.querySelectorAll('img, script').length, 0);
  assert.equal(target.querySelectorAll('a[href*="redirect="], a[href^="javascript:"]').length, 0);
  view.render(ready({ record: { ...record, body: '', sourceLinkType: 'article', sourceUrl: 'https://db.history.go.kr/id/fixture_1' } }));
  assert.match(target.querySelector('.corpus-body').textContent, /제공된 초록.*없습니다/);
  assert.equal(target.querySelector('a[href="https://db.history.go.kr/id/fixture_1"]').textContent, '공식 원문 현재 링크 ↗');
});

test('loading and empty states replace previous record content without showing stale body text', () => {
  const { target, view } = setup();
  view.render(ready()); view.render(ready({ status: 'loading' }));
  assert.equal(target.getAttribute('aria-busy'), 'true');
  assert.ok(target.querySelector('.corpus-loading[role="status"]'));
  assert.equal(target.querySelector('.corpus-body'), null);
  view.render(ready({ record: null, total: 0, index: 0 }));
  assert.equal(target.hasAttribute('aria-busy'), false);
  assert.match(target.querySelector('.explorer-empty').textContent, /조건.*기록.*없/);
});

test('recoverable errors offer retry while unsupported browsers offer source access', () => {
  const context = setup(); const { target, view } = context;
  view.render(ready({ status: 'error', error: Object.assign(new Error('offline'), { code: 'CORPUS_FETCH_FAILED' }) }));
  target.querySelector('.corpus-error button').click(); assert.equal(context.retries, 1);
  for (const code of ['CORPUS_WORKER_UNSUPPORTED', 'CORPUS_DECOMPRESSION_UNSUPPORTED']) {
    view.render(ready({ status: 'error', error: { code, message: 'unsupported' } }));
    assert.match(target.querySelector('.corpus-error').textContent, /최신 브라우저/);
    assert.equal(target.querySelector('.corpus-error button'), null);
    assert.ok(target.querySelector('.corpus-error a[href="https://db.history.go.kr/"]'));
  }
});

test('destroy clears only the owned target and disables detached callbacks', () => {
  const { document, target, view, archives } = setup(); view.render(ready());
  const archive = target.querySelector('[data-action="open-record-archive"]');
  view.destroy(); archive.click(); view.render(ready());
  assert.equal(target.childElementCount, 0);
  assert.equal(archives.length, 0);
  assert.ok(document.querySelector('#outside'));
});
