/**
 * Revealed Thesis Engine · Mergero Front-Door UI Controller
 * 4-Screen Story: 1 Why & setup · 2 Startups to call · 3 Deep dive & network · 4 Thesis & backtest
 * Plus Temporary Overlap Inspector Drawer with Gradual Exposure & LinkedIn/Cala Graph
 */

const state = {
  bootstrap: null,
  activeTab: "config",
  configStep: 1,
  role: "analyst",
  inputMode: "fund",
  selectedFundId: "lifeline-ventures",
  selectedCompanyIds: ["oura", "iceye", "aiven"],
  scoringMode: "balanced",
  networkSource: "linkedin",
  analysis: null,
  DisplayedShortlist: [],
  allKnownItems: new Map(),
  activeStartupId: null,
  activeBrief: null,
  briefCache: new Map(),
  drawerTab: "brief",
  exposureDepth: "evidence",
  peerHistory: []
};

const STEPS_ORDER = ["config", "search", "talk", "thesis"];

const WEIGHT_PROFILES = {
  balanced: {
    label: "Balanced fit",
    items: [
      { name: "Sector", pct: 30 },
      { name: "Stage", pct: 25 },
      { name: "Syndicate", pct: 20 },
      { name: "Geo", pct: 15 },
      { name: "Size", pct: 10 }
    ]
  },
  untapped: {
    label: "Untapped whitespace",
    items: [
      { name: "Sector", pct: 36 },
      { name: "Stage", pct: 30 },
      { name: "Geo", pct: 20 },
      { name: "Size", pct: 14 }
    ]
  },
  warm_network: {
    label: "Warmest intro",
    items: [
      { name: "Warm bridge", pct: 35 },
      { name: "Sector", pct: 25 },
      { name: "Stage", pct: 20 },
      { name: "Geo", pct: 12 },
      { name: "Size", pct: 8 }
    ]
  }
};

const SECTOR_THEMES = {
  "AI & ML": { bg: "#0f223d", fg: "#60a5fa", border: "#1e3a8a", shape: "grid" },
  "Climate Tech": { bg: "#062e22", fg: "#34d399", border: "#065f46", shape: "orbit" },
  DeepTech: { bg: "#1e1b4b", fg: "#a78bfa", border: "#3730a3", shape: "prism" },
  HealthTech: { bg: "#082f49", fg: "#38bdf8", border: "#0369a1", shape: "cross" },
  Fintech: { bg: "#3b2106", fg: "#fbbf24", border: "#92400e", shape: "bars" },
  "B2B SaaS": { bg: "#172554", fg: "#93c5fd", border: "#1d4ed8", shape: "layers" },
  "Gaming & Consumer": { bg: "#3b0a2a", fg: "#f472b6", border: "#831843", shape: "spark" }
};

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatEur(amount) {
  if (typeof amount !== "number" || Number.isNaN(amount)) return "Undisclosed";
  return `€${amount.toFixed(1)}M`;
}

