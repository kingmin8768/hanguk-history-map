export const CATEGORY_LABELS = Object.freeze({ politics: '정치', war: '전쟁', culture: '문화', society: '사회', diplomacy: '외교' });

const ERA_LABELS = { early: '고조선 초기 국가', three: '삼국', northsouth: '남북국', later: '후삼국', goryeo: '고려', joseon: '조선 전기', 'joseon-war': '조선 전쟁', 'joseon-late': '조선 후기', opening: '개항기', empire: '대한제국', colonial: '일제강점기', contemporary: '현대', recent: '오늘의 한국' };
const CITIES = [
  { id: 'seoul', name: '서울', aliases: ['seoul', 'hanseong', 'hanyang', 'gyeongseong', '서울', '한성', '한양', '경성'], modern: /서울|seoul/i },
  { id: 'pyongyang', name: '평양', aliases: ['pyongyang', '평양'], modern: /평양|pyongyang/i },
  { id: 'gyeongju', name: '경주', aliases: ['gyeongju', '경주', '신라 왕경', '금성'], modern: /경주|gyeongju/i },
  { id: 'gongju', name: '공주', aliases: ['gongju', 'ungjin', '공주', '웅진'], modern: /공주|gongju/i },
  { id: 'buyeo', name: '부여', aliases: ['buyeo', 'sabi', '부여', '사비'], modern: /부여|buyeo/i },
  { id: 'gaeseong', name: '개성', aliases: ['gaeseong', 'gaegyeong', 'songak', '개성', '개경', '송악'], modern: /개성|gaeseong/i },
  { id: 'cheorwon', name: '철원', aliases: ['cheorwon', '철원'], modern: /철원|cheorwon/i },
  { id: 'busan', name: '부산', aliases: ['busan', '부산'], modern: /부산|busan/i },
  { id: 'shanghai', name: '상하이', aliases: ['shanghai', '상하이', '상해'], modern: /상하이|상해|shanghai/i },
  { id: 'gimhae', name: '김해', aliases: ['gimhae', '김해', '금관가야'], modern: /김해|gimhae/i },
  { id: 'goryeong', name: '고령', aliases: ['goryeong', '고령', '대가야'], modern: /고령|goryeong/i },
  { id: 'incheon', name: '인천', aliases: ['incheon', 'jemulpo', '인천', '제물포'], modern: /인천|incheon/i },
  { id: 'gwangju', name: '광주', aliases: ['gwangju', '광주'], modern: /광주광역시|전라남도 광주|gwangju/i },
  { id: 'chongqing', name: '충칭', aliases: ['chongqing', '충칭', '중경'], modern: /충칭|중경|chongqing/i }
];

const normalize = value => String(value ?? '').normalize('NFKC').toLocaleLowerCase('ko').replace(/\s+/g, ' ').trim();
const text = values => values.flat(Infinity).filter(value => value !== undefined && value !== null).join(' ');
const sectionText = entity => (entity.sections || []).flatMap(section => [section.heading, section.body]);
const tokensFor = query => normalize(query).split(' ').filter(Boolean);
const matches = (value, tokens) => tokens.every(token => normalize(value).includes(token));

function cityIdentity(place) {
  if (place.siteId) return CITIES.find(city => city.id === place.siteId) || { id: place.siteId, name: place.modernName || place.name };
  const name = normalize(place.name);
  const id = normalize(place.id);
  const known = CITIES.find(city => city.aliases.some(alias => alias === name || alias === id || (id.startsWith(`${alias}-`) && /^[a-z]/.test(alias))))
    || CITIES.find(city => city.modern.test(place.modernName || ''));
  return known || { id: place.id, name: place.modernName || place.name };
}

