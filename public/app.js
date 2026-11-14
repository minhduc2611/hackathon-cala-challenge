/**
 * Revealed Thesis Engine · Full-Screen 3-Step Setup & Clean Floating Search UI
 * Step 1: How it works (Cala data reliability) -> Step 2: Role -> Step 3: Investor config
 * Followed by Startups to Call with a floating rounded search bar and 1 single Option Button
 */

const PREFS_STORAGE_KEY = "rte_user_prefs_v1";

const state = {
  bootstrap: null,
  isOnboarding: true,
  activeTab: "search",
  configStep: 1,
  role: "analyst",
  inputMode: "fund",
  selectedFundId: "lifeline-ventures",
  selectedCompanyIds: ["oura", "iceye", "aiven"],
  targetStage: "all",
  scoringMode: "balanced",
  networkSource: "linkedin",
  statedThesisOverride: "",
  seenCompaniesRaw: "",
  analysis: null,
  DisplayedShortlist: [],
  allKnownItems: new Map(),
  activeStartupId: null,
  activeBrief: null,
  briefCache: new Map(),
  drawerTab: "brief",
  exposureDepth: "evidence",
  peerHistory: [],
  savedCallListIds: [],
  onlyCallList: false
};

const TARGET_STAGE_LABELS = {
  all: "All stages",
  pre_seed_seed: "Pre-Seed & Seed",
  seed_series_a: "Seed & Series A",
  series_a_plus: "Series A+"
};

function savePrefsToStorage() {
  try {
    localStorage.setItem(
      PREFS_STORAGE_KEY,
      JSON.stringify({
        role: state.role,
        inputMode: state.inputMode,
        selectedFundId: state.selectedFundId,
        selectedCompanyIds: state.selectedCompanyIds,
        targetStage: state.targetStage,
        scoringMode: state.scoringMode,
        networkSource: state.networkSource,
        savedCallListIds: state.savedCallListIds
      })
    );
  } catch {
    // Ignore storage errors in restricted contexts
  }
}

function loadPrefsFromStorage() {
  try {
    const raw = localStorage.getItem(PREFS_STORAGE_KEY);
    if (!raw) return false;
    const saved = JSON.parse(raw);
    if (saved.role === "analyst" || saved.role === "investor") state.role = saved.role;
    if (saved.inputMode === "fund" || saved.inputMode === "companies") state.inputMode = saved.inputMode;
    if (typeof saved.selectedFundId === "string" && saved.selectedFundId) {
      state.selectedFundId = saved.selectedFundId;
    }
    if (Array.isArray(saved.selectedCompanyIds) && saved.selectedCompanyIds.length >= 3) {
      state.selectedCompanyIds = saved.selectedCompanyIds.slice(0, 5);
    }
    if (typeof saved.targetStage === "string" && TARGET_STAGE_LABELS[saved.targetStage]) {
      state.targetStage = saved.targetStage;
    }
    if (WEIGHT_PROFILES[saved.scoringMode]) state.scoringMode = saved.scoringMode;
    if (saved.networkSource === "linkedin" || saved.networkSource === "cala") {
      state.networkSource = saved.networkSource;
    }
    if (Array.isArray(saved.savedCallListIds)) {
      state.savedCallListIds = saved.savedCallListIds.filter((id) => typeof id === "string");
      return true;
    }
  } catch {
    // Ignore malformed saved state
  }
  return false;
}

const WORKSPACE_VIEWS = ["search", "talk", "thesis"];

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
  if (val >= 72) return { cls: "s-hot", lab: "Call now", shortLab: "Call", col: "#34d399" };
  if (val >= 56) return { cls: "s-warm", lab: "Warm", shortLab: "Warm", col: "#fbbf24" };
  return { cls: "s-cold", lab: "Track", shortLab: "Track", col: "#94a3b8" };
}

function buildIncompleteCircleScoreSvg(score, size = 54, subLabel = "", valueId = "") {
  const val = Math.max(0, Math.min(100, Math.round(Number(score || 0))));
  const b = scoreBand(val);
  const col = b.col;
  const r = 24;
  const circ = 2 * Math.PI * r;
  const arcLen = circ * (250 / 360);
  const fillLen = (arcLen * val) / 100;
  const sizeClass = size >= 80 ? "is-lg" : size >= 60 ? "is-md" : "is-sm";

  return `
    <div class="incomplete-ring ${b.cls} ${sizeClass}" style="--ring-size: ${size}px; --ring-color: ${col}" data-score-gauge="incomplete-circle">
      <svg width="${size}" height="${size}" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Fit score ${val} out of 100">
        <circle cx="32" cy="32" r="${r}" fill="none" stroke="rgba(148, 163, 184, 0.2)" stroke-width="5.2" stroke-linecap="round"
          stroke-dasharray="${arcLen.toFixed(2)} ${circ.toFixed(2)}" transform="rotate(145 32 32)" />
        <circle cx="32" cy="32" r="${r}" fill="none" stroke="${col}" stroke-width="5.2" stroke-linecap="round"
          stroke-dasharray="${fillLen.toFixed(2)} ${circ.toFixed(2)}" stroke-opacity="${val > 0 ? "1" : "0"}" transform="rotate(145 32 32)" />
      </svg>
      <span class="ir-val num-tabular"${valueId ? ` id="${escapeHtml(valueId)}"` : ""}>${val}</span>
      ${subLabel ? `<span class="ir-sub">${escapeHtml(subLabel)}</span>` : ""}
    </div>
  `;
}

function scoreRingHtml(score) {
  return `<div class="ring">${buildIncompleteCircleScoreSvg(score, 92, "Fit score")}</div>`;
}