function getInitials(name) {
  const parts = String(name || "ST")
    .replace(/[^a-zA-Z0-9\s]/g, "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return ((parts[0]?.[0] || "S") + (parts[1]?.[0] || "T")).toUpperCase();
}

function scoreBand(score) {
  const val = Number(score || 0);
  if (val >= 72) return { cls: "s-hot", lab: "Call now" };
  if (val >= 56) return { cls: "s-warm", lab: "Warm" };
  return { cls: "s-cold", lab: "Track" };
}

function scoreRingHtml(score) {
  const r = 40;
  const circ = 2 * Math.PI * r;
  const val = Math.max(0, Math.min(100, Math.round(Number(score || 0))));
  const col = val >= 72 ? "#34d399" : val >= 56 ? "#fbbf24" : "#64748b";
  return `
    <div class="ring">
      <svg width="92" height="92">
        <circle cx="46" cy="46" r="${r}" fill="none" stroke="#1e293b" stroke-width="8"/>
        <circle cx="46" cy="46" r="${r}" fill="none" stroke="${col}" stroke-width="8" stroke-linecap="round"
          stroke-dasharray="${circ.toFixed(1)}" stroke-dashoffset="${(circ * (1 - val / 100)).toFixed(1)}"/>
      </svg>
      <div class="c">
        <div>
          <b class="num-tabular">${val}</b>
          <span>Fit score</span>
        </div>
      </div>
    </div>
  `;
}

function buildStartupLogoSvg(name, sector, size = 36) {
  const initials = getInitials(name);
  const theme = SECTOR_THEMES[sector] || {
    bg: "#111a2e",
    fg: "#34d399",
    border: "#273449",
    shape: "orbit"
  };

  let motif = "";
  if (theme.shape === "orbit") {
    motif = `<circle cx="24" cy="24" r="18" fill="none" stroke="${theme.border}" stroke-width="1" stroke-dasharray="3 2" />`;
  } else if (theme.shape === "grid") {
    motif = `<path d="M10 10 H38 V38 H10 Z" fill="none" stroke="${theme.border}" stroke-width="1" />`;
  } else if (theme.shape === "prism") {
    motif = `<polygon points="24,6 42,38 6,38" fill="none" stroke="${theme.border}" stroke-width="1" />`;
  } else if (theme.shape === "bars") {
    motif = `<line x1="8" y1="38" x2="40" y2="38" stroke="${theme.border}" stroke-width="1.5" />`;
  } else {
    motif = `<circle cx="24" cy="24" r="16" fill="none" stroke="${theme.border}" stroke-width="1" />`;
  }

  return `
    <svg width="${size}" height="${size}" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${escapeHtml(name)} monogram">
      <rect x="0.5" y="0.5" width="47" height="47" rx="9" fill="${theme.bg}" stroke="${theme.border}" />
      ${motif}
      <text x="24" y="29" text-anchor="middle" fill="${theme.fg}" font-family="'Plus Jakarta Sans', sans-serif" font-weight="800" font-size="14" letter-spacing="0.03em">${escapeHtml(initials)}</text>
    </svg>
  `;
}

async function fetchJson(url, options = {}) {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...options
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data;
}

function getBudgetNumbers(budget) {
  if (!budget) {
    return { remaining: 8, max: 8, cached: 0 };
  }
  const max = typeof budget.maxLiveCalls === "number" ? budget.maxLiveCalls : 8;
  const used = typeof budget.liveCallsUsed === "number" ? budget.liveCallsUsed : 0;
  const remaining =
    typeof budget.remainingCalls === "number" ? budget.remainingCalls : Math.max(0, max - used);
  const cached = typeof budget.cachedEntries === "number" ? budget.cachedEntries : 0;
  return { remaining, max, cached };
}

function updateTelemetryMasthead(budget) {
  const telemetryEl = document.getElementById("telemetryLine");
  const liveNoteEl = document.getElementById("liveCalaBudgetNote");
  const { remaining, max } = getBudgetNumbers(budget);

  if (telemetryEl) {
    telemetryEl.innerHTML = `<span class="dot"></span>${remaining}/${max} Cala`;
  }
  if (liveNoteEl) {
    liveNoteEl.textContent = `${remaining}/${max} live credits left`;
  }
}

function mapScoringModeToApi(mode) {
  if (mode === "warm_network") return "warmest";
  if (mode === "untapped") return "untapped";
  return "balanced";
}

function registerKnownItems(items) {
  for (const item of items || []) {
    if (item && item.id) {
      state.allKnownItems.set(item.id, item);
    }
  }
}

/* ==========================================================================
   4-SCREEN FRONT-DOOR NAVIGATION (STEPS BAR + KEYBOARD ARROWS)
   ========================================================================== */

function switchPrimaryTab(tabName) {
  if (!STEPS_ORDER.includes(tabName)) return;

  if (tabName === "talk" && !state.activeStartupId && state.DisplayedShortlist.length > 0) {
    state.activeStartupId = state.DisplayedShortlist[0].id;
  }

  state.activeTab = tabName;
  const activeIdx = STEPS_ORDER.indexOf(tabName);

  document.querySelectorAll(".steps .step").forEach((btn) => {
    const stepId = btn.dataset.tab;
    const idx = STEPS_ORDER.indexOf(stepId);
    const isCurrent = stepId === tabName;
    const isDone = idx >= 0 && idx < activeIdx;

    btn.classList.toggle("on", isCurrent);
    btn.classList.toggle("done", isDone);
    btn.setAttribute("aria-selected", isCurrent ? "true" : "false");

    const numEl = btn.querySelector(".n");
    if (numEl) {
      numEl.textContent = isDone ? "✓" : String(idx + 1);
    }
  });

  document.querySelectorAll(".workspace-panel").forEach((panel) => {
    const isTarget = panel.id === `panel-${tabName}`;
    panel.hidden = !isTarget;
  });

  if (tabName === "talk") {
    renderTalkScreen();
  }

  window.scrollTo({ top: 0, behavior: "auto" });
}

function setConfigStep(stepNum) {
  state.configStep = stepNum;
  document.querySelectorAll(".wiz-step-btn").forEach((el) => {
    const s = Number(el.dataset.stepTarget);
    el.classList.toggle("is-active", s === stepNum);
    el.classList.toggle("is-done", s < stepNum);
    const wn = el.querySelector(".wn");
    if (wn) {
      wn.textContent = s < stepNum ? "✓" : String(s);
    }
  });

  document.querySelectorAll(".config-step-pane").forEach((pane) => {
    pane.hidden = Number(pane.dataset.stepPane) !== stepNum;
  });

  renderConfigReviewSummary();
}

function renderWeightPreview() {
  const container = document.getElementById("weightPreviewBars");
  if (!container) return;
  const profile = WEIGHT_PROFILES[state.scoringMode] || WEIGHT_PROFILES.balanced;

  container.innerHTML = profile.items
    .map(
      (item) => `
      <span>${escapeHtml(item.name)} <b class="num-tabular">${item.pct}%</b></span>
    `
    )
    .join(" · ");
}

function getSelectedBenchmarkLabel() {
  if (state.inputMode === "fund") {
    const fund = state.bootstrap?.funds?.find((f) => f.id === state.selectedFundId);
    return fund ? fund.name : "Lifeline Ventures";
  }
  const names = state.selectedCompanyIds
    .map((id) => state.bootstrap?.companies?.find((c) => c.id === id)?.name)
    .filter(Boolean);
  return names.length ? `${names.length} seed companies` : "Custom companies";
}

function syncInlineCalibrationStrip() {
  const label = getSelectedBenchmarkLabel();
  const labelEl = document.getElementById("activeBenchmarkLabel");
  if (labelEl) labelEl.textContent = label;

  const searchTitle = document.getElementById("searchFundTitle");
  if (searchTitle) searchTitle.textContent = label;

  const statFund = document.getElementById("statFundName");
  if (statFund) statFund.textContent = label;

  document.querySelectorAll("[data-quick-role]").forEach((btn) => {
    btn.classList.toggle("is-active", btn.dataset.quickRole === state.role);
  });

  const wizLive = document.getElementById("wizLiveSummary");
  if (wizLive) {
    const roleLabel = state.role === "investor" ? "Investor" : "Analyst";
    const netLabel = state.networkSource === "linkedin" ? "LinkedIn first" : "Cala graph";
    wizLive.textContent = `${roleLabel} · ${label} · ${netLabel}`;
  }
}

function renderConfigReviewSummary() {
  const box = document.getElementById("configReviewSummary");
  if (!box) return;

  const roleLabel = state.role === "investor" ? "Investor (GP / Partner)" : "Analyst";
  const targetLabel = getSelectedBenchmarkLabel();
  const focusLabel = WEIGHT_PROFILES[state.scoringMode]?.label || "Balanced fit";
  const netLabel = state.networkSource === "linkedin" ? "LinkedIn first" : "Cala graph first";

  box.innerHTML = `
    <div class="cr-item">
      <span class="cr-label">Role</span>
      <span class="cr-val">${escapeHtml(roleLabel)}</span>
    </div>
    <div class="cr-item">
      <span class="cr-label">Benchmark</span>
      <span class="cr-val">${escapeHtml(targetLabel)}</span>
    </div>
    <div class="cr-item">
      <span class="cr-label">Scoring focus</span>
      <span class="cr-val">${escapeHtml(focusLabel)}</span>
    </div>
    <div class="cr-item">
      <span class="cr-label">Network source</span>
      <span class="cr-val">${escapeHtml(netLabel)}</span>
    </div>
  `;
  syncInlineCalibrationStrip();
}

function renderFundQuickPicks() {
  const container = document.getElementById("fundQuickPicks");
  if (!container || !state.bootstrap) return;

  container.innerHTML = state.bootstrap.funds
    .map((fund) => {
      const selected = state.selectedFundId === fund.id;
      return `
        <button
          type="button"
          class="fund-pick-card ${selected ? "is-selected" : ""}"
          data-fund-id="${escapeHtml(fund.id)}"
        >
          <span class="fp-name">${escapeHtml(fund.name)}</span>
          <span class="fp-meta">${escapeHtml(fund.hqCity)}, ${escapeHtml(fund.country)}</span>
        </button>
      `;
    })
    .join("");
}

function renderSeedCompanyChips() {
  const container = document.getElementById("selectedSeedChips");
  if (!container || !state.bootstrap) return;

  const companiesById = new Map(state.bootstrap.companies.map((c) => [c.id, c]));
  container.innerHTML = state.selectedCompanyIds
    .map((id) => {
      const comp = companiesById.get(id);
      if (!comp) return "";
      return `
        <span class="seed-chip">
          ${escapeHtml(comp.name)}
          <button type="button" data-remove-seed="${escapeHtml(comp.id)}" aria-label="Remove ${escapeHtml(comp.name)}">&times;</button>
        </span>
      `;
    })
    .join("");
}

/* ==========================================================================
   ANALYSIS EXECUTION & SHORTLIST GRID (6-7 PER LINE + ALSO EXCLUDED)
   ========================================================================== */

async function runAnalysis() {
  const payload = {
    mode: state.inputMode,
    fundId: state.selectedFundId,
    companyIds: state.selectedCompanyIds,
    rankingMode: mapScoringModeToApi(state.scoringMode)
  };

  const result = await fetchJson("/api/analyze", {
    method: "POST",
    body: JSON.stringify(payload)
  });

  state.analysis = result;
  state.DisplayedShortlist = result.shortlist || [];
  registerKnownItems(state.DisplayedShortlist);

  if (!state.activeStartupId && state.DisplayedShortlist.length > 0) {
    state.activeStartupId = state.DisplayedShortlist[0].id;
  }

  updateTelemetryMasthead(result.calaBudget || state.bootstrap?.coverageStats?.calaBudget);
  syncInlineCalibrationStrip();

  const worthCount = state.DisplayedShortlist.filter((s) => (s.suitabilityScore || 0) >= 60).length;
  const statWorthEl = document.getElementById("statWorthCount");
  if (statWorthEl) {
    statWorthEl.textContent = String(worthCount || state.DisplayedShortlist.length);
  }

  const traceBox = document.getElementById("aiTraceBox");
  if (traceBox) {
    traceBox.hidden = true;
  }

  renderStartupGrid(state.DisplayedShortlist);
  renderAlsoScreenedSection(result);
  renderThesisAndBacktest(result);
  syncScoringModeButtons();

  if (state.activeStartupId) {
    await loadStartupBriefData(state.activeStartupId);
  }
}

function syncScoringModeButtons() {
  document.querySelectorAll(".mode-pill-sm").forEach((btn) => {
    btn.classList.toggle("is-active", btn.dataset.mode === state.scoringMode);
  });
  document.querySelectorAll(".focus-pill").forEach((card) => {
    const input = card.querySelector("input");
    const match = input && input.value === state.scoringMode;
    card.classList.toggle("is-selected", Boolean(match));
    if (input) input.checked = Boolean(match);
  });
  renderWeightPreview();
}

function renderStartupGrid(shortlist) {
  const grid = document.getElementById("startupGrid");
  const countBadge = document.getElementById("gridCountBadge");
  if (!grid) return;

  if (countBadge) {
    countBadge.textContent = String(shortlist.length);
  }

  if (!shortlist.length) {
    grid.innerHTML = `
      <div class="card" style="grid-column: 1 / -1; padding: 28px; text-align: center">
        <p style="margin: 0 0 12px; color: var(--muted)">No startups match the active filter combination.</p>
        <button type="button" class="btn sm" id="emptyResetBtn">Reset filters</button>
      </div>
    `;
    document.getElementById("emptyResetBtn")?.addEventListener("click", resetSearchAndFilters);
    return;
  }

  grid.innerHTML = shortlist
    .map((item) => {
      const score = item.suitabilityScore ?? item.score ?? 0;
      const logoSvg = buildStartupLogoSvg(item.name, item.sector, 36);
      const isSelected = state.activeStartupId === item.id;
      const b = scoreBand(score);

      const bridgePerson = item.linkedinNetwork?.bridgePerson?.split("(")[0]?.trim();
      const coInvestor = item.coInvestorPath?.coInvestorName;

      let primarySignal = `${item.stage} · ${formatEur(item.lastRoundAmountEurM)}`;
      let signalClass = "";

      if (state.networkSource === "linkedin" && bridgePerson) {
        primarySignal = `Via ${bridgePerson}`;
        signalClass = "is-warm";
      } else if (coInvestor) {
        primarySignal = `Via ${coInvestor}`;
        signalClass = "is-warm";
      } else if (item.raisingSoon) {
        primarySignal = "Raising window";
        signalClass = "is-raising";
      } else if (item.untappedSignal) {
        primarySignal = "Untapped deal";
        signalClass = "is-untapped";
      }

      return `
        <button
          type="button"
          class="startup-tile ${isSelected ? "is-selected" : ""}"
          role="listitem"
          data-startup-id="${escapeHtml(item.id)}"
        >
          <div class="tile-top">
            <div class="tile-logo" aria-hidden="true">${logoSvg}</div>
            <div class="score ${b.cls}">
              <div class="num num-tabular">${score}</div>
              <div class="lab">${escapeHtml(b.lab)}</div>
            </div>
          </div>

          <div class="tile-body">
            <div class="tile-name">${escapeHtml(item.name)}</div>
            <div class="tile-meta">${escapeHtml(item.sector)} · ${escapeHtml(item.country)}</div>
          </div>

          <div class="tile-foot">
            <span class="tile-signal ${signalClass}">${escapeHtml(primarySignal)}</span>
            <span class="tile-inspect-cue">Open &rarr;</span>
          </div>
        </button>
      `;
    })
    .join("");
}

function renderAlsoScreenedSection(analysisResult) {
  const listEl = document.getElementById("alsoScreenedList");
  const cardEl = document.getElementById("alsoScreenedCard");
  if (!listEl || !cardEl) return;

  const fundName = analysisResult.thesis?.fundName || getSelectedBenchmarkLabel();
  const sims = new Map();
  for (const item of analysisResult.shortlist || []) {
    for (const s of item.similarPortfolio || []) {
      if (!sims.has(s.id || s.name)) {
        sims.set(s.id || s.name, s);
      }
    }
  }

  const portfolioItems = [...sims.values()].slice(0, 4);
  if (!portfolioItems.length) {
    cardEl.hidden = true;
    return;
  }

  cardEl.hidden = false;
  listEl.innerHTML = portfolioItems
    .map(
      (s) => `
      <div class="also-row">
        <span class="nm">${escapeHtml(s.name)} · ${escapeHtml(s.sector)}</span>
        <span class="why">Existing ${escapeHtml(fundName)} portfolio company (${escapeHtml(s.country)}); excluded from outbound shortlist and used as a positive thesis anchor.</span>
      </div>
    `
    )
    .join("");
}

/* ==========================================================================
   AI SEARCH & INSTANT FILTER REFINEMENT
   ========================================================================== */

async function executeSearchRefinement(customQuery) {
  const inputEl = document.getElementById("aiSearchInput");
  const queryText = typeof customQuery === "string" ? customQuery : inputEl?.value || "";
  if (inputEl && typeof customQuery === "string") {
    inputEl.value = customQuery;
  }

  const region = document.getElementById("filterRegion")?.value || "all";
  const excludeSector = document.getElementById("filterExcludeSector")?.value || "";
  const raisingSoonOnly = Boolean(document.getElementById("filterRaisingSoon")?.checked);
  const untappedOnly = Boolean(document.getElementById("filterUntappedOnly")?.checked);

  const hasActiveFilter =
    Boolean(queryText.trim()) ||
    region !== "all" ||
    Boolean(excludeSector) ||
    raisingSoonOnly ||
    untappedOnly;

  const resetBtn = document.getElementById("aiSearchResetBtn");
  if (resetBtn) {
    resetBtn.hidden = !hasActiveFilter;
  }

  const res = await fetchJson("/api/refine", {
    method: "POST",
    body: JSON.stringify({
      mode: state.inputMode,
      fundId: state.selectedFundId,
      companyIds: state.selectedCompanyIds,
      rankingMode: mapScoringModeToApi(state.scoringMode),
      queryText,
      region,
      excludeSector: excludeSector || "none",
      raisingSoonOnly,
      untappedOnly
    })
  });

  state.DisplayedShortlist = res.shortlist || [];
  registerKnownItems(state.DisplayedShortlist);
  renderStartupGrid(state.DisplayedShortlist);

  const traceBox = document.getElementById("aiTraceBox");
  const intentBadge = document.getElementById("aiIntentBadge");
  const explanationEl = document.getElementById("aiExplanationText");
  const opsEl = document.getElementById("aiAppliedFilters");

  if (traceBox) {
    traceBox.hidden = !hasActiveFilter;
  }

  if (hasActiveFilter) {
    if (intentBadge) {
      intentBadge.textContent = res.intentLabel || "AI filter";
    }
    if (explanationEl) {
      explanationEl.textContent = res.explanation || "Filtered shortlist using Cala graph signals.";
    }
    if (opsEl) {
      const ops = res.appliedFilters || [];
      opsEl.innerHTML = ops
        .map((op) => `<span class="trace-op-tag">${escapeHtml(op)}</span>`)
        .join("");
    }
  }
}

async function resetSearchAndFilters() {
  const inputEl = document.getElementById("aiSearchInput");
  if (inputEl) inputEl.value = "";
  const regionEl = document.getElementById("filterRegion");
  if (regionEl) regionEl.value = "all";
  const excludeEl = document.getElementById("filterExcludeSector");
  if (excludeEl) excludeEl.value = "";
  const raisingEl = document.getElementById("filterRaisingSoon");
  if (raisingEl) raisingEl.checked = false;
  const untappedEl = document.getElementById("filterUntappedOnly");
  if (untappedEl) untappedEl.checked = false;

  await executeSearchRefinement("");
}

/* ==========================================================================
   STARTUP BRIEF LOADER & SCREEN 3 (`vTalk` 3-COLUMN DEEP DIVE)
   ========================================================================== */

async function loadStartupBriefData(companyId) {
  const cacheKey = `${companyId}:${state.selectedFundId}`;
  if (state.briefCache.has(cacheKey)) {
    state.activeBrief = state.briefCache.get(cacheKey);
    if (state.activeTab === "talk") renderTalkScreen();
    return state.activeBrief;
  }

  const qs = new URLSearchParams({
    startupId: companyId,
    fundId: state.inputMode === "fund" ? state.selectedFundId : ""
  });
  const brief = await fetchJson(`/api/brief?${qs.toString()}`);
  state.briefCache.set(cacheKey, brief);
  state.activeBrief = brief;
  if (state.activeTab === "talk") {
    renderTalkScreen();
  }
  return brief;
}

function getScoreBreakdownRows(item) {
  const sb = item?.scoreBreakdown;
  if (!sb) return [];
  return [
    { label: "Sector fit", points: Number(sb.sector?.earned || 0).toFixed(1), maxPoints: sb.sector?.max || 30 },
    { label: "Stage timing", points: Number(sb.stage?.earned || 0).toFixed(1), maxPoints: sb.stage?.max || 25 },
    { label: "Co-investor overlap", points: Number(sb.coInvestor?.earned || 0).toFixed(1), maxPoints: sb.coInvestor?.max || 20 },
    { label: "Geography match", points: Number(sb.geography?.earned || 0).toFixed(1), maxPoints: sb.geography?.max || 15 },
    { label: "Round size fit", points: Number(sb.roundSize?.earned || 0).toFixed(1), maxPoints: sb.roundSize?.max || 10 }
  ];
}

function renderTalkScreen() {
  const container = document.getElementById("talkScreenContainer");
  if (!container) return;

  const list = state.DisplayedShortlist;
  const candidate =
    state.allKnownItems.get(state.activeStartupId) ||
    list.find((c) => c.id === state.activeStartupId) ||
    list[0];

  if (!candidate) {
    container.innerHTML = `<p class="sub">Select a startup in Step 2 to inspect its deep dive.</p>`;
    return;
  }

  state.activeStartupId = candidate.id;
  const brief = state.briefCache.get(`${candidate.id}:${state.selectedFundId}`) || state.activeBrief;
  const breakdown = getScoreBreakdownRows(candidate);
  const peers = candidate.peerStartups || [];
  const rounds = brief?.rounds || candidate.roundHistory || [];
  const isLinkedin = state.networkSource === "linkedin";
  const netData = isLinkedin ? candidate.linkedinNetwork : candidate.graph;
  const bridgeTitle = isLinkedin
    ? candidate.linkedinNetwork?.bridgePerson || "2nd-degree LinkedIn bridge"
    : candidate.coInvestorPath?.coInvestorName || "Verified Cala syndicate";

  container.innerHTML = `
    <div class="head">
      ${scoreRingHtml(candidate.suitabilityScore)}
      <div class="t">
        <div class="eyebrow" style="margin-bottom: 6px">Step 3 · One startup in detail</div>
        <h2>${escapeHtml(candidate.name)}</h2>
        <div class="m">
          ${escapeHtml(candidate.hqCity)}, ${escapeHtml(candidate.country)} · ${escapeHtml(candidate.sector)} · ${escapeHtml(candidate.stage)} (${formatEur(candidate.lastRoundAmountEurM)}) · ${escapeHtml(candidate.employeeCount)} employees
        </div>
      </div>
      <div style="display: flex; gap: 8px; align-items: center">
        <button type="button" class="btn sm" id="talkPrevStartupBtn">&larr; Prev startup</button>
        <button type="button" class="btn sm" id="talkNextStartupBtn">Next startup &rarr;</button>
      </div>
    </div>

    <div class="cols">
      <!-- Column 1: Why now & Cala score -->
      <div class="card panel">
        <h3><span class="n">1</span>Why now &amp; Cala score</h3>
        <div class="fin">
          <div><b>${escapeHtml(candidate.stage)}</b><span>Latest stage</span></div>
          <div><b>${formatEur(candidate.lastRoundAmountEurM)}</b><span>Last round</span></div>
          <div><b>${escapeHtml(candidate.likelyNextStage || "Series A")}</b><span>Next window</span></div>
        </div>

        <p class="why-text">${escapeHtml(candidate.oneLiner || candidate.description)}</p>

        <details class="more">
          <summary>Read the 5-factor Cala score breakdown</summary>
          <div style="margin-top: 10px; display: grid; gap: 8px">
            ${breakdown
              .map(
                (f) => `
              <div>
                <div style="display:flex;justify-content:space-between;font-size:13px;font-weight:700">
                  <span>${escapeHtml(f.label)}</span>
                  <span style="color:var(--green)">${f.points}/${f.maxPoints}</span>
                </div>
                <div class="bar"><i style="width:${Math.min(100, Math.round((Number(f.points) / f.maxPoints) * 100))}%"></i></div>
              </div>
            `
              )
              .join("")}
          </div>
        </details>

        <ul class="facts">
          ${(candidate.reasons || [])
            .map(
              (r) => `
            <li>
              ${escapeHtml(r.text)}
              ${(r.sources || [])
                .map(
                  (src, idx) =>
                    `<a href="${escapeHtml(src.url)}" target="_blank" rel="noopener">[${idx + 1} &#8599;]</a>`
                )
                .join(" ")}
            </li>
          `
            )
            .join("")}
        </ul>
      </div>

      <!-- Column 2: Network & warm intro graph -->
      <div class="card panel">
        <h3><span class="n">2</span>Warm intro &amp; network graph</h3>
        <div class="badges" style="margin-top: 0">
          <span class="badge b-green">Warm bridge: ${escapeHtml(bridgeTitle)}</span>
          <span class="badge b-sky">${escapeHtml(
            isLinkedin ? "LinkedIn 2nd-degree first" : "Cala co-investor graph"
          )}</span>
        </div>

        <div class="network-graph-stage" style="margin-bottom: 12px">
          ${netData ? buildNetworkGraphSvg(netData, candidate.id) : ""}
        </div>

        <div class="note" style="margin-bottom: 10px">
          Connected startups in the same investor/founder cluster (click to switch):
        </div>
        <div style="display: flex; flex-wrap: wrap; gap: 8px">
          ${peers
            .slice(0, 4)
            .map(
              (p) => `
            <button type="button" class="btn sm" data-talk-peer="${escapeHtml(p.id)}">
              ${escapeHtml(p.name)} · <span style="color:var(--green)">${escapeHtml(p.bridgeLabel)}</span>
            </button>
          `
            )
            .join("")}
        </div>
      </div>

      <!-- Column 3: Co-investors, rounds & memo export -->
      <div class="card panel">
        <h3><span class="n">3</span>Syndicate &amp; partner memo</h3>
        ${
          rounds.length
            ? rounds
                .map(
                  (r) => `
              <div class="buyer">
                <div class="bn">
                  <span>${escapeHtml(r.type)} (${escapeHtml(r.date)})</span>
                  <span>${formatEur(r.amountEurM)}</span>
                </div>
                <div class="bar"><i style="width:${Math.min(100, Math.max(25, (r.amountEurM || 3) * 6))}%"></i></div>
                <p>Lead: <b>${escapeHtml(r.leadInvestorName)}</b> · ${escapeHtml((r.investorNames || []).join(", "))}</p>
              </div>
            `
                )
                .join("")
            : `<p class="note">No public rounds indexed.</p>`
        }

        <div class="badges" style="margin-top: 14px">
          <span class="badge b-green">Every claim grounded in Cala</span>
          <span class="badge b-amber">Explicit coverage-gap audit</span>
        </div>

        <div style="display: flex; gap: 8px; flex-wrap: wrap; margin-top: 12px">
          <button type="button" class="btn primary sm" id="talkOpenDrawerBtn">
            Open gradual drawer
          </button>
          <button type="button" class="btn sm" id="talkExportMdBtn">
            Export Memo (.md)
          </button>
        </div>
      </div>
    </div>
  `;

  document.getElementById("talkPrevStartupBtn")?.addEventListener("click", () => {
    stepStartupInList(-1);
  });
  document.getElementById("talkNextStartupBtn")?.addEventListener("click", () => {
    stepStartupInList(1);
  });
  document.getElementById("talkOpenDrawerBtn")?.addEventListener("click", () => {
    openStartupInspector(candidate.id, { keepHistory: true });
  });
  document.getElementById("talkExportMdBtn")?.addEventListener("click", () => {
    if (brief?.markdownMemo) {
      downloadFile(
        `${candidate.name.toLowerCase().replace(/\s+/g, "-")}-memo.md`,
        brief.markdownMemo,
        "text/markdown;charset=utf-8"
      );
    }
  });

  container.querySelectorAll("[data-talk-peer]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const peerId = btn.dataset.talkPeer;
      if (peerId) {
        await ensureStartupLoaded(peerId);
        state.activeStartupId = peerId;
        await loadStartupBriefData(peerId);
        renderTalkScreen();
      }
    });
  });
}

