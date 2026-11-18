import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseHTML } from 'linkedom';
import { initAtlas } from '../dist/app.js';
import { FIGURES } from '../dist/data.js';
import { READING_PATHS } from '../dist/reading-paths-data.js';
import { createCorpusIndex } from '../dist/corpus-query.js';

const html = await readFile(new URL('../dist/index.html', import.meta.url), 'utf8');
const records = [
  { id: 'a', year: -2333, title: '고대 전승', body: '제공기관 분류 연대', collectionId: 'ancient', originalDate: '-2333-99-99', calendar: 'unspecified', precision: 'year' },
  { id: 'b', year: 1945, title: '광복 첫 기록', body: '해방 기록 하나', collectionId: 'modern', originalDate: '1945-08-15', calendar: 'unspecified', precision: 'day' },
  { id: 'c', year: 1945, title: '광복 두 번째 기록', body: '해방 기록 둘', collectionId: 'modern', originalDate: '1945-08-15', calendar: 'unspecified', precision: 'day' },
  { id: 'd', year: 1987, title: '민주화 기록', body: '민주주의', collectionId: 'modern', originalDate: '1987-06-10', calendar: 'unspecified', precision: 'day' },
].map(record => ({ ...record, sourceUrl: 'https://db.history.go.kr/id/tcct_1945_08_15_0010', sourceLinkType: 'article' }));
const manifest = { recordCount: 212574, collections: [{ id: 'ancient', label: '고대 자료', count: 1 }, { id: 'modern', label: '현대 자료', count: 3 }], coverage: { fromYear: -2333, toYear: 2010 }, dataset: { provider: '국사편찬위원회', title: '연표', landingUrl: 'https://www.data.go.kr/data/15051036/fileData.do', license: { name: '공공누리 제1유형', url: 'https://www.kogl.or.kr/info/licenseType1.do', attribution: '국사편찬위원회' } } };
const flush = async () => { for (let i = 0; i < 5; i++) await new Promise(resolve => setImmediate(resolve)); };
async function setup(hash = '', overrides = {}) {
  const { document, window } = parseHTML(html);
  document.querySelectorAll('input[type=checkbox]').forEach(node => { node.checked = node.hasAttribute('checked'); });
  window.location = { hash, href: `https://example.org/${hash}` };
  window.history = { replaceState(_state, _title, value) { window.location.hash = value; } };
  const index = createCorpusIndex(records);
  const corpusStore = { getManifest: async () => manifest, query: async query => index.query(query), getRecord: async id => index.getRecord(id), locate: async query => index.locate(query), distribution: async query => index.distribution(query), dispose() {}, ...overrides };
  const atlas = await initAtlas({ document, window, corpusStore, fetch: async () => ({ ok: true, json: async () => ({ features: [] }) }) });
  await flush();
  const submit = selector => document.querySelector(selector).dispatchEvent(new window.Event('submit', { cancelable: true }));
  return { document, window, atlas, submit };
}

test('main defaults to actual records and next traverses distinct records in the same year without invented map points', async () => {
  const { document, atlas } = await setup();
  assert.equal(atlas.state.mode, 'records');
  assert.match(document.querySelector('#browse-records').textContent, /212,574/);
  assert.equal(document.querySelector('#chronicle-title').textContent, records[0].title);
  document.querySelector('#next').click(); await flush();
  assert.equal(document.querySelector('#chronicle-title').textContent, records[1].title);
  document.querySelector('#next').click(); await flush();
  assert.equal(document.querySelector('#chronicle-title').textContent, records[2].title);
  assert.match(document.querySelector('#snapshot-counter').textContent, /3\s*\/\s*4/);
  assert.equal(document.querySelectorAll('.map-marker,.figure-route-stop,.capital-route').length, 0);
  assert.equal(document.querySelector('#record-map-note').hidden, false);
  document.querySelector('#browse-scenes').click();
  assert.equal(atlas.state.mode, 'scenes');
  assert.match(document.querySelector('#snapshot-counter').textContent, /130/);
  assert.equal(document.querySelector('#record-content').hidden, true);
  atlas.destroy();
});

