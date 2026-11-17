import { buildCityHistories, filterTimeline, CATEGORY_LABELS } from './catalogue.js';

const SECTIONS = { timeline: '전체 연표', polities: '정치체', figures: '인물', places: '도시 기록' };
const yearLabel = year => year < 0 ? `기원전 ${Math.abs(year)}년` : `${year}년`;
const searchable = value => String(value ?? '').normalize('NFKC').toLocaleLowerCase('ko');
const sectionText = entity => (entity.sections || []).flatMap(section => [section.heading, section.body]);
const validStop = stop => Number.isInteger(stop.year) && stop.year !== 0 && Array.isArray(stop.coord) && stop.coord.length === 2 && stop.coord.every(Number.isFinite) && Math.abs(stop.coord[0]) <= 180 && Math.abs(stop.coord[1]) <= 90 && (stop.sourceIds || []).length > 0;

export function createExplorer({ document: doc, snapshots = [], eras = [], sources = [], figures = [], polities = [], onSelectSnapshot = () => {}, onRoute = () => {}, onClearRoute = () => {}, onOpenPlace } = {}) {
  const cities = buildCityHistories(snapshots);
  const sourceMap = new Map(sources.map(source => [source.id, source]));
  const eraLabels = new Map(eras.map(era => [era.id, era.label]));
  const listeners = [];
  let section = 'timeline';
  let entityId = null;
  let currentSnapshot = null;
  let opener = null;
  let destroyed = false;
  let opened = false;
  let fallbackModal = false;
  const filters = { query: '', era: 'all', category: 'all' };

  function element(tag, className, content) {
    const node = doc.createElement(tag);
    if (className) node.className = className;
    if (content !== undefined) node.textContent = content;
    return node;
  }
  function listen(target, type, callback) {
    target.addEventListener(type, callback);
    listeners.push(() => target.removeEventListener(type, callback));
  }
  function button(label, className, action) {
    const node = element('button', className, label);
    node.type = 'button';
    node.addEventListener('click', action);
    return node;
  }

  const dialog = element('dialog', 'explorer-dialog');
  dialog.id = 'explorer-dialog';
  dialog.setAttribute('aria-labelledby', 'explorer-title');
  dialog.setAttribute('aria-describedby', 'explorer-description');
  dialog.setAttribute('aria-modal', 'true');
  dialog.hidden = true;
  const header = element('header', 'explorer-header');
  const heading = element('div');
  const title = element('h2', '', '한국사 깊이 탐색'); title.id = 'explorer-title';
  const description = element('p', 'explorer-caption', '시대의 흐름, 정치체, 인물과 도시를 원문 출처와 함께 읽습니다.'); description.id = 'explorer-description';
  heading.append(title, description);
  const closeButton = button('×', 'icon-button', close);
  closeButton.setAttribute('aria-label', '한국사 탐색 닫기');
  header.append(heading, closeButton);
  const tabs = element('div', 'explorer-tabs'); tabs.setAttribute('role', 'tablist'); tabs.setAttribute('aria-label', '탐색 종류');
  const tabButtons = new Map();
  for (const [id, label] of Object.entries(SECTIONS)) {
    const tab = button(label, '', () => switchSection(id));
    tab.id = `explorer-tab-${id}`;
    tab.dataset.section = id;
    tab.setAttribute('role', 'tab');
    tab.setAttribute('aria-controls', 'explorer-panel');
    listen(tab, 'keydown', event => {
      const ids = Object.keys(SECTIONS);
      let next;
      if (event.key === 'ArrowRight') next = ids[(ids.indexOf(id) + 1) % ids.length];
      if (event.key === 'ArrowLeft') next = ids[(ids.indexOf(id) + ids.length - 1) % ids.length];
      if (event.key === 'Home') next = ids[0];
      if (event.key === 'End') next = ids.at(-1);
      if (next) { event.preventDefault(); switchSection(next); tabButtons.get(next).focus(); }
    });
    tabButtons.set(id, tab); tabs.append(tab);
  }
  const toolbar = element('div', 'explorer-toolbar');
  const searchLabel = element('label', '', '검색'); searchLabel.htmlFor = 'explorer-search';
  const search = element('input', 'explorer-search'); search.id = 'explorer-search'; search.type = 'search'; search.placeholder = '이름, 사건, 설명 검색'; search.autocomplete = 'off';
  const filterControls = element('div', 'explorer-filters');
  function selectFilter(key, label, values) {
    const wrapper = element('label', '', label);
    const select = element('select'); select.dataset.filter = key; select.setAttribute('aria-label', label);
    for (const [value, text] of values) { const option = element('option', '', text); option.value = value; if (value === 'all') option.setAttribute('selected', ''); select.append(option); }
    wrapper.append(select); filterControls.append(wrapper);
    listen(select, 'change', () => { filters[key] = select.value; entityId = null; render(); });
    return select;
  }
  selectFilter('era', '시대', [['all', '모든 시대'], ...eras.map(era => [era.id, era.label])]);
  selectFilter('category', '주제', [['all', '모든 주제'], ...Object.entries(CATEGORY_LABELS)]);
  toolbar.append(searchLabel, search, filterControls);
  const count = element('p', 'explorer-count'); count.setAttribute('role', 'status'); count.setAttribute('aria-live', 'polite'); count.setAttribute('aria-atomic', 'true');
  const panel = element('section'); panel.id = 'explorer-panel'; panel.setAttribute('role', 'tabpanel'); panel.tabIndex = 0;
  const body = element('div', 'explorer-body');
  body.append(toolbar, count, panel);
  dialog.append(header, tabs, body);
  doc.body.append(dialog);
  listen(search, 'input', () => { filters.query = search.value; entityId = null; render(); });
  listen(dialog, 'cancel', event => { event.preventDefault(); close(); });
  listen(dialog, 'close', () => { if (!dialog.hasAttribute('open')) finishClose(); });
  listen(dialog, 'keydown', event => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); }
    if (event.key === 'Tab' && fallbackModal) {
      const focusable = [...dialog.querySelectorAll('button, input, select, a[href], [tabindex="0"]')].filter(node => !node.disabled && !node.hidden && node.tabIndex !== -1 && !node.closest('[hidden]'));
      const first = focusable[0]; const last = focusable.at(-1);
      if (event.shiftKey && doc.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && doc.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
  });

  function finishClose() {
    if (!opened) return;
    opened = false;
    dialog.removeAttribute('open');
    dialog.hidden = true;
    if (opener?.isConnected) opener.focus?.();
    opener = null;
  }
  function close() {
    if (!opened) return;
    if (typeof dialog.close === 'function') { try { dialog.close(); } catch { /* The attribute fallback handles partial dialog implementations. */ } }
    finishClose();
  }
  function switchSection(next) {
    section = next;
    entityId = null;
    filters.query = ''; search.value = '';
    render();
    body.scrollTop = 0;
  }
  function selectScene(snapshot, place) {
    onSelectSnapshot(snapshot.id);
    if (place && typeof onOpenPlace === 'function') onOpenPlace(place);
    close();
  }
  function sourceLinks(ids, target) {
    const wrapper = element('div', 'detail-sources');
    for (const id of new Set(ids || [])) {
      const source = sourceMap.get(id);
      if (!source) continue;
      let url;
      try { url = new URL(source.url); } catch { continue; }
      if (url.protocol !== 'https:' || url.username || url.password) continue;
      const link = element('a', 'source-link', `${source.title} ↗`);
      link.href = url.href; link.target = '_blank'; link.rel = 'noopener noreferrer';
      link.title = source.publisher ? `${source.publisher} · ${source.title}` : source.title;
      wrapper.append(link);
    }
    if (wrapper.childElementCount) target.append(wrapper);
  }
  function addSections(entity, target) {
    for (const content of entity.sections || []) {
      const block = element('section', 'detail-section');
      block.append(element('h4', '', content.heading), element('p', '', content.body));
      sourceLinks(content.sourceIds, block); target.append(block);
    }
  }
  function relatedScenes(items, target) {
    const related = [...items].sort((a, b) => a.year - b.year);
    if (!related.length) return;
    const block = element('section', 'detail-section'); block.append(element('h4', '', '관련 장면'));
    const list = element('ul', 'explorer-list');
    for (const snapshot of related) {
      const row = element('li');
      row.append(button(`${yearLabel(snapshot.year)} · ${snapshot.title} — 지도에서 보기`, '', () => selectScene(snapshot)));
      list.append(row);
    }
    block.append(list); target.append(block);
  }
  function detailBase(name, meta, summary) {
    const detail = element('article', 'explorer-detail');
    detail.append(button('← 목록으로', 'explorer-back', () => { entityId = null; render(); search.focus(); }));
    const detailHeading = element('h3', 'detail-heading', name); detailHeading.tabIndex = -1;
    detail.append(detailHeading);
    if (meta) detail.append(element('p', 'catalogue-meta', meta));
    if (summary) detail.append(element('p', '', summary));
    return detail;
  }
  function renderPolity(polity) {
    const detail = detailBase(polity.name, polity.period, polity.summary);
    if (polity.capitalNames?.length) detail.append(element('p', 'catalogue-meta', `주요 도읍·중심지: ${polity.capitalNames.join(' · ')}`));
    addSections(polity, detail); sourceLinks(polity.sourceIds, detail);
    relatedScenes(snapshots.filter(snapshot => snapshot.polityIds?.includes(polity.id)), detail);
    panel.append(detail);
  }
  function renderFigure(figure) {
    const polity = polities.find(item => item.id === figure.polityId);
    const detail = detailBase(figure.name, [figure.years, figure.role, polity?.name].filter(Boolean).join(' · '), figure.summary);
    addSections(figure, detail);
    const stops = (figure.stops || []).filter(validStop).sort((a, b) => a.year - b.year);
    const route = element('section', 'detail-section'); route.append(element('h4', '', '확인된 활동 지점'));
    if (stops.length) {
      route.append(element('p', 'explorer-caption', '확인된 활동 지점을 연대순으로 연결합니다. 당시의 이동 경로나 도로를 복원한 선은 아닙니다.'));
      const list = element('ol', 'route-stop-list');
      for (const stop of stops) {
        const row = element('li');
        row.append(element('strong', '', `${yearLabel(stop.year)} · ${stop.label}`), element('p', '', stop.description));
        sourceLinks(stop.sourceIds, row); list.append(row);
      }
      route.append(list);
    } else route.append(element('p', '', '확인된 활동 지점이 없어 지도에 경로를 표시하지 않습니다.'));
    const routeButton = button('활동 지점 지도에서 보기', '', () => { onRoute(figure); close(); });
    routeButton.dataset.action = 'show-route';
    routeButton.dataset.entityId = figure.id;
    routeButton.disabled = !stops.length;
    const actions = element('div', 'explorer-actions');
    actions.append(routeButton, button('지도 활동 지점 지우기', '', () => onClearRoute()));
    route.append(actions); detail.append(route);
    sourceLinks(figure.sourceIds, detail);
    relatedScenes(snapshots.filter(snapshot => snapshot.figureIds?.includes(figure.id)), detail);
    panel.append(detail);
  }
  function renderCity(city) {
    const sceneCount = new Set(city.records.map(record => record.snapshot.id)).size;
    const detail = detailBase(`${city.name} · 도시 기록`, `${sceneCount}개 시점 · ${city.records.length}개 기록 항목`, '오늘의 도시 단위로 연결한 개략 기록입니다. 시대별 이름을 함께 읽기 위한 묶음이며, 같은 궁궐·성곽이나 정확히 같은 지점을 뜻하지 않습니다.');
    const list = element('ol', 'explorer-list');
    list.dataset.list = 'city-records';
    for (const record of city.records) {
      const row = element('li', 'city-record');
      row.append(element('h4', '', `${yearLabel(record.year)} · ${record.place.name}`), element('p', 'catalogue-meta', [record.place.polity, record.place.modernName].filter(Boolean).join(' · ')), element('p', '', record.place.note), element('p', 'catalogue-meta', record.snapshot.title));
      row.append(button('이 시점 지도에서 보기', '', () => selectScene(record.snapshot, record.place)));
      sourceLinks(record.place.sourceIds, row); list.append(row);
    }
    detail.append(list); panel.append(detail);
  }
  function matchesQuery(values) {
    const corpus = searchable(values.flat(Infinity).filter(Boolean).join(' '));
    return searchable(filters.query).trim().split(/\s+/).filter(Boolean).every(token => corpus.includes(token));
  }
  function empty() { panel.append(element('p', 'explorer-empty', '조건에 맞는 기록이 없습니다. 검색어나 시대·주제를 바꿔 보세요.')); }
  function card(name, meta, summary, action) {
    const item = element('li', 'catalogue-card');
    const title = element('h3', 'catalogue-card-title'); title.append(button(name, '', action));
    item.append(title);
    if (meta) item.append(element('p', 'catalogue-meta', meta));
    if (summary) item.append(element('p', '', summary));
    return item;
  }
  function renderTimeline() {
    const results = filterTimeline(snapshots, filters);
    count.textContent = `전체 ${snapshots.length}개 시점 중 ${results.length}개`;
    if (!results.length) { empty(); return; }
    const list = element('ol', 'explorer-list');
    for (const snapshot of results) {
      const row = element('li', 'chronology-row'); row.dataset.snapshotId = snapshot.id;
      if (currentSnapshot?.id === snapshot.id) { row.setAttribute('aria-current', 'true'); row.classList.add('explorer-current'); }
      row.append(element('p', 'chronology-year', yearLabel(snapshot.year)));
      const content = element('div');
      content.append(element('p', 'catalogue-meta', eraLabels.get(snapshot.era) || snapshot.era), element('h3', 'catalogue-card-title', snapshot.title), element('p', '', snapshot.summary));
      const visibleEvents = (snapshot.events || []).filter(event => filters.category === 'all' || event.category === filters.category);
      const categories = element('div', 'explorer-actions');
      for (const category of new Set(visibleEvents.map(event => event.category).filter(Boolean))) categories.append(element('span', 'category-chip', CATEGORY_LABELS[category] || category));
      content.append(categories);
      if (visibleEvents.length) {
        const events = element('ul');
        for (const event of visibleEvents) { const item = element('li'); item.append(element('strong', '', `${yearLabel(event.year ?? snapshot.year)} · ${event.title}`), element('p', '', event.description)); events.append(item); }
        content.append(events);
      }
      const actions = element('div', 'explorer-actions');
      actions.append(button('지도에서 보기', '', () => selectScene(snapshot)));
      content.append(actions);
      sourceLinks(snapshot.sourceIds, content);
      row.append(content); list.append(row);
    }
    panel.append(list);
  }
  function render() {
    if (destroyed) return;
    for (const [id, tab] of tabButtons) { tab.setAttribute('aria-selected', String(id === section)); tab.tabIndex = id === section ? 0 : -1; tab.classList.toggle('is-active', id === section); }
    panel.setAttribute('aria-labelledby', `explorer-tab-${section}`);
    filterControls.hidden = section !== 'timeline';
    search.placeholder = section === 'timeline' ? '사건, 시대, 설명 검색' : `${SECTIONS[section]} 이름과 설명 검색`;
    search.setAttribute('aria-label', `${SECTIONS[section]} 검색`);
    panel.replaceChildren();
    if (section === 'timeline') { renderTimeline(); return; }
    const collection = section === 'polities' ? polities : section === 'figures' ? figures : cities;
    const entity = collection.find(item => item.id === entityId || (section === 'places' && item.records.some(record => record.place.id === entityId)));
    if (entity) {
      count.textContent = `${SECTIONS[section]} 상세 · ${entity.name}`;
      if (section === 'polities') renderPolity(entity);
      else if (section === 'figures') renderFigure(entity);
      else renderCity(entity);
      return;
    }
    const results = collection.filter(item => matchesQuery(section === 'places' ? [item.name, item.aliases, item.records.flatMap(record => [record.name, record.polity, record.note, record.year, record.snapshot.title])] : [item.name, item.summary, item.years, item.role, item.period, item.capitalNames || [], sectionText(item), (item.stops || []).flatMap(stop => [stop.label, stop.description]) ]));
    count.textContent = `${SECTIONS[section]} ${collection.length}개 중 ${results.length}개`;
    if (!results.length) { empty(); return; }
    const list = element('ul', 'explorer-list');
    for (const item of results) {
      const meta = section === 'polities' ? item.period : section === 'figures' ? [item.years, item.role].filter(Boolean).join(' · ') : `${yearLabel(item.records[0].year)} ~ ${yearLabel(item.records.at(-1).year)} · ${item.records.length}개 기록`;
      const summary = section === 'places' ? [...new Set(item.records.map(record => record.place.name))].join(' · ') : item.summary;
      const itemCard = card(item.name, meta, summary, () => { entityId = item.id; render(); panel.querySelector('.detail-heading')?.focus(); body.scrollTop = 0; });
      itemCard.dataset.entityId = item.id;
      itemCard.querySelector('button').dataset.entityId = item.id;
      list.append(itemCard);
    }
    panel.append(list);
  }
  function open(nextSection = 'timeline', nextEntityId = null) {
    if (destroyed) return;
    if (!opened) opener = doc.activeElement;
    section = Object.hasOwn(SECTIONS, nextSection) ? nextSection : 'timeline';
    entityId = nextEntityId;
    filters.query = ''; search.value = '';
    render();
    opened = true; dialog.hidden = false; fallbackModal = true;
    if (typeof dialog.showModal === 'function' && !dialog.hasAttribute('open')) {
      try { dialog.showModal(); fallbackModal = false; } catch { /* Embedded DOM environments use the modal attribute fallback. */ }
    }
    if (!dialog.hasAttribute('open')) dialog.setAttribute('open', '');
    (panel.querySelector('.detail-heading') || search).focus();
    body.scrollTop = 0;
  }
  function refresh(snapshot) { currentSnapshot = snapshot; if (opened) render(); }
  function destroy() {
    if (destroyed) return;
    close(); destroyed = true;
    for (const removeListener of listeners) removeListener();
    dialog.remove();
  }
  return { open, close, refresh, destroy };
}