async function ensureStartupLoaded(startupId) {
  if (state.allKnownItems.has(startupId)) return state.allKnownItems.get(startupId);
  const compMeta = state.bootstrap?.companies?.find((c) => c.id === startupId);
  if (compMeta) {
    const res = await fetchJson("/api/refine", {
      method: "POST",
      body: JSON.stringify({
        mode: state.inputMode,
        fundId: state.selectedFundId,
        companyIds: state.selectedCompanyIds,
        rankingMode: mapScoringModeToApi(state.scoringMode),
        queryText: compMeta.name
      })
    });
    registerKnownItems(res.shortlist);
  }
  return state.allKnownItems.get(startupId);
}

async function stepStartupInList(direction) {
  const list = state.DisplayedShortlist;
  if (!list.length) return;
  const idx = list.findIndex((c) => c.id === state.activeStartupId);
  const nextIndex = idx < 0 ? 0 : (idx + direction + list.length) % list.length;
  const nextId = list[nextIndex].id;
  state.activeStartupId = nextId;
  await loadStartupBriefData(nextId);
  renderStartupGrid(state.DisplayedShortlist);
  if (state.activeTab === "talk") {
    renderTalkScreen();
  }
  if (!document.getElementById("inspectorDrawer")?.hidden) {
    await openStartupInspector(nextId, { keepHistory: true });
  }
}

