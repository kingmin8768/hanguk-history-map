import test from 'node:test';
import assert from 'node:assert/strict';

const model = await import('../dist/model.js').catch(() => ({}));
const snapshots = [{ id: 'early', year: -108, title: '고조선', era: '고대', summary: '멸망', places: [], events: [] }, { id: 'three', year: 475, title: '삼국', era: '고대', summary: '천도', places: [{ name: '웅진', modernName: '공주', note: '백제 도읍' }], events: [] }, { id: 'modern', year: 1948, title: '현대', era: '현대', summary: '', places: [], events: [{ title: '정부 수립', description: '대한민국' }] }];

test('formats historical years without a year zero', () => {
  assert.equal(typeof model.formatYear, 'function');
  assert.equal(model.formatYear(-108), '기원전 108년');
  assert.equal(model.formatYear(475), '475년');
  assert.throws(() => model.formatYear(0), RangeError);
});
test('resolves to the latest documented snapshot, clamping before the first', () => {
  assert.equal(typeof model.getSnapshotForYear, 'function');
  assert.equal(model.getSnapshotForYear(snapshots, 918).id, 'three');
  assert.equal(model.getSnapshotForYear(snapshots, -200).id, 'early');
  assert.equal(model.getSnapshotForYear(snapshots, 1948).id, 'modern');
  assert.throws(() => model.getSnapshotForYear(snapshots, 0), RangeError);
});
test('searches historical and modern place names and event text', () => {
  assert.equal(typeof model.searchAtlas, 'function');
  assert.equal(model.searchAtlas(snapshots, '공주')[0].snapshot.id, 'three');
  assert.equal(model.searchAtlas(snapshots, '정부')[0].snapshot.id, 'modern');
  assert.deepEqual(model.searchAtlas(snapshots, '없는지명'), []);
  assert.deepEqual(model.searchAtlas(snapshots, '  '), []);
});
test('searches the Korean era label rather than just the internal era identifier', () => {
  const results = model.searchAtlas([{ ...snapshots[0], era: 'three', title: '기록', summary: '' }], '삼국', [{ id: 'three', label: '삼국' }]);
  assert.equal(results[0]?.snapshot.id, 'early');
});
test('geographic projection round trips Korean peninsula coordinates', () => {
  assert.equal(typeof model.project, 'function');
  assert.equal(typeof model.unproject, 'function');
  for (const point of [[126.978, 37.566], [129.075, 35.18], [126.53, 33.5], [126, 41]]) {
    const result = model.unproject(model.project(point));
    assert.ok(Math.abs(result[0] - point[0]) < 1e-8);
    assert.ok(Math.abs(result[1] - point[1]) < 1e-8);
  }
});
