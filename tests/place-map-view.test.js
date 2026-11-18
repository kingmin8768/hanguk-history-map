import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import { buildCityHistories } from '../dist/catalogue.js';
import { SNAPSHOTS, SOURCES } from '../dist/data.js';

const module = await import('../dist/place-map-view.js').catch(() => ({}));
const cities = buildCityHistories(SNAPSHOTS);
function setup(options = {}) {
  assert.equal(typeof module.createPlaceMapView, 'function', 'place map view must exist');
  const { document, window } = parseHTML('<html><body><button id="opener">장소 지도</button><svg><g id="land-layer"><path class="land" d="M0 0L10 10Z"/></g></svg></body></html>');
  const scenes = []; const records = []; const shares = [];
  const landLayer = document.querySelector('#land-layer');
  const view = module.createPlaceMapView({ document, cities, sources: new Map(SOURCES.map(source => [source.id, source])), landLayer, recordLinks: {}, onSelectScene: (snapshot, place) => scenes.push({ snapshot, place }), onOpenRecord: id => records.push(id), onShare: id => shares.push(id), ...options });
  const dialog = document.querySelector('#places-map-dialog');
  return { document, window, dialog, view, landLayer, scenes, records, shares };
}
function key(window, node, value) { const event = new window.Event('keydown', { bubbles: true, cancelable: true }); Object.defineProperty(event, 'key', { value }); node.dispatchEvent(event); return event; }

test('every catalogue group stays reachable and off-frame places are explicitly listed without moving the fixed map', () => {
  const { dialog, view } = setup(); view.open();
  assert.equal(dialog.querySelectorAll('.place-map-result').length, cities.length);
  const outside = [...dialog.querySelectorAll('.place-map-outside .place-map-result')].map(button => button.dataset.cityId);
  for (const id of ['shanghai', 'yokohama', 'chongqing', 'harbin']) assert.ok(outside.includes(id), id);
  assert.equal(dialog.querySelector('.place-overview-map').getAttribute('viewBox'), '0 0 1000 900');
  dialog.querySelector('.place-map-result[data-city-id="chongqing"]').click();
  assert.equal(dialog.querySelector('.place-map-detail h3').textContent, '충칭');
  assert.match(dialog.querySelector('.place-map-detail').textContent, /화면 밖/);
  assert.equal(dialog.querySelector('.place-overview-map').getAttribute('viewBox'), '0 0 1000 900');
  assert.equal(dialog.querySelector('.place-map-pin[data-city-id="chongqing"]'), null);
  view.destroy();
});

test('search normalizes compatibility characters and historical aliases, and explains no matches', () => {
  const { dialog, window, view } = setup(); view.open(); const search = dialog.querySelector('input[type="search"]');
  for (const query of ['ＨＡＮＹＡＮＧ', '한양']) {
    search.value = query; search.dispatchEvent(new window.Event('input'));
    assert.deepEqual([...dialog.querySelectorAll('.place-map-result')].map(button => button.dataset.cityId), ['seoul']);
  }
  search.value = '존재하지않는장소'; search.dispatchEvent(new window.Event('input'));
  assert.equal(dialog.querySelectorAll('.place-map-result').length, 0);
  assert.match(dialog.querySelector('.place-map-summary').textContent, /없/);
  view.destroy();
});

test('selected timeline preserves exact stored places and counts scenes once', () => {
  const { dialog, view, scenes } = setup(); view.open('seoul');
  const city = cities.find(city => city.id === 'seoul');
  const count = new Set(city.records.map(record => record.snapshot.id)).size;
  assert.match(dialog.querySelector('.place-map-city-count').textContent, new RegExp(`${count}개`));
  const items = [...dialog.querySelectorAll('.place-map-entry')];
  assert.equal(items.length, city.records.length);
  assert.deepEqual(items.map(item => Number(item.dataset.year)), city.records.map(record => record.year));
  const target = city.records.find(record => record.place.name.includes('명동')) || city.records.at(-1);
  const button = [...dialog.querySelectorAll('[data-action="select-scene"]')].find(button => button.dataset.recordId === target.id);
  button.click();
  assert.equal(scenes.length, 1); assert.equal(scenes[0].snapshot, target.snapshot); assert.equal(scenes[0].place, target.place);
  assert.equal(dialog.hasAttribute('open'), false);
  view.destroy();
});

