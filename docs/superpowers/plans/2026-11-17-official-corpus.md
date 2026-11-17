# Official Corpus Implementation Plan

**Goal:** Add a large, licensed, source-linked chronology collection while preserving authored map readings.

**Architecture:** Reproducible CSV normalization, compressed static corpus, worker-backed search, paginated explorer and explicit corpus provenance.

**Spec:** ../specs/2026-11-17-official-corpus.md

## Tasks
- [x] Verify source license, public download and current original-link mappings.
- [x] Build deterministic importer and corpus manifest/data with meaningful normalization tests.
- [x] Build lazy corpus store/search worker and paginated UI with fixture tests.
- [x] Connect prominent corpus entry points and honest counts to the existing app.
- [x] Independently sample facts/links/dates, run complete checks, document limits, push and publish.

## Review focus
- Unknown lunar/month/day data does not acquire invented precision.
- Source IDs are stable and same-year records remain distinct.
- Late-page and uncommon query matches remain accessible.
- Initial map load does not parse or render the complete corpus.
- Errors and out-of-order searches cannot replace current results or leave a loading dead end.

## Verification record

- Imported 212,574 NIKH metadata records from 215,536 source rows; excluded 2,942 external-center records and 20 headings. There are 19 collections. Counts describe records, not distinct historical events.
- Independently compared all imported IDs, titles, abstracts, original dates and original metadata URLs with the source CSV: no differences. Source and deployed gzip digests are in the manifest.
- Current compressed data: 15,495,159 bytes, SHA-256 f21fcdc5ffe4ca6e48a11c1ce58bd5af0a419a11a0ba0bf1990c211db80ce3e9.
- The current service no longer exposes some old modern-history article IDs. All 77,761 modern-history records use an explicit official collection fallback rather than silently substituting a different article. Other current-ID mappings were sampled, not exhaustively visited.
- Preserved source date anomalies and classified/traditional dates. UI distinguishes original metadata dating from confirmed occurrence dates, including BCE2333 and month17.
- Independent UI review identified lost unsupported-browser errors; fixture tests reproduced and verified specific support guidance and preserved temporary-error retry.
- Node tests: 99 passed. Python importer tests: 8 passed. Syntax, static build, runtime import/assets and whitespace checks passed.
- Large corpus is loaded only on query in a dedicated Worker; full record DOM is never mounted. Prototype Worker benchmarks showed substantial memory use during decompression/parsing, so these results do not establish low-memory mobile support.
- Managed preview relay failed opening port4173. Native browser rendering, mobile memory and touchscreen verification remain unavailable.