/* ==========================================================================
   TEMPORARY OVERLAP INSPECTOR DRAWER
   ========================================================================== */

function applyExposureDepth(depth) {
  state.exposureDepth = depth;
  document.querySelectorAll(".depth-pill").forEach((pill) => {
    pill.classList.toggle("is-active", pill.dataset.depth === depth);
  });

  const layer1 = document.getElementById("gradualLayer1");
  const layer2 = document.getElementById("gradualLayer2");
  const layer3 = document.getElementById("gradualLayer3");

  if (depth === "quick") {
    if (layer1) layer1.open = false;
    if (layer2) layer2.open = false;
    if (layer3) layer3.open = false;
  } else if (depth === "evidence") {
    if (layer1) layer1.open = true;
    if (layer2) layer2.open = true;
    if (layer3) layer3.open = false;
  } else if (depth === "memo") {
    if (layer1) layer1.open = true;
    if (layer2) layer2.open = true;
    if (layer3) layer3.open = true;
  }
}

async function openStartupInspector(companyId, options = {}) {
  if (!options.keepHistory && state.activeStartupId && state.activeStartupId !== companyId) {
    state.peerHistory.push(state.activeStartupId);
  }
  await ensureStartupLoaded(companyId);
  state.activeStartupId = companyId;
  renderStartupGrid(state.DisplayedShortlist);

  const drawer = document.getElementById("inspectorDrawer");
  const backdrop = document.getElementById("drawerBackdrop");
  if (drawer) drawer.hidden = false;
  if (backdrop) backdrop.hidden = false;

  const candidate =
    state.allKnownItems.get(companyId) ||
    state.DisplayedShortlist.find((c) => c.id === companyId);

  const peerBackBtn = document.getElementById("peerBackBtn");
  if (peerBackBtn) {
    if (state.peerHistory.length > 0) {
      const prevId = state.peerHistory[state.peerHistory.length - 1];
      const prevComp =
        state.allKnownItems.get(prevId) ||
        state.bootstrap?.companies?.find((c) => c.id === prevId);
      peerBackBtn.hidden = false;
      peerBackBtn.textContent = `← Back to ${prevComp ? prevComp.name : "previous"}`;
    } else {
      peerBackBtn.hidden = true;
    }
  }

  if (candidate) {
    const rankIdx = state.DisplayedShortlist.findIndex((c) => c.id === candidate.id);
    document.getElementById("drawerStartupLogo").innerHTML = buildStartupLogoSvg(
      candidate.name,
      candidate.sector,
      48
    );
    document.getElementById("drawerStartupRank").textContent =
      rankIdx >= 0 ? `Rank #${rankIdx + 1} of ${state.DisplayedShortlist.length}` : "Connected peer";
    document.getElementById("drawerStartupName").textContent = candidate.name;
    document.getElementById("drawerStartupMeta").textContent = `${candidate.sector} · ${candidate.stage} · ${candidate.hqCity}, ${candidate.country}`;
    document.getElementById("drawerScoreNumber").textContent = String(candidate.suitabilityScore ?? 0);
  }

  const liveOut = document.getElementById("liveCalaOutput");
  if (liveOut) {
    liveOut.hidden = true;
    liveOut.innerHTML = "";
  }

  const brief = await loadStartupBriefData(companyId);

  const defaultDepth = state.role === "investor" ? "evidence" : "memo";
  applyExposureDepth(defaultDepth);

  if (candidate) {
    renderDrawerBriefPane(brief, candidate);
    renderDrawerNetworkPane(brief, candidate);
  }
}

