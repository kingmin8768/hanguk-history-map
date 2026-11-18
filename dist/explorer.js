import { buildCityHistories, filterTimeline, CATEGORY_LABELS } from './catalogue.js';
import { createRecordPresentation } from './main-record-view.js';

const SECTIONS = { timeline: '전체 연표', polities: '정치체', figures: '인물', places: '도시 기록', records: '자료 연표' };
const yearLabel = year => year < 0 ? `기원전 ${Math.abs(year)}년` : `${year}년`;
const searchable = value => String(value ?? '').normalize('NFKC').toLocaleLowerCase('ko');
const sectionText = entity => (entity.sections || []).flatMap(section => [section.heading, section.body]);
const validStop = stop => Number.isInteger(stop.year) && stop.year !== 0 && Array.isArray(stop.coord) && stop.coord.length === 2 && stop.coord.every(Number.isFinite) && Math.abs(stop.coord[0]) <= 180 && Math.abs(stop.coord[1]) <= 90 && (stop.sourceIds || []).length > 0;

export function createExplorer({ document: doc, snapshots = [], eras = [], sources = [], figures = [], polities = [], corpus, onSelectSnapshot = () => {}, onRoute = () => {}, onClearRoute = () => {}, onOpenPlace, onOpenRecord } = {}) {
  const recordPresentation = createRecordPresentation(doc);
  const recordDateNote = recordPresentation.dateNote;
  const appendRecordCurrentSource = recordPresentation.appendCurrentSource;
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
  const recordFilters = { q: '', collection: 'all', fromYear: '', toYear: '', sort: 'asc' };
  const recordState = { offset: 0, limit: 50, items: [], total: 0, status: 'idle', queryKey: null, queryError: null, detailKey: null, detailStatus: 'idle', detailError: null, detail: null };
  let manifest = null;
  let manifestStatus = corpus ? 'loading' : 'unavailable';
  let manifestGeneration = 0;
  let recordGeneration = 0;
  let recordDebounce = null;

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
  const corpusControls = element('form', 'corpus-filters');
  corpusControls.hidden = true;
  const corpusInputs = new Map();
  function corpusField(key, label, values) {
    const wrapper = element('label', '', label);
    const input = element(values ? 'select' : 'input');
    input.dataset.corpusFilter = key;
    input.setAttribute('aria-label', label);
    if (values) {
      for (const [value, label] of values) { const option = element('option', '', label); option.value = value; if (value === recordFilters[key]) option.setAttribute('selected', ''); input.append(option); }
    } else { input.type = 'number'; input.step = '1'; input.placeholder = key === 'fromYear' ? '예: -108' : '예: 1987'; }
    listen(input, values ? 'change' : 'input', () => {
      recordFilters[key] = input.value;
      applyRecordFilters(!values);
    });
    wrapper.append(input); corpusControls.append(wrapper); corpusInputs.set(key, input);
    return input;
  }
  corpusField('collection', '자료 구분', [['all', '모든 자료']]);
  corpusField('fromYear', '시작 연도');
  corpusField('toYear', '끝 연도');
  corpusField('sort', '정렬', [['asc', '연도 오름차순'], ['desc', '연도 내림차순']]);
  const apply = element('button', '', '조건 적용'); apply.type = 'submit';
  corpusControls.append(apply, button('초기화', '', resetRecordFilters));
  listen(corpusControls, 'submit', event => { event.preventDefault(); applyRecordFilters(false); });
  toolbar.append(searchLabel, search, filterControls, corpusControls);
  const count = element('p', 'explorer-count'); count.setAttribute('role', 'status'); count.setAttribute('aria-live', 'polite'); count.setAttribute('aria-atomic', 'true');
  const panel = element('section'); panel.id = 'explorer-panel'; panel.setAttribute('role', 'tabpanel'); panel.tabIndex = 0;
  const body = element('div', 'explorer-body');
  body.append(toolbar, count, panel);
  dialog.append(header, tabs, body);
  doc.body.append(dialog);
  listen(search, 'input', () => {
    if (section === 'records') { recordFilters.q = search.value; applyRecordFilters(true); }
    else { filters.query = search.value; entityId = null; render(); }
  });
  listen(search, 'keydown', event => { if (section === 'records' && event.key === 'Enter') { event.preventDefault(); applyRecordFilters(false); } });
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
    invalidateRecordRequests();
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
    invalidateRecordRequests();
    section = next;
    entityId = null;
    filters.query = ''; search.value = '';
    if (next === 'records') { recordFilters.q = ''; recordState.offset = 0; }
    render();
    body.scrollTop = 0;
  }
  function selectScene(snapshot, place) {
    close();
    onSelectSnapshot(snapshot.id);
    if (place && typeof onOpenPlace === 'function') onOpenPlace(place);
  }
  function appendMainRecordAction(record, target) {
    if (typeof onOpenRecord !== 'function') return;
    const actions = element('div', 'explorer-actions');
    const main = button('메인에서 보기', '', () => {
      const options = recordQueryOptions();
      if (options.error) return;
      const context = { q: options.q, collection: options.collection, fromYear: options.fromYear, toYear: options.toYear, sort: options.sort };
      close();
      onOpenRecord(record, context);
    });
    main.dataset.action = 'open-main-record';
    actions.append(main); target.append(actions);
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

  function invalidateRecordRequests() {
    recordGeneration++;
    if (recordDebounce !== null) clearTimeout(recordDebounce);
    recordDebounce = null;
    if (recordState.status === 'loading') recordState.status = 'idle';
    if (recordState.detailStatus === 'loading') recordState.detailStatus = 'idle';
  }
  function selectValue(select, value) {
    for (const option of select.options) { option.selected = false; option.removeAttribute('selected'); }
    const selected = [...select.options].find(option => option.value === value);
    if (selected) selected.selected = true;
  }
  function defaultRecordFilters(q = '', context = {}) {
    Object.assign(recordFilters, { q, collection: context.collection || 'all', fromYear: context.fromYear == null ? '' : String(context.fromYear), toYear: context.toYear == null ? '' : String(context.toYear), sort: context.sort === 'desc' ? 'desc' : 'asc' });
    search.value = q;
    for (const [key, input] of corpusInputs) {
      if (input.tagName === 'SELECT') selectValue(input, recordFilters[key]);
      else input.value = recordFilters[key];
    }
    recordState.offset = 0;
  }
  function resetRecordFilters() {
    defaultRecordFilters();
    applyRecordFilters(false);
    search.focus();
  }
  function applyRecordFilters(debounce) {
    invalidateRecordRequests();
    recordState.offset = 0;
    recordState.queryKey = null;
    recordState.status = 'idle';
    entityId = null;
    if (debounce) recordDebounce = setTimeout(() => { recordDebounce = null; if (!destroyed && section === 'records') renderRecords(); }, 150);
    renderRecords();
    body.scrollTop = 0;
  }
  function recordQueryOptions() {
    const parse = value => value === '' ? null : Number(value);
    const fromYear = parse(recordFilters.fromYear);
    const toYear = parse(recordFilters.toYear);
    if ([fromYear, toYear].some(year => year !== null && (!Number.isSafeInteger(year) || year === 0))) return { error: '시작·끝 연도에는 0년이 아닌 정수를 입력하세요. 기원전은 음수로 입력합니다.' };
    if (fromYear !== null && toYear !== null && fromYear > toYear) return { error: '시작 연도는 끝 연도보다 늦을 수 없습니다.' };
    return { q: recordFilters.q, collection: recordFilters.collection, fromYear, toYear, offset: recordState.offset, limit: recordState.limit, sort: recordFilters.sort };
  }
  function appendRecordProvenance() {
    recordPresentation.appendProvenance(manifest, panel, { sceneCount: snapshots.length, showPageSize: true });
  }
  function recordLoading(message) {
    panel.setAttribute('aria-busy', 'true');
    count.textContent = message;
    const loading = element('p', 'corpus-loading', message); loading.setAttribute('role', 'status'); panel.append(loading);
  }
  function recordError(message, retry) {
    count.textContent = message;
    const error = element('div', 'corpus-error'); error.setAttribute('role', 'alert'); error.append(element('p', '', message));
    if (retry) error.append(button('다시 시도', '', retry));
    panel.append(error);
    return error;
  }
  function recordRequestError(failure, message, retry) {
    const block = recordPresentation.appendFailure(panel, failure, message, retry);
    count.textContent = block.querySelector('p').textContent;
  }
  function loadManifest() {
    if (!corpus || destroyed) return;
    const generation = ++manifestGeneration;
    manifestStatus = 'loading';
    Promise.resolve().then(() => corpus.getManifest()).then(result => {
      if (destroyed || generation !== manifestGeneration) return;
      manifest = result;
      manifestStatus = 'ready';
      const select = corpusInputs.get('collection');
      for (const option of [...select.options].slice(1)) option.remove();
      for (const collection of manifest.collections || []) {
        const option = element('option', '', `${collection.label}${Number.isFinite(collection.count) ? ` (${collection.count.toLocaleString('ko-KR')}건)` : ''}`);
        option.value = collection.id; select.append(option);
      }
      selectValue(select, recordFilters.collection);
      if (section === 'records' && opened) renderRecords();
    }).catch(() => {
      if (destroyed || generation !== manifestGeneration) return;
      manifestStatus = 'error';
      if (section === 'records' && opened) renderRecords();
    });
  }
  function queryRecords(options, key) {
    const generation = ++recordGeneration;
    recordState.queryKey = key;
    recordState.status = 'loading';
    recordState.queryError = null;
    Promise.resolve().then(() => corpus.query(options)).then(result => {
      if (destroyed || generation !== recordGeneration || section !== 'records' || !opened) return;
      recordState.items = (result.items || []).slice(0, recordState.limit);
      recordState.total = Math.max(0, Number(result.total) || 0);
      recordState.offset = Math.max(0, Number(result.offset) || 0);
      recordState.queryKey = JSON.stringify({ ...options, offset: recordState.offset });
      recordState.status = 'ready';
      renderRecords();
    }).catch(error => {
      if (destroyed || generation !== recordGeneration || section !== 'records' || !opened) return;
      recordState.queryError = { code: error?.code || '', message: error?.message || String(error) };
      recordState.status = 'error';
      renderRecords();
    });
  }
  function queryRecordDetail(id) {
    const generation = ++recordGeneration;
    recordState.detailKey = id;
    recordState.detailStatus = 'loading';
    recordState.detailError = null;
    Promise.resolve().then(() => corpus.getRecord(id)).then(record => {
      if (destroyed || generation !== recordGeneration || section !== 'records' || !opened || entityId !== id) return;
      recordState.detail = record;
      recordState.detailStatus = 'ready';
      renderRecords();
      panel.querySelector('.detail-heading')?.focus(); body.scrollTop = 0;
    }).catch(error => {
      if (destroyed || generation !== recordGeneration || section !== 'records' || !opened || entityId !== id) return;
      recordState.detailError = { code: error?.code || '', message: error?.message || String(error) };
      recordState.detailStatus = 'error';
      renderRecords();
    });
  }
  function collectionLabel(id) { return manifest?.collections?.find(collection => collection.id === id)?.label || id || '자료 구분 미상'; }
  function renderCorpusDetail(record) {
    count.textContent = '공식 자료 기록 상세';
    const detail = detailBase(record.title || '제목 미제공', '제공 제목 · 공식 자료 기록');
    detail.classList.add('corpus-detail');
    appendMainRecordAction(record, detail);
    const date = element('section', 'detail-section');
    date.append(element('h4', '', '원자료의 연대 표기와 자료 구분'), element('p', 'corpus-original-date', `원자료의 연대 표기: ${record.originalDate || '표기 없음'}`), element('p', 'corpus-date-note', recordDateNote(record)), element('p', '', `자료 구분: ${collectionLabel(record.collectionId)}`));
    if (record.sourceRecordId) date.append(element('p', 'catalogue-meta', `제공기관 기록 ID: ${record.sourceRecordId}`));
    detail.append(date);
    const bodySection = element('section', 'detail-section');
    bodySection.append(element('h4', '', '제공된 초록·본문'), element('p', 'corpus-body', record.body || '제공된 초록·본문이 없습니다.'), element('p', 'explorer-caption', '제공기관의 원문 메타데이터와 초록이며 새로 작성한 해설이 아닙니다. 원래 날짜·표제를 그대로 보존합니다.'));
    detail.append(bodySection);
    const links = element('section', 'detail-section detail-sources'); links.append(element('h4', '', record.sourceLinkType === 'collection' ? '공식 자료군' : '공식 원문'));
    appendRecordCurrentSource(record, links);
    recordPresentation.appendMetadata(record, links);
    detail.append(links);
    const context = element('section', 'detail-section'); context.append(element('h4', '', '지도 해설과 함께 읽기'));
    const hasYear = Number.isSafeInteger(record.year) && record.year !== 0;
    const preceding = hasYear ? snapshots.filter(snapshot => snapshot.year <= record.year).sort((a, b) => b.year - a.year)[0] : null;
    if (preceding) {
      context.append(element('p', '', `원자료의 연대 표기는 ${yearLabel(record.year)}이며, 연결되는 해설 장면의 실제 연도는 ${yearLabel(preceding.year)}입니다. 시점이 달라질 수 있습니다. 이 기록에는 확인된 좌표가 없어 사건의 지도점을 만들지 않습니다.`));
      const actions = element('div', 'explorer-actions');
      actions.append(button(`가까운 해설 장면 · ${yearLabel(preceding.year)}`, '', () => selectScene(preceding)));
      context.append(element('p', 'catalogue-meta', preceding.title), actions);
    } else context.append(element('p', '', hasYear ? '이 자료보다 앞서거나 같은 해의 지도 해설 장면이 없습니다. 확인된 좌표가 없어 지도점을 만들지 않습니다.' : '연도를 확인할 수 없어 가까운 지도 해설 장면을 연결하지 않습니다. 확인된 좌표가 없어 지도점을 만들지 않습니다.'));
    detail.append(context); panel.append(detail);
  }
  function moveRecordPage(offset) {
    invalidateRecordRequests();
    recordState.offset = offset;
    recordState.queryKey = null;
    recordState.status = 'idle';
    renderRecords(); body.scrollTop = 0;
  }
  function recordPagination() {
    const pages = Math.max(1, Math.ceil(recordState.total / recordState.limit));
    const current = Math.floor(recordState.offset / recordState.limit) + 1;
    const nav = element('nav', 'corpus-pagination'); nav.setAttribute('aria-label', '자료 연표 페이지');
    for (const [label, offset, disabled] of [['첫 페이지', 0, current === 1], ['이전', Math.max(0, recordState.offset - recordState.limit), current === 1], ['다음', recordState.offset + recordState.limit, current >= pages], ['마지막 페이지', (pages - 1) * recordState.limit, current >= pages]]) {
      const control = button(label, '', () => moveRecordPage(offset)); control.disabled = disabled; nav.append(control);
    }
    const form = element('form'); const label = element('label', '', `페이지 이동 (전체 ${pages.toLocaleString('ko-KR')}페이지)`);
    const input = element('input'); input.type = 'number'; input.min = '1'; input.max = String(pages); input.step = '1'; input.value = String(current); input.dataset.corpusPage = ''; input.setAttribute('aria-label', '이동할 페이지');
    label.append(input); const submit = element('button', '', '이동'); submit.type = 'submit';
    const error = element('p', 'corpus-page-error'); error.setAttribute('role', 'alert');
    form.append(label, submit, error);
    form.addEventListener('submit', event => {
      event.preventDefault();
      const page = Number(input.value);
      if (!Number.isInteger(page) || page < 1 || page > pages) { error.textContent = `1~${pages} 사이의 페이지를 입력하세요.`; return; }
      moveRecordPage((page - 1) * recordState.limit);
    });
    nav.append(form); return nav;
  }
  function renderRecordList() {
    const start = recordState.total ? recordState.offset + 1 : 0;
    const end = Math.min(recordState.offset + recordState.items.length, recordState.total);
    const pages = Math.ceil(recordState.total / recordState.limit);
    count.textContent = `총 ${recordState.total.toLocaleString('ko-KR')}건 · ${start.toLocaleString('ko-KR')}~${end.toLocaleString('ko-KR')}번째 · ${pages ? Math.floor(recordState.offset / recordState.limit) + 1 : 0}/${pages.toLocaleString('ko-KR')}페이지`;
    if (!recordState.total) { panel.append(element('p', 'explorer-empty', '조건에 맞는 공식 자료가 없습니다. 검색어·자료 구분·연도 범위를 바꾸거나 초기화해 보세요.')); return; }
    const list = element('ol', 'explorer-list corpus-list'); list.start = recordState.offset + 1;
    for (const record of recordState.items) {
      const row = element('li', 'corpus-record'); row.dataset.recordId = record.id;
      row.append(element('p', 'corpus-date', `원자료의 연대 표기: ${record.originalDate || '표기 없음'}`));
      const content = element('div', 'corpus-record-content');
      const heading = element('h3', 'corpus-record-title');
      heading.append(button(record.title || '제목 미제공', '', () => { invalidateRecordRequests(); entityId = record.id; renderRecords(); body.scrollTop = 0; }));
      const chars = Array.from(record.body || '');
      const snippet = chars.length ? chars.slice(0, 180).join('') + (chars.length > 180 ? '…' : '') : '제공된 초록·본문이 없습니다.';
      content.append(element('p', 'catalogue-meta', `제공 제목 · ${collectionLabel(record.collectionId)}`), heading, element('p', 'corpus-snippet', snippet), element('p', 'corpus-date-note', recordDateNote(record)));
      appendRecordCurrentSource(record, content, true);
      appendMainRecordAction(record, content);
      row.append(content); list.append(row);
    }
    panel.append(list, recordPagination());
  }
  function renderRecords() {
    if (destroyed || section !== 'records') return;
    panel.replaceChildren(); panel.removeAttribute('aria-busy'); appendRecordProvenance();
    if (!corpus) { recordError('공식 자료 연표를 사용할 수 없습니다.'); return; }
    if (manifestStatus === 'loading') { recordLoading('공식 자료 목록 정보를 불러오는 중입니다.'); return; }
    if (manifestStatus === 'error') { recordError('공식 자료 목록 정보를 불러오지 못했습니다.', () => { loadManifest(); renderRecords(); }); return; }
    if (entityId !== null) {
      if (recordState.detailKey !== entityId || recordState.detailStatus === 'idle') queryRecordDetail(entityId);
      if (recordState.detailStatus === 'loading') recordLoading('자료의 전체 기록을 불러오는 중입니다.');
      else if (recordState.detailStatus === 'error') recordRequestError(recordState.detailError, '자료의 전체 기록을 불러오지 못했습니다.', () => { recordState.detailKey = null; renderRecords(); });
      else if (recordState.detail) renderCorpusDetail(recordState.detail);
      else { count.textContent = '자료 0건'; panel.append(element('p', 'explorer-empty', '해당 자료 기록을 찾을 수 없습니다.'), button('자료 목록으로', 'explorer-back', () => { entityId = null; renderRecords(); })); }
      return;
    }
    const options = recordQueryOptions();
    if (options.error) { recordError(options.error); return; }
    if (recordDebounce !== null) { recordLoading('검색 조건을 적용하는 중입니다.'); return; }
    const key = JSON.stringify(options);
    if (recordState.queryKey !== key || recordState.status === 'idle') queryRecords(options, key);
    if (recordState.status === 'loading') recordLoading('공식 자료를 검색하는 중입니다. 첫 조회에는 검색 자료를 준비하는 시간이 필요합니다. 기다리는 동안 창을 닫고 지도 해설을 계속 이용할 수 있습니다.');
    else if (recordState.status === 'error') recordRequestError(recordState.queryError, '공식 자료를 불러오지 못했습니다. 연결을 확인한 뒤 다시 시도해 주세요.', () => { recordState.queryKey = null; renderRecords(); });
    else renderRecordList();
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
    const routeButton = button('활동 지점 지도에서 보기', '', () => { close(); onRoute(figure); });
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
    corpusControls.hidden = section !== 'records';
    toolbar.classList.toggle('corpus-toolbar', section === 'records');
    search.placeholder = section === 'records' ? '공식 자료의 제공 제목과 본문 검색' : section === 'timeline' ? '사건, 시대, 설명 검색' : `${SECTIONS[section]} 이름과 설명 검색`;
    search.setAttribute('aria-label', `${SECTIONS[section]} 검색`);
    panel.replaceChildren();
    panel.removeAttribute('aria-busy');
    if (section === 'records') { renderRecords(); return; }
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
  function open(nextSection = 'timeline', nextEntityId = null, recordQuery = '') {
    if (destroyed) return;
    invalidateRecordRequests();
    if (!opened) opener = doc.activeElement;
    section = Object.hasOwn(SECTIONS, nextSection) ? nextSection : 'timeline';
    entityId = nextEntityId;
    filters.query = ''; search.value = '';
    if (section === 'records') { recordFilters.q = recordQuery; search.value = recordQuery; recordState.offset = 0; }
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
  function searchRecords(q = '') {
    if (destroyed) return;
    defaultRecordFilters(String(q ?? ''));
    open('records', null, recordFilters.q);
  }
  function openRecord(id, context = {}) {
    if (destroyed) return;
    defaultRecordFilters(String(context.q ?? ''), context);
    open('records', id ?? null, recordFilters.q);
  }
  function destroy() {
    if (destroyed) return;
    close(); destroyed = true;
    invalidateRecordRequests(); manifestGeneration++;
    for (const removeListener of listeners) removeListener();
    dialog.remove();
  }
  if (corpus) loadManifest();
  return { open, close, refresh, destroy, searchRecords, openRecord };
}
