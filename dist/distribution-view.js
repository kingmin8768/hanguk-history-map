import { formatYear } from './model.js';

function yearRange(from, to) {
  if (from === to) return formatYear(from);
  if (from > 0) return `${from}~${to}년`;
  if (to < 0) return `기원전 ${-from}~${-to}년`;
  return `${formatYear(from)}~${formatYear(to)}`;
}

export function groupRecordYears(years, eras) {
  if (!years.length) return [];
  const first = years[0].year;
  const last = years.at(-1).year;
  const span = last - first;
  const byEra = eras.flatMap(({ label, from, to }) => {
    const group = years.filter(({ year }) => (from === null || year >= from) && (to === null || year <= to));
    if (!group.length) return [];
    return [{ label, from: group[0].year, to: group.at(-1).year, count: group.reduce((sum, row) => sum + row.count, 0) }];
  });
  if (span > 160 && byEra.length > 1) return byEra;

  const width = [1, 5, 10, 20, 50, 100, 200, 500, 1000].find(size => size * 16 > span) ?? Math.ceil((span + 1) / 16);
  const groups = new Map();
  for (const { year, count } of years) {
    const key = Math.floor(year / width);
    const current = groups.get(key);
    if (current) {
      current.to = year;
      current.count += count;
    } else groups.set(key, { from: year, to: year, count });
  }
  return [...groups.values()].map(group => ({ ...group, label: yearRange(group.from, group.to) }));
}

export function createDistributionView({ panel, corpus, eras, onSelectRange }) {
  const doc = panel.ownerDocument;
  const caption = panel.querySelector('#distribution-caption');
  const chart = panel.querySelector('#distribution-chart');
  const reset = panel.querySelector('#distribution-reset');
  const retry = panel.querySelector('#distribution-retry');
  const summary = panel.querySelector('summary');
  let filters;
  let requestedKey;
  let generation = 0;
  const countLabel = value => Number(value).toLocaleString('ko-KR');

  function render({ total, years, undated }) {
    const groups = groupRecordYears(years, eras);
    const largest = Math.max(1, ...groups.map(group => group.count));
    chart.replaceChildren(...groups.map(({ label, count, from, to }) => {
      const button = doc.createElement('button');
      button.type = 'button';
      button.className = 'distribution-bar';
      button.dataset.from = String(from);
      button.dataset.to = String(to);
      button.setAttribute('aria-label', `${label}, ${yearRange(from, to)}, 기록 ${countLabel(count)}건. 이 연도 범위로 좁히기`);
      const track = doc.createElement('span');
      track.className = 'distribution-bar-track';
      track.setAttribute('aria-hidden', 'true');
      const fill = doc.createElement('span');
      fill.className = 'distribution-bar-fill';
      fill.style.setProperty('--bar-height', `${count / largest * 100}%`);
      track.append(fill);
      const name = doc.createElement('span');
      name.className = 'distribution-bar-label';
      name.textContent = label;
      const amount = doc.createElement('span');
      amount.className = 'distribution-bar-count';
      amount.textContent = countLabel(count);
      button.append(track, name, amount);
      return button;
    }));
    const count = `현재 조건 ${countLabel(total)}건`;
    const missing = undated ? ` · 연도 미상 ${countLabel(undated)}건` : '';
    caption.textContent = !total ? '현재 조건에 맞는 기록이 없습니다.' : `${count}${missing}${groups.length ? ' · 막대를 눌러 연도 범위를 좁힙니다.' : ' · 연도가 있는 기록이 없습니다.'}`;
  }

  async function refresh() {
    if (panel.hidden || !panel.hasAttribute('open') || !filters) return;
    const { q, collection, fromYear, toYear } = filters;
    const filter = { q, collection, fromYear, toYear };
    const key = JSON.stringify(filter);
    if (key === requestedKey) return;
    requestedKey = key;
    const version = ++generation;
    reset.hidden = fromYear === null && toYear === null;
    retry.hidden = true;
    chart.replaceChildren();
    chart.setAttribute('aria-busy', 'true');
    caption.textContent = '기록 분포를 불러오는 중입니다…';
    try {
      const result = await corpus.distribution(filter);
      if (version === generation) render(result);
    } catch {
      if (version !== generation) return;
      caption.textContent = '기록 분포를 불러오지 못했습니다.';
      retry.hidden = false;
    } finally {
      if (version === generation) chart.removeAttribute('aria-busy');
    }
  }
  function choose(event) {
    const bar = event.target.closest('.distribution-bar');
    if (!bar) return;
    summary.focus();
    onSelectRange(Number(bar.dataset.from), Number(bar.dataset.to));
  }
  function clearRange() {
    summary.focus();
    onSelectRange(null, null);
  }
  function retryDistribution() {
    requestedKey = undefined;
    summary.focus();
    refresh();
  }
  function setVisible(visible) {
    panel.hidden = !visible;
    if (!visible) panel.removeAttribute('open');
  }

  panel.addEventListener('toggle', refresh);
  chart.addEventListener('click', choose);
  reset.addEventListener('click', clearRange);
  retry.addEventListener('click', retryDistribution);
  return {
    setVisible,
    update(nextFilters) { filters = nextFilters; refresh(); },
    destroy() {
      generation += 1;
      panel.removeEventListener('toggle', refresh);
      chart.removeEventListener('click', choose);
      reset.removeEventListener('click', clearRange);
      retry.removeEventListener('click', retryDistribution);
    }
  };
}