test('main filters, exact record number, year seek, era buttons and empty results use the record collection', async () => {
  const { document, atlas, submit } = await setup();
  document.querySelector('#record-query').value = '해방';
  submit('#main-record-filters'); await flush();
  assert.match(document.querySelector('#snapshot-counter').textContent, /1\s*\/\s*2/);
  document.querySelector('#record-position').value = '2'; submit('#record-position-form'); await flush();
  assert.equal(document.querySelector('#chronicle-title').textContent, records[2].title);
  document.querySelector('#record-query').value = ''; submit('#main-record-filters'); await flush();
  document.querySelector('#year-input').value = '1946'; submit('#year-form'); await flush();
  assert.equal(document.querySelector('#chronicle-title').textContent, records[1].title);
  assert.match(document.querySelector('#toast').textContent, /1945/);
  document.querySelector('[data-era=contemporary]').click(); await flush();
  assert.match(document.querySelector('#snapshot-counter').textContent, /1\s*\/\s*3/);
  document.querySelector('#record-query').value = '존재하지않음'; submit('#main-record-filters'); await flush();
  assert.match(document.querySelector('#snapshot-counter').textContent, /0\s*\/\s*0/);
  assert.equal(document.querySelector('#play').disabled, true);
  assert.equal(document.querySelectorAll('.map-marker').length, 0);
  atlas.destroy();
});

test('record URLs preserve selected record and filter context while old scene URLs still restore scenes', async () => {
  const { document, atlas, window } = await setup('#records?record=c&q=해방&collection=modern&from=1945&to=1945&sort=desc');
  assert.equal(document.querySelector('#chronicle-title').textContent, records[2].title);
  assert.match(document.querySelector('#snapshot-counter').textContent, /2\s*\/\s*2/);
  assert.match(window.location.hash, /record=c/);
  assert.match(window.location.hash, /from=1945/);
  assert.equal(document.querySelector('#record-collection').value, 'modern');
  document.querySelector('#browse-scenes').click();
  assert.match(window.location.hash, /^#(?!records)/);
  atlas.destroy();
  const old = await setup('#balhae-698');
  assert.equal(old.atlas.state.mode, 'scenes');
  assert.match(old.document.querySelector('#chronicle-date').textContent, /698/);
  old.atlas.destroy();
});

test('record playback stops at the final record and manual navigation stops it', async t => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  const { document, atlas } = await setup();
  await atlas.recordBrowser.goTo(2);
  document.querySelector('#play').click();
  assert.equal(atlas.state.playing, true);
  t.mock.timers.tick(3500); await flush();
  assert.equal(document.querySelector('#chronicle-title').textContent, records[3].title);
  assert.equal(atlas.state.playing, false);
  document.querySelector('#play').click(); await flush();
  assert.equal(document.querySelector('#chronicle-title').textContent, records[0].title);
  document.querySelector('#next').click(); await flush();
  assert.equal(atlas.state.playing, false);
  atlas.destroy();
});

test('slider and archive main button select individual records and close the archive', async () => {
  const { document, atlas, window } = await setup();
  document.querySelector('#time-slider').value = '2';
  document.querySelector('#time-slider').dispatchEvent(new window.Event('change'));
  await flush();
  assert.equal(document.querySelector('#chronicle-title').textContent, records[2].title);
  atlas.explorer.open('records', 'b'); await flush();
  const button = document.querySelector('[data-action="open-main-record"]');
  assert.ok(button);
  button.click(); await flush();
  assert.equal(document.querySelector('#explorer-dialog').hasAttribute('open'), false);
  assert.equal(document.querySelector('#chronicle-title').textContent, records[1].title);
  atlas.destroy();
});

test('finishing a background record load cannot replace a scene selected while it was loading', async () => {
  let release;
  const index = createCorpusIndex(records);
  const { document, atlas, window } = await setup('', { query: query => new Promise(resolve => { release = () => resolve(index.query(query)); }) });
  assert.equal(atlas.recordBrowser.state.status, 'loading');
  document.querySelector('#browse-scenes').click();
  const sceneTitle = document.querySelector('#chronicle-title').textContent;
  const sceneHash = window.location.hash;
  release(); await flush();
  assert.equal(document.querySelector('#chronicle-title').textContent, sceneTitle);
  assert.equal(window.location.hash, sceneHash);
  assert.equal(atlas.state.mode, 'scenes');
  assert.equal(document.querySelector('#record-content').hidden, true);
  atlas.destroy();
});

