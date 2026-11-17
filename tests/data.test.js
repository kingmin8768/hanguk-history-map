import test from 'node:test';
import assert from 'node:assert/strict';

const data = await import('../dist/data.js').catch(() => ({}));

test('the atlas offers ordered documented snapshots without a year zero', () => {
  assert.ok(Array.isArray(data.SNAPSHOTS), 'snapshot data must be exported');
  assert.ok(data.SNAPSHOTS.length >= 100, 'historical gaps require at least 100 researched scenes');
  assert.ok(data.SNAPSHOTS[0].year <= -194);
  assert.ok(data.SNAPSHOTS.at(-1).year >= 2018);
  const ids = new Set();
  let previous = -Infinity;
  for (const snapshot of data.SNAPSHOTS) {
    assert.ok(Number.isInteger(snapshot.year) && snapshot.year !== 0);
    assert.ok(snapshot.year > previous, 'timeline selection requires strictly increasing years');
    assert.ok(!ids.has(snapshot.id), 'URL snapshot IDs must be unique');
    ids.add(snapshot.id);
    previous = snapshot.year;
  }
});

test('every displayed historical claim has resolvable authoritative sources', () => {
  assert.ok(Array.isArray(data.SOURCES));
  assert.ok(Array.isArray(data.ERAS));
  assert.ok(Array.isArray(data.SNAPSHOTS));
  const sources = new Map(data.SOURCES.map(source => [source.id, source]));
  assert.equal(sources.size, data.SOURCES.length);
  for (const source of data.SOURCES) {
    assert.ok(source.title && source.publisher);
    const url = new URL(source.url);
    assert.equal(url.protocol, 'https:');
    const roots = ['go.kr', 'aks.ac.kr', 'korea.kr', 'i815.or.kr', '518.org', 'un.org', 'unesco.org', 'nobelprize.org', 'svenskaakademien.se', 'swcf.or.kr'];
    assert.ok(roots.some(root => url.hostname === root || url.hostname.endsWith('.' + root)), `unexpected source host: ${url.hostname}`);
  }
  const eras = new Set(data.ERAS.map(era => era.id));
  const checkSources = entity => {
    assert.ok(entity.sourceIds.length > 0, 'source links must not be empty');
    for (const id of entity.sourceIds) assert.ok(sources.has(id), `unresolved source: ${id}`);
  };
  for (const snapshot of data.SNAPSHOTS) {
    assert.ok(eras.has(snapshot.era));
    assert.ok(snapshot.title && snapshot.kicker && snapshot.summary && snapshot.note && snapshot.color);
    checkSources(snapshot);
    assert.ok(snapshot.sections?.length >= 2, `missing contextual sections at ${snapshot.year}`);
    for (const entity of [...snapshot.places, ...snapshot.events, ...snapshot.sections]) {
      checkSources(entity);
      for (const id of entity.sourceIds) assert.ok(snapshot.sourceIds.includes(id), `snapshot source panel omits ${id}`);
    }
  }
});

test('map markers are valid regional coordinates and event targets resolve', () => {
  assert.ok(Array.isArray(data.SNAPSHOTS));
  for (const snapshot of data.SNAPSHOTS) {
    const placeIds = new Set();
    for (const place of snapshot.places) {
      assert.ok(!placeIds.has(place.id));
      placeIds.add(place.id);
      assert.equal(place.coord.length, 2);
      const [longitude, latitude] = place.coord;
      assert.ok(Number.isFinite(longitude) && longitude >= 100 && longitude <= 145);
      assert.ok(Number.isFinite(latitude) && latitude >= 25 && latitude <= 52);
      assert.ok(['capital', 'event', 'site'].includes(place.kind));
      assert.ok(place.name && place.modernName && place.polity && place.note);
    }
    for (const event of snapshot.events) {
      assert.ok(Number.isInteger(event.year) && event.year !== 0 && event.year <= snapshot.year);
      if (event.placeId) assert.ok(placeIds.has(event.placeId), `unresolved event place: ${event.placeId}`);
    }
  }
});

