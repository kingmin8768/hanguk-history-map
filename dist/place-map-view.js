import { formatYear, project } from './model.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const normalize = value => String(value ?? '').normalize('NFKC').toLocaleLowerCase('ko').replace(/\s+/g, ' ').trim();
const sceneCount = city => new Set(city.records.map(record => record.snapshot.id)).size;
const validCoordinate = coord => Array.isArray(coord) && coord.length === 2 && coord.every(Number.isFinite) && Math.abs(coord[0]) <= 180 && Math.abs(coord[1]) < 85;

/** Use a recorded coordinate, never an averaged or inferred archaeological location. */
function representative(city) {
  const coordinates = new Map();
  for (const record of city.records) {
    if (!validCoordinate(record.place?.coord)) continue;
    const key = record.place.coord.join(',');
    const group = coordinates.get(key);
    if (group) group.count++;
    else coordinates.set(key, { record, count: 1 });
  }
  return [...coordinates.values()].sort((a, b) => b.count - a.count)[0]?.record || null;
}

export function createPlaceMapView({ document: doc, cities = [], sources = new Map(), landLayer, recordLinks = {}, onSelectScene, onOpenRecord, onShare }) {
  let destroyed = false;
  let previousFocus = null;
  let selectedId = null;
  const entries = cities.map(city => {
    const record = representative(city);
    const point = record ? project(record.place.coord) : null;
    const inFrame = point && point[0] >= 20 && point[0] <= 980 && point[1] >= 20 && point[1] <= 880;
    return { city, record, point, inFrame, count: sceneCount(city), search: normalize([city.id, city.name, ...(city.aliases || []), ...city.records.flatMap(item => [item.name, item.place.modernName])].join(' ')) };
  });
  const byId = new Map(entries.map(entry => [entry.city.id, entry]));
  let visible = entries;
  const cleanups = [];
  function element(tag, className, text) {
    const node = doc.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function svgElement(tag, attributes = {}) {
    const node = doc.createElementNS(SVG_NS, tag);
    for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
    return node;
  }
  function listen(node, type, handler) {
    node.addEventListener(type, handler);
    cleanups.push(() => node.removeEventListener(type, handler));
  }
  function button(label, className, action) {
    const node = element('button', className, label); node.type = 'button';
    node.addEventListener('click', () => { if (!destroyed) action(); });
    return node;
  }
  const dialog = element('dialog', 'map-tool-dialog');
  dialog.id = 'places-map-dialog'; dialog.setAttribute('aria-labelledby', 'places-map-title'); dialog.setAttribute('aria-modal', 'true');
  const header = element('header', 'map-tool-header');
  const title = element('h2', '', '장소로 읽는 한국사'); title.id = 'places-map-title';
  const closeButton = button('닫기 ×', 'map-tool-close', close); closeButton.setAttribute('aria-label', '장소 지도 닫기');
  header.append(title, closeButton);
  const layout = element('div', 'place-map-layout');
  const stage = element('section', 'place-map-stage'); stage.setAttribute('aria-label', '장소 지도');
  const map = svgElement('svg', { class: 'place-overview-map', viewBox: '0 0 1000 900', role: 'group', 'aria-label': '수록 장소의 개략 위치. 점을 선택하거나 장소 목록을 이용하세요.' });
  const land = svgElement('g', { 'aria-hidden': 'true' });
  const pins = svgElement('g');
  map.append(land, pins);
  const mapStatus = element('p', 'place-map-status', '해안선이 아직 준비되지 않았습니다. 장소 목록과 설명은 이용할 수 있습니다.'); mapStatus.setAttribute('role', 'status');
  stage.append(map, mapStatus, element('p', 'place-map-note', '현대 해안선 위의 개략 위치 · 국경·영토 복원도 아님. 겹치는 점은 오른쪽 목록에서 선택할 수 있습니다.'));
  const reader = element('aside', 'place-map-reader'); reader.setAttribute('aria-label', '장소 검색과 기록');
  const filters = element('div', 'place-map-filters');
  const searchLabel = element('label', '', '장소·옛 지명 찾기'); searchLabel.htmlFor = 'places-map-search';
  const search = element('input', 'place-map-search'); search.id = 'places-map-search'; search.type = 'search'; search.placeholder = '서울, 한양, 개경, 상하이…'; search.autocomplete = 'off';
  const summary = element('p', 'place-map-summary'); summary.setAttribute('role', 'status'); summary.setAttribute('aria-live', 'polite');
  const results = element('ul', 'place-map-results'); results.setAttribute('aria-label', '지도 안의 장소');
  const outside = element('section', 'place-map-outside');
  const outsideHeading = element('h3', '', '지도 화면 밖의 장소');
  const outsideList = element('ul', 'place-map-results'); outsideList.setAttribute('aria-label', '지도 화면 밖의 장소');
  outside.append(outsideHeading, element('p', '', '같은 고정 지도를 유지합니다. 아래 목록에서 설명과 연결 자료를 읽을 수 있습니다.'), outsideList);
  filters.append(searchLabel, search, summary, results, outside);
  const detail = element('section', 'place-map-detail'); detail.setAttribute('aria-labelledby', 'places-map-city-title');
  reader.append(filters, detail); layout.append(stage, reader);
  const footer = element('footer', 'map-tool-footer', `${cities.length}개 장소 묶음 · 같은 지역의 옛 지명과 여러 유적을 함께 살펴봅니다. 점은 수록 기록에 있는 대표 좌표이며 개별 유적의 정확한 위치를 뜻하지 않습니다.`);
  dialog.append(header, layout, footer); doc.body.append(dialog);

  function restoreFocus() {
    const target = previousFocus; previousFocus = null;
    if (target?.isConnected) target.focus?.();
  }
  function close() {
    if (!dialog.hasAttribute('open')) return;
    if (typeof dialog.close === 'function') {
      try { dialog.close(); } catch { dialog.removeAttribute('open'); }
    } else dialog.removeAttribute('open');
    restoreFocus();
  }
  function appendSources(record, target) {
    for (const id of new Set(record.place.sourceIds || [])) {
      const source = sources.get(id);
      if (!source) continue;
      let url;
      try { url = new URL(source.url); } catch { continue; }
      if (url.protocol !== 'https:' || url.username || url.password) continue;
      const link = element('a', 'source-link', `${source.title || source.publisher || '근거 자료'} ↗`);
      link.href = url.href; link.target = '_blank'; link.rel = 'noopener noreferrer';
      if (source.publisher) link.title = source.publisher;
      target.append(link);
    }
  }
  function renderDetail() {
    detail.replaceChildren();
    const entry = byId.get(selectedId);
    if (!entry) {
      const heading = element('h3', '', '장소를 선택하세요'); heading.id = 'places-map-city-title';
      detail.append(heading, element('p', '', '지도 위의 점이나 검색 결과에서 장소를 선택하면 연대순 설명을 읽을 수 있습니다.'));
      return;
    }
    const { city, record, inFrame, count } = entry;
    const heading = element('h3', '', city.name); heading.id = 'places-map-city-title'; heading.tabIndex = -1;
    detail.append(heading, element('p', 'place-map-city-count', `이 장소가 나오는 지도 해설 ${count}개 · 장소 항목 ${city.records.length}개`));
    const internalIds = new Set(city.records.map(item => item.place.id));
    const readableAliases = [...new Set(city.aliases || [])].filter(alias => /[가-힣]/.test(alias) && !internalIds.has(alias));
    const shownAliases = [];
    for (const alias of readableAliases) {
      if (shownAliases.length === 8 || [...shownAliases, alias].join(' · ').length > 110) break;
      shownAliases.push(alias);
    }
    const extraAliases = readableAliases.length - shownAliases.length;
    detail.append(element('p', 'place-map-aliases', `함께 찾는 이름: ${shownAliases.join(' · ') || city.name}${extraAliases ? ` 외 ${extraAliases}개` : ''}`));
    detail.append(element('p', 'place-map-coordinate-note', record
      ? `수록된 좌표 중 가장 자주 쓰인 ${record.name}의 개략 위치를 대표점으로 사용합니다. 같은 지역에 속한 모든 유적이 이 점에 있었다는 뜻은 아닙니다.${inFrame ? '' : ' 이 장소는 고정된 지도 화면 밖에 있습니다.'}`
      : '대표점으로 사용할 검증된 좌표가 없어 지도에 표시하지 않았습니다. 아래 설명을 이용해 주세요.'));
    if (typeof onShare === 'function') {
      const share = button('이 장소 링크 공유', 'text-button', () => onShare(city.id)); share.dataset.action = 'share-city'; detail.append(share);
    }
    const timelineHeading = element('h4', '', '이 장소가 나오는 지도 해설');
    detail.append(timelineHeading, element('p', 'place-map-note', '장면 연도 순서입니다. 장소가 배경으로 등장한 장면도 포함하며, 각 연도에 그곳에서 별도 사건이 발생했다는 뜻은 아닙니다.'));
    const timeline = element('ol', 'place-map-timeline');
    for (const item of [...city.records].sort((a, b) => a.year - b.year || a.id.localeCompare(b.id, 'ko'))) {
      const row = element('li', 'place-map-entry'); row.dataset.year = String(item.year);
      row.append(element('p', 'place-map-entry-year', `장면 연도 ${formatYear(item.year)}`), element('h5', '', `${item.name} · ${item.snapshot.title}`), element('p', 'place-map-entry-polity', item.polity || ''), element('p', '', item.note || ''));
      const links = element('div', 'event-sources'); appendSources(item, links); row.append(links);
      if (typeof onSelectScene === 'function') {
        const select = button('이 지도 해설 열기', 'text-button', () => { close(); onSelectScene(item.snapshot, item.place); });
        select.dataset.action = 'select-scene'; select.dataset.recordId = item.id; row.append(select);
      }
      timeline.append(row);
    }
    detail.append(timeline);
    const references = recordLinks instanceof Map ? recordLinks.get(city.id) : recordLinks[city.id];
    if (Array.isArray(references) && references.length) {
      const records = element('section', 'place-map-records');
      records.append(element('h4', '', '함께 읽는 공식 자료'), element('p', 'place-map-note', '장소와의 관계를 검토해 고른 자료입니다. 연도는 원자료의 연대 표기이며, 자료의 확정 발생지 좌표를 뜻하지 않습니다.'));
      for (const reference of [...references].sort((a, b) => (a.year ?? Infinity) - (b.year ?? Infinity))) {
        const row = element('article', 'place-map-record');
        const year = Number.isInteger(reference.year) && reference.year !== 0 ? formatYear(reference.year) : '연도 미상';
        row.append(element('p', 'catalogue-meta', year));
        if (reference.recordId && typeof onOpenRecord === 'function') {
          const action = button(reference.title || '공식 자료 읽기', 'text-button', () => { close(); onOpenRecord(reference.recordId); });
          action.dataset.action = 'open-record'; action.dataset.recordId = reference.recordId; row.append(action);
        } else row.append(element('p', '', reference.title || '공식 자료'));
        if (reference.note) row.append(element('p', '', reference.note));
        records.append(row);
      }
      detail.insertBefore(records, timelineHeading);
    }
  }
  function updateSelection() {
    for (const node of dialog.querySelectorAll('.place-map-result, .place-map-pin')) node.setAttribute('aria-pressed', String(node.dataset.cityId === selectedId));
    for (const label of pins.querySelectorAll('text')) {
      const show = label.parentNode.dataset.cityId === selectedId || label.dataset.priority === 'true';
      label.setAttribute('visibility', show ? 'visible' : 'hidden');
    }
  }
  function choose(id) {
    if (destroyed || !byId.has(id)) return;
    selectedId = id; updateSelection(); renderDetail();
    detail.querySelector('h3')?.focus();
  }
  function renderResults() {
    results.replaceChildren(); outsideList.replaceChildren();
    summary.textContent = visible.length ? `${cities.length}개 장소 중 ${visible.length}개 표시 · 목록에서 모든 장소를 선택할 수 있습니다.` : '일치하는 장소가 없습니다. 옛 지명이나 오늘의 지명으로 다시 찾아보세요.';
    for (const entry of visible) {
      const { city, count, inFrame } = entry;
      const row = element('li');
      const result = button(`${city.name} · 지도 해설 ${count}개${inFrame ? '' : ' · 화면 밖'}`, 'place-map-result', () => choose(city.id));
      result.dataset.cityId = city.id; result.setAttribute('aria-controls', 'places-map-city-title');
      row.append(result); (inFrame ? results : outsideList).append(row);
    }
    outside.hidden = outsideList.childElementCount === 0;
  }
  function renderPins() {
    pins.replaceChildren();
    const labelPoints = [];
    const priority = new Set();
    for (const entry of [...visible].filter(entry => entry.inFrame).sort((a, b) => b.count - a.count)) {
      if (priority.size >= 5) break;
      if (labelPoints.some(point => Math.hypot(point[0] - entry.point[0], point[1] - entry.point[1]) < 100)) continue;
      priority.add(entry.city.id); labelPoints.push(entry.point);
    }
    for (const { city, point, inFrame, count } of visible) {
      if (!inFrame) continue;
      const pin = svgElement('g', { class: 'place-map-pin', transform: `translate(${point.join(' ')})`, tabindex: 0, role: 'button', 'data-city-id': city.id, 'aria-label': `${city.name}, 개략 위치, 지도 해설 ${count}개. 장소 기록 읽기` });
      const dot = svgElement('circle', { r: 8 });
      const label = svgElement('text', { class: 'place-map-pin-label', x: 13, y: -10, 'pointer-events': 'none', 'data-priority': priority.has(city.id) }); label.textContent = city.name;
      pin.append(dot, label);
      pin.addEventListener('click', () => choose(city.id));
      pin.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); choose(city.id); } });
      pins.append(pin);
    }
  }
  function applySearch() {
    const tokens = normalize(search.value).split(' ').filter(Boolean);
    visible = entries.filter(entry => tokens.every(token => entry.search.includes(token)));
    if (!visible.some(entry => entry.city.id === selectedId)) selectedId = visible[0]?.city.id || null;
    renderResults(); renderPins(); updateSelection(); renderDetail();
  }
  function refreshMap() {
    if (destroyed) return;
    land.replaceChildren();
    for (const child of landLayer?.children || []) {
      const copy = child.cloneNode(true); copy.removeAttribute('id');
      for (const node of copy.querySelectorAll('[id]')) node.removeAttribute('id');
      land.append(copy);
    }
    mapStatus.hidden = land.childElementCount > 0;
  }
  function open(cityId) {
    if (destroyed) return;
    const wasOpen = dialog.hasAttribute('open');
    if (!wasOpen) previousFocus = doc.activeElement;
    search.value = '';
    selectedId = byId.has(cityId) ? cityId : selectedId || [...entries].sort((a, b) => b.count - a.count)[0]?.city.id || null;
    applySearch(); refreshMap();
    if (!wasOpen) {
      if (typeof dialog.showModal === 'function') {
        try { dialog.showModal(); } catch { dialog.setAttribute('open', ''); }
      } else dialog.setAttribute('open', '');
    }
    if (byId.has(cityId)) detail.querySelector('h3')?.focus();
    else closeButton.focus({ preventScroll: true });
  }
  listen(search, 'input', applySearch);
  listen(dialog, 'cancel', event => { event.preventDefault(); close(); });
  listen(dialog, 'close', restoreFocus);
  listen(dialog, 'click', event => {
    if (event.target !== dialog || typeof dialog.getBoundingClientRect !== 'function') return;
    const bounds = dialog.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) close();
  });
  listen(dialog, 'keydown', event => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); }
    if (event.key !== 'Tab') return;
    const focusable = [...dialog.querySelectorAll('button, input, a[href], [tabindex="0"]')].filter(node => !node.disabled && !node.closest('[hidden]'));
    const first = focusable[0]; const last = focusable.at(-1);
    if (event.shiftKey && (doc.activeElement === first || !focusable.includes(doc.activeElement))) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && doc.activeElement === last) { event.preventDefault(); first?.focus(); }
  });
  return { open, close, refreshMap, destroy() { if (destroyed) return; close(); destroyed = true; cleanups.forEach(cleanup => cleanup()); dialog.remove(); } };
}
