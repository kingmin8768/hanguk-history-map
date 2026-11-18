import { ERAS, SNAPSHOTS, SOURCES } from './data.js';
import * as atlasData from './data.js';
import { formatYear, getSnapshotForYear, project } from './model.js';
import { createExplorer } from './explorer.js';
import { buildCityHistories, searchCatalogue } from './catalogue.js';
import { createCorpusStore } from './corpus-client.js';
import { createRecordBrowser } from './record-browser.js';
import { createMainRecordView } from './main-record-view.js';
import { createDistributionView } from './distribution-view.js';
import { READING_PATHS } from './reading-paths-data.js';
import { createPlaceMapView } from './place-map-view.js';
import { createCompareView } from './compare-view.js';
import { PLACE_RECORD_LINKS } from './place-record-links.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const atlasTitle = '한국사 지도';
const homeSceneIndex = SNAPSHOTS.findIndex(snapshot => snapshot.id === 'hanyang-1394');

function insideMapFrame([x, y]) {
  return x >= 24 && x <= 976 && y >= 24 && y <= 876;
}

export async function initAtlas({ document: doc, window: win, fetch: fetchResource, corpusStore }) {
  const $ = selector => doc.querySelector(selector);
  const sources = new Map(SOURCES.map(source => [source.id, source]));
  const figures = atlasData.FIGURES || [];
  const polities = atlasData.POLITIES || [];
  const figureById = new Map(figures.map(figure => [figure.id, figure]));
  const polityById = new Map(polities.map(polity => [polity.id, polity]));
  const cities = buildCityHistories(SNAPSHOTS);
  const cityByPlace = new Map();
  for (const city of cities) for (const record of city.records) cityByPlace.set(record.place, city);
  const state = { mode: null, index: Math.max(0, homeSceneIndex), playing: false, zoom: 1, x: 0, y: 0, selectedPlace: null, selectedFigure: null };
  const markerPositions = new WeakMap();
  let explorer, recordBrowser, recordView;
  const corpus = corpusStore || createCorpusStore({ fetchResource });
  let destroyed = false;
  let playbackTimer;
  let toastTimer;
  let lastFocused;
  let sliderTimer;
  let renderedFilters = '';
  let renderedManifest;
  let playbackGeneration = 0;
  const countLabel = value => Number(value).toLocaleString('ko-KR');
  const sceneFirst = SNAPSHOTS[0].year;
  const sceneLast = SNAPSHOTS.at(-1).year;
  const eraRanges = [[null, 313], [314, 697], [698, 899], [900, 935], [936, 1391], [1392, 1591], [1592, 1637], [1638, 1875], [1876, 1896], [1897, 1909], [1910, 1944], [1945, 1987], [1988, null]];
  const readingPathById = new Map(READING_PATHS.map(path => [path.id, path]));
  let readingPath = null;
  const distributionView = createDistributionView({
    panel: $('#record-distribution'),
    corpus,
    eras: ERAS.map((era, index) => ({ label: era.label, from: eraRanges[index][0], to: eraRanges[index][1] })),
    onSelectRange(fromYear, toYear) {
      stop();
      recordBrowser.setFilters({ fromYear, toYear });
    },
  });
  const landLayer = $('#land-layer');
  const placeMapView = createPlaceMapView({
    document: doc, cities, sources, landLayer, recordLinks: PLACE_RECORD_LINKS,
    onSelectScene: openMapToolScene,
    onOpenRecord(recordId) {
      openRecords(recordId);
      $('#chronicle').focus();
    },
    onShare: cityId => shareMapTool('places', { city: cityId }),
  });
  const compareView = createCompareView({
    document: doc, snapshots: SNAPSHOTS, landLayer,
    onSelectScene: openMapToolScene,
    onShare: (left, right) => shareMapTool('compare', { left, right }),
  });
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
    playbackGeneration += 1;
    clearInterval(playbackTimer);
    clearTimeout(sliderTimer);
    state.playing = false;
    $('#play').textContent = '▶';
    $('#play').setAttribute('aria-label', '시간 자동 재생');
    $('#play').setAttribute('aria-pressed', 'false');
  }
  function beginPlayback() {
    clearInterval(playbackTimer);
    clearTimeout(sliderTimer);
    const generation = playbackGeneration;
    state.playing = true;
    $('#play').textContent = 'Ⅱ';
    $('#play').setAttribute('aria-label', '시간 자동 재생 일시정지');
    $('#play').setAttribute('aria-pressed', 'true');
    playbackTimer = setInterval(async () => {
      if (state.mode === 'records') {
        const recordState = recordBrowser.state;
        if (recordState.status !== 'ready') return;
        if (recordState.index >= recordState.total - 1) { stop(); return; }
        await recordBrowser.next();
        if (generation !== playbackGeneration || destroyed) return;
        const current = recordBrowser.state;
        if (state.mode === 'records' && (current.status === 'error' || current.index >= current.total - 1)) stop();
      } else {
        selectSnapshot(state.index + 1, false);
        if (state.index === SNAPSHOTS.length - 1) stop();
      }
    }, Number($('#speed').value) || 3500);
  }
  function play() {
    if (state.playing) { stop(); return; }
    if (state.mode === 'records') {
      const current = recordBrowser.state;
      if (current.status !== 'ready' || !current.total) return;
      if (current.index >= current.total - 1) {
        const generation = playbackGeneration;
        recordBrowser.goTo(0).then(result => {
          if (!destroyed && state.mode === 'records' && generation === playbackGeneration && result.status === 'ready') beginPlayback();
        });
      } else beginPlayback();
      return;
    }
    if (state.index === SNAPSHOTS.length - 1) selectSnapshot(0);
    beginPlayback();
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
      const history = element('button', 'text-button', `${city.name}의 장소별 역사 ↗`);
      history.addEventListener('click', () => openPlaceMap(city.id));
      popup.append(history);
    }
    doc.querySelectorAll('.map-marker').forEach(node => node.setAttribute('aria-pressed', String(node.getAttribute('data-place-id') === place.id)));
  }
  function updateCamera() {
    $('#map-camera').setAttribute('transform', `translate(${state.x} ${state.y}) scale(${state.zoom})`);
    doc.querySelectorAll('.map-marker, .figure-route-stop').forEach(updateMarkerVisibility);
  }
  function isOnScreen([x, y]) {
    return insideMapFrame([x * state.zoom + state.x, y * state.zoom + state.y]);
  }
  function updateMarkerVisibility(marker) {
    const visible = isOnScreen(markerPositions.get(marker));
    marker.setAttribute('tabindex', visible ? '0' : '-1');
    marker.setAttribute('aria-hidden', String(!visible));
    marker.setAttribute('visibility', visible ? 'visible' : 'hidden');
  }
  function setMapViewLabel(label) {
    $('#map-view-label').textContent = label;
    $('#map-view-status').hidden = !label;
  }
  function resetMapView() {
    state.zoom = 1;
    state.x = 0;
    state.y = 0;
    setMapViewLabel('');
    updateCamera();
  }
  function fitPoints(points) {
    const xs = points.map(point => point[0]); const ys = points.map(point => point[1]);
    const left = Math.min(...xs); const right = Math.max(...xs);
    const top = Math.min(...ys); const bottom = Math.max(...ys);
    state.zoom = Math.min(1, 650 / Math.max(right - left, 1), 580 / Math.max(bottom - top, 1));
    state.x = 525 - (left + right) / 2 * state.zoom;
    state.y = 450 - (top + bottom) / 2 * state.zoom;
    updateCamera();
  }
  function showPlaceOnMap(place) {
    stop();
    const point = project(place.coord);
    if (!insideMapFrame(point)) {
      fitPoints([point]);
      setMapViewLabel(`${place.name} · ${place.polity}`);
    } else if (!isOnScreen(point)) resetMapView();
    showPlace(place);
    $('#map').focus();
  }
  function clearFigureRoute(refit = true) {
    state.selectedFigure = null;
    $('#figure-route-layer').replaceChildren();
    $('#active-route').hidden = true;
    $('.map-panel').classList.remove('has-active-route');
    if (refit && state.mode === 'scenes') {
      closePopup();
      resetMapView();
      writeSceneHash(SNAPSHOTS[state.index]);
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
      markerPositions.set(marker, [x, y]);
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
    fitPoints(stops.map(stop => project(stop.coord)));
    setMapViewLabel(`${figure.name} · 활동 지점 지도`);
    $('#active-route-name').textContent = `${figure.name} · 활동 지점 ${stops.length}곳`;
    $('#active-route-description').textContent = `${formatYear(stops[0].year)} — ${formatYear(stops.at(-1).year)} · 연대순 연결선이며 실제 이동 경로가 아닙니다.`;
    $('#active-route').hidden = false;
    $('.map-panel').classList.add('has-active-route');
    try { win.history.replaceState(null, '', `#${scene.id}?figure=${encodeURIComponent(figure.id)}`); } catch { /* Local-file restrictions. */ }
    $('#map').focus();
  }
  function openExplorer(section = 'timeline', id = null) { stop(); explorer.open(section, id); }
  function openPlaceMap(cityId) {
    stop();
    compareView.close();
    placeMapView.open(cityId);
  }
  function openComparison(leftId, rightId) {
    stop();
    placeMapView.close();
    compareView.open(leftId, rightId);
  }
  function openMapToolScene(snapshot, place) {
    const index = SNAPSHOTS.indexOf(snapshot);
    if (index < 0) return;
    selectSnapshot(index);
    if (place) showPlaceOnMap(place);
    else $('#map').focus();
  }
  async function shareMapTool(tool, parameters) {
    const hash = `#${tool}?${new URLSearchParams(parameters)}`;
    const dialog = $(tool === 'places' ? '#places-map-dialog' : '#compare-dialog');
    const footer = dialog.querySelector('.map-tool-footer');
    const status = footer.querySelector('.map-tool-share-status') || element('p', 'map-tool-share-status');
    status.setAttribute('role', 'status');
    footer.append(status);
    try {
      const url = new URL(win.location.href);
      url.hash = hash;
      await win.navigator.clipboard.writeText(url.href);
      status.textContent = '링크를 복사했습니다.';
    } catch {
      try { win.history.replaceState(null, '', hash); } catch { /* Local-file restrictions. */ }
      status.textContent = '주소창의 링크를 복사해 주세요.';
    }
  }
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
      markerPositions.set(marker, [x, y]);
      updateMarkerVisibility(marker);
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
    const outsideMap = snapshot.places.filter(place => !insideMapFrame(project(place.coord)));
    const outsidePanel = $('#overseas-places');
    outsidePanel.hidden = !outsideMap.length;
    const outsideList = $('#overseas-place-list');
    outsideList.replaceChildren();
    for (const place of outsideMap) {
      const button = element('button', 'overseas-place-button', `${place.name} · ${place.polity} 지도에서 보기 ↗`);
      button.addEventListener('click', () => showPlaceOnMap(place));
      outsideList.append(button);
    }
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
          button.addEventListener('click', () => showPlaceOnMap(place));
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
      button.addEventListener('click', () => showPlaceOnMap(place));
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
  function setBrowseMode(mode) {
    if (state.mode === mode) return;
    stop();
    clearTimeout(sliderTimer);
    state.mode = mode;
    const records = mode === 'records';
    doc.body.dataset.browseMode = mode;
    $('.atlas').dataset.browseMode = mode;
    $('#browse-records').setAttribute('aria-pressed', String(records));
    $('#browse-scenes').setAttribute('aria-pressed', String(!records));
    $('#record-controls').hidden = !records;
    $('#record-content').hidden = !records;
    $('#record-map-note').hidden = !records;
    distributionView.setVisible(records);
    doc.querySelectorAll('.scene-only').forEach(node => { node.hidden = records; });
    $('.map-layers').hidden = records;
    $('#browse-counter-label').textContent = records ? '선택한 목록의 기록' : '지도 해설';
    $('#previous').setAttribute('aria-label', records ? '이전 기록' : '이전 장면');
    $('#next').setAttribute('aria-label', records ? '다음 기록' : '다음 장면');
    $('#slider-label').textContent = records ? '선택한 목록의 기록 번호' : '지도 해설 선택';
    $('#share-button').firstChild.textContent = records ? '현재 기록 링크 ' : '현재 장면 링크 ';
    $('#map').setAttribute('aria-label', records ? '선택한 기록의 좌표가 없는 참고 해안선 지도' : '역사적 수도와 사건 위치 지도');
    if (records) {
      readingPath = null;
      renderReadingProgress();
      $('#year-input').removeAttribute('min');
      $('#year-input').removeAttribute('max');
      clearFigureRoute(false);
      closePopup();
      for (const id of ['marker-layer', 'route-layer', 'map-legend']) $(`#${id}`).replaceChildren();
      resetMapView();
      $('.map-heading .eyebrow').textContent = '공식 자료의 연표';
    } else {
      $('.map-heading .eyebrow').textContent = '역사의 한 장면';
      $('#play').disabled = false;
      $('#year-input').disabled = false;
      $('#time-slider').disabled = false;
      $('#time-slider').max = String(SNAPSHOTS.length - 1);
      $('#year-input').min = String(sceneFirst);
      $('#year-input').max = String(sceneLast);
      $('#timeline-range').textContent = `${formatYear(sceneFirst)} — ${formatYear(sceneLast)}`;
      $('#first-year').textContent = formatYear(sceneFirst);
      $('#last-year').textContent = formatYear(sceneLast);
      $('#year-help').textContent = '기록된 대표 시점 사이를 이동합니다';
      $('#browse-mode-description').textContent = `위치·인물·출처를 연결한 지도 해설 ${SNAPSHOTS.length}개`;
    }
  }
  function setSelectValue(select, value) {
    for (const option of select.options) option.selected = option.value === String(value);
  }
  function updateRecordManifest(manifest) {
    if (!manifest) return;
    const count = countLabel(manifest.recordCount);
    $('#record-mode-count').textContent = `${count}건`;
    $('#corpus-count').textContent = `${count}건`;
    $('#scene-corpus-open').textContent = `전체 기록 ${count}건을 메인에서 읽기 ↗`;
    $('#corpus-open').setAttribute('aria-label', `공식 자료 연표 ${count}건 목록 열기`);
    if (renderedManifest === manifest.recordCount) return;
    renderedManifest = manifest.recordCount;
    renderedFilters = '';
    for (const collection of manifest.collections) {
      const option = element('option', '', `${collection.label} · ${countLabel(collection.count)}건`);
      option.value = collection.id;
      $('#record-collection').append(option);
    }
  }
  function writeRecordHash(recordState) {
    const params = new URLSearchParams();
    if (recordState.record) params.set('record', recordState.record.id);
    const filters = recordState.filters;
    if (filters.q) params.set('q', filters.q);
    if (filters.collection !== 'all') params.set('collection', filters.collection);
    if (filters.fromYear !== null) params.set('from', String(filters.fromYear));
    if (filters.toYear !== null) params.set('to', String(filters.toYear));
    if (filters.sort === 'desc') params.set('sort', 'desc');
    try { win.history.replaceState(null, '', `#records${params.size ? '?' + params : ''}`); } catch { /* Local-file restrictions. */ }
  }
  function renderRecordState(recordState) {
    if (destroyed) return;
    updateRecordManifest(recordState.manifest);
    if (state.mode !== 'records') return;
    const { record, index, total, status, filters, manifest } = recordState;
    distributionView.update(filters);
    const ready = status === 'ready';
    const hasRecord = ready && record;
    const filterKey = JSON.stringify(filters);
    if (renderedFilters !== filterKey) {
      renderedFilters = filterKey;
      $('#record-query').value = filters.q;
      setSelectValue($('#record-collection'), filters.collection);
      $('#record-from').value = filters.fromYear ?? '';
      $('#record-to').value = filters.toYear ?? '';
      setSelectValue($('#record-sort'), filters.sort);
    }
    $('#record-content').setAttribute('aria-busy', String(status === 'loading'));
    $('#snapshot-counter').textContent = ready ? `${countLabel(record ? index + 1 : 0)} / ${countLabel(total)}` : status === 'error' ? '불러오기 실패' : `— / ${manifest ? countLabel(manifest.recordCount) : '…'}`;
    $('#chronicle-date').textContent = hasRecord && Number.isInteger(record.year) ? formatYear(record.year) : '';
    $('#chronicle-title').textContent = hasRecord ? record.title || '제목 없는 기록' : ready ? '조건에 맞는 기록이 없습니다' : status === 'error' ? '기록을 불러오지 못했습니다' : '공식 기록을 불러오고 있습니다';
    const collection = manifest?.collections.find(item => item.id === record?.collectionId);
    $('#chronicle-kicker').textContent = hasRecord ? collection?.label || record.collectionId : '국사편찬위원회 · 공식 연표 메타데이터';
    $('#chronicle-summary').textContent = hasRecord ? `선택한 목록의 ${countLabel(index + 1)}번째 기록 · ${countLabel(total)}건 중` : '';
    $('#historical-note').hidden = true;
    $('#map-title').textContent = '공식 연표의 개별 기록';
    $('#map-subtitle').textContent = hasRecord ? `${collection?.label || record.collectionId} · ${formatYear(record.year)}` : '기록의 날짜와 문헌을 따라 탐색합니다';
    $('#map-year-value').textContent = hasRecord && Number.isInteger(record.year) ? Math.abs(record.year) : '—';
    $('#map-year-era').textContent = hasRecord && Number.isInteger(record.year) ? record.year < 0 ? 'BCE' : 'CE' : '';
    $('#time-slider').max = String(Math.max(0, total - 1));
    $('#time-slider').value = String(index);
    $('#time-slider').disabled = !total;
    $('#time-slider').setAttribute('aria-valuetext', hasRecord ? `${index + 1} / ${total}, ${formatYear(record.year)}, ${record.title}` : '기록 없음');
    $('#previous').disabled = !total || index <= 0;
    $('#next').disabled = !total || index >= total - 1;
    $('#play').disabled = (!ready || !total) && !state.playing;
    $('#record-position').value = String(record ? index + 1 : 1);
    $('#record-position').max = String(Math.max(1, total));
    $('#record-position').disabled = !total;
    $('#record-position-form button').disabled = !total;
    $('#year-input').disabled = !total;
    if (hasRecord && Number.isInteger(record.year)) $('#year-input').value = String(record.year);
    const from = filters.fromYear ?? manifest?.coverage.fromYear;
    const to = filters.toYear ?? manifest?.coverage.toYear;
    $('#timeline-range').textContent = from && to ? `${formatYear(from)} — ${formatYear(to)}` : '공식 연표';
    $('#first-year').textContent = from ? formatYear(from) : '';
    $('#last-year').textContent = to ? formatYear(to) : '';
    $('#year-help').textContent = '같은 해의 기록도 각각 이동합니다';
    $('#browse-mode-description').textContent = manifest ? `전체 ${countLabel(manifest.recordCount)}건 · ${ready ? '현재 조건 ' + countLabel(total) + '건' : '기록을 준비하는 중'}` : '공식 연표의 개별 기록을 탐색합니다';
    doc.querySelectorAll('.era-button').forEach((button, eraIndex) => {
      const range = eraRanges[eraIndex];
      button.setAttribute('aria-current', String(filters.fromYear === range[0] && filters.toYear === range[1]));
    });
    recordView.render(recordState);
    if (ready) writeRecordHash(recordState);
    if (status === 'error') stop();
    doc.title = `${hasRecord ? record.title : '전체 기록'} | ${atlasTitle}`;
  }
  function openRecords(id = null, filters) {
    stop();
    setBrowseMode('records');
    renderRecordState(recordBrowser.state);
    if (id) return recordBrowser.openRecord(id, filters);
    if (filters) return recordBrowser.setFilters(filters);
    if (recordBrowser.state.status === 'idle' || recordBrowser.state.status === 'error') return recordBrowser.init();
    return Promise.resolve(recordBrowser.state);
  }
  function step(direction) {
    stop();
    clearTimeout(sliderTimer);
    if (state.mode === 'records') return direction > 0 ? recordBrowser.next() : recordBrowser.previous();
    selectSnapshot(state.index + direction);
  }
  function selectSnapshot(index, manual = true, pathContext = null) {
    if (manual) stop();
    setBrowseMode('scenes');
    state.index = Math.max(0, Math.min(SNAPSHOTS.length - 1, index));
    const snapshot = SNAPSHOTS[state.index];
    readingPath = pathContext;
    renderReadingProgress();
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
    resetMapView();
    explorer?.refresh(snapshot);
    writeSceneHash(snapshot);
    doc.title = `${snapshot.title} · ${formatYear(snapshot.year)} | ${atlasTitle}`;
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
  function writeSceneHash(snapshot) {
    const path = readingPath ? `?path=${encodeURIComponent(readingPath.path.id)}` : '';
    try { win.history.replaceState(null, '', `#${snapshot.id}${path}`); } catch { /* Local-file restrictions. */ }
  }
  function renderReadingProgress() {
    $('#active-reading-path').hidden = !readingPath;
    if (!readingPath) return;
    const { path, index } = readingPath;
    $('#reading-path-current').textContent = path.title;
    $('#reading-path-progress').textContent = `${index + 1} / ${path.stops.length}`;
    $('#reading-path-note').textContent = path.stops[index].note;
    $('#reading-path-previous').disabled = index === 0;
    $('#reading-path-next').disabled = index === path.stops.length - 1;
  }
  function selectReadingStop(path, index) {
    const stop = path.stops[index];
    if (!stop) return;
    const sceneIndex = SNAPSHOTS.findIndex(snapshot => snapshot.id === stop.snapshotId);
    if (sceneIndex < 0) return;
    switchTab('details');
    selectSnapshot(sceneIndex, true, { path, index });
    $('#chronicle').scrollTop = 0;
    $('#chronicle').focus();
  }
  function renderReadingPaths(path = null) {
    const grid = $('#reading-path-grid');
    const detail = $('#reading-path-detail');
    grid.hidden = Boolean(path);
    detail.hidden = !path;
    if (!path) return grid.querySelector('button');
    const back = element('button', 'reading-path-back', '← 모든 주제');
    back.addEventListener('click', () => renderReadingPaths()?.focus());
    const list = element('ol', 'reading-path-stops');
    for (const [index, stop] of path.stops.entries()) {
      const snapshot = SNAPSHOTS.find(scene => scene.id === stop.snapshotId);
      if (!snapshot) continue;
      const item = element('li');
      const button = element('button', '', snapshot.title);
      button.addEventListener('click', () => {
        closeDialog($('#reading-paths-dialog'));
        selectReadingStop(path, index);
      });
      item.append(element('time', '', formatYear(snapshot.year)), button, element('p', '', stop.note));
      if (readingPath?.path === path && readingPath.index === index) button.setAttribute('aria-current', 'step');
      list.append(item);
    }
    detail.replaceChildren(back, element('h3', '', path.title), element('p', '', path.description), list);
    return back;
  }
  function openReadingPaths(path = null) {
    const focus = renderReadingPaths(path);
    openDialog($('#reading-paths-dialog'));
    focus?.focus();
  }
  for (const path of READING_PATHS) {
    const card = element('button', 'reading-path-card');
    card.append(element('strong', '', path.title), element('span', '', path.description), element('small', '', `${path.stops.length}개 해설`));
    on(card, 'click', () => renderReadingPaths(path)?.focus());
    $('#reading-path-grid').append(card);
  }
  on($('#reading-paths-open'), 'click', () => openReadingPaths());
  on($('#reading-path-list'), 'click', () => openReadingPaths(readingPath?.path));
  on($('#reading-path-previous'), 'click', () => { if (readingPath) selectReadingStop(readingPath.path, readingPath.index - 1); });
  on($('#reading-path-next'), 'click', () => { if (readingPath) selectReadingStop(readingPath.path, readingPath.index + 1); });
  on($('#reading-path-exit'), 'click', () => {
    readingPath = null;
    renderReadingProgress();
    writeSceneHash(SNAPSHOTS[state.index]);
    $('#chronicle').focus();
  });
  for (const [eraIndex, era] of ERAS.entries()) {
    const button = element('button', 'era-button');
    button.setAttribute('data-era', era.id);
    button.style.setProperty('--era-color', era.color);
    button.append(element('span', 'era-name', era.label), element('small', 'era-range', era.range));
    on(button, 'click', () => {
      if (state.mode === 'records') {
        stop(); clearTimeout(sliderTimer);
        recordBrowser.setFilters({ fromYear: eraRanges[eraIndex][0], toYear: eraRanges[eraIndex][1] });
      } else selectSnapshot(SNAPSHOTS.findIndex(snapshot => snapshot.era === era.id));
    });
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
  on($('#previous'), 'click', () => step(-1));
  on($('#next'), 'click', () => step(1));
  on($('#play'), 'click', play);
  on($('#speed'), 'change', () => { if (state.playing) { stop(); play(); } });
  on($('#time-slider'), 'input', event => {
    if (state.mode === 'scenes') { selectSnapshot(Number(event.target.value)); return; }
    stop(); clearTimeout(sliderTimer);
    const index = Number(event.target.value);
    sliderTimer = setTimeout(() => { if (state.mode === 'records') recordBrowser.goTo(index); }, 150);
  });
  on($('#time-slider'), 'change', event => {
    if (state.mode !== 'records') return;
    stop(); clearTimeout(sliderTimer);
    recordBrowser.goTo(Number(event.target.value));
  });
  on($('#year-form'), 'submit', async event => {
    event.preventDefault();
    const year = Number($('#year-input').value);
    if (!Number.isInteger(year) || year === 0) { toast('역사 연도에는 0년이 없습니다. 기원전은 음수로 입력하세요.'); return; }
    if (state.mode === 'records') {
      stop(); clearTimeout(sliderTimer);
      const result = await recordBrowser.seekYear(year);
      if (destroyed || state.mode !== 'records') return;
      if (result.record && result.record.year !== year) toast(`${formatYear(year)}에 가장 가까운 수록 연도인 ${formatYear(result.record.year)}의 첫 기록을 표시합니다.`);
      return;
    }
    if (year < first || year > last) { toast(`${formatYear(first)}부터 ${formatYear(last)}까지 입력하세요.`); return; }
    const snapshot = getSnapshotForYear(SNAPSHOTS, year);
    selectSnapshot(SNAPSHOTS.indexOf(snapshot));
    if (snapshot.year !== year) toast(`${formatYear(year)}에 앞서는 대표 시점인 ${formatYear(snapshot.year)}의 기록을 표시합니다.`);
  });
  for (const name of ['capitals', 'events', 'routes']) on($(`#${name}-toggle`), 'change', () => {
    if (state.mode !== 'scenes') return;
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
    onOpenPlace: showPlaceOnMap,
    onOpenRecord: (record, filters) => openRecords(record.id, filters),
  });
  recordView = createMainRecordView({ document: doc, target: $('#record-content'), onOpenArchive: (record, filters) => { stop(); explorer.openRecord(record.id, filters); }, onRetry: () => recordBrowser.init() });
  recordBrowser = createRecordBrowser({ corpus, onChange: renderRecordState });
  $('#scene-mode-count').textContent = `${SNAPSHOTS.length}개`;
  on($('#browse-records'), 'click', () => openRecords());
  on($('#browse-scenes'), 'click', () => selectSnapshot(state.index));
  on($('#record-scenes-open'), 'click', () => {
    const year = recordBrowser.state.record?.year;
    if (!Number.isInteger(year)) { selectSnapshot(state.index); return; }
    const snapshot = getSnapshotForYear(SNAPSHOTS, year);
    selectSnapshot(SNAPSHOTS.indexOf(snapshot));
    if (snapshot.year !== year) toast(`${formatYear(year)}의 개별 기록에서 ${formatYear(snapshot.year)}의 대표 지도 해설로 이동했습니다.`);
  });
  on($('#main-record-filters'), 'submit', event => {
    event.preventDefault();
    const fromYear = $('#record-from').value.trim() === '' ? null : Number($('#record-from').value);
    const toYear = $('#record-to').value.trim() === '' ? null : Number($('#record-to').value);
    if ([fromYear, toYear].some(year => year !== null && (!Number.isInteger(year) || year === 0))) { toast('연도는 0이 아닌 정수로 입력하세요. 기원전은 음수입니다.'); return; }
    if (fromYear !== null && toYear !== null && fromYear > toYear) { toast('시작 연도는 마지막 연도보다 늦을 수 없습니다.'); return; }
    stop(); clearTimeout(sliderTimer);
    recordBrowser.setFilters({ q: $('#record-query').value, collection: $('#record-collection').value, fromYear, toYear, sort: $('#record-sort').value });
  });
  on($('#record-reset'), 'click', () => { stop(); clearTimeout(sliderTimer); recordBrowser.setFilters({ q: '', collection: 'all', fromYear: null, toYear: null, sort: 'asc' }); });
  on($('#record-position-form'), 'submit', event => {
    event.preventDefault();
    const index = Number($('#record-position').value) - 1;
    if (!Number.isInteger(index) || index < 0 || index >= recordBrowser.state.total) { toast(`1부터 ${countLabel(recordBrowser.state.total)}까지 기록 번호를 입력하세요.`); return; }
    stop(); clearTimeout(sliderTimer); recordBrowser.goTo(index);
  });
  $('#atlas-statistics').textContent = `지도 해설 ${SNAPSHOTS.length}개 · 사건 항목 ${SNAPSHOTS.reduce((total, snapshot) => total + snapshot.events.length, 0)}개 · 인물 ${figures.length}명`;
  corpus.getManifest().then(manifest => {
    if (destroyed) return;
    updateRecordManifest(manifest);
  }).catch(() => { /* The corpus tab supplies retry and error feedback; map scenes remain available. */ });
  on($('#corpus-open'), 'click', () => openExplorer('records'));
  on($('#scene-corpus-open'), 'click', () => openRecords());
  on($('#search-corpus-open'), 'click', () => {
    const query = $('#search-input').value;
    closeDialog($('#search-dialog'));
    stop();
    explorer.searchRecords(query);
  });
  on($('#explore-open'), 'click', () => openExplorer());
  on($('#places-map-open'), 'click', () => openPlaceMap());
  on($('#compare-open'), 'click', () => {
    const newer = Math.max(1, state.index);
    openComparison(SNAPSHOTS[newer - 1].id, SNAPSHOTS[newer].id);
  });
  on($('#scene-timeline-open'), 'click', () => openExplorer('timeline'));
  on($('#scene-polities-open'), 'click', () => openExplorer('polities'));
  on($('#route-clear'), 'click', () => clearFigureRoute());
  on($('#route-details'), 'click', () => { if (state.selectedFigure) openExplorer('figures', state.selectedFigure); });
  on($('#search-open'), 'click', () => { openDialog($('#search-dialog')); $('#search-input').focus(); });
  for (const id of ['sources-open', 'method-open']) on($(`#${id}`), 'click', () => openDialog($('#sources-dialog')));
  doc.querySelectorAll('#search-dialog [data-close], #sources-dialog [data-close], #reading-paths-dialog [data-close]').forEach(button => on(button, 'click', () => closeDialog(button.closest('dialog'))));
  doc.querySelectorAll('#search-dialog, #sources-dialog, #reading-paths-dialog').forEach(dialog => {
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
          if (result.place) showPlaceOnMap(result.place);
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
    try { await win.navigator.clipboard.writeText(win.location.href); toast('현재 기록의 링크를 복사했습니다.'); }
    catch { toast(`주소창의 링크를 복사해 주세요. 현재 기록: ${win.location.hash}`); }
  });
  on($('#zoom-in'), 'click', () => zoomTo(state.zoom * 1.25));
  on($('#zoom-out'), 'click', () => zoomTo(state.zoom / 1.25));
  function returnToPeninsula() {
    closePopup();
    resetMapView();
  }
  on($('#map-reset'), 'click', returnToPeninsula);
  on($('#return-to-peninsula'), 'click', () => { returnToPeninsula(); $('#map-reset').focus(); });
  on($('.brand'), 'click', event => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    selectSnapshot(homeSceneIndex);
  });
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
    if (event.target.closest?.('input, select, textarea, button, summary, a, [role="button"], [contenteditable]') || event.ctrlKey || event.metaKey || event.altKey) return;
    if (doc.querySelector('dialog[open]')) return;
    if (event.key === 'ArrowLeft') { event.preventDefault(); step(-1); }
    if (event.key === 'ArrowRight') { event.preventDefault(); step(1); }
    if (event.key === ' ') { event.preventDefault(); play(); }
    if (event.key === '/') { event.preventDefault(); openDialog($('#search-dialog')); $('#search-input').focus(); }
    if (event.key === 'Escape') closePopup();
  });
  on(doc, 'visibilitychange', () => { if (doc.hidden) stop(); });
  function readHash() {
    const [id, query = ''] = win.location.hash.replace(/^#/, '').split('?');
    const params = new URLSearchParams(query);
    if (id === 'places') return { tool: 'places', city: params.get('city') };
    if (id === 'compare') return { tool: 'compare', left: params.get('left'), right: params.get('right') };
    if (id === 'records') return { records: true, id: params.get('record'), filters: { q: params.get('q') || '', collection: params.get('collection') || 'all', fromYear: params.get('from'), toYear: params.get('to'), sort: params.get('sort') || 'asc' } };
    if (!id) return { index: homeSceneIndex };
    const path = readingPathById.get(params.get('path'));
    const stopIndex = path?.stops.findIndex(stop => stop.snapshotId === id) ?? -1;
    return {
      index: SNAPSHOTS.findIndex(snapshot => snapshot.id === id),
      figure: figureById.get(params.get('figure')),
      pathContext: stopIndex >= 0 ? { path, index: stopIndex } : null,
    };
  }
  function restoreMapTool(hash) {
    if (!hash.tool) return false;
    const link = win.location.hash;
    selectSnapshot(state.index);
    try { win.history.replaceState(null, '', link); } catch { /* Local-file restrictions. */ }
    if (hash.tool === 'places') openPlaceMap(hash.city);
    else openComparison(hash.left, hash.right);
    return true;
  }
  on(win, 'hashchange', () => {
    const hash = readHash();
    if (restoreMapTool(hash)) return;
    placeMapView.close();
    compareView.close();
    if (hash.records) { openRecords(hash.id, hash.filters); return; }
    if (hash.index >= 0) selectSnapshot(hash.index, true, hash.pathContext);
    if (hash.figure) showFigureRoute(hash.figure);
  });
  const initialHash = readHash();
  const hashIndex = initialHash.index;
  const restoredTool = restoreMapTool(initialHash);
  if (initialHash.records) openRecords(initialHash.id, initialHash.filters);
  else if (!restoredTool) {
    selectSnapshot(hashIndex >= 0 ? hashIndex : state.index, true, initialHash.pathContext);
    if (initialHash.figure) showFigureRoute(initialHash.figure);
  }
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
      landLayer.append(svgElement('path', { class: 'land', d, 'fill-rule': 'evenodd' }));
    }
    placeMapView.refreshMap();
    compareView.refreshMap();
    $('#map-load-status').hidden = true;
  } catch {
    $('#map-load-status').hidden = false;
    $('#map-load-status').textContent = '해안선 지도를 불러오지 못했습니다. 시대 선택·사건·출처는 계속 이용할 수 있습니다.';
  }
  return { selectSnapshot, stop, explorer, recordBrowser, get state() { return { ...state }; }, destroy() { destroyed = true; stop(); explorer.destroy(); placeMapView.destroy(); compareView.destroy(); recordBrowser.dispose(); recordView.destroy(); distributionView.destroy(); if (!corpusStore) corpus.dispose(); clearTimeout(toastTimer); clearTimeout(sliderTimer); listeners.forEach(remove => remove()); } };
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  initAtlas({ document, window, fetch: window.fetch.bind(window) }).catch(() => {
    const status = document.querySelector('#map-load-status');
    status.hidden = false;
    status.textContent = '지도를 시작하지 못했습니다. 페이지를 새로고침해 주세요.';
  });
}
