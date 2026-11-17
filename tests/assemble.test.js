import test from 'node:test';
import assert from 'node:assert/strict';
const { assembleAtlas } = await import('../dist/assemble.js').catch(() => ({}));
const source = (id, url) => ({ id, title: id, publisher: '국사편찬위원회', url });
const scene = (id, year, sourceId) => ({ id, year, sourceIds: [sourceId], places: [], events: [], sections: [] });

test('enriching an existing year preserves its public scene URL', () => {
  assert.equal(typeof assembleAtlas, 'function');
  const result = assembleAtlas({ legacy: { sources: [source('original', 'https://example.org/a')], snapshots: [scene('old-url', 918, 'original')] }, modules: [{ sources: [], snapshots: [{ ...scene('different-url', 918, 'original'), summary: '상세 해설' }], figures: [], polities: [] }] });
  assert.equal(result.snapshots[0].id, 'old-url');
  assert.equal(result.snapshots[0].summary, '상세 해설');
});
test('the same official article on mobile and desktop is counted once and all references still resolve', () => {
  const result = assembleAtlas({ legacy: { sources: [source('old', 'https://contents.history.go.kr/mobile/kc/view.do?levelId=kc_test')], snapshots: [] }, modules: [{ sources: [source('new', 'https://contents.history.go.kr/front/kc/view.do?levelId=kc_test')], snapshots: [{ ...scene('test', 918, 'new'), sections: [{ heading: '배경', body: '내용', sourceIds: ['new'] }], places: [{ sourceIds: ['new'] }], events: [{ sourceIds: ['new'] }] }], figures: [{ id: 'f', sourceIds: ['new'], sections: [], stops: [{ sourceIds: ['new'] }] }], polities: [] }] });
  assert.equal(result.sources.length, 1);
  assert.deepEqual(result.snapshots[0].sourceIds, ['old']);
  assert.deepEqual(result.snapshots[0].sections[0].sourceIds, ['old']);
  assert.deepEqual(result.figures[0].stops[0].sourceIds, ['old']);
});
test('conflicting researched snapshots cannot silently overwrite each other', () => {
  assert.throws(() => assembleAtlas({ legacy: { sources: [], snapshots: [] }, modules: [{ sources: [], snapshots: [scene('a', 918, 'x')], figures: [], polities: [] }, { sources: [], snapshots: [scene('b', 918, 'x')], figures: [], polities: [] }] }), /duplicate.*918/i);
});
