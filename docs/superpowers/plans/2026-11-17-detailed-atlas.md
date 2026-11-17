# Detailed Atlas Implementation Plan

> **For agentic workers:** Use bounded independent content modules; the primary agent integrates and verifies the resulting experience.

**Goal:** Expand the atlas into a substantial, sourced Korean history reader and spatial explorer.

**Architecture:** Keep static ES modules and locally bundled geography. Compose independently researched epoch modules through data.js, then expose a catalogue model and accessible explorer UI.

**Tech Stack:** HTML/CSS/JavaScript, Node test runner, LinkeDOM.

**Spec:** ../specs/2026-11-17-detailed-atlas.md

## Global Constraints
- Preserve existing snapshot IDs and source obligations.
- No unsupported boundaries, precise ancient locations, invented routes or unsourced historical claims.
- Keep removed optional reference wording out of all new tracked content.
- Every content link resolves to a source/entity in the assembled corpus.

## Review Focus
- Original 20 URLs continue to select the intended snapshot.
- Expanded search returns era labels, people, polities and section text.
- Filters compose and zero matches have a useful visible state.
- Closing explorer and returning from a route never leaves a stale map overlay.
- BCE dates, duplicate city entries and sources are deduplicated without losing distinct events.

## Tasks
- [x] 1. Ancient/medieval/Joseon/modern modules: verify official documents, author sections and entity entries, validate module contracts.
- [x] 2. Data assembly: preserve legacy sources/IDs while adding enriched snapshots and new era rail. Validate all links and dates.
- [x] 3. Explorer model and UI: filtered chronology, political profiles, biographies and activities, city histories, integrated search and scene links. Write meaningful tests before behavior changes.
- [x] 4. Integrate detailed scene reading and map route overlay with responsive styling, keyboard/focus behavior and failure handling.
- [x] 5. Whole-corpus checks, independent factual and functional review, appropriate preview checks, README updates, GitHub push and private Site deployment.

## Verification record

- Final corpus: 130 scenes (-194 to 2024), 308 event items, 264 scene sections, 58 biographies, 26 political/period profiles, 195 deduplicated official source documents, 69 city/site groups.
- All 61 tests, module syntax checks, static asset/import checks and whitespace checks passed.
- Independent functional review found figure-stop drag capture and event-search visibility/date issues; regression tests reproduced and verified fixes.
- Independent historical spot review found a 905 Naju polity anachronism; the epoch author corrected it with a regression test. Post-1356 Ssangseong labeling and the modern museum point in 1861 were also corrected.
- Review was targeted; it is not a claim of exhaustive expert assessment of every historical sentence or coordinate.
- Managed preview relay failed to open port 4173. Browser, touchscreen and screen-reader verification remain unavailable; no replacement browser infrastructure was installed.
