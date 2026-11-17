const DEFAULT_DATASET = {
  title: '한국역사자료 메타데이터 정보 연표', provider: '국사편찬위원회',
  landingUrl: 'https://www.data.go.kr/data/15051036/fileData.do',
  license: { name: '공공누리 제1유형', url: 'https://www.kogl.or.kr/info/licenseType1.do' }
};
const PRECISION_LABELS = { day: '일 단위', month: '월 단위 (일 미상)', year: '연도 단위 (월·일 미상)', unknown: '미상' };

/** Shared presentation rules keep the archive and main reader's source claims identical. */
export function createRecordPresentation(document) {
  function element(tag, className, content) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (content !== undefined) node.textContent = content;
    return node;
  }
  function link(label, value, hosts, prefix = '/') {
    let url;
    try { url = new URL(value); } catch { return null; }
    if (url.protocol !== 'https:' || url.username || url.password || url.port || !hosts.includes(url.hostname) || !url.pathname.startsWith(prefix)) return null;
    const node = element('a', 'source-link', `${label} ↗`);
    node.href = url.href; node.target = '_blank'; node.rel = 'noopener noreferrer';
    return node;
  }
  function dateNote(record) {
    const notes = [record.calendar === 'lunar' ? '음력' : '역법 미표기'];
    if (/(?:^|[-./\s])99(?=$|[-./\s])|99[월일]/.test(String(record.originalDate || ''))) notes.push('원문 날짜의 99는 월·일 미상 표기입니다. 실제 월일로 읽지 않습니다.');
    else if (record.precision === 'year') notes.push('월·일 미상');
    else if (record.precision === 'month') notes.push('일 미상');
    else if (record.precision === 'unknown') notes.push('날짜 정밀도 미상');
    const numericMonth = String(record.originalDate || '').match(/^-?\d{1,6}-(\d{1,2})(?:-|$)/)?.[1];
    if (numericMonth !== undefined && Number(numericMonth) !== 99 && (Number(numericMonth) < 1 || Number(numericMonth) > 12)) notes.push('원자료에 일반적인 월 범위를 벗어난 표기가 있어, 월일을 확정 날짜로 해석하지 않고 연도만 연대 검색에 사용합니다.');
    if (record.year === -2333) notes.push('원자료에서 기원전 2333년으로 분류된 전승·관련 기록이며 그해 발생한 확정 사건이라는 의미가 아닙니다.');
    return notes.join(' · ');
  }
  function appendCurrentSource(record, target, showRecordId = false) {
    const collection = record.sourceLinkType === 'collection';
    let allowedCollection = false;
    if (collection) {
      try {
        const url = new URL(record.sourceUrl);
        allowedCollection = !url.hash && ((url.pathname === '/diachronic/level.do' && url.search === '?itemId=tcmd') || (url.pathname === '/id/tcmd' && !url.search));
      } catch { /* A collection exception only accepts the known official roots. */ }
    }
    const current = collection
      ? allowedCollection && link('공식 자료군에서 원문 찾기', record.sourceUrl, ['db.history.go.kr'])
      : link('공식 원문 현재 링크', record.sourceUrl, ['db.history.go.kr'], '/id/');
    if (current) target.append(current);
    else target.append(element('p', '', '현재 원문의 안전한 공식 링크를 확인할 수 없습니다.'));
    if (collection) {
      target.append(element('p', 'corpus-link-note', '서비스 개편으로 이 기록의 개별 기사 주소를 확인할 수 없어 해당 자료군에 연결합니다. 제공기관 기록 ID로 찾아보세요.'));
      if (showRecordId && record.sourceRecordId) target.append(element('p', 'catalogue-meta', `제공기관 기록 ID: ${record.sourceRecordId}`));
    }
  }
  function appendMetadata(record, target) {
    if (!record.originalMetadataUrl) return;
    const metadata = element('details', 'corpus-metadata');
    metadata.append(element('summary', '', '기존 메타데이터 연계주소 (보존)'), element('p', '', '이전 서비스의 연계주소를 보존한 정보입니다. 현재 열리지 않을 수 있으므로 위의 공식 자료 연결을 이용하세요.'));
    const original = link('보존된 기존 연계주소', record.originalMetadataUrl, ['db.history.go.kr']);
    if (original) metadata.append(original);
    metadata.append(element('p', 'corpus-metadata-path', record.originalMetadataUrl));
    target.append(metadata);
  }
  function appendProvenance(manifest, target, { sceneCount = null, showPageSize = false } = {}) {
    const dataset = manifest?.dataset || DEFAULT_DATASET;
    const box = element('aside', 'corpus-provenance'); box.setAttribute('aria-label', '자료 제공과 이용 조건');
    box.append(element('p', '', `${dataset.provider || '국사편찬위원회'} · ${dataset.title || '공식 자료 연표'}`));
    box.append(element('p', '', '제공기관의 메타데이터와 초록을 수록했습니다. 이 자료 목록은 새로 작성한 해설이 아닙니다. 짧거나 잘린 제공 제목도 원문 그대로 표시합니다.'));
    box.append(element('p', '', '날짜는 원자료의 연대 표기입니다. 자료에는 분류 연대와 전승·관련 기록이 섞여 있어, 표시된 연도가 사건의 확정 발생 연도라는 뜻은 아닙니다.'));
    box.append(element('p', '', '동일 원문을 가리키는 여러 기록이나 같은 해의 별도 기록이 포함될 수 있습니다. 자료 건수는 독립적인 사건 수와 같지 않습니다.'));
    box.append(element('p', '', '공식 링크는 자료 서비스 개편으로 달라질 수 있으며, 모든 개별 기록의 현재 본문 연결을 대조한 것은 아닙니다. 개별 주소를 확인할 수 없는 기록은 해당 자료군에 연결합니다.'));
    const license = dataset.license || {};
    box.append(element('p', '', [license.name || '공공누리 제1유형', license.attribution].filter(Boolean).join(' · ')));
    const landing = link('공공데이터 원본·이용 조건', dataset.landingUrl, ['www.data.go.kr', 'data.go.kr', 'www.history.go.kr', 'history.go.kr', 'db.history.go.kr']);
    const licenseLink = link('공공누리 제1유형 안내', license.url, ['www.kogl.or.kr', 'kogl.or.kr']);
    if (landing) box.append(landing);
    if (licenseLink) box.append(licenseLink);
    const recordCount = manifest?.recordCount ?? manifest?.counts?.records ?? manifest?.counts?.recordCount;
    if (Number.isFinite(recordCount)) {
      const count = `공식 자료 기록 ${recordCount.toLocaleString('ko-KR')}건`;
      const scenes = Number.isFinite(sceneCount) ? ` · 직접 작성한 지도 해설 ${sceneCount}개와 별도 자료입니다.` : '';
      box.append(element('p', 'catalogue-meta', `${count}${scenes}${showPageSize ? ' 페이지당 최대 50건 표시' : ''}`));
    }
    target.append(box);
  }
  function appendFailure(target, error, message, onRetry) {
    const block = element('div', 'corpus-error'); block.setAttribute('role', 'alert');
    if (['CORPUS_WORKER_UNSUPPORTED', 'CORPUS_DECOMPRESSION_UNSUPPORTED'].includes(error?.code)) {
      block.append(element('p', '', '현재 브라우저에서는 자료 검색을 지원하지 않습니다. 최신 브라우저에서 다시 열거나 공식 원문 사이트를 이용해 주세요.'));
      const source = link('국사편찬위원회 한국사데이터베이스', 'https://db.history.go.kr/', ['db.history.go.kr']);
      if (source) block.append(source);
    } else {
      block.append(element('p', '', message));
      if (typeof onRetry === 'function') { const retry = element('button', '', '다시 시도'); retry.type = 'button'; retry.addEventListener('click', onRetry); block.append(retry); }
    }
    target.append(block); return block;
  }
  return { element, link, dateNote, appendCurrentSource, appendMetadata, appendProvenance, appendFailure };
}

