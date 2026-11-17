import { ERAS, SNAPSHOTS, SOURCES } from './data.js';
import * as atlasData from './data.js';
import { formatYear, getSnapshotForYear, project } from './model.js';
import { createExplorer } from './explorer.js';
import { buildCityHistories, searchCatalogue } from './catalogue.js';
import { createCorpusStore } from './corpus-client.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

export async function initAtlas({ document: doc, window: win, fetch: fetchResource, corpusStore }) {
  const $ = selector => doc.querySelector(selector);
  const sources = new Map(SOURCES.map(source => [source.id, source]));
  const figures = atlasData.FIGURES || [];
  const polities = atlasData.POLITIES || [];
  const figureById = new Map(figures.map(figure => [figure.id, figure]));
  const polityById = new Map(polities.map(polity => [polity.id, polity]));
  const cityByPlace = new Map();
  for (const city of buildCityHistories(SNAPSHOTS)) for (const record of city.records) cityByPlace.set(record.place, city);
  const state = { index: Math.max(0, SNAPSHOTS.findIndex(snapshot => snapshot.year === 698)), playing: false, zoom: 1, x: 0, y: 0, selectedPlace: null, selectedFigure: null };
  let explorer;
  const corpus = corpusStore || createCorpusStore({ fetchResource });
  let destroyed = false;
  let playbackTimer;
  let toastTimer;
  let lastFocused;
  const listeners = [];
  function on(target, type, callback, options) {
    target.addEventListener(type, callback, options);
    listeners.push(() => target.removeEventListener(type, callback, options));
  }
  function element(tag, className, content) {
    const node = doc.createElement(tag);
    if (className) node.className = className;
    if (content !== undefined) node.textContent = content;
    return node;
  }
  function svgElement(tag, attributes = {}) {
    const node = doc.createElementNS(SVG_NS, tag);
    for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
    return node;
  }
  function sourceLinks(ids, target, compact = false) {
    target.replaceChildren();
    for (const id of [...new Set(ids)]) {
      const source = sources.get(id);
      if (!source) continue;
      const link = element('a', 'source-link', `${source.title} ↗`);
      link.href = source.url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.title = `${source.publisher} · ${source.title}`;
      target.append(link);
    }
  }
  function toast(message) {
    clearTimeout(toastTimer);
    $('#toast').textContent = message;
    $('#toast').hidden = false;
    toastTimer = setTimeout(() => { $('#toast').hidden = true; }, 6500);
  }
  function stop() {
    clearInterval(playbackTimer);
    state.playing = false;
    $('#play').textContent = '▶';
    $('#play').setAttribute('aria-label', '시간 자동 재생');
    $('#play').setAttribute('aria-pressed', 'false');
  }
  function play() {
    if (state.playing) { stop(); return; }
    if (state.index === SNAPSHOTS.length - 1) selectSnapshot(0);
    state.playing = true;
    $('#play').textContent = 'Ⅱ';
    $('#play').setAttribute('aria-label', '시간 자동 재생 일시정지');
    $('#play').setAttribute('aria-pressed', 'true');
    playbackTimer = setInterval(() => {
      selectSnapshot(state.index + 1, false);
      if (state.index === SNAPSHOTS.length - 1) stop();
    }, Number($('#speed').value) || 3500);
  }
  function closePopup() {
    state.selectedPlace = null;
    $('#place-popup').hidden = true;
    doc.querySelectorAll('.map-marker').forEach(node => node.setAttribute('aria-pressed', 'false'));
  }
  function showPlace(place) {
    state.selectedPlace = place.id;
    const popup = $('#place-popup');
    popup.replaceChildren();
    popup.hidden = false;
    const close = element('button', 'popup-close icon-button', '×');
    close.setAttribute('aria-label', '장소 설명 닫기');
    close.addEventListener('click', closePopup);
    popup.append(close, element('span', 'eyebrow', `${place.polity} · ${place.kind === 'capital' ? '수도' : place.kind === 'event' ? '사건' : '유적·거점'}`), element('h3', '', place.name), element('p', 'place-modern-name', place.modernName || ''), element('p', 'place-note', place.note));
    const links = element('div', 'popup-sources');
    sourceLinks(place.sourceIds, links, true);
    popup.append(links);
    const city = cityByPlace.get(place);
    if (city) {
      const history = element('button', 'text-button', `${city.name}의 시대별 기록 보기 ↗`);
      history.addEventListener('click', () => openExplorer('places', city.id));
      popup.append(history);
    }
    doc.querySelectorAll('.map-marker').forEach(node => node.setAttribute('aria-pressed', String(node.getAttribute('data-place-id') === place.id)));
  }
  function updateCamera() {
    $('#map-camera').setAttribute('transform', `translate(${state.x} ${state.y}) scale(${state.zoom})`);
  }
  function fitPoints(points, always = false) {
    state.zoom = 1; state.x = 0; state.y = 0;
    if (points.length && (always || points.some(([x, y]) => x < 200 || x > 850 || y < 160 || y > 780))) {
      const xs = points.map(point => point[0]); const ys = points.map(point => point[1]);
      const left = Math.min(...xs); const right = Math.max(...xs);
      const top = Math.min(...ys); const bottom = Math.max(...ys);
      state.zoom = Math.min(1, 650 / Math.max(right - left, 1), 580 / Math.max(bottom - top, 1));
      state.x = 525 - (left + right) / 2 * state.zoom;
      state.y = 450 - (top + bottom) / 2 * state.zoom;
    }
    updateCamera();
  }
  function clearFigureRoute(refit = true) {
    state.selectedFigure = null;
    $('#figure-route-layer').replaceChildren();
    $('#active-route').hidden = true;
    $('.map-panel').classList.remove('has-active-route');
    if (refit) {
      closePopup();
      fitPoints(SNAPSHOTS[state.index].places.map(place => project(place.coord)));
      try { win.history.replaceState(null, '', `#${SNAPSHOTS[state.index].id}`); } catch { /* Local-file restrictions. */ }
    }
  }
  function showFigureRoute(figure) {
    const stops = [...figure.stops].sort((a, b) => a.year - b.year);
    if (!stops.length) { toast('이 인물은 위치가 확인된 활동 지점이 별도로 수록되어 있지 않습니다.'); return; }
    const scene = getSnapshotForYear(SNAPSHOTS, stops.at(-1).year);
    selectSnapshot(SNAPSHOTS.indexOf(scene));
    state.selectedFigure = figure.id;
    const layer = $('#figure-route-layer');
    const path = svgElement('path', { class: 'figure-route-line', d: stops.map((stop, i) => `${i ? 'L' : 'M'}${project(stop.coord).join(',')}`).join(' '), fill: 'none', 'aria-hidden': 'true' });
    layer.append(path);
    const placed = [];
    for (const [index, routeStop] of stops.entries()) {
      const [anchorX, anchorY] = project(routeStop.coord);
      let x = anchorX; let y = anchorY;
      while (placed.some(point => Math.hypot(point[0] - x, point[1] - y) < 45)) { x += 46; y -= 48; }
      placed.push([x, y]);
      if (x !== anchorX || y !== anchorY) layer.append(svgElement('path', { class: 'marker-connector', d: `M${anchorX},${anchorY}L${x},${y}`, fill: 'none', 'aria-hidden': 'true' }));
      const marker = svgElement('g', { class: 'figure-route-stop', transform: `translate(${x} ${y})`, role: 'button', tabindex: '0', 'aria-label': `${index + 1}. ${figure.name} · ${formatYear(routeStop.year)} · ${routeStop.label}` });
      marker.append(svgElement('circle', { r: '13' }));
      const number = svgElement('text', { class: 'figure-route-number', 'text-anchor': 'middle', y: '4' });
      number.textContent = String(index + 1);
      const label = svgElement('text', { class: 'figure-route-label', x: '19', y: '-4' });
      label.textContent = `${routeStop.label} · ${routeStop.year < 0 ? 'BCE ' + Math.abs(routeStop.year) : routeStop.year}`;
      marker.append(number, label);
      const show = () => showPlace({ id: `route-${figure.id}-${index}`, name: routeStop.label, modernName: formatYear(routeStop.year), kind: 'event', polity: figure.name, note: routeStop.description, sourceIds: routeStop.sourceIds });
      marker.addEventListener('click', show);
      marker.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); show(); } });
      layer.append(marker);
    }
    fitPoints(stops.map(stop => project(stop.coord)), true);
    $('#active-route-name').textContent = `${figure.name} · 활동 지점 ${stops.length}곳`;
    $('#active-route-description').textContent = `${formatYear(stops[0].year)} — ${formatYear(stops.at(-1).year)} · 연대순 연결선이며 실제 이동 경로가 아닙니다.`;
    $('#active-route').hidden = false;
    $('.map-panel').classList.add('has-active-route');
    try { win.history.replaceState(null, '', `#${scene.id}?figure=${encodeURIComponent(figure.id)}`); } catch { /* Local-file restrictions. */ }
    $('#map').focus();
  }
  function openExplorer(section = 'timeline', id = null) { stop(); explorer.open(section, id); }
  function zoomTo(next, anchor = [500, 450]) {
    const clamped = Math.min(4, Math.max(0.7, next));
    const ratio = clamped / state.zoom;
    state.x = anchor[0] - (anchor[0] - state.x) * ratio;
    state.y = anchor[1] - (anchor[1] - state.y) * ratio;
    state.zoom = clamped;
    updateCamera();
  }
  function mapPoint(event) {
    const svg = $('#map');
    if (svg.createSVGPoint && svg.getScreenCTM?.()) {
      const point = svg.createSVGPoint();
      point.x = event.clientX;
      point.y = event.clientY;
      const result = point.matrixTransform(svg.getScreenCTM().inverse());
      return [result.x, result.y];
    }
    const rect = svg.getBoundingClientRect();
    return [(event.clientX - rect.left) / rect.width * 1000, (event.clientY - rect.top) / rect.height * 900];
  }
  function renderMap(snapshot) {
    const markers = $('#marker-layer');
    markers.replaceChildren();
    const capitalsVisible = $('#capitals-toggle').checked;
    const eventsVisible = $('#events-toggle').checked;
    const placed = [];
    for (const place of snapshot.places) {
      if (place.kind === 'event' ? !eventsVisible : !capitalsVisible) continue;
      const [anchorX, anchorY] = project(place.coord);
      let x = anchorX;
      let y = anchorY;
      while (placed.some(point => Math.hypot(point[0] - x, point[1] - y) < 70)) { x += 84; y += 70; }
      placed.push([x, y]);
      if (x !== anchorX || y !== anchorY) {
        markers.append(svgElement('path', { class: 'marker-connector', d: `M${anchorX},${anchorY}L${x},${y}`, fill: 'none', 'aria-hidden': 'true' }));
      }
      const marker = svgElement('g', { class: `map-marker ${place.kind}`, transform: `translate(${x} ${y})`, tabindex: '0', role: 'button', 'data-place-id': place.id, 'aria-pressed': String(state.selectedPlace === place.id), 'aria-label': `${place.name}, ${place.polity}, ${place.kind === 'capital' ? '수도' : '사건·거점'}. 설명 열기` });
      marker.style.setProperty('--marker-color', place.color || snapshot.color);
      marker.append(svgElement('circle', { class: 'marker-halo', r: place.kind === 'capital' ? '18' : '14' }));
      if (place.kind === 'capital') marker.append(svgElement('path', { class: 'marker-dot', d: 'M0 -6L6 0L0 6L-6 0Z' }));
      else marker.append(svgElement('circle', { class: 'marker-dot', r: '4.5' }));
      const label = svgElement('text', { class: 'marker-label', x: '13', y: '-3' });
      label.textContent = place.name;
      const polity = svgElement('text', { class: 'marker-polity', x: '13', y: '14' });
      polity.textContent = place.polity;
      const title = svgElement('title');
      title.textContent = `${place.name} · ${place.modernName || place.polity}`;
      marker.append(label, polity, title);
      marker.addEventListener('click', () => showPlace(place));
      marker.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); showPlace(place); }
      });
      markers.append(marker);
    }
    const polities = new Map();
    for (const place of snapshot.places) polities.set(place.polity, place.color || snapshot.color);
    $('#map-legend').replaceChildren();
    for (const [polity, color] of polities) {
      const item = element('span', 'legend-item');
      const swatch = element('i', 'legend-swatch');
      swatch.style.backgroundColor = color;
      item.append(swatch, element('span', '', polity));
      $('#map-legend').append(item);
    }
    renderRoutes(snapshot);
  }
  function renderRoutes(snapshot) {
    const layer = $('#route-layer');
    layer.replaceChildren();
    if (!$('#routes-toggle').checked) return;
    const currentPolities = new Set(snapshot.places.map(place => place.polity));
    const routes = new Map();
    for (const frame of SNAPSHOTS.slice(0, state.index + 1)) {
      for (const place of frame.places) {
        if (place.kind !== 'capital' || !currentPolities.has(place.polity)) continue;
        const route = routes.get(place.polity) || [];
        const identity = candidate => candidate.siteId || cityByPlace.get(candidate)?.id || candidate.coord.toString();
        if (!route.length || identity(route.at(-1)) !== identity(place)) route.push(place);
        routes.set(place.polity, route);
      }
    }
    for (const [polity, places] of routes) {
      if (places.length < 2) continue;
      const path = svgElement('path', { class: 'capital-route', d: places.map((place, i) => `${i ? 'L' : 'M'}${project(place.coord).join(',')}`).join(' '), fill: 'none', stroke: places.at(-1).color || snapshot.color });
      const title = svgElement('title');
      title.textContent = `${polity} · 수록된 수도의 연결선 (실제 이동 경로 아님): ${places.map(place => place.name).join(' → ')}`;
      path.append(title);
      layer.append(path);
    }
  }
  function renderChronicle(snapshot) {
    $('#chronicle-date').textContent = formatYear(snapshot.year);
    $('#chronicle-title').textContent = snapshot.title;
    $('#chronicle-kicker').textContent = snapshot.kicker;
    $('#chronicle-summary').textContent = snapshot.summary;
    $('#historical-note').textContent = snapshot.note;
    $('#historical-note').hidden = !snapshot.note;
    $('#scene-tags').replaceChildren(...(snapshot.tags || []).map(tag => element('span', 'tag-chip', tag)));
    $('#snapshot-counter').textContent = `${String(state.index + 1).padStart(2, '0')} / ${SNAPSHOTS.length}`;
    const events = $('#events-content');
    events.replaceChildren();
    for (const event of snapshot.events) {
      const card = element('article', 'event-card');
      card.dataset.eventTitle = event.title;
      card.dataset.eventYear = String(event.year);
      card.append(element('span', 'event-year', formatYear(event.year)), element('h3', 'event-title', event.title), element('p', 'event-description', event.description));
      const links = element('div', 'event-sources');
      sourceLinks(event.sourceIds, links, true);
      card.append(links);
      if (event.placeId) {
        const place = snapshot.places.find(candidate => candidate.id === event.placeId);
        if (place) {
          const button = element('button', 'text-button event-map-link', '지도에서 보기 ↗');
          button.addEventListener('click', () => { showPlace(place); $('#map').focus(); });
          card.append(button);
        }
      }
      events.append(card);
    }
    const places = $('#places-content');
    places.replaceChildren();
    for (const place of snapshot.places) {
      const card = element('article', 'place-card');
      const button = element('button', 'place-title', `${place.kind === 'capital' ? '◆' : '●'} ${place.name}`);
      button.style.setProperty('--marker-color', place.color || snapshot.color);
      button.addEventListener('click', () => { showPlace(place); $('#map').focus(); });
      card.append(element('span', 'eyebrow', place.polity), button, element('p', 'place-modern-name', place.modernName || ''), element('p', 'place-note', place.note));
      const links = element('div', 'event-sources');
      sourceLinks(place.sourceIds, links, true);
      card.append(links);
      places.append(card);
    }
    if (!snapshot.places.length) places.append(element('p', 'place-note', '위치를 확정하기 어려운 장소는 지도에 표시하지 않았습니다. 사건과 출처에서 설명을 확인하세요.'));
    const details = $('#details-content');
    details.replaceChildren();
    for (const section of snapshot.sections || []) {
      const article = element('article', 'scene-section');
      article.append(element('h3', '', section.heading), element('p', '', section.body));
      const links = element('div', 'detail-sources');
      sourceLinks(section.sourceIds, links, true);
      article.append(links);
      details.append(article);
    }
    for (const id of snapshot.polityIds || []) {
      const polity = polityById.get(id);
      if (!polity) continue;
      const button = element('button', 'scene-polity-link', `${polity.name} 개관 읽기 ↗`);
      button.addEventListener('click', () => openExplorer('polities', polity.id));
      details.append(button);
    }
    const people = $('#people-content');
    people.replaceChildren();
    for (const id of snapshot.figureIds || []) {
      const figure = figureById.get(id);
      if (!figure) continue;
      const button = element('button', 'scene-related-figure');
      button.append(element('span', 'eyebrow', figure.role), element('strong', '', figure.name), element('small', '', figure.years), element('span', '', figure.summary));
      button.addEventListener('click', () => openExplorer('figures', figure.id));
      people.append(button);
    }
    const allPeople = element('button', 'text-button', `인물 ${figures.length}명 전체 살펴보기 ↗`);
    allPeople.addEventListener('click', () => openExplorer('figures'));
    people.append(allPeople);
    sourceLinks(snapshot.sourceIds, $('#snapshot-sources'));
  }
  function selectSnapshot(index, manual = true) {
    if (manual) stop();
    state.index = Math.max(0, Math.min(SNAPSHOTS.length - 1, index));
    const snapshot = SNAPSHOTS[state.index];
    clearFigureRoute(false);
    closePopup();
    $('#map-title').textContent = snapshot.title;
    $('#map-subtitle').textContent = snapshot.kicker;
    $('#map-year-value').textContent = Math.abs(snapshot.year);
    $('#map-year-era').textContent = snapshot.year < 0 ? 'BCE' : 'CE';
    $('#time-slider').value = String(state.index);
    $('#time-slider').setAttribute('aria-valuetext', `${formatYear(snapshot.year)} ${snapshot.title}`);
    $('#year-input').value = String(snapshot.year);
    $('#previous').disabled = state.index === 0;
    $('#next').disabled = state.index === SNAPSHOTS.length - 1;
    doc.querySelectorAll('.era-button').forEach(button => button.setAttribute('aria-current', String(button.getAttribute('data-era') === snapshot.era)));
    renderChronicle(snapshot);
    renderMap(snapshot);
    fitPoints(snapshot.places.map(place => project(place.coord)));
    explorer?.refresh(snapshot);
    try { win.history.replaceState(null, '', `#${snapshot.id}`); } catch { /* Static local files may disallow history mutation. */ }
    doc.title = `${snapshot.title} · ${formatYear(snapshot.year)} | 산하`;
  }
  function openDialog(dialog) {
    stop();
    lastFocused = doc.activeElement;
    if (dialog.showModal) dialog.showModal();
    else dialog.setAttribute('open', '');
  }
  function closeDialog(dialog) {
    if (dialog.close) dialog.close();
    else dialog.removeAttribute('open');
    lastFocused?.focus?.();
  }
  for (const era of ERAS) {
    const button = element('button', 'era-button');
    button.setAttribute('data-era', era.id);
    button.style.setProperty('--era-color', era.color);
    button.append(element('span', 'era-name', era.label), element('small', 'era-range', era.range));
    on(button, 'click', () => selectSnapshot(SNAPSHOTS.findIndex(snapshot => snapshot.era === era.id)));
    $('#era-nav').append(button);
  }
  const first = SNAPSHOTS[0].year;
  const last = SNAPSHOTS.at(-1).year;
  $('#timeline-range').textContent = `${formatYear(first)} — ${formatYear(last)}`;
  $('#first-year').textContent = formatYear(first);
  $('#last-year').textContent = formatYear(last);
  $('#time-slider').max = String(SNAPSHOTS.length - 1);
  $('#year-input').min = String(first);
  $('#year-input').max = String(last);
  on($('#previous'), 'click', () => selectSnapshot(state.index - 1));
  on($('#next'), 'click', () => selectSnapshot(state.index + 1));
  on($('#play'), 'click', play);
  on($('#speed'), 'change', () => { if (state.playing) { stop(); play(); } });
  on($('#time-slider'), 'input', event => selectSnapshot(Number(event.target.value)));
  on($('#year-form'), 'submit', event => {
    event.preventDefault();
    const year = Number($('#year-input').value);
    if (!Number.isInteger(year) || year === 0) { toast('역사 연도에는 0년이 없습니다. 기원전은 음수로 입력하세요.'); return; }
    if (year < first || year > last) { toast(`${formatYear(first)}부터 ${formatYear(last)}까지 입력하세요.`); return; }
    const snapshot = getSnapshotForYear(SNAPSHOTS, year);
    selectSnapshot(SNAPSHOTS.indexOf(snapshot));
    if (snapshot.year !== year) toast(`${formatYear(year)}에 앞서는 대표 시점인 ${formatYear(snapshot.year)}의 기록을 표시합니다.`);
  });
  for (const name of ['capitals', 'events', 'routes']) on($(`#${name}-toggle`), 'change', () => {
    closePopup();
    renderMap(SNAPSHOTS[state.index]);
    if (name === 'routes' && $('#routes-toggle').checked) toast('수록된 수도를 시간순으로 잇습니다. 실제 이동 경로나 영토 경계는 아닙니다.');
  });
  const panelNames = ['events', 'details', 'places', 'people'];
  function switchTab(selected) {
    for (const name of panelNames) {
      const active = name === selected;
      $(`#${name}-tab`).setAttribute('aria-selected', String(active));
      $(`#${name}-tab`).tabIndex = active ? 0 : -1;
      $(`#${name}-content`).hidden = !active;
    }
  }
  for (const name of panelNames) {
    on($(`#${name}-tab`), 'click', () => switchTab(name));
    on($(`#${name}-tab`), 'keydown', event => {
      if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
        event.preventDefault(); event.stopPropagation();
        const target = event.key === 'Home' ? panelNames[0] : event.key === 'End' ? panelNames.at(-1) : panelNames[(panelNames.indexOf(name) + (event.key === 'ArrowRight' ? 1 : panelNames.length - 1)) % panelNames.length];
        switchTab(target); $(`#${target}-tab`).focus();
      }
    });
  }
  switchTab('details');
  explorer = createExplorer({
    document: doc, snapshots: SNAPSHOTS, eras: ERAS, sources: SOURCES, figures, polities, corpus,
    onSelectSnapshot: id => { const index = SNAPSHOTS.findIndex(snapshot => snapshot.id === id); if (index >= 0) selectSnapshot(index); },
    onRoute: showFigureRoute,
    onClearRoute: clearFigureRoute,
    onOpenPlace: showPlace,
  });
  $('#atlas-statistics').textContent = `지도 해설 ${SNAPSHOTS.length}개 · 사건 항목 ${SNAPSHOTS.reduce((total, snapshot) => total + snapshot.events.length, 0)}개 · 인물 ${figures.length}명`;
  corpus.getManifest().then(manifest => {
    if (destroyed) return;
    const count = manifest.recordCount.toLocaleString('ko-KR');
    $('#corpus-count').textContent = `${count}건`;
    $('#scene-corpus-open').textContent = `공식 자료 연표 ${count}건 살펴보기 ↗`;
    $('#corpus-open').setAttribute('aria-label', `공식 자료 연표 ${count}건 열기`);
  }).catch(() => { /* The corpus tab supplies retry and error feedback; map scenes remain available. */ });
  on($('#corpus-open'), 'click', () => openExplorer('records'));
  on($('#scene-corpus-open'), 'click', () => openExplorer('records'));
  on($('#search-corpus-open'), 'click', () => {
    const query = $('#search-input').value;
    closeDialog($('#search-dialog'));
    stop();
    explorer.searchRecords(query);
  });
  on($('#explore-open'), 'click', () => openExplorer());
  on($('#scene-timeline-open'), 'click', () => openExplorer('timeline'));
  on($('#scene-polities-open'), 'click', () => openExplorer('polities'));
  on($('#route-clear'), 'click', () => clearFigureRoute());
  on($('#route-details'), 'click', () => { if (state.selectedFigure) openExplorer('figures', state.selectedFigure); });
  on($('#search-open'), 'click', () => { openDialog($('#search-dialog')); $('#search-input').focus(); });
  for (const id of ['sources-open', 'method-open']) on($(`#${id}`), 'click', () => openDialog($('#sources-dialog')));
  doc.querySelectorAll('#search-dialog [data-close], #sources-dialog [data-close]').forEach(button => on(button, 'click', () => closeDialog(button.closest('dialog'))));
  doc.querySelectorAll('#search-dialog, #sources-dialog').forEach(dialog => {
    on(dialog, 'click', event => { if (event.target === dialog) { const rect = dialog.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) closeDialog(dialog); } });
  });
  on($('#search-input'), 'input', event => {
    const query = event.target.value;
    const results = searchCatalogue({ snapshots: SNAPSHOTS, eras: ERAS, figures, polities }, query);
    $('#search-results').replaceChildren();
    $('#search-hint').textContent = !query.trim() ? '‘발해’, ‘한양’, ‘독립’을 찾아보세요.' : results.length ? `관련도가 높은 검색 결과 ${results.length}개 · 최대 40개 표시` : '일치하는 기록이 없습니다. 다른 시대나 지명으로 찾아보세요.';
    for (const result of results.slice(0, 40)) {
      const button = element('button', 'search-result');
      button.append(element('span', 'result-type', result.type), element('span', 'result-label', result.label), element('small', 'result-year', result.event ? formatYear(result.event.year) : result.snapshot ? formatYear(result.snapshot.year) : result.figure?.years || result.polity?.period || '상세 해설'));
      button.addEventListener('click', () => {
        closeDialog($('#search-dialog'));
        if (result.figure) openExplorer('figures', result.figure.id);
        else if (result.polity) openExplorer('polities', result.polity.id);
        else {
          selectSnapshot(SNAPSHOTS.indexOf(result.snapshot));
          if (result.place) showPlace(result.place);
          if (result.event) {
            switchTab('events');
            const card = [...doc.querySelectorAll('#events-content .event-card')].find(node => node.dataset.eventTitle === result.event.title && node.dataset.eventYear === String(result.event.year));
            if (card) { card.tabIndex = -1; card.focus(); card.scrollIntoView?.({ block: 'nearest' }); }
          } else if (result.type === '시대') switchTab('details');
        }
      });
      $('#search-results').append(button);
    }
  });
  for (const source of SOURCES) {
    const item = element('article', 'source-item');
    item.dataset.searchText = `${source.title} ${source.publisher} ${source.note || ''}`.toLocaleLowerCase('ko');
    item.append(element('span', 'eyebrow', source.publisher));
    const link = element('a', '', `${source.title} ↗`);
    link.href = source.url; link.target = '_blank'; link.rel = 'noopener noreferrer';
    item.append(link);
    if (source.note) item.append(element('p', '', source.note));
    $('#all-sources').append(item);
  }
  $('#source-count').textContent = `출처 문서 ${SOURCES.length}개`;
  on($('#source-filter'), 'input', event => {
    const query = event.target.value.trim().toLocaleLowerCase('ko');
    let count = 0;
    doc.querySelectorAll('#all-sources .source-item').forEach(item => { item.hidden = !item.dataset.searchText.includes(query); if (!item.hidden) count += 1; });
    $('#source-count').textContent = `${SOURCES.length}개 문서 중 ${count}개${count ? '' : ' · 다른 제목이나 기관으로 찾아보세요.'}`;
  });
  function updateTheme(dark) {
    doc.body.setAttribute('data-theme', dark ? 'dark' : 'light');
    $('#theme-toggle').setAttribute('aria-label', dark ? '밝은 화면으로 전환' : '어두운 화면으로 전환');
    try { win.localStorage.setItem('sanha-theme', dark ? 'dark' : 'light'); } catch { /* Theme works without storage. */ }
  }
  try { if (win.localStorage.getItem('sanha-theme') === 'dark') updateTheme(true); } catch { /* Private browsing can block storage. */ }
  on($('#theme-toggle'), 'click', () => updateTheme(doc.body.getAttribute('data-theme') !== 'dark'));
  on($('#share-button'), 'click', async () => {
    try { await win.navigator.clipboard.writeText(win.location.href); toast('현재 장면의 링크를 복사했습니다.'); }
    catch { toast(`주소창의 링크를 복사해 주세요. 현재 장면: #${SNAPSHOTS[state.index].id}`); }
  });
  on($('#zoom-in'), 'click', () => zoomTo(state.zoom * 1.25));
  on($('#zoom-out'), 'click', () => zoomTo(state.zoom / 1.25));
  on($('#map-reset'), 'click', () => { state.zoom = 1; state.x = 0; state.y = 0; updateCamera(); });
  let drag = null;
  on($('#map'), 'pointerdown', event => {
    if (event.target.closest('[role="button"]') || event.button > 0) return;
    const [x, y] = mapPoint(event);
    drag = { pointerId: event.pointerId, x, y, cameraX: state.x, cameraY: state.y };
    $('#map').setPointerCapture?.(event.pointerId);
    $('#map').classList.add('is-dragging');
  });
  on($('#map'), 'pointermove', event => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    const [x, y] = mapPoint(event);
    state.x = drag.cameraX + x - drag.x;
    state.y = drag.cameraY + y - drag.y;
    updateCamera();
  });
  function endDrag() { drag = null; $('#map').classList.remove('is-dragging'); }
  on($('#map'), 'pointerup', endDrag);
  on($('#map'), 'pointercancel', endDrag);
  on($('#map'), 'wheel', event => { event.preventDefault(); zoomTo(state.zoom * (event.deltaY < 0 ? 1.1 : 1 / 1.1), mapPoint(event)); }, { passive: false });
  on(doc, 'keydown', event => {
    if (/^(INPUT|SELECT|TEXTAREA|BUTTON)$/.test(event.target.tagName) || event.target.closest('[role="button"]') || event.ctrlKey || event.metaKey || event.altKey) return;
    if (doc.querySelector('dialog[open]')) return;
    if (event.key === 'ArrowLeft') { event.preventDefault(); selectSnapshot(state.index - 1); }
    if (event.key === 'ArrowRight') { event.preventDefault(); selectSnapshot(state.index + 1); }
    if (event.key === ' ') { event.preventDefault(); play(); }
    if (event.key === '/') { event.preventDefault(); openDialog($('#search-dialog')); $('#search-input').focus(); }
    if (event.key === 'Escape') closePopup();
  });
  on(doc, 'visibilitychange', () => { if (doc.hidden) stop(); });
  function readHash() {
    const [id, query = ''] = win.location.hash.replace(/^#/, '').split('?');
    return { index: SNAPSHOTS.findIndex(snapshot => snapshot.id === id), figure: figureById.get(new URLSearchParams(query).get('figure')) };
  }
  on(win, 'hashchange', () => {
    const hash = readHash();
    if (hash.index >= 0) selectSnapshot(hash.index);
    if (hash.figure) showFigureRoute(hash.figure);
  });
  const initialHash = readHash();
  const hashIndex = initialHash.index;
  selectSnapshot(hashIndex >= 0 ? hashIndex : state.index);
  if (initialHash.figure) showFigureRoute(initialHash.figure);
  const labels = [ ['동해', [132.2, 38.2], 'water-label'], ['황해', [122.5, 36.3], 'water-label'], ['남해', [128.5, 32.4], 'water-label'], ['제주', [126.5, 33.1], 'geo-label'], ['한반도', [127.6, 36.4], 'geo-label region-label'], ['만주', [124.8, 43.6], 'geo-label region-label'] ];
  for (const [text, coord, className] of labels) {
    const [x, y] = project(coord);
    const node = svgElement('text', { x, y, class: className, 'text-anchor': 'middle' });
    node.textContent = text;
    $('#geo-labels').append(node);
  }
  try {
    const response = await fetchResource(new URL('./assets/land.geojson', import.meta.url));
    if (!response.ok) throw new Error('Map request failed');
    const geography = await response.json();
    for (const feature of geography.features) {
      const polygons = feature.geometry.type === 'MultiPolygon' ? feature.geometry.coordinates : [feature.geometry.coordinates];
      const d = polygons.flatMap(polygon => polygon.map(ring => ring.map((coord, index) => `${index ? 'L' : 'M'}${project(coord).map(number => number.toFixed(2)).join(',')}`).join(' ') + 'Z')).join(' ');
      $('#land-layer').append(svgElement('path', { class: 'land', d, 'fill-rule': 'evenodd' }));
    }
    $('#map-load-status').hidden = true;
  } catch {
    $('#map-load-status').hidden = false;
    $('#map-load-status').textContent = '해안선 지도를 불러오지 못했습니다. 시대 선택·사건·출처는 계속 이용할 수 있습니다.';
  }
  return { selectSnapshot, stop, explorer, get state() { return { ...state }; }, destroy() { destroyed = true; stop(); explorer.destroy(); if (!corpusStore) corpus.dispose(); clearTimeout(toastTimer); listeners.forEach(remove => remove()); } };
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  initAtlas({ document, window, fetch: window.fetch.bind(window) }).catch(() => {
    const status = document.querySelector('#map-load-status');
    status.hidden = false;
    status.textContent = '지도를 시작하지 못했습니다. 페이지를 새로고침해 주세요.';
  });
}
