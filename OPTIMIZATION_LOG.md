# Overnight Optimization Log · Revealed Thesis Engine

- **Branch:** `overnight/2026-11-15` (from `main` via baseline checkpoint `7a59bea`)
- **Start Time:** 2026-11-15 02:14 (+02:00)
- **Time Budget:** 6 hours | **Max Experiments:** 40
- **Off-Limits:** `.env` / secrets, `main` branch, external deployment / remote push, destructive data deletion
- **Goal Metrics:**
  1. Correctness & UI quality: `npm test` passes (100%), `node --check` passes, `0` UI invariant violations (`<details>`, em-dashes, green hex/rgba, `pts`/`Formula:`), `0` console/page/HTTP >=400 errors in Chrome (`1440x900` & `390x844`).
  2. Performance & Payload: `/api/entity-dossier` median latency, `/api/analyze` latency & payload size, `/api/search` latency, `npm test` median duration, asset byte sizes.
  3. Product Quality: Connection link data transparency (1-hop vs 2-hop provenance, deal economics, full co-investor breakdown, graph-record provenance, explicit missing fields), Company Dossier UI organization & bug fixes, and optional citation-gated Claude AI connection/entity insights.

## Baseline Measurements (3 runs, median)

| Metric | Run 1 | Run 2 | Run 3 | Median | Notes |
| --- | --- | --- | --- | --- | --- |
| `npm test` (47 tests) | 13,855.8 ms | 11,084.0 ms | 11,888.7 ms | **11,888.7 ms** | 47/47 pass |
| `GET /api/search?q=Anthropic` | 2.05 ms | 0.89 ms | 0.99 ms | **0.99 ms** | Cached Cala |
| `POST /api/analyze` (Anthropic + OpenAI) | 28.58 ms | 15.76 ms | 15.26 ms | **15.76 ms** | 277,705 bytes (32 nodes, 71 edges) |
| `GET /api/entity-dossier?ref=company:Anthropic` | 180.74 ms | 78.80 ms | 89.73 ms | **89.73 ms** | Bottleneck to profile |
| Asset Sizes | — | — | — | `app.js` 177,673 B · `styles.css` 177,239 B · `engine.mjs` 336,747 B | `anthropicConfigured: true` |

## Ranked Backlog

1. **[Perf + Bug] Profile & optimize `/api/entity-dossier` (`89.73 ms` median) and `/api/analyze` payload (`277,705 B`)** — High gain, low risk.
2. **[Feature + UX] Transparent Link/Connection Display (Hover Tooltip + Connection Inspector)** — High gain, medium risk: clearly separate 1-hop vs 2-hop provenance, raw verified Cala relation, deal economics, full syndicate & bridge breakdown, graph-record provenance IDs, and explicit missing-field gaps.
3. **[UI Bug + Organization] Fix Company Dossier Tables, Timeline Sorting & Tab Counts** — High gain, low risk: remove repeated `"Not found in Cala"` clutter in table cells, add count badges to all 6 tabs, sort Timeline ISO dates cleanly with undated items grouped separately.
4. **[UX + Organization] Reorganize Company Dossier `Overview` & `Connections` Tabs** — High gain, medium risk: add Key Signals / Quick Metrics strip, clickable alias chips, structured lens-grouped Connection cards, and smooth drilldown.
5. **[AI Layer] Optional Citation-Gated Claude AI Connection & Entity Insights (`src/llmControlPlane.mjs` + `/api/connection-insight`)** — High gain, medium risk: add lazy on-demand AI synthesis inside Connection Inspector & Company Dossier backed strictly by verified Cala source IDs + numeric/citation gate, cached per edge/entity, with instant deterministic fallback.
6. **[Frontend Bugs] Race-condition, Accessibility, Pan/Zoom & Light-Theme Audit** — High gain, low risk: guard stale async `openEntityDossier` / search races, focus management, keyboard navigation, and light-theme contrast.
7. **[QA] Expand automated tests & full end-to-end Chrome verification (`1440x900` & `390x844`, dark + light themes)** — Required final verification.

## Experiment Log

### Exp 1 (2026-11-15 02:20) — Backend Dossier Name Resolution & Payload Bloat Removal
- **Goal:** Eliminate 404/85.8ms wasted Cala lookup on name-based `/api/entity-dossier?ref=company:<name>` requests, drop unused `rawRelationships` duplicate payload (`165 KB`), and add hydrated graph fallback for `rounds`.
- **Files:** `server.mjs`
- **Before -> After:**
  - `GET /api/entity-dossier?ref=company:Anthropic`: `404 (85.79 ms)` -> **`200 OK (6.09 ms median)`** (`14.1x` faster)
  - `GET /api/entity-dossier` (UUID + activeRef) payload size: `476,999 B` -> **`314,303 B`** (`-162.7 KB`, **`-34.1%`**)
  - `npm test`: `47/47` passing
- **Decision:** KEEP
