import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';

const module = await import('../dist/compare-view.js').catch(() => ({}));
const place = (id, name, coord, kind, note) => ({ id, name, coord, kind, note, modernName: name === '한양' ? '서울' : name, polity: '조선', color: '#537c86', sourceIds: ['joseon-foundation'] });
const seoul = place('seoul', '한양', [126.98, 37.57], 'site', '아직 도읍이 아니며 천도 후보지로 살펴본 곳이다.');
const gaegyeong = place('gaegyeong', '개경', [126.55, 37.97], 'capital', '조선 건국 당시 도읍이다.');
const scene = (id, year, title, places) => ({ id, year, title, summary: `${title}에 관한 출처 기반 해설이다.`, note: '장소는 도시 일대의 개략 위치다.', places, sourceIds: ['joseon-foundation'] });
const snapshots = [
  scene('foundation', 1392, '개경에서 조선이 시작되다', [gaegyeong, seoul]),
  scene('move', 1394, '한양으로 천도하다', [{ ...seoul, kind: 'capital', note: '천도 뒤의 도읍이다.' }, { ...gaegyeong, kind: 'site', note: '이 시점에는 옛 도읍이다.' }]),
  scene('independence', 1919, '3·1운동과 임시정부', [{ id: 'shanghai', name: '상하이', modernName: '상하이', coord: [121.47, 31.23], kind: 'event', polity: '대한민국 임시정부', note: '임시정부의 활동 거점이다.', sourceIds: ['provisional'] }, { ...seoul, name: '경성', kind: 'event', polity: '3·1운동' }]),
  scene('liberation', 1945, '해방과 군정의 시작', [{ ...seoul, name: '서울', kind: 'event', polity: '해방·미군정', note: '정부 수립과는 구별하는 해방의 장면이다.' }]),
  scene('governments', 1948, '정부 수립', [{ ...seoul, name: '서울', kind: 'capital', polity: '대한민국', note: '정부 수립 시점의 수도다.' }])
];
function setup(sceneData = snapshots) {
  assert.equal(typeof module.createCompareView, 'function');
  const { document, window } = parseHTML('<html><body><button id="launch">비교 열기</button><svg><g id="land-layer" transform="translate(55 70) scale(2)"><path id="original-coast" class="land" d="M0 0L10 10Z" fill-rule="evenodd"/></g></svg></body></html>');
  const landLayer = document.querySelector('#land-layer'); const selections = []; const shares = []; const order = [];
  const compare = module.createCompareView({ document, snapshots: sceneData, landLayer, onSelectScene: snapshot => { order.push('scene'); selections.push(snapshot); assert.equal(document.querySelector('#compare-dialog').hasAttribute('open'), false); }, onShare: (leftId, rightId) => shares.push([leftId, rightId]) });
  return { compare, document, window, landLayer, selections, shares, order };
}
const setSelect = (select, value) => { for (const option of select.options) option.removeAttribute('selected'); [...select.options].find(option => option.value === value).setAttribute('selected', ''); };
const panel = (document, side) => document.querySelector(`.compare-panel[data-side="${side}"]`);

test('comparison opens an accessible dialog with two actual scene selectors and a verified capital-transition default', () => {
  const { compare, document } = setup(); compare.open();
  const dialog = document.querySelector('#compare-dialog');
  assert.ok(dialog.classList.contains('map-tool-dialog'));
  assert.equal(dialog.hasAttribute('open'), true);
  assert.ok(document.getElementById(dialog.getAttribute('aria-labelledby')));
  assert.equal(dialog.querySelectorAll('.compare-controls label > select').length, 2);
  assert.equal(dialog.querySelector('[data-compare-side="left"]').value, 'foundation');
  assert.equal(dialog.querySelector('[data-compare-side="right"]').value, 'move');
  assert.match(panel(document, 'left').querySelector('h3').textContent, /1392년.*개경/);
  assert.match(panel(document, 'right').querySelector('h3').textContent, /1394년.*한양/);
  assert.match(dialog.textContent, /영토.*뜻하지 않/s);
});

test('both comparison maps use identical geography and scale without cloning main-camera transforms or land IDs', () => {
  const { compare, document, landLayer } = setup(); compare.open('foundation', 'move');
  const maps = document.querySelectorAll('.compare-map');
  assert.deepEqual([...maps].map(map => map.getAttribute('viewBox')), ['0 0 1000 900', '0 0 1000 900']);
  assert.equal(panel(document, 'left').querySelector('[data-place-id="seoul"]').getAttribute('transform'), panel(document, 'right').querySelector('[data-place-id="seoul"]').getAttribute('transform'));
  for (const map of maps) {
    assert.equal(map.querySelector('.compare-land-layer path').getAttribute('d'), 'M0 0L10 10Z');
    assert.equal(map.querySelector('.compare-land-layer').hasAttribute('transform'), false);
    assert.equal(map.querySelectorAll('.compare-land-layer [id]').length, 0);
  }
  assert.equal(landLayer.querySelector('path').id, 'original-coast');
  assert.equal(landLayer.getAttribute('transform'), 'translate(55 70) scale(2)');
});