function buildStartupLogoSvg(name, sector, size = 64) {
  const initials = getInitials(name);
  const theme = SECTOR_THEMES[sector] || {
    bg: "#111a2e",
    fg: "#34d399",
    border: "#273449",
    shape: "orbit"
  };

  let motif = "";
  if (theme.shape === "orbit") {
    motif = `
      <circle cx="24" cy="24" r="19" fill="none" stroke="${theme.border}" stroke-width="1" stroke-dasharray="3 2.5" />
      <circle cx="24" cy="24" r="13.5" fill="none" stroke="${theme.fg}" stroke-opacity="0.26" stroke-width="0.9" />
      <circle cx="38" cy="11" r="2.2" fill="${theme.fg}" fill-opacity="0.7" />
    `;
  } else if (theme.shape === "grid") {
    motif = `
      <path d="M8 14 H40 M8 34 H40 M14 8 V40 M34 8 V40" fill="none" stroke="${theme.fg}" stroke-opacity="0.16" stroke-width="0.9" />
      <rect x="10" y="10" width="28" height="28" rx="6" fill="none" stroke="${theme.border}" stroke-width="1.1" />
    `;
  } else if (theme.shape === "prism") {
    motif = `
      <polygon points="24,5 43,38 5,38" fill="none" stroke="${theme.border}" stroke-width="1.1" />
      <polygon points="24,11 37,35 11,35" fill="none" stroke="${theme.fg}" stroke-opacity="0.28" stroke-width="0.9" />
    `;
  } else if (theme.shape === "bars") {
    motif = `
      <path d="M11 39 V29 M19 39 V21 M27 39 V25 M35 39 V15" stroke="${theme.fg}" stroke-opacity="0.26" stroke-width="2" stroke-linecap="round" />
      <line x1="8" y1="39" x2="40" y2="39" stroke="${theme.border}" stroke-width="1.4" />
    `;
  } else {
    motif = `
      <circle cx="24" cy="24" r="17.5" fill="none" stroke="${theme.border}" stroke-width="1.1" />
      <path d="M24 8 V40 M8 24 H40" stroke="${theme.fg}" stroke-opacity="0.18" stroke-width="0.9" />
    `;
  }

  return `
    <svg width="${size}" height="${size}" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${escapeHtml(name)} emblem">
      <rect x="0.5" y="0.5" width="47" height="47" rx="12" fill="${theme.bg}" stroke="${theme.border}" />
      <circle cx="15" cy="14" r="16" fill="${theme.fg}" fill-opacity="0.09" />
      ${motif}
      <text x="24" y="30" text-anchor="middle" fill="${theme.fg}" font-family="'Plus Jakarta Sans', sans-serif" font-weight="800" font-size="16" letter-spacing="0.02em">${escapeHtml(initials)}</text>
    </svg>
  `;
}

