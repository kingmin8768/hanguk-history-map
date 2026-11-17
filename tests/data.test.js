import test from 'node:test';
import assert from 'node:assert/strict';

const data = await import('../dist/data.js').catch(() => ({}));

test('the atlas offers ordered documented snapshots without a year zero', () => {
  assert.ok(Array.isArray(data.SNAPSHOTS), 'snapshot data must be exported');
  assert.ok(data.SNAPSHOTS.length >= 18 && data.SNAPSHOTS.length <= 24);
  assert.equal(data.SNAPSHOTS[0].year, -108);
  assert.equal(data.SNAPSHOTS.at(-1).year, 1987);
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
    assert.ok(['contents.history.go.kr', 'encykorea.aks.ac.kr', 'theme.archives.go.kr', 'archive.much.go.kr'].includes(url.hostname));
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
    for (const entity of [...snapshot.places, ...snapshot.events]) {
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
      assert.ok(Number.isFinite(longitude) && longitude >= 115 && longitude <= 145);
      assert.ok(Number.isFinite(latitude) && latitude >= 25 && latitude <= 50);
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
  assert.deepEqual(capitalAt(475, '백제'), ['웅진']);
  assert.deepEqual(capitalAt(538, '백제'), ['사비']);
  assert.deepEqual(capitalAt(918, '고려'), ['철원']);
  assert.deepEqual(capitalAt(918, '발해'), ['상경 용천부']);
  assert.deepEqual(capitalAt(936, '고려'), ['개경']);
  assert.deepEqual(capitalAt(1392, '조선'), ['개경']);
  assert.deepEqual(capitalAt(1394, '조선'), ['한양']);
  assert.deepEqual(capitalAt(1953, '대한민국'), ['부산']);
});

test('the north and south coexist in the Balhae era and government formation is separate from liberation', () => {
  assert.ok(Array.isArray(data.SNAPSHOTS));
  const snapshotAt = year => data.SNAPSHOTS.find(snapshot => snapshot.year === year);
  const polities = year => snapshotAt(year).places.map(place => place.polity);
  assert.ok(polities(698).includes('신라') && polities(698).includes('발해'));
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