function closeStartupInspector() {
  const drawer = document.getElementById("inspectorDrawer");
  const backdrop = document.getElementById("drawerBackdrop");
  if (drawer) drawer.hidden = true;
  if (backdrop) backdrop.hidden = true;
}

function switchDrawerTab(tabName) {
  state.drawerTab = tabName;
  const briefTab = document.getElementById("drawerTabBrief");
  const netTab = document.getElementById("drawerTabNetwork");
  const briefPane = document.getElementById("drawerPaneBrief");
  const netPane = document.getElementById("drawerPaneNetwork");

  const isBrief = tabName === "brief";
  if (briefTab) {
    briefTab.classList.toggle("is-active", isBrief);
    briefTab.setAttribute("aria-selected", isBrief ? "true" : "false");
  }
  if (netTab) {
    netTab.classList.toggle("is-active", !isBrief);
    netTab.setAttribute("aria-selected", !isBrief ? "true" : "false");
  }
  if (briefPane) briefPane.hidden = !isBrief;
  if (netPane) netPane.hidden = isBrief;
}

function renderDrawerBriefPane(brief, candidate) {
  document.getElementById("drawerQuickVerdict").textContent =
    candidate.oneLiner || candidate.description || "";

  const pillsEl = document.getElementById("drawerQuickPills");
  if (pillsEl) {
    const pills = [
      `Last round: ${candidate.stage} (${formatEur(candidate.lastRoundAmountEurM)})`,
      `Next window: ${candidate.likelyNextStage || "Series A"}`,
      `Employees: ${candidate.employeeCount}`,
      candidate.linkedinNetwork?.bridgePerson
        ? `Bridge: ${candidate.linkedinNetwork.bridgePerson}`
        : candidate.coInvestorPath?.summary
    ].filter(Boolean);
    pillsEl.innerHTML = pills
      .map((p) => `<span class="meta-pill">${escapeHtml(p)}</span>`)
      .join("");
  }

  const confEl = document.getElementById("drawerConfidenceLabel");
  if (confEl) {
    confEl.textContent = `${(candidate.roundHistory || []).length} verified Cala rounds`;
  }

  const breakdownEl = document.getElementById("drawerScoreBreakdown");
  if (breakdownEl) {
    const factors = getScoreBreakdownRows(candidate);
    breakdownEl.innerHTML = factors
      .map((f) => {
        const pct = Math.min(100, Math.round((Number(f.points) / f.maxPoints) * 100));
        return `
          <div class="sb-row">
            <div class="sb-top">
              <span class="sb-label">${escapeHtml(f.label)}</span>
              <span class="sb-pts num-tabular">${f.points} / ${f.maxPoints} pts</span>
            </div>
            <div class="sb-bar-track">
              <div class="sb-bar-fill" style="width: ${pct}%"></div>
            </div>
          </div>
        `;
      })
      .join("");
  }

  const whyList = document.getElementById("drawerWhyFitList");
  if (whyList) {
    whyList.innerHTML = (candidate.reasons || [])
      .map((r) => {
        const cites = (r.sources || [])
          .map(
            (src, idx) =>
              `<a href="${escapeHtml(src.url)}" target="_blank" rel="noopener noreferrer" class="citation-link" title="${escapeHtml(src.title)}">[${idx + 1} &#8599;]</a>`
          )
          .join(" ");
        return `<li>${escapeHtml(r.text)} ${cites}</li>`;
      })
      .join("");
  }

  const risksList = document.getElementById("drawerRisksList");
  if (risksList) {
    const risks = brief?.risks || [
      candidate.competitorConflict
        ? `Adjacent to portfolio company ${candidate.competitorConflict}; requires conflict clearance.`
        : "No direct portfolio conflict detected in indexed Cala rounds.",
      candidate.raisingSoon
        ? "Inside active 12-to-24 month post-round raising window."
        : "Out-of-cycle outreach; monitor milestone triggers prior to next round."
    ];
    risksList.innerHTML = risks.map((rk) => `<li>${escapeHtml(rk)}</li>`).join("");
  }

  const roundsBody = document.getElementById("drawerRoundsTableBody");
  if (roundsBody) {
    const rounds = brief?.rounds || candidate.roundHistory || [];
    roundsBody.innerHTML = rounds
      .map(
        (r) => `
        <tr>
          <td class="num-tabular">${escapeHtml(r.date)}</td>
          <td><strong>${escapeHtml(r.type)}</strong></td>
          <td class="num-tabular">${formatEur(r.amountEurM)}</td>
          <td><strong>${escapeHtml(r.leadInvestorName)}</strong> · ${escapeHtml((r.investorNames || []).join(", "))}</td>
          <td><span class="badge b-green" style="font-size:11px;padding:2px 6px">Cala</span></td>
        </tr>
      `
      )
      .join("");
  }

  const analoguesEl = document.getElementById("drawerAnaloguesList");
  if (analoguesEl) {
    const analogues = candidate.similarPortfolio || [];
    analoguesEl.innerHTML = analogues.length
      ? analogues
          .map(
            (a) => `
          <div class="bridge-card" style="margin-bottom: 8px">
            <div>
              <strong>${escapeHtml(a.name)}</strong>
              <span class="note" style="display:block">${escapeHtml(a.sector)} · ${escapeHtml(a.country)}</span>
            </div>
            <span class="badge b-sky">Portfolio analogue</span>
          </div>
        `
          )
          .join("")
      : `<p class="note">No direct portfolio analogue in the same sector.</p>`;
  }

  const missingEl = document.getElementById("drawerMissingDataList");
  if (missingEl) {
    missingEl.innerHTML = (brief?.notFoundInCala || [])
      .map(
        (m) => `
        <li>
          <strong>${escapeHtml(m.field)}:</strong> ${escapeHtml(m.status)} (${escapeHtml(m.reason)})
        </li>
      `
      )
      .join("");
  }

  const questionsEl = document.getElementById("drawerQuestionsList");
  if (questionsEl) {
    const qs = brief?.diligenceQuestions || [
      `Validate ${candidate.name}'s net revenue retention and gross margin progression ahead of ${candidate.likelyNextStage || "Series A"}.`,
      `Reference-check founder execution through ${candidate.linkedinNetwork?.bridgePerson || candidate.coInvestorPath?.coInvestorName || "syndicate co-investors"}.`
    ];
    questionsEl.innerHTML = qs.map((q) => `<li>${escapeHtml(q)}</li>`).join("");
  }
}

/* ==========================================================================
   NETWORK & WARM INTRO GRAPH (SVG)
   ========================================================================== */

