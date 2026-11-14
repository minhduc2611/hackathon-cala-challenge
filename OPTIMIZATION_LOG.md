# Overnight Optimizer Log · Revealed Thesis Engine

## Summary & Configuration
- **Branch:** `overnight/2026-11-14` (merged to `main`)
- **Start Time:** `2026-11-14T07:59:35+02:00`
- **End Time:** `2026-11-14T08:14:00+02:00`
- **Goal Metric:**
  1. All 12 automated tests pass (`12/12`), `0` console/network errors, `0` UI hygiene violations (`0` em-dashes, `0` `transition: all`, `0` `border-radius: 999px`).
  2. UX & Layout Simplification Score:
     - **0** step tabs in the top bar (all top-bar steps removed; `Analyst / Investor` + benchmark + views consolidated into **1 single option button** `#optionsMenuBtn`).
     - **True 100vh full-screen 3-step setup (`body.is-onboarding`)** with no upper tab (`#dashboardMasthead` hidden): Step 1 (How it works & Cala data reliability), Step 2 (Choose role), Step 3 (Investor mandate, seen companies, benchmark & scoring config).
     - **Floating rounded AI search bar (`68px` height, `border-radius: 22px`, `0` card/tab container behind it)** with embedded rounded `Search` button (`#aiSearchSubmitBtn`) and collapsible filter drawer (`#collapsibleFilterStrip`).
  3. Asset payload & render efficiency (`144,763` bytes total across `index.html`, `styles.css`, `app.js`; test suite latency improved from `118.3ms` -> `111.6ms`).
- **Off-limits:** `.env`, `.cache/cala-cache.json`, live Cala API credits (`8/8` preserved), external dependencies.

### Baseline vs. Final Metrics

| Metric | Baseline (`fe763e1`) | Final (`overnight/2026-11-14`) | Status |
| :--- | :--- | :--- | :--- |
| Automated Test Suite | `12/12` (`118.3ms`) | `12/12` (`111.6ms`) | Improved (`-5.7%` runtime) |
| Top-Bar Step Tabs Count | `4` tabs visible | `0` tabs (removed; 1 option button `#optionsMenuBtn`) | Target Met |
| Onboarding Upper Tab Visible | `1` header visible | `0` (`100vh` full-screen, `#dashboardMasthead` hidden) | Target Met |
| Search Bar Wrapper Box Behind Input | `1` `.ai-search-card` box | `0` (floating rounded search pill + embedded button) | Target Met |
| Console / Network / Hygiene Errors | `0` | `0` (normalized `appliedFilters` / `queryTrace.operations`) | Target Met |
| Total Frontend Payload (`HTML+CSS+JS`) | `137,789` bytes | `144,763` bytes (`34.2KB` HTML, `38.1KB` CSS, `72.4KB` JS) | Verified |

---

## Experiment Log

### [2026-11-14 08:04] — Exp 1: Full-Screen 3-Step Onboarding (No Upper Tab) + Single Option Button Top Bar
- **Hypothesis:** Removing all step tabs from `#dashboardMasthead`, hiding `#dashboardMasthead` completely during onboarding (`body.is-onboarding`), and splitting setup into 3 dedicated full-screen steps (1. How it works & Cala data reliability, 2. Role selection, 3. Investor benchmark, stated thesis note, seen startups & scoring config) eliminates dashboard clutter while highlighting Cala's verified knowledge graph.
- **Files touched:** `public/index.html`, `public/styles.css`, `public/app.js`
- **Before -> After:**
  - Top bar step tabs: `4` -> `0`
  - Top bar option controls: `3 separate controls` -> `1 single option button` (`#optionsMenuBtn` + `#optionsMenuPopover`)
  - Onboarding upper tab: `1 visible` -> `0 visible` (`getComputedStyle(dashboardMasthead).display === 'none'`)
- **Tests:** PASS (`12/12`, `134.8ms`), Browser Check 1 (`final_step_496.png`) verified.
- **Decision:** KEEP

### [2026-11-14 08:08] — Exp 2: Floating Rounded AI Search Bar (No Backing Card) + Collapsible Filters
- **Hypothesis:** Replacing the boxed search card on `#panel-search` with an unboxed floating rounded search pill (`.floating-search-bar`, `max-width: 820px`, `height: 68px`, `border-radius: 22px`) containing an embedded emerald `Search` button (`#aiSearchSubmitBtn`, `height: 52px`, `border-radius: 16px`) and hiding secondary filters behind `Refine Filters ▾` (`#toggleFiltersBtn`) makes the search experience cleaner and faster.
- **Files touched:** `public/index.html`, `public/styles.css`, `public/app.js`
- **Before -> After:**
  - Search bar container cards behind input: `1` -> `0`
  - Search input height / radius: `44px / 10px` -> `68px / 22px` with embedded `52px` button
  - Exposed filter controls on initial load: `5 inputs visible` -> `0 (collapsed behind Refine Filters ▾)`
- **Tests:** PASS (`12/12`), Browser Check 2 (`final_step_506.png`) verified at `1440x900` and `390x844`.
- **Decision:** KEEP

### [2026-11-14 08:11] — Exp 3: Above-the-Fold Onboarding Rhythm & Zero-Warning Query Trace Normalization
- **Hypothesis:** Tightening vertical margins in `.onboarding-fullscreen` keeps Step 1's primary CTA (`#step1NextBtn`) above the fold without scrolling, and normalizing `res.appliedFilters` / `res.queryTrace?.operations` in `executeSearchRefinement()` eliminates the `ops.map` console warning when clicking AI search example chips.
- **Files touched:** `public/styles.css`, `public/app.js`
- **Before -> After:**
  - Console warnings during AI chip click: `1` (`ops.map is not a function`) -> `0`
  - Automated test suite duration: `134.8ms` -> `111.6ms` (`12/12` passing)
- **Tests:** PASS (`12/12`, `111.6ms`)
- **Decision:** KEEP
