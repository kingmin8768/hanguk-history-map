import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseHTML } from 'linkedom';
import { SNAPSHOTS } from '../dist/data.js';
import { project } from '../dist/model.js';

const app = await import('../dist/app.js').catch(() => ({}));
const html = await readFile(new URL('../dist/index.html', import.meta.url), 'utf8');

async function setup() {
  const { document, window } = parseHTML(html);
  // LinkeDOM does not reflect the checked HTML attribute into the checked property.
  document.querySelectorAll('input[type="checkbox"]').forEach(input => { input.checked = input.hasAttribute('checked'); });
  window.location = { hash: '', href: 'https://example.org/' };
  window.history = { replaceState(_state, _title, hash) { window.location.hash = hash; } };
  const atlas = await app.initAtlas({ document, window, fetch: async () => ({ ok: true, json: async () => ({ type: 'FeatureCollection', features: [] }) }) });
  return { document, window, atlas };
}

test('app starts and manual navigation keeps map and chronicle on the same snapshot', async () => {
  assert.equal(typeof app.initAtlas, 'function');
  const { document, atlas } = await setup();
  const initial = document.querySelector('#chronicle-title').textContent;
  document.querySelector('#next').click();
  assert.notEqual(document.querySelector('#chronicle-title').textContent, initial);
  assert.equal(document.querySelector('#map-title').textContent, document.querySelector('#chronicle-title').textContent);
  assert.match(document.querySelector('#chronicle-date').textContent, /년/);
  atlas.destroy();
});

test('search has selectable sourced results and a clear empty state', async () => {
  assert.equal(typeof app.initAtlas, 'function');
  const { document, window, atlas } = await setup();
  const input = document.querySelector('#search-input');
  input.value = '발해';
  input.dispatchEvent(new window.Event('input'));
  assert.ok(document.querySelectorAll('.search-result').length > 0);
  input.value = '존재하지않는검색어';
  input.dispatchEvent(new window.Event('input'));
  assert.match(document.querySelector('#search-hint').textContent, /없/);
  atlas.destroy();
});

test('year input rejects year zero and explains between-snapshot selection', async () => {
  assert.equal(typeof app.initAtlas, 'function');
  const { document, window, atlas } = await setup();
  const form = document.querySelector('#year-form');
  document.querySelector('#year-input').value = '0';
  form.dispatchEvent(new window.Event('submit', { cancelable: true }));
  assert.match(document.querySelector('#toast').textContent, /0년/);
  document.querySelector('#year-input').value = '1500';
  form.dispatchEvent(new window.Event('submit', { cancelable: true }));
  assert.match(document.querySelector('#toast').textContent, /대표 시점/);
  assert.match(document.querySelector('#chronicle-date').textContent, /1446/);
  atlas.destroy();
});

test('a failed basemap request leaves the chronology usable and exposes a status', async () => {
  assert.equal(typeof app.initAtlas, 'function');
  const { document, window } = parseHTML(html);
  window.location = { hash: '', href: 'https://example.org/' };
  window.history = { replaceState() {} };
  const atlas = await app.initAtlas({ document, window, fetch: async () => { throw new Error('offline'); } });
  assert.match(document.querySelector('#map-load-status').textContent, /불러오지 못/);
  document.querySelector('#next').click();
  assert.ok(document.querySelector('#snapshot-sources a'));
  atlas.destroy();
});

test('the 1919 scene frames Shanghai inside the map and its location is selectable', async () => {
  const { document, atlas } = await setup();
  const index = SNAPSHOTS.findIndex(snapshot => snapshot.year === 1919);
  atlas.selectSnapshot(index);
  const shanghai = SNAPSHOTS[index].places.find(place => place.id === 'shanghai');
  const point = project(shanghai.coord);
  const { x, y, zoom } = atlas.state;
  assert.ok(point[0] * zoom + x > 40 && point[0] * zoom + x < 900);
  assert.ok(point[1] * zoom + y > 100 && point[1] * zoom + y < 810);
  document.querySelector('[data-place-id="shanghai"]').dispatchEvent(new document.defaultView.Event('click'));
  assert.match(document.querySelector('#place-popup').textContent, /상하이/);
  atlas.destroy();
});

test('nearby Seoul and Myeongdong markers have separate hit targets and a location connector', async () => {
  const { document, atlas } = await setup();
  atlas.selectSnapshot(SNAPSHOTS.findIndex(snapshot => snapshot.year === 1987));
  const a = document.querySelector('[data-place-id="seoul"]');
  const b = document.querySelector('[data-place-id="myeongdong"]');
  const xy = node => node.getAttribute('transform').match(/-?\d+(?:\.\d+)?/g).map(Number);
  const [ax, ay] = xy(a); const [bx, by] = xy(b);
  assert.ok(Math.hypot(ax - bx, ay - by) > 50);
  assert.ok(document.querySelector('.marker-connector'));
  a.dispatchEvent(new document.defaultView.Event('click')); assert.match(document.querySelector('#place-popup h3').textContent, /서울/);
  b.dispatchEvent(new document.defaultView.Event('click')); assert.match(document.querySelector('#place-popup h3').textContent, /명동/);
  atlas.destroy();
});

test('playback stops at the final snapshot and manual navigation stops playback', async t => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  const { document, atlas } = await setup();
  atlas.selectSnapshot(SNAPSHOTS.length - 2);
  document.querySelector('#play').click();
  assert.equal(atlas.state.playing, true);
  t.mock.timers.tick(3500);
  assert.equal(atlas.state.index, SNAPSHOTS.length - 1);
  assert.equal(atlas.state.playing, false);
  document.querySelector('#play').click();
  assert.equal(atlas.state.index, 0);
  document.querySelector('#next').click();
  assert.equal(atlas.state.playing, false);
  atlas.destroy();
});