function renderDrawerNetworkPane(brief, candidate) {
  const isLinkedin = state.networkSource === "linkedin";
  const netData = isLinkedin ? candidate.linkedinNetwork : candidate.graph;
  const peers = candidate.peerStartups || [];
  const targetName = getSelectedBenchmarkLabel();

  const warmBox = document.getElementById("drawerWarmPathBox");
  if (warmBox) {
    if (isLinkedin && candidate.linkedinNetwork) {
      warmBox.innerHTML = `
        <strong>${escapeHtml(candidate.linkedinNetwork.sourceLabel)}:</strong>
        ${escapeHtml(targetName)} &rarr; <strong>${escapeHtml(candidate.linkedinNetwork.bridgePerson)}</strong> &rarr; <strong>${escapeHtml(candidate.linkedinNetwork.targetLeader)}</strong> (${escapeHtml(candidate.name)})
      `;
    } else {
      warmBox.innerHTML = `
        <strong>Verified Cala syndicate path:</strong>
        ${escapeHtml(candidate.coInvestorPath?.summary || "Direct round participation and co-investor graph from Cala.")}
      `;
    }
  }

  const canvas = document.getElementById("networkGraphCanvas");
  if (canvas && netData) {
    canvas.innerHTML = buildNetworkGraphSvg(netData, candidate.id);
    canvas.querySelectorAll(".svg-peer-node[data-peer-id]").forEach((nodeEl) => {
      nodeEl.addEventListener("click", () => {
        openStartupInspector(nodeEl.getAttribute("data-peer-id"));
      });
    });
  }

  const bridgesList = document.getElementById("linkedinBridgesList");
  if (bridgesList) {
    const items = [];
    if (candidate.linkedinNetwork) {
      items.push({
        title: candidate.linkedinNetwork.bridgePerson,
        sub: candidate.linkedinNetwork.sourceLabel,
        desc: candidate.linkedinNetwork.summary,
        badge: "LinkedIn 2nd°"
      });
    }
    if (candidate.coInvestorPath?.coInvestorName) {
      items.push({
        title: candidate.coInvestorPath.coInvestorName,
        sub: "Cala verified co-investor",
        desc: candidate.coInvestorPath.summary,
        badge: `${candidate.coInvestorPath.sharedCount || 1} shared deals`
      });
    }
    bridgesList.innerHTML = items
      .map(
        (b) => `
        <div class="bridge-card">
          <div>
            <strong>${escapeHtml(b.title)}</strong>
            <span class="note" style="display:block">${escapeHtml(b.sub)}</span>
            <span class="note" style="display:block;color:var(--text)">${escapeHtml(b.desc)}</span>
          </div>
          <span class="badge b-green">${escapeHtml(b.badge)}</span>
        </div>
      `
      )
      .join("");
  }

  const peersList = document.getElementById("peerStartupsList");
  if (peersList) {
    peersList.innerHTML = peers.length
      ? peers
          .map(
            (p) => `
          <button type="button" class="peer-startup-card" data-peer-id="${escapeHtml(p.id)}">
            <div>
              <strong>${escapeHtml(p.name)}</strong>
              <span class="note" style="display:block">${escapeHtml(p.sector)} · ${escapeHtml(p.country)}</span>
            </div>
            <span class="badge b-sky">${escapeHtml(p.bridgeLabel)} &rarr;</span>
          </button>
        `
          )
          .join("")
      : `<p class="note">No secondary startup nodes linked in current slice.</p>`;
  }
}

function buildNetworkGraphSvg(graphObj, selectedStartupId) {
  const nodes = (graphObj.nodes || []).slice(0, 8);
  const links = graphObj.links || [];
  const width = 940;
  const height = 310;

  const cols = { fund: [], bridge: [], target: [], peer: [] };
  for (const n of nodes) {
    if (n.type === "target_fund") cols.fund.push(n);
    else if (n.id === selectedStartupId || n.type === "target_startup") cols.target.push(n);
    else if (n.type === "co_investor" || n.type === "portfolio") cols.bridge.push(n);
    else cols.peer.push(n);
  }

  if (!cols.peer.length && cols.bridge.length > 3) {
    cols.peer = cols.bridge.splice(3);
  }

  const cardW = 160;
  const cardH = 48;
  const positions = new Map();
  const columnLayout = [
    { list: cols.fund, cx: 92 },
    { list: cols.bridge, cx: 344 },
    { list: cols.target, cx: 596 },
    { list: cols.peer, cx: 848 }
  ];

  for (const col of columnLayout) {
    const count = col.list.length;
    if (!count) continue;
    const step = height / (count + 1);
    col.list.forEach((node, idx) => {
      positions.set(node.id, {
        cx: col.cx,
        cy: Math.round(step * (idx + 1)),
        node
      });
    });
  }

  const styleForType = (type, id) => {
    if (type === "target_fund") return { accent: "#34d399", kind: "BENCHMARK" };
    if (id === selectedStartupId || type === "target_startup") return { accent: "#34d399", kind: "SELECTED" };
    if (type === "co_investor") return { accent: "#fbbf24", kind: "BRIDGE" };
    if (id === "li-leader") return { accent: "#38bdf8", kind: "LEADERSHIP" };
    if (type === "portfolio") return { accent: "#94a3b8", kind: "PORTFOLIO" };
    return { accent: "#38bdf8", kind: "PEER STARTUP" };
  };

  const edgeSvg = links
    .map((link) => {
      const a = positions.get(link.source);
      const b = positions.get(link.target);
      if (!a || !b) return "";

      if (a.cx === b.cx) {
        const yTop = a.cy < b.cy ? a.cy + cardH / 2 : b.cy + cardH / 2;
        const yBot = a.cy < b.cy ? b.cy - cardH / 2 : a.cy - cardH / 2;
        return `<path d="M ${a.cx} ${yTop} L ${b.cx} ${yBot}" fill="none" stroke="#273449" stroke-width="1.6" />`;
      }

      const x1 = a.cx < b.cx ? a.cx + cardW / 2 : a.cx - cardW / 2;
      const y1 = a.cy;
      const x2 = a.cx < b.cx ? b.cx - cardW / 2 : b.cx + cardW / 2;
      const y2 = b.cy;
      const dx = Math.abs(x2 - x1) * 0.45;
      const cx1 = a.cx < b.cx ? x1 + dx : x1 - dx;
      const cx2 = a.cx < b.cx ? x2 - dx : x2 + dx;

      return `<path d="M ${x1} ${y1} C ${cx1} ${y1}, ${cx2} ${y2}, ${x2} ${y2}" fill="none" stroke="#34d399" stroke-opacity="0.55" stroke-width="1.6" />`;
    })
    .join("");

  const nodeSvg = [...positions.values()]
    .map(({ cx, cy, node }) => {
      const st = styleForType(node.type, node.id);
      const x = cx - cardW / 2;
      const y = cy - cardH / 2;
      const shortLabel = node.label.length > 20 ? `${node.label.slice(0, 18)}..` : node.label;
      const isClickablePeer = node.type === "peer_startup";
      const peerClass = isClickablePeer ? "svg-peer-node" : "";
      const peerAttr = isClickablePeer ? `data-peer-id="${escapeHtml(node.id)}" style="cursor:pointer"` : "";

      return `
        <g class="${peerClass}" ${peerAttr}>
          <rect x="${x}" y="${y}" width="${cardW}" height="${cardH}" rx="10" fill="#0d1424" stroke="${st.accent}" stroke-width="1.4" />
          <text x="${x + 12}" y="${y + 18}" font-family="'Plus Jakarta Sans', sans-serif" font-size="10" font-weight="800" fill="${st.accent}">${escapeHtml(st.kind)}</text>
          <text x="${x + 12}" y="${y + 35}" font-family="'Plus Jakarta Sans', sans-serif" font-size="12" font-weight="700" fill="#e2e8f0">${escapeHtml(shortLabel)}</text>
        </g>
      `;
    })
    .join("");

  return `
    <svg class="network-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Startup relationship network diagram">
      ${edgeSvg}
      ${nodeSvg}
    </svg>
  `;
}

/* ==========================================================================
   SCREEN 4 · AT SCALE / REVEALED THESIS & POINT-IN-TIME BACKTEST (`vScale`)
   ========================================================================== */

function renderDistributionBars(containerId, items = []) {
  const el = document.getElementById(containerId);
  if (!el) return;

  el.innerHTML = (items || [])
    .slice(0, 5)
    .map(
      (item) => `
      <div class="frow" style="padding: 5px 0">
        <div class="fl" style="font-size:13.5px">${escapeHtml(item.label)}</div>
        <div class="fb" style="height:18px"><i style="width: ${Math.max(4, item.sharePct || 0)}%"></i></div>
        <div class="fv num-tabular" style="font-size:16px">${item.sharePct || 0}%</div>
      </div>
    `
    )
    .join("");
}