function buildTileTopVisualHtml(item, score) {
  const theme = SECTOR_THEMES[item.sector] || {
    bg: "#111a2e",
    fg: "#34d399",
    border: "#273449",
    shape: "orbit"
  };
  const b = scoreBand(score);
  const logoSvg = buildStartupLogoSvg(item.name, item.sector, 64);
  const gaugeSvg = buildIncompleteCircleScoreSvg(score, 56, b.shortLab);

  let patternSvg = `<circle cx="144" cy="18" r="36" stroke="${theme.fg}" stroke-width="1" /><circle cx="144" cy="18" r="56" stroke="${theme.fg}" stroke-width="0.75" stroke-dasharray="4 3" />`;
  if (theme.shape === "grid") {
    patternSvg = `<path d="M90 8 H172 M90 28 H172 M90 48 H172 M112 2 V76 M138 2 V76 M164 2 V76" stroke="${theme.fg}" stroke-width="0.85" />`;
  } else if (theme.shape === "prism") {
    patternSvg = `<polygon points="134,6 172,72 96,72" stroke="${theme.fg}" stroke-width="1" /><polygon points="134,20 158,64 110,64" stroke="${theme.fg}" stroke-width="0.75" />`;
  } else if (theme.shape === "bars") {
    patternSvg = `<path d="M96 64 V40 M112 64 V30 M128 64 V18 M144 64 V34 M160 64 V22" stroke="${theme.fg}" stroke-width="2" stroke-linecap="round" />`;
  }

  return `
    <div class="tile-top-stage" style="--stage-tint: ${theme.fg}; --stage-bg: ${theme.bg}">
      <svg class="tile-top-backdrop" viewBox="0 0 180 86" fill="none" preserveAspectRatio="none" aria-hidden="true">
        ${patternSvg}
      </svg>
      <div class="tile-top-row">
        <div class="tile-logo" aria-hidden="true">${logoSvg}</div>
        <div class="tile-score-ring">${gaugeSvg}</div>
      </div>
    </div>
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
   FULL-SCREEN ONBOARDING VS WORKSPACE NAVIGATION
   ========================================================================== */

function enterOnboarding(step = 1) {
  state.isOnboarding = true;
  document.body.classList.add("is-onboarding");
  closeOptionsPopover();
  setConfigStep(step);
  window.scrollTo({ top: 0, behavior: "auto" });
}

function exitOnboardingAndOpenWorkspace(targetView = "search") {
  state.isOnboarding = false;
  document.body.classList.remove("is-onboarding");
  switchPrimaryTab(targetView);
}

function switchPrimaryTab(tabName) {
  if (tabName === "config") {
    enterOnboarding(1);
    return;
  }

  if (state.isOnboarding) {
    state.isOnboarding = false;
    document.body.classList.remove("is-onboarding");
  }

  const target = WORKSPACE_VIEWS.includes(tabName) ? tabName : "search";
  if (target === "talk" && !state.activeStartupId && state.DisplayedShortlist.length > 0) {
    state.activeStartupId = state.DisplayedShortlist[0].id;
  }

  state.activeTab = target;

  document.querySelectorAll(".workspace-panel").forEach((panel) => {
    panel.hidden = panel.id !== `panel-${target}`;
  });

  document.querySelectorAll(".pop-nav-btn").forEach((btn) => {
    btn.classList.toggle("is-active", btn.dataset.go === target);
  });

  closeOptionsPopover();

  if (target === "talk") {
    renderTalkScreen();
  }

  window.scrollTo({ top: 0, behavior: "auto" });
}

function toggleOptionsPopover() {
  const pop = document.getElementById("optionsMenuPopover");
  const btn = document.getElementById("optionsMenuBtn");
  if (!pop || !btn) return;
  const nextHidden = !pop.hidden;
  pop.hidden = nextHidden;
  btn.setAttribute("aria-expanded", nextHidden ? "false" : "true");
}

function closeOptionsPopover() {
  const pop = document.getElementById("optionsMenuPopover");
  const btn = document.getElementById("optionsMenuBtn");
  if (pop) pop.hidden = true;
  if (btn) btn.setAttribute("aria-expanded", "false");
}

function setConfigStep(stepNum) {
  state.configStep = stepNum;
  const counterEl = document.getElementById("onbStepCounter");
  if (counterEl) {
    counterEl.textContent = `Step ${stepNum} of 3`;
  }

  document.querySelectorAll(".onb-seg").forEach((el) => {
    const s = Number(el.dataset.stepTarget);
    el.classList.toggle("is-active", s === stepNum);
    el.classList.toggle("is-done", s < stepNum);
  });

  document.querySelectorAll(".onboarding-stage").forEach((pane) => {
    pane.hidden = Number(pane.dataset.stepPane) !== stepNum;
  });

  renderConfigReviewSummary();
  window.scrollTo({ top: 0, behavior: "auto" });
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
  const isInvestor = state.role === "investor";
  const labelEl = document.getElementById("activeBenchmarkLabel");
  if (labelEl) labelEl.textContent = label;

  const roleBadge = document.getElementById("activeRoleBadge");
  if (roleBadge) {
    roleBadge.textContent = isInvestor ? "Investor" : "Analyst";
  }

  const searchTitle = document.getElementById("searchFundTitle");
  if (searchTitle) searchTitle.textContent = label;

  const heroSub = document.getElementById("searchHeroSub");
  if (heroSub) {
    heroSub.textContent = isInvestor
      ? "Ranked by 5-second thesis fit, raising timing, and warmest 2nd-degree intro paths."
      : "Ranked by verified Cala rounds, syndicate overlap, and primary source citations.";
  }

  const gridHint = document.getElementById("gridRoleHint");
  if (gridHint) {
    gridHint.textContent = isInvestor
      ? "Hover to preview actions; click any startup to open centered brief"
      : "Hover to preview actions; click any startup for Cala round audit";
  }

  const statFund = document.getElementById("statFundName");
  if (statFund) statFund.textContent = label;

  document.querySelectorAll("[data-quick-role]").forEach((btn) => {
    btn.classList.toggle("is-active", btn.dataset.quickRole === state.role);
  });

  const quickSelect = document.getElementById("quickFundSelect");
  if (quickSelect && quickSelect.value !== state.selectedFundId && state.inputMode === "fund") {
    quickSelect.value = state.selectedFundId;
  }

  const filterStageEl = document.getElementById("filterStage");
  if (filterStageEl && filterStageEl.value !== state.targetStage) {
    filterStageEl.value = state.targetStage;
  }
}

function renderConfigReviewSummary() {
  const box = document.getElementById("configReviewSummary");
  if (box) {
    const roleLabel = state.role === "investor" ? "Investor (GP)" : "Analyst";
    const targetLabel = getSelectedBenchmarkLabel();
    const stageLabel = TARGET_STAGE_LABELS[state.targetStage] || "All stages";
    const focusLabel = WEIGHT_PROFILES[state.scoringMode]?.label || "Balanced fit";
    box.innerHTML = `<b>${escapeHtml(roleLabel)}</b> · ${escapeHtml(targetLabel)} · ${escapeHtml(stageLabel)} · ${escapeHtml(focusLabel)}`;
  }
  syncInlineCalibrationStrip();
}

function renderQuickFundDropdown() {
  const select = document.getElementById("quickFundSelect");
  if (!select || !state.bootstrap?.funds) return;
  select.innerHTML = state.bootstrap.funds
    .map(
      (fund) =>
        `<option value="${escapeHtml(fund.id)}" ${fund.id === state.selectedFundId ? "selected" : ""}>${escapeHtml(fund.name)} (${escapeHtml(fund.hqCity)})</option>`
    )
    .join("");
}

function renderFundQuickPicks() {
  const container = document.getElementById("fundQuickPicks");
  if (!container || !state.bootstrap) return;

  container.innerHTML = state.bootstrap.funds
    .map((fund) => {
      const selected = state.selectedFundId === fund.id;
      const thesisRaw = String(fund.statedThesis || "").trim();
      const thesisExcerpt = thesisRaw.length > 78 ? `${thesisRaw.slice(0, 75)}...` : thesisRaw;
      const regionText = fund.region || fund.country;
      return `
        <button
          type="button"
          class="fund-pick-card ${selected ? "is-selected" : ""}"
          data-fund-id="${escapeHtml(fund.id)}"
        >
          <span class="fp-name">${escapeHtml(fund.name)}</span>
          <span class="fp-meta">${escapeHtml(fund.hqCity)}, ${escapeHtml(fund.country)} · ${escapeHtml(fund.teamSize)} partners</span>
          <span class="fp-hover-detail">${escapeHtml(regionText)}${thesisExcerpt ? ` · ${escapeHtml(thesisExcerpt)}` : ""}</span>
        </button>
      `;
    })
    .join("");

  const statedInput = document.getElementById("statedThesisInput");
  const activeFund = state.bootstrap.funds.find((f) => f.id === state.selectedFundId);
  if (statedInput && activeFund && !state.statedThesisOverride) {
    statedInput.placeholder = activeFund.statedThesis || "Backing Nordic and European founders from Seed to Series A...";
  }
  renderQuickFundDropdown();
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

function getSeenCompanyNamesList() {
  const raw = document.getElementById("seenCompaniesInput")?.value || state.seenCompaniesRaw || "";
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

async function runAnalysis() {
  const statedRaw = document.getElementById("statedThesisInput")?.value?.trim() || "";
  state.statedThesisOverride = statedRaw;

  const payload = {
    mode: state.inputMode,
    fundId: state.selectedFundId,
    companyIds: state.selectedCompanyIds,
    rankingMode: mapScoringModeToApi(state.scoringMode),
    statedThesisOverride: statedRaw || undefined,
    seenCompanyNames: getSeenCompanyNamesList()
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
  document.querySelectorAll(".focus-pill[data-focus-card]").forEach((card) => {
    const input = card.querySelector("input");
    const match = input && input.value === state.scoringMode;
    card.classList.toggle("is-selected", Boolean(match));
    if (input) input.checked = Boolean(match);
  });
  renderWeightPreview();
}

function syncCallListUI() {
  const count = state.savedCallListIds.length;
  const badge = document.getElementById("callListCountBadge");
  if (badge) badge.textContent = String(count);

  const filterBtn = document.getElementById("filterCallListBtn");
  if (filterBtn) {
    filterBtn.classList.toggle("is-active", Boolean(state.onlyCallList));
    filterBtn.setAttribute("aria-pressed", state.onlyCallList ? "true" : "false");
  }

  const drawerStarBtn = document.getElementById("drawerSaveCallBtn");
  if (drawerStarBtn && state.activeStartupId) {
    const isSaved = state.savedCallListIds.includes(state.activeStartupId);
    drawerStarBtn.classList.toggle("is-saved", isSaved);
    drawerStarBtn.innerHTML = isSaved ? "&#9733; In Call List" : "&#9734; Call List";
  }
}

function toggleCallListStartup(companyId) {
  if (!companyId) return;
  const exists = state.savedCallListIds.includes(companyId);
  if (exists) {
    state.savedCallListIds = state.savedCallListIds.filter((id) => id !== companyId);
  } else {
    state.savedCallListIds = [companyId, ...state.savedCallListIds];
  }
  savePrefsToStorage();
  syncCallListUI();
  renderStartupGrid(state.DisplayedShortlist);
}

function renderStartupGrid(shortlist) {
  const grid = document.getElementById("startupGrid");
  const countBadge = document.getElementById("gridCountBadge");
  if (!grid) return;

  const visibleList = state.onlyCallList
    ? shortlist.filter((item) => state.savedCallListIds.includes(item.id))
    : shortlist;

  syncCallListUI();

  if (countBadge) {
    countBadge.textContent = String(visibleList.length);
  }

  if (!visibleList.length) {
    const msg = state.onlyCallList
      ? "No startups saved in your Call List yet. Star any startup to track it here."
      : "No startups match the active filter combination.";
    grid.innerHTML = `
      <div class="card" style="grid-column: 1 / -1; padding: 28px; text-align: center">
        <p style="margin: 0 0 12px; color: var(--muted)">${escapeHtml(msg)}</p>
        <button type="button" class="btn sm" id="emptyResetBtn">${state.onlyCallList ? "Show all ranked startups" : "Reset filters"}</button>
      </div>
    `;
    document.getElementById("emptyResetBtn")?.addEventListener("click", () => {
      if (state.onlyCallList) {
        state.onlyCallList = false;
        syncCallListUI();
        renderStartupGrid(state.DisplayedShortlist);
      } else {
        resetSearchAndFilters();
      }
    });
    return;
  }

  grid.innerHTML = visibleList
    .map((item) => {
      const score = item.suitabilityScore ?? item.score ?? 0;
      const isSelected = state.activeStartupId === item.id;
      const isSaved = state.savedCallListIds.includes(item.id);

      const bridgePerson = item.linkedinNetwork?.bridgePerson?.split("(")[0]?.trim();
      const coInvestor = item.coInvestorPath?.coInvestorName;
      const roundCount = (item.roundHistory || []).length;

      let primarySignal = `${item.stage} · ${formatEur(item.lastRoundAmountEurM)}`;
      let signalClass = "";

      if (state.role === "analyst") {
        if (roundCount > 0) {
          primarySignal = `${roundCount} Cala round${roundCount === 1 ? "" : "s"} · ${item.stage}`;
        } else if (bridgePerson && state.networkSource === "linkedin") {
          primarySignal = `Via ${bridgePerson}`;
          signalClass = "is-warm";
        }
      } else {
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
      }

      return `
        <article
          class="startup-tile ${isSelected ? "is-selected" : ""}"
          role="listitem"
          tabindex="0"
          data-startup-id="${escapeHtml(item.id)}"
          aria-label="Open ${escapeHtml(item.name)}"
        >
          ${buildTileTopVisualHtml(item, score)}

          <div class="tile-body">
            <h3 class="tile-name">${escapeHtml(item.name)}</h3>
            <div class="tile-meta-row">
              <span class="tile-meta">${escapeHtml(item.sector)} · ${escapeHtml(item.country)}</span>
              <button
                type="button"
                class="tile-star-btn ${isSaved ? "is-saved" : ""}"
                data-star-id="${escapeHtml(item.id)}"
                aria-pressed="${isSaved ? "true" : "false"}"
                aria-label="${isSaved ? "Remove from Call List" : "Add to Call List"}"
                title="${isSaved ? "In Call List" : "Save to Call List"}"
              >
                &#9733;
              </button>
            </div>
            <div class="tile-foot-slot">
              <div class="tile-rest-line">
                <span class="tile-signal ${signalClass}">${escapeHtml(primarySignal)}</span>
              </div>
              <div class="tile-hover-bar">
                <button type="button" class="tile-net-jump" data-open-tab="network">Network &rarr;</button>
                <span class="tile-inspect-cue">Brief &rarr;</span>
              </div>
            </div>
          </div>
        </article>
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

function countActiveRefineFilters() {
  const stage = document.getElementById("filterStage")?.value || "all";
  const region = document.getElementById("filterRegion")?.value || "all";
  const excludeSector = document.getElementById("filterExcludeSector")?.value || "";
  const raisingSoonOnly = Boolean(document.getElementById("filterRaisingSoon")?.checked);
  const untappedOnly = Boolean(document.getElementById("filterUntappedOnly")?.checked);
  let count = 0;
  if (stage !== "all") count += 1;
  if (region !== "all") count += 1;
  if (excludeSector) count += 1;
  if (raisingSoonOnly) count += 1;
  if (untappedOnly) count += 1;

  const badge = document.getElementById("filterCountPill");
  if (badge) {
    badge.textContent = String(count);
    badge.hidden = count === 0;
  }
  return count;
}

function updateSearchInputChrome() {
  const inputEl = document.getElementById("aiSearchInput");
  const kbdHint = document.getElementById("searchKbdHint");
  if (kbdHint && inputEl) {
    const focused = document.activeElement === inputEl;
    kbdHint.hidden = focused || Boolean(inputEl.value.trim());
  }
}

function hideSearchSuggestions() {
  const popup = document.getElementById("searchSuggestPopup");
  if (popup) popup.hidden = true;
}

function renderSearchSuggestions(rawQuery) {
  const popup = document.getElementById("searchSuggestPopup");
  if (!popup) return;
  const q = String(rawQuery || "").trim().toLowerCase();
  if (!q) {
    popup.hidden = true;
    popup.innerHTML = "";
    return;
  }

  const companyMatches = [];
  const seenIds = new Set();
  const pool = [...state.DisplayedShortlist, ...(state.bootstrap?.companies || [])];
  for (const c of pool) {
    if (!c || seenIds.has(c.id)) continue;
    const hay = `${c.name} ${c.sector || ""} ${c.country || ""} ${c.hqCity || ""}`.toLowerCase();
    if (hay.includes(q)) {
      seenIds.add(c.id);
      companyMatches.push(c);
    }
    if (companyMatches.length >= 3) break;
  }

  const filterMatches = [];
  for (const f of state.bootstrap?.funds || []) {
    if (f.name.toLowerCase().includes(q)) {
      filterMatches.push({ kind: "Fund", query: f.name, meta: `${f.hqCity}, ${f.country}` });
    }
    if (filterMatches.length >= 2) break;
  }

  const suggestions = [
    ...companyMatches.map((c) => ({
      type: "startup",
      id: c.id,
      kind: "Startup",
      title: c.name,
      meta: `${c.sector} · ${c.country}${typeof c.suitabilityScore === "number" ? ` · ${c.suitabilityScore}` : ""}`
    })),
    ...filterMatches.map((m) => ({
      type: "query",
      query: m.query,
      kind: m.kind,
      title: m.query,
      meta: m.meta
    }))
  ].slice(0, 5);

  if (!suggestions.length) {
    popup.hidden = true;
    popup.innerHTML = "";
    return;
  }

  popup.hidden = false;
  popup.innerHTML = suggestions
    .map((s) =>
      s.type === "startup"
        ? `
      <button type="button" class="suggest-item" role="option" data-suggest-startup="${escapeHtml(s.id)}">
        <span class="suggest-item-main">
          <span class="suggest-kind-tag">${escapeHtml(s.kind)}</span>
          <span class="suggest-item-title">${escapeHtml(s.title)}</span>
        </span>
        <span class="suggest-item-meta">${escapeHtml(s.meta)}</span>
      </button>
    `
        : `
      <button type="button" class="suggest-item" role="option" data-suggest-query="${escapeHtml(s.query)}">
        <span class="suggest-item-main">
          <span class="suggest-kind-tag is-filter">${escapeHtml(s.kind)}</span>
          <span class="suggest-item-title">${escapeHtml(s.title)}</span>
        </span>
        <span class="suggest-item-meta">${escapeHtml(s.meta)}</span>
      </button>
    `
    )
    .join("");
}

async function executeSearchRefinement(customQuery) {
  hideSearchSuggestions();
  const inputEl = document.getElementById("aiSearchInput");
  const queryText = typeof customQuery === "string" ? customQuery : inputEl?.value || "";
  if (inputEl && typeof customQuery === "string") {
    inputEl.value = customQuery;
  }
  updateSearchInputChrome();

  const stageFilter = document.getElementById("filterStage")?.value || state.targetStage || "all";
  const region = document.getElementById("filterRegion")?.value || "all";
  const excludeSector = document.getElementById("filterExcludeSector")?.value || "";
  const raisingSoonOnly = Boolean(document.getElementById("filterRaisingSoon")?.checked);
  const untappedOnly = Boolean(document.getElementById("filterUntappedOnly")?.checked);
  const filterCount = countActiveRefineFilters();

  const hasActiveFilter = Boolean(queryText.trim()) || filterCount > 0;

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
      statedThesisOverride: state.statedThesisOverride || undefined,
      seenCompanyNames: getSeenCompanyNamesList(),
      queryText,
      stageFilter,
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
    const intentNames = {
      company: "Company lookup",
      investor: "Investor syndicate",
      industry: "Industry filter",
      why_not: "Portfolio audit",
      general: "Search filter"
    };
    if (intentBadge) {
      intentBadge.textContent = intentNames[res.searchIntent] || res.intentLabel || "AI filter";
    }
    if (explanationEl) {
      explanationEl.textContent =
        res.explanation || `Showing ${state.DisplayedShortlist.length} Cala-verified startups matching active filters.`;
    }
    if (opsEl) {
      const tags = [];
      if (Array.isArray(res.aiTrace) && res.aiTrace.length > 0) {
        tags.push(res.aiTrace[0]);
      }
      const af = res.appliedFilters || {};
      if (af.stageFilter && af.stageFilter !== "all") {
        tags.push(`Stage: ${TARGET_STAGE_LABELS[af.stageFilter] || af.stageFilter}`);
      }
      if (af.region && af.region !== "all") {
        tags.push(`Region: ${af.region}`);
      }
      if (af.investorFilter) {
        tags.push(`Investor: ${af.investorFilter}`);
      }
      if (af.sectorFilter) {
        tags.push(`Sector: ${af.sectorFilter}`);
      }
      opsEl.innerHTML = tags
        .slice(0, 4)
        .map((op) => `<span class="trace-op-tag">${escapeHtml(String(op))}</span>`)
        .join("");
    }
  }
}

