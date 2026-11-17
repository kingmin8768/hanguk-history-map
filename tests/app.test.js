import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseHTML } from 'linkedom';
import { SNAPSHOTS } from '../dist/data.js';
import * as atlasData from '../dist/data.js';
import { project } from '../dist/model.js';

const app = await import('../dist/app.js').catch(() => ({}));
const html = await readFile(new URL('../dist/index.html', import.meta.url), 'utf8');

async function setup({ hash = '' } = {}) {
  const { document, window } = parseHTML(html);
  // LinkeDOM does not reflect the checked HTML attribute into the checked property.
  document.querySelectorAll('input[type="checkbox"]').forEach(input => { input.checked = input.hasAttribute('checked'); });
  window.location = { hash, href: `https://example.org/${hash}` };
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
  const shown = Number(document.querySelector('#year-input').value);
  assert.ok(shown <= 1500 && shown > 1394);
  assert.match(document.querySelector('#chronicle-date').textContent, new RegExp(String(shown)));
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
  const shanghai = SNAPSHOTS[index].places.find(place => place.siteId === 'shanghai' || place.name === '상하이');
  const point = project(shanghai.coord);
  const { x, y, zoom } = atlas.state;
  assert.ok(point[0] * zoom + x > 40 && point[0] * zoom + x < 900);
  assert.ok(point[1] * zoom + y > 100 && point[1] * zoom + y < 810);
  document.querySelector(`[data-place-id="${shanghai.id}"]`).dispatchEvent(new document.defaultView.Event('click'));
  assert.match(document.querySelector('#place-popup').textContent, /상하이/);
  atlas.destroy();
});

