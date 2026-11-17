export function formatYear(year) {
  if (!Number.isInteger(year) || year === 0) throw new RangeError('역사 연도에는 0년이 없습니다.');
  return year < 0 ? `기원전 ${Math.abs(year)}년` : `${year}년`;
}

export function getSnapshotForYear(snapshots, year) {
  formatYear(year);
  if (!snapshots.length) return null;
  return snapshots.reduce((selected, snapshot) => snapshot.year <= year ? snapshot : selected, snapshots[0]);
}

export function searchAtlas(snapshots, query, eras = []) {
  const needle = query.trim().toLocaleLowerCase('ko');
  if (!needle) return [];
  const eraLabels = new Map(eras.map(era => [era.id, era.label]));
  return snapshots.flatMap(snapshot => {
    const results = [];
    if ([snapshot.title, snapshot.summary, snapshot.era, eraLabels.get(snapshot.era), String(snapshot.year)].some(text => text?.toLocaleLowerCase('ko').includes(needle))) {
      results.push({ type: '시대', label: snapshot.title, snapshot });
    }
    for (const place of snapshot.places) {
      if ([place.name, place.modernName, place.polity, place.note].some(text => text?.toLocaleLowerCase('ko').includes(needle))) {
        results.push({ type: '장소', label: `${place.name}${place.modernName ? ` · ${place.modernName}` : ''}`, snapshot, place });
      }
    }
    for (const event of snapshot.events) {
      if ([event.title, event.description].some(text => text?.toLocaleLowerCase('ko').includes(needle))) {
        results.push({ type: '사건', label: event.title, snapshot });
      }
    }
    return results;
  });
}

const SCALE = 52;
const RAD = Math.PI / 180;
const mercator = latitude => Math.log(Math.tan(Math.PI / 4 + latitude * RAD / 2)) / RAD;
export function project([longitude, latitude]) {
  return [500 + (longitude - 127.8) * SCALE, 450 - (mercator(latitude) - mercator(39)) * SCALE];
}
export function unproject([x, y]) {
  return [127.8 + (x - 500) / SCALE, (2 * Math.atan(Math.exp((mercator(39) - (y - 450) / SCALE) * RAD)) - Math.PI / 2) / RAD];
}