test('an out-of-view location has no misleading SVG marker but keeps its sourced role and scene action in the list', () => {
  const { compare, document, selections } = setup(); compare.open('independence', 'liberation');
  const left = panel(document, 'left');
  assert.equal(left.querySelectorAll('.compare-map [data-place-id="shanghai"]').length, 0);
  const row = left.querySelector('.compare-place-list [data-place-id="shanghai"]');
  assert.match(row.textContent, /상하이.*대한민국 임시정부.*사건.*고정 지도 범위 밖/s);
  assert.match(row.textContent, /임시정부의 활동 거점/);
  assert.ok(row.querySelector('a[href^="https:"]'));
  assert.equal(row.querySelector('a').rel, 'noopener noreferrer');
  row.querySelector('button').click();
  assert.equal(selections[0], snapshots[2]);
});

test('changing one scene preserves sourced capital and site roles and share sends only the selected IDs', () => {
  const { compare, document, window, shares, selections } = setup(); compare.open('foundation', 'move');
  assert.match(panel(document, 'left').querySelector('.compare-place-list [data-place-id="seoul"]').textContent, /유적·거점.*아직 도읍이 아니/s);
  assert.match(panel(document, 'right').querySelector('.compare-place-list [data-place-id="seoul"]').textContent, /수도.*천도 뒤/s);
  const right = document.querySelector('[data-compare-side="right"]'); setSelect(right, 'governments'); right.dispatchEvent(new window.Event('change'));
  assert.match(panel(document, 'left').querySelector('h3').textContent, /1392년/);
  assert.match(panel(document, 'right').querySelector('h3').textContent, /1948년/);
  document.querySelector('[data-action="share-compare"]').click();
  assert.deepEqual(shares, [['foundation', 'governments']]);
  assert.deepEqual(selections, []);
});

test('presets select verified scenes for capital relocation and independence versus liberation', () => {
  const { compare, document } = setup(); compare.open();
  document.querySelector('[data-preset="independence-liberation"]').click();
  assert.match(panel(document, 'left').querySelector('h3').textContent, /1919년/);
  assert.match(panel(document, 'right').querySelector('h3').textContent, /1945년/);
  document.querySelector('[data-preset="capital-transition"]').click();
  assert.match(panel(document, 'left').querySelector('h3').textContent, /1392년/);
  assert.match(panel(document, 'right').querySelector('h3').textContent, /1394년/);
});

test('refreshMap copies asynchronously available land into both maps while preserving current scene selections', () => {
  const { compare, document, landLayer } = setup(); compare.open('independence', 'governments');
  const extra = document.createElementNS('http://www.w3.org/2000/svg', 'path'); extra.id = 'new-land'; extra.setAttribute('d', 'M50 50L60 60Z'); landLayer.append(extra);
  compare.refreshMap();
  for (const map of document.querySelectorAll('.compare-map')) {
    assert.equal(map.querySelectorAll('.compare-land-layer path').length, 2);
    assert.equal(map.querySelectorAll('.compare-land-layer [id]').length, 0);
  }
  assert.equal(document.querySelector('[data-compare-side="left"]').value, 'independence');
  assert.equal(document.querySelector('[data-compare-side="right"]').value, 'governments');
});

test('keyboard marker activation closes before selecting a scene and Escape or native cancellation restores focus', () => {
  const { compare, document, window, selections, order } = setup();
  const launch = document.querySelector('#launch'); launch.focus = () => order.push('focus');
  Object.defineProperty(document, 'activeElement', { configurable: true, get: () => launch });
  compare.open('foundation', 'move');
  const enter = new window.Event('keydown', { bubbles: true, cancelable: true }); enter.key = 'Enter';
  panel(document, 'right').querySelector('.compare-place-marker').dispatchEvent(enter);
  assert.equal(selections[0], snapshots[1]);
  assert.deepEqual(order, ['focus', 'scene']);
  compare.open();
  document.querySelector('#compare-dialog').dispatchEvent(new window.Event('cancel', { cancelable: true }));
  assert.equal(document.querySelector('#compare-dialog').hasAttribute('open'), false);
  compare.open(); const escape = new window.Event('keydown', { bubbles: true, cancelable: true }); escape.key = 'Escape'; document.querySelector('#compare-dialog').dispatchEvent(escape);
  assert.equal(document.querySelector('#compare-dialog').hasAttribute('open'), false);
  assert.equal(order.filter(event => event === 'focus').length, 3);
});

test('unknown scene IDs fall back safely and destruction removes only the owned comparison UI', () => {
  const { compare, document, landLayer } = setup(); compare.open('missing', '<script>');
  assert.equal(document.querySelector('[data-compare-side="left"]').value, 'foundation');
  assert.equal(document.querySelector('[data-compare-side="right"]').value, 'move');
  compare.close(); assert.equal(document.querySelector('#compare-dialog').hasAttribute('open'), false);
  compare.destroy(); compare.open(); compare.refreshMap();
  assert.equal(document.querySelector('#compare-dialog'), null);
  assert.ok(landLayer.isConnected);
});
