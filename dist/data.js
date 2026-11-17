// Historical points are approximate modern locations, never reconstructed borders.
// Source pages were opened and checked on 2026-11-17.
const C = { goguryeo: '#805c88', baekje: '#c18b3b', silla: '#b65b49', balhae: '#477e87', goryeo: '#54785d', joseon: '#537c86', empire: '#946b43', republic: '#567a9a', north: '#9b625c', event: '#9b7048', early: '#8d7764' };
const source = (id, title, publisher, url, note) => ({ id, title, publisher, url, ...(note ? { note } : {}) });
export const SOURCES = [
  source('gojoseon-war', '고조선·한 전쟁', '국사편찬위원회 · 우리역사넷', 'https://contents.history.go.kr/mobile/kc/view.do?levelId=kc_i100600'),
  source('dangun', '단군 신화를 이해하는 몇 가지 논점들', '국사편찬위원회 · 우리역사넷', 'https://contents.history.go.kr/front/ht/view.do?levelId=ht_001_0020_0020', '건국 전승과 역사적으로 확인되는 사실을 구분하는 해설.'),
  source('goguryeo-capital', '고구려의 천도', '국사편찬위원회 · 우리역사넷', 'https://contents.history.go.kr/mobile/kc/view.do?levelId=kc_i100500'),
  source('mongchon', '몽촌토성', '국사편찬위원회 · 우리역사넷', 'https://contents.history.go.kr/mobile/kc/view.do?levelId=kc_r100370'),
  source('wolseong', '경주 월성', '한국학중앙연구원 · 한국민족문화대백과사전', 'https://encykorea.aks.ac.kr/Article/E0002909'),
  source('baekje-relocation', '관산성전투: 한성 상실과 국가 재건', '국사편찬위원회 · 우리역사넷', 'https://contents.history.go.kr/mobile/kc/view.do?levelId=kc_i101100'),
  source('sabi', '부소산성: 백제의 사비 천도', '국사편찬위원회 · 우리역사넷', 'https://contents.history.go.kr/mobile/kc/view.do?levelId=kc_r100410'),
  source('gaya', '대가야 멸망', '국사편찬위원회 · 우리역사넷', 'https://contents.history.go.kr/mobile/kc/view.do?levelId=kc_i100720'),
  source('silla-tang', '신라·당 전쟁', '국사편찬위원회 · 우리역사넷', 'https://contents.history.go.kr/mobile/kc/view.do?levelId=kc_i101220'),
  source('balhae-foundation', '발해 건국', '국사편찬위원회 · 우리역사넷', 'https://contents.history.go.kr/mobile/kc/view.do?levelId=kc_i100800'),
  source('balhae', '발해', '한국학중앙연구원 · 한국민족문화대백과사전', 'https://encykorea.aks.ac.kr/Article/E0021626'),
  source('balhae-capital', '발해의 천도', '국사편찬위원회 · 우리역사넷', 'https://contents.history.go.kr/mobile/kc/view.do?levelId=kc_i101000'),
  source('later-three', '후삼국의 통일', '국사편찬위원회 · 우리역사넷', 'https://contents.history.go.kr/mobile/kc/view.do?levelId=kc_i101800'),
  source('goryeo-capital', '고려의 성립과 발전', '국사편찬위원회 · 우리역사넷', 'https://contents.history.go.kr/front/ta/view.do?levelId=ta_m31_0070_0010', '918년 건국, 이듬해 철원에서 송악으로 천도.'),
  source('joseon-foundation', '조선의 건국과 한양 천도', '국사편찬위원회 · 우리역사넷', 'https://contents.history.go.kr/front/ta/print.do?levelId=ta_m71_0060_0010_0010_0010'),
  source('hunmin', '훈민정음', '국사편찬위원회 · 우리역사넷', 'https://contents.history.go.kr/mobile/kc/view.do?levelId=kc_r300900', '1443년 문자 창제와 1446년 해례본 완성을 구분.'),
  source('imjin', '임진왜란', '국사편찬위원회 · 우리역사넷', 'https://contents.history.go.kr/mobile/kc/view.do?levelId=kc_i305500'),
  source('empire', '대한제국', '한국학중앙연구원 · 한국민족문화대백과사전', 'https://encykorea.aks.ac.kr/Article/E0015187'),
  source('provisional', '대한민국 임시정부', '국사편찬위원회 · 우리역사넷', 'https://contents.history.go.kr/mobile/kc/view.do?levelId=kc_o400800'),
  source('charter', '대한민국 임시 헌장', '국사편찬위원회 · 우리역사넷', 'https://contents.history.go.kr/front/hm/view.do?levelId=hm_123_0060'),
  source('government', '대한민국 정부 수립', '국사편찬위원회 · 우리역사넷', 'https://contents.history.go.kr/mobile/kc/view.do?levelId=kc_i502100'),
  source('military-rule', '군정의 실시', '국사편찬위원회 · 우리역사넷', 'https://contents.history.go.kr/mobile/kc/view.do?levelId=kc_i501700'),
  source('north-constitution', '1948년 조선민주주의인민공화국 헌법', '국사편찬위원회 · 우리역사넷', 'https://contents.history.go.kr/front/hm/view.do?levelId=hm_152_0020', '당시 헌법상 수부는 서울. 평양은 정부 소재지로 표시.'),
  source('seoul', '서울특별시', '한국학중앙연구원 · 한국민족문화대백과사전', 'https://encykorea.aks.ac.kr/Article/E0028073'),
  source('pyongyang', '평양시', '한국학중앙연구원 · 한국민족문화대백과사전', 'https://encykorea.aks.ac.kr/Article/E0059979'),
  source('korean-war', '한국전쟁', '한국학중앙연구원 · 한국민족문화대백과사전', 'https://encykorea.aks.ac.kr/Article/E0042143'),
  source('frontline', '6·25전쟁: 전선의 변화', '국가기록원', 'https://theme.archives.go.kr/next/625/process/frontline.do', '38선과 정전협정에 따른 군사분계선은 서로 다르다.'),
  source('armistice', '정전협정의 체결', '국사편찬위원회 · 우리역사넷', 'https://contents.history.go.kr/front/kc/printViewPopup.do?levelId=kc_i502950'),
  source('busan-capital', '임시수도 정부청사', '대한민국역사박물관 · 현대사 디지털 아카이브', 'https://archive.much.go.kr/data/01/folderView.do?idnbr=2018005515&jobdirSeq=929'),
  source('return-seoul', '1953년 연표: 정부 서울 복귀', '국가기록원', 'https://theme.archives.go.kr/next/chronology/yearRecord.do?archiveEvntId=0049272289&year=1953'),
  source('june', '1987년 6월 항쟁', '국사편찬위원회 · 우리역사넷', 'https://contents.history.go.kr/mobile/kc/view.do?levelId=kc_i500500')
];

