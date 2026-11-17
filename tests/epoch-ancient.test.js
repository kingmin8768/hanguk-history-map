import test from 'node:test';
import assert from 'node:assert/strict';
import { sources, snapshots, figures, polities } from '../dist/content/ancient.js';

const scene = year => snapshots.find(s => s.year === year);
const capitals = (year, name) => scene(year).places.filter(p => p.kind === 'capital' && p.polity === name);

test('ancient atlas preserves existing scene links and distinguishes capital relocations', () => {
  const existing = [[-108, 'gojoseon-108'], [427, 'goguryeo-427'], [475, 'ungjin-475'], [538, 'sabi-538'], [676, 'silla-676'], [698, 'balhae-698']];
  for (const [year, id] of existing) assert.equal(scene(year).id, id);
  assert.equal(capitals(371, '고구려')[0].siteId, 'jian');
  assert.equal(scene(371).places.find(p => p.siteId === 'pyongyang').kind, 'event');
  assert.equal(capitals(427, '고구려')[0].siteId, 'pyongyang');
  assert.equal(capitals(475, '백제')[0].siteId, 'gongju');
  assert.equal(capitals(538, '백제')[0].siteId, 'buyeo');
});

test('Gaya states, conquered capitals, and early Balhae do not collapse into one kingdom', () => {
  assert.ok(scene(532).places.some(p => p.siteId === 'gimhae' && p.kind === 'site'));
  assert.ok(scene(532).places.some(p => p.polity === '대가야' && p.kind === 'capital'));
  assert.ok(scene(562).places.some(p => p.siteId === 'goryeong' && p.kind === 'site'));
  assert.ok(scene(676).places.every(p => !['백제', '고구려'].includes(p.polity)));
  assert.deepEqual(scene(676).polityIds, ['anc-silla']);
  assert.ok(scene(698).places.some(p => /동모산/.test(p.name) && p.kind === 'capital'));
  assert.ok(scene(698).places.every(p => p.siteId !== 'sanggyeong'));
  assert.ok(scene(900).places.some(p => p.polity === '발해' && p.siteId === 'sanggyeong'));
  assert.ok(scene(-194).places.length === 0 && scene(-108).places.length === 0);
});

test('ancient source, event, figure, and polity references resolve with no future events', () => {
  const sourceIds = new Set(sources.map(s => s.id));
  const figureIds = new Set(figures.map(f => f.id));
  const polityIds = new Set(polities.map(p => p.id));
  const categories = new Set(['politics', 'war', 'culture', 'society', 'diplomacy']);
  const visit = object => {
    if (!object || typeof object !== 'object') return;
    if (object.sourceIds) for (const id of object.sourceIds) assert.ok(sourceIds.has(id), `unknown source ${id}`);
    if (object.coord) {
      assert.ok(object.coord.length === 2 && object.coord.every(Number.isFinite));
      assert.ok(object.coord[0] >= 90 && object.coord[0] <= 150);
      assert.ok(object.coord[1] >= 15 && object.coord[1] <= 60);
    }
    for (const value of Object.values(object)) if (value && typeof value === 'object') visit(value);
  };
  visit({ snapshots, figures, polities });
  for (const s of snapshots) {
    assert.ok(s.year !== 0 && Number.isInteger(s.year) && s.year >= -194 && s.year <= 900);
    assert.equal(s.era, s.year <= 313 ? 'early' : s.year <= 697 ? 'three' : s.year <= 899 ? 'northsouth' : 'later');
    for (const id of s.figureIds) assert.ok(figureIds.has(id));
    for (const id of s.polityIds) assert.ok(polityIds.has(id));
    for (const child of [...s.places, ...s.events, ...s.sections]) {
      for (const id of child.sourceIds) assert.ok(s.sourceIds.includes(id), `${s.id} omits ${id}`);
    }
    for (const e of s.events) {
      assert.ok(Number.isInteger(e.year) && e.year !== 0 && e.year <= s.year, `${s.id}: future event`);
      assert.ok(categories.has(e.category));
      if (e.placeId) assert.ok(s.places.some(p => p.id === e.placeId));
    }
  }
  for (const f of figures) {
    assert.ok(polityIds.has(f.polityId));
    assert.ok(f.stops.every((stop, index) => index === 0 || f.stops[index - 1].year <= stop.year));
  }
  for (const source of sources) {
    const url = new URL(source.url);
    assert.equal(url.protocol, 'https:');
    assert.ok(['contents.history.go.kr', 'encykorea.aks.ac.kr', 'portal.nrich.go.kr'].includes(url.hostname));
  }
  for (const records of [sources, snapshots, figures, polities]) assert.equal(new Set(records.map(x => x.id)).size, records.length);
  assert.equal(new Set(snapshots.map(s => s.year)).size, snapshots.length);
});