/** Cities connect broad modern areas, not identical palace or archaeological sites. */
export function buildCityHistories(snapshots = []) {
  const cities = new Map();
  const seen = new Set();
  for (const snapshot of snapshots) {
    for (const place of snapshot.places || []) {
      const recordId = `${encodeURIComponent(snapshot.id)}:${encodeURIComponent(place.id)}`;
      if (seen.has(recordId)) continue;
      seen.add(recordId);
      const identity = cityIdentity(place);
      if (!cities.has(identity.id)) cities.set(identity.id, { id: identity.id, name: identity.name, aliases: [...(identity.aliases || [])], records: [] });
      const city = cities.get(identity.id);
      for (const alias of [place.name, place.modernName, place.id]) if (alias && !city.aliases.includes(alias)) city.aliases.push(alias);
      city.records.push({ id: recordId, year: snapshot.year, name: place.name, polity: place.polity, note: place.note, snapshot, place });
    }
  }
  return [...cities.values()].map(city => ({ ...city, records: city.records.sort((a, b) => a.year - b.year || a.id.localeCompare(b.id, 'ko')) })).sort((a, b) => a.name.localeCompare(b.name, 'ko') || a.id.localeCompare(b.id));
}

function snapshotText(snapshot, eraLabel) {
  return text([snapshot.title, snapshot.kicker, snapshot.summary, snapshot.note, snapshot.era, eraLabel || ERA_LABELS[snapshot.era], snapshot.year, snapshot.tags || [], sectionText(snapshot), (snapshot.events || []).flatMap(event => [event.year, event.title, event.description, CATEGORY_LABELS[event.category]]), (snapshot.places || []).flatMap(place => [place.name, place.modernName, place.polity, place.note])]);
}

export function filterTimeline(snapshots = [], { query = '', era = 'all', category = 'all' } = {}) {
  const tokens = tokensFor(query);
  return snapshots.filter(snapshot => (era === 'all' || snapshot.era === era)
    && (category === 'all' || (snapshot.events || []).some(event => event.category === category))
    && matches(snapshotText(snapshot), tokens))
    .sort((a, b) => a.year - b.year || a.id.localeCompare(b.id, 'ko'));
}

/** Rank and deduplicate first so repeated map markers cannot crowd out people or events. */
export function searchCatalogue({ snapshots = [], eras = [], figures = [], polities = [] } = {}, query = '') {
  const tokens = tokensFor(query);
  if (!tokens.length) return [];
  const needle = normalize(query);
  const eraLabels = new Map(eras.map(era => [era.id, era.label]));
  const candidates = new Map();
  let order = 0;
  function add(key, result, primary, corpus, priority = 0) {
    if (!matches(corpus, tokens)) return;
    const label = normalize(primary);
    const score = (label === needle ? 1000 : label.startsWith(needle) ? 700 : label.includes(needle) ? 500 : matches(primary, tokens) ? 400 : 100) + priority;
    const previous = candidates.get(key);
    if (!previous || previous.score < score) candidates.set(key, { result, score, order: previous?.order ?? order++ });
  }
  for (const figure of figures) add(`figure:${figure.id}`, { type: '인물', label: figure.name, figure }, figure.name, text([figure.name, figure.years, figure.role, figure.summary, sectionText(figure), (figure.stops || []).flatMap(stop => [stop.year, stop.label, stop.description])]), 20);
  for (const polity of polities) add(`polity:${polity.id}`, { type: '정치체', label: polity.name, polity }, polity.name, text([polity.name, polity.period, polity.summary, polity.capitalNames || [], sectionText(polity)]), 15);
  for (const snapshot of snapshots) {
    add(`snapshot:${snapshot.id}`, { type: '시대', label: snapshot.title, snapshot }, snapshot.title, snapshotText(snapshot, eraLabels.get(snapshot.era)));
    for (const place of snapshot.places || []) {
      const city = cityIdentity(place);
      add(`place:${city.id}:${normalize(place.name)}`, { type: '장소', label: `${place.name}${place.modernName && place.name !== place.modernName ? ` · ${place.modernName}` : ''}`, snapshot, place }, text([place.name, place.modernName]), text([place.name, place.modernName, place.polity, place.note]), 8);
    }
    for (const event of snapshot.events || []) add(`event:${event.year ?? snapshot.year}:${normalize(event.title)}`, { type: '사건', label: event.title, snapshot, event }, event.title, text([event.title, event.description, event.year, CATEGORY_LABELS[event.category]]), 10);
  }
  return [...candidates.values()].sort((a, b) => b.score - a.score || a.order - b.order).slice(0, 40).map(candidate => candidate.result);
}
