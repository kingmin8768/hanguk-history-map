import test from 'node:test';
import assert from 'node:assert/strict';

const catalogue = await import('../dist/catalogue.js').catch(() => ({}));
const place = (id, name, modernName, extra = {}) => ({ id, name, modernName, polity: '조선', note: '도시 일대의 개략 위치', coord: [127, 37], sourceIds: ['s'], ...extra });
const scene = (id, year, extra = {}) => ({ id, year, era: 'joseon', title: id, summary: '', note: '', sections: [], tags: [], places: [], events: [], figureIds: [], polityIds: [], sourceIds: ['s'], ...extra });

test('city histories join historical city names while keeping unidentified sites separate and deduplicating scene places', () => {
  assert.equal(typeof catalogue.buildCityHistories, 'function');
  const first = place('hanyang', '한양', '서울');
  const snapshots = [
    scene('late', 1919, { places: [place('gyeongseong', '경성', '서울')] }),
    scene('early', 1394, { places: [first, first, place('mountain', '별도 산성', '경기도')] }),
    scene('ancient', 475, { places: [place('hanseong', '한성', '서울 송파 일대', { polity: '백제' })] }),
    scene('explicit', 1500, { places: [place('court', '별궁', '서울', { siteId: 'another-city' })] })
  ];
  const histories = catalogue.buildCityHistories(snapshots);
  const seoul = histories.find(city => city.id === 'seoul');
  assert.equal(seoul.name, '서울');
  assert.deepEqual(seoul.records.map(record => [record.snapshot.id, record.place.name, record.year]), [['ancient', '한성', 475], ['early', '한양', 1394], ['late', '경성', 1919]]);
  assert.equal(new Set(seoul.records.map(record => record.id)).size, 3);
  assert.ok(histories.find(city => city.id === 'mountain'));
  assert.ok(histories.find(city => city.id === 'another-city'));
  assert.deepEqual(catalogue.buildCityHistories(snapshots).find(city => city.id === 'seoul').records.map(record => record.id), seoul.records.map(record => record.id));
});

test('timeline combines text, era, and event category without changing chronological source data', () => {
  assert.equal(typeof catalogue.filterTimeline, 'function');
  const snapshots = [scene('war', 1592, { era: 'joseon-war', sections: [{ heading: '해전', body: '보급로를 지키다' }], events: [{ title: '전투', description: '수군', category: 'war' }] }), scene('book', 1446, { tags: ['문자'], events: [{ title: '훈민정음', description: '문자 반포', category: 'culture' }] }), scene('later', 1700, { events: [{ title: '개혁', description: '', category: 'politics' }] })];
  assert.deepEqual(catalogue.filterTimeline(snapshots, { query: '보급로', era: 'joseon-war', category: 'war' }).map(item => item.id), ['war']);
  assert.deepEqual(catalogue.filterTimeline(snapshots, { query: '전쟁', category: 'war' }).map(item => item.id), ['war']);
  assert.deepEqual(catalogue.filterTimeline(snapshots, { query: '보급로', era: 'joseon', category: 'war' }), []);
  assert.deepEqual(catalogue.filterTimeline(snapshots).map(item => item.id), ['book', 'war', 'later']);
  assert.deepEqual(snapshots.map(item => item.id), ['war', 'book', 'later']);
});

test('catalogue searches biographies, profile sections, event text, and Korean era labels', () => {
  assert.equal(typeof catalogue.searchCatalogue, 'function');
  const snapshots = [scene('letters', 1446, { sections: [{ heading: '문자의 원리', body: '백성이 익히기 쉬운 글자' }], places: [place('hanyang', '한양', '서울')], events: [{ title: '해례본 반포', description: '새 글자의 설명', year: 1446 }] })];
  const data = { snapshots, eras: [{ id: 'joseon', label: '조선 전기' }], figures: [{ id: 'king', name: '세종', summary: '훈민정음 창제', sections: [{ heading: '집현전', body: '학문과 토론' }] }], polities: [{ id: 'joseon', name: '조선', summary: '왕조', sections: [{ heading: '통치', body: '의정부와 육조' }] }] };
  assert.ok(catalogue.searchCatalogue(data, '백성이').some(result => result.type === '시대' && result.snapshot.id === 'letters'));
  assert.ok(catalogue.searchCatalogue(data, '조선 전기').some(result => result.type === '시대'));
  assert.ok(catalogue.searchCatalogue(data, '학문 토론').some(result => result.type === '인물' && result.figure.id === 'king'));
  assert.ok(catalogue.searchCatalogue(data, '육조').some(result => result.type === '정치체' && result.polity.id === 'joseon'));
  assert.ok(catalogue.searchCatalogue(data, '새 글자').some(result => result.type === '사건'));
  assert.deepEqual(catalogue.searchCatalogue(data, '  '), []);
});

test('search ranks exact entities before a capped list and collapses repeated city and event records', () => {
  assert.equal(typeof catalogue.searchCatalogue, 'function');
  const snapshots = Array.from({ length: 60 }, (_, index) => scene(`scene-${index}`, 1400 + index, { summary: '세종 관련 기록', places: [place('hanyang', '한양', '서울', { note: '세종 시대 수도' })], events: [{ year: 1400, title: '세종의 기록', description: '', category: 'politics' }] }));
  const results = catalogue.searchCatalogue({ snapshots, figures: [{ id: 'sejong', name: '세종', summary: '', sections: [] }], eras: [], polities: [] }, '세종');
  assert.equal(results[0].type, '인물');
  assert.equal(results[0].figure.id, 'sejong');
  assert.ok(results.length <= 40);
  assert.equal(results.filter(result => result.type === '장소').length, 1);
  assert.equal(results.filter(result => result.type === '사건').length, 1);
});
