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

### Exp 2 (2026-11-15 02:21) — Strip Unused `verifiedRelationships` Bloat & Expose Funding Scalars
- **Goal:** Remove unused `verifiedRelationships` array (`42.9 KB`) from `summarizeLiveCalaEntity` and expose `fundingStage`, `totalFunding`, and `totalFundingUnits` on `identity`.
- **Files:** `server.mjs`
- **Before -> After:**
  - `GET /api/entity-dossier` payload: `314,303 B` -> **`271,404 B`** (`-42.9 KB`; `-43.1%` vs initial `476,999 B`)
  - `POST /api/analyze` payload: `277,705 B` -> **`235,168 B`** (`-42.5 KB`, `-15.3%`)
  - `GET /api/entity-dossier` UUID latency: `6.63 ms` -> **`5.57 ms`**
  - `npm test`: `47/47` passing (`11,556.6 ms`)
- **Decision:** KEEP

### Exp 3 (2026-11-15 02:24) — Transparent Link/Connection Display & Citation Deduplication
- **Goal:** Fix duplicate `sourceIds` / `evidenceSources` truncation collisions in `registerEntityMapSource`, format generic URL/title citations cleanly, and surface 1-hop vs 2-hop (`FundingRound`) path provenance, raw Cala relation direction, deal context, and unindexed Cala data gaps in hover tooltips & Connection Inspector.
- **Files:** `src/engine.mjs`, `public/app.js`, `public/styles.css`
- **Before -> After:**
  - Duplicate source IDs from 64-char prefix collisions: eliminated via normalized URL dedup + `-i` index outside `.slice(0, 58)`
  - Connection transparency: hover tooltips & Connection Inspector now expose `1-hop Direct` vs `2-hop FundingRound`, raw relation (`INVESTED_IN`, etc.), deduplicated unique citations + record IDs, and explicit `Unindexed in Cala` gaps
  - `npm test`: `47/47` passing (`11,299.0 ms`)
- **Decision:** KEEP

### Exp 4 (2026-11-15 02:26) — Company Dossier UI Organization, Tab Counts & Table/Timeline Bug Fixes
- **Goal:** Fix repeated `"Not found in Cala"` clutter in `People` & `Funding` tables, fix `Timeline` sorting (`""` sorting ahead of dates), guard `openEntityDossier` against stale async responses, reset modal scroll on tab change, add live tab counts on all 5 detail tabs, and organize `Overview` (KPI strip + alias chips + Top Verified Connections) & `Connections` (2-col Decision Group cards).
- **Files:** `public/app.js`, `public/styles.css`
- **Before -> After:**
  - Table noise: replaced repeated `Not found in Cala` cells with clean `-` + single footer disclosure; deduplicated `investors` & `portfolio` lists
  - Timeline ordering bug: split `Dated Milestones` (newest-first) from `Undated Cala Relationships`
  - Tab discovery: live count badges (`People (N)`, `Funding (N)`, `Connections (N)`, `Timeline (N)`, `Sources & Gaps (N)`) + clickable KPI jump cards
  - Stale async modal race: guarded with monotonic `state.dossierRequestSeq`
  - `npm test`: `47/47` passing (`11,822.4 ms`), `0` UI invariant violations
- **Decision:** KEEP

### Exp 5 (2026-11-15 02:28) — Optional Citation-Gated Claude AI Connection & Entity Diligence Insights
- **Goal:** Wire on-demand Claude AI analysis (`analyzeConnectionWithCitationGate` + `POST /api/connection-insight`) into Connection Inspector and Entity Dossier `Overview` with strict sourceId/year/currency gating and instant LRU caching + deterministic fallback.
- **Files:** `src/llmControlPlane.mjs`, `server.mjs`, `public/app.js`, `public/styles.css`, `test/llmControlPlane.test.mjs`
- **Before -> After:**
  - Hover latency impact: `0 ms` (runs on demand only inside inspector/dossier; zero hover token spend)
  - Grounding gate: `filterVerifiedBullets` drops ungrounded insights/years/currency amounts; supports both `SOURCES` registry and dynamic Cala dossier citations
  - `npm test`: `48/48` passing (`11,218.7 ms`)
- **Decision:** KEEP


### Exp 6: Strip duplicated per-edge `sources` from dossier relationships & tune Claude analyst timeout
- **Files:** `server.mjs`, `src/llmControlPlane.mjs`
- **Hypothesis:** `normalizeRawRelationshipGroups` repeated `(target.properties?.sources || []).slice(0, 3)` on every relationship row (`57,218 B`), duplicating records already collected into `dossier.sources`; meanwhile `analyzeConnectionWithCitationGate` used `timeoutMs: 2800`, causing real Anthropic calls (`~1.5-2.9s`) to occasionally abort and fall back.
- **Changes:** Removed redundant `.sources` array from `normalizeRawRelationshipGroups` items (preserving `sourceId` and `sourceTier`, while `collectDossierSources` continues to include all relationship sources in `dossier.sources`). Raised `analyzeConnectionWithCitationGate` `timeoutMs` default from `2800` to `6000`.
- **Measurements:**
  - `GET /api/entity-dossier?ref=company:Anthropic`: `271,404 B -> 177,486 B` (`-34.6%`, `-62.8%` vs `476,999 B` baseline), `6.79ms` median.
  - Live `POST /api/connection-insight`: cold Claude API call `200 OK` in `1745.1ms` (`controlPlaneMode: "anthropic-connection-analyst"`), cached repeat `4.80ms` (`fromCache: true`).
  - `npm test`: `48/48` pass (`12,065.3ms`).
- **Decision:** KEEP


### Exp 7: Frontend async search race guard & dossier keyboard tab navigation
- **Files:** `public/app.js`
- **Hypothesis:** Rapid consecutive submissions in `handleEntitySearchSubmit` could resolve out of order after `await resolveQueryTermsToEntities()`, and `[data-dossier-tab]` tabs lacked `ArrowLeft`/`ArrowRight` keyboard switching.
- **Changes:** Added `state.searchSubmitSeq` monotonic guard inside `handleEntitySearchSubmit`, and added `ArrowLeft`/`ArrowRight` keyboard tab switching + focus management in `bindDossierEvents`.
- **Measurements:** `node --check public/app.js` clean, `0` UI invariant violations (`<details>`, em-dash, green tokens), `npm test`: `48/48` pass (`12,867.1ms`).
- **Decision:** KEEP