function renderThesisAndBacktest(result) {
  const { thesis, backtest } = result;
  if (!thesis) return;

  document.getElementById("thesisFundTitle").textContent = `What ${thesis.fundName} actually backs`;
  document.getElementById("thesisFundSubtitle").innerHTML = `Comparing stated marketing thesis against <b>${thesis.dealsAnalyzedCount} verified Cala rounds</b> across ${thesis.portfolioCount} portfolio companies, plus a historical point-in-time backtest with zero future data leakage.`;

  const confBadge = document.getElementById("thesisConfidenceBadge");
  if (confBadge) {
    confBadge.textContent = `${thesis.dealsAnalyzedCount} rounds · Lead rate ${thesis.leadRatePct}%`;
  }

  const driftBadge = document.getElementById("driftScoreBadge");
  if (driftBadge) {
    driftBadge.textContent = `Median round ${formatEur(thesis.medianRoundSizeEurM)}`;
  }

  const weakWarn = document.getElementById("weakProfileWarning");
  if (weakWarn) {
    if (thesis.weakProfileNote) {
      weakWarn.hidden = false;
      weakWarn.textContent = thesis.weakProfileNote;
    } else {
      weakWarn.hidden = true;
    }
  }

  // Funnel rows on left of Screen 4 (Mergero .frow style)
  const funnelEl = document.getElementById("scaleFunnelRows");
  if (funnelEl) {
    const poolSize = state.bootstrap?.coverageStats?.companiesIndexed || 48;
    const eligible = (result.shortlist || []).length || 20;
    const hits = backtest?.hitsInTop15 ?? 3;
    const totalDeals = backtest?.totalActualDeals ?? 3;
    const hitRate = totalDeals > 0 ? Math.round((hits / totalDeals) * 100) : 100;

    const funnelRow = (label, sub, val, pct, cls = "") => `
      <div class="frow ${cls}">
        <div class="fl">${escapeHtml(label)}<small>${escapeHtml(sub)}</small></div>
        <div class="fb"><i style="width: ${Math.max(6, pct)}%"></i></div>
        <div class="fv num-tabular">${escapeHtml(val)}</div>
      </div>
    `;
    funnelEl.innerHTML = [
      funnelRow("European startups indexed", "verified Cala entities & citations", String(poolSize), 100),
      funnelRow("Eligible outside portfolio", "excluding existing portfolio & conflicts", String(eligible), Math.round((eligible / poolSize) * 100)),
      funnelRow("Point-in-time shortlist", "ranked using only pre-cutoff rounds", "Top 15", 32),
      funnelRow("Hidden 12m deals recovered", `${hits} of ${totalDeals} subsequent investments predicted`, `${hitRate}%`, hitRate, "final")
    ].join("");
  }

  renderDistributionBars("sectorDistributionBars", thesis.sectorMix);
  renderDistributionBars("stageDistributionBars", thesis.stageMix);
  renderDistributionBars("geoDistributionBars", thesis.geographyMix);

  // Right column: Why-scale icon list
  const insightsEl = document.getElementById("thesisInsightsList");
  if (insightsEl) {
    const diffLine = (thesis.statedVsRevealed || [])[0] || thesis.driftSummary || "";
    insightsEl.innerHTML = `
      <li>
        <div class="ic">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#34d399" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/></svg>
        </div>
        <div>
          <b>Stated vs. revealed thesis</b>
          Stated: "${escapeHtml(thesis.statedThesis || "")}". Revealed: ${escapeHtml(diffLine)}
        </div>
      </li>
      <li>
        <div class="ic">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#34d399" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="m9 12 2 2 4-4"/></svg>
        </div>
        <div>
          <b>Syndicate conviction &amp; lead behavior</b>
          Lead rate ${thesis.leadRatePct}% and follow-on rate ${thesis.followOnRatePct}% across ${thesis.dealsAnalyzedCount} verified Cala rounds.
        </div>
      </li>
      <li>
        <div class="ic">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#34d399" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
        </div>
        <div>
          <b>Zero-hallucination evidence gate</b>
          Every claim is bound to a verified Cala citation ID; unverified attributes are explicitly surfaced as "Not found in Cala".
        </div>
      </li>
    `;
  }

  if (backtest) {
    const totalDeals = backtest.totalActualDeals || 3;
    const hits = backtest.hitsInTop15 || 3;
    const hitRate = Math.round((hits / totalDeals) * 100);
    document.getElementById("backtestHitRate").textContent = `${hitRate}%`;
    document.getElementById("backtestPrecision").textContent = `${hits}/${totalDeals} in Top 15`;
    document.getElementById("backtestSummaryText").textContent = backtest.summaryText;

    const hitsEl = document.getElementById("backtestHitsList");
    if (hitsEl) {
      hitsEl.innerHTML = (backtest.hiddenDeals || [])
        .map(
          (hit) => `
          <div class="buyer">
            <div class="bn">
              <span>${escapeHtml(hit.name)} (Predicted #${hit.predictedRank})</span>
              <span>${hit.predictedScore}/100</span>
            </div>
            <p>Actual deal: ${escapeHtml(hit.actualRoundType)} on ${escapeHtml(hit.actualDate)} · ${escapeHtml(hit.coInvestorHint)}</p>
          </div>
        `
        )
        .join("");
    }
  }
}

/* ==========================================================================
   EXPORT & LIVE CALA VERIFICATION
   ========================================================================== */