export function createMainRecordView({ document, target, onOpenArchive, onRetry } = {}) {
  const presentation = createRecordPresentation(document);
  const { element } = presentation;
  let destroyed = false;
  function section(title) { const node = element('section', 'record-detail-section'); node.append(element('h3', '', title)); return node; }
  function render(state = {}) {
    if (destroyed) return;
    target.replaceChildren(); target.removeAttribute('aria-busy');
    if (state.status === 'loading' || state.status === 'idle' || !state.status) {
      target.setAttribute('aria-busy', 'true');
      const loading = element('p', 'corpus-loading', '전체 기록을 준비하고 있습니다. 첫 조회에는 시간이 걸릴 수 있으며 지도 해설 모드는 계속 이용할 수 있습니다.'); loading.setAttribute('role', 'status');
      target.append(loading); presentation.appendProvenance(state.manifest, target); return;
    }
    if (state.status === 'error') {
      presentation.appendFailure(target, state.error, '자료를 불러오지 못했습니다. 연결을 확인한 뒤 다시 시도해 주세요.', typeof onRetry === 'function' ? () => { if (!destroyed) onRetry(); } : undefined);
      presentation.appendProvenance(state.manifest, target); return;
    }
    const record = state.record;
    if (!record) {
      const empty = element('p', 'explorer-empty', '현재 조건에 맞는 기록이 없습니다. 검색어·자료군·연도 범위를 바꾸거나 자료 연표에서 찾아보세요.'); empty.setAttribute('role', 'status');
      target.append(empty); presentation.appendProvenance(state.manifest, target); return;
    }
    const article = element('article', 'main-record-detail');
    if (Number.isInteger(state.index) && Number.isFinite(state.total) && state.total > 0) article.append(element('p', 'record-position', `현재 검색 조건에서 ${(state.index + 1).toLocaleString('ko-KR')} / ${state.total.toLocaleString('ko-KR')}번째 자료`));
    const body = section('제공된 초록·본문');
    body.append(element('p', 'corpus-body', record.body || '제공된 초록·본문이 없습니다.'), element('p', 'record-context-note', '제공기관이 공개한 원문 메타데이터와 초록입니다. 새로 작성한 해설이 아니며, 원래 문장과 문헌 표기를 그대로 표시합니다.'));
    article.append(body);
    const date = section('원자료의 연대 표기와 자료 구분');
    date.append(element('p', 'corpus-original-date', `원자료의 연대 표기: ${record.originalDate || '표기 없음'}`), element('p', 'corpus-date-note', presentation.dateNote(record)));
    const metadata = element('dl', 'record-metadata');
    const collection = state.manifest?.collections?.find(item => item.id === record.collectionId)?.label || record.collectionId || '자료 구분 미상';
    for (const [label, value] of [['자료 구분', collection], ['제공기관 기록 ID', record.sourceRecordId || '표기 없음'], ['역법', record.calendar === 'lunar' ? '음력' : '역법 미표기'], ['정밀도', PRECISION_LABELS[record.precision] || '미상']]) metadata.append(element('dt', '', label), element('dd', '', value));
    date.append(metadata, element('p', 'record-context-note', '확인된 좌표가 없어 이 기록의 위치점을 지도에 표시하지 않습니다.'));
    article.append(date);
    const sources = section(record.sourceLinkType === 'collection' ? '공식 자료군' : '공식 원문'); sources.classList.add('detail-sources');
    presentation.appendCurrentSource(record, sources); presentation.appendMetadata(record, sources);
    article.append(sources);
    if (typeof onOpenArchive === 'function') {
      const context = { q: state.filters?.q || '', collection: state.filters?.collection || 'all', fromYear: state.filters?.fromYear ?? null, toYear: state.filters?.toYear ?? null, sort: state.filters?.sort || 'asc' };
      const actions = element('div', 'record-detail-actions'); const archive = element('button', '', '자료 연표에서 더 찾아보기'); archive.type = 'button'; archive.dataset.action = 'open-record-archive';
      archive.addEventListener('click', () => { if (!destroyed) onOpenArchive(record, { ...context }); }); actions.append(archive); article.append(actions);
    }
    target.append(article); presentation.appendProvenance(state.manifest, target);
  }
  function destroy() { if (destroyed) return; destroyed = true; target.replaceChildren(); target.removeAttribute('aria-busy'); }
  return { render, destroy };
}
