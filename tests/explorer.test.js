import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';

const module = await import('../dist/explorer.js').catch(() => ({}));
const sources = [{ id: 'safe', title: '공식 원문', publisher: '기록기관', url: 'https://example.org/source' }, { id: 'unsafe', title: '잘못된 주소', publisher: '자료', url: 'javascript:alert(1)' }];
const figures = [{ id: 'sejong', name: '세종', years: '1397~1450', role: '조선의 왕', polityId: 'joseon', summary: '문자와 학문을 장려했다.', sections: [{ heading: '문자 정책', body: '소리를 적는 원리를 마련했다.', sourceIds: ['safe'] }], sourceIds: ['safe', 'unsafe'], stops: [{ year: 1446, label: '한양', coord: [127, 37], description: '훈민정음 반포', sourceIds: ['safe'] }] }, { id: 'unknown', name: '미상 인물', years: '활동 시기 미상', role: '기록 속 인물', summary: '활동 위치를 확인하지 못했다.', sections: [], stops: [], sourceIds: [] }];
const polities = [{ id: 'joseon', name: '조선', period: '1392~1897', summary: '한양을 중심으로 이어진 왕조.', capitalNames: ['개경', '한양'], sections: [{ heading: '제도', body: '정치 제도를 정비했다.', sourceIds: ['safe'] }, { heading: '사회', body: '사회의 변화가 이어졌다.', sourceIds: ['safe'] }], sourceIds: ['safe', 'unsafe'] }];
const snapshots = [{ id: 'foundation', year: 1394, era: 'joseon', title: '한양 천도', summary: '도읍을 옮겼다.', note: '', tags: ['천도'], sections: [{ heading: '도시', body: '새 도성의 구상', sourceIds: ['safe'] }], events: [{ year: 1394, title: '천도', description: '한양으로 이전', category: 'politics', sourceIds: ['safe'] }], figureIds: [], polityIds: ['joseon'], sourceIds: ['safe'], places: [{ id: 'hanyang', name: '한양', modernName: '서울', polity: '조선', note: '도시 단위의 개략 위치', coord: [127, 37], sourceIds: ['safe'] }] }, { id: 'letters', year: 1446, era: 'joseon', title: '훈민정음 반포', summary: '글자를 알렸다.', note: '', tags: ['문자'], sections: [], events: [{ year: 1446, title: '해례본', description: '소리와 문자', category: 'culture', sourceIds: ['safe'] }], figureIds: ['sejong'], polityIds: ['joseon'], sourceIds: ['safe'], places: [{ id: 'seoul', name: '서울', modernName: '서울', polity: '조선', note: '한양 일대', coord: [127, 37], sourceIds: ['safe'] }] }];

function setup({ sceneData = snapshots } = {}) {
  assert.equal(typeof module.createExplorer, 'function');
  const { document, window } = parseHTML('<html><body><button id="launch">탐색 열기</button></body></html>');
  const selections = []; const routes = []; const openedPlaces = []; let cleared = 0;
  const explorer = module.createExplorer({ document, snapshots: sceneData, eras: [{ id: 'joseon', label: '조선 전기' }], sources, figures, polities, onSelectSnapshot: id => selections.push(id), onRoute: figure => routes.push(figure), onClearRoute: () => cleared++, onOpenPlace: place => openedPlaces.push(place) });
  return { explorer, document, window, selections, routes, openedPlaces, get cleared() { return cleared; } };
}
const findButton = (document, text) => [...document.querySelectorAll('button')].find(button => button.textContent.includes(text));
// LinkeDOM has no select.value setter; selected attributes model a real selection.
const selectOption = (select, value) => {
  for (const option of select.options) option.removeAttribute('selected');
  [...select.options].find(option => option.value === value).setAttribute('selected', '');
};

test('explorer mounts an accessible dialog with four keyboard-operable tabs and cleans up owned DOM', () => {
  const { explorer, document, window } = setup();
  explorer.open();
  const dialog = document.querySelector('#explorer-dialog');
  assert.ok(dialog.hasAttribute('open'));
  assert.ok(document.getElementById(dialog.getAttribute('aria-labelledby')));
  assert.equal(dialog.querySelectorAll('[role="tab"]').length, 4);
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
