import { project, formatYear } from './model.js';
import { SOURCES } from './data.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const ROLE_LABELS = { capital: '수도', event: '사건', site: '유적·거점' };
const LAND_ATTRIBUTES = ['d', 'class', 'fill-rule', 'clip-rule'];

export function createCompareView({ document: doc, snapshots = [], landLayer, onSelectScene = () => {}, onShare = () => {} } = {}) {
  const scenes = snapshots.filter(scene => scene && typeof scene.id === 'string' && Number.isInteger(scene.year) && scene.year !== 0).slice().sort((a, b) => a.year - b.year);
  const byId = new Map(scenes.map(scene => [scene.id, scene]));
  const sources = new Map(SOURCES.map(source => [source.id, source]));
  const presets = [
    { id: 'capital-transition', label: '조선 건국과 한양 천도', years: [1392, 1394] },
    { id: 'independence-liberation', label: '임시정부와 해방', years: [1919, 1945] },
    { id: 'government-formation', label: '해방과 정부 수립', years: [1945, 1948] }
  ].map(preset => ({ ...preset, pair: preset.years.map(year => scenes.find(scene => scene.year === year)) })).filter(preset => preset.pair.every(Boolean));
  const defaults = presets.find(preset => preset.id === 'capital-transition')?.pair || [scenes[0], scenes.at(-1)];
  const selected = { left: defaults[0]?.id, right: defaults[1]?.id };
  const listeners = [];
  let destroyed = false;
  let opened = false;
  let nativeModal = false;
  let opener = null;

  function element(tag, className, text) {
    const node = doc.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function svgElement(tag, attributes = {}, text) {
    const node = doc.createElementNS(SVG_NS, tag);
    for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function listen(target, type, action) { target.addEventListener(type, action); listeners.push(() => target.removeEventListener(type, action)); }
  function button(text, className, action) {
    const node = element('button', className, text); node.type = 'button';
    node.addEventListener('click', () => { if (!destroyed) action(); });
    return node;
  }
  const dialog = element('dialog', 'map-tool-dialog'); dialog.id = 'compare-dialog'; dialog.hidden = true;
  dialog.setAttribute('role', 'dialog'); dialog.setAttribute('aria-modal', 'true'); dialog.setAttribute('aria-labelledby', 'compare-title'); dialog.setAttribute('aria-describedby', 'compare-description');
  const header = element('header', 'map-tool-header');
  const title = element('h2', '', '두 시대 나란히 보기'); title.id = 'compare-title';
  const closeButton = button('×', 'map-tool-close', close); closeButton.setAttribute('aria-label', '시대 비교 닫기'); header.append(title, closeButton);
  const controls = element('div', 'compare-controls');
  const selects = new Map();
  for (const [side, label] of [['left', '왼쪽 장면'], ['right', '오른쪽 장면']]) {
    const wrapper = element('label', '', label); const select = element('select'); select.dataset.compareSide = side; select.setAttribute('aria-label', label);
    for (const scene of scenes) { const option = element('option', '', `${formatYear(scene.year)} · ${scene.title}`); option.value = scene.id; select.append(option); }
    select.disabled = !scenes.length;
    listen(select, 'change', () => { if (byId.has(select.value)) { selected[side] = select.value; renderPanels(); } });
    wrapper.append(select); controls.append(wrapper); selects.set(side, select);
  }
  const presetControls = element('div', 'compare-presets'); presetControls.setAttribute('role', 'group'); presetControls.setAttribute('aria-label', '추천 시대 비교');
  for (const preset of presets) {
    const control = button(`${preset.label} · ${preset.years.join(' ↔ ')}`, '', () => { selected.left = preset.pair[0].id; selected.right = preset.pair[1].id; syncSelects(); renderPanels(); });
    control.dataset.preset = preset.id; presetControls.append(control);
  }
  const description = element('p', 'compare-caption', '두 지도는 같은 범위와 축척으로 표시합니다. 점은 출처에 근거한 수도·사건·유적의 개략 위치이며 영토나 지배 범위를 뜻하지 않습니다.'); description.id = 'compare-description';
  const grid = element('div', 'compare-grid');
  const panels = new Map();
  for (const [side, label] of [['left', '왼쪽'], ['right', '오른쪽']]) {
    const panel = element('section', 'compare-panel'); panel.dataset.side = side; panel.setAttribute('aria-label', `${label} 시대 지도와 장소`); panels.set(side, panel); grid.append(panel);
  }
  const footer = element('footer', 'map-tool-footer');
  const share = button('이 비교 공유하기', '', () => { if (selected.left && selected.right) onShare(selected.left, selected.right); }); share.dataset.action = 'share-compare'; share.disabled = !scenes.length;
  footer.append(share);
  dialog.append(header, controls, presetControls, description, grid, footer); doc.body.append(dialog);
  listen(dialog, 'cancel', event => { event.preventDefault(); close(); });
  listen(dialog, 'close', () => { if (!dialog.hasAttribute('open')) finishClose(); });
  listen(dialog, 'keydown', event => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); }
    if (event.key === 'Tab' && !nativeModal) {
      const focusable = [...dialog.querySelectorAll('button, select, a[href], [tabindex="0"]')].filter(node => !node.disabled && !node.hidden && !node.closest('[hidden]'));
      const first = focusable[0]; const last = focusable.at(-1);
      if (event.shiftKey && doc.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && doc.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
  });

  function syncSelects() {
    for (const [side, select] of selects) {
      for (const option of select.options) { option.selected = false; option.removeAttribute('selected'); }
      const option = [...select.options].find(option => option.value === selected[side]);
      if (option) option.selected = true;
    }
  }
  function pointFor(place) {
    if (!Array.isArray(place.coord) || place.coord.length !== 2 || !place.coord.every(Number.isFinite) || Math.abs(place.coord[0]) > 180 || Math.abs(place.coord[1]) >= 90) return null;
    const point = project(place.coord);
    return point.every(Number.isFinite) ? point : null;
  }
  function inView(point) { return point && point[0] >= 0 && point[0] <= 1000 && point[1] >= 0 && point[1] <= 900; }
  function openScene(scene) { if (destroyed) return; close(); onSelectScene(scene); }
  function sourceLinks(ids, target) {
    const links = element('div', 'compare-source-links');
    for (const id of new Set(ids || [])) {
      const source = sources.get(id); if (!source) continue;
      let url; try { url = new URL(source.url); } catch { continue; }
      if (url.protocol !== 'https:' || url.username || url.password) continue;
      const link = element('a', 'source-link', `${source.title} ↗`); link.href = url.href; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.title = `${source.publisher} · ${source.title}`; links.append(link);
    }
    if (links.childElementCount) target.append(links);
  }
  function cloneLand(map) {
    const group = svgElement('g', { class: 'compare-land-layer', 'aria-hidden': 'true' });
    for (const original of landLayer?.querySelectorAll('path') || []) {
      const path = svgElement('path');
      for (const attribute of LAND_ATTRIBUTES) if (original.hasAttribute(attribute)) path.setAttribute(attribute, original.getAttribute(attribute));
      if (!path.hasAttribute('class')) path.setAttribute('class', 'land');
      group.append(path);
    }
    map.append(group); return group.childElementCount;
  }
  function renderMarker(place, scene, point, map) {
    const kind = ROLE_LABELS[place.kind] || '장소';
    const marker = svgElement('g', { class: 'compare-place-marker', 'data-place-id': place.id, transform: `translate(${point[0]} ${point[1]})`, role: 'button', tabindex: '0', 'aria-label': `${place.name}, ${place.polity || ''}, ${kind}. ${formatYear(scene.year)} 장면 열기` });
    const color = /^#(?:[\da-f]{3}|[\da-f]{6}|[\da-f]{8})$/i.test(place.color || scene.color || '') ? place.color || scene.color : '#537c86';
    marker.style.setProperty('--marker-color', color);
    marker.append(svgElement('circle', { r: 15, fill: color, opacity: '.18' }));
    if (place.kind === 'capital') marker.append(svgElement('path', { d: 'M0 -9L9 0L0 9L-9 0Z', fill: color, stroke: '#fff', 'stroke-width': 2 }));
    else marker.append(svgElement('circle', { r: 7, fill: color, stroke: '#fff', 'stroke-width': 2 }));
    const text = svgElement('text', { x: 17, y: -9, 'font-size': 20 }, place.name); marker.append(text, svgElement('title', {}, `${place.name} · ${kind} · ${place.polity || ''}`));
    marker.addEventListener('click', () => openScene(scene));
    marker.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); openScene(scene); } });
    map.append(marker);
  }
  function renderPanel(side) {
    const panel = panels.get(side); panel.replaceChildren();
    const scene = byId.get(selected[side]);
    if (!scene) { const empty = element('p', 'compare-empty', '비교할 지도 해설 장면이 없습니다.'); empty.setAttribute('role', 'status'); panel.append(empty); return; }
    const heading = element('h3', '', `${formatYear(scene.year)} · ${scene.title}`); heading.id = `compare-${side}-heading`;
    const map = svgElement('svg', { class: 'compare-map', viewBox: '0 0 1000 900', preserveAspectRatio: 'xMidYMid meet', role: 'group', 'aria-labelledby': heading.id });
    const landCount = cloneLand(map);
    for (const place of scene.places || []) { const point = pointFor(place); if (inView(point)) renderMarker(place, scene, point, map); }
    const caption = element('p', 'compare-caption', [scene.summary, scene.note, '현재의 지형을 공통 바탕으로 사용합니다. 점의 역할과 위치 불확실성은 각 장소의 원래 설명을 따릅니다.', !landCount ? '바탕 지도가 아직 준비되지 않았습니다. 장소 목록은 계속 읽을 수 있습니다.' : ''].filter(Boolean).join(' '));
    panel.append(heading, map, caption); sourceLinks(scene.sourceIds, panel);
    const list = element('ul', 'compare-place-list');
    for (const place of scene.places || []) {
      const row = element('li'); row.dataset.placeId = place.id;
      row.append(element('h4', 'compare-place-heading', place.name), element('p', 'compare-place-role', [place.polity, ROLE_LABELS[place.kind] || '장소', place.modernName].filter(Boolean).join(' · ')));
      const point = pointFor(place);
      if (!point) row.append(element('p', 'compare-place-note', '좌표를 확인할 수 없어 지도점은 생략했습니다.'));
      else if (!inView(point)) row.append(element('p', 'compare-place-note', '고정 지도 범위 밖의 장소입니다. 점을 다른 위치로 옮겨 표시하지 않습니다.'));
      if (place.note) row.append(element('p', 'compare-place-note', place.note));
      sourceLinks(place.sourceIds, row);
      const action = button('장면 열기', '', () => openScene(scene)); action.setAttribute('aria-label', `${place.name} · ${formatYear(scene.year)} 장면 열기`); row.append(action); list.append(row);
    }
    panel.append(list);
    const actions = element('div', 'compare-actions'); actions.append(button('이 장면 열기', '', () => openScene(scene))); panel.append(actions);
  }
  function renderPanels() { if (!destroyed) for (const side of ['left', 'right']) renderPanel(side); }
  function finishClose() {
    if (!opened) return;
    opened = false; dialog.removeAttribute('open'); dialog.hidden = true;
    if (opener?.isConnected) opener.focus?.(); opener = null;
  }
  function close() {
    if (!opened) return;
    if (typeof dialog.close === 'function') { try { dialog.close(); } catch { /* Partial dialog implementations use the attribute fallback. */ } }
    finishClose();
  }
  function open(leftId, rightId) {
    if (destroyed) return;
    if (!opened) opener = doc.activeElement;
    selected.left = byId.has(leftId) ? leftId : defaults[0]?.id;
    selected.right = byId.has(rightId) ? rightId : defaults[1]?.id;
    syncSelects(); renderPanels();
    opened = true; dialog.hidden = false;
    if (!dialog.hasAttribute('open')) {
      nativeModal = false;
      if (typeof dialog.showModal === 'function') { try { dialog.showModal(); nativeModal = true; } catch { /* LinkeDOM and older browsers use the modal attribute fallback. */ } }
      if (!dialog.hasAttribute('open')) dialog.setAttribute('open', '');
    }
    (scenes.length ? selects.get('left') : closeButton).focus(); grid.scrollTop = 0;
  }
  function refreshMap() { if (opened && !destroyed) renderPanels(); }
  function destroy() { if (destroyed) return; close(); destroyed = true; for (const remove of listeners) remove(); dialog.remove(); }
  return { open, close, refreshMap, destroy };
}
