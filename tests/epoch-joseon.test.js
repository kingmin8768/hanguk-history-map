import test from 'node:test';
import assert from 'node:assert/strict';
import { snapshots, figures, polities, sources } from '../dist/content/joseon.js';

const scene = id => snapshots.find(item => item.id === id);

test('Joseon founding, relocation, and wartime refuge remain distinct', () => {
  const founding = scene('joseon-1392');
  assert.deepEqual(founding.places.filter(p => p.kind === 'capital').map(p => p.siteId), ['gaeseong']);
  assert.ok(scene('hanyang-1394').places.some(p => p.kind === 'capital' && p.siteId === 'seoul'));
  const uiju = scene('imjin-1592').places.find(p => p.siteId === 'uiju');
  assert.equal(uiju.kind, 'event');
  assert.match(uiju.note, /수도.*아니다/);
});

test('the writing system and its explanatory book retain separate dates', () => {
  const events = scene('hunmin-1446').events;
  assert.ok(events.some(e => e.year === 1443 && /창제/.test(e.title)));
  assert.ok(events.some(e => e.year === 1446 && /해례본/.test(e.title)));
});

test('tax reform starts in Gyeonggi and does not imply instant national implementation', () => {
  const daedong = scene('jos-daedong-1608');
  assert.match(daedong.summary, /경기도.*시험 시행/);
  assert.match(daedong.note, /한꺼번에.*아니/);
  assert.ok(daedong.events.every(e => e.year <= 1608));
});

test('a period overview is identified as a period rather than another kingdom', () => {
  for (const id of ['jos-early-period', 'jos-war-period', 'jos-late-period']) {
    assert.match(polities.find(p => p.id === id).name, /시대 구분/);
  }
});

test('Joseon references and evidence remain complete across linked records', () => {
  const knownSources = new Set(sources.map(s => s.id));
  const knownFigures = new Set(figures.map(f => f.id));
  const knownPolities = new Set(polities.map(p => p.id));
  for (const s of snapshots) {
    assert.ok(s.sections.length >= 2 && s.sections.length <= 3, s.id);
    assert.ok(s.events.length >= 2 && s.events.length <= 4, s.id);
    // Sparse biographical evidence is not a reason to invent a second location.
    assert.ok(s.places.length >= (s.id === 'jos-map-1861' ? 1 : 2) && s.places.length <= 5, s.id);
    for (const child of [...s.sections, ...s.events, ...s.places]) {
      assert.ok(child.sourceIds.length, s.id);
      for (const id of child.sourceIds) {
        assert.ok(knownSources.has(id), `${s.id}: ${id}`);
        assert.ok(s.sourceIds.includes(id), `${s.id}: omitted ${id}`);
      }
    }
    for (const e of s.events) {
      assert.ok(e.year <= s.year, `${s.id}: future event`);
      if (e.placeId) assert.ok(s.places.some(p => p.id === e.placeId), `${s.id}: missing place`);
    }
    for (const id of s.figureIds) assert.ok(knownFigures.has(id), id);
    for (const id of s.polityIds) assert.ok(knownPolities.has(id), id);
  }
  for (const f of figures) {
    assert.ok(snapshots.some(s => s.figureIds.includes(f.id)), f.id);
    assert.ok(knownPolities.has(f.polityId), f.id);
    for (const child of [...f.sections, ...f.stops]) {
      for (const id of child.sourceIds) assert.ok(knownSources.has(id), `${f.id}: ${id}`);
    }
  }
  assert.equal(new Set(snapshots.map(s => s.year)).size, snapshots.length);
});