test('capital markers follow documented relocations rather than modern locations', () => {
  assert.ok(Array.isArray(data.SNAPSHOTS));
  const capitalAt = (year, polity) => data.SNAPSHOTS.find(snapshot => snapshot.year === year).places
    .filter(place => place.kind === 'capital' && place.polity === polity).map(place => place.name);
  for (const [year, polity, name] of [[475, '백제', '웅진'], [538, '백제', '사비'], [918, '고려', '철원'], [918, '발해', '상경'], [936, '고려', '개경'], [1392, '조선', '개경'], [1394, '조선', '한양'], [1953, '대한민국', '부산']]) {
    assert.ok(capitalAt(year, polity).some(value => value.includes(name)), `${year} ${polity} capital should be ${name}`);
  }
});

test('the north and south coexist in the Balhae era and government formation is separate from liberation', () => {
  assert.ok(Array.isArray(data.SNAPSHOTS));
  const snapshotAt = year => data.SNAPSHOTS.find(snapshot => snapshot.year === year);
  const polities = year => snapshotAt(year).places.map(place => place.polity);
  assert.ok(polities(698).includes('신라') && polities(698).some(name => name.includes('발해')));
  assert.ok(polities(918).includes('발해'));
  assert.ok(!polities(1945).includes('대한민국'));
  assert.ok(polities(1948).includes('대한민국') && polities(1948).includes('조선민주주의인민공화국'));
  assert.ok(!snapshotAt(1948).places.some(place => place.name === '평양' && place.kind === 'capital'));
  assert.ok(!snapshotAt(1953).places.some(place => place.name === '서울' && place.kind === 'capital'));
});

test('an unverified Gojoseon royal city is not pinned as an exact capital', () => {
  assert.ok(Array.isArray(data.SNAPSHOTS));
  const snapshot = data.SNAPSHOTS.find(snapshot => snapshot.year === -108);
  assert.ok(!snapshot.places.some(place => place.kind === 'capital'));
});

test('all original deep links survive the enriched chronology', () => {
  const ids = ['gojoseon-108', 'goguryeo-427', 'ungjin-475', 'sabi-538', 'silla-676', 'balhae-698', 'goryeo-918', 'unification-936', 'joseon-1392', 'hanyang-1394', 'hunmin-1446', 'imjin-1592', 'empire-1897', 'annexation-1910', 'independence-1919', 'liberation-1945', 'governments-1948', 'war-1950', 'armistice-1953', 'democracy-1987'];
  for (const id of ids) assert.ok(data.SNAPSHOTS.some(snapshot => snapshot.id === id), `broken original scene URL ${id}`);
});

test('biographies, political profiles and scene links all have sourced substance', () => {
  assert.ok(data.FIGURES?.length >= 30);
  assert.ok(data.POLITIES?.length >= 15);
  const sourceIds = new Set(data.SOURCES.map(source => source.id));
  const figures = new Set(data.FIGURES.map(figure => figure.id));
  const polities = new Set(data.POLITIES.map(polity => polity.id));
  assert.equal(figures.size, data.FIGURES.length);
  assert.equal(polities.size, data.POLITIES.length);
  for (const entity of [...data.FIGURES, ...data.POLITIES]) {
    assert.ok(entity.summary.length >= 20 && entity.summary.length + entity.sections.reduce((length, section) => length + section.body.length, 0) >= 180, `insufficient contextual explanation: ${entity.id}`);
    assert.ok(entity.sections.length >= 2, entity.id);
    for (const part of [entity, ...entity.sections, ...(entity.stops || [])]) {
      assert.ok(part.sourceIds.length > 0, entity.id);
      for (const source of part.sourceIds) assert.ok(sourceIds.has(source), `${entity.id}: ${source}`);
    }
    if (entity.polityId) assert.ok(polities.has(entity.polityId), entity.id);
    for (const stop of entity.stops || []) {
      assert.ok(Number.isInteger(stop.year) && stop.year !== 0, entity.id);
      assert.ok(stop.coord.length === 2 && stop.coord.every(Number.isFinite), entity.id);
    }
  }
  for (const snapshot of data.SNAPSHOTS) {
    assert.ok(snapshot.events.every(event => ['politics', 'war', 'culture', 'society', 'diplomacy'].includes(event.category)), `missing event category ${snapshot.id}`);
    for (const id of snapshot.figureIds || []) assert.ok(figures.has(id), `${snapshot.id}: ${id}`);
    for (const id of snapshot.polityIds || []) assert.ok(polities.has(id), `${snapshot.id}: ${id}`);
  }
});
