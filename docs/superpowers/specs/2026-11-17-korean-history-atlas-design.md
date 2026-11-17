# 한국사 시공간 지도

## Intent
Build a Korean history atlas with a full-screen geographic map, chronology sidebar, selectable eras and playable time rail. Korean is the primary language. This document records implementation choices by the builder; the user requested Korean history exploration and a new repository under kingmin8768.

## Approach
Use an original buildless HTML/CSS/JavaScript implementation, with a locally bundled Natural Earth public-domain coastline. All application code is written for this project. Bundled geographic assets keep the main map independent of a live tile service.

## Historical integrity
Each snapshot contains individually sourced events and places. All explanations are paraphrased. Dates before the common era have no year zero. Ancient foundation traditions must be distinguished from historical evidence. Capitals and event locations are approximate geographic points and must carry uncertainty notes where applicable. No invented ancient territorial polygons. The map visibly says it shows capitals and events, not reconstructed borders. Modern coastlines are reference geography, not historical sovereignty claims. The timeline advances through documented snapshots, not fabricated yearly states.

## Experience
Warm parchment, muted sage water, ink typography and a vermilion accent. Header with brand, search, sources and theme. Main SVG map with zoom/pan/reset, interactive place markers and water labels. Right sidebar with selected-era summary, places, events, primary source links. Bottom time rail with era tabs, year selection, previous/next, playback, and snapshot slider. Responsive layout supports small screens, keyboard controls and reduced motion. Search covers events, eras and historical/modern place names. URL hashes restore snapshots. Sources dialog explains methodology and data limitations.

## Delivery
All source in /workspace/hanguk-history-map. Node's built-in test runner validates chronology, temporal selection, search and data integrity. Static build is a checked-in dist directory, usable with any static host. New GitHub repository should be private by default. Current GitHub app token cannot create repositories; preserve finished local work and report that blocker accurately if no permitted creation route is available. Browser startup also currently fails at the environment level.