test('an explicit record URL cancels a queued slider selection and out-of-coverage year seek remains available', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { document, window, atlas, submit } = await setup();
  document.querySelector('#time-slider').value = '2';
  document.querySelector('#time-slider').dispatchEvent(new window.Event('input'));
  window.location.hash = '#records?record=b';
  window.dispatchEvent(new window.Event('hashchange')); await flush();
  assert.equal(document.querySelector('#chronicle-title').textContent, records[1].title);
  t.mock.timers.tick(150); await flush();
  assert.equal(document.querySelector('#chronicle-title').textContent, records[1].title);
  assert.equal(document.querySelector('#year-input').hasAttribute('max'), false);
  assert.equal(document.querySelector('#year-input').hasAttribute('min'), false);
  document.querySelector('#year-input').value = '2024'; submit('#year-form'); await flush();
  assert.equal(document.querySelector('#chronicle-title').textContent, records[3].title);
  document.querySelector('#browse-scenes').click();
  assert.equal(document.querySelector('#year-input').max, '2024');
  atlas.destroy();
});

test('clearing an inactive biography overlay preserves the current record URL and unmarked map', async () => {
  const { document, window, atlas } = await setup();
  const hash = window.location.hash;
  atlas.explorer.open('figures', FIGURES[0].id);
  [...document.querySelectorAll('#explorer-dialog button')].find(button => button.textContent === '지도 활동 지점 지우기').click();
  assert.equal(window.location.hash, hash);
  assert.equal(atlas.state.mode, 'records');
  assert.equal(document.querySelectorAll('.map-marker,.figure-route-stop').length, 0);
  atlas.destroy();
});

test('record distribution reflects the current filters and clicking a bin preserves search context', async () => {
  const { document, window, atlas, submit } = await setup();
  const panel = document.querySelector('#record-distribution');
  panel.setAttribute('open', '');
  panel.dispatchEvent(new window.Event('toggle'));
  await flush();
  assert.match(document.querySelector('#distribution-caption').textContent, /4건/);
  assert.equal([...document.querySelectorAll('.distribution-bar-count')].reduce((sum, node) => sum + Number(node.textContent), 0), 4);
  document.querySelector('#record-query').value = '해방';
  submit('#main-record-filters');
  await flush();
  const bar = document.querySelector('.distribution-bar');
  assert.match(bar.getAttribute('aria-label'), /1945년.*2건/);
  bar.dispatchEvent(new window.Event('click', { bubbles: true }));
  await flush();
  assert.equal(atlas.recordBrowser.state.filters.q, '해방');
  assert.equal(atlas.recordBrowser.state.filters.fromYear, 1945);
  assert.equal(atlas.recordBrowser.state.filters.toYear, 1945);
  document.querySelector('#distribution-reset').click();
  await flush();
  assert.equal(atlas.recordBrowser.state.filters.fromYear, null);
  assert.equal(atlas.recordBrowser.state.filters.q, '해방');
  document.querySelector('#browse-scenes').click();
  assert.equal(panel.hidden, true);
  assert.equal(panel.hasAttribute('open'), false);
  atlas.destroy();
});

test('thematic reading opens sourced scenes, advances in the same path and restores a shared stop', async () => {
  const { document, window, atlas } = await setup();
  const path = READING_PATHS[0];
  document.querySelector('#reading-paths-open').click();
  assert.ok(document.querySelector('#reading-paths-dialog[open]'));
  assert.equal(document.querySelectorAll('.reading-path-card').length, READING_PATHS.length);
  document.querySelector('.reading-path-card').click();
  assert.equal(document.querySelectorAll('.reading-path-stops li').length, path.stops.length);
  document.querySelector('.reading-path-stops button').click();
  assert.equal(atlas.state.mode, 'scenes');
  assert.equal(document.querySelector('#active-reading-path').hidden, false);
  assert.equal(document.querySelector('#reading-path-note').textContent, path.stops[0].note);
  assert.ok(document.querySelector('#snapshot-sources a'));
  document.querySelector('#reading-path-next').click();
  assert.equal(window.location.hash, `#${path.stops[1].snapshotId}?path=${path.id}`);
  const restored = await setup(window.location.hash);
  assert.equal(restored.document.querySelector('#reading-path-progress').textContent, `2 / ${path.stops.length}`);
  restored.document.querySelector('#reading-path-exit').click();
  assert.equal(restored.window.location.hash, `#${path.stops[1].snapshotId}`);
  assert.equal(restored.document.querySelector('#active-reading-path').hidden, true);
  restored.atlas.destroy();
  atlas.destroy();
});