export const ERAS = [
  { id: 'early', label: '고조선', range: '고대 · 기원전', color: C.early },
  { id: 'three', label: '삼국', range: '4~7세기', color: C.baekje },
  { id: 'northsouth', label: '남북국·후삼국', range: '698~936', color: C.balhae },
  { id: 'goryeo', label: '고려', range: '918~1392', color: C.goryeo },
  { id: 'joseon', label: '조선', range: '1392~1897', color: C.joseon },
  { id: 'empire', label: '대한제국', range: '1897~1910', color: C.empire },
  { id: 'colonial', label: '일제강점기', range: '1910~1945', color: '#8b7372' },
  { id: 'contemporary', label: '현대', range: '1945 이후', color: C.republic }
];

const p = (id, name, modernName, coord, kind, polity, color, note, sourceIds) => ({ id, name, modernName, coord, kind, polity, color, note, sourceIds });
const e = (year, title, description, sourceIds, placeId) => ({ year, title, description, sourceIds, ...(placeId ? { placeId } : {}) });
const PY = p('pyongyang-goguryeo', '평양', '평양 대성산성 일대', [125.81, 39.07], 'capital', '고구려', C.goguryeo, '427년 옮긴 고구려 도읍. 대성산성 주변으로 여겨지는 위치를 개략 표시한다.', ['goguryeo-capital']);
const GJ = p('gyeongju', '신라 왕경', '경상북도 경주', [129.22, 35.83], 'capital', '신라', C.silla, '월성 등 왕궁과 도성 유적이 남아 있는 신라의 중심 도시. 점은 경주 일대를 가리킨다.', ['wolseong']);
const HS = p('hanseong', '한성', '서울 송파 일대', [127.12, 37.53], 'capital', '백제', C.baekje, '풍납토성·몽촌토성 등으로 살펴보는 한성백제의 도읍 일대. 도성 전체를 한 점으로 확정한 것은 아니다.', ['mongchon', 'baekje-relocation']);
const UJ = p('ungjin', '웅진', '충청남도 공주', [127.12, 36.46], 'capital', '백제', C.baekje, '475년 한성 함락 뒤 백제가 옮긴 도읍. 공주 일대의 개략 위치다.', ['baekje-relocation']);
const SB = p('sabi', '사비', '충청남도 부여', [126.91, 36.28], 'capital', '백제', C.baekje, '538년 성왕이 옮긴 도읍. 부소산성과 관북리 유적이 남아 있는 부여 일대를 표시한다.', ['baekje-relocation', 'sabi']);
const GAYA = p('goryeong', '대가야', '경상북도 고령', [128.27, 35.73], 'capital', '대가야', '#7a8b5a', '가야 여러 나라 가운데 대가야의 중심지. 가야 전체가 단일 왕국이었다는 뜻은 아니다.', ['gaya']);
const GG = p('gaegyeong', '개경', '개성', [126.55, 37.97], 'capital', '고려', C.goryeo, '919년 왕건이 철원에서 옮겨 온 고려의 도읍. 개성 일대의 개략 위치다.', ['goryeo-capital']);
const HY = p('hanyang', '한양', '서울', [126.98, 37.58], 'capital', '조선', C.joseon, '1394년 천도한 조선의 도읍. 현대 서울 도심의 개략 위치로 표시한다.', ['joseon-foundation']);
const NK = p('pyongyang-government', '평양', '평양', [125.75, 39.03], 'event', '조선민주주의인민공화국', C.north, '북쪽 정부의 소재지. 당시 북한 헌법이 수부를 서울로 정한 점과 실제 정부 소재지를 구분한다.', ['government', 'north-constitution', 'pyongyang']);
const SEOUL = p('seoul', '서울', '서울특별시', [126.98, 37.57], 'capital', '대한민국', C.republic, '대한민국 정부의 중심 도시이자 수도. 현대 도심의 개략 위치를 표시한다.', ['government', 'seoul']);

