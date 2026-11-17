# 한국사 상세 탐색 확장

## 목표와 구현 판단
대표 장면 20개의 요약 지도를 시대별로 연속해서 읽을 수 있는 한국사 탐색 도구로 확장한다. 사용자 요청은 정보의 깊이와 탐색의 상세화를 계속 진행하는 것이다. 기존 정적 ES module 구조와 지도를 유지하고, 여러 시대의 자료 모듈을 합성한다. 프레임워크 교체보다 검증된 내용과 탐색 동작 확장에 집중한다.

기준은 100개 이상의 대표 시점, 사건별 배경과 결과, 30명 이상의 인물, 정치체 개관, 같은 도시의 시기별 기록, 주제와 시대를 조합하는 전체 연표다. 수량 때문에 미확인 내용을 넣지 않는다. 실제 집계는 최종 검증 결과로 보고한다.

## 사실과 출처
- 원문을 실제 확인한 공식 역사기관·박물관·국가기록원·공식 국제기관 페이지를 출처로 연결한다.
- 서술은 직접 요약한다. 문헌상의 전승, 대표 연도, 위치 불확실성을 명시한다.
- 정치체 병존과 건국/천도/정부 소재지의 구별을 유지한다. 고대 영토를 임의의 폴리곤으로 그리지 않는다.
- 인물 경로의 선은 확인된 활동 지점을 연대순으로 연결하며 당시 도로·행군 경로를 복원한 것처럼 표현하지 않는다.
- 이전에 제거한 선택적 참고 표기는 코드·문서·커밋 메시지에 다시 추가하지 않는다.

## 화면과 탐색
기존 지도·오른쪽 기록·아래 시대 선택 구조를 유지한다. 시대 해설 탭에는 배경/전개/의미 등 실제 역사 설명을 담는다. 통합 탐색 창은 전체 연표·정치체·인물·도시 기록을 제공하고 목록에서 상세 내용과 원문 출처를 열 수 있다. 인물의 활동 지점을 지도에 표시하고 사건·도시 기록에서 해당 장면으로 돌아갈 수 있다. 긴 목록은 검색·시대·주제로 걸러 읽는다.

## 데이터 모듈 계약
`dist/content/{ancient,medieval,joseon,modern}.js`는 각각 `sources`, `snapshots`, `figures`, `polities` 배열을 export한다. 각 모듈은 독립적이며 다른 시대 모듈을 import하지 않는다. ID는 시대 접두사로 충돌을 피한다. 기존 장면의 ID는 유지한다.

source: `{id,title,publisher,url,note?}`. HTTPS 공식 원문 URL만 사용한다.

snapshot: 기존 `{id,year,era,title,kicker,summary,note,color,places,events,sourceIds}`에 `sections:[{heading,body,sourceIds}]`, `figureIds:string[]`, `polityIds:string[]`, `tags:string[]`를 추가한다. year는 0이 아닌 정수. 한 해에 여러 사건은 하나의 snapshot으로 묶는다. sections는 서로 다른 맥락의 2~3개 직접 작성한 문단으로 구성한다.

place: `{id,name,modernName,coord:[lon,lat],kind:'capital'|'event'|'site',polity,color,note,sourceIds,siteId?}`. siteId는 도시 단위 연결 키: seoul, pyongyang, gyeongju, gongju, buyeo, gaeseong, cheorwon, busan, shanghai 등. 궁성·전투의 세부 위치를 확정할 수 없으면 도시 단위로 명시하거나 표시를 생략한다.

event: `{year,title,description,sourceIds,placeId?,category:'politics'|'war'|'culture'|'society'|'diplomacy'}`. 장면 연도보다 미래 사건은 넣지 않는다.

figure: `{id,name,years,role,polityId,summary,sections:[{heading,body,sourceIds}],sourceIds,stops:[{year,label,coord,description,sourceIds}]}`. years는 출생/사망 또는 활동 시기 문자열. 확인된 경로가 없으면 stops는 빈 배열. 지도 경로는 동아시아에서 확인되는 활동 지점 위주로 구성한다.

polity: `{id,name,period,color,summary,sections:[{heading,body,sourceIds}],capitalNames:string[],sourceIds}`. 단일 왕조와 연맹/정부/역사적 시대를 구별한다.

## 시대 ID
early(313년까지), three(314~697), northsouth(698~899), later(900~935), goryeo(936~1391), joseon(1392~1591), joseon-war(1592~1637), joseon-late(1638~1875), opening(1876~1896), empire(1897~1909), colonial(1910~1944), contemporary(1945~1987), recent(1988 이후). 장면의 주제와 병존은 설명에서 보완한다. 676~697년은 신라 통일 과정과 제도 정비를 다루며 발해 성립 이전에 남북국으로 표시하지 않는다.

## 검증
출처 ID의 전 참조, 고유 장면 연도/ID, 날짜·좌표 범위, 인물과 정치체 링크, 기존 URL 유지, 검색과 연표 필터, 도시 기록 정렬, 상세/지도 간 전환, 재생/장면 이동 회귀를 자동 검사한다. 새 내용은 독립 검토 후 수정한다. 실행 환경의 브라우저 검증 가능 여부는 실제 결과로 보고한다.