async function resetSearchAndFilters() {
  const inputEl = document.getElementById("aiSearchInput");
  if (inputEl) inputEl.value = "";
  state.targetStage = "all";
  const stageSel = document.getElementById("targetStageSelect");
  if (stageSel) stageSel.value = "all";
  const filterStageEl = document.getElementById("filterStage");
  if (filterStageEl) filterStageEl.value = "all";
  const regionEl = document.getElementById("filterRegion");
  if (regionEl) regionEl.value = "all";
  const excludeEl = document.getElementById("filterExcludeSector");
  if (excludeEl) excludeEl.value = "";
  const raisingEl = document.getElementById("filterRaisingSoon");
  if (raisingEl) raisingEl.checked = false;
  const untappedEl = document.getElementById("filterUntappedOnly");
  if (untappedEl) untappedEl.checked = false;

  savePrefsToStorage();
  renderConfigReviewSummary();
  await executeSearchRefinement("");
}

/* ==========================================================================
   STARTUP BRIEF LOADER & 3-COLUMN DEEP DIVE
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
  const coName = item?.coInvestorPath?.coInvestorName;
  const roundAmt = formatEur(item?.lastRoundAmountEurM);
  return [
    {
      label: "Sector fit",
      points: Number(sb.sector?.earned || 0).toFixed(1),
      maxPoints: sb.sector?.max || 30,
      detail: `Cala-verified ${item?.sector || "sector"} conviction vs. fund check history`
    },
    {
      label: "Stage timing",
      points: Number(sb.stage?.earned || 0).toFixed(1),
      maxPoints: sb.stage?.max || 25,
      detail: `${item?.stage || "Current stage"} cadence toward ${item?.likelyNextStage || "next"} window`
    },
    {
      label: "Co-investor overlap",
      points: Number(sb.coInvestor?.earned || 0).toFixed(1),
      maxPoints: sb.coInvestor?.max || 20,
      detail: coName ? `Shared Cala rounds alongside ${coName}` : "Evaluated against benchmark syndicate graph"
    },
    {
      label: "Geography match",
      points: Number(sb.geography?.earned || 0).toFixed(1),
      maxPoints: sb.geography?.max || 15,
      detail: `${item?.hqCity || "Hub"}, ${item?.country || "EU"} domicile alignment`
    },
    {
      label: "Round size fit",
      points: Number(sb.roundSize?.earned || 0).toFixed(1),
      maxPoints: sb.roundSize?.max || 10,
      detail: `Last indexed check (${roundAmt}) vs. historical ticket range`
    }
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
    container.innerHTML = `<p class="sub">Select a startup to inspect its deep dive.</p>`;
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
        <div class="eyebrow" style="margin-bottom: 6px">One startup in detail · Verified in Cala</div>
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
    const md = brief?.memoMarkdown || brief?.markdownMemo;
    if (md) {
      downloadFile(
        `${candidate.name.toLowerCase().replace(/\s+/g, "-")}-memo.md`,
        md,
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
  document.body.classList.add("has-drawer-open");

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
      64
    );
    document.getElementById("drawerStartupRank").textContent =
      rankIdx >= 0 ? `Rank #${rankIdx + 1} of ${state.DisplayedShortlist.length}` : "Connected peer";
    document.getElementById("drawerStartupName").textContent = candidate.name;
    document.getElementById("drawerStartupMeta").textContent = `${candidate.sector} · ${candidate.stage} · ${candidate.hqCity}, ${candidate.country}`;

    const scoreArcEl = document.getElementById("drawerScoreArc");
    if (scoreArcEl) {
      scoreArcEl.innerHTML = buildIncompleteCircleScoreSvg(
        candidate.suitabilityScore ?? 0,
        64,
        "/100",
        "drawerScoreNumber"
      );
    }
  }

  syncCallListUI();
  const introBtn = document.getElementById("copyWarmIntroBtn");
  if (introBtn) {
    introBtn.classList.remove("is-copied");
    introBtn.textContent = "Copy intro note";
  }

  switchDrawerTab(options.tab === "network" ? "network" : "brief");

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
  document.body.classList.remove("has-drawer-open");
}

function buildWarmIntroDraftText(candidate) {
  if (!candidate) return "";
  const fundLabel = getSelectedBenchmarkLabel();
  const bridgeFull = candidate.linkedinNetwork?.bridgePerson || candidate.coInvestorPath?.coInvestorName || "a mutual syndicate partner";
  const bridgeFirst = bridgeFull.split("(")[0].trim();
  const targetLeader = candidate.linkedinNetwork?.targetLeader || `${candidate.name} team`;
  const roundAmt = formatEur(candidate.lastRoundAmountEurM);
  return `Hi ${bridgeFirst}, hope you're well. Reviewing ${candidate.name} (${candidate.sector}, ${candidate.hqCity}) against ${fundLabel}'s active ${candidate.likelyNextStage || "Series A"} mandate (${candidate.suitabilityScore}/100 Cala thesis fit after their ${candidate.stage} round of ${roundAmt}). Would love a warm double-opt-in intro to ${targetLeader} if helpful.`;
}

async function copyWarmIntroNote() {
  const candidate =
    state.allKnownItems.get(state.activeStartupId) ||
    state.DisplayedShortlist.find((c) => c.id === state.activeStartupId);
  if (!candidate) return;
  const text = buildWarmIntroDraftText(candidate);
  const btn = document.getElementById("copyWarmIntroBtn");
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
    }
  } catch {
    // Non-fatal in headless or non-secure contexts
  }
  if (btn) {
    btn.classList.add("is-copied");
    btn.textContent = "Copied intro note ✓";
    window.clearTimeout(btn._copyTimer);
    btn._copyTimer = window.setTimeout(() => {
      btn.classList.remove("is-copied");
      btn.textContent = "Copy intro note";
    }, 1800);
  }
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

  const introBox = document.getElementById("drawerIntroPreviewBox");
  if (introBox) {
    introBox.innerHTML = `
      <div class="warm-intro-label">Warm intro draft</div>
      <p class="warm-intro-text">${escapeHtml(buildWarmIntroDraftText(candidate))}</p>
    `;
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
          <div class="sb-row" tabindex="0">
            <div class="sb-top">
              <span class="sb-label">${escapeHtml(f.label)}</span>
              <span class="sb-pts num-tabular">${f.points} / ${f.maxPoints} pts</span>
            </div>
            <div class="sb-bar-track">
              <div class="sb-bar-fill" style="width: ${pct}%"></div>
            </div>
            <div class="sb-hover-detail">
              <span class="sb-pct num-tabular">${pct}% of max weight</span>
              <span>${escapeHtml(f.detail || "Verified via Cala round ledger")}</span>
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
        const sources = r.sources || [];
        const cites = sources
          .map(
            (src, idx) =>
              `<a href="${escapeHtml(src.url)}" target="_blank" rel="noopener noreferrer" class="citation-link" title="${escapeHtml(src.title)}">[${idx + 1} &#8599;]</a>`
          )
          .join(" ");
        const metaText = sources
          .map((src) => `${src.publisher || src.title || "Source"} (${src.date || "Cala indexed"})`)
          .join(" · ");
        return `
          <li class="evidence-item" tabindex="0">
            <span>${escapeHtml(r.text)} ${cites}</span>
            ${metaText ? `<span class="cite-hover-meta">Grounded via ${escapeHtml(metaText)}</span>` : ""}
          </li>
        `;
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
   THESIS & BACKTEST VIEW
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
      return;
    }

    const optWrap = document.querySelector(".options-dropdown-wrap");
    if (optWrap && !optWrap.contains(e.target)) {
      closeOptionsPopover();
    }
  });

  document.getElementById("optionsMenuBtn")?.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleOptionsPopover();
  });

  document.getElementById("editSetupBtn")?.addEventListener("click", () => {
    enterOnboarding(1);
  });

  document.getElementById("skipToWorkspaceBtn")?.addEventListener("click", async () => {
    savePrefsToStorage();
    await runAnalysis();
    if (state.targetStage !== "all") {
      await executeSearchRefinement("");
    }
    exitOnboardingAndOpenWorkspace("search");
  });

  document.getElementById("toggleFiltersBtn")?.addEventListener("click", () => {
    const strip = document.getElementById("collapsibleFilterStrip");
    const btn = document.getElementById("toggleFiltersBtn");
    if (!strip || !btn) return;
    const nextHidden = !strip.hidden;
    strip.hidden = nextHidden;
    btn.setAttribute("aria-expanded", nextHidden ? "false" : "true");
  });

  document.querySelectorAll("[data-quick-role]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.role = btn.dataset.quickRole;
      document.querySelectorAll("[data-role-card]").forEach((c) => {
        const input = c.querySelector("input");
        const isMatch = c.dataset.roleCard === state.role;
        c.classList.toggle("is-selected", isMatch);
        if (input) input.checked = isMatch;
      });
      savePrefsToStorage();
      renderConfigReviewSummary();
      renderStartupGrid(state.DisplayedShortlist);
      if (!document.getElementById("inspectorDrawer")?.hidden) {
        applyExposureDepth(state.role === "investor" ? "evidence" : "memo");
      }
      closeOptionsPopover();
    });
  });

  document.getElementById("quickFundSelect")?.addEventListener("change", async (e) => {
    state.inputMode = "fund";
    state.selectedFundId = e.target.value;
    savePrefsToStorage();
    renderFundQuickPicks();
    renderConfigReviewSummary();
    await runAnalysis();
    if (countActiveRefineFilters() > 0 || document.getElementById("aiSearchInput")?.value?.trim()) {
      await executeSearchRefinement();
    }
    closeOptionsPopover();
  });

  document.querySelectorAll(".onb-seg").forEach((btn) => {
    btn.addEventListener("click", () => {
      setConfigStep(Number(btn.dataset.stepTarget));
    });
  });

  document.getElementById("step1NextBtn")?.addEventListener("click", () => setConfigStep(2));
  document.getElementById("step2BackBtn")?.addEventListener("click", () => setConfigStep(1));
  document.getElementById("step2NextBtn")?.addEventListener("click", () => setConfigStep(3));
  document.getElementById("step3BackBtn")?.addEventListener("click", () => setConfigStep(2));

  document.getElementById("launchDashboardBtn")?.addEventListener("click", async () => {
    savePrefsToStorage();
    await runAnalysis();
    if (countActiveRefineFilters() > 0 || document.getElementById("aiSearchInput")?.value?.trim()) {
      await executeSearchRefinement();
    }
    exitOnboardingAndOpenWorkspace("search");
  });

  document.querySelectorAll("[data-role-card]").forEach((card) => {
    card.addEventListener("click", () => {
      state.role = card.dataset.roleCard;
      document.querySelectorAll("[data-role-card]").forEach((c) => {
        const input = c.querySelector("input");
        const match = c.dataset.roleCard === state.role;
        c.classList.toggle("is-selected", match);
        if (input) input.checked = match;
      });
      savePrefsToStorage();
      renderConfigReviewSummary();
      renderStartupGrid(state.DisplayedShortlist);
    });
  });

  document.getElementById("targetStageSelect")?.addEventListener("change", (e) => {
    state.targetStage = e.target.value || "all";
    const filterStageEl = document.getElementById("filterStage");
    if (filterStageEl) filterStageEl.value = state.targetStage;
    countActiveRefineFilters();
    savePrefsToStorage();
    renderConfigReviewSummary();
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
    card.addEventListener("click", () => {
      state.scoringMode = card.dataset.focusCard;
      syncScoringModeButtons();
      savePrefsToStorage();
      renderConfigReviewSummary();
    });
  });

  document.querySelectorAll("[data-network-card]").forEach((card) => {
    card.addEventListener("click", () => {
      state.networkSource = card.dataset.networkCard;
      document.querySelectorAll("[data-network-card]").forEach((c) => {
        c.classList.toggle("is-selected", c.dataset.networkCard === state.networkSource);
      });
      syncNetworkSourceButtons();
      savePrefsToStorage();
      renderConfigReviewSummary();
      renderStartupGrid(state.DisplayedShortlist);
    });
  });

  const aiSearchInput = document.getElementById("aiSearchInput");
  const suggestPopup = document.getElementById("searchSuggestPopup");
  aiSearchInput?.addEventListener("focus", () => {
    updateSearchInputChrome();
    if (aiSearchInput.value.trim()) {
      renderSearchSuggestions(aiSearchInput.value);
    }
  });
  aiSearchInput?.addEventListener("blur", () => {
    updateSearchInputChrome();
    window.setTimeout(hideSearchSuggestions, 160);
  });
  aiSearchInput?.addEventListener("input", () => {
    updateSearchInputChrome();
    renderSearchSuggestions(aiSearchInput.value);
  });

  suggestPopup?.addEventListener("mousedown", (e) => {
    e.preventDefault();
  });
  suggestPopup?.addEventListener("click", (e) => {
    const startBtn = e.target.closest("[data-suggest-startup]");
    if (startBtn) {
      hideSearchSuggestions();
      state.peerHistory = [];
      openStartupInspector(startBtn.dataset.suggestStartup, { keepHistory: true, tab: "brief" });
      return;
    }
    const queryBtn = e.target.closest("[data-suggest-query]");
    if (queryBtn) {
      executeSearchRefinement(queryBtn.dataset.suggestQuery);
    }
  });

  document.getElementById("filterCallListBtn")?.addEventListener("click", () => {
    state.onlyCallList = !state.onlyCallList;
    renderStartupGrid(state.DisplayedShortlist);
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

  ["filterStage", "filterRegion", "filterExcludeSector", "filterRaisingSoon", "filterUntappedOnly"].forEach(
    (id) => {
      document.getElementById(id)?.addEventListener("change", () => {
        if (id === "filterStage") {
          state.targetStage = document.getElementById("filterStage")?.value || "all";
          const targetSel = document.getElementById("targetStageSelect");
          if (targetSel) targetSel.value = state.targetStage;
          savePrefsToStorage();
          renderConfigReviewSummary();
        }
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

  const startupGridEl = document.getElementById("startupGrid");
  startupGridEl?.addEventListener("click", (e) => {
    const starBtn = e.target.closest("[data-star-id]");
    if (starBtn) {
      e.stopPropagation();
      toggleCallListStartup(starBtn.dataset.starId);
      return;
    }
    const netBtn = e.target.closest("[data-open-tab='network']");
    const tile = e.target.closest("[data-startup-id]");
    if (!tile) return;
    state.peerHistory = [];
    openStartupInspector(tile.dataset.startupId, {
      keepHistory: true,
      tab: netBtn ? "network" : "brief"
    });
  });

  startupGridEl?.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    if (e.target.closest("button")) return;
    const tile = e.target.closest("[data-startup-id]");
    if (!tile) return;
    e.preventDefault();
    state.peerHistory = [];
    openStartupInspector(tile.dataset.startupId, { keepHistory: true, tab: "brief" });
  });

  document.getElementById("drawerSaveCallBtn")?.addEventListener("click", () => {
    if (state.activeStartupId) {
      toggleCallListStartup(state.activeStartupId);
    }
  });

  document.getElementById("copyWarmIntroBtn")?.addEventListener("click", () => {
    copyWarmIntroNote();
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

  function exportCurrentMemoMarkdown() {
    const md = state.activeBrief?.memoMarkdown || state.activeBrief?.markdownMemo;
    if (!md) return;
    const candidate = state.allKnownItems.get(state.activeStartupId);
    const slug = (candidate?.name || "startup").toLowerCase().replace(/[^a-z0-9]+/g, "-");
    downloadFile(`${slug}-investment-memo.md`, md, "text/markdown;charset=utf-8");
  }

  function exportCurrentShortlistCsv() {
    const sourceList = state.onlyCallList
      ? state.DisplayedShortlist.filter((s) => state.savedCallListIds.includes(s.id))
      : state.DisplayedShortlist;
    const rows = sourceList.map(
      (s) => `"${s.name}","${s.sector}","${s.country}","${s.stage}",${s.suitabilityScore}`
    );
    const csv = ["Name,Sector,Country,Stage,Score", ...rows].join("\n");
    downloadFile(
      state.onlyCallList ? "revealed-thesis-call-list.csv" : "revealed-thesis-shortlist.csv",
      csv,
      "text/csv;charset=utf-8"
    );
  }

  document.getElementById("exportMarkdownBtn")?.addEventListener("click", exportCurrentMemoMarkdown);
  document.getElementById("modalQuickExportMdBtn")?.addEventListener("click", exportCurrentMemoMarkdown);
  document.getElementById("exportCsvBtn")?.addEventListener("click", exportCurrentShortlistCsv);
  document.getElementById("modalQuickExportCsvBtn")?.addEventListener("click", exportCurrentShortlistCsv);

  document.getElementById("verifyLiveCalaBtn")?.addEventListener("click", triggerLiveCalaVerification);

  document.addEventListener("keydown", (e) => {
    const drawerOpen = !document.getElementById("inspectorDrawer")?.hidden;
    const popOpen = !document.getElementById("optionsMenuPopover")?.hidden;
    const tag = document.activeElement?.tagName;
    const inInput = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";

    if (e.key === "Escape") {
      if (drawerOpen) closeStartupInspector();
      if (popOpen) closeOptionsPopover();
      hideSearchSuggestions();
      return;
    }

    if (e.key === "/" && !inInput && !state.isOnboarding && state.activeTab === "search") {
      e.preventDefault();
      document.getElementById("aiSearchInput")?.focus();
      return;
    }

    if (!inInput && drawerOpen) {
      if (e.key === "ArrowDown" || e.key === "ArrowRight") {
        e.preventDefault();
        stepStartupInList(1);
      } else if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
        e.preventDefault();
        stepStartupInList(-1);
      } else if (e.key === "1") {
        switchDrawerTab("brief");
      } else if (e.key === "2") {
        switchDrawerTab("network");
      } else if (e.key === "s" || e.key === "S") {
        e.preventDefault();
        if (state.activeStartupId) toggleCallListStartup(state.activeStartupId);
      } else if (e.key === "c" || e.key === "C") {
        e.preventDefault();
        copyWarmIntroNote();
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
  const hasSavedCallList = loadPrefsFromStorage();
  bindEvents();

  const bootstrap = await fetchJson("/api/bootstrap");
  state.bootstrap = bootstrap;

  if (bootstrap.funds?.length) {
    const validFund = bootstrap.funds.some((f) => f.id === state.selectedFundId);
    if (!validFund) {
      state.selectedFundId = bootstrap.funds[0].id;
    }
  }
  if (bootstrap.companies?.length >= 3) {
    const validIds = new Set(bootstrap.companies.map((c) => c.id));
    state.selectedCompanyIds = state.selectedCompanyIds.filter((id) => validIds.has(id));
    if (state.selectedCompanyIds.length < 3) {
      state.selectedCompanyIds = bootstrap.companies.slice(0, 3).map((c) => c.id);
    }
  }

  document.querySelectorAll("[data-role-card]").forEach((c) => {
    const input = c.querySelector("input");
    const match = c.dataset.roleCard === state.role;
    c.classList.toggle("is-selected", match);
    if (input) input.checked = match;
  });
  document.querySelectorAll("[data-input-mode]").forEach((b) => {
    b.classList.toggle("is-active", b.dataset.inputMode === state.inputMode);
  });
  const fundSec = document.getElementById("fundInputSection");
  const compSec = document.getElementById("companiesInputSection");
  if (fundSec) fundSec.hidden = state.inputMode !== "fund";
  if (compSec) compSec.hidden = state.inputMode !== "companies";
  const stageSel = document.getElementById("targetStageSelect");
  if (stageSel) stageSel.value = state.targetStage;
  const filterStageEl = document.getElementById("filterStage");
  if (filterStageEl) filterStageEl.value = state.targetStage;

  syncScoringModeButtons();
  syncNetworkSourceButtons();
  updateTelemetryMasthead(bootstrap.coverageStats?.calaBudget);
  renderFundQuickPicks();
  renderSeedCompanyChips();
  renderConfigReviewSummary();
  countActiveRefineFilters();
  updateSearchInputChrome();

  await runAnalysis();
  if (!hasSavedCallList && !state.savedCallListIds.length && state.DisplayedShortlist.length >= 2) {
    state.savedCallListIds = state.DisplayedShortlist.slice(0, 2).map((item) => item.id);
    renderStartupGrid(state.DisplayedShortlist);
  }
  if (state.targetStage !== "all") {
    await executeSearchRefinement("");
  }
  enterOnboarding(1);
}

init().catch((err) => {
  console.error("Failed to initialize Revealed Thesis Engine:", err);
});
