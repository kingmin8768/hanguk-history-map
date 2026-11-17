# Main Record Navigation Plan

**Goal:** Make the official corpus directly browsable in the main atlas player.

**Spec:** ../specs/2026-11-17-main-record-navigation.md

## Tasks
- [x] Add precise filtered record location to the corpus index/client/worker and a cached asynchronous browser controller.
- [x] Share record presentation rules with a main-panel renderer and expose explorer-to-main record actions.
- [x] Integrate default record mode, mode-aware controls, filters, numbering, playback and URL restoration.
- [x] Style both modes across desktop/mobile; independently review integration and temporal correctness.
- [x] Run all tests/build checks.

## Verification
- Node: 131 tests passed; Python import tests: 8 passed.
- Syntax, static build and diff whitespace checks passed.
- Full 212,574-record main integration: first/last selection, distinct same-year records, 21,281 filtered independence records, zero unverified pins.
- Independent review: four reproduced navigation/URL issues fixed and covered by regression tests.
- Browser QA unavailable: managed preview relay failed to open port 4173.

Publication follows the verified source commit to GitHub main and the existing owner-private Site, preserving its audience.
