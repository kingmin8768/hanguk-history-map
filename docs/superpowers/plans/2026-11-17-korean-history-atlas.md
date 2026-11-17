# Korean History Atlas Implementation Plan

> **For agentic workers:** Use the accompanying design and bounded file ownership. Research and assets may run independently; integration remains with the primary agent.

**Goal:** Ship a source-backed Korean history atlas with interactive map and timeline exploration.

**Architecture:** Buildless ES modules. Data is separate from temporal/search helpers, SVG rendering and DOM interaction. A locally bundled geographic base avoids live tile dependencies.

**Tech Stack:** HTML, CSS, JavaScript, Node test runner, Natural Earth GeoJSON.

**Spec:** ../specs/2026-11-17-korean-history-atlas-design.md

## Global Constraints
- Korean-language UI, documented snapshots, source links per event.
- No fabricated territorial borders, no year zero, no copied restricted map data.
- All main map assets bundled locally. No secret or API key needed.
- Responsive and keyboard-accessible controls.

## Review Focus
- BCE/CE input and between-snapshot years must resolve explicitly, with no invented annual state.
- Switching snapshots must clear stale place selection.
- Search aliases and empty results must be useful.
- Playback must stop at the last snapshot and on manual navigation.
- Map loading failure must leave chronology and source links usable.

## Tasks
- [x] 1. Source corpus: collect official sources and create `dist/data.js`, preserving uncertainty notes. Validate source, coordinate and chronology integrity with `tests/data.test.js`.
- [x] 2. Temporal model: write failing `tests/model.test.js`, then implement `dist/model.js` exports `formatYear`, `getSnapshotForYear`, `searchAtlas`, `project`, `unproject`. Run `npm test`.
- [x] 3. Map and UI: create `dist/index.html`, `dist/app.js`, `dist/styles.css` and local `dist/assets/land.geojson`. Implement controls, source dialog, history hash, search, map pan/zoom and accessible markers. Reference-only coastlines.
- [x] 4. Verify: run complete test suite, static syntax and asset checks; use managed preview if available; independent code/data review. Resolve material defects.
- [x] 5. Package: README, license/attribution, reproduction scripts and clean commits. Attempt requested GitHub delivery only through authorized available capabilities. Report unavailable infrastructure precisely.

## Verification and delivery record

- 18 Node tests passed, including documented-era lookup, Shanghai framing, overlapping-marker callouts, final-snapshot playback, and offline chronology.
- Independent review identified five material issues; framing, marker overlap, Korean era search, text contrast and the home hash were corrected.
- Managed preview source compatibility repaired by serving the static directory; relay startup remains unavailable. CUA browser startup fails before any page is opened. Browser rendering/touch/screen-reader QA remain unverified.
- GitHub new repository creation failed through GraphQL and REST with integration permission errors. No GitHub repository was created. Local work is preserved for push after an empty target repository is available.
- Private Sites project: appgprj_6afc248cc02c81919154934bc6b07345.