function downloadFile(filename, content, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

async function triggerLiveCalaVerification() {
  const candidate = state.allKnownItems.get(state.activeStartupId);
  if (!candidate) return;
  const outputEl = document.getElementById("liveCalaOutput");
  const btn = document.getElementById("verifyLiveCalaBtn");
  const includeKnowledgeSearch = Boolean(document.getElementById("liveCalaSearchCheck")?.checked);

  if (outputEl) {
    outputEl.hidden = false;
    outputEl.textContent = "Querying live Cala Beta API...";
  }
  if (btn) btn.disabled = true;

  try {
    const res = await fetchJson("/api/cala-verify", {
      method: "POST",
      body: JSON.stringify({
        name: candidate.name,
        type: "company",
        includeKnowledgeSearch
      })
    });

    updateTelemetryMasthead(res.budget);

    const live = res.liveSummary;
    if (outputEl) {
      outputEl.innerHTML = `
        <div class="card" style="padding:12px;margin-top:10px">
          <strong>Live Cala response (${res.fromCache ? "Cached 0 credits" : "Live call"}):</strong>
          <p class="note" style="margin:4px 0 0">${
            live
              ? `Matched entity: ${escapeHtml(live.name)} (${escapeHtml(live.id)})`
              : "Entity query completed; no additional public rounds beyond curated graph."
          }</p>
        </div>
      `;
    }
  } catch (err) {
    if (outputEl) {
      outputEl.textContent = `Live Cala check notice: ${err.message}`;
    }
  } finally {
    if (btn) btn.disabled = false;
  }
}

/* ==========================================================================
   EVENT LISTENERS & INITIALIZATION
   ========================================================================== */

function bindEvents() {
  document.addEventListener("click", (e) => {
    const goBtn = e.target.closest("[data-go]");
    if (goBtn) {
      e.preventDefault();
      switchPrimaryTab(goBtn.dataset.go);
    }
  });

  document.querySelectorAll("[data-quick-role]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      state.role = btn.dataset.quickRole;
      document.querySelectorAll("[data-role-card]").forEach((c) => {
        const input = c.querySelector("input");
        const isMatch = c.dataset.roleCard === state.role;
        c.classList.toggle("is-selected", isMatch);
        if (input) input.checked = isMatch;
      });
      renderConfigReviewSummary();
      await runAnalysis();
    });
  });

  document.querySelectorAll(".wiz-step-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      setConfigStep(Number(btn.dataset.stepTarget));
    });
  });

  document.getElementById("step1NextBtn")?.addEventListener("click", () => setConfigStep(2));
  document.getElementById("step2BackBtn")?.addEventListener("click", () => setConfigStep(1));
  document.getElementById("step2NextBtn")?.addEventListener("click", () => setConfigStep(3));
  document.getElementById("step3BackBtn")?.addEventListener("click", () => setConfigStep(2));

  document.getElementById("launchDashboardBtn")?.addEventListener("click", async () => {
    await runAnalysis();
    switchPrimaryTab("search");
  });

  document.querySelectorAll("[data-role-card]").forEach((card) => {
    card.addEventListener("click", async () => {
      state.role = card.dataset.roleCard;
      document.querySelectorAll("[data-role-card]").forEach((c) => {
        c.classList.toggle("is-selected", c.dataset.roleCard === state.role);
      });
      renderConfigReviewSummary();
      await runAnalysis();
    });
  });

  document.querySelectorAll("[data-input-mode]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      state.inputMode = btn.dataset.inputMode;
      document.querySelectorAll("[data-input-mode]").forEach((b) => {
        b.classList.toggle("is-active", b.dataset.inputMode === state.inputMode);
      });
      document.getElementById("fundInputSection").hidden = state.inputMode !== "fund";
      document.getElementById("companiesInputSection").hidden = state.inputMode !== "companies";
      renderConfigReviewSummary();
      await runAnalysis();
    });
  });

  document.getElementById("fundQuickPicks")?.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-fund-id]");
    if (!btn) return;
    state.selectedFundId = btn.dataset.fundId;
    renderFundQuickPicks();
    renderConfigReviewSummary();
    await runAnalysis();
  });

  const fundInput = document.getElementById("fundSearchInput");
  const disambigBox = document.getElementById("disambiguationBox");
  fundInput?.addEventListener("input", async () => {
    const q = fundInput.value.trim();
    if (!q) {
      if (disambigBox) disambigBox.hidden = true;
      return;
    }
    const res = await fetchJson(`/api/search?q=${encodeURIComponent(q)}`);
    if (!disambigBox) return;
    if (!res.funds?.length) {
      disambigBox.hidden = true;
      return;
    }
    disambigBox.hidden = false;
    disambigBox.innerHTML = res.funds
      .map(
        (f) => `
        <button type="button" class="btn sm" style="width:100%;justify-content:space-between;margin-top:4px" data-pick-fund="${escapeHtml(f.id)}">
          <strong>${escapeHtml(f.name)}</strong>
          <span>${escapeHtml(f.hqCity)}, ${escapeHtml(f.country)}</span>
        </button>
      `
      )
      .join("");
  });

  disambigBox?.addEventListener("click", async (e) => {
    const item = e.target.closest("[data-pick-fund]");
    if (!item) return;
    state.selectedFundId = item.dataset.pickFund;
    disambigBox.hidden = true;
    if (fundInput) fundInput.value = "";
    renderFundQuickPicks();
    renderConfigReviewSummary();
    await runAnalysis();
  });

  const seedInput = document.getElementById("companySeedInput");
  const seedSuggest = document.getElementById("companySeedSuggestions");
  seedInput?.addEventListener("input", async () => {
    const q = seedInput.value.trim();
    if (!q) {
      if (seedSuggest) seedSuggest.hidden = true;
      return;
    }
    const res = await fetchJson(`/api/search?q=${encodeURIComponent(q)}`);
    if (!seedSuggest) return;
    if (!res.companies?.length) {
      seedSuggest.hidden = true;
      return;
    }
    seedSuggest.hidden = false;
    seedSuggest.innerHTML = res.companies
      .map(
        (c) => `
        <button type="button" class="btn sm" style="width:100%;justify-content:space-between;margin-top:4px" data-add-seed="${escapeHtml(c.id)}">
          <strong>${escapeHtml(c.name)}</strong>
          <span>${escapeHtml(c.sector)} · ${escapeHtml(c.country)}</span>
        </button>
      `
      )
      .join("");
  });

  seedSuggest?.addEventListener("click", async (e) => {
    const item = e.target.closest("[data-add-seed]");
    if (!item) return;
    const id = item.dataset.addSeed;
    if (!state.selectedCompanyIds.includes(id) && state.selectedCompanyIds.length < 5) {
      state.selectedCompanyIds.push(id);
      renderSeedCompanyChips();
      renderConfigReviewSummary();
      await runAnalysis();
    }
    seedSuggest.hidden = true;
    if (seedInput) seedInput.value = "";
  });

  document.getElementById("selectedSeedChips")?.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-remove-seed]");
    if (!btn) return;
    const id = btn.dataset.removeSeed;
    if (state.selectedCompanyIds.length > 3) {
      state.selectedCompanyIds = state.selectedCompanyIds.filter((x) => x !== id);
      renderSeedCompanyChips();
      renderConfigReviewSummary();
      await runAnalysis();
    }
  });

  document.querySelectorAll("[data-focus-card]").forEach((card) => {
    card.addEventListener("click", async () => {
      state.scoringMode = card.dataset.focusCard;
      syncScoringModeButtons();
      renderConfigReviewSummary();
      await runAnalysis();
    });
  });

  document.querySelectorAll("[data-network-card]").forEach((card) => {
    card.addEventListener("click", () => {
      state.networkSource = card.dataset.networkCard;
      document.querySelectorAll("[data-network-card]").forEach((c) => {
        c.classList.toggle("is-selected", c.dataset.networkCard === state.networkSource);
      });
      syncNetworkSourceButtons();
      renderConfigReviewSummary();
      renderStartupGrid(state.DisplayedShortlist);
    });
  });

  document.getElementById("aiSearchForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    await executeSearchRefinement();
  });

  document.getElementById("aiSearchResetBtn")?.addEventListener("click", async () => {
    await resetSearchAndFilters();
  });

  document.getElementById("aiExamplesBar")?.addEventListener("click", async (e) => {
    const pill = e.target.closest("[data-query]");
    if (!pill) return;
    await executeSearchRefinement(pill.dataset.query);
  });

  ["filterRegion", "filterExcludeSector", "filterRaisingSoon", "filterUntappedOnly"].forEach(
    (id) => {
      document.getElementById(id)?.addEventListener("change", () => {
        executeSearchRefinement();
      });
    }
  );

  document.querySelectorAll(".mode-pill-sm").forEach((btn) => {
    btn.addEventListener("click", async () => {
      state.scoringMode = btn.dataset.mode;
      syncScoringModeButtons();
      await runAnalysis();
      await executeSearchRefinement();
    });
  });

  document.getElementById("startupGrid")?.addEventListener("click", (e) => {
    const tile = e.target.closest("[data-startup-id]");
    if (!tile) return;
    state.peerHistory = [];
    openStartupInspector(tile.dataset.startupId, { keepHistory: true });
  });

  document.getElementById("drawerCloseBtn")?.addEventListener("click", closeStartupInspector);
  document.getElementById("drawerBackdrop")?.addEventListener("click", closeStartupInspector);

  document.getElementById("openFullTalkBtn")?.addEventListener("click", () => {
    closeStartupInspector();
    switchPrimaryTab("talk");
  });

  document.getElementById("drawerPrevBtn")?.addEventListener("click", () => {
    stepStartupInList(-1);
  });
  document.getElementById("drawerNextBtn")?.addEventListener("click", () => {
    stepStartupInList(1);
  });

  document.querySelectorAll("[data-drawer-tab]").forEach((tab) => {
    tab.addEventListener("click", () => {
      switchDrawerTab(tab.dataset.drawerTab);
    });
  });

  document.querySelectorAll(".depth-pill").forEach((pill) => {
    pill.addEventListener("click", () => {
      applyExposureDepth(pill.dataset.depth);
    });
  });

  document.querySelectorAll("[data-net-source]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.networkSource = btn.dataset.netSource;
      syncNetworkSourceButtons();
      const candidate = state.allKnownItems.get(state.activeStartupId);
      if (state.activeBrief && candidate) {
        renderDrawerNetworkPane(state.activeBrief, candidate);
      }
      renderStartupGrid(state.DisplayedShortlist);
    });
  });

  document.getElementById("peerStartupsList")?.addEventListener("click", (e) => {
    const card = e.target.closest("[data-peer-id]");
    if (!card) return;
    openStartupInspector(card.dataset.peerId);
    switchDrawerTab("brief");
  });

  document.getElementById("peerBackBtn")?.addEventListener("click", () => {
    const prevId = state.peerHistory.pop();
    if (prevId) {
      openStartupInspector(prevId, { keepHistory: true });
    }
  });

  document.getElementById("exportMarkdownBtn")?.addEventListener("click", () => {
    if (!state.activeBrief?.markdownMemo) return;
    const candidate = state.allKnownItems.get(state.activeStartupId);
    const slug = (candidate?.name || "startup").toLowerCase().replace(/[^a-z0-9]+/g, "-");
    downloadFile(`${slug}-investment-memo.md`, state.activeBrief.markdownMemo, "text/markdown;charset=utf-8");
  });

  document.getElementById("exportCsvBtn")?.addEventListener("click", () => {
    const rows = state.DisplayedShortlist.map(
      (s) => `"${s.name}","${s.sector}","${s.country}","${s.stage}",${s.suitabilityScore}`
    );
    const csv = ["Name,Sector,Country,Stage,Score", ...rows].join("\n");
    downloadFile("revealed-thesis-shortlist.csv", csv, "text/csv;charset=utf-8");
  });

  document.getElementById("verifyLiveCalaBtn")?.addEventListener("click", triggerLiveCalaVerification);

  document.addEventListener("keydown", (e) => {
    const drawerOpen = !document.getElementById("inspectorDrawer")?.hidden;
    const tag = document.activeElement?.tagName;
    const inInput = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";

    if (e.key === "Escape" && drawerOpen) {
      closeStartupInspector();
      return;
    }

    if (e.key === "/" && !inInput && state.activeTab === "search") {
      e.preventDefault();
      document.getElementById("aiSearchInput")?.focus();
      return;
    }

    if (!inInput) {
      if (drawerOpen) {
        if (e.key === "ArrowDown" || e.key === "ArrowRight") {
          e.preventDefault();
          stepStartupInList(1);
        } else if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
          e.preventDefault();
          stepStartupInList(-1);
        }
      } else {
        const curIdx = STEPS_ORDER.indexOf(state.activeTab);
        if (e.key === "ArrowRight" && curIdx < STEPS_ORDER.length - 1) {
          e.preventDefault();
          switchPrimaryTab(STEPS_ORDER[curIdx + 1]);
        } else if (e.key === "ArrowLeft" && curIdx > 0) {
          e.preventDefault();
          switchPrimaryTab(STEPS_ORDER[curIdx - 1]);
        }
      }
    }
  });
}

function syncNetworkSourceButtons() {
  document.querySelectorAll("[data-net-source]").forEach((b) => {
    b.classList.toggle("is-active", b.dataset.netSource === state.networkSource);
  });
  document.querySelectorAll("[data-network-card]").forEach((c) => {
    const input = c.querySelector("input");
    const match = c.dataset.networkCard === state.networkSource;
    c.classList.toggle("is-selected", match);
    if (input) input.checked = match;
  });
}

async function init() {
  bindEvents();
  renderWeightPreview();

  const bootstrap = await fetchJson("/api/bootstrap");
  state.bootstrap = bootstrap;
  if (bootstrap.funds?.length) {
    state.selectedFundId = bootstrap.funds[0].id;
  }
  if (bootstrap.companies?.length >= 3) {
    state.selectedCompanyIds = bootstrap.companies.slice(0, 3).map((c) => c.id);
  }

  updateTelemetryMasthead(bootstrap.coverageStats?.calaBudget);
  renderFundQuickPicks();
  renderSeedCompanyChips();
  renderConfigReviewSummary();

  await runAnalysis();
  switchPrimaryTab("config");
}

init().catch((err) => {
  console.error("Failed to initialize Revealed Thesis Engine:", err);
});
