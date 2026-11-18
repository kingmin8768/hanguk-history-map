"""Behavior tests for preserving the published NIKH chronology records."""

import csv
import gzip
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
import zipfile


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts" / "import-official-chronology.py"


def source_row(source_id="tc_ct_1945_08_15_0010", **changes):
    row = {
        "통합메타데이터 ID": "KH.NIKH." + source_id,
        "전문센터ID": "NIKH",
        "전문센터 메타데이터": source_id,
        "DB정보": "대한민국사연표",
        "제목": "8·15 光復.",
        "초록": "8·15 光復.\n원문에 있는 두 번째 줄, 문헌 표기.",
        "사건발생일": "1945-08-15",
        "연계주소": "<url><get>http://db.history.go.kr/url.jsp?ID=" + source_id + "</get></url>",
        "기사레벨": "2",
    }
    row.update(changes)
    return row


def write_archive(path, rows):
    stream = io.StringIO(newline="")
    writer = csv.DictWriter(stream, fieldnames=list(source_row()))
    writer.writeheader()
    writer.writerows(rows)
    with zipfile.ZipFile(path, "w") as archive:
        archive.writestr("연표.csv", "\ufeff" + stream.getvalue())
        archive.writestr("컬럼정의서.xls", b"not a data file")


class OfficialImportTests(unittest.TestCase):
    def setUp(self):
        self.assertTrue(SCRIPT.exists(), "The reproducible chronology importer is not implemented")
        spec = importlib.util.spec_from_file_location("official_import", SCRIPT)
        self.module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(self.module)

    def test_dates_preserve_bce_unknown_components_and_unpadded_lunar_year(self):
        # Catches treating 99 as a real date, assuming solar dates, and rejecting 782/L10.
        cases = [
            ("1945-08-15", {"year": 1945, "calendar": "unspecified", "precision": "day"}),
            ("1860-02-99L0", {"year": 1860, "calendar": "lunar", "precision": "month"}),
            ("-2333-99-99L0", {"year": -2333, "calendar": "lunar", "precision": "year"}),
            ("782-01-99L10", {"year": 782, "calendar": "lunar", "precision": "month"}),
            ("1392~1393", {"year": None, "calendar": "unspecified", "precision": "unknown"}),
            ("1392~1393L0", {"year": None, "calendar": "lunar", "precision": "unknown"}),
            ("0000-01-01", {"year": None, "calendar": "unspecified", "precision": "unknown"}),
            ("1945-13-01", {"year": 1945, "calendar": "unspecified", "precision": "year"}),
        ]
        for original, expected in cases:
            with self.subTest(original=original):
                self.assertEqual(self.module.parse_date(original), expected)

    def test_normalization_preserves_source_text_and_current_article_links(self):
        # Catches truncating/rephrasing the abstract or emitting dead 2022 links.
        row = source_row()
        records, counts = self.module.normalize_rows([row])
        self.assertEqual(len(records), 1)
        record = records[0]
        self.assertEqual(record["id"], "KH.NIKH.tc_ct_1945_08_15_0010")
        self.assertEqual(record["sourceRecordId"], "tc_ct_1945_08_15_0010")
        self.assertEqual(record["title"], "8·15 光復.")
        self.assertEqual(record["body"], "8·15 光復.\n원문에 있는 두 번째 줄, 문헌 표기.")
        self.assertEqual(record["originalDate"], "1945-08-15")
        self.assertEqual(record["collectionId"], "tcct")
        self.assertEqual(record["sourceUrl"], "https://db.history.go.kr/id/tcct_1945_08_15_0010")
        self.assertEqual(record["originalMetadataUrl"], "http://db.history.go.kr/url.jsp?ID=tc_ct_1945_08_15_0010")
        self.assertEqual(counts["included"], 1)

    def test_external_centers_and_undated_headings_are_excluded(self):
        # Catches counting external rights holders or a chapter title as an event.
        external = source_row("pry_1869_1", **{
            "전문센터ID": "CDPR", "통합메타데이터 ID": "KH.CDPR.pry_1869_1",
        })
        heading = source_row("okch_001", **{"사건발생일": "", "기사레벨": "1", "제목": "간행사"})
        records, counts = self.module.normalize_rows([external, heading, source_row()])
        self.assertEqual([record["id"] for record in records], ["KH.NIKH.tc_ct_1945_08_15_0010"])
        self.assertEqual(counts["sourceRows"], 3)
        self.assertEqual(counts["excluded"]["externalCenter"], 1)
        self.assertEqual(counts["excluded"]["nonEventHeading"], 1)

    def test_identical_ids_are_deduplicated_but_conflicting_source_records_fail(self):
        # Catches silently replacing a provider record with another record sharing its ID.
        records, counts = self.module.normalize_rows([source_row(), source_row()])
        self.assertEqual(len(records), 1)
        self.assertEqual(counts["duplicateIds"], 1)
        with self.assertRaisesRegex(ValueError, "[Cc]onflict"):
            self.module.normalize_rows([source_row(), source_row(**{"초록": "다른 문장"})])

    def test_inconsistent_provider_identity_and_nonofficial_urls_fail(self):
        # Catches accepting mislabeled sources or unsafe source URLs as NIKH records.
        with self.assertRaisesRegex(ValueError, "[Ii]dentity"):
            self.module.normalize_rows([source_row(**{"통합메타데이터 ID": "KH.CDPR.other"})])
        with self.assertRaisesRegex(ValueError, "[Ss]ource URL"):
            self.module.normalize_rows([source_row(**{"연계주소": "<url><get>https://example.com/fake</get></url>"})])

    def test_modern_records_use_collection_fallback_when_old_articles_may_be_missing(self):
        # This published 1905 ID now redirects to an unrelated 1860 default list.
        # A syntactically plausible article URL must not be presented as its exact source.
        records, _ = self.module.normalize_rows([source_row("tc_md_1905_04_01_0030", **{
            "DB정보": "근대사연표", "사건발생일": "1905-04-01", "제목": "일본과의 통신기관 위탁에 관한 협정서 조인으로 통신원의",
        })])
        record = records[0]
        self.assertEqual(record["sourceUrl"], "https://db.history.go.kr/diachronic/level.do?itemId=tcmd")
        self.assertEqual(record["sourceLinkType"], "collection")
        self.assertEqual(record["sourceRecordId"], "tc_md_1905_04_01_0030")
        self.assertEqual(record["originalMetadataUrl"], "http://db.history.go.kr/url.jsp?ID=tc_md_1905_04_01_0030")
        # The entire collection uses the same honest fallback, including known live IDs.
        records, _ = self.module.normalize_rows([source_row("tc_md_1860_02_99_0010", **{
            "DB정보": "근대사연표", "사건발생일": "1860-02-99L0",
        })])
        self.assertEqual(records[0]["sourceLinkType"], "collection")
        self.assertEqual(records[0]["sourceUrl"], "https://db.history.go.kr/diachronic/level.do?itemId=tcmd")

    def test_ancient_topic_and_diaspora_ids_map_to_observed_current_routes(self):
        # Catches changing only the Republic IDs while leaving other chronology links broken.
        fixtures = [
            ("tc_ko_0001_01_99_0010", "고대사연표", "0001-01-99L0", "tcko", "tcko_0001_01_99_0010"),
            ("tc_ko_-0001_08_99_0010", "고대사연표", "-0001-08-99", "tcko", "tcko_-0001_08_99_0010"),
            ("ch_di_0002_02_09_0010", "주제별연표_ch_di", "0002-02-09L0", "ch_004", "ch_004_0002_02_09_0010"),
            ("okch_001_0020", "재외동포사연표", "1864-09-21", "okch", "okch_001_0020"),
        ]
        for source_id, label, date, collection, current_id in fixtures:
            with self.subTest(source_id=source_id):
                records, _ = self.module.normalize_rows([source_row(source_id, **{"DB정보": label, "사건발생일": date, "초록": ""})])
                self.assertEqual(records[0]["collectionId"], collection)
                self.assertEqual(records[0]["sourceUrl"], "https://db.history.go.kr/id/" + current_id)
                self.assertEqual(records[0]["body"], "")

    def test_first_page_sorts_numeric_years_stably_and_keeps_unknown_years_last(self):
        # Catches lexicographic years, ID-based tie breaking, and treating zero as a year.
        self.assertTrue(callable(getattr(self.module, "write_first_page", None)),
                        "The importer does not emit the lightweight first page")
        records = [
            {"id": "unknown-first", "year": None, "body": "원문"},
            {"id": "ten", "year": 10},
            {"id": "two-z", "year": 2},
            {"id": "zero", "year": 0},
            {"id": "bce", "year": -2333},
            {"id": "two-a", "year": 2},
            {"id": "string-year", "year": "1"},
            {"id": "fraction", "year": 1.5},
            {"id": "boolean", "year": True},
        ]
        original = [dict(record) for record in records]
        with tempfile.TemporaryDirectory() as temporary:
            output = Path(temporary) / "first-page.json"
            metadata = self.module.write_first_page(records, output)
            binary = output.read_bytes()
            document = json.loads(binary)
            self.assertEqual(document["schemaVersion"], 1)
            self.assertEqual([record["id"] for record in document["records"]], [
                "bce", "two-z", "two-a", "ten", "unknown-first", "zero",
                "string-year", "fraction", "boolean",
            ])
            self.assertEqual(document["records"][4]["body"], "원문")
            self.assertEqual(metadata, {
                "path": "first-page.json", "sha256": hashlib.sha256(binary).hexdigest(),
                "byteLength": len(binary), "limit": 50,
            })
        self.assertEqual(records, original)

    def test_first_page_caps_default_results_at_fifty_records(self):
        # Catches accidentally making startup fetch the entire collection again.
        self.assertTrue(callable(getattr(self.module, "write_first_page", None)),
                        "The importer does not emit the lightweight first page")
        records = [{"id": str(index), "year": 100} for index in range(53)]
        with tempfile.TemporaryDirectory() as temporary:
            output = Path(temporary) / "first-page.json"
            self.module.write_first_page(records, output)
            self.assertEqual(json.loads(output.read_bytes())["records"], records[:50])

    def test_archive_cli_emits_verified_deterministic_gzip_and_counts(self):
        # Exercises the actual importer against quoted/multiline CSV, the artifact and its manifest.
        with tempfile.TemporaryDirectory() as temporary:
            temporary = Path(temporary)
            archive = temporary / "source.zip"
            rows = [source_row(), source_row("tc_ko_2333a_99_99_0010", **{
                "DB정보": "고대사연표", "사건발생일": "-2333-99-99L0", "제목": "제공 제목", "초록": "전승 표기를 보존한다.",
            })]
            write_archive(archive, rows)
            output = temporary / "out"
            command = [sys.executable, str(SCRIPT), "--input", str(archive), "--output-dir", str(output), "--retrieved-at", "2026-11-17T00:00:00Z"]
            first = subprocess.run(command, text=True, capture_output=True)
            self.assertEqual(first.returncode, 0, first.stderr)
            binary = (output / "records.json.gz").read_bytes()
            payload = gzip.decompress(binary)
            document = json.loads(payload)
            manifest = json.loads((output / "manifest.json").read_text())
            self.assertEqual(document["schemaVersion"], 1)
            self.assertEqual(len(document["records"]), 2)
            self.assertEqual(manifest["recordCount"], 2)
            self.assertEqual(manifest["coverage"]["fromYear"], -2333)
            self.assertEqual(manifest["coverage"]["toYear"], 1945)
            self.assertEqual(manifest["data"], {
                "path": "records.json.gz", "compression": "gzip",
                "sha256": hashlib.sha256(binary).hexdigest(), "byteLength": len(binary),
                "uncompressedByteLength": len(payload),
            })
            self.assertEqual(manifest["sourceSha256"], hashlib.sha256(archive.read_bytes()).hexdigest())
            self.assertEqual(manifest["dataset"]["id"], "15051036")
            self.assertEqual(manifest["counts"]["calendar"], {"lunar": 1, "unspecified": 1})
            self.assertFalse((output / "records.json").exists())
            self.assertIn("firstPage", manifest)
            first_page = (output / "first-page.json").read_bytes()
            self.assertEqual(json.loads(first_page), document)
            self.assertEqual(manifest["firstPage"], {
                "path": "first-page.json", "sha256": hashlib.sha256(first_page).hexdigest(),
                "byteLength": len(first_page), "limit": 50,
            })
            second = subprocess.run(command, text=True, capture_output=True)
            self.assertEqual(second.returncode, 0, second.stderr)
            self.assertEqual(binary, (output / "records.json.gz").read_bytes())
            self.assertEqual(first_page, (output / "first-page.json").read_bytes())


if __name__ == "__main__":
    unittest.main()
