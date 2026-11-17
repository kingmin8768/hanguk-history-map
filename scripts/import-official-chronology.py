#!/usr/bin/env python3
"""Reproduce the NIKH chronology pack from public-data dataset 15051036.

Uses only Python's standard library. The published archive is read in place;
no HTML article crawling or API credentials are needed.
"""

import argparse
from collections import Counter
import csv
from datetime import datetime, timezone
import gzip
import hashlib
import http.cookiejar
import io
import json
from pathlib import Path
import re
import tempfile
from urllib.parse import urlencode, urlsplit
from urllib.request import HTTPCookieProcessor, build_opener
import xml.etree.ElementTree as ET
import zipfile


LANDING_URL = "https://www.data.go.kr/data/15051036/fileData.do"
LICENSE_URL = "https://www.kogl.or.kr/info/licenseType1.do"
DATASET = {
    "id": "15051036",
    "title": "교육부 국사편찬위원회_한국역사자료 메타데이터 정보_연표",
    "provider": "교육부 국사편찬위원회",
    "landingUrl": LANDING_URL,
    "license": {
        "name": "공공누리 제1유형 (출처표시)",
        "url": LICENSE_URL,
        "attribution": "교육부 국사편찬위원회, 한국역사자료 메타데이터 정보_연표 (2022-11-03), 공공누리 제1유형. https://www.data.go.kr/data/15051036/fileData.do",
    },
}

# Current collection codes were read from the official general-history DB.
# The 2022 archive retains the old article identifiers and resolver URLs.
COLLECTIONS = {
    "tc_ko_": ("tcko", "고대사연표"),
    "tc_md_": ("tcmd", "근대사연표"),
    "tc_ct_": ("tcct", "대한민국사연표"),
    "ch_ad_": ("ch_001", "광고연표"),
    "ch_mw_": ("ch_002", "근대여성연표"),
    "ch_me_": ("ch_003", "근대질병의료연표"),
    "ch_di_": ("ch_004", "기상재해연표"),
    "ch_st_": ("ch_005", "노동쟁의연표"),
    "ch_se_": ("ch_006", "노비연표"),
    "ch_fa_": ("ch_007", "농민항쟁연표"),
    "ch_nk_": ("ch_008", "북한연표"),
    "ch_fo_": ("ch_009", "식량식생활연표"),
    "ch_ma_": ("ch_010", "장시연표"),
    "ch_wo_": ("ch_011", "전근대여성연표"),
    "ch_wa_": ("ch_012", "전쟁연표"),
    "ch_fr_": ("ch_013", "해외항일운동연표"),
    "ch_mo_": ("ch_014", "화폐연표"),
    "ch_co_": ("ch_015", "회사기업가연표"),
    "okch_": ("okch", "재외동포사연표"),
}
REQUIRED_COLUMNS = {
    "통합메타데이터 ID", "전문센터ID", "전문센터 메타데이터", "DB정보",
    "제목", "초록", "사건발생일", "연계주소", "기사레벨",
}
DATE_PATTERN = re.compile(r"^(-?\d{1,4})-(\d{2})-(\d{2})(L\d+)?$")
IDENTIFIER_PATTERN = re.compile(r"^[A-Za-z0-9_$-]+$")


def parse_date(original):
    """Keep date uncertainty; absence of L is not a claim of a solar date."""
    value = original.strip()
    result = {
        "year": None,
        "calendar": "lunar" if re.search(r"L\d+$", value) else "unspecified",
        "precision": "unknown",
    }
    match = DATE_PATTERN.fullmatch(value)
    if not match:
        return result
    year, month, day = map(int, match.group(1, 2, 3))
    if year == 0:
        return result
    result["year"] = year
    result["precision"] = "year"
    if 1 <= month <= 12:
        result["precision"] = "month"
        if 1 <= day <= 31:
            result["precision"] = "day"
    return result


def source_route(source_id):
    if not IDENTIFIER_PATTERN.fullmatch(source_id):
        raise ValueError("Invalid source identity: " + source_id)
    for prefix, (collection_id, label) in COLLECTIONS.items():
        if source_id.startswith(prefix):
            if collection_id == "tcmd":
                # Some 2022 article IDs no longer exist in the current DB.
                # Its resolver returns an unrelated default list with HTTP 200,
                # so an inferred article URL must not be presented as exact.
                return collection_id, label, "https://db.history.go.kr/diachronic/level.do?itemId=tcmd", "collection"
            current_id = collection_id + "_" + source_id[len(prefix):]
            return collection_id, label, "https://db.history.go.kr/id/" + current_id, "article"
    raise ValueError("Unknown source identity/collection: " + source_id)


