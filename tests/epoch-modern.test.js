import test from 'node:test';
import assert from 'node:assert/strict';
import { sources, snapshots, figures, polities } from '../dist/content/modern.js';

test('modern chronology preserves existing URLs and researched scene structure', () => {
  assert.ok(snapshots.length >= 32 && snapshots.length <= 40);
  assert.equal(snapshots[0].year, 1876);
  assert.equal(snapshots.at(-1).year, 2024);
  assert.equal(new Set(snapshots.map(s => s.year)).size, snapshots.length);
  assert.equal(new Set(snapshots.map(s => s.id)).size, snapshots.length);
  for (const id of ['empire-1897', 'annexation-1910', 'independence-1919', 'liberation-1945', 'governments-1948', 'war-1950', 'armistice-1953', 'democracy-1987']) {
    assert.ok(snapshots.some(s => s.id === id), `existing scene URL lost: ${id}`);
  }
  const eraFor = year => year < 1897 ? 'opening' : year < 1910 ? 'empire' : year < 1945 ? 'colonial' : year < 1988 ? 'contemporary' : 'recent';
  for (const [index, scene] of snapshots.entries()) {
    if (index) assert.ok(snapshots[index - 1].year < scene.year);
    assert.equal(scene.era, eraFor(scene.year));
    assert.ok(scene.sections.length >= 2 && scene.sections.length <= 3);
    assert.ok(scene.events.length >= 2 && scene.events.length <= 4);
    for (const section of scene.sections) assert.ok(section.body.length >= 60, `thin context: ${scene.id}`);
    for (const event of scene.events) {
      assert.ok(Number.isInteger(event.year) && event.year <= scene.year);
      assert.ok(['politics', 'war', 'culture', 'society', 'diplomacy'].includes(event.category));
      if (event.placeId) assert.ok(scene.places.some(p => p.id === event.placeId));
    }
  }
});

test('modern claims, profiles, and map markers resolve to their source panels', () => {
  const sourceIds = new Set(sources.map(s => s.id));
  const figureIds = new Set(figures.map(f => f.id));
  const polityIds = new Set(polities.map(p => p.id));
  assert.equal(sourceIds.size, sources.length);
  assert.ok(figures.length >= 10 && polities.length >= 5);
  const checkReferences = entity => {
    assert.ok(entity.sourceIds.length > 0);
    for (const id of entity.sourceIds) assert.ok(sourceIds.has(id), `unresolved source: ${id}`);
  };
  const checkCoord = coord => {
    assert.equal(coord.length, 2);
    assert.ok(coord.every(Number.isFinite));
    assert.ok(coord[0] >= 100 && coord[0] <= 145);
    assert.ok(coord[1] >= 25 && coord[1] <= 52);
  };
  for (const source of sources) {
    assert.ok(source.id.startsWith('mod-'));
    assert.equal(new URL(source.url).protocol, 'https:');
    assert.ok(source.title && source.publisher);
  }
  for (const scene of snapshots) {
    checkReferences(scene);
    for (const id of scene.figureIds) assert.ok(figureIds.has(id));
    for (const id of scene.polityIds) assert.ok(polityIds.has(id));
    assert.equal(new Set(scene.places.map(p => p.id)).size, scene.places.length);
    for (const item of [...scene.sections, ...scene.events, ...scene.places]) {
      checkReferences(item);
      for (const id of item.sourceIds) assert.ok(scene.sourceIds.includes(id), `source panel omits ${id}`);
    }
    for (const place of scene.places) {
      checkCoord(place.coord);
      assert.ok(place.siteId && ['capital', 'event', 'site'].includes(place.kind));
    }
  }
  for (const figure of figures) {
    checkReferences(figure);
    assert.ok(polityIds.has(figure.polityId));
    assert.ok(figure.sections.length >= 2);
    for (const section of figure.sections) checkReferences(section);
    for (const [index, stop] of figure.stops.entries()) {
      checkCoord(stop.coord);
      checkReferences(stop);
      if (index) assert.ok(figure.stops[index - 1].year <= stop.year);
    }
  }
  for (const polity of polities) {
    checkReferences(polity);
    assert.ok(polity.sections.length >= 2);
    for (const section of polity.sections) checkReferences(section);
  }
});

test('government markers distinguish formation, constitutional capitals, and wartime seats', () => {
  const at = year => snapshots.find(s => s.year === year);
  assert.ok(!at(1945).places.some(p => p.polity === '대한민국'));
  const pyongyang1948 = at(1948).places.find(p => p.name === '평양');
  assert.equal(pyongyang1948.kind, 'event');
  assert.match(pyongyang1948.note, /수부.*서울/);
  assert.ok(at(1950).places.some(p => p.name === '서울' && p.kind === 'capital'));
  assert.ok(!at(1950).places.some(p => p.name === '부산'));
  const busan1953 = at(1953).places.find(p => p.name === '부산');
  assert.equal(busan1953.kind, 'capital');
  assert.equal(busan1953.polity, '대한민국');
  assert.match(busan1953.note, /7월 27일/);
  assert.match(busan1953.note, /8월 15일/);
  assert.match(at(1910).events[0].description, /8월 22일/);
  assert.match(at(1910).events[1].description, /8월 29일/);
  assert.ok(at(1919).events.some(e => /4월 11일/.test(e.title)));
  assert.ok(at(1919).events.some(e => /9월/.test(e.title)));
  assert.match(polities.find(p => p.id === 'mod-colonial').summary, /역사적 시대/);
  assert.ok(at(2024).sourceIds.includes('mod-nobel-award'));
  assert.equal(new URL(sources.find(s => s.id === 'mod-nobel-award').url).hostname, 'www.svenskaakademien.se');
});