export const SNAPSHOTS = [
  {
    id: 'gojoseon-108', year: -108, era: 'early', title: '고조선의 마지막 전쟁', kicker: '전승과 기록 사이', color: C.early,
    summary: '기원전 109~108년 고조선과 한의 전쟁 끝에 왕검성이 함락되고 고조선이 멸망했다. 문헌에 남은 고조선의 마지막 전쟁과 그 결말을 살펴본다.',
    note: '기원전 2333년은 단군 건국 전승의 연대다. 실제 건국 시기와 영역을 확정하는 연도로 사용하지 않는다. 왕검성은 여기서 정확한 좌표로 단정하지 않아 지도점을 생략했다.',
    places: [],
    events: [e(-108, '왕검성 함락과 고조선 멸망', '한과의 전쟁 및 내부 분열 속에서 왕검성이 함락되었다. 건국 전승과 문헌으로 확인되는 이 사건을 구별한다.', ['gojoseon-war', 'dangun'])],
    sourceIds: ['gojoseon-war', 'dangun']
  },
  {
    id: 'goguryeo-427', year: 427, era: 'three', title: '고구려, 평양으로 중심을 옮기다', kicker: '삼국과 가야의 여러 중심', color: C.goguryeo,
    summary: '장수왕 때 고구려는 국내성에서 평양 지역으로 도읍을 옮겼다. 백제는 한성에, 신라는 경주에 중심을 두었고 남쪽에는 가야의 여러 나라가 공존했다.',
    note: '이 지도는 정치체의 중심지를 보여 준다. 점 사이의 빈 공간이나 색은 당시 영토의 경계를 뜻하지 않는다. 평양 도성의 세부 위치에는 연구상의 논의가 있다.',
    places: [PY, HS, GJ, GAYA],
    events: [e(427, '고구려의 평양 천도', '고구려가 집안 지역의 국내성에서 평양으로 도읍을 옮겼다. 대성산성 주변이 이 시기 도성으로 여겨진다.', ['goguryeo-capital'], PY.id)],
    sourceIds: ['goguryeo-capital', 'mongchon', 'baekje-relocation', 'wolseong', 'gaya']
  },
  {
    id: 'ungjin-475', year: 475, era: 'three', title: '백제, 한성에서 웅진으로', kicker: '한강을 둘러싼 변화', color: C.baekje,
    summary: '고구려의 공격으로 백제 한성이 함락되고 개로왕이 죽었다. 문주왕은 금강과 산지가 둘러싼 웅진으로 도읍을 옮겨 국가를 재건했다.',
    note: '475년 천도 이후를 보여 주는 시점이다. 백제 수도는 오늘날 공주인 웅진으로 표시한다. 사비 천도는 아직 일어나지 않았다.',
    places: [PY, UJ, GJ, GAYA],
    events: [e(475, '한성 함락', '고구려군이 백제의 한성을 공격했고 개로왕이 목숨을 잃었다.', ['baekje-relocation']), e(475, '웅진 천도', '문주왕은 지금의 공주에 해당하는 웅진을 새 도읍으로 정했다.', ['baekje-relocation'], UJ.id)],
    sourceIds: ['baekje-relocation', 'goguryeo-capital', 'wolseong', 'gaya']
  },
  {
    id: 'sabi-538', year: 538, era: 'three', title: '사비에서 다시 일어선 백제', kicker: '계획한 도읍, 새로운 출발', color: C.baekje,
    summary: '성왕은 웅진에서 사비로 도읍을 옮기고 국호를 남부여로 고쳤다. 넓은 평야와 수로를 갖춘 사비는 백제의 새로운 정치·문화 중심이 되었다.',
    note: '538년 사비 천도 이후의 중심지를 표시한다. 가야는 여러 정치체의 연맹이었으며 지도에는 그중 대가야의 중심지만 대표로 표시했다.',
    places: [PY, SB, GJ, GAYA],
    events: [e(538, '사비 천도와 남부여', '성왕은 도읍을 오늘날 부여인 사비로 옮기고 체제를 정비했다.', ['baekje-relocation', 'sabi'], SB.id)],
    sourceIds: ['baekje-relocation', 'sabi', 'goguryeo-capital', 'wolseong', 'gaya']
  },
  {
    id: 'silla-676', year: 676, era: 'three', title: '신라·당 전쟁이 끝나다', kicker: '660 · 668 · 676, 서로 다른 전환', color: C.silla,
    summary: '백제는 660년, 고구려는 668년 멸망했다. 이후 신라와 당의 전쟁이 이어졌고, 신라는 매소성과 기벌포 전투를 거쳐 676년 전쟁을 마무리했다.',
    note: '신라가 옛 고구려의 모든 영역을 차지했다는 의미가 아니다. 기벌포의 점은 금강 하구를 가리키는 개략 위치이며 전투 현장을 정밀하게 복원한 좌표가 아니다.',
    places: [GJ, p('gibeolpo', '기벌포 일대', '충청남도 서천·금강 하구', [126.69, 36.02], 'event', '신라·당 전쟁', C.event, '676년 신라 수군이 당군과 싸운 금강 하구 일대. 정확한 전장 위치는 단정하지 않는다.', ['silla-tang'])],
    events: [e(660, '백제 멸망', '신라·당 연합군의 공격으로 백제가 멸망했다.', ['silla-tang']), e(668, '고구려 멸망', '고구려 멸망 뒤 신라와 당 사이의 대립이 본격화했다.', ['silla-tang']), e(676, '기벌포 전투와 전쟁 종료', '신라가 기벌포 전투에서 승리하면서 신라·당 전쟁이 종결되었다.', ['silla-tang'], 'gibeolpo')],
    sourceIds: ['silla-tang', 'wolseong']
  },
  {
    id: 'balhae-698', year: 698, era: 'northsouth', title: '남쪽의 신라, 북쪽의 발해', kicker: '두 나라가 함께 이어 간 역사', color: C.balhae,
    summary: '대조영은 고구려 유민과 말갈 세력을 이끌고 동모산 일대에 나라를 세웠다. 신라와 발해가 병존하는 남북국의 구도가 펼쳐졌다.',
    note: '698년의 초기 국호는 진국이며 발해라는 국호는 713년부터 사용했다. 동모산 점은 현재 중국 지린성 돈화 일대를 가리키며 정밀한 왕궁 위치는 아니다.',
    places: [GJ, p('dongmosan', '동모산', '중국 지린성 돈화 일대', [128.23, 43.33], 'capital', '발해', C.balhae, '대조영이 나라를 세운 초기 도읍 일대. 초기 국호는 진국이다. 돈화 지역의 개략 위치를 표시한다.', ['balhae-foundation', 'balhae-capital'])],
    events: [e(698, '대조영의 건국', '고구려 유민·말갈 집단이 함께 새 나라를 세웠다. 남쪽에서는 신라가 존속하고 있었다.', ['balhae-foundation', 'balhae'], 'dongmosan')],
    sourceIds: ['balhae-foundation', 'balhae', 'balhae-capital', 'wolseong']
  },
  {
    id: 'goryeo-918', year: 918, era: 'northsouth', title: '고려가 태어나던 해', kicker: '후삼국의 경쟁, 여전히 존속한 발해', color: C.goryeo,
    summary: '왕건이 궁예를 몰아내고 고려를 세웠다. 남쪽에서는 신라와 후백제가 함께 경쟁했고, 북쪽의 발해도 926년까지 존속했다.',
    note: '918년 고려의 수도는 철원이다. 송악으로의 천도는 이듬해인 919년이다. 후백제의 수도는 이 지도에서 생략했으며 표시된 나라가 당시 정치체의 전부는 아니다.',
    places: [p('cheorwon', '철원', '강원도 철원 일대', [127.31, 38.26], 'capital', '고려', C.goryeo, '918년 고려가 출범한 당시 도읍 일대. 왕건은 이듬해 송악으로 옮겼다.', ['goryeo-capital']), GJ, p('sanggyeong', '상경 용천부', '중국 헤이룽장성 닝안 일대', [129.15, 44.11], 'capital', '발해', C.balhae, '발해가 마지막으로 수도를 둔 곳. 926년 멸망할 때까지 도읍으로 유지되었다.', ['balhae-capital', 'balhae'])],
    events: [e(918, '왕건, 고려 건국', '왕건은 국호를 고려로 정했다. 건국 뒤에도 신라·후백제와의 경쟁은 계속되었다.', ['later-three', 'goryeo-capital'], 'cheorwon')],
    sourceIds: ['later-three', 'goryeo-capital', 'balhae', 'balhae-capital', 'wolseong']
  },
  {
    id: 'unification-936', year: 936, era: 'goryeo', title: '고려, 후삼국을 통합하다', kicker: '개경을 중심으로', color: C.goryeo,
    summary: '고려는 935년 신라를 받아들이고, 이듬해 후백제를 제압해 후삼국을 통합했다. 926년 발해 멸망 뒤에는 발해 유민들도 받아들였다.',
    note: '경주는 이 시점의 수도가 아닌 옛 신라 왕경으로 표시한다. 후삼국 통합은 발해의 옛 영토 전체를 지배했다는 뜻이 아니다.',
    places: [GG, { ...GJ, kind: 'site', polity: '옛 신라 왕경', note: '935년 신라가 고려에 통합된 뒤의 옛 왕경. 이 시점의 수도로 표시하지 않는다.', sourceIds: ['later-three', 'wolseong'] }],
    events: [e(919, '송악 천도', '왕건이 철원에서 송악으로 도읍을 옮겼다. 송악은 이후 개경으로 불린다.', ['goryeo-capital'], GG.id), e(935, '신라의 고려 귀부', '신라 경순왕이 고려에 귀부했다.', ['later-three']), e(936, '후삼국 통합', '고려가 후백제를 제압하며 후삼국의 경쟁을 끝냈다.', ['later-three'])],
    sourceIds: ['later-three', 'goryeo-capital', 'wolseong']
  },
  {
    id: 'joseon-1392', year: 1392, era: 'joseon', title: '개경에서 시작된 조선', kicker: '새 왕조의 성립', color: C.joseon,
    summary: '이성계와 그를 지지한 신진 사대부 세력이 새 왕조를 세웠다. 조선의 건국은 1392년이며, 처음에는 기존 도읍인 개경에서 출발했다.',
    note: '건국 연도와 한양 천도를 구분한다. 1392년의 수도는 개경이며 한양으로 실제 옮긴 해는 1394년이다.',
    places: [{ ...GG, polity: '조선', color: C.joseon, note: '고려의 도읍이었던 개경에서 조선이 출범했다. 한양 천도 이전의 수도다.', sourceIds: ['joseon-foundation'] }],
    events: [e(1392, '조선 건국', '이성계가 왕위에 오르며 새 왕조가 성립했다. 도읍 이전은 이후 별도로 추진되었다.', ['joseon-foundation'], GG.id)],
    sourceIds: ['joseon-foundation']
  },
  {
    id: 'hanyang-1394', year: 1394, era: 'joseon', title: '한양, 새 도읍이 되다', kicker: '한강과 도성의 도시', color: C.joseon,
    summary: '태조는 후보지를 검토한 끝에 한양으로 도읍을 옮겼다. 한강 수로와 주변 산지는 새 수도의 교통·방어 조건이 되었다.',
    note: '1394년 첫 한양 천도 이후의 시점이다. 뒤이은 왕자의 난과 일시적인 개경 환도 등 모든 변화를 한 장면에 합치지 않았다.',
    places: [HY, { ...GG, name: '개경', kind: 'site', polity: '조선', note: '첫 한양 천도 직후의 이전 도읍. 이 장면에서는 옛 도읍으로 표시한다.', sourceIds: ['joseon-foundation'] }],
    events: [e(1394, '한양 천도', '태조가 개경에서 한양으로 도읍을 옮겼다.', ['joseon-foundation'], HY.id)],
    sourceIds: ['joseon-foundation']
  },
  {
    id: 'hunmin-1446', year: 1446, era: 'joseon', title: '훈민정음, 새 문자의 원리를 담다', kicker: '1443년 창제 · 1446년 해례본 완성', color: C.joseon,
    summary: '세종은 1443년 훈민정음 문자를 만들었다. 1446년에는 새 문자의 원리와 사용법을 설명한 『훈민정음』 해례본이 완성되었다.',
    note: '문자 창제와 해설서 완성을 구별했다. 한양 점은 당시 왕실과 학술 활동의 중심 도시를 표시하며, 정확한 집필 장소를 확정하는 좌표는 아니다.',
    places: [HY],
    events: [e(1443, '훈민정음 문자 창제', '세종이 스물여덟 글자를 만들고 훈민정음이라고 이름 지었다.', ['hunmin'], HY.id), e(1446, '해례본 완성', '정인지 등 학자들이 참여해 문자의 이론과 용례를 설명하는 책을 완성했다.', ['hunmin'], HY.id)],
    sourceIds: ['hunmin', 'joseon-foundation']
  },
  {
    id: 'imjin-1592', year: 1592, era: 'joseon', title: '임진왜란, 한반도를 휩쓴 전쟁', kicker: '침략과 피란, 육지와 바다의 항전', color: C.joseon,
    summary: '일본군이 부산으로 침략한 뒤 빠르게 북상했다. 선조는 한양을 떠나 평양을 거쳐 의주로 피란했고, 조선의 의병과 수군은 여러 지역에서 항전했다.',
    note: '1592년 전쟁 초기의 주요 지점을 모았다. 의주는 왕의 피란지로 표시하며 정식 수도로 표시하지 않는다. 전쟁은 1598년까지 이어졌다.',
    places: [{ ...HY, note: '조선의 도읍이지만 선조가 피란한 뒤 일본군이 점령했다. 수도의 이름과 왕의 소재지를 구분한다.', sourceIds: ['imjin', 'joseon-foundation'] }, p('busan-invasion', '부산', '부산광역시', [129.07, 35.18], 'event', '일본군 침략', C.event, '1592년 일본군 상륙과 부산진·동래의 전투가 일어난 지역. 부산시의 개략 위치다.', ['imjin']), p('uiju', '의주', '평안북도 의주', [124.53, 40.2], 'event', '조선', C.goryeo, '선조가 평양을 거쳐 도착한 피란지. 정식 수도로 바뀌었다는 의미는 아니다.', ['imjin'])],
    events: [e(1592, '부산 상륙과 전쟁 발발', '일본군의 침략에 부산진과 동래의 조선군이 맞섰다.', ['imjin'], 'busan-invasion'), e(1592, '선조의 의주 피란', '선조가 한양·개성·평양을 거쳐 의주로 피란했다.', ['imjin'], 'uiju')],
    sourceIds: ['imjin', 'joseon-foundation']
  },
  {
    id: 'empire-1897', year: 1897, era: 'empire', title: '대한제국을 선포하다', kicker: '주권 국가를 향한 모색', color: C.empire,
    summary: '고종은 환구단에서 황제 즉위식을 올리고 대한제국을 출범시켰다. 새 국호에는 국제사회에서 대등한 주권 국가로 활동하려는 뜻이 담겼다.',
    note: '황제 즉위식은 10월 12일, 공식 출범 선포는 10월 13일이다. 도시는 한성으로, 오늘날의 지명은 서울로 표시한다.',
    places: [p('hanseong-empire', '한성', '서울특별시', [126.98, 37.57], 'capital', '대한제국', C.empire, '대한제국의 정치 중심지. 경운궁과 환구단을 포함하는 오늘날 서울 도심의 개략 위치다.', ['empire'])],
    events: [e(1897, '황제 즉위와 대한제국 출범', '고종이 환구단에서 황제에 즉위하고 국호를 대한으로 바꾸었다.', ['empire'], 'hanseong-empire')],
    sourceIds: ['empire']
  },
  {
    id: 'annexation-1910', year: 1910, era: 'colonial', title: '국권을 빼앗기다', kicker: '대한제국의 종말과 식민지 지배', color: '#8b7372',
    summary: '일본의 침탈이 이어진 끝에 대한제국은 강제로 병합되었다. 8월 22일 조약이 조인되었고, 8월 29일 공포되었다.',
    note: '식민지 지배의 중심 도시는 독립 국가의 수도와 구분한다. 이 지도는 강제 병합을 자발적이고 대등한 국가 통합으로 표현하지 않는다.',
    places: [p('seoul-annexation', '서울', '서울특별시', [126.98, 37.57], 'event', '일제강점기', '#8b7372', '대한제국의 정치 중심지에서 국권 피탈의 현장이 된 도시. 독립 국가의 수도 표식을 사용하지 않는다.', ['empire'])],
    events: [e(1910, '강제 병합 조약 공포', '1910년 8월 29일 병합 조약이 공포되며 대한제국이 일본의 식민지가 되었다.', ['empire'], 'seoul-annexation')],
    sourceIds: ['empire']
  },
  {
    id: 'independence-1919', year: 1919, era: 'colonial', title: '3·1 운동, 민주공화국을 향하다', kicker: '국내외로 이어진 독립의 선언', color: '#8b7372',
    summary: '3월 1일 독립선언과 만세운동은 국내외로 퍼졌다. 4월 11일 상하이에서 대한민국 임시정부가 수립되었고, 9월에는 각지 임시정부를 아우른 체제가 출범했다.',
    note: '상하이는 임시정부 소재지이며 한반도의 영토상 수도가 아니다. 지도점은 도시 단위 위치로, 특정 청사 주소나 독립운동의 범위 전체를 뜻하지 않는다.',
    places: [p('seoul-march', '서울', '서울특별시', [126.98, 37.57], 'event', '3·1 운동', C.event, '3월 1일 독립선언과 만세운동이 전개된 도시. 운동은 전국과 해외로 확산되었다.', ['provisional']), p('pyongyang-march', '평양', '평양', [125.75, 39.03], 'event', '3·1 운동', C.goryeo, '독립선언과 만세운동이 전개된 주요 도시 가운데 하나다.', ['provisional']), p('shanghai', '상하이', '중국 상하이', [121.47, 31.23], 'event', '대한민국 임시정부', C.republic, '대한민국 임시정부의 출범 및 통합이 이루어진 도시. 도시의 개략 위치다.', ['provisional', 'charter'])],
    events: [e(1919, '3·1 독립선언과 만세운동', '일제의 지배에 항거한 선언과 시위가 국내외로 확산되었다.', ['provisional'], 'seoul-march'), e(1919, '대한민국 임시정부 수립', '4월 11일 상하이에 민주공화제를 표방한 임시정부가 수립되었다. 9월에는 통합 임시정부 체제가 출범했다.', ['provisional', 'charter'], 'shanghai')],
    sourceIds: ['provisional', 'charter']
  },
  {
    id: 'liberation-1945', year: 1945, era: 'contemporary', title: '해방, 그리고 분할점령', kicker: '8월 15일 이후의 새로운 과제', color: C.republic,
    summary: '8월 15일 일제의 지배에서 해방되었다. 이후 38선 남쪽에는 미군, 북쪽에는 소련군이 진주하며 서로 다른 점령 통치가 시작되었다.',
    note: '1945년의 해방과 1948년 남북 정부 수립은 별개 사건이다. 당시 38선은 오늘날의 군사분계선과 같지 않다. 좌표가 검증되지 않은 경계선은 그리지 않았다.',
    places: [p('seoul-occupation', '서울', '서울특별시', [126.98, 37.57], 'event', '미군정', C.republic, '38선 이남을 점령한 미군정의 중심 도시. 대한민국 정부 수립 이전 시점이다.', ['government', 'military-rule']), p('pyongyang-occupation', '평양', '평양', [125.75, 39.03], 'event', '소련군 점령', C.north, '38선 이북에 진주한 소련군 점령 지역의 주요 도시. 북쪽 정부 수립 이전 시점이다.', ['government', 'pyongyang'])],
    events: [e(1945, '8·15 해방', '일본의 패전으로 식민지 지배에서 해방되었다.', ['government']), e(1945, '38선 남북의 분할점령', '38선을 경계로 미군과 소련군이 각각 진주했다.', ['government', 'military-rule'])],
    sourceIds: ['government', 'military-rule', 'frontline', 'pyongyang']
  },
  {
    id: 'governments-1948', year: 1948, era: 'contemporary', title: '남과 북에 정부가 수립되다', kicker: '8월 15일 · 9월 9일', color: C.republic,
    summary: '8월 15일 대한민국 정부 수립이 선포되었다. 9월 9일에는 북쪽에서 조선민주주의인민공화국이 수립되며 분단이 제도화되었다.',
    note: '평양은 북쪽 정부의 실제 소재지로 표시한다. 당시 북한 헌법은 수부를 서울로 정했으므로 평양에 공식 수도 표식을 붙이지 않았다.',
    places: [SEOUL, NK],
    events: [e(1948, '대한민국 정부 수립', '8월 15일 대한민국 정부 수립이 선포되었다.', ['government'], SEOUL.id), e(1948, '조선민주주의인민공화국 수립', '9월 9일 북쪽 정부가 수립되었다.', ['government', 'north-constitution'], NK.id)],
    sourceIds: ['government', 'north-constitution', 'seoul', 'pyongyang']
  },
  {
    id: 'war-1950', year: 1950, era: 'contemporary', title: '6월 25일, 한국전쟁 발발', kicker: '한반도를 가른 전쟁', color: C.republic,
    summary: '1950년 6월 25일 새벽 북한군의 남침으로 한국전쟁이 시작되었다. 이후 전선이 크게 움직이며 한반도 전역에 막대한 피해를 남겼다.',
    note: '이 장면의 정부 소재지는 6월 25일 전쟁 발발 시점을 기준으로 한다. 같은 해 뒤에 정부가 피란한 부산을 이미 수도였던 것처럼 표시하지 않는다.',
    places: [{ ...SEOUL, note: '1950년 6월 25일 전쟁 발발 당시 대한민국 정부 소재지. 이후의 피란 및 환도와 구분한다.', sourceIds: ['seoul', 'korean-war'] }, NK],
    events: [e(1950, '한국전쟁 발발', '6월 25일 북한군의 남침으로 전쟁이 발발했다. 전쟁 중의 전선 변화는 고정된 국경선이 아니다.', ['korean-war', 'frontline'])],
    sourceIds: ['korean-war', 'frontline', 'seoul', 'pyongyang', 'north-constitution', 'government']
  },
  {
    id: 'armistice-1953', year: 1953, era: 'contemporary', title: '정전협정, 멈춘 전투와 남은 분단', kicker: '7월 27일의 한반도', color: C.republic,
    summary: '7월 27일 정전협정이 체결되어 그날 밤 발효되었다. 실제 지상접촉선을 기준으로 군사분계선이 정해지고 양쪽에 비무장지대가 설치되었다.',
    note: '정전은 평화협정이나 전쟁의 완전한 종결을 뜻하지 않는다. 7월 27일의 임시수도는 부산이며 정부는 이후 8월 15일 서울로 복귀했다. 군사분계선은 38선과 다르다.',
    places: [p('busan-capital', '부산', '부산광역시', [129.07, 35.18], 'capital', '대한민국', C.republic, '1953년 7월 27일 정전 당시의 임시수도. 정부의 서울 복귀는 그해 8월 15일이다.', ['busan-capital', 'return-seoul']), NK, p('panmunjom', '판문점', '군사분계선 일대', [126.68, 37.96], 'event', '정전협정', C.event, '정전협정이 체결된 판문점 일대의 개략 위치. 오늘날 공동경비구역 시설의 정밀 좌표와 구분한다.', ['armistice'])],
    events: [e(1953, '정전협정 체결', '7월 27일 오전 10시 서명한 협정은 같은 날 22시 발효되었다.', ['armistice'], 'panmunjom'), e(1953, '군사분계선과 비무장지대', '실제 지상접촉선을 기준으로 정한 군사분계선은 1945년의 38선과 서로 다르다.', ['armistice', 'frontline'])],
    sourceIds: ['armistice', 'frontline', 'busan-capital', 'return-seoul', 'north-constitution', 'pyongyang', 'government']
  },
  {
    id: 'democracy-1987', year: 1987, era: 'contemporary', title: '6월, 시민이 바꾼 민주주의', kicker: '전국으로 이어진 직선제의 요구', color: C.republic,
    summary: '박종철 고문치사 사건과 4·13 호헌조치에 대한 저항이 커졌다. 6월 내내 전국적으로 시위가 이어졌고, 6·29 선언은 대통령 직선제 개헌을 약속했다.',
    note: '6월 항쟁은 서울에 한정된 사건이 아닌 전국적인 시민운동이었다. 서울의 대표 지점만 지도에 표시했다. 이한열은 6월 9일 피격 당시 중태에 빠졌으며 사망은 그 이후다.',
    places: [SEOUL, p('myeongdong', '명동성당', '서울특별시 중구', [126.99, 37.56], 'event', '6월 민주항쟁', C.event, '6월 10~15일 농성투쟁이 이어진 곳. 서울 도심의 개략 위치로 표시한다.', ['june'])],
    events: [e(1987, '6·10 국민대회', '서울과 전국 여러 도시에서 호헌철폐와 민주화를 요구하는 시위가 전개되었다.', ['june']), e(1987, '명동성당 농성', '6월 10~15일 농성과 시민들의 지원은 항쟁이 이어지는 데 중요한 역할을 했다.', ['june'], 'myeongdong'), e(1987, '6·29 선언', '대통령 직선제 개헌과 새 헌법에 따른 선거를 약속했다.', ['june'])],
    sourceIds: ['june', 'seoul', 'government']
  }
];
