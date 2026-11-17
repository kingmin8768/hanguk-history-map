function sourceKey(source) {
  const url = new URL(source.url);
  if (url.hostname === 'contents.history.go.kr' && url.searchParams.has('levelId')) return `${url.hostname}:${url.searchParams.get('levelId')}`;
  url.hash = '';
  url.searchParams.sort();
  return url.href.replace(/\/$/, '');
}

export function assembleAtlas({ legacy = { sources: [], snapshots: [] }, modules = [] }) {
  const sources = [];
  const keys = new Map();
  const aliases = new Map();
  const sourceIds = new Map();
  for (const source of [...legacy.sources, ...modules.flatMap(module => module.sources)]) {
    const key = sourceKey(source);
    if (sourceIds.has(source.id) && sourceIds.get(source.id) !== key) throw new Error(`Conflicting source ID: ${source.id}`);
    sourceIds.set(source.id, key);
    if (!keys.has(key)) { keys.set(key, source.id); sources.push({ ...source }); }
    aliases.set(source.id, keys.get(key));
  }
  function rewrite(value) {
    if (Array.isArray(value)) return value.map(rewrite);
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, key === 'sourceIds' ? [...new Set(child.map(id => aliases.get(id) || id))] : rewrite(child)]));
  }
  const originalYears = new Map(legacy.snapshots.map(snapshot => [snapshot.year, snapshot]));
  const snapshotsByYear = new Map(originalYears);
  const researchedYears = new Set();
  for (const module of modules) {
    for (const snapshot of module.snapshots) {
      if (researchedYears.has(snapshot.year)) throw new Error(`Duplicate researched snapshot year: ${snapshot.year}`);
      researchedYears.add(snapshot.year);
      snapshotsByYear.set(snapshot.year, { ...snapshot, id: originalYears.get(snapshot.year)?.id || snapshot.id });
    }
  }
  const snapshots = [...snapshotsByYear.values()].sort((a, b) => a.year - b.year).map(rewrite);
  const figures = modules.flatMap(module => module.figures).map(rewrite);
  const polities = modules.flatMap(module => module.polities).map(rewrite);
  return { sources, snapshots, figures, polities };
}