test('keyboard pins select cities and official references and sharing dispatch their own stable IDs', () => {
  const references = [{ recordId: 'official-a', year: 1394, title: '천도 기록', note: '한양 관련' }, { recordId: 'official-b', year: 1446, title: '문자 기록', note: '원자료 연대' }, { recordId: 'official-c', year: 1919, title: '독립 기록', note: '관련 자료' }];
  const { dialog, view, window, records, shares } = setup({ recordLinks: { seoul: references } }); view.open('gyeongju');
  const pin = dialog.querySelector('.place-map-pin[data-city-id="seoul"]');
  const event = key(window, pin, 'Enter'); assert.equal(event.defaultPrevented, true);
  assert.equal(dialog.querySelector('.place-map-detail h3').textContent, '서울');
  assert.equal(dialog.querySelectorAll('[data-action="open-record"]').length, 3);
  dialog.querySelector('[data-action="share-city"]').click(); assert.deepEqual(shares, ['seoul']);
  dialog.querySelector('[data-action="open-record"][data-record-id="official-b"]').click(); assert.deepEqual(records, ['official-b']);
  assert.equal(dialog.hasAttribute('open'), false); view.destroy();
});

test('source markup stays literal and unsafe source URLs cannot become links', () => {
  const place = { id: 'fixture', name: '<img src=x>', modernName: '검증 장소', coord: [127, 37], kind: 'capital', polity: '나라', note: '<script>bad</script>', sourceIds: ['unsafe', 'safe'] };
  const snapshot = { id: 'scene', year: 1000, title: '장면', places: [place] };
  const data = buildCityHistories([snapshot]);
  const sources = new Map([['unsafe', { title: '나쁜 링크', url: 'javascript:alert(1)' }], ['safe', { title: '공식 설명', publisher: '국사편찬위원회', url: 'https://contents.history.go.kr/mobile/kc/view.do?levelId=fixture' }]]);
  const { dialog, view } = setup({ cities: data, sources }); view.open(data[0].id);
  assert.equal(dialog.querySelectorAll('img, script, a[href^="javascript:"]').length, 0);
  assert.match(dialog.querySelector('.place-map-detail').textContent, /<script>bad<\/script>/);
  assert.equal(dialog.querySelectorAll('.place-map-entry a').length, 1);
  assert.equal(dialog.querySelector('.place-map-entry a').getAttribute('rel'), 'noopener noreferrer'); view.destroy();
});

test('land refresh copies loaded coastlines without duplicate IDs or moving the original layer', () => {
  const { dialog, view, landLayer, document } = setup(); view.open();
  assert.equal(dialog.querySelectorAll('.land').length, 1);
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path'); path.setAttribute('class', 'land'); path.id = 'original-island'; landLayer.append(path);
  view.refreshMap();
  assert.equal(dialog.querySelectorAll('.land').length, 2);
  assert.equal(document.querySelectorAll('#original-island').length, 1);
  assert.equal(landLayer.childElementCount, 2);
  view.destroy();
});

test('fallback closing restores focus and destruction disables detached actions', () => {
  const { dialog, view, document, window, shares } = setup(); const opener = document.querySelector('#opener'); let restored = 0;
  Object.defineProperty(document, 'activeElement', { configurable: true, get: () => opener }); opener.focus = () => restored++;
  view.open('seoul'); assert.equal(dialog.hasAttribute('open'), true);
  key(window, dialog, 'Escape'); assert.equal(dialog.hasAttribute('open'), false); assert.equal(restored, 1);
  view.open('seoul'); const detached = dialog.querySelector('[data-action="share-city"]');
  view.destroy(); detached.click(); view.open();
  assert.equal(document.querySelector('#places-map-dialog'), null); assert.deepEqual(shares, []);
});

test('explicit city selection focuses the new detail while filtering does not steal input focus', () => {
  const { document, dialog, view, window } = setup();
  const focused = []; const create = document.createElement.bind(document);
  document.createElement = tag => { const node = create(tag); if (tag === 'h3') node.focus = () => focused.push(node.textContent); return node; };
  view.open(); assert.deepEqual(focused, []);
  dialog.querySelector('.place-map-result[data-city-id="gyeongju"]').click(); assert.deepEqual(focused, ['경주']);
  const search = dialog.querySelector('input[type="search"]'); search.value = '한양'; search.dispatchEvent(new window.Event('input'));
  assert.deepEqual(focused, ['경주']); view.destroy();
});

test('official references precede a long city timeline and readable aliases exclude internal IDs', () => {
  const { dialog, view } = setup({ recordLinks: { seoul: [{ recordId: 'official-a', year: 1394, title: '한양 자료', note: '수도 관련' }] } });
  view.open('seoul'); const detail = dialog.querySelector('.place-map-detail');
  const sections = [...detail.children];
  assert.ok(sections.indexOf(detail.querySelector('.place-map-records')) < sections.indexOf(detail.querySelector('.place-map-timeline')));
  const aliases = detail.querySelector('.place-map-aliases').textContent;
  assert.match(aliases, /한성|한양|서울/); assert.doesNotMatch(aliases, /[a-z]+-[a-z]+/i); assert.ok(aliases.length < 180);
  view.destroy();
});