test('nearby Seoul and Myeongdong markers have separate hit targets and a location connector', async () => {
  const { document, atlas } = await setup();
  atlas.selectSnapshot(SNAPSHOTS.findIndex(snapshot => snapshot.year === 1987));
  const scene = SNAPSHOTS.find(snapshot => snapshot.year === 1987);
  const seoul = scene.places.find(place => place.kind === 'capital' && place.name === '서울');
  const myeongdong = scene.places.find(place => place.name.includes('명동'));
  const a = document.querySelector(`[data-place-id="${seoul.id}"]`);
  const b = document.querySelector(`[data-place-id="${myeongdong.id}"]`);
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

test('a scene offers sourced detailed reading and four keyboard-accessible panels', async () => {
  const { document, window, atlas } = await setup();
  document.querySelector('#details-tab').click();
  assert.equal(document.querySelector('#details-content').hidden, false);
  assert.ok(document.querySelectorAll('#details-content .scene-section').length >= 2);
  assert.ok(document.querySelector('#details-content a[href^="https:"]'));
  const event = new window.Event('keydown', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'key', { value: 'ArrowRight' });
  document.querySelector('#details-tab').dispatchEvent(event);
  assert.equal(document.querySelector('#places-tab').getAttribute('aria-selected'), 'true');
  atlas.destroy();
});

test('the integrated explorer opens and selecting an era record returns to its map scene', async () => {
  const { document, atlas } = await setup();
  document.querySelector('#explore-open').click();
  assert.ok(document.querySelector('#explorer-dialog[open]'));
  assert.ok(document.querySelector('#explorer-dialog .chronology-row'));
  const target = document.querySelector('#explorer-dialog .chronology-row');
  const targetId = target.getAttribute('data-snapshot-id');
  target.querySelector('.explorer-actions button').click();
  assert.equal(document.querySelector('#explorer-dialog').hasAttribute('open'), false);
  assert.equal(SNAPSHOTS[atlas.state.index].id, targetId);
  assert.equal(document.querySelector('#chronicle-title').textContent, SNAPSHOTS[atlas.state.index].title);
  atlas.destroy();
});

test('event search displays the event year and reveals its event card after selection', async () => {
  const { document, window, atlas } = await setup();
  document.querySelector('#search-open').click();
  const input = document.querySelector('#search-input');
  input.value = '명량해전';
  input.dispatchEvent(new window.Event('input'));
  const result = [...document.querySelectorAll('.search-result')].find(button => button.querySelector('.result-type').textContent === '사건');
  assert.ok(result);
  assert.match(result.querySelector('.result-year').textContent, /1597/);
  result.click();
  assert.equal(document.querySelector('#events-content').hidden, false);
  assert.equal(document.querySelector('#events-tab').getAttribute('aria-selected'), 'true');
  assert.ok([...document.querySelectorAll('#events-content .event-title')].some(title => title.textContent.includes('명량')));
  atlas.destroy();
});

test('a biography route shows verified stops and manual scene navigation clears the overlay', async () => {
  const figure = atlasData.FIGURES?.find(item => item.stops.length >= 2 && item.stops.at(-1).year < SNAPSHOTS.at(-1).year);
  assert.ok(figure, 'a sourced biography with multiple activity points is required');
  const { document, window, atlas } = await setup();
  atlas.explorer.open('figures', figure.id);
  document.querySelector('[data-action="show-route"]').click();
  assert.equal(atlas.state.selectedFigure, figure.id);
  assert.equal(document.querySelectorAll('.figure-route-stop').length, figure.stops.length);
  assert.equal(document.querySelector('#active-route').hidden, false);
  assert.ok(window.location.hash.includes(`figure=${figure.id}`));
  document.querySelector('#next').click();
  assert.equal(atlas.state.selectedFigure, null);
  assert.equal(document.querySelector('#active-route').hidden, true);
  assert.equal(document.querySelectorAll('.figure-route-stop').length, 0);
  atlas.destroy();
});

test('a shared biography route restores from the scene URL', async () => {
  const figure = atlasData.FIGURES?.find(item => item.stops.length >= 2);
  assert.ok(figure);
  const { document, atlas } = await setup({ hash: `#balhae-698?figure=${encodeURIComponent(figure.id)}` });
  assert.equal(atlas.state.selectedFigure, figure.id);
  assert.match(document.querySelector('#active-route-name').textContent, new RegExp(figure.name));
  atlas.destroy();
});

test('pressing an interactive figure stop does not capture it as a map drag', async () => {
  const figure = atlasData.FIGURES.find(item => item.stops.length >= 2);
  const { document, window, atlas } = await setup();
  atlas.explorer.open('figures', figure.id);
  document.querySelector('[data-action="show-route"]').click();
  const map = document.querySelector('#map');
  let captures = 0;
  map.setPointerCapture = () => { captures += 1; };
  map.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1000, height: 900 });
  const event = new window.Event('pointerdown', { bubbles: true });
  for (const [key, value] of Object.entries({ button: 0, pointerId: 1, clientX: 400, clientY: 300 })) Object.defineProperty(event, key, { value });
  document.querySelector('.figure-route-stop circle').dispatchEvent(event);
  assert.equal(captures, 0);
  assert.equal(map.classList.contains('is-dragging'), false);
  document.querySelector('.figure-route-stop').dispatchEvent(new window.Event('click'));
  assert.equal(document.querySelector('#place-popup').hidden, false);
  atlas.destroy();
});

test('the source library can filter official documents and explain a zero-match result', async () => {
  const { document, window, atlas } = await setup();
  const input = document.querySelector('#source-filter');
  input.value = '이검색어에해당하는출처는없음';
  input.dispatchEvent(new window.Event('input'));
  assert.match(document.querySelector('#source-count').textContent, /0개/);
  assert.equal([...document.querySelectorAll('#all-sources .source-item')].filter(item => !item.hidden).length, 0);
  input.value = '';
  input.dispatchEvent(new window.Event('input'));
  assert.equal([...document.querySelectorAll('#all-sources .source-item')].filter(item => !item.hidden).length, atlasData.SOURCES.length);
  atlas.destroy();
});
