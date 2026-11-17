# 대규모 한국사 자료 연표

## 목표
기존 130개 지도 해설을 유지하면서 공식 공개 연표 기록을 별도 자료 모음으로 연결한다. 수량을 늘리기 위해 같은 사건을 여러 장면으로 복제하거나 내용이 없는 해설을 생성하지 않는다. 기록의 원래 날짜·제목·초록·문헌 표기를 보존하고 출처와 재사용 조건을 표시한다. 실제 수록 수는 정규화·중복 제거·검증이 끝난 산출물에서 계산한다.

## 데이터 출처
공공데이터포털의 교육부 국사편찬위원회 ‘한국역사자료 메타데이터 정보_연표’, 데이터셋 15051036. 재사용 조건은 확인된 공공누리 제1유형이다. 별개의 제4유형 자료를 같은 허가로 취급하지 않는다. 공개 배포 파일로부터 재현 가능하게 추출하며, 로그인·API 키·로봇 접근 제한을 우회하지 않는다.

## 구분
- 상세 지도 장면: 직접 정리한 해설, 당시 수도·유적·사건 위치, 인물·정치체 연결.
- 공식 자료 연표: 제공기관의 개별 기록 메타데이터와 초록. 독립적인 학술 검증을 새로 마친 사건 전체 목록이라는 의미가 아니다.
- 자료 연표에 확인된 좌표가 없으면 지도점을 만들지 않는다. 근처 해설 장면으로 연결할 때 해당 장면의 실제 연도를 표시한다.
- 날짜의 음력 표기·월일 미상·연대 범위·전승을 유지한다. 미상 월일의 99를 실제 날짜로 표시하거나 임의의 양력으로 바꾸지 않는다.
- 짧거나 잘린 원문 제목은 제공된 제목임을 명시하고 초록과 원문 연결을 제공한다.

## 배포 자료 계약
`dist/corpus/manifest.json`: schemaVersion, dataset(provider/title/id/landingUrl/license), retrievedAt, sourceSha256, counts, coverage, collections, index 경로와 압축 경로.

개별 record: `{id,sourceRecordId,year,originalDate,title,body,collectionId,sourceUrl,sourceLinkType,originalMetadataUrl,calendar,precision}`. year는 원문에서 신뢰할 수 있게 추출한 0 아닌 정수 또는 null이다. id는 통합 메타데이터 ID, sourceRecordId는 원래 제공기관 기사 ID다. sourceLinkType은 article 또는 collection이다. article은 기관의 현재 기사 주소 규칙으로 변환한 링크이며 전수 페이지 검증을 뜻하지 않는다. 개별 주소가 삭제·통합된 근대사연표는 sourceUrl을 공식 자료군 목록 `https://db.history.go.kr/diachronic/level.do?itemId=tcmd`로 연결하고 collection으로 구분한다. 같은 날의 다른 기사로 대신 연결하지 않는다. originalMetadataUrl은 원본 메타데이터의 경로를 보존한다. 공개 자료의 사실 문장을 임의로 확장하지 않는다.

검색용 데이터는 압축하여 배포하고 큰 데이터 파싱·검색은 가능한 환경에서 Worker로 수행한다. 지도 첫 화면에서 전체 자료의 본문·DOM을 만들지 않는다. 대규모 목록은 50건씩 페이지를 이동한다. 전체 일치 건수와 페이지를 표시하며 마지막 페이지·검색·초기화·0건·로딩·오류 복구를 지원한다.

## 클라이언트 계약
`createCorpusStore({fetchResource?,workerFactory?}={})`가 `getManifest()`, `query({q,collection,fromYear,toYear,offset,limit,sort})`, `getRecord(id)`, `dispose()`를 제공한다. query 결과는 `{items,total,offset,limit}`. Worker 지원이 없는 환경에는 동작을 명확히 안내하거나 안전한 동기 모델을 사용할 수 있다.

## 검증
원본 ZIP 해시·추출 수·중복/제외 수·현재 링크 변환 규칙을 기록한다. 같은 해 여러 사건을 보존하고 제공기관 ID 충돌을 점검한다. 초기/말기/BCE/음력/월일 미상·주제별 표본을 원문과 대조한다. 검색은 첫 40건 이후의 결과도 접근 가능해야 한다. 날짜·분야 필터, 비동기 결과 순서, 페이지 경계와 출처 링크를 검사한다.

## 기존 제약
제거한 선택적 참고 표기는 문서·코드·커밋에 추가하지 않는다. 실제 사용하는 공식 자료와 지리 자료의 출처 및 라이선스는 유지한다.
