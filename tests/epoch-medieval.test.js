import test from 'node:test';
import assert from 'node:assert/strict';
import { sources, snapshots, figures, polities } from '../dist/content/medieval.js';

const scene = year => snapshots.find(s => s.year === year);
const capitals = year => scene(year).places.filter(p => p.kind === 'capital' && p.polity === '고려').map(p => p.siteId);

test('medieval atlas keeps foundation, relocation, coexistence, and unification distinct', () => {
  assert.equal(scene(918).id, 'goryeo-918');
  assert.equal(scene(936).id, 'unification-936');
  assert.deepEqual(capitals(918), ['cheorwon']);
  assert.deepEqual(capitals(919), ['gaeseong']);
  assert.ok(scene(918).places.some(p => p.polity === '발해' && p.kind === 'capital'));
  assert.ok(scene(926).places.some(p => p.siteId === 'sanggyeong' && p.kind === 'event'));
  assert.ok(snapshots.filter(s => s.year >= 926).every(s => !s.places.some(p => p.polity === '발해' && p.kind === 'capital')));
  assert.ok(scene(936).places.some(p => p.siteId === 'gyeongju' && p.kind === 'site'));
  assert.ok(scene(936).places.some(p => p.siteId === 'jeonju' && p.kind === 'site'));
});

test('pre-foundation places do not inherit the later Goryeo polity', () => {
  for (const s of snapshots.filter(s => s.year < 918)) {
    assert.ok(s.places.every(p => p.polity !== '고려'), `${s.id} labels a place as Goryeo before 918`);
  }
  assert.equal(scene(905).places.find(p => p.siteId === 'naju').polity, '마진·궁예 정권');
});

test('Ssangseong markers after the 1356 recovery identify Goryeo administration', () => {
  for (const year of [1356, 1366]) {
    assert.equal(scene(year).places.find(p => p.id === 'med-ssangseong').polity, '고려');
  }
});

test('Ganghwa capital scenes end at the 1270 return and refuge is not a capital', () => {
  assert.deepEqual(capitals(1232), ['ganghwa']);
  assert.deepEqual(capitals(1251), ['ganghwa']);
  assert.deepEqual(capitals(1270), ['gaeseong']);
  assert.equal(scene(1270).places.find(p => p.siteId === 'ganghwa').kind, 'site');
  assert.equal(scene(1011).places.find(p => p.siteId === 'naju').kind, 'event');
  assert.ok(scene(1135).places.find(p => p.siteId === 'pyongyang').kind !== 'capital');
});

test('all medieval references, dates, categories, and child source citations resolve', () => {
  const sourceIds = new Set(sources.map(s => s.id));
  const figureIds = new Set(figures.map(f => f.id));
  const polityIds = new Set(polities.map(p => p.id));
  const categories = new Set(['politics', 'war', 'culture', 'society', 'diplomacy']);
  const checkSources = object => {
    if (!object || typeof object !== 'object') return;
    if (object.sourceIds) for (const id of object.sourceIds) assert.ok(sourceIds.has(id), `unknown source ${id}`);
    if (object.coord) {
      assert.equal(object.coord.length, 2);
      assert.ok(object.coord.every(Number.isFinite));
      assert.ok(object.coord[0] >= -180 && object.coord[0] <= 180);
      assert.ok(object.coord[1] >= -90 && object.coord[1] <= 90);
    }
    for (const value of Object.values(object)) if (value && typeof value === 'object') checkSources(value);
  };
  checkSources({ snapshots, figures, polities });
  for (const s of snapshots) {
    assert.ok(s.year >= 901 && s.year <= 1391);
    assert.equal(s.era, s.year < 936 ? 'later' : 'goryeo');
    for (const id of s.figureIds) assert.ok(figureIds.has(id), `unknown figure ${id}`);
    for (const id of s.polityIds) assert.ok(polityIds.has(id), `unknown polity ${id}`);
    for (const child of [...s.places, ...s.events, ...s.sections]) {
      for (const id of child.sourceIds) assert.ok(s.sourceIds.includes(id), `${s.id} misses ${id}`);
    }
    for (const e of s.events) {
      assert.ok(e.year <= s.year, `${s.id} includes a future event`);
      assert.ok(categories.has(e.category));
      if (e.placeId) assert.ok(s.places.some(p => p.id === e.placeId));
    }
  }
  for (const f of figures) {
    assert.ok(polityIds.has(f.polityId));
    assert.ok(f.stops.every((s, i) => i === 0 || f.stops[i - 1].year <= s.year));
  }
  for (const s of sources) {
    const url = new URL(s.url);
    assert.equal(url.protocol, 'https:');
    assert.ok(['contents.history.go.kr', 'encykorea.aks.ac.kr'].includes(url.hostname));
  }
});

test('medieval entries have independent identifiers and substantive section records', () => {
  assert.ok(snapshots.length >= 24 && snapshots.length <= 30);
  assert.ok(figures.length >= 8);
  assert.ok(polities.length >= 3);
  assert.equal(new Set(snapshots.map(s => s.year)).size, snapshots.length);
  for (const group of [sources, snapshots, figures, polities]) assert.equal(new Set(group.map(x => x.id)).size, group.length);
  for (const s of snapshots) {
    assert.ok(s.sections.length >= 2 && s.sections.length <= 3);
    assert.ok(s.events.length >= 2 && s.events.length <= 4);
    assert.ok(s.places.length >= 2 && s.places.length <= 5);
    assert.ok(s.sections.every(section => section.body.length > 60 && section.sourceIds.length > 0));
  }
  assert.ok(polities.find(p => p.id === 'med-later-three').capitalNames.length === 0);
  assert.ok(polities.find(p => p.id === 'med-yuan-period').capitalNames.length === 0);
  assert.ok(snapshots.every(s => s.tags.length > 0));
});