def original_url(fragment):
    try:
        root = ET.fromstring(fragment)
        node = root.find("get")
        value = node.text.strip() if node is not None and node.text else ""
    except ET.ParseError as error:
        raise ValueError("Invalid source URL metadata") from error
    parsed = urlsplit(value)
    if parsed.scheme not in ("http", "https") or parsed.netloc != "db.history.go.kr":
        raise ValueError("Invalid source URL: " + value)
    return value


def normalize_rows(rows):
    """Select individually dated NIKH records, preserving source text exactly."""
    records = []
    by_id = {}
    source_centers = Counter()
    excluded = Counter({"externalCenter": 0, "nonEventHeading": 0})
    duplicate_ids = 0
    source_rows = 0
    for row in rows:
        source_rows += 1
        center = row["전문센터ID"].strip()
        source_centers[center] += 1
        if center != "NIKH":
            excluded["externalCenter"] += 1
            continue
        integrated_id = row["통합메타데이터 ID"].strip()
        source_id = row["전문센터 메타데이터"].strip()
        if integrated_id != "KH.NIKH." + source_id:
            raise ValueError("Source identity mismatch: " + integrated_id)
        if not row["사건발생일"].strip():
            excluded["nonEventHeading"] += 1
            continue
        if not row["제목"].strip():
            raise ValueError("Missing source title: " + integrated_id)
        collection_id, _, url, link_type = source_route(source_id)
        date_info = parse_date(row["사건발생일"])
        record = {
            "id": integrated_id,
            "sourceRecordId": source_id,
            **date_info,
            "originalDate": row["사건발생일"],
            "title": row["제목"],
            "body": row["초록"],
            "collectionId": collection_id,
            "sourceUrl": url,
            "sourceLinkType": link_type,
            "originalMetadataUrl": original_url(row["연계주소"]),
        }
        previous = by_id.get(integrated_id)
        if previous is not None:
            if previous != record:
                raise ValueError("Conflicting source records for identity: " + integrated_id)
            duplicate_ids += 1
            continue
        by_id[integrated_id] = record
        records.append(record)
    records.sort(key=lambda record: (
        record["year"] is None,
        record["year"] if record["year"] is not None else 0,
        record["id"],
    ))
    counts = {
        "sourceRows": source_rows,
        "sourceCenters": dict(sorted(source_centers.items())),
        "included": len(records),
        "excluded": dict(excluded),
        "duplicateIds": duplicate_ids,
        "withoutParsedYear": sum(record["year"] is None for record in records),
        "withoutBody": sum(not record["body"] for record in records),
        "calendar": dict(sorted(Counter(record["calendar"] for record in records).items())),
        "precision": dict(sorted(Counter(record["precision"] for record in records).items())),
        "sourceLinkTypes": dict(sorted(Counter(record["sourceLinkType"] for record in records).items())),
    }
    return records, counts


def read_archive(path):
    csv.field_size_limit(100_000_000)
    with zipfile.ZipFile(path) as archive:
        candidates = [entry for entry in archive.infolist() if entry.filename.lower().endswith(".csv")]
        if len(candidates) != 1:
            raise ValueError("Expected exactly one chronology CSV in the archive")
        with archive.open(candidates[0]) as binary:
            with io.TextIOWrapper(binary, encoding="utf-8-sig", newline="") as stream:
                reader = csv.DictReader(stream)
                missing = REQUIRED_COLUMNS.difference(reader.fieldnames or [])
                if missing:
                    raise ValueError("Missing CSV columns: " + ", ".join(sorted(missing)))
                return normalize_rows(reader)


def sha256_file(path):
    digest = hashlib.sha256()
    with Path(path).open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def write_pack(records, output):
    """Stream records to gzip to avoid retaining another full JSON payload."""
    uncompressed_length = 0
    with output.open("wb") as binary:
        with gzip.GzipFile(filename="", mode="wb", fileobj=binary, mtime=0, compresslevel=9) as compressed:
            prefix = b'{"schemaVersion":1,"records":['
            compressed.write(prefix)
            uncompressed_length += len(prefix)
            for index, record in enumerate(records):
                encoded = json.dumps(record, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
                if index:
                    compressed.write(b",")
                    uncompressed_length += 1
                compressed.write(encoded)
                uncompressed_length += len(encoded)
            compressed.write(b"]}")
            uncompressed_length += 2
    return {
        "path": output.name,
        "compression": "gzip",
        "sha256": sha256_file(output),
        "byteLength": output.stat().st_size,
        "uncompressedByteLength": uncompressed_length,
    }


def build_manifest(records, counts, source, data, retrieved_at):
    years = Counter(record["year"] for record in records if record["year"] is not None)
    grouped = {}
    labels = {collection_id: label for collection_id, label in COLLECTIONS.values()}
    for record in records:
        group = grouped.setdefault(record["collectionId"], [])
        if record["year"] is not None:
            group.append(record["year"])
    collection_counts = Counter(record["collectionId"] for record in records)
    collections = [{
        "id": collection_id,
        "label": labels[collection_id],
        "count": collection_counts[collection_id],
        "fromYear": min(grouped[collection_id]) if grouped[collection_id] else None,
        "toYear": max(grouped[collection_id]) if grouped[collection_id] else None,
    } for collection_id in sorted(grouped)]
    return {
        "schemaVersion": 1,
        "dataset": DATASET,
        "retrievedAt": retrieved_at,
        "sourceSha256": sha256_file(source),
        "recordCount": len(records),
        "counts": counts,
        "coverage": {
            "fromYear": min(years) if years else None,
            "toYear": max(years) if years else None,
            "representedYears": len(years),
            "years": [{"year": year, "count": years[year]} for year in sorted(years)],
        },
        "collections": collections,
        "data": data,
    }


def write_readme(path, manifest):
    """Record dataset-specific reuse evidence alongside the derived pack."""
    counts = manifest["counts"]
    text = f"""# 공식 자료 연표 데이터

교육부 국사편찬위원회가 공공데이터포털에 공개한 **한국역사자료 메타데이터 정보_연표**(데이터셋 15051036)의 NIKH 개별 기록 {manifest['recordCount']:,}건을 담았다. 제공기관의 날짜·제목·초록·문헌 표기를 보존한 자료 연표이며, 모든 사건을 독립적으로 재검증했다는 뜻은 아니다.

- 데이터셋: {LANDING_URL}
- 제공기관: 교육부 국사편찬위원회
- 원본 SHA-256: `{manifest['sourceSha256']}`
- 추출 기준일: `{manifest['retrievedAt']}`
- 원본 CSV {counts['sourceRows']:,}행 중 외부 전문센터 {counts['excluded']['externalCenter']:,}행과 날짜 없는 목차 {counts['excluded']['nonEventHeading']:,}행을 제외했다. 동일 ID 중복 {counts['duplicateIds']:,}건을 제거했다. 같은 해의 서로 다른 기록은 모두 보존했다.

## 재사용 조건

이 **특정 CSV 데이터셋**의 상세 페이지는 `공공저작물 : 출처표시 (제 1유형)`과 별도의 `인공지능 학습용` 배지를 명시한다. JSON-LD와 다운로드 메타데이터에는 `공공저작물 : 출처표시 (제 1유형)(인공지능 학습용)`으로 함께 표기되어 있다. 제1유형 일반증서는 변경과 영리 이용을 허용하고 출처 표시를 요구한다.

- 공공누리 제1유형 일반증서: {LICENSE_URL}
- 일반증서 원문: “저작물 변경 : 2차적 저작물로 변경하여 이용 가능”, “이 저작물은 영리 목적으로 이용할 수 있습니다.”, “출처 표시 : 저작물의 출처를 표시하셔야 합니다.”
- 표시 출처: {DATASET['license']['attribution']}

원본의 CDPR·KSAC 등 외부 전문센터 자료는 개별 권리관계를 따로 확인하지 않았으므로 포함하지 않았다. 우리역사넷 ‘오늘의 역사’(15053642)와 ‘한국사 연대기’(15155532)는 별개 제4유형 자료이므로 가져오지 않았다. 웹사이트의 이미지나 별도 원문 저작물에 이 CSV의 이용허락을 확장하지 않는다.

## 파일과 필드

`manifest.json`은 실제 수록 수·분야별 수·연도별 수·원본 및 압축 파일 해시를 제공한다. `records.json.gz`는 gzip mtime=0으로 생성한 UTF-8 JSON `{{schemaVersion:1,records:[...]}}`이다. 압축을 해제한 별도 JSON과 대용량 원본 ZIP/CSV는 저장소에 넣지 않는다.

개별 기록은 `id`, `sourceRecordId`, `year`, `originalDate`, `title`, `body`, `collectionId`, `sourceUrl`, `sourceLinkType`, `originalMetadataUrl`, `calendar`, `precision`을 갖는다. `id`는 원본 통합 메타데이터 ID, `sourceRecordId`는 원래 제공기관 기사 ID다. 빈 초록을 새 문장으로 채우지 않았으며 제공 제목은 중간에 잘려 있을 수 있다. 본문은 원본 `초록` 그대로다.

`originalDate`가 날짜의 기준이다. BCE 음수 연도와 월일 미상의 `99`, 음력 `L0`, 원본에 있는 3자리 연도와 `L10`을 유지한다. `calendar=lunar`는 L 플래그가 있는 경우, `unspecified`는 역법 미표기다. 플래그 부재를 양력으로 단정하지 않는다. `precision`은 `day`, `month`, `year`, `unknown` 중 하나이며 불확실한 날짜를 1월 1일로 만들지 않는다. 파싱할 수 없는 연대나 연도 0은 `year=null`로 남긴다. 원본에 좌표가 없으므로 지도점을 만들지 않는다.

## 현재 원문 링크

2022년 메타데이터의 `url.jsp?ID=...`는 현재 일부 404를 반환한다. 현재 공식 [한국사 총설 DB](https://db.history.go.kr/diachronic/main.do)의 기사 ID와 URL 복사 기능을 대조하여 나머지 자료군은 `/id/현재기사ID`로 연결했다. 원래 URL은 `originalMetadataUrl`에 보존했다.

**근대사연표의 77,761건은 전부 정확한 개별 기사 링크 대신 공식 자료군 목록으로 연결한다.** 예를 들어 원본 `tc_md_1905_04_01_0030`에 단순 접두사 변환을 적용한 주소는 현재 관련 없는 1860년 기본 목록으로 이동한다. 해당 날짜에 다른 기사 ID가 살아 있어도 같은 기사로 간주하여 대신 연결하지 않았다. `sourceLinkType=collection`은 이 보수적인 목록 연결임을 뜻하며, 화면은 “공식 자료군에서 찾기”로 표시하고 원래 기사 ID를 함께 제공해야 한다. 나머지는 `sourceLinkType=article`이다. HTTP 200만으로 개별 원문이 존재한다고 판정하지 않는다.

기사 접두사 변환: `tc_ko_→tcko_`, `tc_ct_→tcct_`; 주제별 자료는 `ch_ad_→ch_001_`, `ch_mw_→ch_002_`, `ch_me_→ch_003_`, `ch_di_→ch_004_`, `ch_st_→ch_005_`, `ch_se_→ch_006_`, `ch_fa_→ch_007_`, `ch_nk_→ch_008_`, `ch_fo_→ch_009_`, `ch_ma_→ch_010_`, `ch_wo_→ch_011_`, `ch_wa_→ch_012_`, `ch_fr_→ch_013_`, `ch_mo_→ch_014_`, `ch_co_→ch_015_`. `okch_`는 유지한다. 근대 `tc_md_`는 앞서 설명한 자료군 목록을 사용한다.

실제 공식 목록의 46개 기사 ID(고대 20, 기상재해 20, 대한민국 5, 근대 1)를 변환한 원본 ID·제목·날짜와 대조했고, 후속 독립 검토에서 근대 일부 기사의 삭제·미노출을 발견하여 근대 전량을 목록 연결로 낮췄다. 고대·대한민국·기상재해·재외동포와 주제별 자료의 여러 연대 표본은 HTTP 상태뿐 아니라 실제 기사 ID와 제목을 확인했다. 모든 개별 원문 페이지를 다시 수집하거나 전수 링크 검증했다는 뜻은 아니다.

## 재현

Python 표준 라이브러리만 필요하다. 저장해 둔 공개 ZIP으로 재현한다.

```bash
python scripts/import-official-chronology.py --input /path/to/published.zip --output-dir dist/corpus
python -m unittest discover -s tests -p test_official_import.py -v
```

명시적으로 새 공개 파일을 받으려면 `--input` 대신 `--download`를 사용한다. 스크립트는 공개 상세 페이지에서 현재 파일 ID를 읽고 포털의 정상 `selectFileDataDownload.do` → `check-limit.json` → `fileDownload.do` 흐름을 따른다. 로그인이나 API 키는 필요하지 않다. CAPTCHA가 요구되면 중단하고 정상 웹 다운로드를 안내하며 우회하지 않는다. 현재 파일의 제1유형 표기가 없어져도 중단한다.

`--retrieved-at 2026-11-17T00:00:00Z`를 지정하면 manifest 기준일도 고정할 수 있다. 기록 JSON과 gzip 출력은 같은 원본에서 결정적이다. 큰 기록은 스트리밍으로 압축하고 압축 크기 및 SHA-256을 다시 계산한다. history.go.kr의 범용 로봇 접근 제한을 피해 원문 페이지를 대량 수집하지 않는다.
"""
    path.write_text(text, encoding="utf-8")


def import_archive(source, output_dir, retrieved_at):
    records, counts = read_archive(source)
    if not records:
        raise ValueError("No individual NIKH chronology records found")
    output_dir.mkdir(parents=True, exist_ok=True)
    data = write_pack(records, output_dir / "records.json.gz")
    manifest = build_manifest(records, counts, source, data, retrieved_at)
    (output_dir / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    write_readme(output_dir / "README.md", manifest)
    return manifest


def download_public_archive(destination):
    """Use the portal's anonymous file flow, respecting its challenge response."""
    opener = build_opener(HTTPCookieProcessor(http.cookiejar.CookieJar()))

    def get(url):
        with opener.open(url, timeout=60) as response:
            return response.read()

    def post_json(path, fields):
        with opener.open("https://www.data.go.kr" + path, urlencode(fields).encode("utf-8"), timeout=60) as response:
            return json.load(response)

    page = get(LANDING_URL).decode("utf-8")
    schemas = re.findall(r'<script[^>]+type="application/ld\+json"[^>]*>(.*?)</script>', page, re.S)
    datasets = [json.loads(schema) for schema in schemas]
    licensed = any(
        entry.get("@type") == "Dataset"
        and isinstance(entry.get("license"), dict)
        and entry["license"].get("url") == LICENSE_URL
        for entry in datasets
    )
    if not licensed:
        raise ValueError("The current dataset no longer confirms KOGL Type 1; review its license before importing")
    match = re.search(r"fn_fileDataDown\('15051036',\s*'([^']+)'", page)
    if not match:
        raise ValueError("Published file identity not found on " + LANDING_URL)
    selected = post_json("/tcs/dss/selectFileDataDownload.do", {
        "publicDataPk": "15051036", "publicDataDetailPk": match.group(1),
        "atchFileId": "", "fileDetailSn": "1", "publicDataTyCode": "PR0051",
    })
    if selected.get("status") is not True:
        raise ValueError("The public-data portal did not supply a downloadable file")
    fields = {name: selected[name] for name in ("atchFileId", "fileDetailSn")}
    limit = post_json("/cmm/cmm/check-limit.json", fields)
    if limit.get("needCaptcha") is not False:
        raise ValueError("The portal requires a CAPTCHA; download normally from " + LANDING_URL + " and rerun with --input")
    download_url = "https://www.data.go.kr/cmm/cmm/fileDownload.do?" + urlencode(fields)
    with opener.open(download_url, timeout=60) as response, destination.open("wb") as output:
        for chunk in iter(lambda: response.read(1024 * 1024), b""):
            output.write(chunk)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument("--input", type=Path, help="Previously downloaded official ZIP")
    source.add_argument("--download", action="store_true", help="Explicitly download the currently published public file")
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--retrieved-at", default=datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"))
    args = parser.parse_args()
    try:
        parsed_at = datetime.fromisoformat(args.retrieved_at.replace("Z", "+00:00"))
        if parsed_at.tzinfo is None:
            raise ValueError("retrieved-at must include a timezone")
        if args.download:
            with tempfile.TemporaryDirectory(prefix="nikh-chronology-") as temporary:
                archive = Path(temporary) / "source.zip"
                download_public_archive(archive)
                manifest = import_archive(archive, args.output_dir, args.retrieved_at)
        else:
            manifest = import_archive(args.input, args.output_dir, args.retrieved_at)
    except (ValueError, OSError, zipfile.BadZipFile, csv.Error) as error:
        parser.exit(1, str(error) + "\n")
    print(json.dumps({"recordCount": manifest["recordCount"], "data": manifest["data"], "sourceSha256": manifest["sourceSha256"]}, ensure_ascii=False))


if __name__ == "__main__":
    main()
