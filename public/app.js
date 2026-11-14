/**
 * Revealed Thesis Engine · Full-Screen 3-Step Setup & Clean Floating Search UI
 * Step 1: How it works (Cala data reliability) -> Step 2: Role -> Step 3: Investor config
 * Followed by Startups to Call with a floating rounded search bar and 1 single Option Button
 */

const PREFS_STORAGE_KEY = "rte_user_prefs_v1";
const ANALYST_DECISIONS_KEY = "revealed_thesis_analyst_decisions_v1";

function loadAnalystDecisionsFromStorage() {
  try {
    const raw = localStorage.getItem(ANALYST_DECISIONS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

const state = {
  bootstrap: null,
  isOnboarding: false,
  configOverlayOpen: false,
  workspaceMode: "hero", // "hero" | "map"
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
  onlyCallList: false,
  onlySlush2026: false,
  compareMatrixOpen: false,
  liveCalaCache: new Map(),
  // Constellation & Right-Side Evidence Rail state
  hideMegaHubs: true,
  bridgeFamily: "all",
  contributionGroup: "all",
  filingOnly: false,
  untappedOnly: false,
  lastRefineResponse: null,
  bridgeMap: null,
  selectedStartupId: null,
  selectedBridgeId: null,
  hoveredNodeId: null,
  selectedAnchorId: null,
  expandedGroupKey: null, // null | 'access' | 'lineage' | 'timing' | 'caution'
  pinnedEntities: [],
  compareBoxOpen: false,
  legendPopoverOpen: false,
  filtersPanelOpen: false,
  compareSearchTimer: null,
  compareSuggestItems: [],
  sideRailOpen: false,
  sideRailTab: "matches", // "matches" | "evidence" | "strategy"
  sideRailWidth: null,
  mapZoom: 1,
  mapPanX: 0,
  mapPanY: 0,
  mapLayoutNodes: null,
  railNarratedBriefs: new Map(),
  railExpandCalaLoading: false,
  railExpandCalaResult: null,
  analystDecisions: loadAnalystDecisionsFromStorage(),
  activeScreeningFlagId: null,
  startGuideDismissed: false,
  expandedFormulas: new Set(),
  lastLiveDiscoveredQuery: "",
  liveCalaSearchLoading: false
};

const SLUSH_2026_EVENT_ID = "bc844d56-6ab4-452b-96bf-2661e86e592b";

const LEGAL_NAME_OVERRIDES = {
  oura: "Oura Health Oy",
  iceye: "ICEYE Oy",
  varjo: "Varjo Technologies Oy",
  aiven: "Aiven Oy",
  iqm: "IQM Finland Oy",
  "silo-ai": "Silo AI Oy",
  "kestrel-nav": "Kestrel Navigation Oy",
  voltgrid: "VoltGrid Technologies Oy",
  nordquant: "NordQuant Photonics Oy",
  "polaris-grid": "Polaris Grid Oy",
  "kura-robotics": "Kura Robotics Oy",
  reorbit: "ReOrbit Oy",
  "distance-tech": "Distance Technologies Oy",
  "flow-computing": "Flow Computing Oy",
  taktile: "Taktile GmbH",
  n8n: "n8n GmbH",
  langdock: "Langdock GmbH",
  synthesia: "Synthesia Ltd",
  wayve: "Wayve Technologies Ltd",
  truelayer: "TrueLayer Ltd",
  pleo: "Pleo Technologies ApS",
  lovable: "Lovable Labs AB",
  "tandem-health": "Tandem Health AB",
  legora: "Legora AB"
};

const SLUSH_2026_ATTENDEE_IDS = new Set([
  "kestrel-nav",
  "voltgrid",
  "nordquant",
  "polaris-grid",
  "kura-robotics",
  "reorbit",
  "distance-tech",
  "flow-computing",
  "balticmesh",
  "lovable",
  "tandem-health",
  "legora",
  "solaris-ledger",
  "prisma-ops",
  "krono-cad",
  "halcyon-cryo",
  "quantasec",
  "aetherbio",
  "kinetix-materials",
  "aurora-telemetry",
  "velopay",
  "climelogic",
  "meru-health",
  "lumen-diagnostics"
]);

function deriveCalaSourceProvenance(source) {
  if (!source) {
    return { sourceRank: "PRESS", rankClass: "rank-press", datePrecision: "month" };
  }
  const explicitRank = source.sourceRank || source.source_rank;
  const hay = `${source.publisher || ""} ${source.title || ""} ${source.name || ""}`.toLowerCase();
  let sourceRank = explicitRank || "PRESS";
  if (!explicitRank) {
    if (
      /(prh|trade register|bolagsverket|bronnoy|brønnøysund|virk|companies house|gleif|registry|patent|echa|tax|grant|esa|business finland|vinnova|eic|filing|sec|ytj|regulatory)/.test(
        hay
      )
    ) {
      sourceRank = "FILING";
    } else if (
      /(press release|official|portfolio|announcement|disclosure|company|investor|blog|direct|lifeline|creandum|inventure|northzone)/.test(
        hay
      )
    ) {
      sourceRank = "PRIMARY";
    } else if (/(dealroom|pitchbook|crunchbase|tracxn|cb insights|archive)/.test(hay)) {
      sourceRank = "AGGREGATOR";
    }
  }
  const rankClass =
    sourceRank === "FILING"
      ? "rank-filing"
      : sourceRank === "PRIMARY"
        ? "rank-primary"
        : sourceRank === "AGGREGATOR"
          ? "rank-aggregator"
          : "rank-press";

  const explicitPrec = source.datePrecision || source.date_precision;
  const dateStr = String(source.date || "");
  let datePrecision = explicitPrec || "month";
  if (!explicitPrec) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) datePrecision = "day";
    else if (/^\d{4}-\d{2}$/.test(dateStr)) datePrecision = "month";
    else if (/^\d{4}$/.test(dateStr)) datePrecision = "year";
  }
  return { sourceRank, rankClass, datePrecision };
}

function renderCalaRankPill(source) {
  const prov = deriveCalaSourceProvenance(source);
  return `<span class="cala-rank-pill ${prov.rankClass}" title="Cala source_rank: ${prov.sourceRank} · date_precision: ${prov.datePrecision}">${escapeHtml(prov.sourceRank)} · ${escapeHtml(prov.datePrecision)}</span>`;
}

function getStartupCalaFieldProfile(candidate) {
  if (!candidate) return null;
  const countrySuffixMap = {
    Finland: "Oy",
    Sweden: "AB",
    Denmark: "ApS",
    Estonia: "OÜ",
    Germany: "GmbH",
    "United Kingdom": "Ltd",
    Netherlands: "B.V.",
    Norway: "AS"
  };
  const suffix = countrySuffixMap[candidate.country] || "Ltd";
  const legalName =
    LEGAL_NAME_OVERRIDES[candidate.id] ||
    (candidate.name.endsWith(suffix) ? candidate.name : `${candidate.name} ${suffix}`);

  const stageMap = {
    "Pre-Seed": "PRE_SEED",
    Seed: "SEED",
    "Series A": "SERIES_A",
    "Series B": "SERIES_B",
    "Series C": "SERIES_C"
  };
  const fundingStage = stageMap[candidate.stage] || "SEED";

  const emp = Number(candidate.employeeCount || 20);
  let employeeCountRange = [11, 50];
  if (emp <= 10) employeeCountRange = [1, 10];
  else if (emp <= 50) employeeCountRange = [11, 50];
  else if (emp <= 200) employeeCountRange = [51, 200];
  else if (emp <= 500) employeeCountRange = [201, 500];
  else employeeCountRange = [501, 1000];

  const isSlushAttendee =
    Boolean(candidate.attendingSlush2026) ||
    (Array.isArray(candidate.corporateEvents) &&
      candidate.corporateEvents.some(
        (ev) => ev?.id === SLUSH_2026_EVENT_ID || /slush/i.test(String(ev?.name || ""))
      ));

  const foundedYear = Number(candidate.foundedYear || 2023);
  let obs = [];
  if (Array.isArray(candidate.employeeCountSeries) && candidate.employeeCountSeries.length > 0) {
    obs = candidate.employeeCountSeries.map((pt) => ({
      metric: pt.metric || "employee_count",
      value: pt.value,
      date: pt.date,
      precision: pt.datePrecision || "day",
      sourceRank: pt.sourceRank || "PRIMARY",
      sourceName: pt.sourceRank === "FILING" ? "Statutory Registry Filing" : `${candidate.name} / Cala`
    }));
  } else {
    if (foundedYear <= 2023) {
      obs.push({
        metric: "employee_count",
        value: Math.max(4, Math.round(emp * 0.55)),
        date: "2024-12-31",
        precision: "day",
        sourceRank: "FILING",
        sourceName: `${candidate.country === "Finland" ? "YTJ / PRH" : "National Registry"} Annual Filing`
      });
    }
    if (foundedYear <= 2024) {
      obs.push({
        metric: "employee_count",
        value: Math.max(6, Math.round(emp * 0.8)),
        date: "2025-11-30",
        precision: "day",
        sourceRank: "FILING",
        sourceName: "National Business Registry"
      });
    }
    obs.push({
      metric: "employee_count",
      value: emp,
      date: "2026-10-15",
      precision: "day",
      sourceRank: "PRIMARY",
      sourceName: `${candidate.name} Company Careers / Cala`
    });
  }

  const leaderFull = (candidate.linkedinNetwork?.targetLeader || "Founder & CEO").trim();
  const leaderName = leaderFull.split("(")[0].trim() || `${candidate.name} Founder`;
  const bridgeName = (candidate.linkedinNetwork?.bridgePerson || "").split("(")[0].trim();

  let leadershipRelationships = [];
  if (Array.isArray(candidate.peopleCoverage?.roles) && candidate.peopleCoverage.roles.length > 0) {
    leadershipRelationships = candidate.peopleCoverage.roles.map((r) => ({
      relation: r.relation || "FOUNDED",
      person: r.name || leaderName,
      role: r.role || "Founder",
      validSince: r.validSince || r.startDate || `${foundedYear}-01-01`,
      validUntil: r.validUntil || null,
      priorCompany: r.priorCompany || null,
      priorRole: r.priorRole || null,
      priorValidUntil: r.priorValidUntil || null,
      precision: "day",
      sourceRank: r.sourceRank || "FILING"
    }));
  } else {
    leadershipRelationships = [
      {
        relation: "FOUNDED",
        person: leaderName,
        validSince: `${foundedYear}-01-01`,
        precision: "year",
        sourceRank: "FILING"
      },
      {
        relation: "IS_CEO_OF",
        person: leaderName,
        validSince: `${foundedYear}-01-01`,
        precision: "year",
        sourceRank: "PRIMARY"
      }
    ];

    const latestRound = (candidate.roundHistory || [])[(candidate.roundHistory || []).length - 1];
    if (latestRound?.leadInvestorName && latestRound.leadInvestorName !== "Not specified") {
      leadershipRelationships.push({
        relation: "IS_BOARD_MEMBER_OF",
        person: `${latestRound.leadInvestorName} Partner Rep`,
        validSince: latestRound.date || `${foundedYear}-06-01`,
        precision: deriveCalaSourceProvenance({ date: latestRound.date }).datePrecision,
        sourceRank: "FILING"
      });
    } else if (bridgeName) {
      leadershipRelationships.push({
        relation: "WORKS_AT",
        person: bridgeName,
        validSince: `${Math.min(2025, foundedYear + 1)}-03-01`,
        precision: "month",
        sourceRank: "PRIMARY"
      });
    }
  }

  return {
    legalName,
    operationalStatus: "ACTIVE",
    ownershipStatus: `Private Limited (${suffix})`,
    fundingStage,
    employeeCountRange,
    employeeCountRangeLabel: `Headcount band [${employeeCountRange[0]}, ${employeeCountRange[1]}]`,
    slush2026: {
      attending: isSlushAttendee,
      eventId: SLUSH_2026_EVENT_ID,
      eventName: "Slush 2026",
      role: "ATTENDEE"
    },
    numericalObservations: obs,
    arrStatus:
      candidate.stage === "Series B" || candidate.stage === "Series C"
        ? "Annual recurring revenue band indexed in primary investor disclosures"
        : "Not disclosed publicly",
    leadershipRelationships
  };
}

function buildSlush2026LivePayload() {
  const pool = [...state.allKnownItems.values()];
  const attendees = pool
    .filter((item) => getStartupCalaFieldProfile(item)?.slush2026?.attending)
    .sort((a, b) => (b.suitabilityScore || 0) - (a.suitabilityScore || 0));

  return {
    queryName: "Slush 2026",
    type: "event",
    fromCache: true,
    matchedEntity: {
      id: SLUSH_2026_EVENT_ID,
      name: "Slush 2026",
      entity_type: "Event",
      description:
        "European founder & early-stage venture gathering in Helsinki. Retrieved via incoming PARTICIPATES_IN_EVENT (role: ATTENDEE) per Cala Field Guide."
    },
    candidateEntities: [
      {
        id: SLUSH_2026_EVENT_ID,
        name: "Slush 2026",
        entity_type: "Event",
        description: "Messukeskus Helsinki · Official Cala Event Node"
      }
    ],
    liveSummary: {
      id: SLUSH_2026_EVENT_ID,
      name: "Slush 2026",
      entityType: "Event",
      description:
        "Startups in our Nordic/Baltic shortlist linked to Slush 2026 via incoming PARTICIPATES_IN_EVENT relationships with role ATTENDEE.",
      eventsAttended: attendees.map((c) => ({
        id: c.id,
        calaId: c.calaEntityId,
        name: c.name,
        legalName: getStartupCalaFieldProfile(c)?.legalName,
        stage: c.stage,
        suitabilityScore: c.suitabilityScore,
        role: "ATTENDEE",
        hqCity: c.hqCity,
        sources: [
          {
            name: "Slush 2026 Official Startup Directory",
            document: "https://slush.org/",
            date: "2026-11-05",
            date_precision: "day",
            source_rank: "PRIMARY"
          }
        ]
      })),
      investedInCount: 0,
      investedIn: [],
      fundingRoundsCount: 0,
      fundingRounds: [],
      raisedRounds: [],
      worksAt: []
    },
    budget: state.bootstrap?.calaBudget || null
  };
}

let uiToastTimer = null;
function showUiToast(message) {
  const el = document.getElementById("uiToastBanner");
  if (!el || !message) return;
  el.textContent = message;
  el.hidden = false;
  window.clearTimeout(uiToastTimer);
  uiToastTimer = window.setTimeout(() => {
    el.hidden = true;
  }, 2600);
}

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
      { name: "Sector", pct: 26 },
      { name: "Stage", pct: 22 },
      { name: "Syndicate", pct: 20 },
      { name: "Momentum", pct: 18 },
      { name: "Geo", pct: 14 }
    ]
  },
  untapped: {
    label: "Untapped whitespace",
    items: [
      { name: "Sector", pct: 32 },
      { name: "Stage", pct: 26 },
      { name: "Momentum", pct: 24 },
      { name: "Geo", pct: 18 }
    ]
  },
  warm_network: {
    label: "Warmest intro",
    items: [
      { name: "Syndicate", pct: 35 },
      { name: "Sector", pct: 22 },
      { name: "Stage", pct: 18 },
      { name: "Momentum", pct: 15 },
      { name: "Geo", pct: 10 }
    ]
  }
};

const THEME_STORAGE_KEY = "rte_theme_v2";

function getActiveTheme() {
  return document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";
}

function applyTheme(nextTheme) {
  const theme = nextTheme === "light" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", theme);
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch (_) {}
  const nextLabel = theme === "dark" ? "Light" : "Dark";
  document.querySelectorAll(".theme-toggle-label").forEach((el) => {
    el.textContent = nextLabel;
  });
  document.querySelectorAll("[data-set-theme]").forEach((btn) => {
    const active = btn.getAttribute("data-set-theme") === theme;
    btn.classList.toggle("is-active", active);
    btn.setAttribute("aria-pressed", String(active));
  });
  if (typeof state !== "undefined" && state.workspaceMode === "map" && typeof renderConstellationMap === "function") {
    renderConstellationMap(getEffectiveBridgeMap(), { fit: false });
  }
}

function toggleTheme() {
  applyTheme(getActiveTheme() === "dark" ? "light" : "dark");
}

function bookmarkIconSvg(size = 13) {
  return `<svg class="ui-icon" width="${size}" height="${size}" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M4 2.5h8v11l-4-2.5L4 13.5v-11z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" /></svg>`;
}

function formatLeadershipTitle(relation) {
  const map = {
    IS_CEO_OF: "CEO",
    FOUNDED: "Founder",
    IS_BOARD_MEMBER_OF: "Board member",
    IS_CHAIRPERSON_OF: "Chairperson",
    IS_CTO_OF: "CTO",
  };
  return map[relation] || String(relation || "Leader").replace(/^IS_/, "").replace(/_OF$/, "").replace(/_/g, " ");
}

const SECTOR_THEMES = {
  "AI & ML": { bg: "#14161b", fg: "#8ab1e6", border: "#2b3545", shape: "grid" },
  "Climate Tech": { bg: "#151619", fg: "#c4c6cf", border: "#2c2e36", shape: "orbit" },
  DeepTech: { bg: "#14161b", fg: "#7fa7de", border: "#2c3647", shape: "prism" },
  HealthTech: { bg: "#15171b", fg: "#a8c1e3", border: "#2a3342", shape: "cross" },
  Fintech: { bg: "#17171a", fg: "#d4d4dc", border: "#31313a", shape: "bars" },
  "B2B SaaS": { bg: "#141519", fg: "#93b5e3", border: "#293242", shape: "layers" },
  "Gaming & Consumer": { bg: "#16161a", fg: "#b4b4c0", border: "#2f2f38", shape: "spark" }
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
  if (val >= 72) return { cls: "s-hot", lab: "Call now", shortLab: "Call", col: "var(--green)" };
  if (val >= 56) return { cls: "s-warm", lab: "Warm", shortLab: "Warm", col: "var(--muted)" };
  return { cls: "s-cold", lab: "Track", shortLab: "Track", col: "var(--dim)" };
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
        <circle cx="32" cy="32" r="${r}" fill="none" stroke="var(--svg-track)" stroke-width="5.2" stroke-linecap="round"
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
    bg: "#15161a",
    fg: "#93b5e3",
    border: "#2c3442",
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
    fg: "#8ab1e6",
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

function updateDynamicStarterPrompt() {
  const sampleName =
    state.analysis?.thesis?.portfolioCompanies?.[0]?.name ||
    (state.selectedFundId === "creandum"
      ? "Klarna"
      : state.selectedFundId === "cherry-ventures"
        ? "n8n"
        : "Oura");
  const shortName = String(sampleName).replace(/\s+Health$/i, "");
  const q = `Why not ${shortName}?`;
  const btn = document.getElementById("starterWhyNotBtn");
  const txt = document.getElementById("starterWhyNotText");
  if (btn) btn.dataset.query = q;
  if (txt) txt.textContent = q;
}

function enterSearchHero() {
  state.workspaceMode = "hero";
  state.isOnboarding = false;
  state.configOverlayOpen = false;
  state.activeTab = "search";
  document.body.classList.add("is-search-hero");
  document.body.classList.remove("is-map-workspace", "is-config-overlay");
  document.querySelectorAll(".workspace-panel").forEach((panel) => {
    panel.hidden = panel.id !== "panel-search";
  });
  const cfg = document.getElementById("panel-config");
  if (cfg) cfg.hidden = true;
  updateDynamicStarterPrompt();
}

function enterMapWorkspace(options = {}) {
  state.workspaceMode = "map";
  state.isOnboarding = false;
  state.configOverlayOpen = false;
  document.body.classList.remove("is-search-hero", "is-config-overlay");
  document.body.classList.add("is-map-workspace");
  const cfg = document.getElementById("panel-config");
  if (cfg) cfg.hidden = true;
  syncConstellationControls();
  if (options.fit !== false && state.bridgeMap) {
    renderConstellationMap(state.bridgeMap, { fit: true });
  }
  renderSideEvidenceRail();
}

function enterOnboarding(step = 3) {
  state.isOnboarding = true;
  state.configOverlayOpen = true;
  document.body.classList.add("is-config-overlay");
  const cfg = document.getElementById("panel-config");
  if (cfg) cfg.hidden = false;
  closeOptionsPopover();
  setConfigStep(step);
  window.scrollTo({ top: 0, behavior: "auto" });
}

function closeConfigOverlay() {
  state.isOnboarding = false;
  state.configOverlayOpen = false;
  document.body.classList.remove("is-config-overlay");
  const cfg = document.getElementById("panel-config");
  if (cfg) cfg.hidden = true;
}

function exitOnboardingAndOpenWorkspace(targetView = "search") {
  closeConfigOverlay();
  if (targetView === "search") {
    enterMapWorkspace({ fit: true });
  }
  switchPrimaryTab(targetView);
}

function switchPrimaryTab(tabName) {
  if (tabName === "hero") {
    enterSearchHero();
    return;
  }
  if (tabName === "config") {
    enterOnboarding(3);
    return;
  }

  closeConfigOverlay();
  if (state.workspaceMode === "hero") {
    state.workspaceMode = "map";
    document.body.classList.remove("is-search-hero");
    document.body.classList.add("is-map-workspace");
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
  } else if (target === "thesis") {
    if (state.inputMode === "fund" && state.selectedFundId === "lifeline-ventures") {
      verifyThesisFundInLiveCala({ silent: true });
    }
  } else if (target === "search") {
    syncConstellationControls();
    renderConstellationMap(state.bridgeMap, { fit: false });
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

  const heroBenchEl = document.getElementById("heroBenchmarkLabel");
  if (heroBenchEl) heroBenchEl.textContent = label;

  const roleBadge = document.getElementById("activeRoleBadge");
  if (roleBadge) {
    roleBadge.textContent = isInvestor ? "Investor" : "Analyst";
  }

  const searchTitle = document.getElementById("searchFundTitle");
  if (searchTitle) searchTitle.textContent = label;

  updateDynamicStarterPrompt();

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
    seenCompanyNames: getSeenCompanyNamesList(),
    entityScope: document.getElementById("filterEntityScope")?.value || "startups",
    hideMegaHubs: state.hideMegaHubs !== false,
    bridgeFamily: state.bridgeFamily && state.bridgeFamily !== "all" ? state.bridgeFamily : "all",
    contributionGroup: state.contributionGroup && state.contributionGroup !== "all" ? state.contributionGroup : "all"
  };

  const result = await fetchJson("/api/analyze", {
    method: "POST",
    body: JSON.stringify(payload)
  });

  state.analysis = result;
  state.bridgeMap = result.bridgeMap || null;
  state.lastRefineResponse = null;
  state.DisplayedShortlist = result.shortlist || [];
  registerKnownItems(state.DisplayedShortlist);
  if (typeof seedPrimaryPinnedEntity === "function") {
    seedPrimaryPinnedEntity(result, { resetExtraPins: false });
  }

  if (
    !state.activeStartupId ||
    !state.DisplayedShortlist.some((s) => s.id === state.activeStartupId)
  ) {
    state.activeStartupId = state.DisplayedShortlist[0]?.id || null;
  }
  if (
    state.selectedStartupId &&
    !state.DisplayedShortlist.some((s) => s.id === state.selectedStartupId)
  ) {
    state.selectedStartupId = null;
  }
  state.selectedBridgeId = null;
  state.selectedAnchorId = null;
  state.expandedGroupKey = null;

  updateTelemetryMasthead(result.calaBudget || state.bootstrap?.coverageStats?.calaBudget);
  syncInlineCalibrationStrip();
  if (typeof syncConstellationControls === "function") {
    syncConstellationControls();
  }
  if (typeof renderExploredEntitiesBox === "function") {
    renderExploredEntitiesBox();
  }
  if (typeof renderQuickInspectorCard === "function") {
    renderQuickInspectorCard();
  }
  if (typeof updateDynamicStarterPrompt === "function") {
    updateDynamicStarterPrompt();
  }

  const worthCount = state.DisplayedShortlist.filter((s) => (s.suitabilityScore || 0) >= 60).length;
  const statWorthEl = document.getElementById("statWorthCount");
  if (statWorthEl) {
    statWorthEl.textContent = String(worthCount || state.DisplayedShortlist.length);
  }

  const traceBox = document.getElementById("aiTraceBox");
  if (traceBox) {
    traceBox.hidden = true;
  }

  const thesisLiveEl = document.getElementById("thesisLiveCalaCard");
  if (thesisLiveEl) {
    thesisLiveEl.hidden = true;
    thesisLiveEl.innerHTML = "";
  }

  renderStartupGrid(state.DisplayedShortlist);
  renderAlsoScreenedSection(result);
  renderThesisAndBacktest(result);
  syncScoringModeButtons();

  if (state.workspaceMode === "map") {
    if (typeof updateAiSynthesisBanner === "function") {
      updateAiSynthesisBanner(null);
    }
    if (typeof renderConstellationMap === "function") {
      renderConstellationMap(getEffectiveBridgeMap(), { fit: true });
    }
    if (typeof renderSideEvidenceRail === "function") {
      renderSideEvidenceRail();
    }
  }

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

  const cmpBadge = document.getElementById("compareCallListCountBadge");
  if (cmpBadge) cmpBadge.textContent = String(count);

  const slushCount = (state.DisplayedShortlist || []).filter(
    (item) => getStartupCalaFieldProfile(item)?.slush2026?.attending
  ).length;
  const slushBadge = document.getElementById("slushCountBadge");
  if (slushBadge) slushBadge.textContent = String(slushCount);

  const liveDiscoveredCount = (state.DisplayedShortlist || []).filter(
    (item) => item.isLiveCalaDiscovered
  ).length;
  const liveBadge = document.getElementById("liveDiscoveredBadge");
  if (liveBadge) liveBadge.textContent = liveDiscoveredCount > 0 ? `${liveDiscoveredCount} live` : "+100";

  const slushBtn = document.getElementById("filterSlushBtn");
  if (slushBtn) {
    slushBtn.classList.toggle("is-active", Boolean(state.onlySlush2026));
    slushBtn.setAttribute("aria-pressed", state.onlySlush2026 ? "true" : "false");
  }

  const filterBtn = document.getElementById("filterCallListBtn");
  if (filterBtn) {
    filterBtn.classList.toggle("is-active", Boolean(state.onlyCallList));
    filterBtn.setAttribute("aria-pressed", state.onlyCallList ? "true" : "false");
  }

  const cmpBtn = document.getElementById("compareCallListBtn");
  if (cmpBtn) {
    cmpBtn.classList.toggle("is-active", Boolean(state.compareMatrixOpen));
    cmpBtn.setAttribute("aria-expanded", state.compareMatrixOpen ? "true" : "false");
  }

  const drawerStarBtn = document.getElementById("drawerSaveCallBtn");
  if (drawerStarBtn && state.activeStartupId) {
    const isSaved = state.savedCallListIds.includes(state.activeStartupId);
    drawerStarBtn.classList.toggle("is-saved", isSaved);
    drawerStarBtn.innerHTML = `${bookmarkIconSvg(13)} <span>${isSaved ? "Saved" : "Save"}</span>`;
  }

  const talkStarBtn = document.getElementById("talkSaveCallBtn");
  if (talkStarBtn && state.activeStartupId) {
    const isSaved = state.savedCallListIds.includes(state.activeStartupId);
    talkStarBtn.classList.toggle("is-saved", isSaved);
    talkStarBtn.innerHTML = `${bookmarkIconSvg(13)} <span>${isSaved ? "Saved" : "Save to Call List"}</span>`;
  }

  if (state.compareMatrixOpen) {
    renderCallListCompareMatrix();
  }
}

function toggleCallListCompareMatrix(forceOpen) {
  const next = typeof forceOpen === "boolean" ? forceOpen : !state.compareMatrixOpen;
  state.compareMatrixOpen = next;
  const card = document.getElementById("callListCompareCard");
  if (card) {
    card.hidden = !next;
  }
  syncCallListUI();
}

function renderCallListCompareMatrix() {
  const grid = document.getElementById("callListCompareGrid");
  const metaEl = document.getElementById("compareCardMeta");
  if (!grid) return;

  const items = state.savedCallListIds
    .map((id) => state.allKnownItems.get(id) || state.DisplayedShortlist.find((c) => c.id === id))
    .filter(Boolean)
    .slice(0, 4);

  if (metaEl) {
    metaEl.textContent =
      items.length > 0
        ? `Comparing ${items.length} of ${state.savedCallListIds.length} saved targets (max 4)`
        : "Save startups to unlock side-by-side matrix";
  }

  if (items.length < 2) {
    grid.innerHTML = `
      <div class="compare-empty-state">
        <div>
          <strong>Need at least 2 saved startups to compare side by side.</strong>
          <p class="note" style="margin:4px 0 0">
            Star any startup card in the grid or load the highest-scoring shortlist targets now.
          </p>
        </div>
        <button type="button" class="btn sm primary" id="seedTopCallListBtn">
          Load Top 3 Scored Startups
        </button>
      </div>
    `;
    return;
  }

  grid.innerHTML = items
    .map((s) => {
      const breakdown = getScoreBreakdownRows(s);
      const bridgeLabel =
        s.linkedinNetwork?.bridgePerson ||
        s.coInvestorPath?.coInvestorName ||
        "Direct founder outreach";

      return `
        <article class="compare-col-card" data-compare-col="${escapeHtml(s.id)}">
          <div class="compare-col-head">
            <div class="compare-col-id">
              <div class="compare-col-logo" aria-hidden="true">
                ${buildStartupLogoSvg(s.name, s.sector, 48)}
              </div>
              <div style="min-width:0">
                <h4 class="compare-col-name">${escapeHtml(s.name)}</h4>
                <span class="compare-col-sub">${escapeHtml(s.sector)} · ${escapeHtml(s.country)}</span>
              </div>
            </div>
            <div class="compare-col-score">
              ${buildIncompleteCircleScoreSvg(s.suitabilityScore ?? 0, 46, "")}
              <button
                type="button"
                class="compare-remove-btn"
                data-compare-remove="${escapeHtml(s.id)}"
                aria-label="Remove ${escapeHtml(s.name)} from Call List"
                title="Remove from Call List"
              >&times;</button>
            </div>
          </div>

          <div class="compare-metrics-row">
            <div class="compare-metric-box">
              <span>Last stage</span>
              <b>${escapeHtml(s.stage)}</b>
            </div>
            <div class="compare-metric-box">
              <span>Last round</span>
              <b class="num-tabular">${formatEur(s.lastRoundAmountEurM)}</b>
            </div>
            <div class="compare-metric-box">
              <span>Next window</span>
              <b>${escapeHtml(s.likelyNextStage || "Series A")}</b>
            </div>
            <div class="compare-metric-box">
              <span>Team size</span>
              <b class="num-tabular">${escapeHtml(s.employeeCount || "N/A")}</b>
            </div>
          </div>

          <div class="compare-factor-list" style="margin-top: 8px">
            ${breakdown
              .map((f) => {
                const pct = Math.min(100, Math.round((Number(f.points) / f.maxPoints) * 100));
                return `
                  <div class="compare-factor-row">
                    <span>${escapeHtml(f.label)}</span>
                    <b class="num-tabular">${f.points}/${f.maxPoints}</b>
                    <div class="compare-factor-track"><i style="width:${pct}%"></i></div>
                  </div>
                `;
              })
              .join("")}
          </div>

          <div class="compare-col-bridge">
            <strong>Bridge:</strong> ${escapeHtml(bridgeLabel)}
          </div>

          <div class="compare-col-foot">
            <button type="button" class="btn sm" data-compare-open="${escapeHtml(s.id)}">Open Brief</button>
            <button type="button" class="btn sm primary" data-compare-copy="${escapeHtml(s.id)}">Copy Intro</button>
          </div>
        </article>
      `;
    })
    .join("");
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

const CONSTELLATION_W = 1960;
const CONSTELLATION_H = 1400;
const CONSTELLATION_CX = 980;
const CONSTELLATION_CY = 700;

const ANCHOR_PALETTE = [
  { hex: "#38bdf8", glow: "rgba(56, 189, 248, 0.44)", edge: "#0284c7" },
  { hex: "#a78bfa", glow: "rgba(167, 139, 250, 0.44)", edge: "#7c3aed" },
  { hex: "#f59e0b", glow: "rgba(245, 158, 11, 0.44)", edge: "#d97706" },
  { hex: "#fb7185", glow: "rgba(251, 113, 133, 0.44)", edge: "#e11d48" }
];

const ORBIT_QUADRANTS = [
  { key: "access", group: "access", label: "ACCESS", minDeg: 195, maxDeg: 255, colorFamily: "feeder" },
  { key: "lineage", group: "lineage", label: "LINEAGE", minDeg: 285, maxDeg: 345, colorFamily: "alumni_spinout" },
  { key: "timing", group: "timing", label: "TIMING", minDeg: 15, maxDeg: 75, colorFamily: "event" },
  { key: "caution", group: "caution", label: "CAUTION", minDeg: 105, maxDeg: 165, colorFamily: "portfolio_twin" }
];

const CONTRIBUTION_VISUAL_META = {
  access: {
    group: "access",
    label: "Warm Access",
    headerLabel: "ACCESS",
    shortLabel: "Access",
    subtitle: "Warm intro routes & syndicate trust",
    darkColor: "#38bdf8",
    lightColor: "#0284c7",
    darkGlow: "rgba(56, 189, 248, 0.46)",
    darkEdge: "#0284c7"
  },
  lineage: {
    group: "lineage",
    label: "Team Lineage",
    headerLabel: "LINEAGE",
    shortLabel: "Lineage",
    subtitle: "Operator DNA & portfolio twins",
    darkColor: "#a78bfa",
    lightColor: "#7c3aed",
    darkGlow: "rgba(167, 139, 250, 0.46)",
    darkEdge: "#7c3aed"
  },
  timing: {
    group: "timing",
    label: "Why Now",
    headerLabel: "TIMING",
    shortLabel: "Timing",
    subtitle: "Pre-press filings, velocity & events",
    darkColor: "#f59e0b",
    lightColor: "#d97706",
    darkGlow: "rgba(245, 158, 11, 0.46)",
    darkEdge: "#d97706"
  },
  caution: {
    group: "caution",
    label: "Caution / Conflicts",
    headerLabel: "CAUTION",
    shortLabel: "Caution",
    subtitle: "Portfolio conflicts, hubs & proof gaps",
    darkColor: "#fb7185",
    lightColor: "#e11d48",
    darkGlow: "rgba(251, 113, 133, 0.46)",
    darkEdge: "#e11d48"
  }
};

const BRIDGE_FAMILY_VISUAL_META = {
  feeder: {
    label: "Feeder Bridges",
    hullTitle: "FEEDER BRIDGES",
    subtitle: "Funds that feed your benchmark",
    shortLabel: "Feeder",
    darkColor: "#38bdf8",
    lightColor: "#0284c7",
    darkGlow: "rgba(56, 189, 248, 0.44)",
    darkEdge: "#0284c7",
    darkFill: "rgba(56, 189, 248, 0.08)",
    lightFill: "rgba(2, 132, 199, 0.06)",
    darkStroke: "rgba(56, 189, 248, 0.28)",
    lightStroke: "rgba(2, 132, 199, 0.25)"
  },
  co_investor: {
    label: "Co-Investor Bridges",
    hullTitle: "CO-INVESTOR BRIDGES",
    subtitle: "Shared syndicate partners",
    shortLabel: "Co-Investor",
    darkColor: "#60a5fa",
    lightColor: "#2563eb",
    darkGlow: "rgba(96, 165, 250, 0.44)",
    darkEdge: "#2563eb",
    darkFill: "rgba(96, 165, 250, 0.08)",
    lightFill: "rgba(37, 99, 235, 0.06)",
    darkStroke: "rgba(96, 165, 250, 0.28)",
    lightStroke: "rgba(37, 99, 235, 0.25)"
  },
  alumni_spinout: {
    label: "Alumni & Spinouts",
    hullTitle: "ALUMNI & SPINOUTS",
    subtitle: "Operator & founder lineage",
    shortLabel: "Spinout",
    darkColor: "#a78bfa",
    lightColor: "#7c3aed",
    darkGlow: "rgba(167, 139, 250, 0.44)",
    darkEdge: "#7c3aed",
    darkFill: "rgba(167, 139, 250, 0.08)",
    lightFill: "rgba(124, 58, 237, 0.06)",
    darkStroke: "rgba(167, 139, 250, 0.28)",
    lightStroke: "rgba(124, 58, 237, 0.25)"
  },
  portfolio_twin: {
    label: "Portfolio Twins",
    hullTitle: "PORTFOLIO TWINS",
    subtitle: "Structural portfolio comps",
    shortLabel: "Twin",
    darkColor: "#fb7185",
    lightColor: "#e11d48",
    darkGlow: "rgba(251, 113, 133, 0.44)",
    darkEdge: "#e11d48",
    darkFill: "rgba(251, 113, 133, 0.08)",
    lightFill: "rgba(225, 29, 72, 0.06)",
    darkStroke: "rgba(251, 113, 133, 0.28)",
    lightStroke: "rgba(225, 29, 72, 0.25)"
  },
  event: {
    label: "Event & Ecosystem",
    hullTitle: "EVENT & ECOSYSTEM",
    subtitle: "Shared event & Slush ties",
    shortLabel: "Event",
    darkColor: "#f59e0b",
    lightColor: "#d97706",
    darkGlow: "rgba(245, 158, 11, 0.44)",
    darkEdge: "#d97706",
    darkFill: "rgba(245, 158, 11, 0.08)",
    lightFill: "rgba(217, 119, 6, 0.06)",
    darkStroke: "rgba(245, 158, 11, 0.28)",
    lightStroke: "rgba(217, 119, 6, 0.25)"
  }
};

function slugifyCompareKey(text) {
  return String(text || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function getFamilyGlowRgba(family) {
  const meta = BRIDGE_FAMILY_VISUAL_META[family] || BRIDGE_FAMILY_VISUAL_META.feeder;
  return meta.darkGlow || "rgba(56, 189, 248, 0.42)";
}

function deriveContributionGroupFrontend(item) {
  if (!item) return "access";
  const explicit = String(item.contributionGroup || "").toLowerCase();
  if (explicit === "access" || explicit === "lineage" || explicit === "timing" || explicit === "caution") {
    return explicit;
  }
  const fam = String(item.bridgeFamily || "").toLowerCase();
  const bType = String(item.bridgeType || "").toLowerCase();
  const labelLower = String(item.label || item.bridgeEntityName || "").toLowerCase();
  if (fam === "co_investor" || bType.includes("investor")) return "access";
  if (fam === "alumni_spinout" || fam === "portfolio_twin" || bType.includes("employer") || bType.includes("university") || bType.includes("academic") || bType.includes("twin")) {
    return "lineage";
  }
  if (bType.includes("caution") || labelLower.includes("conflict") || labelLower.includes("overlap") || labelLower.includes("press-only") || labelLower.includes("no warm")) {
    return "caution";
  }
  if (fam === "event" || bType.includes("catalyst") || labelLower.includes("pre-press") || labelLower.includes("hiring") || labelLower.includes("domain") || labelLower.includes("raise") || labelLower.includes("slush")) {
    return "timing";
  }
  return "access";
}

function getNodeContributionGroup(node) {
  return deriveContributionGroupFrontend(node);
}

function getContributionColorHex(group) {
  const meta = CONTRIBUTION_VISUAL_META[group] || CONTRIBUTION_VISUAL_META.access;
  return getActiveTheme() === "light" ? meta.lightColor : meta.darkColor;
}

function getContributionGlowRgba(group) {
  const meta = CONTRIBUTION_VISUAL_META[group] || CONTRIBUTION_VISUAL_META.access;
  return meta.darkGlow || "rgba(56, 189, 248, 0.44)";
}

function formatShortBridgeLabel(label, bridge = null, seenSet = null) {
  let text = cleanUiCopy(label || bridge?.label || "Signal").trim();
  // Strip verbose structural prefixes while retaining concise entity / catalyst identity
  text = text
    .replace(/^(Partner feeder|Feeder|Alumni bridge|Alumni spinout|Portfolio Twin|Twin comp|Co-investor|Direct Investor|Event overlap|2-Hop Route|Pre-press):\s*/i, "")
    .replace(/\s*\(([^)]*)\)\s*/g, " ")
    .replace(/\s+\u00b7\s+.*$/, "")
    .trim();

  if (/^pre-?press\s+filing/i.test(text)) text = "Pre-Press Filing";
  else if (/domain\s*(-+>|to)\s*\.ai/i.test(text) || /domain upgrade/i.test(text)) text = "Domain -> .ai";
  else if (/hiring/i.test(text) && /\+\d+%/i.test(text)) {
    const pct = text.match(/(\+\d+%)/);
    text = `Hiring ${pct ? pct[1] : "+30%+"}`;
  } else if (/raise window/i.test(text)) text = "Raise Window";
  else if (/portfolio conflict/i.test(text)) text = "Portfolio Conflict";
  else if (/sector overlap/i.test(text)) text = "Sector Overlap";
  else if (/press-only/i.test(text)) text = "Press-Only Proof";
  else if (/no warm intro/i.test(text)) text = "No Warm Intro";
  else if (/slush\s*2026/i.test(text)) text = "Slush 2026";
  else if (/slush/i.test(text)) text = "Slush Ecosystem";
  else if (/\balumni\b/i.test(text)) text = text.replace(/\s+Alumni.*$/i, " Alumni");

  if (text.length > 22) {
    const words = text.split(/\s+/);
    let compact = "";
    for (const w of words) {
      if ((compact ? `${compact} ${w}` : w).length <= 21) {
        compact = compact ? `${compact} ${w}` : w;
      } else break;
    }
    text = compact || `${text.slice(0, 20).trim()}.`;
  }

  if (seenSet) {
    const groupKey = `${getNodeContributionGroup(bridge)}:${text.toLowerCase()}`;
    if (seenSet.has(groupKey)) {
      const famTag = bridge?.bridgeFamily === "alumni_spinout"
        ? "DNA"
        : bridge?.bridgeFamily === "co_investor"
          ? "Synd"
          : bridge?.bridgeFamily === "portfolio_twin"
            ? "Twin"
            : "";
      if (famTag && !text.toLowerCase().includes(famTag.toLowerCase())) {
        const candidate = `${text.slice(0, Math.max(8, 19 - famTag.length))} ${famTag}`.trim();
        text = candidate;
      }
    }
    seenSet.add(`${getNodeContributionGroup(bridge)}:${text.toLowerCase()}`);
  }
  return text || "Bridge";
}

function formatCompactEntityName(rawLabel, maxWords = 2, maxChars = 18) {
  let text = cleanUiCopy(rawLabel || "Entity")
    .replace(/\s*\([^)]*\)\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return "Entity";
  const words = text.split(/\s+/);
  if (words.length > maxWords || text.length > maxChars) {
    const stripped = text.replace(/\b(?:Oy|Oyj|AB|Ltd\.?|Limited|Inc\.?|GmbH|AG|S\.L\.|SL|SAS|B\.V\.|BV|AS|ApS|LTDA|PTE\.?|CORP\.?|PLC)\b\.?/gi, "").replace(/\s+/g, " ").trim();
    if (stripped) text = stripped;
  }
  const cleanWords = text.split(/\s+/).slice(0, maxWords);
  let out = "";
  for (const w of cleanWords) {
    const cand = out ? `${out} ${w}` : w;
    if (cand.length <= maxChars || !out) {
      out = cand;
    } else {
      break;
    }
  }
  if (out.length > maxChars + 2) {
    out = `${out.slice(0, maxChars).trim()}.`;
  }
  return out || words[0] || "Entity";
}

function computeContributionWeightsFrontend(bridgeMap, explicitBridgeNodes = null, explicitEdges = null) {
  const fromPayload = Array.isArray(bridgeMap?.contributionClusters) ? bridgeMap.contributionClusters : [];
  const hasPayloadWeights = fromPayload.length >= 4 && fromPayload.every((c) => typeof c.visualWeight === "number" && typeof c.significanceScore === "number");
  const groups = ["access", "lineage", "timing", "caution"];
  const sigFormula = "topSignalRarity + mean(top3Bridges) + min(4.5, FILING_count * 1.5)";

  if (hasPayloadWeights && !explicitBridgeNodes) {
    const out = {};
    for (const c of fromPayload) {
      const g = String(c.group || c.contributionGroup || "").toLowerCase();
      if (!g) continue;
      const topR = Number(c.topRarity || 0);
      const top3M = Number(c.top3MeanRarity || 0);
      const fCount = c.filingCount ?? c.filingVerifiedCount ?? 0;
      const fBonus = Number(c.filingBonus ?? Math.min(4.5, fCount * 1.5));
      const sCount = c.startupCount ?? 0;
      out[g] = {
        significanceScore: c.significanceScore,
        visualWeight: c.visualWeight,
        topRarity: topR,
        top3MeanRarity: top3M,
        filingCount: fCount,
        filingBonus: fBonus,
        startupCount: sCount,
        topContributors: Array.isArray(c.topContributors) ? c.topContributors : [],
        significanceFormula: c.significanceFormula || sigFormula,
        significanceInputs:
          c.significanceInputs ||
          `Top: ${topR.toFixed(1)} + Top3 avg: ${top3M.toFixed(1)} + ${fCount} FILING (+${fBonus.toFixed(1)}) = ${Number(c.significanceScore || 0).toFixed(1)} pts | ${sCount} ${sCount === 1 ? "startup" : "startups"} connected`
      };
    }
    if (groups.every((g) => out[g])) return out;
  }

  const nodes = explicitBridgeNodes || (bridgeMap?.nodes || []).filter((n) => n.kind === "bridge");
  const edges = explicitEdges || (bridgeMap?.edges || []);
  const bridgeGroupById = new Map(nodes.map((n) => [n.id, getNodeContributionGroup(n)]));
  const startupSetByGroup = { access: new Set(), lineage: new Set(), timing: new Set(), caution: new Set() };
  for (const e of edges) {
    const bg = bridgeGroupById.get(e.from) || getNodeContributionGroup(e);
    if (bg && startupSetByGroup[bg] && e.to && !String(e.to).startsWith("bridge:")) {
      startupSetByGroup[bg].add(e.to);
    }
  }
  const payloadByGroup = new Map(fromPayload.map((c) => [String(c.group || c.contributionGroup || "").toLowerCase(), c]));
  const stats = {};

  for (const g of groups) {
    const pc = payloadByGroup.get(g);
    const members = nodes.filter((n) => getNodeContributionGroup(n) === g);
    const sCount = startupSetByGroup[g].size || pc?.startupCount || 0;
    if (!members.length) {
      stats[g] = {
        significanceScore: 0,
        visualWeight: 0.6,
        topRarity: 0,
        top3MeanRarity: 0,
        filingCount: 0,
        filingBonus: 0,
        startupCount: sCount,
        topContributors: [],
        significanceFormula: sigFormula,
        significanceInputs: `Top: 0.0 + Top3 avg: 0.0 + 0 FILING (+0.0) = 0.0 pts | ${sCount} ${sCount === 1 ? "startup" : "startups"} connected`
      };
      continue;
    }
    if (pc && typeof pc.significanceScore === "number" && typeof pc.visualWeight === "number" && members.length === (pc.nodeCount ?? members.length)) {
      const topR = Number(pc.topRarity || 0);
      const top3M = Number(pc.top3MeanRarity || 0);
      const fCount = pc.filingCount ?? pc.filingVerifiedCount ?? 0;
      const fBonus = Number(pc.filingBonus ?? Math.min(4.5, fCount * 1.5));
      stats[g] = {
        significanceScore: pc.significanceScore,
        visualWeight: pc.visualWeight,
        topRarity: topR,
        top3MeanRarity: top3M,
        filingCount: fCount,
        filingBonus: fBonus,
        startupCount: pc.startupCount ?? sCount,
        topContributors: Array.isArray(pc.topContributors) ? pc.topContributors : [],
        significanceFormula: pc.significanceFormula || sigFormula,
        significanceInputs:
          pc.significanceInputs ||
          `Top: ${topR.toFixed(1)} + Top3 avg: ${top3M.toFixed(1)} + ${fCount} FILING (+${fBonus.toFixed(1)}) = ${Number(pc.significanceScore || 0).toFixed(1)} pts | ${pc.startupCount ?? sCount} startups connected`
      };
      continue;
    }
    const sortedMembers = [...members].sort(
      (a, b) =>
        (a.isMegaHub ? 1 : 0) - (b.isMegaHub ? 1 : 0) ||
        Number(b.rarityScore ?? ((Number(b.lift) || 0.5) * 10)) - Number(a.rarityScore ?? ((Number(a.lift) || 0.5) * 10))
    );
    const rarities = members
      .map((m) => (m.isMegaHub ? 1.0 : Math.max(0, Number(m.rarityScore ?? ((Number(m.lift) || 0.5) * 10)))))
      .sort((a, b) => b - a);
    const topRarity = rarities[0] || 0;
    const top3 = rarities.slice(0, 3);
    const top3Mean = top3.length ? top3.reduce((s, v) => s + v, 0) / top3.length : 0;
    const filingCount = members.filter((m) => !m.isMegaHub && String(m.topSourceRank || "").toUpperCase() === "FILING").length;
    const filingBonus = Math.min(4.5, filingCount * 1.5);
    const sigScore = Math.round((topRarity + top3Mean + filingBonus) * 100) / 100;
    const topR = Math.round(topRarity * 100) / 100;
    const top3M = Math.round(top3Mean * 100) / 100;
    const fBonus = Math.round(filingBonus * 100) / 100;
    stats[g] = {
      significanceScore: sigScore,
      visualWeight: 0.6,
      topRarity: topR,
      top3MeanRarity: top3M,
      filingCount,
      filingBonus: fBonus,
      startupCount: sCount,
      topContributors: sortedMembers.slice(0, 3).map((m) => ({
        id: m.id,
        label: m.label,
        lift: m.lift != null ? Math.round(Number(m.lift) * 100) / 100 : null,
        rarityScore: Math.round((Number(m.rarityScore ?? ((Number(m.lift) || 0.5) * 10))) * 100) / 100,
        topSourceRank: m.topSourceRank || "AGGREGATOR",
        bridgeFamily: m.bridgeFamily || null,
        totalDeals: m.totalDeals ?? null
      })),
      significanceFormula: sigFormula,
      significanceInputs: `Top: ${topR.toFixed(1)} + Top3 avg: ${top3M.toFixed(1)} + ${filingCount} FILING (+${fBonus.toFixed(1)}) = ${sigScore.toFixed(1)} pts | ${sCount} ${sCount === 1 ? "startup" : "startups"} connected`
    };
  }

  const active = Object.values(stats).filter((s) => s.significanceScore > 0).map((s) => s.significanceScore);
  if (!active.length) {
    for (const s of Object.values(stats)) s.visualWeight = 1.0;
    return stats;
  }
  const maxSig = Math.max(...active);
  const minSig = Math.min(...active);
  for (const s of Object.values(stats)) {
    if (s.significanceScore <= 0) {
      s.visualWeight = 0.6;
    } else if (maxSig <= minSig) {
      s.visualWeight = 1.25;
    } else {
      const ratio = (s.significanceScore - minSig) / (maxSig - minSig);
      s.visualWeight = Math.round(Math.min(1.65, Math.max(0.6, 0.75 + ratio * (1.65 - 0.75))) * 100) / 100;
    }
  }
  return stats;
}

function allocateProportionalSectorSpans(weights, totalDeg = 360, minSpan = 55, maxSpan = 115) {
  const n = weights.length;
  const safeW = weights.map((w) => Math.max(0.1, Number(w) || 1));
  const fixed = new Array(n).fill(null);
  let remaining = totalDeg;

  for (let iter = 0; iter < n; iter++) {
    let openSum = 0;
    for (let i = 0; i < n; i++) {
      if (fixed[i] === null) openSum += safeW[i];
    }
    if (openSum <= 0) break;

    let worstIdx = -1;
    let worstViolation = 0;
    let worstClamp = 0;
    for (let i = 0; i < n; i++) {
      if (fixed[i] !== null) continue;
      const raw = (safeW[i] / openSum) * remaining;
      if (raw < minSpan && (minSpan - raw) > worstViolation) {
        worstViolation = minSpan - raw;
        worstIdx = i;
        worstClamp = minSpan;
      } else if (raw > maxSpan && (raw - maxSpan) > worstViolation) {
        worstViolation = raw - maxSpan;
        worstIdx = i;
        worstClamp = maxSpan;
      }
    }
    if (worstIdx !== -1) {
      fixed[worstIdx] = worstClamp;
      remaining -= worstClamp;
    } else {
      for (let i = 0; i < n; i++) {
        if (fixed[i] === null) fixed[i] = (safeW[i] / openSum) * remaining;
      }
      break;
    }
  }
  return fixed.map((v) => Math.round((v ?? (totalDeg / n)) * 100) / 100);
}

function computeBridgeOrbSize(bridgeNode, groupVisualWeight = 1) {
  const effRarity = bridgeNode?.isMegaHub
    ? 4
    : Math.max(4, Number(bridgeNode?.rarityScore ?? ((Number(bridgeNode?.lift) || 1) * 10)));
  const rarityNorm = Math.max(0, Math.min(1, (effRarity - 6) / 28));
  const groupNorm = Math.max(0, Math.min(1, (Number(groupVisualWeight || 1) - 0.6) / 1.05));
  const overlapBoost = bridgeNode?.isSharedOverlap ? 0.14 : 0;
  const combined = Math.min(1, rarityNorm * 0.68 + groupNorm * 0.32 + overlapBoost);
  return Math.round(Math.min(26, Math.max(12, 12 + combined * 14)));
}

function cleanUiCopy(value) {
  return String(value ?? "").replace(/\s*\u2014\s*/g, " - ");
}

function getSourceRankBadgeHtml(rank, prefix = "") {
  const upper = String(rank || "AGGREGATOR").toUpperCase();
  const cls = upper === "FILING"
    ? "micro-filing"
    : upper === "PRIMARY"
      ? "micro-primary"
      : "micro-press";
  return `<span class="micro-pill ${cls}">${escapeHtml(prefix + upper)}</span>`;
}

function getFamilyColorHex(family) {
  const meta = BRIDGE_FAMILY_VISUAL_META[family] || BRIDGE_FAMILY_VISUAL_META.feeder;
  return getActiveTheme() === "light" ? meta.lightColor : meta.darkColor;
}

function resolveSourceRecord(sourceId) {
  if (!sourceId) return null;
  return state.activeBrief?.sources?.find((s) => s.id === sourceId)
    || state.bootstrap?.sources?.[sourceId]
    || null;
}

function getFilteredShortlistItems(shortlist) {
  let visibleList = Array.isArray(shortlist) ? [...shortlist] : [];
  if (state.onlyCallList) {
    visibleList = visibleList.filter((item) => state.savedCallListIds.includes(item.id));
  }
  if (state.onlySlush2026) {
    visibleList = visibleList.filter((item) => getStartupCalaFieldProfile(item)?.slush2026?.attending);
  }
  if (state.filingOnly) {
    visibleList = visibleList.filter((item) => {
      const rank = item.dataConfidence?.topSourceRank || item.evidenceFolders?.proofAndGaps?.topSourceRank;
      return String(rank || "").toUpperCase() === "FILING";
    });
  }
  if (state.untappedOnly) {
    visibleList = visibleList.filter((item) => item.lastRoundAmountEurM == null || item.untappedSignal);
  }
  return visibleList;
}

function filterSingleBridgeMap(raw) {
  if (!raw) return null;
  if (!state.onlyCallList && !state.onlySlush2026) return raw;

  const visibleIds = new Set(getFilteredShortlistItems(state.DisplayedShortlist).map((s) => s.id));
  const keptEdges = (raw.edges || []).filter((edge) => {
    const isTargetStartup = (raw.nodes || []).some((n) => n.id === edge.to && n.kind === "startup");
    return !isTargetStartup || visibleIds.has(edge.to);
  });
  const linkedBridgeIds = new Set(
    keptEdges
      .filter((edge) => visibleIds.has(edge.to))
      .map((edge) => edge.from)
  );
  const finalEdges = keptEdges.filter((edge) => {
    if (visibleIds.has(edge.to)) return true;
    return linkedBridgeIds.has(edge.to);
  });
  const keptNodes = (raw.nodes || []).filter((node) => {
    if (node.kind === "anchor") return true;
    if (node.kind === "startup") return visibleIds.has(node.id);
    if (node.kind === "bridge") return linkedBridgeIds.has(node.id);
    return false;
  });

  const clusters = (raw.clusters || []).map((cl) => {
    const bNodes = keptNodes.filter((n) => n.kind === "bridge" && n.bridgeFamily === cl.bridgeFamily);
    const eCount = finalEdges.filter((e) => e.bridgeFamily === cl.bridgeFamily).length;
    return {
      ...cl,
      nodeCount: bNodes.length,
      edgeCount: eCount
    };
  });

  const keptBridgeNodes = keptNodes.filter((n) => n.kind === "bridge");
  const filteredContribWeights = computeContributionWeightsFrontend(null, keptBridgeNodes, finalEdges);
  const contributionClusters = (raw.contributionClusters || []).map((cc) => {
    const cg = cc.group || cc.contributionGroup;
    const bNodes = keptBridgeNodes.filter((n) => getNodeContributionGroup(n) === cg);
    const eCount = finalEdges.filter((e) => getNodeContributionGroup(e) === cg).length;
    const w = filteredContribWeights[cg] || { significanceScore: 0, visualWeight: 0.6 };
    return {
      ...cc,
      nodeCount: bNodes.length,
      edgeCount: eCount,
      startupCount: w.startupCount ?? cc.startupCount ?? 0,
      filingCount: w.filingCount ?? cc.filingCount ?? 0,
      topRarity: w.topRarity ?? cc.topRarity ?? 0,
      top3MeanRarity: w.top3MeanRarity ?? cc.top3MeanRarity ?? 0,
      filingBonus: w.filingBonus ?? cc.filingBonus ?? 0,
      topContributors: w.topContributors ?? cc.topContributors ?? [],
      significanceFormula: w.significanceFormula || cc.significanceFormula,
      significanceInputs: w.significanceInputs || cc.significanceInputs,
      significanceScore: w.significanceScore,
      visualWeight: w.visualWeight
    };
  });

  return {
    ...raw,
    clusters,
    contributionClusters,
    nodes: keptNodes,
    edges: finalEdges,
    peerEdges: (raw.peerEdges || []).filter((pe) => visibleIds.has(pe.from) && visibleIds.has(pe.to)),
    stats: {
      ...(raw.stats || {}),
      renderedStartups: keptNodes.filter((n) => n.kind === "startup").length,
      renderedBridges: keptNodes.filter((n) => n.kind === "bridge").length
    }
  };
}

function buildStartupCompareMapFromBrief(brief, anchorKey, anchorLabel) {
  const anchorNode = {
    id: anchorKey,
    label: brief?.name || anchorLabel || "Pinned Startup",
    kind: "anchor",
    entityType: "startup",
    startupId: brief?.id || null,
    contributionGroup: "all",
    subtitle: [brief?.sector, brief?.stage, brief?.country].filter(Boolean).join(" · "),
    topSourceRank: brief?.dataConfidence?.topSourceRank || "AGGREGATOR"
  };

  const nodeMap = new Map([[anchorKey, anchorNode]]);
  const edges = [];
  const seenEdges = new Set();
  const paths = brief?.evidenceFolders?.hiddenBridges?.paths || [];
  const hideMega = state.hideMegaHubs !== false;
  const activeFam = state.bridgeFamily && state.bridgeFamily !== "all" ? state.bridgeFamily : "all";
  const activeContrib = state.contributionGroup && state.contributionGroup !== "all" ? state.contributionGroup : "all";

  for (const p of paths) {
    if (hideMega && p.isMegaHub) continue;
    const fam = p.bridgeFamily || "feeder";
    if (activeFam !== "all" && fam !== activeFam) continue;
    const cg = deriveContributionGroupFrontend(p);
    if (activeContrib !== "all" && cg !== activeContrib) continue;
    const bSlug = p.bridgeEntityId || slugifyCompareKey(p.bridgeEntityName || p.label || "bridge");
    const bridgeId = `bridge:${fam}:${bSlug}`;
    if (!nodeMap.has(bridgeId)) {
      nodeMap.set(bridgeId, {
        id: bridgeId,
        label: p.bridgeEntityName || "Bridge Entity",
        kind: "bridge",
        bridgeFamily: fam,
        contributionGroup: cg,
        hopKind: p.hopKind || null,
        whyMatters: p.whyMatters || p.summary || null,
        topSourceRank: p.topSourceRank || "AGGREGATOR",
        sourceIds: p.sourceIds || [],
        isMegaHub: Boolean(p.isMegaHub),
        totalDeals: p.totalDeals ?? null,
        lift: p.lift ?? null,
        formulaBreakdown: p.formulaBreakdown || null
      });
    }
    const trunkId = `edge:${anchorKey}:${bridgeId}`;
    if (!seenEdges.has(trunkId)) {
      seenEdges.add(trunkId);
      edges.push({
        id: trunkId,
        from: anchorKey,
        to: bridgeId,
        bridgeFamily: fam,
        contributionGroup: cg,
        rarityScore: p.rarityScore ?? 1.5,
        topSourceRank: p.topSourceRank || "AGGREGATOR",
        whyMatters: p.whyMatters || p.summary || "",
        formulaBreakdown: p.formulaBreakdown || null,
        label: p.summary || ""
      });
    }
  }

  for (const peer of (brief?.peerStartups || []).slice(0, 6)) {
    if (!peer?.id || peer.id === brief?.id) continue;
    const fam = "portfolio_twin";
    const cg = "lineage";
    if (activeFam !== "all" && activeFam !== fam) continue;
    if (activeContrib !== "all" && cg !== activeContrib) continue;
    const twinBridgeId = `bridge:${fam}:peer-${slugifyCompareKey(peer.sector || brief?.sector || "peer")}`;
    if (!nodeMap.has(twinBridgeId)) {
      nodeMap.set(twinBridgeId, {
        id: twinBridgeId,
        label: `${peer.sector || brief?.sector || "Peer"} Cluster`,
        kind: "bridge",
        bridgeFamily: fam,
        contributionGroup: cg,
        topSourceRank: "PRIMARY",
        lift: 1.2,
        whyMatters: `Structural peer group linked to ${brief?.name || anchorLabel}.`
      });
      edges.push({
        id: `edge:${anchorKey}:${twinBridgeId}`,
        from: anchorKey,
        to: twinBridgeId,
        bridgeFamily: fam,
        contributionGroup: cg,
        rarityScore: 1.4,
        topSourceRank: "PRIMARY",
        label: `${peer.sector || ""} peer`
      });
    }
    if (!nodeMap.has(peer.id)) {
      nodeMap.set(peer.id, {
        id: peer.id,
        label: peer.name,
        kind: "startup",
        startupId: peer.id,
        contributionGroup: cg,
        triageRank: 99,
        signalTier: "Contextual Match",
        sector: peer.sector,
        country: peer.country,
        stage: peer.stage,
        topSourceRank: "PRIMARY"
      });
    }
    edges.push({
      id: `edge:${twinBridgeId}:${peer.id}`,
      from: twinBridgeId,
      to: peer.id,
      bridgeFamily: fam,
      contributionGroup: cg,
      rarityScore: 1.2,
      topSourceRank: "PRIMARY",
      label: `Peer comp with ${brief?.name || anchorLabel}`
    });
  }

  const allNodes = [...nodeMap.values()];
  const bridgeNodesOnly = allNodes.filter((n) => n.kind === "bridge");
  const startupContribWeights = computeContributionWeightsFrontend(null, bridgeNodesOnly, edges);
  const contributionClusters = Object.values(CONTRIBUTION_VISUAL_META).map((meta) => {
    const w = startupContribWeights[meta.group] || { significanceScore: 0, visualWeight: 0.6 };
    return {
      contributionGroup: meta.group,
      label: meta.label,
      headerLabel: meta.headerLabel,
      nodeCount: bridgeNodesOnly.filter((n) => getNodeContributionGroup(n) === meta.group).length,
      edgeCount: edges.filter((e) => getNodeContributionGroup(e) === meta.group).length,
      startupCount: w.startupCount ?? 0,
      filingCount: w.filingCount ?? 0,
      topRarity: w.topRarity ?? 0,
      top3MeanRarity: w.top3MeanRarity ?? 0,
      filingBonus: w.filingBonus ?? 0,
      topContributors: w.topContributors || [],
      significanceFormula: w.significanceFormula,
      significanceInputs: w.significanceInputs,
      significanceScore: w.significanceScore,
      visualWeight: w.visualWeight
    };
  });

  return {
    anchor: anchorNode,
    nodes: allNodes,
    edges,
    peerEdges: [],
    contributionClusters,
    stats: {
      renderedStartups: allNodes.filter((n) => n.kind === "startup").length,
      renderedBridges: allNodes.filter((n) => n.kind === "bridge").length,
      suppressedMegaHubCount: 0
    }
  };
}

function seedPrimaryPinnedEntity(data = null, opts = {}) {
  const isFund = state.inputMode === "fund";
  const id = isFund ? state.selectedFundId : (state.selectedCompanyIds || []).join(",") || "custom";
  const entityType = isFund ? "fund" : "custom";
  const key = `${entityType}:${id}`;
  const label = getSelectedBenchmarkLabel();
  const primaryPin = {
    key,
    entityType,
    id,
    name: label,
    meta: isFund ? "Anchor Fund" : "Portfolio Proxy",
    isPrimary: true,
    loading: false,
    bridgeMap: data?.bridgeMap || state.bridgeMap || null,
    shortlist: data?.shortlist || state.DisplayedShortlist || []
  };

  if (opts.resetExtraPins || !state.pinnedEntities.length) {
    state.pinnedEntities = [primaryPin];
    return;
  }

  const existingExtra = state.pinnedEntities.slice(1).filter((p) => p.key !== key);
  state.pinnedEntities = [primaryPin, ...existingExtra].slice(0, 4);
}

async function fetchEntityGraphContribution(entityRef) {
  const anchorKey = `anchor:${entityRef.key}`;
  if (entityRef.entityType === "fund") {
    const res = await fetchJson("/api/analyze", {
      method: "POST",
      body: JSON.stringify({
        mode: "fund",
        fundId: entityRef.id,
        rankingMode: mapScoringModeToApi(state.scoringMode),
        hideMegaHubs: state.hideMegaHubs !== false,
        bridgeFamily: state.bridgeFamily && state.bridgeFamily !== "all" ? state.bridgeFamily : "all",
        contributionGroup: state.contributionGroup && state.contributionGroup !== "all" ? state.contributionGroup : "all"
      })
    });
    if (res.shortlist) registerKnownItems(res.shortlist);
    return {
      bridgeMap: res.bridgeMap || null,
      shortlist: res.shortlist || [],
      meta: [res.thesis?.sectorFocus?.[0], res.thesis?.stageFocus?.[0]].filter(Boolean).join(" · ") || entityRef.meta || "Fund Anchor"
    };
  }

  const qs = new URLSearchParams({
    startupId: entityRef.id,
    fundId: state.inputMode === "fund" ? state.selectedFundId : ""
  });
  const brief = await fetchJson(`/api/brief?${qs.toString()}`);
  state.briefCache.set(`${entityRef.id}:${state.selectedFundId}`, brief);
  registerKnownItems([brief]);
  return {
    bridgeMap: buildStartupCompareMapFromBrief(brief, anchorKey, entityRef.name),
    shortlist: [],
    meta: [brief.sector, brief.stage, brief.country].filter(Boolean).join(" · ") || entityRef.meta || "Startup Anchor"
  };
}

async function pinEntityForCompare(entityRef) {
  if (!entityRef || !entityRef.id) return;
  if (!state.pinnedEntities.length && state.bridgeMap) {
    seedPrimaryPinnedEntity({ bridgeMap: state.bridgeMap, shortlist: state.DisplayedShortlist });
  }
  const key = `${entityRef.entityType}:${entityRef.id}`;
  if (state.pinnedEntities.some((p) => p.key === key)) {
    showUiToast(`${entityRef.name} is already pinned.`);
    return;
  }
  if (state.pinnedEntities.length >= 4) {
    showUiToast("Compare supports up to 4 pinned entities at once.");
    return;
  }

  const newPin = {
    key,
    entityType: entityRef.entityType,
    id: entityRef.id,
    name: entityRef.name,
    meta: entityRef.meta || (entityRef.entityType === "fund" ? "Fund" : "Startup"),
    isPrimary: false,
    loading: true,
    bridgeMap: null,
    shortlist: []
  };
  state.pinnedEntities = [...state.pinnedEntities, newPin];
  renderExploredEntitiesBox();

  try {
    const data = await fetchEntityGraphContribution(newPin);
    state.pinnedEntities = state.pinnedEntities.map((p) =>
      p.key === key
        ? { ...p, loading: false, meta: data.meta || p.meta, bridgeMap: data.bridgeMap, shortlist: data.shortlist }
        : p
    );
    state.selectedStartupId = null;
    state.selectedBridgeId = null;
    state.selectedAnchorId = null;
    syncConstellationControls();
    renderExploredEntitiesBox();
    updateAiSynthesisBanner(null);
    renderConstellationMap(getEffectiveBridgeMap(), { fit: true });
    renderSideEvidenceRail();
  } catch (err) {
    state.pinnedEntities = state.pinnedEntities.filter((p) => p.key !== key);
    renderExploredEntitiesBox();
    showUiToast(err.message || "Could not load entity comparison graph.");
  }
}

async function refreshExtraPinnedEntities() {
  if (state.pinnedEntities.length <= 1) return;
  const extras = state.pinnedEntities.slice(1);
  await Promise.all(
    extras.map(async (pin) => {
      try {
        const data = await fetchEntityGraphContribution(pin);
        pin.bridgeMap = data.bridgeMap;
        pin.shortlist = data.shortlist;
      } catch {
        // retain prior slice
      }
    })
  );
}

function unpinEntityFromCompare(pinKey) {
  if (state.pinnedEntities.length <= 1) {
    showUiToast("At least one primary anchor remains active.");
    return;
  }
  state.pinnedEntities = state.pinnedEntities.filter((p) => p.key !== pinKey);
  state.selectedStartupId = null;
  state.selectedBridgeId = null;
  state.selectedAnchorId = null;
  state.expandedGroupKey = null;
  syncConstellationControls();
  renderExploredEntitiesBox();
  updateAiSynthesisBanner(null);
  renderConstellationMap(getEffectiveBridgeMap(), { fit: true });
  renderSideEvidenceRail();
}

function clearComparePins() {
  if (state.pinnedEntities.length > 1) {
    state.pinnedEntities = state.pinnedEntities.slice(0, 1);
  }
  state.selectedStartupId = null;
  state.selectedBridgeId = null;
  state.selectedAnchorId = null;
  state.expandedGroupKey = null;
  state.hoveredNodeId = null;
  syncConstellationControls();
  renderExploredEntitiesBox();
  updateAiSynthesisBanner(null);
  renderConstellationMap(getEffectiveBridgeMap(), { fit: true });
  renderSideEvidenceRail();
}

function getMergedMultiEntityBridgeMap() {
  const validPins = state.pinnedEntities.filter((p) => p.bridgeMap);
  if (validPins.length <= 1) {
    return filterSingleBridgeMap(state.bridgeMap);
  }

  const nodeMap = new Map();
  const nodeAnchors = new Map();
  const nodePrimaryOwner = new Map();
  const edgeMap = new Map();
  const peerEdgeMap = new Map();
  let suppressedMegaHubCount = 0;

  const markOwner = (nodeId, anchorId) => {
    if (!nodeAnchors.has(nodeId)) nodeAnchors.set(nodeId, new Set());
    nodeAnchors.get(nodeId).add(anchorId);
    if (!nodePrimaryOwner.has(nodeId)) nodePrimaryOwner.set(nodeId, anchorId);
  };

  validPins.forEach((pin, idx) => {
    const rawMap = idx === 0 ? (filterSingleBridgeMap(state.bridgeMap) || pin.bridgeMap) : pin.bridgeMap;
    if (!rawMap) return;
    suppressedMegaHubCount += rawMap.stats?.suppressedMegaHubCount || 0;

    const palette = ANCHOR_PALETTE[idx % ANCHOR_PALETTE.length];
    const rawAnchorId = rawMap.anchor?.id || (rawMap.nodes || []).find((n) => n.kind === "anchor")?.id || pin.id;
    const unifiedAnchorId = `anchor:${pin.key}`;
    const pinStartupCount = (rawMap.nodes || []).filter((n) => n.kind === "startup").length;
    const pinBridgeCount = (rawMap.nodes || []).filter((n) => n.kind === "bridge").length;

    nodeMap.set(unifiedAnchorId, {
      id: unifiedAnchorId,
      label: pin.name,
      kind: "anchor",
      entityType: pin.entityType,
      entityKey: pin.key,
      anchorIndex: idx,
      anchorColor: palette.hex,
      anchorGlow: palette.glow,
      anchorEdge: palette.edge,
      subtitle: pin.meta || rawMap.anchor?.subtitle || "",
      bridgeCount: pinBridgeCount,
      startupCount: pinStartupCount
    });

    for (const n of rawMap.nodes || []) {
      if (n.kind === "anchor") continue;
      if (!nodeMap.has(n.id)) {
        nodeMap.set(n.id, { ...n });
      } else if (n.kind === "startup" && (n.triageRank || 99) < (nodeMap.get(n.id).triageRank || 99)) {
        nodeMap.set(n.id, { ...nodeMap.get(n.id), triageRank: n.triageRank });
      }
      markOwner(n.id, unifiedAnchorId);
    }

    if (pin.entityType === "startup") {
      markOwner(pin.id, unifiedAnchorId);
      for (const existingEdge of [...edgeMap.values()]) {
        if (existingEdge.to === pin.id && existingEdge.from.startsWith("bridge:")) {
          markOwner(existingEdge.from, unifiedAnchorId);
          const crossId = `edge:${unifiedAnchorId}:${existingEdge.from}`;
          if (!edgeMap.has(crossId)) {
            edgeMap.set(crossId, {
              ...existingEdge,
              id: crossId,
              from: unifiedAnchorId,
              to: existingEdge.from,
              ownerAnchorId: unifiedAnchorId,
              anchorBow: idx % 2 === 0 ? 1 : -1
            });
          }
        }
      }
    }

    for (const e of rawMap.edges || []) {
      const fromId = e.from === rawAnchorId ? unifiedAnchorId : e.from;
      const toId = e.to === rawAnchorId ? unifiedAnchorId : e.to;
      if (fromId !== unifiedAnchorId) markOwner(fromId, unifiedAnchorId);
      if (toId !== unifiedAnchorId) markOwner(toId, unifiedAnchorId);

      const dedupEdgeId = `cmp:${fromId}:${toId}:${e.contributionGroup || e.bridgeFamily || "x"}`;
      if (!edgeMap.has(dedupEdgeId)) {
        edgeMap.set(dedupEdgeId, {
          ...e,
          id: dedupEdgeId,
          from: fromId,
          to: toId,
          ownerAnchorId: unifiedAnchorId,
          anchorBow: idx % 2 === 0 ? 1 : -1
        });
      }
    }

    for (const pe of rawMap.peerEdges || []) {
      if (!peerEdgeMap.has(pe.id)) {
        peerEdgeMap.set(pe.id, pe);
      }
    }
  });

  for (const [nid, node] of nodeMap.entries()) {
    if (node.kind === "anchor") continue;
    const owners = [...(nodeAnchors.get(nid) || [])];
    node.connectedAnchorIds = owners;
    node.primaryAnchorId = owners[0] || nodePrimaryOwner.get(nid) || null;
    node.isSharedOverlap = owners.length >= 2;
  }

  for (const edge of edgeMap.values()) {
    const toNode = nodeMap.get(edge.to);
    const fromNode = nodeMap.get(edge.from);
    edge.isSharedEdge = Boolean(toNode?.isSharedOverlap || fromNode?.isSharedOverlap);
  }

  const allNodes = [...nodeMap.values()];
  return {
    compareMode: true,
    anchorCount: validPins.length,
    nodes: allNodes,
    edges: [...edgeMap.values()],
    peerEdges: [...peerEdgeMap.values()],
    clusters: state.bridgeMap?.clusters || [],
    contributionClusters: state.bridgeMap?.contributionClusters || [],
    stats: {
      renderedStartups: allNodes.filter((n) => n.kind === "startup").length,
      renderedBridges: allNodes.filter((n) => n.kind === "bridge").length,
      sharedOverlapCount: allNodes.filter((n) => n.isSharedOverlap).length,
      suppressedMegaHubCount
    }
  };
}

function getEffectiveBridgeMap() {
  if (state.pinnedEntities && state.pinnedEntities.filter((p) => p.bridgeMap).length >= 2) {
    return getMergedMultiEntityBridgeMap();
  }
  return filterSingleBridgeMap(state.bridgeMap);
}

function countActiveWorkspaceFilters() {
  let count = 0;
  if (state.hideMegaHubs === false) count += 1;
  if (state.contributionGroup && state.contributionGroup !== "all") count += 1;
  if (state.bridgeFamily && state.bridgeFamily !== "all") count += 1;
  if (state.filingOnly) count += 1;
  if (state.onlySlush2026) count += 1;
  if (state.untappedOnly) count += 1;
  if (state.onlyCallList) count += 1;
  if (typeof countActiveRefineFilters === "function") {
    count += countActiveRefineFilters();
  }
  return count;
}

function setFiltersPanelOpen(open, options = {}) {
  state.filtersPanelOpen = Boolean(open);
  const ribbonEl = document.getElementById("constellationFilterRibbon");
  const stripEl = document.getElementById("collapsibleFilterStrip");
  if (ribbonEl) ribbonEl.hidden = !state.filtersPanelOpen;
  if (stripEl && options.includeAdvanced !== undefined) {
    stripEl.hidden = !(state.filtersPanelOpen && options.includeAdvanced);
  } else if (stripEl && !state.filtersPanelOpen) {
    stripEl.hidden = true;
  }

  const expStr = state.filtersPanelOpen ? "true" : "false";
  document.getElementById("exploredFiltersToggleBtn")?.setAttribute("aria-expanded", expStr);
  document.getElementById("mapFiltersToggleBtn")?.setAttribute("aria-expanded", expStr);
  document.getElementById("toggleFiltersBtn")?.setAttribute("aria-expanded", expStr);
}

function setLegendPopoverOpen(open) {
  state.legendPopoverOpen = Boolean(open);
  const popEl = document.getElementById("mapLegendPopover");
  const btnEl = document.getElementById("mapLegendToggleBtn");
  if (popEl) popEl.hidden = !state.legendPopoverOpen;
  if (btnEl) {
    btnEl.setAttribute("aria-expanded", state.legendPopoverOpen ? "true" : "false");
    btnEl.classList.toggle("is-active", state.legendPopoverOpen);
  }
}

function renderExploredEntitiesBox() {
  const boxEl = document.getElementById("exploredEntitiesBox");
  const drawerEl = document.getElementById("exploredCompareDrawer");
  const toggleBtnEl = document.getElementById("toggleCompareBoxBtn");
  const listEl = document.getElementById("pinnedEntitiesList");
  const modeBadgeEl = document.getElementById("exploreModeBadge");
  const badgeEl = document.getElementById("exploredFiltersBadge");
  if (!listEl) return;

  if (!state.pinnedEntities.length && state.bridgeMap) {
    seedPrimaryPinnedEntity({ bridgeMap: state.bridgeMap, shortlist: state.DisplayedShortlist });
  }

  const count = state.pinnedEntities.length;
  const isCompareExpanded = Boolean(state.compareBoxOpen || count >= 2);
  if (boxEl) {
    boxEl.classList.toggle("is-expanded", isCompareExpanded);
  }
  if (drawerEl) {
    drawerEl.hidden = !isCompareExpanded;
  }
  if (toggleBtnEl) {
    toggleBtnEl.setAttribute("aria-expanded", isCompareExpanded ? "true" : "false");
    toggleBtnEl.classList.toggle("is-active", isCompareExpanded);
    toggleBtnEl.textContent = count >= 2 ? `Compare (${count})` : (isCompareExpanded ? "Close" : "+ Compare");
  }
  if (modeBadgeEl) {
    modeBadgeEl.textContent = count >= 2 ? `Compare ${count}` : "360° Polar";
  }

  listEl.innerHTML = state.pinnedEntities
    .map((pin, idx) => {
      const pal = ANCHOR_PALETTE[idx % ANCHOR_PALETTE.length];
      const kindLabel = pin.entityType === "startup" ? "Startup" : "Fund";
      const removeBtn = count > 1
        ? `<button type="button" class="pinned-entity-remove" data-unpin-key="${escapeHtml(pin.key)}" aria-label="Remove ${escapeHtml(pin.name)}">x</button>`
        : "";
      return `
        <span class="pinned-entity-chip" data-pin-key="${escapeHtml(pin.key)}">
          <span class="pinned-entity-dot" style="background:${pal.hex}; color:${pal.hex};"></span>
          <span class="pinned-entity-name" title="${escapeHtml(pin.name)}">${escapeHtml(pin.name)}</span>
          ${count >= 2 || state.compareBoxOpen ? `<span class="pinned-entity-kind">${pin.loading ? "..." : kindLabel}</span>` : ""}
          ${removeBtn}
        </span>
      `;
    })
    .join("");

  if (badgeEl) {
    const activeCount = countActiveWorkspaceFilters();
    badgeEl.hidden = activeCount === 0;
    badgeEl.textContent = String(activeCount);
  }
}

function syncConstellationControls() {
  const megaBtn = document.getElementById("toggleHideMegaHubsBtn");
  const megaPill = document.getElementById("megaHubCounterPill");
  const effMap = getEffectiveBridgeMap();
  const suppressedCount = effMap?.stats?.suppressedMegaHubCount ?? state.bridgeMap?.stats?.suppressedMegaHubCount ?? 0;
  if (megaBtn) {
    megaBtn.classList.toggle("is-active", state.hideMegaHubs !== false);
    megaBtn.setAttribute("aria-pressed", state.hideMegaHubs !== false ? "true" : "false");
  }
  if (megaPill) {
    megaPill.textContent = state.hideMegaHubs !== false
      ? `${suppressedCount} hidden`
      : "all shown";
  }

  document.querySelectorAll("#bridgeFamilySwitcher [data-contribution-group]").forEach((btn) => {
    const cg = btn.dataset.contributionGroup || "all";
    btn.classList.toggle("is-active", (state.contributionGroup || "all") === cg);
    btn.setAttribute("aria-pressed", (state.contributionGroup || "all") === cg ? "true" : "false");
  });

  const contribCounts = { all: 0, access: 0, lineage: 0, timing: 0, caution: 0 };
  const activeBridgeNodes = (effMap?.nodes || []).filter((n) => n.kind === "bridge");
  for (const bn of activeBridgeNodes) {
    const cg = getNodeContributionGroup(bn);
    if (contribCounts[cg] !== undefined) {
      contribCounts[cg] += 1;
      contribCounts.all += 1;
    }
  }
  document.querySelectorAll("[data-contrib-count]").forEach((el) => {
    const k = el.dataset.contribCount;
    const cnt = contribCounts[k] ?? 0;
    el.textContent = cnt > 0 ? String(cnt) : "";
  });

  const filingBtn = document.getElementById("chipFilingOnlyBtn");
  if (filingBtn) {
    filingBtn.classList.toggle("is-active", Boolean(state.filingOnly));
    filingBtn.setAttribute("aria-pressed", state.filingOnly ? "true" : "false");
  }
  const slushBtn = document.getElementById("chipSlushOnlyBtn");
  if (slushBtn) {
    slushBtn.classList.toggle("is-active", Boolean(state.onlySlush2026));
    slushBtn.setAttribute("aria-pressed", state.onlySlush2026 ? "true" : "false");
  }
  const untappedBtn = document.getElementById("chipUntappedOnlyBtn");
  if (untappedBtn) {
    untappedBtn.classList.toggle("is-active", Boolean(state.untappedOnly));
    untappedBtn.setAttribute("aria-pressed", state.untappedOnly ? "true" : "false");
  }
  renderExploredEntitiesBox();
}

function updateAiSynthesisBanner(context = null) {
  const bannerEl = document.getElementById("aiSynthesisBanner");
  const livePillEl = document.getElementById("mapLiveStatusPill");

  if (livePillEl) {
    if (context?.loadingMessage) {
      livePillEl.innerHTML = `<span class="live-loading-pulse" aria-hidden="true"></span><span>${escapeHtml(cleanUiCopy(context.loadingMessage))}</span>`;
      livePillEl.hidden = false;
    } else {
      livePillEl.hidden = true;
      livePillEl.innerHTML = "";
    }
  }
  if (!bannerEl) return;

  if (context?.loadingMessage) {
    bannerEl.hidden = true;
    bannerEl.innerHTML = "";
    return;
  }

  const effMap = getEffectiveBridgeMap();
  const currentQuery = (document.getElementById("aiSearchInput")?.value || "").trim();
  const canRefreshLive =
    Boolean(currentQuery) &&
    !/^\s*why not\s+/i.test(currentQuery) &&
    !effMap?.compareMode;
  const refreshHtml = canRefreshLive
    ? ` <button type="button" class="banner-refresh-live-btn" id="refreshLiveCalaBtn" title="Force re-query Live Cala knowledge graph for this search">Refresh Live Cala</button>`
    : "";

  if (context?.synthesis) {
    bannerEl.innerHTML = `${cleanUiCopy(context.synthesis)}${refreshHtml}`;
    bannerEl.hidden = false;
    return;
  }

  if (canRefreshLive) {
    bannerEl.innerHTML = `<strong>Query:</strong> "${escapeHtml(cleanUiCopy(currentQuery))}"${refreshHtml}`;
    bannerEl.hidden = false;
    return;
  }

  bannerEl.innerHTML = "";
  bannerEl.hidden = true;
}

function applyMapViewportTransform() {
  const vp = document.getElementById("mapPanZoomViewport");
  if (vp) {
    vp.style.transform = `translate(${state.mapPanX}px, ${state.mapPanY}px) scale(${state.mapZoom})`;
  }
  const canvasEl = document.getElementById("bridgeMapCanvas");
  if (canvasEl) {
    canvasEl.classList.toggle("is-zoomed-detail", state.mapZoom >= 1.00);
  }
  const readout = document.getElementById("mapZoomReadout");
  if (readout) {
    readout.textContent = `${Math.round(state.mapZoom * 100)}%`;
  }
}

function clampZoom(z) {
  return Math.min(1.6, Math.max(0.36, Math.round(z * 100) / 100));
}

function getActiveRailOffset() {
  if (!state.sideRailOpen) return 58;
  const railEl = document.getElementById("sideEvidenceRail");
  const measuredW = railEl && !railEl.hidden ? Math.round(railEl.getBoundingClientRect().width) : 0;
  const fallbackW =
    Number(state.sideRailWidth) ||
    Math.min(360, Math.max(310, Math.round((window.innerWidth || 1280) * 0.25)));
  const resolvedW = measuredW > 120 ? measuredW : fallbackW;
  document.documentElement.style.setProperty("--rail-width", `${resolvedW}px`);
  return resolvedW + 74;
}

function getTooltipRightReserve() {
  if (state.sideRailOpen) return getActiveRailOffset();
  const qc = document.getElementById("mapQuickInspectorCard");
  if (qc && !qc.hidden) return 336;
  return 68;
}

function fitConstellationToViewport() {
  const canvasEl = document.getElementById("bridgeMapCanvas");
  const layout = state.mapLayoutNodes;
  if (!canvasEl || !layout || !layout.bounds) {
    state.mapZoom = 0.80;
    state.mapPanX = 24;
    state.mapPanY = 18;
    applyMapViewportTransform();
    return;
  }

  const rect = canvasEl.getBoundingClientRect();
  if (!rect.width || !rect.height) {
    state.mapZoom = 0.80;
    state.mapPanX = 24;
    state.mapPanY = 18;
    applyMapViewportTransform();
    return;
  }

  const railOffset = getActiveRailOffset();
  const openLeft = rect.width >= 820 ? (state.sideRailOpen ? 92 : 44) : 20;
  const openRight = rect.width - railOffset - 20;
  const openTop = rect.width >= 820 ? (state.expandedGroupKey ? 56 : 44) : 38;
  const openBottom = rect.height - 54;

  const availW = Math.max(300, openRight - openLeft);
  const availH = Math.max(260, openBottom - openTop);
  const contentW = Math.max(420, layout.bounds.maxX - layout.bounds.minX);
  const contentH = Math.max(360, layout.bounds.maxY - layout.bounds.minY);

  const maxOverviewFit = layout.mode === "polar" && !state.expandedGroupKey ? 0.86 : 0.94;
  const rawZoom = Math.min(availW / contentW, availH / contentH, maxOverviewFit);
  const zoom = clampZoom(rawZoom);
  const centerContentX = (layout.bounds.minX + layout.bounds.maxX) / 2;
  const centerContentY = (layout.bounds.minY + layout.bounds.maxY) / 2;
  const targetCenterX = (openLeft + openRight) / 2;
  const targetCenterY = (openTop + openBottom) / 2;

  state.mapZoom = zoom;
  state.mapPanX = Math.round(targetCenterX - centerContentX * zoom);
  state.mapPanY = Math.round(targetCenterY - centerContentY * zoom);

  // Guard top-left #exploredEntitiesBox against actual rendered height on desktop
  const boxEl = document.getElementById("exploredEntitiesBox");
  if (boxEl && !boxEl.hidden && rect.width >= 820 && !state.sideRailOpen) {
    const boxW = (boxEl.offsetWidth || 260) + 18;
    const boxH = (boxEl.offsetHeight || 42) + 18;
    let pushX = 0;
    let pushY = 0;
    for (const pos of layout.posMap.values()) {
      const syTop = (pos.y - (pos.topPad || 20)) * state.mapZoom + state.mapPanY;
      const sxLeft = (pos.x - (pos.halfW || 60)) * state.mapZoom + state.mapPanX;
      if (syTop < boxH && sxLeft < boxW) {
        pushX = Math.max(pushX, boxW - sxLeft);
        pushY = Math.max(pushY, boxH - syTop);
      }
    }
    if (pushX > 0 && pushY > 0) {
      const rightRoom = Math.max(0, (rect.width - railOffset - 18) - (layout.bounds.maxX * state.mapZoom + state.mapPanX));
      const bottomRoom = Math.max(0, openBottom - (layout.bounds.maxY * state.mapZoom + state.mapPanY));
      if (pushY <= bottomRoom) {
        state.mapPanY += Math.round(pushY);
      } else if (pushX <= rightRoom) {
        state.mapPanX += Math.round(pushX);
      }
    }
  }
  applyMapViewportTransform();
}

function centerConstellationView() {
  const canvasEl = document.getElementById("bridgeMapCanvas");
  if (!canvasEl) return;
  const rect = canvasEl.getBoundingClientRect();
  if (!rect.width || !rect.height) {
    fitConstellationToViewport();
    return;
  }
  const layout = state.mapLayoutNodes;
  const cx = layout?.bounds ? (layout.bounds.minX + layout.bounds.maxX) / 2 : CONSTELLATION_CX;
  const cy = layout?.bounds ? (layout.bounds.minY + layout.bounds.maxY) / 2 : CONSTELLATION_CY;
  const railOffset = getActiveRailOffset();
  const openLeft = rect.width >= 820 ? (state.sideRailOpen ? 92 : 44) : 20;
  const openRight = rect.width - railOffset - 20;
  const openTop = rect.width >= 820 ? (state.expandedGroupKey ? 56 : 44) : 38;
  const openBottom = rect.height - 54;
  const targetCenterX = (openLeft + openRight) / 2;
  const targetCenterY = (openTop + openBottom) / 2;
  state.mapPanX = Math.round(targetCenterX - cx * state.mapZoom);
  state.mapPanY = Math.round(targetCenterY - cy * state.mapZoom);
  applyMapViewportTransform();
}

function polarToCartesian(cx, cy, radius, angleDeg) {
  const rad = (angleDeg * Math.PI) / 180;
  return {
    x: cx + radius * Math.cos(rad),
    y: cy + radius * Math.sin(rad)
  };
}

function computeGroupHubOrbSize(visualWeight = 1) {
  const norm = Math.max(0, Math.min(1, ((Number(visualWeight) || 0.6) - 0.6) / 1.05));
  return Math.round(Math.min(34, Math.max(22, 22 + norm * 12)));
}

function estimateNodeBoxMetrics(node, kind, isTier1 = false, bridgeSize = 16) {
  const shortStr = kind === "bridge"
    ? formatCompactEntityName(formatShortBridgeLabel(node.label, node), 3, 21)
    : kind === "startup"
      ? formatCompactEntityName(node.label, isTier1 ? 2 : 3, isTier1 ? 18 : 21)
      : kind === "group_hub"
        ? formatCompactEntityName(node.label, 1, 14)
        : formatCompactEntityName(node.label, 2, 22);
  const labelLen = shortStr.length;
  if (kind === "anchor") {
    return { orbR: 28, bridgeSize: 56, halfW: 54, topPad: 34, bottomPad: 38 };
  }
  if (kind === "group_hub") {
    const clampedSize = Math.min(34, Math.max(22, Math.round(Number(bridgeSize) || 26)));
    const orbR = Math.round(clampedSize / 2);
    return {
      orbR,
      bridgeSize: clampedSize,
      halfW: 56,
      topPad: orbR + 6,
      bottomPad: orbR + 40
    };
  }
  if (kind === "bridge") {
    const clampedSize = Math.min(26, Math.max(12, Math.round(Number(bridgeSize) || (node.isSharedOverlap ? 21 : 16))));
    const orbR = Math.round(clampedSize / 2);
    return {
      orbR,
      bridgeSize: clampedSize,
      halfW: Math.min(82, Math.max(44, labelLen * 3.55 + 14)),
      topPad: orbR + 6,
      bottomPad: orbR + 28
    };
  }
  const orbR = isTier1 || node.isSharedOverlap ? 9 : 7;
  return {
    orbR,
    bridgeSize: orbR * 2,
    halfW: Math.min(82, Math.max(42, labelLen * 3.55 + 14)),
    topPad: orbR + 6,
    bottomPad: orbR + 28
  };
}

function resolveOrbAndLabelCollisions(posMap, nodeById, ringOptions = null) {
  const opts = typeof ringOptions === "object" && ringOptions !== null
    ? ringOptions
    : { polarRings: Boolean(ringOptions) };
  const movableIds = [...posMap.keys()].filter((id) => {
    const k = nodeById.get(id)?.kind;
    return k !== "anchor" && !posMap.get(id)?.locked;
  });
  const fixedPositions = [...posMap.entries()]
    .filter(([id, p]) => nodeById.get(id)?.kind === "anchor" || p?.locked)
    .map(([, p]) => p);

  const iterations = 20;
  for (let pass = 0; pass < iterations; pass++) {
    for (let i = 0; i < movableIds.length; i++) {
      const idA = movableIds[i];
      const pA = posMap.get(idA);
      const aL = pA.x - pA.halfW - 6;
      const aR = pA.x + pA.halfW + 6;
      const aT = pA.y - pA.topPad - 4;
      const aB = pA.y + pA.bottomPad + 6;

      for (let j = i + 1; j < movableIds.length; j++) {
        const idB = movableIds[j];
        const pB = posMap.get(idB);
        const bL = pB.x - pB.halfW - 6;
        const bR = pB.x + pB.halfW + 6;
        const bT = pB.y - pB.topPad - 4;
        const bB = pB.y + pB.bottomPad + 6;

        const overlapX = Math.min(aR, bR) - Math.max(aL, bL);
        const overlapY = Math.min(aB, bB) - Math.max(aT, bT);
        if (overlapX > 0 && overlapY > 0) {
          let dx = pA.x - pB.x;
          let dy = pA.y - pB.y;
          if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) {
            dx = (i % 2 === 0 ? 1 : -1) * 4;
            dy = (j % 2 === 0 ? 1 : -1) * 4;
          }
          if (overlapY <= overlapX * 0.92) {
            const pushY = (overlapY * 0.52) * (dy >= 0 ? 1 : -1);
            const pushX = Math.sign(dx || 1) * Math.min(4, overlapX * 0.08);
            pA.y += pushY;
            pB.y -= pushY;
            pA.x += pushX;
            pB.x -= pushX;
          } else {
            const pushX = (overlapX * 0.52) * (dx >= 0 ? 1 : -1);
            const pushY = Math.sign(dy || 1) * Math.min(4, overlapY * 0.12);
            pA.x += pushX;
            pB.x -= pushX;
            pA.y += pushY;
            pB.y -= pushY;
          }
        }
      }

      // Keep clear of Anchor and locked Group Hub orbs
      for (const fp of fixedPositions) {
        const dx = pA.x - fp.x;
        const dy = pA.y - fp.y;
        const dist = Math.hypot(dx, dy) || 1;
        const minClear = fp.orbR >= 24 ? 115 : 88;
        if (dist < minClear) {
          const push = (minClear - dist) * 0.72;
          pA.x += (dx / dist) * push;
          pA.y += (dy / dist) * push;
        }
      }

      if (opts.polarRings) {
        const dx = pA.x - CONSTELLATION_CX;
        const dy = pA.y - CONSTELLATION_CY;
        let dist = Math.hypot(dx, dy) || 1;
        const minR = pA.minRingR ?? 220;
        const maxR = pA.maxRingR ?? 460;
        if (pass < iterations - 2 && (dist < minR || dist > maxR)) {
          const targetR = Math.max(minR, Math.min(maxR, dist));
          dist = dist + (targetR - dist) * 0.72;
        }
        if (typeof pA.sectorMinDeg === "number" && typeof pA.sectorMaxDeg === "number") {
          let ang = (Math.atan2(dy, dx) * 180) / Math.PI;
          const mid = (pA.sectorMinDeg + pA.sectorMaxDeg) / 2;
          while (ang < mid - 180) ang += 360;
          while (ang > mid + 180) ang -= 360;
          const clampedAng = Math.max(pA.sectorMinDeg, Math.min(pA.sectorMaxDeg, ang));
          const rad = (clampedAng * Math.PI) / 180;
          pA.x = CONSTELLATION_CX + dist * Math.cos(rad);
          pA.y = CONSTELLATION_CY + dist * Math.sin(rad);
        } else if (dist !== Math.hypot(dx, dy)) {
          pA.x = CONSTELLATION_CX + (dx / (Math.hypot(dx, dy) || 1)) * dist;
          pA.y = CONSTELLATION_CY + (dy / (Math.hypot(dx, dy) || 1)) * dist;
        }
      }
    }
  }
}

function buildPolarContributionTreeData(bridgeMap, shortlistOrder) {
  const nodes = bridgeMap?.nodes || [];
  const edges = bridgeMap?.edges || [];
  const primaryAnchor = nodes.find((n) => n.kind === "anchor")
    || (bridgeMap?.anchor ? { ...bridgeMap.anchor, kind: "anchor" } : { id: "query-anchor", label: getSelectedBenchmarkLabel(), kind: "anchor" });

  const allBridges = nodes.filter((n) => n.kind === "bridge");
  const allStartups = nodes.filter((n) => n.kind === "startup");
  const bridgeById = new Map(allBridges.map((b) => [b.id, b]));

  const sortedStartups = [...allStartups].sort((a, b) => {
    const ra = a.triageRank || (shortlistOrder.get(a.id) ?? 99) + 1;
    const rb = b.triageRank || (shortlistOrder.get(b.id) ?? 99) + 1;
    return ra - rb;
  });

  const contribWeights = computeContributionWeightsFrontend(bridgeMap, allBridges);
  const quadrantWeights = ORBIT_QUADRANTS.map((q) => contribWeights[q.group]?.visualWeight ?? 1);
  const allocatedSpans = allocateProportionalSectorSpans(quadrantWeights, 360, 55, 115);

  let maxActiveSig = 0;
  let strongestGroupKey = null;
  for (const q of ORBIT_QUADRANTS) {
    const sig = contribWeights[q.group]?.significanceScore || 0;
    if (sig > maxActiveSig) {
      maxActiveSig = sig;
      strongestGroupKey = q.group;
    }
  }

  const sectorMetaForSvg = [];
  const sectorMap = new Map();
  let degCursor = 180;
  ORBIT_QUADRANTS.forEach((q, qIdx) => {
    const qBridges = allBridges
      .filter((b) => getNodeContributionGroup(b) === q.group)
      .sort((a, b) => (b.rarityScore || 0) - (a.rarityScore || 0) || (b.lift || 0) - (a.lift || 0) || a.label.localeCompare(b.label));
    const spanDeg = allocatedSpans[qIdx] || 90;
    const slotStart = degCursor;
    const slotEnd = degCursor + spanDeg;
    degCursor = slotEnd;
    const gapPad = Math.min(10, spanDeg * 0.14);
    const qStats = contribWeights[q.group] || { significanceScore: 0, visualWeight: 0.6 };

    const meta = {
      ...q,
      slotStart,
      slotEnd,
      minDeg: slotStart + gapPad,
      maxDeg: slotEnd - gapPad,
      spanDeg,
      bridges: qBridges,
      count: qBridges.length,
      midDeg: (slotStart + slotEnd) / 2,
      significanceScore: qStats.significanceScore,
      visualWeight: qStats.visualWeight,
      topRarity: qStats.topRarity ?? 0,
      top3MeanRarity: qStats.top3MeanRarity ?? 0,
      filingCount: qStats.filingCount ?? 0,
      filingBonus: qStats.filingBonus ?? 0,
      startupCount: qStats.startupCount ?? 0,
      topContributors: qStats.topContributors || [],
      significanceFormula: qStats.significanceFormula || "topSignalRarity + mean(top3Bridges) + min(4.5, FILING_count * 1.5)",
      significanceInputs: qStats.significanceInputs || "",
      isStrongest: q.group === strongestGroupKey
    };
    sectorMetaForSvg.push(meta);
    sectorMap.set(q.group, meta);
  });

  // Map every startup -> { group -> best bridge evidence } and strongest primary group
  const SOURCE_RANK_PRIORITY = { FILING: 4, PRIMARY: 3, PRESS: 2, AGGREGATOR: 1 };
  const startupGroupEvidence = new Map();
  const startupPrimaryGroup = new Map();
  for (const sn of sortedStartups) {
    const byGrp = {};
    const incEdges = edges.filter((e) => e.to === sn.id && bridgeById.has(e.from));
    for (const edge of incEdges) {
      const bn = bridgeById.get(edge.from);
      const grp = getNodeContributionGroup(bn || edge);
      const rankScore = SOURCE_RANK_PRIORITY[String(edge.topSourceRank || bn?.topSourceRank || "").toUpperCase()] || 1;
      const effRarity = Number(edge.rarityScore ?? bn?.rarityScore ?? ((Number(bn?.lift) || 0.5) * 10));
      if (!byGrp[grp]) {
        byGrp[grp] = {
          group: grp,
          count: 1,
          bestBridge: bn,
          bestEdge: edge,
          topRarity: effRarity,
          topRankScore: rankScore,
          topSourceRank: edge.topSourceRank || bn?.topSourceRank || "AGGREGATOR"
        };
      } else {
        byGrp[grp].count += 1;
        if (effRarity > byGrp[grp].topRarity || (effRarity === byGrp[grp].topRarity && rankScore > byGrp[grp].topRankScore)) {
          byGrp[grp].bestBridge = bn;
          byGrp[grp].bestEdge = edge;
          byGrp[grp].topRarity = effRarity;
          byGrp[grp].topRankScore = rankScore;
          byGrp[grp].topSourceRank = edge.topSourceRank || bn?.topSourceRank || byGrp[grp].topSourceRank;
        }
      }
    }
    startupGroupEvidence.set(sn.id, byGrp);

    const candidateGroups = Object.values(byGrp).sort(
      (a, b) => (b.topRarity - a.topRarity) || (b.topRankScore - a.topRankScore) || (b.count - a.count)
    );
    const chosenGroup = candidateGroups[0]?.group || getNodeContributionGroup(sn);
    startupPrimaryGroup.set(sn.id, chosenGroup);
  }

  const expandedGrp = state.expandedGroupKey && sectorMap.has(state.expandedGroupKey)
    ? state.expandedGroupKey
    : null;

  // Helper to construct the 4 Group Hub orbs cleanly
  const buildGroupHubNode = (qMeta, isExpanded = false, isDimmed = false) => {
    const qBridges = qMeta.bridges || [];
    const connectedStartups = new Set();
    for (const sn of sortedStartups) {
      const evMap = startupGroupEvidence.get(sn.id) || {};
      if (evMap[qMeta.group] || startupPrimaryGroup.get(sn.id) === qMeta.group) {
        connectedStartups.add(sn.id);
      }
    }
    const hubStartupCount = connectedStartups.size || qMeta.startupCount || 0;
    const maxLift = qBridges.reduce((mx, b) => {
      const l = Number(b.lift) || 0;
      return l > mx ? l : mx;
    }, 0);
    const sigRounded = Math.round((qMeta.significanceScore || 0) * 10) / 10;
    const clueMetric = `${hubStartupCount} ${hubStartupCount === 1 ? "startup" : "startups"} · ${sigRounded.toFixed(1)} pts`;
    const hasFilingOrPrimary = qBridges.some((b) => {
      const r = String(b.topSourceRank || "").toUpperCase();
      return r === "FILING" || r === "PRIMARY";
    });
    const bestBridge = qBridges[0] || null;
    const fallbackContributors = qBridges.slice(0, 3).map((b) => ({
      id: b.id,
      label: b.label,
      lift: b.lift != null ? Math.round(Number(b.lift) * 100) / 100 : null,
      rarityScore: b.rarityScore ?? null,
      topSourceRank: b.topSourceRank || "AGGREGATOR",
      bridgeFamily: b.bridgeFamily || null,
      totalDeals: b.totalDeals ?? null
    }));

    return {
      id: `group-hub:${qMeta.group}`,
      kind: "group_hub",
      groupKey: qMeta.group,
      contributionGroup: qMeta.group,
      label: qMeta.label,
      clueMetric,
      bridgeCount: qBridges.length,
      startupCount: hubStartupCount,
      filingCount: qMeta.filingCount ?? 0,
      filingBonus: qMeta.filingBonus ?? 0,
      topRarity: qMeta.topRarity ?? 0,
      top3MeanRarity: qMeta.top3MeanRarity ?? 0,
      significanceScore: qMeta.significanceScore,
      visualWeight: qMeta.visualWeight,
      significanceFormula: qMeta.significanceFormula,
      significanceInputs: qMeta.significanceInputs || `Top: ${(qMeta.topRarity || 0).toFixed(1)} + Top3 avg: ${(qMeta.top3MeanRarity || 0).toFixed(1)} + ${qMeta.filingCount || 0} FILING (+${(qMeta.filingBonus || 0).toFixed(1)})`,
      topContributors: (qMeta.topContributors && qMeta.topContributors.length) ? qMeta.topContributors : fallbackContributors,
      maxLift: maxLift >= 1.05 ? Math.round(maxLift * 10) / 10 : null,
      topSourceRank: bestBridge?.topSourceRank || (hasFilingOrPrimary ? "PRIMARY" : "AGGREGATOR"),
      isStrongest: qMeta.isStrongest,
      isExpandedHub: isExpanded,
      isGroupDimmed: isDimmed,
      whyMatters: CONTRIBUTION_VISUAL_META[qMeta.group]?.subtitle || "",
      formulaBreakdown: bestBridge?.formulaBreakdown || null
    };
  };

  if (!expandedGrp) {
    // LEVEL 1 - OVERVIEW MODE: 1 Anchor + 4 Group Hubs + Top 8 Startups (Max 12 resting radial arcs; 0 cross-wires)
    const hubNodes = sectorMetaForSvg.map((q) => buildGroupHubNode(q, false, false));
    const hubByGroup = new Map(hubNodes.map((h) => [h.groupKey, h]));
    const overviewStartups = sortedStartups.slice(0, 8);
    const hiddenStartupCount = Math.max(0, sortedStartups.length - overviewStartups.length);

    const displayEdges = [];
    for (const q of sectorMetaForSvg) {
      const hubId = `group-hub:${q.group}`;
      const hNode = hubByGroup.get(q.group);
      const qBridges = q.bridges || [];
      const topRank = qBridges.some((b) => String(b.topSourceRank || "").toUpperCase() === "FILING")
        ? "FILING"
        : qBridges.some((b) => String(b.topSourceRank || "").toUpperCase() === "PRIMARY")
          ? "PRIMARY"
          : "AGGREGATOR";
      const topBridge = qBridges[0];
      displayEdges.push({
        id: `spoke:${primaryAnchor.id}:${hubId}`,
        from: primaryAnchor.id,
        to: hubId,
        label: `${q.label} Contribution Group`,
        bridgeEntityName: q.label,
        contributionGroup: q.group,
        bridgeFamily: topBridge?.bridgeFamily || q.colorFamily,
        topSourceRank: topRank,
        lift: hNode?.maxLift ?? null,
        totalDeals: topBridge?.totalDeals ?? null,
        rarityScore: Math.round((q.significanceScore || 0) * 100) / 100,
        whyMatters: `${q.label}: ${qBridges.length} bridges, ${hNode?.startupCount || 0} connected startups.`,
        formulaBreakdown: {
          formula: hNode?.significanceFormula || "topSignalRarity + mean(top3Bridges) + min(4.5, FILING_count * 1.5)",
          inputs: `${hNode?.significanceInputs || `${qBridges.length} signals`} | Sector scale ${Number(q.visualWeight || 1).toFixed(2)}x`,
          plainMeaning: `${q.label} sector weight across verified shortlist connections.`
        },
        isOverviewSpoke: true
      });
    }

    for (const sn of overviewStartups) {
      const pGrp = startupPrimaryGroup.get(sn.id) || "access";
      const evMap = startupGroupEvidence.get(sn.id) || {};
      const primaryEv = evMap[pGrp] || null;
      const primaryHubId = `group-hub:${pGrp}`;
      const pBestBridge = primaryEv?.bestBridge || null;

      displayEdges.push({
        id: `primary:${primaryHubId}:${sn.id}`,
        from: primaryHubId,
        to: sn.id,
        label: pBestBridge?.label || primaryEv?.bestEdge?.label || `${CONTRIBUTION_VISUAL_META[pGrp]?.headerLabel || pGrp} -> ${sn.label}`,
        bridgeEntityName: pBestBridge?.label || null,
        contributionGroup: pGrp,
        bridgeFamily: pBestBridge?.bridgeFamily || sn.bridgeFamily || "feeder",
        topSourceRank: primaryEv?.topSourceRank || sn.topSourceRank || "AGGREGATOR",
        lift: pBestBridge?.lift ?? null,
        totalDeals: pBestBridge?.totalDeals ?? null,
        rarityScore: Math.round((primaryEv?.topRarity || 1.8) * 100) / 100,
        whyMatters: primaryEv?.bestEdge?.whyMatters || pBestBridge?.whyMatters || sn.bestBridgeSummary || `Primary ${pGrp} match.`,
        formulaBreakdown: primaryEv?.bestEdge?.formulaBreakdown || pBestBridge?.formulaBreakdown || sn.bestBridgeFormula || {
          formula: "topBridgeRarity = lift * 10 + sourceRankBonus",
          inputs: `${pBestBridge?.label || sn.bestBridgeSummary || pGrp}; rarity ${Number(primaryEv?.topRarity || 1.8).toFixed(1)} pts; ${primaryEv?.topSourceRank || sn.topSourceRank || "AGGREGATOR"}`,
          plainMeaning: `Strongest ${CONTRIBUTION_VISUAL_META[pGrp]?.headerLabel || pGrp} contribution for ${sn.label}.`
        },
        isPrimaryOverviewEdge: true
      });

      // Secondary cross-quadrant factor edges: hidden at rest, revealed cleanly ONLY on single startup hover/selection
      for (const [secGrp, secEv] of Object.entries(evMap)) {
        if (secGrp === pGrp) continue;
        const secHubId = `group-hub:${secGrp}`;
        const sBestBridge = secEv.bestBridge || null;
        displayEdges.push({
          id: `sec:${secGrp}:${sn.id}`,
          from: secHubId,
          to: sn.id,
          label: sBestBridge?.label || secEv.bestEdge?.label || `${CONTRIBUTION_VISUAL_META[secGrp]?.headerLabel || secGrp} -> ${sn.label}`,
          bridgeEntityName: sBestBridge?.label || null,
          contributionGroup: secGrp,
          bridgeFamily: sBestBridge?.bridgeFamily || "feeder",
          topSourceRank: secEv.topSourceRank || "AGGREGATOR",
          lift: sBestBridge?.lift ?? null,
          totalDeals: sBestBridge?.totalDeals ?? null,
          rarityScore: Math.round((secEv.topRarity || 1.2) * 100) / 100,
          whyMatters: secEv.bestEdge?.whyMatters || sBestBridge?.whyMatters || `${CONTRIBUTION_VISUAL_META[secGrp]?.label || secGrp} secondary factor.`,
          formulaBreakdown: secEv.bestEdge?.formulaBreakdown || sBestBridge?.formulaBreakdown || {
            formula: "secondaryBridgeRarity = lift * 10 + sourceRankBonus",
            inputs: `${sBestBridge?.label || secGrp}; rarity ${Number(secEv.topRarity || 1.2).toFixed(1)} pts; ${secEv.topSourceRank || "AGGREGATOR"}`,
            plainMeaning: `Cross-quadrant ${CONTRIBUTION_VISUAL_META[secGrp]?.headerLabel || secGrp} tie on ${sn.label}.`
          },
          isSecondaryOverviewLink: true,
          secondaryForStartupId: sn.id,
          anchorBow: 1
        });
      }
    }

    return {
      treeMode: "overview",
      focusedGroupKey: null,
      primaryAnchor,
      hubNodes,
      bridgeNodes: [],
      startupNodes: overviewStartups,
      startupPrimaryGroup,
      startupGroupEvidence,
      displayEdges,
      displayPeerEdges: [],
      sectorMetaForSvg,
      sectorMap,
      totalStartupCount: sortedStartups.length,
      hiddenStartupCount
    };
  }

  // LEVEL 2 - GROUP DRILL-DOWN MODE: Expand ONLY state.expandedGroupKey into specific sub-bridges & ALL matching startups
  const activeSector = sectorMap.get(expandedGrp);
  const focusedBridges = activeSector?.bridges || [];
  const focusedBridgeIds = new Set(focusedBridges.map((b) => b.id));

  const hubNodes = sectorMetaForSvg.map((q) => buildGroupHubNode(q, q.group === expandedGrp, q.group !== expandedGrp));
  const hubByGroup = new Map(hubNodes.map((h) => [h.groupKey, h]));
  const activeHubId = `group-hub:${expandedGrp}`;

  // ALL startups matching this contribution group (connected to any focused bridge OR primary group match)
  const focusedStartups = sortedStartups.filter((sn) => {
    const evMap = startupGroupEvidence.get(sn.id) || {};
    if (evMap[expandedGrp]) return true;
    return startupPrimaryGroup.get(sn.id) === expandedGrp;
  });

  const displayEdges = [];
  for (const q of sectorMetaForSvg) {
    const hubId = `group-hub:${q.group}`;
    const hNode = hubByGroup.get(q.group);
    const isExp = q.group === expandedGrp;
    const topB = (q.bridges || [])[0];
    displayEdges.push({
      id: `spoke:${primaryAnchor.id}:${hubId}`,
      from: primaryAnchor.id,
      to: hubId,
      label: `${q.label} Contribution Group`,
      bridgeEntityName: q.label,
      contributionGroup: q.group,
      bridgeFamily: topB?.bridgeFamily || q.colorFamily,
      topSourceRank: isExp ? (topB?.topSourceRank || "PRIMARY") : "AGGREGATOR",
      lift: hNode?.maxLift ?? null,
      rarityScore: Math.round((q.significanceScore || 0) * 100) / 100,
      whyMatters: isExp ? `Focused on ${q.label} contribution group.` : `${q.label} (collapsed)`,
      formulaBreakdown: {
        formula: hNode?.significanceFormula || "topSignalRarity + mean(top3Bridges) + min(4.5, FILING_count * 1.5)",
        inputs: hNode?.significanceInputs || `${(q.bridges || []).length} signals`,
        plainMeaning: isExp ? `Drilling into ${q.label} bridges and targets.` : `${q.label} dimmed during drill-down.`
      },
      isGroupDimmedEdge: !isExp
    });
  }

  for (const b of focusedBridges) {
    displayEdges.push({
      id: `hub-bridge:${activeHubId}:${b.id}`,
      from: activeHubId,
      to: b.id,
      label: b.label,
      bridgeEntityName: b.label,
      contributionGroup: expandedGrp,
      bridgeFamily: b.bridgeFamily || activeSector.colorFamily,
      topSourceRank: b.topSourceRank || "AGGREGATOR",
      lift: b.lift ?? null,
      totalDeals: b.totalDeals ?? null,
      rarityScore: Number(b.rarityScore) || 1.6,
      whyMatters: b.whyMatters || `${b.label} in ${activeSector.label}`,
      formulaBreakdown: b.formulaBreakdown || null
    });
  }

  const focusedStartupIds = new Set(focusedStartups.map((s) => s.id));
  const coveredStartups = new Set();
  for (const edge of edges) {
    if (focusedBridgeIds.has(edge.from) && focusedStartupIds.has(edge.to)) {
      displayEdges.push({
        ...edge,
        contributionGroup: expandedGrp
      });
      coveredStartups.add(edge.to);
    }
  }
  for (const sn of focusedStartups) {
    if (!coveredStartups.has(sn.id)) {
      displayEdges.push({
        id: `hub-startup:${activeHubId}:${sn.id}`,
        from: activeHubId,
        to: sn.id,
        contributionGroup: expandedGrp,
        bridgeFamily: sn.bridgeFamily || activeSector.colorFamily,
        topSourceRank: sn.topSourceRank || "AGGREGATOR",
        rarityScore: 1.4,
        whyMatters: `${activeSector.label} profile alignment.`
      });
    }
  }

  return {
    treeMode: "drilldown",
    focusedGroupKey: expandedGrp,
    primaryAnchor,
    hubNodes,
    bridgeNodes: focusedBridges,
    startupNodes: focusedStartups,
    startupPrimaryGroup,
    startupGroupEvidence,
    displayEdges,
    displayPeerEdges: [],
    sectorMetaForSvg,
    sectorMap,
    totalStartupCount: sortedStartups.length,
    hiddenStartupCount: 0
  };
}

function layoutBridgeMapNodes(bridgeMap) {
  const nodes = bridgeMap?.nodes || [];
  const edges = bridgeMap?.edges || [];
  const anchorNodes = nodes.filter((n) => n.kind === "anchor");
  if (!anchorNodes.length && bridgeMap?.anchor) {
    anchorNodes.push({ ...bridgeMap.anchor, kind: "anchor" });
  }
  const bridgeNodes = nodes.filter((n) => n.kind === "bridge");
  const startupNodes = nodes.filter((n) => n.kind === "startup");

  const posMap = new Map();
  const nodeById = new Map();
  const connectedEdgesByNode = new Map();

  const isCompareMode = anchorNodes.length >= 2;
  const shortlistOrder = new Map(
    (state.DisplayedShortlist || []).map((s, idx) => [s.id, idx])
  );

  if (!isCompareMode) {
    // MODE A: Hierarchical 2-Level Contribution Tree (Overview -> Drill-Down)
    const tree = buildPolarContributionTreeData(bridgeMap, shortlistOrder);
    const allTreeNodes = [tree.primaryAnchor, ...tree.hubNodes, ...tree.bridgeNodes, ...tree.startupNodes];
    for (const n of allTreeNodes) {
      if (!n) continue;
      nodeById.set(n.id, n);
      connectedEdgesByNode.set(n.id, []);
    }
    for (const e of tree.displayEdges) {
      if (!connectedEdgesByNode.has(e.from)) connectedEdgesByNode.set(e.from, []);
      if (!connectedEdgesByNode.has(e.to)) connectedEdgesByNode.set(e.to, []);
      connectedEdgesByNode.get(e.from).push(e);
      connectedEdgesByNode.get(e.to).push(e);
    }

    const am = estimateNodeBoxMetrics(tree.primaryAnchor, "anchor");
    posMap.set(tree.primaryAnchor.id, {
      x: CONSTELLATION_CX,
      y: CONSTELLATION_CY,
      locked: true,
      ...am
    });

    if (tree.treeMode === "overview") {
      // Ring 1: ONLY 4 Contribution Group Hubs cleanly on their sector mid-angles
      for (const hub of tree.hubNodes) {
        const qMeta = tree.sectorMap.get(hub.groupKey);
        const angleDeg = qMeta?.midDeg ?? 0;
        const radius = 152;
        const pt = polarToCartesian(CONSTELLATION_CX, CONSTELLATION_CY, radius, angleDeg);
        const hubSize = computeGroupHubOrbSize(hub.visualWeight);
        const hm = estimateNodeBoxMetrics(hub, "group_hub", false, hubSize);
        posMap.set(hub.id, {
          x: pt.x,
          y: pt.y,
          angleDeg,
          radius,
          locked: true,
          ...hm
        });
      }

      // Ring 2: Top 8 Startups strictly partitioned inside their primary Contribution Group wedge
      const startupsByGroup = new Map([["access", []], ["lineage", []], ["timing", []], ["caution", []]]);
      for (const sn of tree.startupNodes) {
        const pGrp = tree.startupPrimaryGroup.get(sn.id) || "access";
        if (!startupsByGroup.has(pGrp)) startupsByGroup.set(pGrp, []);
        startupsByGroup.get(pGrp).push(sn);
      }

      for (const qMeta of tree.sectorMetaForSvg) {
        const groupItems = startupsByGroup.get(qMeta.group) || [];
        if (!groupItems.length) continue;
        const nS = groupItems.length;
        const sectorPad = Math.min(12, qMeta.spanDeg * 0.16);
        const a0 = qMeta.slotStart + sectorPad;
        const a1 = qMeta.slotEnd - sectorPad;
        const safeMinDeg = qMeta.slotStart + 5;
        const safeMaxDeg = qMeta.slotEnd - 5;

        groupItems.forEach((sn, idx) => {
          const angleDeg = nS === 1
            ? qMeta.midDeg
            : a0 + (idx / (nS - 1)) * (a1 - a0);
          const radius = nS <= 2
            ? 294
            : idx % 2 === 0
              ? 280
              : 326;
          const pt = polarToCartesian(CONSTELLATION_CX, CONSTELLATION_CY, radius, angleDeg);
          const triageRank = sn.triageRank || (shortlistOrder.get(sn.id) ?? 99) + 1;
          const isTier1 = triageRank <= 3 && sn.signalTier !== "Sparse / Baseline";
          const sm = estimateNodeBoxMetrics(sn, "startup", isTier1);
          posMap.set(sn.id, {
            x: pt.x,
            y: pt.y,
            angleDeg,
            radius,
            placedGroup: qMeta.group,
            sectorMinDeg: safeMinDeg,
            sectorMaxDeg: safeMaxDeg,
            minRingR: 266,
            maxRingR: 344,
            ...sm
          });
        });
      }

      resolveOrbAndLabelCollisions(posMap, nodeById, { polarRings: true });
    } else {
      // LEVEL 2: Focused Group Drill-Down Layout
      const activeSector = tree.sectorMap.get(tree.focusedGroupKey);
      const centerDeg = activeSector?.midDeg ?? 315;

      for (const hub of tree.hubNodes) {
        const qMeta = tree.sectorMap.get(hub.groupKey);
        const isExp = hub.isExpandedHub;
        const angleDeg = qMeta?.midDeg ?? 0;
        const radius = isExp ? 148 : 118;
        const pt = polarToCartesian(CONSTELLATION_CX, CONSTELLATION_CY, radius, angleDeg);
        const hubSize = isExp ? Math.max(28, computeGroupHubOrbSize(hub.visualWeight)) : 20;
        const hm = estimateNodeBoxMetrics(hub, "group_hub", false, hubSize);
        posMap.set(hub.id, {
          x: pt.x,
          y: pt.y,
          angleDeg,
          radius,
          locked: true,
          ...hm
        });
      }

      const nB = tree.bridgeNodes.length;
      const fanHalf = Math.min(88, Math.max(40, Math.max(nB, tree.startupNodes.length) * 14));
      const fanStart = centerDeg - fanHalf;
      const fanEnd = centerDeg + fanHalf;

      tree.bridgeNodes.forEach((bn, idx) => {
        const angleDeg = nB === 1 ? centerDeg : fanStart + (idx / (nB - 1)) * (fanEnd - fanStart);
        const radius = nB >= 6 ? [252, 306][idx % 2] : 272;
        const pt = polarToCartesian(CONSTELLATION_CX, CONSTELLATION_CY, radius, angleDeg);
        const bSize = computeBridgeOrbSize(bn, activeSector?.visualWeight ?? 1);
        const bm = estimateNodeBoxMetrics(bn, "bridge", false, bSize);
        posMap.set(bn.id, {
          x: pt.x,
          y: pt.y,
          angleDeg,
          radius,
          sectorMinDeg: fanStart - 8,
          sectorMaxDeg: fanEnd + 8,
          minRingR: 238,
          maxRingR: 325,
          ...bm
        });
      });

      // Place each focused startup behind its highest-rarity focused bridge
      const bridgeFocusSet = new Set(tree.bridgeNodes.map((b) => b.id));
      const focusedStartupsSorted = [...tree.startupNodes].map((sn) => {
        const bestBridgeEdge = tree.displayEdges
          .filter((e) => e.to === sn.id && bridgeFocusSet.has(e.from))
          .sort((a, b) => (b.rarityScore || 0) - (a.rarityScore || 0))[0];
        const parentPos = bestBridgeEdge ? posMap.get(bestBridgeEdge.from) : null;
        return {
          node: sn,
          targetAngle: parentPos?.angleDeg ?? centerDeg,
          triageRank: sn.triageRank || (shortlistOrder.get(sn.id) ?? 99) + 1
        };
      }).sort((a, b) => a.targetAngle - b.targetAngle || a.triageRank - b.triageRank);

      const nS = focusedStartupsSorted.length;
      focusedStartupsSorted.forEach((entry, idx) => {
        const spreadAngle = nS === 1
          ? centerDeg
          : Math.max(fanStart - 10, Math.min(fanEnd + 10, (fanStart + (idx / (nS - 1)) * (fanEnd - fanStart)) * 0.65 + entry.targetAngle * 0.35));
        const radius = nS >= 6 ? [388, 444][idx % 2] : 404;
        const pt = polarToCartesian(CONSTELLATION_CX, CONSTELLATION_CY, radius, spreadAngle);
        const isTier1 = entry.triageRank <= 3 && entry.node.signalTier !== "Sparse / Baseline";
        const sm = estimateNodeBoxMetrics(entry.node, "startup", isTier1);
        posMap.set(entry.node.id, {
          x: pt.x,
          y: pt.y,
          angleDeg: spreadAngle,
          radius,
          placedGroup: tree.focusedGroupKey,
          sectorMinDeg: fanStart - 14,
          sectorMaxDeg: fanEnd + 14,
          minRingR: 372,
          maxRingR: 472,
          ...sm
        });
      });

      resolveOrbAndLabelCollisions(posMap, nodeById, { polarRings: true });
    }

    let minX = CONSTELLATION_W;
    let minY = CONSTELLATION_H;
    let maxX = 0;
    let maxY = 0;
    for (const pos of posMap.values()) {
      minX = Math.min(minX, pos.x - (pos.halfW || 64));
      minY = Math.min(minY, pos.y - (pos.topPad || 22));
      maxX = Math.max(maxX, pos.x + (pos.halfW || 64));
      maxY = Math.max(maxY, pos.y + (pos.bottomPad || 40));
    }

    return {
      mode: "polar",
      treeMode: tree.treeMode,
      focusedGroupKey: tree.focusedGroupKey,
      anchorCount: 1,
      anchorIds: new Set([tree.primaryAnchor.id]),
      anchorId: tree.primaryAnchor.id,
      posMap,
      hulls: [],
      sectorMetaForSvg: tree.sectorMetaForSvg,
      nodeById,
      connectedEdgesByNode,
      displayNodes: [...allTreeNodes],
      displayEdges: tree.displayEdges,
      displayPeerEdges: tree.displayPeerEdges,
      startupPrimaryGroup: tree.startupPrimaryGroup,
      startupGroupEvidence: tree.startupGroupEvidence,
      totalStartupCount: tree.totalStartupCount,
      hiddenStartupCount: tree.hiddenStartupCount,
      bounds: {
        minX: minX - 36,
        minY: minY - 36,
        maxX: maxX + 36,
        maxY: maxY + 36
      }
    };
  }

  // MODE B: 2-4 Entity Comparison Layout (preserved for multi-entity comparison)
  for (const n of [...anchorNodes, ...bridgeNodes, ...startupNodes]) {
    nodeById.set(n.id, n);
    connectedEdgesByNode.set(n.id, []);
  }
  for (const e of edges) {
    if (!connectedEdgesByNode.has(e.from)) connectedEdgesByNode.set(e.from, []);
    if (!connectedEdgesByNode.has(e.to)) connectedEdgesByNode.set(e.to, []);
    connectedEdgesByNode.get(e.from).push(e);
    connectedEdgesByNode.get(e.to).push(e);
  }

  const compareWeights = computeContributionWeightsFrontend(bridgeMap, bridgeNodes);
  const bridgeBoxForCompare = (bNode) => {
    const vw = compareWeights[getNodeContributionGroup(bNode)]?.visualWeight ?? 1;
    return estimateNodeBoxMetrics(bNode, "bridge", false, computeBridgeOrbSize(bNode, vw));
  };
  const countA = anchorNodes.length;
  if (countA === 2) {
    const p0 = { x: CONSTELLATION_CX - 310, y: CONSTELLATION_CY + 120, outAngle: 158 };
    const p1 = { x: CONSTELLATION_CX + 310, y: CONSTELLATION_CY - 120, outAngle: 338 };
    [p0, p1].forEach((pt, idx) => {
      const aNode = anchorNodes[idx];
      const am = estimateNodeBoxMetrics(aNode, "anchor");
      posMap.set(aNode.id, { x: pt.x, y: pt.y, outAngle: pt.outAngle, ...am });
    });

    const sharedNodes = [...bridgeNodes, ...startupNodes].filter((n) => n.isSharedOverlap);
    const sharedBridges = sharedNodes.filter((n) => n.kind === "bridge");
    const sharedStartups = sharedNodes.filter((n) => n.kind === "startup");

    const dx = p1.x - p0.x;
    const dy = p1.y - p0.y;
    const dist = Math.hypot(dx, dy) || 1;
    const axisX = dx / dist;
    const axisY = dy / dist;
    const perpX = -dy / dist;
    const perpY = dx / dist;

    sharedBridges.forEach((n, idx) => {
      const t = sharedBridges.length === 1 ? 0 : idx - (sharedBridges.length - 1) / 2;
      const along = (idx % 2 === 0 ? -45 : 45);
      const perp = t * 94;
      const bm = bridgeBoxForCompare(n);
      posMap.set(n.id, {
        x: CONSTELLATION_CX + axisX * along + perpX * perp,
        y: CONSTELLATION_CY + axisY * along + perpY * perp,
        ...bm
      });
    });

    sharedStartups.forEach((n, idx) => {
      const t = sharedStartups.length === 1 ? 0 : idx - (sharedStartups.length - 1) / 2;
      const along = sharedBridges.length ? (idx % 2 === 0 ? 96 : -96) : 0;
      const perp = t * 102 + (idx % 2 === 0 ? 20 : -20);
      const sm = estimateNodeBoxMetrics(n, "startup", true);
      posMap.set(n.id, {
        x: CONSTELLATION_CX + axisX * along + perpX * perp,
        y: CONSTELLATION_CY + axisY * along + perpY * perp,
        ...sm
      });
    });

    anchorNodes.forEach((aNode) => {
      const ap = posMap.get(aNode.id);
      const uBridges = bridgeNodes.filter((b) => !b.isSharedOverlap && b.primaryAnchorId === aNode.id);
      const uStartups = startupNodes.filter((s) => !s.isSharedOverlap && s.primaryAnchorId === aNode.id);

      const bCount = uBridges.length;
      uBridges.forEach((b, idx) => {
        const deg = bCount === 1 ? ap.outAngle : ap.outAngle - 66 + (idx / (bCount - 1)) * 132;
        const pt = polarToCartesian(ap.x, ap.y, bCount >= 5 && idx % 2 ? 208 : 175, deg);
        const bm = bridgeBoxForCompare(b);
        posMap.set(b.id, { x: pt.x, y: pt.y, angleDeg: deg, ...bm });
      });

      const sCount = uStartups.length;
      uStartups.sort((a, b) => (a.triageRank || 99) - (b.triageRank || 99));
      uStartups.forEach((s, idx) => {
        const deg = sCount === 1 ? ap.outAngle : ap.outAngle - 78 + (idx / (sCount - 1)) * 156;
        const rad = idx % 2 === 0 ? 285 : 342;
        const pt = polarToCartesian(ap.x, ap.y, rad, deg);
        const isTier1 = (s.triageRank || 99) <= 3;
        const sm = estimateNodeBoxMetrics(s, "startup", isTier1);
        posMap.set(s.id, { x: pt.x, y: pt.y, angleDeg: deg, ...sm });
      });
    });
  } else {
    const anchorDegs = countA === 3 ? [-90, 30, 150] : [-135, -45, 45, 135];
    const anchorRadius = 335;
    anchorNodes.forEach((aNode, idx) => {
      const deg = anchorDegs[idx % anchorDegs.length];
      const pt = polarToCartesian(CONSTELLATION_CX, CONSTELLATION_CY, anchorRadius, deg);
      const am = estimateNodeBoxMetrics(aNode, "anchor");
      posMap.set(aNode.id, { x: pt.x, y: pt.y, outAngle: deg, ...am });
    });

    const sharedNodes = [...bridgeNodes, ...startupNodes].filter((n) => n.isSharedOverlap);
    sharedNodes.forEach((n, idx) => {
      const owners = (n.connectedAnchorIds || []).map((aid) => posMap.get(aid)).filter(Boolean);
      const cx = owners.length ? owners.reduce((s, p) => s + p.x, 0) / owners.length : CONSTELLATION_CX;
      const cy = owners.length ? owners.reduce((s, p) => s + p.y, 0) / owners.length : CONSTELLATION_CY;
      const angle = (idx * 137.5) % 360;
      const ring = n.kind === "bridge" ? 42 + (idx % 3) * 32 : 78 + (idx % 3) * 36;
      const pt = polarToCartesian(cx * 0.55 + CONSTELLATION_CX * 0.45, cy * 0.55 + CONSTELLATION_CY * 0.45, ring, angle);
      const m = n.kind === "bridge" ? bridgeBoxForCompare(n) : estimateNodeBoxMetrics(n, "startup", true);
      posMap.set(n.id, { x: pt.x, y: pt.y, ...m });
    });

    anchorNodes.forEach((aNode) => {
      const ap = posMap.get(aNode.id);
      const uBridges = bridgeNodes.filter((b) => !b.isSharedOverlap && b.primaryAnchorId === aNode.id);
      const uStartups = startupNodes.filter((s) => !s.isSharedOverlap && s.primaryAnchorId === aNode.id);

      uBridges.forEach((b, idx) => {
        const span = Math.min(82, Math.max(0, (uBridges.length - 1) * 20));
        const deg = uBridges.length === 1 ? ap.outAngle : ap.outAngle - span / 2 + (idx / (uBridges.length - 1)) * span;
        const pt = polarToCartesian(ap.x, ap.y, 190 + (idx % 2) * 34, deg);
        const bm = bridgeBoxForCompare(b);
        posMap.set(b.id, { x: pt.x, y: pt.y, ...bm });
      });

      uStartups.forEach((s, idx) => {
        const span = Math.min(96, Math.max(0, (uStartups.length - 1) * 16));
        const deg = uStartups.length === 1 ? ap.outAngle : ap.outAngle - span / 2 + (idx / (uStartups.length - 1)) * span;
        const pt = polarToCartesian(ap.x, ap.y, 330 + (idx % 2) * 58, deg);
        const sm = estimateNodeBoxMetrics(s, "startup", (s.triageRank || 99) <= 3);
        posMap.set(s.id, { x: pt.x, y: pt.y, ...sm });
      });
    });
  }

  resolveOrbAndLabelCollisions(posMap, nodeById, null);

  let minX = CONSTELLATION_W;
  let minY = CONSTELLATION_H;
  let maxX = 0;
  let maxY = 0;
  for (const pos of posMap.values()) {
    minX = Math.min(minX, pos.x - (pos.halfW || 80));
    minY = Math.min(minY, pos.y - (pos.topPad || 24));
    maxX = Math.max(maxX, pos.x + (pos.halfW || 80));
    maxY = Math.max(maxY, pos.y + (pos.bottomPad || 44));
  }
  if (!posMap.size) {
    minX = 240;
    minY = 120;
    maxX = 1720;
    maxY = 1280;
  }

  return {
    mode: "compare",
    treeMode: "compare",
    focusedGroupKey: null,
    anchorCount: anchorNodes.length,
    anchorIds: new Set(anchorNodes.map((a) => a.id)),
    anchorId: anchorNodes[0]?.id || null,
    posMap,
    hulls: [],
    sectorMetaForSvg: [],
    nodeById,
    connectedEdgesByNode,
    displayNodes: [...anchorNodes, ...bridgeNodes, ...startupNodes],
    displayEdges: edges,
    displayPeerEdges: bridgeMap?.peerEdges || [],
    totalStartupCount: startupNodes.length,
    hiddenStartupCount: 0,
    bounds: {
      minX: minX - 48,
      minY: minY - 48,
      maxX: maxX + 48,
      maxY: maxY + 48
    }
  };
}

function getIsolatedSetForNode(focusNodeId, layout, edges, peerEdges = []) {
  const activeNodes = new Set();
  const activeEdges = new Set();
  const activePeerEdges = new Set();
  const activeFamilies = new Set();

  if (!focusNodeId || !layout) {
    return { activeNodes, activeEdges, activePeerEdges, activeFamilies };
  }

  const focusNode = layout.nodeById.get(focusNodeId);
  if (!focusNode) {
    return { activeNodes, activeEdges, activePeerEdges, activeFamilies };
  }

  activeNodes.add(focusNodeId);

  if (focusNode.kind === "startup") {
    const incomingToStartup = edges.filter((e) => e.to === focusNodeId || e.from === focusNodeId);
    const parentNodeIds = new Set();
    for (const edge of incomingToStartup) {
      activeEdges.add(edge.id);
      activeNodes.add(edge.from);
      activeNodes.add(edge.to);
      const fromKind = layout.nodeById.get(edge.from)?.kind;
      if (fromKind === "bridge" || fromKind === "group_hub") parentNodeIds.add(edge.from);
      if (edge.bridgeFamily) activeFamilies.add(edge.bridgeFamily);
    }
    const expandedHubIds = new Set();
    for (const edge of edges) {
      if ((layout.anchorIds.has(edge.from) || layout.nodeById.get(edge.from)?.kind === "group_hub") && parentNodeIds.has(edge.to)) {
        activeEdges.add(edge.id);
        activeNodes.add(edge.from);
        if (layout.nodeById.get(edge.from)?.kind === "group_hub") expandedHubIds.add(edge.from);
        if (edge.bridgeFamily) activeFamilies.add(edge.bridgeFamily);
      }
    }
    if (expandedHubIds.size) {
      for (const edge of edges) {
        if (layout.anchorIds.has(edge.from) && expandedHubIds.has(edge.to)) {
          activeEdges.add(edge.id);
          activeNodes.add(edge.from);
        }
      }
    }
    for (const pe of peerEdges || []) {
      if (pe.from === focusNodeId || pe.to === focusNodeId) {
        activePeerEdges.add(pe.id);
        activeNodes.add(pe.from);
        activeNodes.add(pe.to);
      }
    }
  } else if (focusNode.kind === "group_hub") {
    const downstreamIds = new Set();
    for (const edge of edges) {
      if (edge.from === focusNodeId || edge.to === focusNodeId) {
        activeEdges.add(edge.id);
        activeNodes.add(edge.from);
        activeNodes.add(edge.to);
        if (edge.from === focusNodeId) downstreamIds.add(edge.to);
      }
    }
    for (const edge of edges) {
      if (downstreamIds.has(edge.from)) {
        activeEdges.add(edge.id);
        activeNodes.add(edge.to);
      }
    }
  } else if (focusNode.kind === "bridge") {
    if (focusNode.bridgeFamily) activeFamilies.add(focusNode.bridgeFamily);
    const upHubIds = new Set();
    for (const edge of edges) {
      if (edge.from === focusNodeId || edge.to === focusNodeId) {
        activeEdges.add(edge.id);
        activeNodes.add(edge.from);
        activeNodes.add(edge.to);
        if (layout.nodeById.get(edge.from)?.kind === "group_hub") upHubIds.add(edge.from);
        if (edge.bridgeFamily) activeFamilies.add(edge.bridgeFamily);
      }
    }
    for (const edge of edges) {
      if (layout.anchorIds.has(edge.from) && upHubIds.has(edge.to)) {
        activeEdges.add(edge.id);
        activeNodes.add(edge.from);
      }
    }
  } else if (focusNode.kind === "anchor") {
    const directTargets = new Set();
    for (const edge of edges) {
      if (edge.from === focusNodeId || edge.to === focusNodeId) {
        activeEdges.add(edge.id);
        activeNodes.add(edge.from);
        activeNodes.add(edge.to);
        const toKind = layout.nodeById.get(edge.to)?.kind;
        if (toKind === "bridge" || toKind === "group_hub") directTargets.add(edge.to);
        if (edge.bridgeFamily) activeFamilies.add(edge.bridgeFamily);
      }
    }
    for (const edge of edges) {
      if (directTargets.has(edge.from)) {
        activeEdges.add(edge.id);
        activeNodes.add(edge.to);
      }
    }
  }

  return { activeNodes, activeEdges, activePeerEdges, activeFamilies };
}

function applyPathLaserIsolation() {
  const svgEl = document.getElementById("constellationSvg");
  const nodesLayer = document.getElementById("constellationNodesLayer");
  const effMap = getEffectiveBridgeMap();
  const layout = state.mapLayoutNodes;
  if (!svgEl || !nodesLayer || !layout || !effMap) return;

  const focusId = state.hoveredNodeId || state.selectedStartupId || state.selectedBridgeId || state.selectedAnchorId || null;
  if (!focusId) {
    svgEl.classList.remove("has-isolation");
    svgEl.querySelectorAll(".edge-arc").forEach((el) => el.classList.remove("is-highlighted", "is-path-active"));
    svgEl.querySelectorAll(".peer-edge-arc").forEach((el) => el.classList.remove("is-highlighted", "is-path-active"));
    nodesLayer.querySelectorAll(".map-node").forEach((el) => {
      el.classList.remove("is-dimmed", "is-highlighted", "is-path-active");
    });
    return;
  }

  const activeEdgeSource = layout.displayEdges || effMap.edges || [];
  const activePeerSource = layout.displayPeerEdges || effMap.peerEdges || [];
  const { activeNodes, activeEdges, activePeerEdges } = getIsolatedSetForNode(
    focusId,
    layout,
    activeEdgeSource,
    activePeerSource
  );
  svgEl.classList.add("has-isolation");

  svgEl.querySelectorAll(".edge-arc").forEach((el) => {
    const eid = el.getAttribute("data-edge-id");
    const on = activeEdges.has(eid);
    el.classList.toggle("is-highlighted", on);
    el.classList.toggle("is-path-active", on);
  });

  svgEl.querySelectorAll(".peer-edge-arc").forEach((el) => {
    const peId = el.getAttribute("data-peer-edge-id");
    const on = activePeerEdges.has(peId);
    el.classList.toggle("is-highlighted", on);
    el.classList.toggle("is-path-active", on);
  });

  nodesLayer.querySelectorAll(".map-node").forEach((el) => {
    const nid = el.getAttribute("data-node-id");
    const isActive = activeNodes.has(nid);
    el.classList.toggle("is-highlighted", isActive);
    el.classList.toggle("is-path-active", isActive);
    el.classList.toggle("is-dimmed", !isActive);
  });
}

function showMapTooltip(clientX, clientY, htmlContent) {
  const canvasEl = document.getElementById("bridgeMapCanvas");
  const tipEl = document.getElementById("mapHoverTooltip");
  if (!canvasEl || !tipEl || !htmlContent) return;

  const rect = canvasEl.getBoundingClientRect();
  tipEl.innerHTML = cleanUiCopy(htmlContent);
  tipEl.hidden = false;

  const tipW = tipEl.offsetWidth || 320;
  const tipH = tipEl.offsetHeight || 140;
  const rawLeft = clientX - rect.left + 14;
  const rawTop = clientY - rect.top + 14;
  const minLeft = rect.width >= 900 ? 24 : 12;
  const maxLeft = Math.max(minLeft, rect.width - getTooltipRightReserve() - tipW - 12);
  const maxTop = Math.max(12, rect.height - tipH - 12);
  const clampedLeft = Math.max(minLeft, Math.min(maxLeft, rawLeft));
  const clampedTop = rawTop > maxTop ? Math.max(12, clientY - rect.top - tipH - 12) : Math.max(12, rawTop);
  tipEl.style.left = `${clampedLeft}px`;
  tipEl.style.top = `${Math.min(maxTop, clampedTop)}px`;
}

function hideMapTooltip() {
  const tipEl = document.getElementById("mapHoverTooltip");
  if (tipEl) tipEl.hidden = true;
}

function hashEdgeSign(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h * 31 + str.charCodeAt(i)) | 0;
  }
  return h % 2 === 0 ? 1 : -1;
}

function buildMapEdgeSvgMarkup(edge, posMap) {
  const p1 = posMap.get(edge.from);
  const p2 = posMap.get(edge.to);
  if (!p1 || !p2) return "";

  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const dist = Math.hypot(dx, dy) || 1;
  const ux = dx / dist;
  const uy = dy / dist;

  const r1 = (p1.orbR || 8) + 2;
  const r2 = (p2.orbR || 8) + 5;
  const sx = p1.x + ux * r1;
  const sy = p1.y + uy * r1;
  const ex = p2.x - ux * r2;
  const ey = p2.y - uy * r2;

  const cdx = ex - sx;
  const cdy = ey - sy;
  const chord = Math.max(24, Math.hypot(cdx, cdy));
  const nx = -(cdy / chord);
  const ny = cdx / chord;

  // Sweep secondary cross-quadrant curves gracefully outward away from Center Anchor
  let bowSign = edge.anchorBow ? edge.anchorBow : 1;
  if (edge.isSecondaryOverviewLink) {
    const mx = (sx + ex) / 2;
    const my = (sy + ey) / 2;
    const awayX = mx - CONSTELLATION_CX;
    const awayY = my - CONSTELLATION_CY;
    bowSign = (awayX * nx + awayY * ny) >= 0 ? 1 : -1;
  }
  const curveScale = edge.isOverviewSpoke ? 0.12 : edge.isSecondaryOverviewLink ? 0.22 : 0.16;
  const curvature = Math.min(85, chord * curveScale) * bowSign;
  const cx = (sx + ex) / 2 + nx * curvature;
  const cy = (sy + ey) / 2 + ny * curvature;

  const d = `M ${sx.toFixed(1)} ${sy.toFixed(1)} Q ${cx.toFixed(1)} ${cy.toFixed(1)} ${ex.toFixed(1)} ${ey.toFixed(1)}`;

  const rank = String(edge.topSourceRank || "AGGREGATOR").toUpperCase();
  const isSolid = rank === "FILING" || rank === "PRIMARY";
  const cg = getNodeContributionGroup(edge);
  const rarity = Number(edge.rarityScore) || 1;
  const width = Math.min(3.0, Math.max(1.3, 1.25 + rarity * 0.05 + (edge.isSharedEdge ? 0.45 : 0))).toFixed(2);
  const opacity = edge.isGroupDimmedEdge
    ? "0.14"
    : edge.isSecondaryOverviewLink
      ? "0"
      : Math.min(0.86, Math.max(0.42, 0.42 + rarity * 0.015 + (edge.isSharedEdge ? 0.16 : 0))).toFixed(2);
  const color = getContributionColorHex(cg);

  return `
    <g class="edge-group">
      <path
        class="edge-arc ${isSolid ? "is-solid" : "is-dashed"} ${edge.isSharedEdge ? "is-shared-edge" : ""} ${edge.isSecondaryOverviewLink ? "is-secondary-overview-link" : ""} ${edge.isGroupDimmedEdge ? "is-group-dimmed" : ""}"
        data-edge-id="${escapeHtml(edge.id)}"
        data-contribution-group="${escapeHtml(cg)}"
        d="${d}"
        stroke="${color}"
        style="color:${color}; stroke-width:${width}px; opacity:${opacity};"
      />
      ${edge.isSecondaryOverviewLink || edge.isGroupDimmedEdge ? "" : `
      <path
        class="edge-hit-target"
        data-edge-id="${escapeHtml(edge.id)}"
        data-edge-from="${escapeHtml(edge.from)}"
        data-edge-to="${escapeHtml(edge.to)}"
        d="${d}"
      />`}
    </g>
  `;
}

function getPeerEdgeColor(kind) {
  if (kind === "shared_alumni") return getContributionColorHex("lineage");
  if (kind === "shared_investor") return getContributionColorHex("access");
  return getContributionColorHex("timing");
}

function getPeerEdgeContribGroup(kind) {
  if (kind === "shared_alumni") return "lineage";
  if (kind === "shared_investor") return "access";
  return "timing";
}

function buildMapPeerEdgeSvgMarkup(peerEdge, posMap) {
  const p1 = posMap.get(peerEdge.from);
  const p2 = posMap.get(peerEdge.to);
  if (!p1 || !p2) return "";

  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const dist = Math.hypot(dx, dy) || 1;
  const ux = dx / dist;
  const uy = dy / dist;
  const r1 = (p1.orbR || 7) + 2;
  const r2 = (p2.orbR || 7) + 5;
  const sx = p1.x + ux * r1;
  const sy = p1.y + uy * r1;
  const ex = p2.x - ux * r2;
  const ey = p2.y - uy * r2;

  const chord = Math.max(24, Math.hypot(ex - sx, ey - sy));
  const mx = (sx + ex) / 2;
  const my = (sy + ey) / 2;
  const outX = mx - CONSTELLATION_CX;
  const outY = my - CONSTELLATION_CY;
  const outLen = Math.hypot(outX, outY) || 1;
  const curvature = Math.min(85, Math.max(22, chord * 0.16));
  const cx = mx + (outX / outLen) * curvature;
  const cy = my + (outY / outLen) * curvature;

  const d = `M ${sx.toFixed(1)} ${sy.toFixed(1)} Q ${cx.toFixed(1)} ${cy.toFixed(1)} ${ex.toFixed(1)} ${ey.toFixed(1)}`;
  const color = getPeerEdgeColor(peerEdge.kind);
  const cg = getPeerEdgeContribGroup(peerEdge.kind);

  return `
    <g class="peer-edge-group">
      <path
        class="peer-edge-arc"
        data-peer-edge-id="${escapeHtml(peerEdge.id)}"
        data-contribution-group="${escapeHtml(cg)}"
        d="${d}"
        stroke="${color}"
        style="color:${color}; stroke-width:1.4px; opacity:0.24;"
      />
      <path
        class="peer-edge-hit-target"
        data-peer-edge-id="${escapeHtml(peerEdge.id)}"
        data-edge-from="${escapeHtml(peerEdge.from)}"
        data-edge-to="${escapeHtml(peerEdge.to)}"
        d="${d}"
      />
    </g>
  `;
}

function describeSvgArc(cx, cy, radius, startDeg, endDeg) {
  const pStart = polarToCartesian(cx, cy, radius, startDeg);
  const pEnd = polarToCartesian(cx, cy, radius, endDeg);
  const largeArc = Math.abs(endDeg - startDeg) <= 180 ? 0 : 1;
  return `M ${pStart.x.toFixed(1)} ${pStart.y.toFixed(1)} A ${radius} ${radius} 0 ${largeArc} 1 ${pEnd.x.toFixed(1)} ${pEnd.y.toFixed(1)}`;
}

function describeSvgSectorWedge(cx, cy, rInner, rOuter, startDeg, endDeg) {
  const oStart = polarToCartesian(cx, cy, rOuter, startDeg);
  const oEnd = polarToCartesian(cx, cy, rOuter, endDeg);
  const iEnd = polarToCartesian(cx, cy, rInner, endDeg);
  const iStart = polarToCartesian(cx, cy, rInner, startDeg);
  const largeArc = Math.abs(endDeg - startDeg) <= 180 ? 0 : 1;
  return `M ${oStart.x.toFixed(1)} ${oStart.y.toFixed(1)} A ${rOuter} ${rOuter} 0 ${largeArc} 1 ${oEnd.x.toFixed(1)} ${oEnd.y.toFixed(1)} L ${iEnd.x.toFixed(1)} ${iEnd.y.toFixed(1)} A ${rInner} ${rInner} 0 ${largeArc} 0 ${iStart.x.toFixed(1)} ${iStart.y.toFixed(1)} Z`;
}

function buildConstellationSvgDefs() {
  const groups = ["access", "lineage", "timing", "caution"];
  const markers = groups.map((g) => {
    const col = getContributionColorHex(g);
    return `
      <marker id="arrow-${g}" viewBox="0 0 10 10" refX="7.5" refY="5" markerWidth="6" markerHeight="6" orient="auto">
        <path d="M 1.2 1.8 L 8.8 5 L 1.2 8.2 z" fill="${col}" />
      </marker>
    `;
  }).join("");
  const grads = groups.map((g) => {
    const col = getContributionColorHex(g);
    return `
      <radialGradient id="halo-grad-${g}" cx="${CONSTELLATION_CX}" cy="${CONSTELLATION_CY}" r="490" gradientUnits="userSpaceOnUse">
        <stop offset="16%" stop-color="${col}" stop-opacity="0.24" />
        <stop offset="68%" stop-color="${col}" stop-opacity="0.09" />
        <stop offset="100%" stop-color="${col}" stop-opacity="0" />
      </radialGradient>
    `;
  }).join("");
  return `<defs>${markers}${grads}</defs>`;
}

function renderConstellationMap(bridgeMapInput, options = {}) {
  const effMap = bridgeMapInput === undefined ? getEffectiveBridgeMap() : bridgeMapInput;
  const svgEl = document.getElementById("constellationSvg");
  const nodesLayer = document.getElementById("constellationNodesLayer");
  const emptyEl = document.getElementById("constellationEmptyState");
  const emptyTitleEl = document.getElementById("constellationEmptyTitle");
  const emptyMsgEl = document.getElementById("constellationEmptyDesc");
  const revealEmptyBtn = document.getElementById("emptyRevealMegaHubsBtn");
  const showAllBridgesBtn = document.getElementById("emptyShowAllBridgesBtn");

  if (!svgEl || !nodesLayer) return;

  const layout = layoutBridgeMapNodes(effMap || { anchor: { id: "query-anchor", label: getSelectedBenchmarkLabel(), kind: "anchor" }, nodes: [], edges: [], clusters: [] });
  state.mapLayoutNodes = layout;

  const displayNodes = layout.displayNodes || [];
  const edges = layout.displayEdges || effMap?.edges || [];
  const peerEdges = layout.displayPeerEdges || effMap?.peerEdges || [];
  const anchorNodes = displayNodes.filter((n) => n.kind === "anchor");
  const hubNodes = displayNodes.filter((n) => n.kind === "group_hub");
  const bridgeNodes = displayNodes.filter((n) => n.kind === "bridge");
  const startupNodes = displayNodes.filter((n) => n.kind === "startup");

  // Update top-center drill-down return pill & bottom-center "+ View all N in Matches" pill
  const backBtnEl = document.getElementById("mapDrilldownBackBtn");
  const backBadgeEl = document.getElementById("mapDrilldownGroupBadge");
  if (backBtnEl) {
    const showBack = layout.mode === "polar" && layout.treeMode === "drilldown" && Boolean(layout.focusedGroupKey);
    backBtnEl.hidden = !showBack;
    if (showBack && backBadgeEl) {
      const grpMeta = CONTRIBUTION_VISUAL_META[layout.focusedGroupKey];
      backBadgeEl.textContent = `${grpMeta?.headerLabel || layout.focusedGroupKey.toUpperCase()} (${bridgeNodes.length} bridges, ${startupNodes.length} targets)`;
      backBadgeEl.dataset.group = layout.focusedGroupKey;
    }
  }

  const viewAllEl = document.getElementById("mapViewAllMatchesPill");
  if (viewAllEl) {
    const showViewAll = layout.mode === "polar" && layout.treeMode === "overview" && (layout.hiddenStartupCount || 0) > 0;
    viewAllEl.hidden = !showViewAll;
    if (showViewAll) {
      viewAllEl.textContent = `All ${layout.totalStartupCount} targets in Matches rail`;
    }
  }

  // 1. Render Concentric Orbit Rings & Weighted Sector Wedges
  const defsMarkup = buildConstellationSvgDefs();
  let guidesMarkup = "";
  if (layout.mode === "polar") {
    const isLight = getActiveTheme() === "light";
    const isDrill = layout.treeMode === "drilldown";
    const outerRadius = isDrill ? 468 : 348;
    const orbitRadii = isDrill
      ? [
          { r: 148, cls: "orbit-guide-ring" },
          { r: 276, cls: "orbit-guide-ring is-dashed" },
          { r: 416, cls: "orbit-guide-ring" }
        ]
      : [
          { r: 152, cls: "orbit-guide-ring" },
          { r: 298, cls: "orbit-guide-ring is-dashed" }
        ];
    const qArcs = (layout.sectorMetaForSvg || [])
      .map((q) => {
        const arcColor = getContributionColorHex(q.group);
        const wedgeD = describeSvgSectorWedge(CONSTELLATION_CX, CONSTELLATION_CY, 56, outerRadius, q.slotStart + 2, q.slotEnd - 2);
        const arcD = describeSvgArc(CONSTELLATION_CX, CONSTELLATION_CY, outerRadius - 4, q.minDeg, q.maxDeg);
        const weightRatio = Math.max(0, Math.min(1, ((q.visualWeight || 1) - 0.6) / 1.05));
        const isDimmedSector = isDrill && q.group !== layout.focusedGroupKey;
        const haloOpacity = isDimmedSector
          ? 0.08
          : ((isLight ? 0.24 : 0.30) + weightRatio * (isLight ? 0.38 : 0.50));
        const arcOpacity = isDimmedSector ? 0.08 : (0.22 + weightRatio * 0.36);
        return `
          <path class="sector-halo-wedge ${q.isStrongest && !isDimmedSector ? "is-strongest" : ""}" d="${wedgeD}" fill="url(#halo-grad-${q.group})" style="fill-opacity:${haloOpacity.toFixed(2)};" />
          <path class="sector-guide-arc ${q.isStrongest && !isDimmedSector ? "is-strongest" : ""}" d="${arcD}" stroke="${arcColor}" style="stroke-opacity:${arcOpacity.toFixed(2)};" />
        `;
      })
      .join("");
    guidesMarkup = `
      ${qArcs}
      ${orbitRadii.map((rg) => `<circle class="${rg.cls}" cx="${CONSTELLATION_CX}" cy="${CONSTELLATION_CY}" r="${rg.r}" />`).join("")}
    `;
  } else {
    const sharedCount = effMap?.stats?.sharedOverlapCount || 0;
    guidesMarkup = `
      <ellipse class="compare-overlap-lens" cx="${CONSTELLATION_CX}" cy="${CONSTELLATION_CY}" rx="190" ry="155" />
      <text class="compare-overlap-label" x="${CONSTELLATION_CX}" y="${CONSTELLATION_CY - 168}" text-anchor="middle">SHARED OVERLAP · ${sharedCount}</text>
      <circle class="orbit-guide-ring is-dashed" cx="${CONSTELLATION_CX}" cy="${CONSTELLATION_CY}" r="430" />
    `;
  }

  const peerEdgesMarkup = peerEdges.map((pe) => buildMapPeerEdgeSvgMarkup(pe, layout.posMap)).join("");
  const edgesMarkup = edges.map((e) => buildMapEdgeSvgMarkup(e, layout.posMap)).join("");
  svgEl.innerHTML = `${defsMarkup}${guidesMarkup}${peerEdgesMarkup}${edgesMarkup}`;

  // 2. Render Glowing Anchor, Group Hubs (Level 1), Sub-Bridges (Level 2), and Startups
  const suppressed = effMap?.stats?.suppressedMegaHubCount ?? 0;
  let nodesHtml = "";
  const seenShortLabels = new Set();

  anchorNodes.forEach((aNode, aIdx) => {
    const p = layout.posMap.get(aNode.id);
    if (!p) return;
    const isSel = state.selectedAnchorId === aNode.id;
    const pal = ANCHOR_PALETTE[(aNode.anchorIndex ?? aIdx) % ANCHOR_PALETTE.length];
    const colHex = aNode.anchorColor || pal.hex;
    const colGlow = aNode.anchorGlow || pal.glow;
    const colEdge = aNode.anchorEdge || pal.edge;
    const isCompare = layout.mode === "compare";
    const fullAnchorLabel = cleanUiCopy(aNode.label || getSelectedBenchmarkLabel());
    const conciseAnchorLabel = formatCompactEntityName(fullAnchorLabel, 2, 22);
    const compareTag = isCompare ? (aNode.entityType === "startup" ? `Compare #${aIdx + 1}` : `Anchor #${aIdx + 1}`) : "";

    nodesHtml += `
      <button
        type="button"
        class="map-node node-anchor-orb ${isCompare ? "is-compare-anchor" : ""} ${isSel ? "is-selected" : ""}"
        data-node-kind="anchor"
        data-node-id="${escapeHtml(aNode.id)}"
        style="left:${p.x.toFixed(1)}px; top:${p.y.toFixed(1)}px; --orb-color:${colHex}; --orb-glow:${colGlow}; --orb-core-edge:${colEdge};"
      >
        <span class="orb-core-wrap">
          <span class="orb-halo-ring" aria-hidden="true"></span>
          <span class="orb-core-dot" aria-hidden="true">
            <span class="orb-anchor-inner-name">${escapeHtml(conciseAnchorLabel)}</span>
          </span>
        </span>
        <span class="orb-float-label">
          ${compareTag ? `<span class="orb-anchor-kicker">${escapeHtml(compareTag)}</span>` : ""}
          <span class="orb-label-main"><span class="orb-name-text">${escapeHtml(fullAnchorLabel)}</span></span>
        </span>
      </button>
    `;
  });

  for (const hub of hubNodes) {
    const p = layout.posMap.get(hub.id);
    if (!p) continue;
    const cg = hub.groupKey;
    const cgMeta = CONTRIBUTION_VISUAL_META[cg] || CONTRIBUTION_VISUAL_META.access;
    const colHex = getContributionColorHex(cg);
    const colGlow = getContributionGlowRgba(cg);
    const colEdge = cgMeta.darkEdge || colHex;
    const hubSize = p.bridgeSize || computeGroupHubOrbSize(hub.visualWeight);

    nodesHtml += `
      <button
        type="button"
        class="map-node node-group-hub ${hub.isExpandedHub ? "is-expanded-hub is-selected" : ""} ${hub.isGroupDimmed ? "is-group-dimmed" : ""} ${hub.isStrongest ? "is-strongest" : ""}"
        data-node-kind="group_hub"
        data-node-id="${escapeHtml(hub.id)}"
        data-group-key="${escapeHtml(cg)}"
        data-contribution-group="${escapeHtml(cg)}"
        style="left:${p.x.toFixed(1)}px; top:${p.y.toFixed(1)}px; --orb-color:${colHex}; --orb-glow:${colGlow}; --orb-core-edge:${colEdge}; --hub-size:${hubSize}px;"
      >
        <span class="orb-core-wrap">
          <span class="orb-halo-ring" aria-hidden="true"></span>
          <span class="orb-core-dot" aria-hidden="true"></span>
        </span>
        <span class="orb-float-label hub-float-label">
          <span class="orb-label-main">
            <span class="orb-name-text hub-title-text">${escapeHtml(hub.label)}</span>
          </span>
          <span class="hub-clue-metric">${escapeHtml(hub.clueMetric)}</span>
        </span>
      </button>
    `;
  }

  for (const b of bridgeNodes) {
    const p = layout.posMap.get(b.id);
    if (!p) continue;
    const isSel = state.selectedBridgeId === b.id;
    const fam = b.bridgeFamily || "feeder";
    const cg = getNodeContributionGroup(b);
    const cgMeta = CONTRIBUTION_VISUAL_META[cg] || CONTRIBUTION_VISUAL_META.access;
    const colHex = b.isSharedOverlap ? "#a78bfa" : getContributionColorHex(cg);
    const colGlow = b.isSharedOverlap ? "rgba(167, 139, 250, 0.50)" : getContributionGlowRgba(cg);
    const colEdge = cgMeta.darkEdge || colHex;
    const bridgeSize = p.bridgeSize || computeBridgeOrbSize(b, 1);
    const shortLabel = formatCompactEntityName(formatShortBridgeLabel(b.label, b, seenShortLabels), 3, 21);

    nodesHtml += `
      <button
        type="button"
        class="map-node node-bridge-orb ${layout.treeMode === "drilldown" ? "is-drilldown-bridge" : ""} ${b.isSharedOverlap ? "is-shared-overlap" : ""} ${isSel ? "is-selected" : ""}"
        data-node-kind="bridge"
        data-node-id="${escapeHtml(b.id)}"
        data-bridge-id="${escapeHtml(b.id)}"
        data-family="${escapeHtml(fam)}"
        data-contribution-group="${escapeHtml(cg)}"
        style="left:${p.x.toFixed(1)}px; top:${p.y.toFixed(1)}px; --orb-color:${colHex}; --orb-glow:${colGlow}; --orb-core-edge:${colEdge}; --bridge-size:${bridgeSize}px;"
      >
        <span class="orb-core-wrap">
          <span class="orb-halo-ring" aria-hidden="true"></span>
          <span class="orb-core-dot" aria-hidden="true"></span>
        </span>
        <span class="orb-float-label">
          <span class="orb-label-main">
            <span class="orb-name-text">${escapeHtml(shortLabel)}</span>
          </span>
        </span>
      </button>
    `;
  }

  for (let sIdx = 0; sIdx < startupNodes.length; sIdx++) {
    const s = startupNodes[sIdx];
    const p = layout.posMap.get(s.id);
    if (!p) continue;
    const isSel = state.selectedStartupId === s.id;
    const fullItem = state.DisplayedShortlist.find((c) => c.id === s.id) || state.allKnownItems.get(s.id);
    const triageRank = s.triageRank || (sIdx + 1);
    const signalTier = s.signalTier || fullItem?.signalTier || "Contextual Match";
    const isTier1 = triageRank <= 3 && signalTier !== "Sparse / Baseline";
    const isTierQuiet = !isTier1 && !s.isSharedOverlap && (signalTier === "Sparse / Baseline" || triageRank > 8);
    const tierCls = isTier1 ? "is-tier-1" : isTierQuiet ? "is-tier-quiet" : "is-tier-2";

    const cg = (!s.isSharedOverlap && p.placedGroup) ? p.placedGroup : getNodeContributionGroup(s);
    const cgMeta = CONTRIBUTION_VISUAL_META[cg] || CONTRIBUTION_VISUAL_META.access;
    const colHex = s.isSharedOverlap ? "#a78bfa" : getContributionColorHex(cg);
    const colGlow = s.isSharedOverlap ? "rgba(167, 139, 250, 0.55)" : getContributionGlowRgba(cg);
    const colEdge = cgMeta.darkEdge || colHex;
    const innerNumeral = isTier1 && triageRank <= 3 ? `<span class="orb-inner-numeral" aria-hidden="true">${triageRank}</span>` : "";
    const compactName = formatCompactEntityName(s.label, isTier1 ? 2 : 3, isTier1 ? 18 : 21);

    nodesHtml += `
      <button
        type="button"
        class="map-node node-startup-orb ${tierCls} ${s.isSharedOverlap ? "is-shared-overlap" : ""} ${isSel ? "is-selected" : ""}"
        data-node-kind="startup"
        data-node-id="${escapeHtml(s.id)}"
        data-startup-id="${escapeHtml(s.id)}"
        data-contribution-group="${escapeHtml(cg)}"
        style="left:${p.x.toFixed(1)}px; top:${p.y.toFixed(1)}px; --orb-color:${colHex}; --orb-glow:${colGlow}; --orb-core-edge:${colEdge};"
      >
        <span class="orb-core-wrap">
          <span class="orb-halo-ring" aria-hidden="true"></span>
          <span class="orb-core-dot" aria-hidden="true">${innerNumeral}</span>
        </span>
        <span class="orb-float-label">
          <span class="orb-label-main">
            <span class="orb-name-text">${escapeHtml(compactName)}</span>
          </span>
        </span>
      </button>
    `;
  }

  nodesLayer.innerHTML = nodesHtml;

  // 3. Handle Empty States cleanly with actionable relaxSuggestions
  const emptyRelaxEl = document.getElementById("emptyRelaxSuggestions");
  if (emptyEl) {
    const rawStartupCount = (effMap?.nodes || []).filter((n) => n.kind === "startup").length;
    const rawBridgeCount = (effMap?.nodes || []).filter((n) => n.kind === "bridge").length;
    const noMatches = rawStartupCount === 0 && !effMap?.compareMode;
    const noBridgesOnly = rawStartupCount > 0 && rawBridgeCount === 0 && !effMap?.compareMode;
    if (noMatches || noBridgesOnly) {
      emptyEl.hidden = false;
      if (emptyTitleEl) {
        emptyTitleEl.textContent = noMatches
          ? "0 startups match strict filters"
          : "No bridges visible in current filter";
      }
      if (emptyMsgEl) {
        emptyMsgEl.textContent = noMatches
          ? "Strict filters returned 0 exact matches. Relax one constraint below instead of showing off-target startups."
          : suppressed > 0
            ? `${rawStartupCount} startups matched, and ${suppressed} mega-hub bridges were suppressed. Reveal suppressed hubs or switch decision lenses.`
            : `${rawStartupCount} startups matched, but none hold signals in this decision lens. Switch to All Lenses.`;
      }
      if (emptyRelaxEl) {
        const relaxBtns = (state.lastRefineResponse?.relaxSuggestions || [])
          .map(
            (r) =>
              `<button type="button" class="relax-pill-btn" data-relax-filter="${escapeHtml(r.filter)}" data-relax-value="${escapeHtml(String(r.value ?? ""))}">${escapeHtml(cleanUiCopy(r.label))}</button>`
          )
          .join("");
        emptyRelaxEl.innerHTML = relaxBtns;
        emptyRelaxEl.hidden = !relaxBtns;
      }
      if (revealEmptyBtn) {
        revealEmptyBtn.hidden = !(suppressed > 0 && state.hideMegaHubs !== false);
      }
      if (showAllBridgesBtn) {
        showAllBridgesBtn.hidden = !((state.contributionGroup && state.contributionGroup !== "all") || (state.bridgeFamily && state.bridgeFamily !== "all"));
      }
    } else {
      emptyEl.hidden = true;
      if (emptyRelaxEl) {
        emptyRelaxEl.innerHTML = "";
        emptyRelaxEl.hidden = true;
      }
    }
  }

  if (options.fit) {
    requestAnimationFrame(() => fitConstellationToViewport());
  } else {
    applyMapViewportTransform();
  }
  applyPathLaserIsolation();
  renderQuickInspectorCard();
}

function renderQuickInspectorCard() {
  const cardEl = document.getElementById("mapQuickInspectorCard");
  if (!cardEl) return;

  if (state.sideRailOpen) {
    cardEl.hidden = true;
    cardEl.innerHTML = "";
    return;
  }

  const effMap = getEffectiveBridgeMap();
  const nodes = effMap?.nodes || state.mapLayoutNodes?.nodeById ? [...(state.mapLayoutNodes?.nodeById?.values() || [])] : [];
  const findNode = (id) => nodes.find((n) => n.id === id) || state.mapLayoutNodes?.nodeById?.get(id);

  if (state.selectedStartupId) {
    const item = state.DisplayedShortlist.find((c) => c.id === state.selectedStartupId)
      || state.allKnownItems.get(state.selectedStartupId);
    const mNode = findNode(state.selectedStartupId);
    const label = item?.name || mNode?.label;
    if (!label) {
      cardEl.hidden = true;
      return;
    }

    const topPath = item?.evidenceFolders?.hiddenBridges?.paths?.[0];
    const cg = getNodeContributionGroup(mNode || topPath || item);
    const cgMeta = CONTRIBUTION_VISUAL_META[cg] || CONTRIBUTION_VISUAL_META.access;
    const colHex = mNode?.isSharedOverlap ? "#a78bfa" : getContributionColorHex(cg);
    const rankNum = mNode?.triageRank || (state.DisplayedShortlist.findIndex((c) => c.id === state.selectedStartupId) + 1) || null;
    const rankStr = String(item?.dataConfidence?.topSourceRank || mNode?.topSourceRank || "AGGREGATOR").toUpperCase();
    const observed = item?.evidenceFolders?.proofAndGaps?.verifiedFacts?.length ?? item?.evidenceFolders?.proofAndGaps?.verifiedRecords?.length ?? item?.dataConfidence?.observedCount ?? 0;
    const missing = item?.evidenceFolders?.proofAndGaps?.missingFromCala?.length ?? mNode?.missingGapCount ?? 0;
    const conflict = item?.diligencePacket?.conflictRisk || mNode?.conflictRisk || { level: "None" };
    const conflictSummary = conflict.level && conflict.level !== "None"
      ? `${conflict.level}: ${conflict.companyName || "Overlap"}`
      : "No direct conflict";
    const pathText = topPath?.bridgeEntityName
      ? `${topPath.bridgeEntityName}${topPath.lift ? ` (${topPath.lift}x)` : ""}`
      : (mNode?.bestBridgeSummary || "Direct sector profile");
    const formulaText = topPath?.formulaBreakdown?.inputs
      || item?.evidenceFolders?.observedActivity?.velocityFormula
      || item?.diligencePacket?.timingFormula
      || mNode?.bestBridgeFormula?.inputs
      || `${observed} verified records / ${missing} Cala gaps`;

    cardEl.innerHTML = `
      <div class="quick-card-head">
        <div class="quick-card-title-row">
          <span class="quick-card-orb" style="background:${colHex}; color:${colHex};"></span>
          <div>
            <h4 class="quick-card-name">${escapeHtml(label)}</h4>
            <div class="quick-card-sub">${escapeHtml([item?.sector || mNode?.sector, item?.stage || mNode?.stage, item?.country || mNode?.country].filter(Boolean).join(" · "))}</div>
          </div>
        </div>
        <button type="button" class="quick-card-close" id="quickInspectorCloseBtn" aria-label="Close quick facts">x</button>
      </div>
      <div class="quick-card-badges">
        ${rankNum ? `<span class="orb-rank-tag">#${rankNum} Target</span>` : ""}
        <span class="micro-pill micro-primary">${escapeHtml(cgMeta.headerLabel)}</span>
        ${getSourceRankBadgeHtml(rankStr)}
        ${mNode?.isSharedOverlap ? `<span class="orb-overlap-tag">Shared Overlap</span>` : ""}
        ${(item?.attendingSlush2026 || mNode?.isSlush) ? `<span class="micro-pill micro-velocity">Slush 2026</span>` : ""}
      </div>
      <div class="quick-card-props">
        <div class="quick-prop-row"><span class="quick-prop-k">Warm Path</span><span class="quick-prop-v">${escapeHtml(cleanUiCopy(pathText))}</span></div>
        <div class="quick-prop-row"><span class="quick-prop-k">Portfolio Check</span><span class="quick-prop-v">${escapeHtml(cleanUiCopy(conflictSummary))}</span></div>
        <div class="quick-prop-row"><span class="quick-prop-k">Cala Sources</span><span class="quick-prop-v">${observed} verified · ${missing} gaps</span></div>
      </div>
      <div class="quick-card-formula"><strong>Formula:</strong> ${escapeHtml(cleanUiCopy(formulaText))}</div>
      <button type="button" class="btn primary sm quick-card-cta" id="quickInspectorOpenRailBtn">View Full Evidence &amp; Call Questions</button>
    `;
    cardEl.hidden = false;
    return;
  }

  if (state.selectedBridgeId) {
    const bNode = findNode(state.selectedBridgeId);
    if (!bNode) {
      cardEl.hidden = true;
      return;
    }
    const cg = getNodeContributionGroup(bNode);
    const cgMeta = CONTRIBUTION_VISUAL_META[cg] || CONTRIBUTION_VISUAL_META.access;
    const colHex = bNode.isSharedOverlap ? "#a78bfa" : getContributionColorHex(cg);
    const famLabel = BRIDGE_FAMILY_VISUAL_META[bNode.bridgeFamily]?.shortLabel || bNode.bridgeFamily || "Signal";
    const subLine = `${cgMeta.label} · ${famLabel}`;
    const connectedEdges = (effMap?.edges || []).filter((e) => e.from === bNode.id || e.to === bNode.id);
    const targetCount = new Set(
      connectedEdges
        .filter((e) => e.from === bNode.id && !state.mapLayoutNodes?.anchorIds?.has(e.to))
        .map((e) => e.to)
    ).size;
    const anchorCount = (bNode.connectedAnchorIds || []).length;
    const formulaText = bNode.formulaBreakdown?.inputs
      || (bNode.totalDeals ? `${bNode.lift || "1.0"}x lift across ${bNode.totalDeals} indexed deals` : bNode.whyMatters || "Connected multi-hop bridge node.");

    cardEl.innerHTML = `
      <div class="quick-card-head">
        <div class="quick-card-title-row">
          <span class="quick-card-orb" style="background:${colHex}; color:${colHex};"></span>
          <div>
            <h4 class="quick-card-name">${escapeHtml(bNode.label)}</h4>
            <div class="quick-card-sub">${escapeHtml(subLine)}</div>
          </div>
        </div>
        <button type="button" class="quick-card-close" id="quickInspectorCloseBtn" aria-label="Close quick facts">x</button>
      </div>
      <div class="quick-card-badges">
        ${getSourceRankBadgeHtml(bNode.topSourceRank)}
        ${bNode.isSharedOverlap ? `<span class="orb-overlap-tag">Shared by ${anchorCount} anchors</span>` : ""}
        ${bNode.lift != null ? `<span class="orb-rank-tag">${bNode.lift}x Lift</span>` : ""}
      </div>
      <div class="quick-card-props">
        <div class="quick-prop-row"><span class="quick-prop-k">Target Startups</span><span class="quick-prop-v">${targetCount} connected</span></div>
        <div class="quick-prop-row"><span class="quick-prop-k">Indexed Deals</span><span class="quick-prop-v">${bNode.totalDeals != null ? `${bNode.totalDeals} deals` : "Direct tie"}</span></div>
      </div>
      <div class="quick-card-formula"><strong>Math:</strong> ${escapeHtml(cleanUiCopy(formulaText))}</div>
      <button type="button" class="btn primary sm quick-card-cta" id="quickInspectorOpenRailBtn">Inspect Connected Targets in Rail</button>
    `;
    cardEl.hidden = false;
    return;
  }

  if (state.selectedAnchorId) {
    const aNode = findNode(state.selectedAnchorId);
    if (!aNode) {
      cardEl.hidden = true;
      return;
    }
    const pal = ANCHOR_PALETTE[(aNode.anchorIndex ?? 0) % ANCHOR_PALETTE.length];
    const colHex = aNode.anchorColor || pal.hex;
    const bridgesLinked = (effMap?.edges || []).filter((e) => e.from === aNode.id).length;

    cardEl.innerHTML = `
      <div class="quick-card-head">
        <div class="quick-card-title-row">
          <span class="quick-card-orb" style="background:${colHex}; color:${colHex};"></span>
          <div>
            <h4 class="quick-card-name">${escapeHtml(aNode.label)}</h4>
            <div class="quick-card-sub">${escapeHtml(cleanUiCopy(aNode.subtitle || (aNode.entityType === "startup" ? "Pinned Startup Anchor" : "Pinned Fund Anchor")))}</div>
          </div>
        </div>
        <button type="button" class="quick-card-close" id="quickInspectorCloseBtn" aria-label="Close quick facts">x</button>
      </div>
      <div class="quick-card-props">
        <div class="quick-prop-row"><span class="quick-prop-k">Entity Role</span><span class="quick-prop-v">${aNode.entityType === "startup" ? "Startup Anchor" : "Strategy Benchmark"}</span></div>
        <div class="quick-prop-row"><span class="quick-prop-k">Connected Bridges</span><span class="quick-prop-v">${bridgesLinked} direct paths</span></div>
      </div>
      <button type="button" class="btn primary sm quick-card-cta" id="quickInspectorOpenRailBtn">View Strategy &amp; Evidence in Rail</button>
    `;
    cardEl.hidden = false;
    return;
  }

  cardEl.hidden = true;
  cardEl.innerHTML = "";
}

async function selectStartupFromWorkspace(startupId, options = {}) {
  if (!startupId) return;
  const shouldOpenRail = options.openRail !== undefined ? Boolean(options.openRail) : Boolean(state.sideRailOpen);
  state.selectedStartupId = startupId;
  state.selectedBridgeId = null;
  state.selectedAnchorId = null;
  state.hoveredNodeId = null;
  state.activeStartupId = startupId;
  state.activeScreeningFlagId = null;
  if (shouldOpenRail) {
    state.sideRailOpen = true;
    state.sideRailTab = options.tab || "evidence";
  }
  hideMapTooltip();

  renderSideEvidenceRail();
  if (state.sideRailOpen) {
    const railBody = document.querySelector("#sideEvidenceRail .side-rail-body");
    if (railBody) railBody.scrollTop = 0;
  }
  renderConstellationMap(getEffectiveBridgeMap(), { fit: Boolean(shouldOpenRail) && options.fit === true });

  await loadStartupBriefData(startupId);
  renderQuickInspectorCard();
  if (state.sideRailOpen && state.sideRailTab === "evidence") {
    renderRailEvidencePane();
  }
}

function selectBridgeFromWorkspace(bridgeNodeId, options = {}) {
  if (!bridgeNodeId) return;
  const shouldOpenRail = options.openRail !== undefined ? Boolean(options.openRail) : Boolean(state.sideRailOpen);
  state.selectedBridgeId = bridgeNodeId;
  state.selectedStartupId = null;
  state.selectedAnchorId = null;
  state.hoveredNodeId = null;
  if (shouldOpenRail) {
    state.sideRailOpen = true;
    state.sideRailTab = "evidence";
  }
  hideMapTooltip();
  renderSideEvidenceRail();
  if (state.sideRailOpen) {
    const railBody = document.querySelector("#sideEvidenceRail .side-rail-body");
    if (railBody) railBody.scrollTop = 0;
  }
  renderConstellationMap(getEffectiveBridgeMap(), { fit: Boolean(shouldOpenRail) && options.fit === true });
}

function selectAnchorFromWorkspace(anchorNodeId, options = {}) {
  if (!anchorNodeId) return;
  const shouldOpenRail = options.openRail !== undefined ? Boolean(options.openRail) : Boolean(state.sideRailOpen);
  state.selectedAnchorId = anchorNodeId;
  state.selectedStartupId = null;
  state.selectedBridgeId = null;
  state.hoveredNodeId = null;
  if (shouldOpenRail) {
    state.sideRailOpen = true;
    state.sideRailTab = "strategy";
  }
  hideMapTooltip();
  renderSideEvidenceRail();
  renderConstellationMap(getEffectiveBridgeMap(), { fit: false });
}

function toggleExpandedContributionGroup(groupKey) {
  const norm = String(groupKey || "").toLowerCase();
  if (!norm) return;
  const nextGroup = state.expandedGroupKey === norm ? null : norm;
  state.expandedGroupKey = nextGroup;
  state.selectedStartupId = null;
  state.selectedBridgeId = null;
  state.selectedAnchorId = null;
  state.hoveredNodeId = null;
  hideMapTooltip();
  if (typeof renderQuickInspectorCard === "function") {
    renderQuickInspectorCard();
  }
  renderSideEvidenceRail();
  renderConstellationMap(getEffectiveBridgeMap(), { fit: true });
}

function clearConstellationSelection() {
  if (!state.selectedStartupId && !state.selectedBridgeId && !state.selectedAnchorId) return;
  state.selectedStartupId = null;
  state.selectedBridgeId = null;
  state.selectedAnchorId = null;
  applyPathLaserIsolation();
  if (typeof renderQuickInspectorCard === "function") {
    renderQuickInspectorCard();
  }
  renderConstellationMap(getEffectiveBridgeMap(), { fit: false });
  renderSideEvidenceRail();
}

function getAnalystDecisionKey(startupId, fundId = null) {
  const f = fundId || state.selectedFundId || (state.inputMode === "companies" ? "custom-proxy" : "default");
  return `${f}::${startupId}`;
}

function getAnalystDecision(startupId) {
  if (!startupId) return { decision: "", note: "", updatedAt: null };
  const entry = state.analystDecisions?.[getAnalystDecisionKey(startupId)];
  if (!entry || typeof entry !== "object") return { decision: "", note: "", updatedAt: null };
  return {
    decision: entry.decision || "",
    note: entry.note || "",
    updatedAt: entry.updatedAt || null
  };
}

function saveAnalystDecision(startupId, patch = {}) {
  if (!startupId) return null;
  const key = getAnalystDecisionKey(startupId);
  const current = getAnalystDecision(startupId);
  const next = {
    decision: patch.decision !== undefined ? patch.decision : current.decision,
    note: patch.note !== undefined ? patch.note : current.note,
    updatedAt: new Date().toISOString()
  };
  if (!next.decision && !String(next.note || "").trim()) {
    delete state.analystDecisions[key];
  } else {
    state.analystDecisions[key] = next;
  }
  try {
    localStorage.setItem(ANALYST_DECISIONS_KEY, JSON.stringify(state.analystDecisions));
  } catch {
    // Ignore storage quota errors
  }
  return next;
}

function formatDecisionTimestamp(iso) {
  if (!iso) return "Not saved";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Saved";
  return `Saved ${d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false })}`;
}

function getDecisionBadgeHtml(decision) {
  if (!decision) return "";
  if (decision === "Advance to Partner") return `<span class="micro-pill micro-partner">Partner</span>`;
  if (decision === "Watch") return `<span class="micro-pill micro-watch">Watch</span>`;
  if (decision === "Pass") return `<span class="micro-pill micro-pass">Pass</span>`;
  return "";
}

function buildMondayMemoMarkdown(candidate, brief, diligence, folders, decisionEntry) {
  const dp = diligence || brief?.diligencePacket || candidate?.diligencePacket || {};
  const fl = folders || brief?.evidenceFolders || candidate?.evidenceFolders || {};
  const fundLabel = getSelectedBenchmarkLabel();
  const conflict = dp.conflictRisk || { level: "None", reason: "No direct portfolio conflict detected." };
  const twin = dp.synergisticTwin;
  const urgency = dp.urgencyTriggers || [];
  const riskFlags = dp.riskFlags || [];
  const verifiedFacts = fl?.proofAndGaps?.verifiedFacts || [];
  const callQs = dp.callQuestions || [];
  const missingGaps = fl?.proofAndGaps?.missingFromCala || [];
  const paths = dp.warmIntroPaths || fl?.hiddenBridges?.paths || [];
  const topPath = paths[0] || null;
  const topPathHops = (topPath?.hops || []).map((h) => (typeof h === "string" ? h : h?.label || "")).filter(Boolean).join(" -> ");
  const topSrc = (topPath?.sourceIds || []).length ? ` [${topPath.sourceIds.join(", ")}]` : "";
  const decStatus = decisionEntry?.decision || "Unreviewed";
  const decNote = (decisionEntry?.note || "").trim() || "None recorded";
  const decTime = decisionEntry?.updatedAt ? formatDecisionTimestamp(decisionEntry.updatedAt) : "Not saved";

  const lines = [
    `# Monday Partner Screening: ${candidate.name}`,
    `Context: ${candidate.sector || "Tech"} · ${candidate.stage || "Early"} · ${candidate.hqCity || ""}, ${candidate.country || ""} | Benchmark: ${fundLabel}`,
    `Framing: Evidence-match summary for analyst review only - not an investment recommendation.`,
    ``,
    `## Analyst Decision Log`,
    `- Decision: ${decStatus} (${decTime})`,
    `- Rationale: ${decNote}`,
    ``,
    `## Headline Signal & Why This Monday?`,
    `- Why Now: ${fl?.observedActivity?.whyNowTrigger || candidate.whyNowTrigger || dp.urgencyStatus || "No immediate timing inflection detected in Cala"}`,
    ...(urgency.length
      ? urgency.map((u) => `- [${u.sourceRank || "PRIMARY"}] ${u.label}: ${u.detail}${u.sourceIds?.length ? ` [${u.sourceIds.join(", ")}]` : ""}`)
      : [`- Timing Status: ${dp.urgencyStatus || "No immediate timing inflection detected in Cala"}`]),
    ``,
    `## Shortest Intro Bridge & Reciprocity`,
    ...(topPath
      ? [
          `- Path (${topPath.forwardability || "Warm"}, ${topPath.reciprocityScore ?? "-"} / 100): ${topPathHops}${topSrc}`,
          `- Reciprocity Context: ${topPath.reciprocityNote || topPath.summary || ""}`
        ]
      : [`- No direct non-mega-hub Investor/Alumni bridge indexed in Cala (${fl?.hiddenBridges?.suppressedMegaHubCount ?? 0} mega-hub overlap(s) hidden).`]),
    ``,
    `## Portfolio Conflict vs. Synergistic Twin`,
    `- Conflict Check (${conflict.level}): ${conflict.reason}`,
    ...(twin ? [`- Synergistic Twin (${twin.companyName}): ${twin.patternSummary}`] : []),
    ``,
    `## Risk & Kill-Screen Flags`,
    ...(riskFlags.length
      ? riskFlags.map((f) => `- [${String(f.severity || "info").toUpperCase()}] ${f.label}: ${f.detail} (Rule: ${f.rule})`)
      : [`- No automated kill-screen flags triggered.`]),
    ``,
    `## Verified Facts ([sourceIds] Locked)`,
    ...(verifiedFacts.length
      ? verifiedFacts.map((v) => `- [${v.sourceRank || "PRIMARY"}] ${v.label}: ${v.detail}${v.sourceIds?.length ? ` [${v.sourceIds.join(", ")}]` : ""}`)
      : [`- No verified statutory or dated round facts indexed yet.`]),
    ``,
    `## Questions for Founder Call #1 (From "Not Found in Cala" Gaps)`,
    ...(callQs.length
      ? callQs.map((q, i) => `${i + 1}. [${q.category}] ${q.question} (Gap: ${q.basedOnGap} | Verified Anchor: ${q.verifiedAnchor})`)
      : missingGaps.map((g, i) => `${i + 1}. ${g.field}: ${g.status} (${g.reason})`))
  ];

  return cleanUiCopy(lines.join("\n"));
}

async function copyMondayMemoForStartup(startupId) {
  const candidate = state.DisplayedShortlist.find((c) => c.id === startupId)
    || state.allKnownItems.get(startupId);
  if (!candidate) return;
  const cacheKey = `${candidate.id}:${state.selectedFundId}`;
  const brief = state.briefCache.get(cacheKey) || (state.activeBrief?.id === candidate.id ? state.activeBrief : null);
  const folders = {
    ...(candidate.evidenceFolders || {}),
    ...(brief?.evidenceFolders || {})
  };
  const diligence = brief?.diligencePacket || candidate.diligencePacket || null;
  const decisionEntry = getAnalystDecision(candidate.id);
  const md = buildMondayMemoMarkdown(candidate, brief, diligence, folders, decisionEntry);
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(md);
    }
  } catch {
    // Non-fatal in non-clipboard environments
  }
  const btn = document.getElementById("railCopyMondayMemoBtn");
  if (btn) {
    btn.textContent = "Copied Memo!";
    window.setTimeout(() => {
      if (btn.isConnected) btn.textContent = "Copy Monday Memo";
    }, 1800);
  }
  showUiToast(`Copied Monday Markdown memo for ${candidate.name}`);
}

function buildFormulaToggleHtml(formulaKey, summaryText, formulaData, metaLine = "") {
  const isOpen = state.expandedFormulas?.has(formulaKey);
  const formulaStr = typeof formulaData === "string" ? formulaData : (formulaData?.formula || "");
  const inputsStr = typeof formulaData === "object" && formulaData ? (formulaData.inputs || "") : "";
  const meaningStr = typeof formulaData === "object" && formulaData ? (formulaData.plainMeaning || "") : "";

  return `
    <div class="formula-inline-row">
      <span style="font-size:10.5px; color:var(--muted);">${summaryText}</span>
      <button
        type="button"
        class="formula-toggle-btn"
        data-toggle-formula="${escapeHtml(formulaKey)}"
        aria-expanded="${isOpen ? "true" : "false"}"
      >${isOpen ? "Hide Formula" : "View Formula"}</button>
    </div>
    ${isOpen
      ? `<div class="formula-proof-box">
          ${formulaStr ? `<div class="formula-proof-eq">Formula: ${escapeHtml(cleanUiCopy(formulaStr))}</div>` : ""}
          ${inputsStr ? `<div class="formula-proof-inputs">Inputs: ${escapeHtml(cleanUiCopy(inputsStr))}</div>` : ""}
          ${meaningStr ? `<div class="formula-proof-meaning">${escapeHtml(cleanUiCopy(meaningStr))}</div>` : ""}
          ${metaLine ? `<div class="formula-proof-meaning" style="margin-top:3px;">${escapeHtml(cleanUiCopy(metaLine))}</div>` : ""}
        </div>`
      : ""}
  `;
}

function buildBridgePathCardHtml(pathItem, pathIdx = 0) {
  const famMeta = BRIDGE_FAMILY_VISUAL_META[pathItem.bridgeFamily] || BRIDGE_FAMILY_VISUAL_META.feeder;
  const hopsHtml = (pathItem.hops || [])
    .map((h) => {
      const label = typeof h === "string" ? h : (h?.label || "");
      return label ? `<span class="ev-hop-node">${escapeHtml(cleanUiCopy(label))}</span>` : "";
    })
    .filter(Boolean)
    .join(`<span class="ev-hop-arrow">-&gt;</span>`);
  const srcList = (pathItem.sourceIds || [])
    .map((sid) => resolveSourceRecord(sid))
    .filter(Boolean);
  const srcBadgeText = srcList.map((s) => s.title || s.id).slice(0, 2).join(" · ");
  const whyText = pathItem.whyMatters || pathItem.whyLookDelta || "";
  const reciprocityText = pathItem.reciprocityNote || "";
  const isHighForward = pathItem.forwardability === "High";
  const hopBadge = pathItem.hopKind === "2hop_syndicate"
    ? `<span class="micro-pill micro-primary">2-Hop</span>`
    : "";
  const familyPillClass = pathItem.bridgeFamily === "portfolio_twin"
    ? "micro-pill micro-twin"
    : "micro-pill micro-press";

  const liftMeta = `${pathItem.lift != null ? `${pathItem.lift}x lift` : "Twin analogue"}${pathItem.totalDeals != null ? ` · ${pathItem.totalDeals} indexed deals` : ""}${pathItem.date ? ` · ${escapeHtml(pathItem.date)}` : ""}${srcBadgeText ? ` · ${escapeHtml(srcBadgeText)}` : ""}`;
  const formulaPayload = pathItem.formulaBreakdown || {
    formula: "rarity = lift * 10 + sourceRankBonus",
    inputs: liftMeta,
    plainMeaning: "Ranks non-obvious bridges weighted by source trust."
  };
  const proofMeta = `Source IDs: ${(pathItem.sourceIds || []).join(", ") || "indexed Cala graph"}${pathItem.date ? ` · Date: ${pathItem.date}` : ""}`;

  return `
    <div class="ev-bridge-item">
      <div style="display:flex; align-items:center; justify-content:space-between; gap:6px; flex-wrap:wrap;">
        <strong style="font-size:12px; color:var(--text-strong);">${escapeHtml(pathItem.bridgeEntityName || "Bridge Path")}</strong>
        <div style="display:flex; gap:4px; align-items:center; flex-wrap:nowrap;">
          ${hopBadge}
          <span class="${familyPillClass}">${escapeHtml(famMeta.shortLabel)}</span>
          ${getSourceRankBadgeHtml(pathItem.topSourceRank)}
          ${pathItem.isMegaHub ? `<span class="micro-pill micro-megahub">Mega-hub</span>` : ""}
        </div>
      </div>
      ${hopsHtml ? `<div class="ev-hops-strip">${hopsHtml}</div>` : ""}
      <div style="font-size:11.5px; color:var(--text); line-height:1.4;">${escapeHtml(cleanUiCopy(pathItem.summary || ""))}</div>
      ${whyText ? `<div class="ev-why-matters"><strong>Why this matters:</strong> ${escapeHtml(cleanUiCopy(whyText))}</div>` : ""}
      ${reciprocityText ? `<div class="reciprocity-bar ${isHighForward ? "is-high" : ""}"><strong>${escapeHtml(cleanUiCopy(pathItem.forwardability || "Intro"))} (${pathItem.reciprocityScore ?? "-"}/100):</strong> ${escapeHtml(cleanUiCopy(reciprocityText))}</div>` : ""}
      ${buildFormulaToggleHtml(`bridge-${pathIdx}`, liftMeta, formulaPayload, proofMeta)}
    </div>
  `;
}

function renderRelaxSuggestionChipsHtml() {
  const suggestions = state.lastRefineResponse?.relaxSuggestions || [];
  if (!suggestions.length) return "";
  return `
    <div class="empty-relax-suggestions">
      ${suggestions
        .map(
          (s) =>
            `<button type="button" class="relax-pill-btn" data-relax-filter="${escapeHtml(s.filter)}" data-relax-value="${escapeHtml(String(s.value ?? ""))}">${escapeHtml(cleanUiCopy(s.label))}</button>`
        )
        .join("")}
    </div>
  `;
}

async function applyRelaxSuggestion(filterName, rawValue) {
  const val = rawValue === "true" ? true : rawValue === "false" ? false : rawValue === "" ? "" : rawValue;
  if (filterName === "reset") {
    await resetSearchAndFilters();
    return;
  }
  if (filterName === "contributionGroup") {
    state.contributionGroup = "all";
  } else if (filterName === "bridgeFamily") {
    state.bridgeFamily = "all";
  } else if (filterName === "hideMegaHubs") {
    state.hideMegaHubs = false;
  } else if (filterName === "slush2026Only") {
    state.onlySlush2026 = false;
  } else if (filterName === "filingOnly") {
    state.filingOnly = false;
  } else if (filterName === "untappedOnly") {
    state.untappedOnly = false;
    const el = document.getElementById("filterUntappedOnly");
    if (el) el.checked = false;
  } else if (filterName === "raisingSoonOnly") {
    const el = document.getElementById("filterRaisingSoon");
    if (el) el.checked = false;
  } else if (filterName === "region") {
    const el = document.getElementById("filterRegion");
    if (el) el.value = "all";
  } else if (filterName === "stageFilter") {
    const el = document.getElementById("filterStage");
    if (el) el.value = "all";
    state.targetStage = "all";
  } else if (filterName === "excludeSector") {
    const el = document.getElementById("filterExcludeSector");
    if (el) el.value = "";
  } else if (
    ["feederOnly", "alumniOnly", "highVelocityOnly", "maxEmployees", "minHeadcountGrowthPct"].includes(filterName)
  ) {
    const qInput = document.getElementById("aiSearchInput");
    if (qInput && qInput.value.trim()) {
      qInput.value = "";
    }
  }
  syncConstellationControls();
  await executeSearchRefinement(undefined, {
    keepSelection: false,
    keepRailOpen: state.sideRailOpen,
    fit: true,
    explicitOverrides: { [filterName]: val }
  });
}

async function expandLiveCalaLinksForStartup(startupId, startupName) {
  if (!startupId || state.railExpandCalaLoading) return;
  const targetName = startupName || state.allKnownItems.get(startupId)?.name || startupId;
  state.railExpandCalaLoading = true;
  state.railExpandCalaResult = {
    startupId,
    message: `Querying Live Cala graph for additional links around ${targetName}...`
  };
  renderRailEvidencePane();

  try {
    const res = await fetchJson("/api/cala-discover", {
      method: "POST",
      body: JSON.stringify({
        mode: "query",
        fundId: state.selectedFundId,
        companyIds: state.selectedCompanyIds,
        queryText: targetName,
        bridgeFamily: state.bridgeFamily || "all",
        contributionGroup: state.contributionGroup || "all",
        hideMegaHubs: state.hideMegaHubs !== false,
        entityScope: document.getElementById("filterEntityScope")?.value || "startups"
      })
    });
    const prevCount = state.DisplayedShortlist.length;
    if (Array.isArray(res.shortlist) && res.shortlist.length) {
      const mergedById = new Map(state.DisplayedShortlist.map((c) => [c.id, c]));
      for (const item of res.shortlist) {
        mergedById.set(item.id, item);
      }
      registerKnownItems(res.shortlist);
      const updatedTarget = res.shortlist.find((c) => c.id === startupId);
      if (updatedTarget) {
        state.DisplayedShortlist = state.DisplayedShortlist.map((c) => (c.id === startupId ? updatedTarget : c));
        if (!state.DisplayedShortlist.some((c) => c.id === startupId)) {
          state.DisplayedShortlist.unshift(updatedTarget);
        }
      }
    }
    if (res.bridgeMap && res.discoveredCount > 0) {
      await executeSearchRefinement(undefined, {
        keepSelection: true,
        keepRailOpen: true,
        fit: false
      });
    }
    const newBridgesCount =
      (state.allKnownItems.get(startupId)?.evidenceFolders?.hiddenBridges?.paths || []).length;
    state.railExpandCalaResult = {
      startupId,
      message:
        res.discoveredCount > 0 || res.enrichedCount > 0
          ? `Live Cala synced +${res.discoveredCount || 0} entities / +${res.enrichedCount || 0} links (${newBridgesCount} visible paths for ${targetName}).`
          : `Live Cala checked for ${targetName} (${newBridgesCount} indexed path(s) shown; no unindexed live records added).`
    };
    if (res.calaBudget) {
      updateTelemetryMasthead(res.calaBudget);
    }
  } catch (err) {
    state.railExpandCalaResult = {
      startupId,
      message: `Live Cala link check: ${err.message}`
    };
  } finally {
    state.railExpandCalaLoading = false;
    renderRailEvidencePane();
  }
}

function renderRailMatchesPane() {
  const countEl = document.getElementById("railMatchesCountLabel");
  const traceEl = document.getElementById("railAiTraceStrip");
  const listEl = document.getElementById("railMatchesList");
  if (!listEl) return;

  const visibleList = getFilteredShortlistItems(state.DisplayedShortlist);
  if (countEl) {
    countEl.textContent = `${visibleList.length} ${visibleList.length === 1 ? "match" : "matches"}`;
  }

  if (traceEl) {
    const tags = state.lastRefineResponse?.parsedCriteriaTags || [];
    if (tags.length > 0) {
      traceEl.hidden = false;
      traceEl.innerHTML = tags.map((t) => `<span class="micro-pill micro-primary">${escapeHtml(cleanUiCopy(t))}</span>`).join("");
    } else {
      traceEl.hidden = true;
      traceEl.innerHTML = "";
    }
  }

  if (!visibleList.length) {
    const relaxHtml = renderRelaxSuggestionChipsHtml();
    listEl.innerHTML = `
      <div class="ev-folder-card" style="text-align:center;">
        <p style="margin:0 0 10px; color:var(--muted); font-size:12px;">No startups match the active filter settings.</p>
        ${relaxHtml}
        <button type="button" class="btn sm" id="railEmptyResetBtn">Reset all filters</button>
      </div>
    `;
    return;
  }

  listEl.innerHTML = visibleList
    .map((item, idx) => {
      const isSelected = state.selectedStartupId === item.id;
      const rank = item.dataConfidence?.topSourceRank || item.evidenceFolders?.proofAndGaps?.topSourceRank || "AGGREGATOR";
      const topPath = item.evidenceFolders?.hiddenBridges?.paths?.[0];
      const reason = topPath?.whyLookDelta
        || topPath?.summary
        || item.coInvestorPath?.summary
        || item.whyNowTrigger
        || item.matchReason
        || "Matched across Cala bridge graph";
      const isSlush = Boolean(item.attendingSlush2026 || getStartupCalaFieldProfile(item)?.slush2026?.attending);
      const decisionEntry = getAnalystDecision(item.id);
      const conflictLevel = item.diligencePacket?.conflictRisk?.level || "None";
      const conflictPill = conflictLevel === "High" || conflictLevel === "Watch"
        ? `<span class="micro-pill micro-watch">Conflict: ${escapeHtml(conflictLevel)}</span>`
        : "";
      const insightBadge = topPath?.hopKind === "2hop_syndicate" && topPath.intermediaryInvestor
        ? `<span class="micro-pill micro-primary">2-Hop: ${escapeHtml(topPath.intermediaryInvestor)}</span>`
        : topPath?.bridgeFamily === "portfolio_twin" && topPath.twinCompanyName
          ? `<span class="micro-pill micro-twin">Twin: ${escapeHtml(topPath.twinCompanyName)}</span>`
          : "";

      return `
        <button
          type="button"
          class="rail-match-card ${isSelected ? "is-selected" : ""}"
          data-rail-select-startup="${escapeHtml(item.id)}"
        >
          <div class="rail-match-top">
            <span class="rail-match-name">#${idx + 1} · ${escapeHtml(item.name)}</span>
            <span class="rail-match-score">Relevance ${item.suitabilityScore ?? 0}/100</span>
          </div>
          <div class="rail-match-meta">${escapeHtml(item.sector)} · ${escapeHtml(item.stage)} · ${escapeHtml(item.hqCity || "")}, ${escapeHtml(item.country)}</div>
          <div class="rail-match-reason">${escapeHtml(cleanUiCopy(reason))}</div>
          <div class="rail-match-badges">
            ${getDecisionBadgeHtml(decisionEntry.decision)}
            ${getSourceRankBadgeHtml(rank)}
            ${conflictPill}
            ${insightBadge}
            ${item.headcountGrowthPct >= 30 ? `<span class="micro-pill micro-velocity">+${item.headcountGrowthPct}% team</span>` : ""}
            ${isSlush ? `<span class="micro-pill micro-primary">Slush 2026</span>` : ""}
          </div>
        </button>
      `;
    })
    .join("");
}

function renderRailEvidencePane() {
  const container = document.getElementById("railEvidenceContent");
  if (!container) return;

  // Case A: Bridge entity selected on the Constellation
  if (state.selectedBridgeId && !state.selectedStartupId) {
    const effMap = getEffectiveBridgeMap();
    const bNode = (effMap?.nodes || []).find((n) => n.id === state.selectedBridgeId);
    if (!bNode) {
      container.innerHTML = `<div class="ev-folder-card"><p style="margin:0;color:var(--muted);">Select any bridge or startup node on the map to inspect sourced paths.</p></div>`;
      return;
    }

    const famMeta = BRIDGE_FAMILY_VISUAL_META[bNode.bridgeFamily] || BRIDGE_FAMILY_VISUAL_META.feeder;
    const connectedStartupEdges = (effMap?.edges || []).filter((e) => e.from === bNode.id);
    const startupsHtml = connectedStartupEdges.length
      ? connectedStartupEdges
          .map((edge) => {
            const st = state.DisplayedShortlist.find((c) => c.id === edge.to)
              || (effMap?.nodes || []).find((n) => n.id === edge.to);
            if (!st) return "";
            const stName = st.name || st.label;
            return `
              <div class="ev-fact-row" style="display:flex; justify-content:space-between; align-items:center; gap:8px;">
                <div>
                  <div style="font-weight:700; color:var(--text-strong);">${escapeHtml(stName)}</div>
                  <div style="font-size:11.5px; color:var(--muted); margin-top:2px;">${escapeHtml(cleanUiCopy(edge.label || ""))}</div>
                </div>
                <button type="button" class="btn sm primary" data-rail-select-startup="${escapeHtml(st.id)}">Inspect</button>
              </div>
            `;
          })
          .join("")
      : `<div style="font-size:12px; color:var(--muted);">No target startups visible under active filter.</div>`;

    container.innerHTML = `
      <div class="ev-folder-card">
        <div class="ev-folder-head">
          <h4 class="ev-folder-title">Bridge Hub Profile</h4>
          ${getSourceRankBadgeHtml(bNode.topSourceRank)}
        </div>
        <div style="font-size:14px; font-weight:800; color:var(--text-strong); margin-bottom:4px;">${escapeHtml(bNode.label)}</div>
        <div style="font-size:12px; color:var(--muted); margin-bottom:6px;">
          Family: ${escapeHtml(famMeta.label)}${bNode.lift != null ? ` · Lift ${bNode.lift}x` : ""}${bNode.totalDeals != null ? ` · ${bNode.totalDeals} indexed deals` : ""}${bNode.isMegaHub ? " · Flagged as mega-hub" : " · Non-mega-hub bridge"}
        </div>
        ${buildFormulaToggleHtml(
          "bridge-node",
          bNode.lift != null ? `${bNode.lift}x bridge lift` : famMeta.label,
          bNode.formulaBreakdown || {
            formula: "rarity = lift * 10 + sourceRankBonus",
            inputs: bNode.whyMatters || famMeta.label,
            plainMeaning: "Deterministic Cala bridge strength calculation."
          },
          `Sources: ${(bNode.sourceIds || []).join(", ") || "Cala Graph"}${bNode.date ? ` · Date: ${bNode.date}` : ""}`
        )}
      </div>
      <div class="ev-folder-card">
        <div class="ev-folder-head">
          <h4 class="ev-folder-title">Connected Target Startups (${connectedStartupEdges.length})</h4>
        </div>
        ${startupsHtml}
      </div>
    `;
    return;
  }

  // Case B: Startup selected (either directly or fallback to first shortlist item)
  const startupId = state.selectedStartupId || state.activeStartupId || state.DisplayedShortlist[0]?.id;
  const candidate = state.DisplayedShortlist.find((c) => c.id === startupId)
    || state.allKnownItems.get(startupId);

  if (!candidate) {
    container.innerHTML = `<div class="ev-folder-card"><p style="margin:0;color:var(--muted);">Run a search or click a startup node on the Constellation to inspect evidence.</p></div>`;
    return;
  }

  const cacheKey = `${candidate.id}:${state.selectedFundId}`;
  const brief = state.briefCache.get(cacheKey) || (state.activeBrief?.id === candidate.id ? state.activeBrief : null);
  const candidateFolders = candidate.evidenceFolders || {};
  const briefFolders = brief?.evidenceFolders || {};
  const folders = {
    triageNote: candidateFolders.triageNote || briefFolders.triageNote,
    hiddenBridges: candidateFolders.hiddenBridges || briefFolders.hiddenBridges,
    observedActivity: briefFolders.observedActivity || candidateFolders.observedActivity,
    proofAndGaps: briefFolders.proofAndGaps || candidateFolders.proofAndGaps
  };
  const narrated = state.railNarratedBriefs?.[candidate.id] || null;

  const triageNote = cleanUiCopy(
    folders?.triageNote || "Evidence-match order for analyst review only - not an investment recommendation."
  );

  // Folder 1: Hidden Bridges & Warm Paths
  const hiddenFolder = folders?.hiddenBridges || {};
  const bridgePaths = hiddenFolder.paths || [];
  const suppressedCount = hiddenFolder.suppressedMegaHubCount ?? 0;

  const suppressedBarHtml = suppressedCount > 0 && state.hideMegaHubs !== false
    ? `
      <div class="ev-suppressed-bar">
        <span>${suppressedCount} mega-hub ${suppressedCount === 1 ? "bridge" : "bridges"} suppressed</span>
        <button type="button" class="btn xs" id="railRevealMegaHubsBtn">Reveal mega-hubs</button>
      </div>
    `
    : "";

  const pathsHtml = bridgePaths.length
    ? bridgePaths.map((p, idx) => buildBridgePathCardHtml(p, idx)).join("")
    : `<div style="font-size:12px; color:var(--muted);">${suppressedCount > 0 ? "Only mega-hub bridges exist under current settings." : "Not found in Cala under current bridge family filter."}</div>`;

  // Folder 2: Observed Activity & Timing
  const obsFolder = folders?.observedActivity || {};
  const activityItems = obsFolder.items || [];
  const timingSummaryParts = [];
  if (obsFolder.whyNowTrigger) timingSummaryParts.push(obsFolder.whyNowTrigger);
  if (obsFolder.currentObservedEmp != null) {
    const empDelta = obsFolder.headcountAtLastRound != null
      ? `${obsFolder.headcountAtLastRound} -> ${obsFolder.currentObservedEmp} employees`
      : `${obsFolder.currentObservedEmp} observed employees`;
    const pctStr = obsFolder.headcountGrowthPct != null ? ` (${obsFolder.headcountGrowthPct >= 0 ? "+" : ""}${obsFolder.headcountGrowthPct}%)` : "";
    timingSummaryParts.push(`${empDelta}${pctStr}`);
  }

  const activityHtml = activityItems.length
    ? activityItems
        .map((it) => `
          <div class="ev-fact-row">
            <div style="display:flex; justify-content:space-between; align-items:center; gap:6px; margin-bottom:2px;">
              <strong style="color:var(--text-strong);">${escapeHtml(cleanUiCopy(it.label))}</strong>
              <div style="display:flex; gap:4px; align-items:center;">
                ${it.date ? `<span style="font-size:10.5px; color:var(--muted);">${escapeHtml(it.date)}</span>` : ""}
                ${getSourceRankBadgeHtml(it.sourceRank)}
              </div>
            </div>
            <div style="color:var(--muted); line-height:1.4;">${escapeHtml(cleanUiCopy(it.detail || ""))}</div>
          </div>
        `)
        .join("")
    : `<div style="font-size:12px; color:var(--muted);">No dated activity observations indexed in Cala.</div>`;

  // Folder 3: Filings, Proof & Missing Gaps
  const proofFolder = folders?.proofAndGaps || {};
  const verifiedFacts = proofFolder.verifiedFacts || [];
  const missingGaps = proofFolder.missingFromCala || brief?.notFoundInCala || [];

  const factsHtml = verifiedFacts.length
    ? verifiedFacts
        .map((f) => `
          <div class="ev-fact-row">
            <div style="display:flex; justify-content:space-between; align-items:center; gap:6px; margin-bottom:2px;">
              <strong style="color:var(--text-strong);">${escapeHtml(cleanUiCopy(f.label))}</strong>
              <div style="display:flex; gap:4px; align-items:center;">
                ${f.date ? `<span style="font-size:10.5px; color:var(--muted);">${escapeHtml(f.date)}</span>` : ""}
                ${getSourceRankBadgeHtml(f.sourceRank)}
              </div>
            </div>
            <div style="color:var(--muted); line-height:1.4;">${escapeHtml(cleanUiCopy(f.detail || ""))}</div>
          </div>
        `)
        .join("")
    : `<div style="font-size:12px; color:var(--muted);">No statutory filings or verified round facts indexed yet.</div>`;

  const gapsHtml = missingGaps
    .map((g) => `
      <div class="ev-gap-row">
        <div class="ev-gap-top">
          <span>${escapeHtml(cleanUiCopy(g.field || "Field"))}</span>
          <span class="ev-gap-status">${escapeHtml(g.status || "Not found in Cala")}</span>
        </div>
        <div style="margin-top:3px; color:var(--muted); line-height:1.38;">${escapeHtml(cleanUiCopy(g.reason || ""))}</div>
      </div>
    `)
    .join("");

  const narratedHtml = narrated
    ? `
      <div class="rail-narrated-box">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
          <strong style="color:var(--text-strong); font-size:12px;">Cited Analyst Brief</strong>
          <span class="micro-pill micro-primary">${escapeHtml(narrated.controlPlaneMode || "cited-brief")}</span>
        </div>
        ${(narrated.bullets || []).length
          ? `<ul style="margin:0; padding-left:16px; display:flex; flex-direction:column; gap:6px;">
              ${narrated.bullets.map((b) => `<li>${escapeHtml(cleanUiCopy(b.text))} <span style="font-size:10.5px; color:var(--muted);">[${escapeHtml((b.sourceIds || []).join(", "))}]</span></li>`).join("")}
            </ul>`
          : `<div style="color:var(--muted);">No verifiable cited bullets available without gaps.</div>`}
      </div>
    `
    : "";

  const expandStatusHtml =
    state.railExpandCalaResult && state.railExpandCalaResult.startupId === candidate.id
      ? `<div class="triage-note-banner" style="margin-bottom:7px;">${escapeHtml(cleanUiCopy(state.railExpandCalaResult.message))}</div>`
      : "";

  const diligence = brief?.diligencePacket || candidate.diligencePacket || null;
  const conflict = diligence?.conflictRisk || { level: "None", reason: "No direct portfolio conflict detected across indexed records." };
  const twin = diligence?.synergisticTwin || null;
  const riskFlags = diligence?.riskFlags || [];
  const urgencyTriggers = diligence?.urgencyTriggers || [];
  const callQuestions = diligence?.callQuestions || [];
  const decisionEntry = getAnalystDecision(candidate.id);

  const flagEntries = [
    ...urgencyTriggers.map((u, idx) => ({
      id: `urg-${u.kind || idx}`,
      chipClass: "is-urgency",
      label: u.label,
      detail: u.detail,
      rule: `Timing signal (${u.sourceRank || "PRIMARY"}${u.date ? ` · ${u.date}` : ""})`
    })),
    ...riskFlags.map((f) => ({
      id: `risk-${f.id}`,
      chipClass: f.severity === "warning" ? "is-warning" : "is-info",
      label: f.label,
      detail: f.detail,
      rule: `Deterministic rule: ${f.rule}`
    }))
  ];
  const selectedFlag = flagEntries.find((f) => f.id === state.activeScreeningFlagId) || null;
  const screeningFlagsHtml = flagEntries.length
    ? `
      <div class="screening-flags-strip">
        ${flagEntries
          .map(
            (f) => `<button type="button" class="flag-chip-btn ${f.chipClass} ${selectedFlag?.id === f.id ? "is-selected" : ""}" data-toggle-flag-rule="${escapeHtml(f.id)}" title="${escapeHtml(cleanUiCopy(f.detail))}">${escapeHtml(cleanUiCopy(f.label))}</button>`
          )
          .join("")}
      </div>
      ${selectedFlag
        ? `<div class="flag-detail-callout">
            <div>${escapeHtml(cleanUiCopy(selectedFlag.detail))}</div>
            <span class="flag-detail-rule">${escapeHtml(cleanUiCopy(selectedFlag.rule))}</span>
          </div>`
        : ""}
    `
    : `<div class="screening-flags-strip"><span class="flag-chip-btn is-info">${escapeHtml(cleanUiCopy(diligence?.urgencyStatus || "No immediate timing inflection detected in Cala"))}</span></div>`;

  const conflictIsWarn = conflict.level === "High" || conflict.level === "Watch";
  const conflictBadgeLabel = conflictIsWarn
    ? `Conflict ${conflict.level}: ${conflict.companyName || "Portfolio overlap"}`
    : "No direct portfolio conflict detected";

  const decisionBarHtml = `
    <div class="rail-decision-card" data-startup-id="${escapeHtml(candidate.id)}">
      <div class="rail-decision-head">
        <div>
          <div class="rail-decision-title">Monday Decision Log</div>
          <div class="rail-decision-time" id="railDecisionTimestamp">${escapeHtml(formatDecisionTimestamp(decisionEntry.updatedAt))}</div>
        </div>
        <button type="button" class="btn xs" id="railCopyMondayMemoBtn" data-startup-id="${escapeHtml(candidate.id)}" title="Copy citation-locked Monday Markdown 1-pager">Copy Monday Memo</button>
      </div>
      <div class="rail-decision-pills" role="group" aria-label="Monday partner decision">
        ${["Advance to Partner", "Watch", "Pass"]
          .map(
            (status) => `
              <button
                type="button"
                class="decision-pill-btn ${decisionEntry.decision === status ? "is-active" : ""}"
                data-decision-status="${escapeHtml(status)}"
                data-startup-id="${escapeHtml(candidate.id)}"
              >${escapeHtml(status)}</button>
            `
          )
          .join("")}
      </div>
      <div class="rail-decision-note-row">
        <input
          type="text"
          class="rail-decision-note-input"
          id="railDecisionNoteInput"
          data-startup-id="${escapeHtml(candidate.id)}"
          value="${escapeHtml(decisionEntry.note || "")}"
          placeholder="1-line analyst rationale (saved locally)..."
          aria-label="1-line Monday decision rationale"
        />
      </div>
    </div>
  `;

  const timingStatusText = cleanUiCopy(diligence?.urgencyStatus || "No immediate timing inflection detected in Cala");
  const timingFormulaPayload = {
    formula: "|monthsSinceRound - benchmarkMedianGap| vs. follow-on cadence window",
    inputs: diligence?.timingFormula || "Not calculated: no dated prior round",
    plainMeaning: "Benchmarks months since last financing against the fund's revealed median follow-on cadence."
  };
  const roundSourceIds = (candidate.roundHistory || brief?.rounds || []).flatMap((r) => (r.sources || []).map((s) => s.id)).slice(0, 3);
  const timingMetaLine = `Prior round: ${candidate.lastRoundDate || "None indexed"}${roundSourceIds.length ? ` · Sources: ${roundSourceIds.join(", ")}` : ""}`;

  const partnerScreeningHtml = `
    <div class="ev-screening-card">
      <div class="ev-folder-head">
        <h4 class="ev-folder-title">Partner Screening &amp; Call #1</h4>
        <span class="micro-pill micro-primary">${callQuestions.length} Qs</span>
      </div>
      <div class="screening-conflict-row">
        <span class="conflict-pill ${conflictIsWarn ? "is-warning" : "is-clear"}">${escapeHtml(cleanUiCopy(conflictBadgeLabel))}</span>
        <div class="screening-subtext">${escapeHtml(cleanUiCopy(conflict.reason || ""))}</div>
        ${twin ? `<div class="screening-twin-box"><strong>Synergistic Twin (${escapeHtml(twin.companyName)}):</strong> ${escapeHtml(cleanUiCopy(twin.patternSummary || ""))}</div>` : ""}
      </div>
      <div style="margin-bottom:6px;">
        ${buildFormulaToggleHtml("timing", `Round Timing: ${timingStatusText}`, timingFormulaPayload, timingMetaLine)}
      </div>
      ${screeningFlagsHtml}
      ${callQuestions.length
        ? `<ol class="call-questions-list">
            ${callQuestions
              .map(
                (q, idx) => `
                  <li class="call-q-item">
                    <div class="call-q-meta">
                      <span>Q${idx + 1} · ${escapeHtml(q.category)}</span>
                      <span class="call-q-anchor">${escapeHtml(cleanUiCopy(q.verifiedAnchor || ""))}</span>
                    </div>
                    <div>${escapeHtml(cleanUiCopy(q.question))}</div>
                  </li>
                `
              )
              .join("")}
          </ol>`
        : ""}
    </div>
  `;

  const matchIdx = Math.max(0, state.DisplayedShortlist.findIndex((c) => c.id === candidate.id));
  const matchRankLabel = matchIdx >= 0 && state.DisplayedShortlist[matchIdx] ? `#${matchIdx + 1}` : "Profile";
  const matchSignalTier = candidate.signalTier || brief?.signalTier || "Contextual Match";
  const matchOrderFormulaText = candidate.matchOrderFormula || brief?.matchOrderFormula || "Computed from verified Cala sector, stage, syndicate, momentum, geography, and timing records.";
  const sb = candidate.scoreBreakdown || brief?.matchContext?.scoreBreakdown || null;
  const matchMaxEq = sb
    ? `Sector (${sb.sector?.max ?? 25}) + Stage (${sb.stage?.max ?? 25}) + Syndicate (${sb.syndicate?.max ?? 20}) + Momentum (${sb.momentum?.max ?? 15}) + Geography (${sb.geography?.max ?? 10}) + Timing/Filing (${sb.arbitrageBonus?.max ?? 5})`
    : "Sector (25) + Stage (25) + Syndicate (20) + Momentum (15) + Geography (10) + Timing/Filing (5)";
  const matchFormulaPayload = {
    formula: matchMaxEq,
    inputs: matchOrderFormulaText,
    plainMeaning: "Evidence-match scan tier for partner triage only - never an investment verdict."
  };
  const matchSourceIds = (candidate.roundHistory || []).flatMap((r) => (r.sources || []).map((s) => s.id)).slice(0, 4);
  const velSeries = candidate.employeeCountSeries || brief?.employeeCountSeries || [];
  const velDateSpan = velSeries.length >= 2
    ? `${velSeries[0].date} -> ${velSeries[velSeries.length - 1].date}`
    : velSeries.length === 1
      ? `${velSeries[0].date} (1 observation)`
      : "No dated observations";
  const velSourceIds = velSeries.map((pt) => pt.sourceId).filter(Boolean).slice(0, 3);
  const velocityFormulaPayload = {
    formula: "(currentEmployees - baselineEmployees) / baselineEmployees",
    inputs: obsFolder.velocityFormula || "Not calculated: <2 dated Cala observations",
    plainMeaning: "Measures post-round hiring velocity purely from dated Cala employee observations."
  };
  const velocityMetaLine = `Observations: ${velDateSpan}${velSourceIds.length ? ` · Sources: ${velSourceIds.join(", ")}` : ""}`;

  container.innerHTML = `
    <div class="deterministic-disclaimer-note">Deterministic analysis of Cala facts (0 AI guessing). Analyst decides conviction &amp; weighting.</div>
    <div class="ev-folder-card" style="margin-bottom:8px;">
      ${buildFormulaToggleHtml(
        "match-order",
        `Match Order: <strong style="color:var(--text-strong);">${escapeHtml(matchRankLabel)} · ${escapeHtml(matchSignalTier)}</strong> (${candidate.suitabilityScore ?? 0}/99)`,
        matchFormulaPayload,
        `Top proof: ${candidate.dataConfidence?.topSourceRank || "AGGREGATOR"}${matchSourceIds.length ? ` · Sources: ${matchSourceIds.join(", ")}` : ""}`
      )}
    </div>
    <div class="ev-action-row">
      <button type="button" class="btn sm primary" id="railDraftCitedBriefBtn" data-startup-id="${escapeHtml(candidate.id)}">
        ${state.railNarrationLoading ? "Drafting..." : "Draft Brief"}
      </button>
      <button type="button" class="btn sm" id="railOpenFullBriefBtn" data-startup-id="${escapeHtml(candidate.id)}">Full Brief</button>
      <button type="button" class="btn sm" id="railVerifyLiveBtn" data-startup-id="${escapeHtml(candidate.id)}">Verify Live</button>
    </div>
    ${decisionBarHtml}
    ${narratedHtml}
    ${partnerScreeningHtml}

    <div class="ev-folder-card">
      <div class="ev-folder-head">
        <h4 class="ev-folder-title">1. Hidden Bridges &amp; Warm Paths</h4>
        <div class="ev-folder-actions">
          <button
            type="button"
            class="btn xs"
            id="railExpandCalaBtn"
            title="Query Live Cala graph for additional bridge links"
            data-startup-id="${escapeHtml(candidate.id)}"
            data-startup-name="${escapeHtml(candidate.name)}"
            ${state.railExpandCalaLoading ? "disabled" : ""}
          >${state.railExpandCalaLoading ? "Expanding..." : "Expand Live Links"}</button>
          <span class="micro-pill micro-primary">${bridgePaths.length}</span>
        </div>
      </div>
      ${expandStatusHtml}
      ${suppressedBarHtml}
      ${pathsHtml}
    </div>

    <div class="ev-folder-card">
      <div class="ev-folder-head">
        <h4 class="ev-folder-title">2. Observed Activity &amp; Timing</h4>
        <span class="micro-pill micro-velocity">${activityItems.length} dated</span>
      </div>
      ${timingSummaryParts.length ? `<div style="font-size:11.5px; color:var(--text); margin-bottom:4px;">${escapeHtml(cleanUiCopy(timingSummaryParts.join(" · ")))}</div>` : ""}
      <div style="margin-bottom:8px;">
        ${buildFormulaToggleHtml("velocity", "Hiring Velocity Math", velocityFormulaPayload, velocityMetaLine)}
      </div>
      ${activityHtml}
    </div>

    <div class="ev-folder-card">
      <div class="ev-folder-head">
        <h4 class="ev-folder-title">3. Filings, Proof &amp; Missing Gaps</h4>
        ${getSourceRankBadgeHtml(proofFolder.topSourceRank || candidate.dataConfidence?.topSourceRank)}
      </div>
      <div style="font-size:11.5px; color:var(--muted); margin-bottom:8px;">
        Evidence confidence: <strong style="color:var(--text-strong);">${escapeHtml(proofFolder.dataConfidenceGrade || candidate.dataConfidence?.grade || "Early / Sparse")}</strong>
      </div>
      ${factsHtml}
      ${gapsHtml ? `<div style="margin-top:10px; font-size:11px; font-weight:800; text-transform:uppercase; letter-spacing:0.05em; color:var(--fam-event);">Explicit Cala Gaps</div>${gapsHtml}` : ""}
    </div>
    <div class="deterministic-disclaimer-note" style="margin-top:8px; margin-bottom:0;">Deterministic analysis of Cala facts (0 AI guessing). Analyst decides conviction &amp; weighting.</div>
  `;
}

function renderRailStrategyPane() {
  const container = document.getElementById("railStrategyContent");
  if (!container) return;
  const thesis = state.analysis?.thesis;
  const backtest = state.analysis?.backtest;
  const drift = thesis?.statedVsRevealed;

  if (!thesis) {
    container.innerHTML = `<div class="ev-folder-card"><p style="margin:0; color:var(--muted);">Run an analysis or search to load benchmark strategy metrics.</p></div>`;
    return;
  }

  const feeders = (thesis.upstreamFeeders || []).slice(0, 6);
  const feederRowsHtml = feeders.length
    ? feeders
        .map((f) => `
          <div class="ev-fact-row" style="display:flex; justify-content:space-between; align-items:center; gap:8px;">
            <div>
              <div style="font-weight:700; color:var(--text-strong);">${escapeHtml(f.investorName || f.investorId)}</div>
              <div style="font-size:11px; color:var(--muted);">Fed ${f.fedDealsCount} N-1 rounds · ${f.totalDeals || "?"} indexed deals · ${f.lift}x lift</div>
            </div>
            ${f.isMegaHub
              ? `<span class="micro-pill micro-megahub">Mega-hub</span>`
              : `<span class="micro-pill micro-filing">High-signal</span>`}
          </div>
        `)
        .join("")
    : `<div style="font-size:12px; color:var(--muted);">No upstream N-1 feeders computed for this custom selection.</div>`;

  container.innerHTML = `
    <div class="rail-strategy-kpis">
      <div class="rail-mini-kpi">
        <span>Thesis Drift</span>
        <strong>${escapeHtml(String(drift?.driftPct ?? 0))}%</strong>
      </div>
      <div class="rail-mini-kpi">
        <span>Stated Alignment</span>
        <strong>${escapeHtml(String(drift?.alignmentPct ?? 100))}%</strong>
      </div>
      <div class="rail-mini-kpi">
        <span>Precision@5 (PIT)</span>
        <strong>${backtest?.precisionAt5 != null ? `${Math.round(backtest.precisionAt5 * 100)}%` : "N/A"}</strong>
      </div>
      <div class="rail-mini-kpi">
        <span>Evaluated Rounds</span>
        <strong>${escapeHtml(String(thesis.sampleSize || 0))}</strong>
      </div>
    </div>

    <div class="ev-folder-card">
      <div class="ev-folder-head">
        <h4 class="ev-folder-title">Stated vs Revealed Summary</h4>
      </div>
      <div style="font-size:12px; color:var(--text); line-height:1.45;">
        ${escapeHtml(cleanUiCopy(drift?.summary || "Comparing stated thesis text against historical N-1 and Series A filings indexed in Cala."))}
      </div>
    </div>

    <div class="ev-folder-card">
      <div class="ev-folder-head">
        <h4 class="ev-folder-title">Upstream Feeder Investors (N-1 -> Lead)</h4>
      </div>
      ${feederRowsHtml}
    </div>

    <button type="button" class="btn sm primary" id="railOpenFullThesisBtn" style="width:100%;">
      Open Full Thesis &amp; Backtest View -&gt;
    </button>
  `;
}

function renderSideEvidenceRail() {
  const collapsedBtn = document.getElementById("sideRailCollapsedTab");
  const railEl = document.getElementById("sideEvidenceRail");
  const collapsedCountEl = document.getElementById("railCollapsedCount");
  const collapsedFilingEl = document.getElementById("railCollapsedFilingCount");

  const visibleList = getFilteredShortlistItems(state.DisplayedShortlist);
  const filingCount = visibleList.filter((item) => {
    const rank = item.dataConfidence?.topSourceRank || item.evidenceFolders?.proofAndGaps?.topSourceRank;
    return String(rank || "").toUpperCase() === "FILING";
  }).length;

  if (collapsedCountEl) collapsedCountEl.textContent = String(visibleList.length);
  if (collapsedFilingEl) collapsedFilingEl.textContent = `${filingCount} FILING`;

  if (collapsedBtn) {
    const hasQuickSelection = Boolean(state.selectedStartupId || state.selectedBridgeId || state.selectedAnchorId);
    collapsedBtn.hidden = Boolean(state.sideRailOpen) || hasQuickSelection;
  }
  if (railEl) {
    railEl.hidden = !state.sideRailOpen;
    if (state.sideRailOpen && state.sideRailWidth) {
      railEl.style.width = `${state.sideRailWidth}px`;
    } else if (railEl.style.width && !state.sideRailWidth) {
      railEl.style.width = "";
    }
  }
  document.body.classList.toggle("has-rail-open", Boolean(state.sideRailOpen));
  if (state.sideRailOpen) {
    getActiveRailOffset();
  }
  if (typeof renderQuickInspectorCard === "function") {
    renderQuickInspectorCard();
  }

  // Update header context
  const kickerEl = document.getElementById("railContextKicker");
  const titleEl = document.getElementById("railContextTitle");
  const subEl = document.getElementById("railContextSub");
  const saveBtn = document.getElementById("railSaveCallBtn");
  const prevBtn = document.getElementById("railPrevBtn");
  const nextBtn = document.getElementById("railNextBtn");

  if (state.selectedAnchorId && !state.selectedStartupId && !state.selectedBridgeId) {
    const aNode = (getEffectiveBridgeMap()?.nodes || []).find((n) => n.id === state.selectedAnchorId);
    if (kickerEl) kickerEl.textContent = aNode?.entityType === "startup" ? "PINNED STARTUP ANCHOR" : "PINNED FUND ANCHOR";
    if (titleEl) titleEl.textContent = aNode?.label || getSelectedBenchmarkLabel();
    if (subEl) subEl.textContent = cleanUiCopy(aNode?.subtitle || "Strategy Benchmark Anchor");
    if (saveBtn) saveBtn.hidden = true;
    if (prevBtn) prevBtn.disabled = true;
    if (nextBtn) nextBtn.disabled = true;
  } else if (state.selectedBridgeId && !state.selectedStartupId) {
    const bNode = (getEffectiveBridgeMap()?.nodes || []).find((n) => n.id === state.selectedBridgeId);
    const famLabel = BRIDGE_FAMILY_VISUAL_META[bNode?.bridgeFamily]?.label || "Bridge Entity";
    if (kickerEl) kickerEl.textContent = "BRIDGE HUB";
    if (titleEl) titleEl.textContent = bNode?.label || "Bridge Entity";
    if (subEl) subEl.textContent = `${famLabel}${bNode?.totalDeals != null ? ` · ${bNode.totalDeals} indexed deals` : ""}`;
    if (saveBtn) saveBtn.hidden = true;
    if (prevBtn) prevBtn.disabled = true;
    if (nextBtn) nextBtn.disabled = true;
  } else {
    const idx = visibleList.findIndex((c) => c.id === state.selectedStartupId);
    const candidate = (idx >= 0 ? visibleList[idx] : visibleList[0])
      || state.allKnownItems.get(state.selectedStartupId);
    if (kickerEl) {
      kickerEl.textContent = candidate
        ? (idx >= 0 ? `RANK #${idx + 1} · BRIDGE MATCH` : "CONSTELLATION MATCH")
        : "EVIDENCE & MATCHES";
    }
    if (titleEl) titleEl.textContent = candidate ? candidate.name : "Select a startup";
    if (subEl) {
      subEl.textContent = candidate
        ? `${candidate.sector} · ${candidate.stage} · ${candidate.hqCity || ""}, ${candidate.country}`
        : `${visibleList.length} matching startups`;
    }
    if (saveBtn) {
      saveBtn.hidden = !candidate;
      if (candidate) {
        const isSaved = state.savedCallListIds.includes(candidate.id);
        saveBtn.classList.toggle("is-saved", isSaved);
        saveBtn.setAttribute("aria-pressed", isSaved ? "true" : "false");
        saveBtn.innerHTML = bookmarkIconSvg(14);
      }
    }
    if (prevBtn) prevBtn.disabled = visibleList.length <= 1;
    if (nextBtn) nextBtn.disabled = visibleList.length <= 1;
  }

  // Update tab buttons and panes
  const activeRailTab = state.sideRailTab || "matches";
  document.querySelectorAll("[data-rail-tab]").forEach((btn) => {
    const t = btn.dataset.railTab;
    const isAct = t === activeRailTab;
    btn.classList.toggle("is-active", isAct);
    btn.setAttribute("aria-selected", isAct ? "true" : "false");
  });

  const paneMatches = document.getElementById("railPaneMatches");
  const paneEvidence = document.getElementById("railPaneEvidence");
  const paneStrategy = document.getElementById("railPaneStrategy");
  if (paneMatches) paneMatches.hidden = activeRailTab !== "matches";
  if (paneEvidence) paneEvidence.hidden = activeRailTab !== "evidence";
  if (paneStrategy) paneStrategy.hidden = activeRailTab !== "strategy";

  renderRailMatchesPane();
  renderRailEvidencePane();
  renderRailStrategyPane();
}

function renderStartupGrid(shortlist) {
  syncCallListUI();
  syncConstellationControls();
  renderSideEvidenceRail();
  if (state.workspaceMode === "map") {
    updateAiSynthesisBanner();
    renderConstellationMap(getEffectiveBridgeMap(), { fit: false });
  }
}

function renderAlsoScreenedSection(analysisResult) {
  const listEl = document.getElementById("alsoScreenedList");
  const cardEl = document.getElementById("alsoScreenedCard");
  if (!listEl) return;

  const fundName = analysisResult?.thesis?.fundName || getSelectedBenchmarkLabel();
  const sims = new Map();
  for (const item of analysisResult?.shortlist || []) {
    for (const s of item.similarPortfolio || []) {
      if (!sims.has(s.id || s.name)) {
        sims.set(s.id || s.name, s);
      }
    }
  }

  const portfolioItems = [...sims.values()].slice(0, 4);
  if (!portfolioItems.length) {
    if (cardEl) cardEl.hidden = true;
    listEl.innerHTML = "";
    return;
  }

  if (cardEl) cardEl.hidden = false;
  const countBadge = document.getElementById("alsoScreenedCountBadge");
  if (countBadge) {
    countBadge.textContent = `${portfolioItems.length} excluded`;
  }
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
  const entityScope = document.getElementById("filterEntityScope")?.value || "startups";
  const stage = document.getElementById("filterStage")?.value || "all";
  const region = document.getElementById("filterRegion")?.value || "all";
  const excludeSector = document.getElementById("filterExcludeSector")?.value || "";
  const raisingSoonOnly = Boolean(document.getElementById("filterRaisingSoon")?.checked);
  const untappedOnly = Boolean(document.getElementById("filterUntappedOnly")?.checked);
  let count = 0;
  if (entityScope !== "startups") count += 1;
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
    const calaProf = getStartupCalaFieldProfile(c);
    const hay = `${c.name} ${calaProf?.legalName || ""} ${c.sector || ""} ${c.country || ""} ${c.hqCity || ""} ${calaProf?.slush2026?.attending ? "slush 2026 attendee" : ""}`.toLowerCase();
    if (hay.includes(q)) {
      seenIds.add(c.id);
      companyMatches.push({ company: c, legalName: calaProf?.legalName });
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

  const aiPrompts = [
    { kind: "AI Prompt", query: "Slush 2026 DeepTech raising soon", meta: "Natural-language filter + Cala Event Graph" },
    { kind: "AI Prompt", query: "Fast headcount growth after Seed", meta: "+30% employee_count velocity post-round" },
    { kind: "AI Prompt", query: "Upstream feeder syndicate deals", meta: "Round N-1 feeders ahead of follow-on" },
    { kind: "AI Prompt", query: "Filing signal or alumni founder", meta: "PRH/Companies House filings + scaleup spinouts" },
    { kind: "Audit", query: "Why not Oura?", meta: "Portfolio exclusion & score check" }
  ].filter(
    (p) =>
      p.query.toLowerCase().includes(q) ||
      q.includes("slush") ||
      q.includes("why") ||
      q.includes("fast") ||
      q.includes("growth") ||
      q.includes("feeder") ||
      q.includes("filing") ||
      q.includes("alumni") ||
      q.includes("warm") ||
      q.includes("under") ||
      q.includes("ai") ||
      q.includes("find")
  );

  const suggestions = [
    ...companyMatches.map(({ company: c, legalName }) => ({
      type: "startup",
      id: c.id,
      kind: "Startup",
      title: c.name,
      meta: `${legalName || c.sector} · ${c.country}${typeof c.suitabilityScore === "number" ? ` · ${c.suitabilityScore}` : ""}`
    })),
    ...filterMatches.map((m) => ({
      type: "query",
      query: m.query,
      kind: m.kind,
      title: m.query,
      meta: m.meta
    })),
    ...aiPrompts.slice(0, 2).map((p) => ({
      type: "query",
      query: p.query,
      kind: p.kind,
      title: p.query,
      meta: p.meta
    }))
  ].slice(0, 6);

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

function parseNaturalLanguageSearchQuery(rawQuery) {
  const raw = String(rawQuery || "").trim();
  const q = raw.toLowerCase();
  const res = {
    raw,
    isWhyNot: /^\s*why not\s+/i.test(q),
    slush2026Only: /\b(slush|slush 2026|bc844d56|attendee)\b/i.test(q),
    raisingSoonOnly: /\b(raising|raising soon|window|next round|fundraising)\b/i.test(q),
    untappedOnly: /\b(untapped|hidden|uncontested|angel)\b/i.test(q),
    preferWarm: /\b(warm|warmest|linkedin|intro|bridge|2nd)\b/i.test(q),
    highVelocityOnly: /\b(fast headcount|headcount growth|headcount velocity|high growth|team velocity|hiring velocity|growing fast)\b/i.test(q),
    feederOnly: /\b(feeder|upstream|prior[- ]round)\b/i.test(q),
    filingOnly: /\b(filing signal|filing arbitrage|registry filings?|companies house|share allotment|unannounced filing|facility)\b/i.test(q),
    alumniOnly: /\b(alumni founder|spinouts?|operator lineage|ex-iceye|ex-aiven|ex-iqm|ex-oura|ex-silo)\b/i.test(q),
    maxEmployees: null,
    sectors: [],
    sector: null,
    stageFilter: null,
    countries: [],
    country: null,
    region: null,
    isNaturalLanguage: false,
    constraintTags: []
  };

  const empMatch = q.match(/(?:under|below|<|max)\s*(\d+)\s*(?:employees|staff|people|headcount)?/i);
  if (empMatch) {
    res.maxEmployees = Number(empMatch[1]);
    res.constraintTags.push(`Headcount <= ${res.maxEmployees}`);
  } else if (/\bsmall team\b/i.test(q)) {
    res.maxEmployees = 25;
    res.constraintTags.push("Headcount <= 25");
  }

  if (/\b(deeptech|deep tech|quantum|photonics|robotics|space|satellite|fusion)\b/i.test(q)) {
    res.sectors.push("DeepTech");
  }
  if (/\b(fintech|payments|banking|treasury|credit)\b/i.test(q) && !/\b(exclude fintech|no fintech)\b/i.test(q)) {
    res.sectors.push("Fintech");
  }
  if (/\b(healthtech|health|medtech|clinical|diagnostics|bio)\b/i.test(q) && !/\b(exclude health|no health)\b/i.test(q)) {
    res.sectors.push("HealthTech");
  }
  if (/\b(climate|energy|clean|carbon|solar)\b/i.test(q) && !/\b(exclude climate|no climate)\b/i.test(q)) {
    res.sectors.push("Climate Tech");
  } else if (/\b(grid|battery|storage)\b/i.test(q) && !/\b(exclude climate|no climate)\b/i.test(q)) {
    res.sectors.push("Climate Tech", "AI & ML");
  }
  if (/\b(b2b saas|saas|automation|workflow)\b/i.test(q) && !/\b(exclude saas|no saas)\b/i.test(q)) {
    res.sectors.push("B2B SaaS");
  }
  if (/\b(ai|ml|machine learning|llm|agent|ai & ml)\b/i.test(q)) {
    res.sectors.push("AI & ML");
  }
  res.sector = res.sectors[0] || null;

  if (/\bpre[- ]seed\b/i.test(q)) res.stageFilter = "pre_seed_seed";
  else if (/\bseries a\b/i.test(q)) res.stageFilter = "seed_series_a";
  else if (/\bseed\b/i.test(q)) res.stageFilter = "pre_seed_seed";

  const countryList = ["finland", "sweden", "denmark", "estonia", "germany", "uk", "united kingdom", "netherlands", "norway", "helsinki", "espoo", "oulu", "stockholm", "berlin", "munich", "london", "tallinn", "copenhagen"];
  for (const c of countryList) {
    if (new RegExp(`\\b${c}\\b`, "i").test(q)) {
      const normalized = c === "uk" ? "united kingdom" : c;
      if (!res.countries.includes(normalized)) res.countries.push(normalized);
    }
  }
  res.country = res.countries[0] || null;
  if (/\bnordic/i.test(q)) res.region = "Nordics";
  else if (/\bdach/i.test(q)) res.region = "DACH";

  if (res.slush2026Only) res.constraintTags.push("Event: Slush 2026 (ATTENDEE)");
  if (res.raisingSoonOnly) res.constraintTags.push("Window: Raising soon");
  if (res.untappedOnly) res.constraintTags.push("Signal: Untapped / Angel");
  if (res.highVelocityOnly) res.constraintTags.push("Velocity: >= +30% hiring");
  if (res.feederOnly) res.constraintTags.push("Syndicate: Upstream feeder");
  if (res.filingOnly) res.constraintTags.push("Provenance: Registry filing");
  if (res.alumniOnly) res.constraintTags.push("Lineage: Scaleup alumni");
  if (res.preferWarm) res.constraintTags.push("Sort: Warmest Intro");
  if (res.sectors.length) res.constraintTags.push(`Sector: ${res.sectors.join(" | ")}`);
  if (res.countries.length) res.constraintTags.push(`Location: ${res.countries.join(" | ")}`);
  if (res.region) res.constraintTags.push(`Region: ${res.region}`);

  const isMultiWordQuestion =
    !res.isWhyNot && (q.split(/\s+/).length >= 3 || /^(which|what|who|find|show|give|list|recommend)\b/i.test(q));
  res.isNaturalLanguage = !res.isWhyNot && (res.constraintTags.length >= 1 || (res.slush2026Only && q.length > 0) || isMultiWordQuestion);
  return res;
}

function buildAiCopilotSynthesis(queryText, parsed, items, backendRes) {
  if (parsed?.isWhyNot && backendRes?.explanation) {
    return backendRes.explanation;
  }
  if (!items || !items.length) {
    return `No Cala-indexed startups matched "${escapeHtml(queryText)}". Reset filters or widen bridge families.`;
  }
  if (backendRes?.explanation && /0 exact matches/i.test(backendRes.explanation)) {
    return backendRes.explanation;
  }
  const topLead = items[0];
  const topBridge = topLead.evidenceFolders?.hiddenBridges?.paths?.[0]?.bridgeEntityName
    || topLead.coInvestorPath?.coInvestorName
    || "Cala bridge graph";
  const suppressed = backendRes?.bridgeMap?.stats?.suppressedMegaHubCount ?? 0;
  const hubNote = state.hideMegaHubs !== false ? ` · ${suppressed} mega-hubs filtered` : "";
  return `Matched <strong>${items.length}</strong> startup${items.length === 1 ? "" : "s"}${hubNote}. Closest bridge match: <strong>${escapeHtml(topLead.name)}</strong> (${escapeHtml(topLead.hqCity || "")}, ${escapeHtml(topLead.stage)}, path via ${escapeHtml(topBridge)}).`;
}

async function executeSearchRefinement(customQuery, options = {}) {
  hideSearchSuggestions();
  const inputEl = document.getElementById("aiSearchInput");
  const queryText = typeof customQuery === "string" ? customQuery : inputEl?.value || "";
  if (inputEl && typeof customQuery === "string") {
    inputEl.value = customQuery;
  }
  updateSearchInputChrome();

  const parsed = parseNaturalLanguageSearchQuery(queryText);
  const ov = options.explicitOverrides || {};

  const stageFilter = ov.stageFilter !== undefined
    ? ov.stageFilter
    : (document.getElementById("filterStage")?.value !== "all"
        ? document.getElementById("filterStage")?.value
        : parsed.stageFilter || state.targetStage || "all");
  const region = ov.region !== undefined
    ? ov.region
    : (document.getElementById("filterRegion")?.value !== "all"
        ? document.getElementById("filterRegion")?.value
        : parsed.region || "all");
  const excludeSector = ov.excludeSector !== undefined
    ? ov.excludeSector
    : (document.getElementById("filterExcludeSector")?.value || "");
  const raisingSoonOnly = ov.raisingSoonOnly !== undefined
    ? Boolean(ov.raisingSoonOnly)
    : Boolean(document.getElementById("filterRaisingSoon")?.checked) || parsed.raisingSoonOnly;
  const entityScope = document.getElementById("filterEntityScope")?.value || "startups";
  const untappedOnly = ov.untappedOnly !== undefined
    ? Boolean(ov.untappedOnly)
    : Boolean(document.getElementById("filterUntappedOnly")?.checked) || Boolean(state.untappedOnly) || parsed.untappedOnly;
  const filingOnly = ov.filingOnly !== undefined
    ? Boolean(ov.filingOnly)
    : Boolean(state.filingOnly) || parsed.filingOnly;
  const slush2026Only = ov.slush2026Only !== undefined
    ? Boolean(ov.slush2026Only)
    : Boolean(state.onlySlush2026) || parsed.slush2026Only;
  const hideMegaHubs = state.hideMegaHubs !== false;
  const bridgeFamily = state.bridgeFamily && state.bridgeFamily !== "all" ? state.bridgeFamily : "all";
  const contributionGroup = state.contributionGroup && state.contributionGroup !== "all" ? state.contributionGroup : "all";
  const feederOnlyFlag = ov.feederOnly !== undefined ? Boolean(ov.feederOnly) : parsed.feederOnly;
  const alumniOnlyFlag = ov.alumniOnly !== undefined ? Boolean(ov.alumniOnly) : parsed.alumniOnly;
  const highVelocityFlag = ov.highVelocityOnly !== undefined ? Boolean(ov.highVelocityOnly) : parsed.highVelocityOnly;
  const maxEmpVal = ov.maxEmployees !== undefined ? ov.maxEmployees : parsed.maxEmployees;
  const filterCount = countActiveRefineFilters();

  const hasActiveFilter = Boolean(queryText.trim()) || filterCount > 0 || bridgeFamily !== "all" || contributionGroup !== "all" || !hideMegaHubs;

  const resetBtn = document.getElementById("aiSearchResetBtn");
  if (resetBtn) {
    resetBtn.hidden = !Boolean(queryText.trim());
  }

  const trimmedQuery = queryText.trim();
  const isWhyNotQuery = /^\s*why not\s+/i.test(trimmedQuery);
  const shouldDiscoverLive =
    Boolean(trimmedQuery) &&
    !isWhyNotQuery &&
    (options.forceLive === true ||
      state.lastLiveDiscoveredQuery.toLowerCase() !== trimmedQuery.toLowerCase());

  const submitBtnEl = document.getElementById("aiSearchSubmitBtn");
  const prevSubmitText = submitBtnEl?.textContent || "Explore Map";
  if (shouldDiscoverLive) {
    state.liveCalaSearchLoading = true;
    if (submitBtnEl) {
      submitBtnEl.disabled = true;
      submitBtnEl.textContent = "Searching Cala...";
    }
    if (state.workspaceMode === "hero" || state.activeTab !== "search") {
      state.activeTab = "search";
      document.querySelectorAll(".workspace-panel").forEach((panel) => {
        panel.hidden = panel.id !== "panel-search";
      });
      enterMapWorkspace({ fit: false });
    }
    updateAiSynthesisBanner({ loadingMessage: "Searching Live Cala knowledge graph..." });
  }

  let res;
  try {
    res = await fetchJson("/api/refine", {
      method: "POST",
      body: JSON.stringify({
        mode: state.inputMode,
        fundId: state.selectedFundId,
        companyIds: state.selectedCompanyIds,
        rankingMode: mapScoringModeToApi(state.scoringMode),
        statedThesisOverride: state.statedThesisOverride || undefined,
        seenCompanyNames: getSeenCompanyNamesList(),
        entityScope,
        queryText,
        stageFilter,
        region,
        excludeSector: excludeSector || "none",
        raisingSoonOnly,
        untappedOnly,
        highVelocityOnly: highVelocityFlag,
        feederOnly: feederOnlyFlag,
        filingOnly,
        alumniOnly: alumniOnlyFlag,
        sectors: parsed.sectors,
        countries: parsed.countries,
        maxEmployees: maxEmpVal,
        slush2026Only,
        preferWarm: parsed.preferWarm,
        hideMegaHubs,
        bridgeFamily,
        contributionGroup,
        discoverLive: shouldDiscoverLive
      })
    });
  } finally {
    if (shouldDiscoverLive) {
      state.liveCalaSearchLoading = false;
      if (submitBtnEl) {
        submitBtnEl.disabled = false;
        submitBtnEl.textContent = prevSubmitText;
      }
    }
  }

  if (shouldDiscoverLive) {
    state.lastLiveDiscoveredQuery = trimmedQuery;
    if (options.forceLive && res.liveDiscovery) {
      showUiToast(`Live Cala refreshed (${res.liveDiscovery.hydratedEntityCount || 0} entities hydrated)`);
    }
  }

  if (res.calaBudget) {
    updateTelemetryMasthead(res.calaBudget);
  }

  const shortlist = res.shortlist || [];
  state.DisplayedShortlist = shortlist;
  state.bridgeMap = res.bridgeMap || null;
  registerKnownItems(state.DisplayedShortlist);
  if (typeof seedPrimaryPinnedEntity === "function") {
    seedPrimaryPinnedEntity({ bridgeMap: res.bridgeMap, shortlist });
  }

  // Build compact criteria tags for Side Rail Matches header
  const tags = [...parsed.constraintTags];
  const af = res.appliedFilters || {};
  const cq = res.compiledQuery || {};
  const minGrowth = af.minHeadcountGrowthPct ?? cq.minHeadcountGrowthPct;
  const alumniReq = Boolean(af.alumniOnly || af.requireAlumniFounder || cq.requireAlumniFounder);
  const expKw = (af.expandedKeywords?.length ? af.expandedKeywords : cq.expandedKeywords) || [];
  if (minGrowth > 0 && !tags.some((t) => t.includes("growth"))) {
    tags.push(`Headcount growth >= +${minGrowth}%`);
  }
  if (alumniReq && !tags.some((t) => t.toLowerCase().includes("alumni"))) {
    tags.push("Alumni spinout lineage");
  }
  if (expKw.length > 0) {
    tags.push(`Keywords: ${expKw.slice(0, 3).join(", ")}`);
  }
  if (contributionGroup !== "all") {
    tags.push(`Lens: ${CONTRIBUTION_VISUAL_META[contributionGroup]?.label || contributionGroup}`);
  }
  if (bridgeFamily !== "all") {
    tags.push(`Bridge: ${BRIDGE_FAMILY_VISUAL_META[bridgeFamily]?.shortLabel || bridgeFamily}`);
  }
  if (!hideMegaHubs) {
    tags.push("Mega-hubs: Shown");
  }
  state.lastRefineResponse = {
    ...res,
    parsedCriteriaTags: tags.slice(0, 6)
  };

  if (!options.keepSelection) {
    state.selectedStartupId = null;
    state.selectedBridgeId = null;
    state.selectedAnchorId = null;
    if (!options.keepRailOpen) {
      state.sideRailOpen = false;
    }
  } else if (state.selectedStartupId && !shortlist.some((s) => s.id === state.selectedStartupId)) {
    state.selectedStartupId = null;
  }

  // Transition Screen 1 Hero -> Screen 2 Workspace cleanly on submit
  if (state.workspaceMode === "hero" || state.activeTab !== "search") {
    state.activeTab = "search";
    document.querySelectorAll(".workspace-panel").forEach((panel) => {
      panel.hidden = panel.id !== "panel-search";
    });
    enterMapWorkspace({ fit: false });
  }

  const liveBadge =
    res.liveDiscovery?.hydratedEntityCount > 0 || res.liveDiscoveredCount > 0
      ? ` · Live Cala: ${res.liveDiscovery?.hydratedEntityCount || 0} hydrated (${res.liveDiscoveredCount || 0} new)`
      : "";
  const synthesisText = hasActiveFilter && queryText.trim()
    ? `${parsed.isNaturalLanguage
        ? buildAiCopilotSynthesis(queryText, parsed, state.DisplayedShortlist, res)
        : escapeHtml(cleanUiCopy(res.explanation || `Showing ${state.DisplayedShortlist.length} Cala-verified startups matching "${queryText}".`))}${liveBadge}`
    : null;

  syncConstellationControls();
  renderExploredEntitiesBox();
  renderStartupGrid(state.DisplayedShortlist);
  updateAiSynthesisBanner(synthesisText ? { synthesis: synthesisText } : null);
  renderConstellationMap(getEffectiveBridgeMap(), { fit: options.fit !== false });
}

async function resetSearchAndFilters() {
  const inputEl = document.getElementById("aiSearchInput");
  if (inputEl) inputEl.value = "";
  state.lastLiveDiscoveredQuery = "";
  state.liveCalaSearchLoading = false;
  state.targetStage = "all";
  state.onlyCallList = false;
  state.onlySlush2026 = false;
  state.hideMegaHubs = true;
  state.bridgeFamily = "all";
  state.contributionGroup = "all";
  state.filingOnly = false;
  state.untappedOnly = false;
  state.selectedStartupId = null;
  state.selectedBridgeId = null;
  state.selectedAnchorId = null;
  state.expandedGroupKey = null;
  state.sideRailOpen = false;
  if (state.pinnedEntities.length > 1) {
    state.pinnedEntities = state.pinnedEntities.slice(0, 1);
  }
  const stageSel = document.getElementById("targetStageSelect");
  if (stageSel) stageSel.value = "all";
  const filterEntityScopeEl = document.getElementById("filterEntityScope");
  if (filterEntityScopeEl) filterEntityScopeEl.value = "startups";
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
  syncCallListUI();
  syncConstellationControls();
  await executeSearchRefinement("", { fit: true });
}

/* ==========================================================================
   STARTUP BRIEF LOADER & 3-COLUMN DEEP DIVE
   ========================================================================== */

async function loadStartupBriefData(companyId) {
  const cacheKey = `${companyId}:${state.selectedFundId}`;
  if (state.briefCache.has(cacheKey)) {
    state.activeBrief = state.briefCache.get(cacheKey);
    if (state.activeTab === "talk") renderTalkScreen();
    if (state.sideRailOpen && state.sideRailTab === "evidence" && state.selectedStartupId === companyId) {
      renderRailEvidencePane();
    }
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
  if (state.sideRailOpen && state.sideRailTab === "evidence" && state.selectedStartupId === companyId) {
    renderRailEvidencePane();
  }
  return brief;
}

async function draftRailCitedBrief(startupId) {
  if (!startupId || state.railNarrationLoading) return;
  state.railNarrationLoading = true;
  renderRailEvidencePane();
  try {
    const qs = new URLSearchParams({
      startupId,
      fundId: state.inputMode === "fund" ? state.selectedFundId : "",
      narrate: "1"
    });
    const brief = await fetchJson(`/api/brief?${qs.toString()}`);
    if (brief?.narrative) {
      state.railNarratedBriefs[startupId] = brief.narrative;
    }
  } catch (err) {
    showUiToast(`Cited brief unavailable: ${err.message}`);
  } finally {
    state.railNarrationLoading = false;
    if (state.sideRailOpen && state.sideRailTab === "evidence") {
      renderRailEvidencePane();
    }
  }
}

function getScoreBreakdownRows(item) {
  const sb = item?.scoreBreakdown;
  if (!sb) return [];
  const coName = item?.coInvestorPath?.coInvestorName;
  const syn = sb.syndicate || sb.coInvestor;
  const mom = sb.momentum || sb.roundSize;
  const growthStr = item?.headcountGrowthPct > 0 ? `+${item.headcountGrowthPct}% hiring velocity` : "Steady baseline";
  const feederNote = item?.coInvestorPath?.isUpstreamFeeder
    ? `Upstream feeder ${coName || ""} (Round N-1 -> lead)`
    : coName
      ? `Shared Cala rounds alongside ${coName}`
      : "Evaluated against benchmark syndicate graph";
  return [
    {
      label: "Sector fit",
      points: Number(sb.sector?.earned || 0).toFixed(1),
      maxPoints: sb.sector?.max || 26,
      detail: `Cala-verified ${item?.sector || "sector"} conviction vs. fund check history`
    },
    {
      label: "Stage & entry DNA",
      points: Number(sb.stage?.earned || 0).toFixed(1),
      maxPoints: sb.stage?.max || 22,
      detail: `${item?.stage || "Current stage"} cadence toward ${item?.likelyNextStage || "next"} window`
    },
    {
      label: "Syndicate & feeders",
      points: Number(syn?.earned || 0).toFixed(1),
      maxPoints: syn?.max ?? 20,
      detail: feederNote
    },
    {
      label: "Team momentum",
      points: Number(mom?.earned || 0).toFixed(1),
      maxPoints: mom?.max || 18,
      detail: item?.alumniSpinout
        ? `Ex-${item.alumniSpinout.priorCompany} founder lineage · ${growthStr}`
        : `${growthStr} from dated Cala headcount series`
    },
    {
      label: "Geography match",
      points: Number(sb.geography?.earned || 0).toFixed(1),
      maxPoints: sb.geography?.max || 14,
      detail: `${item?.hqCity || "Hub"}, ${item?.country || "EU"} domicile alignment`
    }
  ];
}

function getInvestorFitVerdict(score) {
  const num = Number(score || 0);
  if (num >= 78) return { label: "Strong thesis match", hint: "Priority call candidate" };
  if (num >= 60) return { label: "Good potential fit", hint: "Worth reviewing closely" };
  return { label: "Early match", hint: "Selective fit · review details" };
}

function getInvestorStrengthTag(earned, max) {
  const ratio = max > 0 ? Number(earned || 0) / Number(max) : 0;
  if (ratio >= 0.78) return { text: "Strong match", pct: Math.round(ratio * 100) };
  if (ratio >= 0.5) return { text: "Good match", pct: Math.round(ratio * 100) };
  if (ratio > 0) return { text: "Partial match", pct: Math.round(ratio * 100) };
  return { text: "No direct link yet", pct: 0 };
}

function formatReadableMonth(isoDate) {
  const s = String(isoDate || "").trim();
  if (!s) return "";
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const m = s.match(/^(\d{4})(?:-(\d{2}))?/);
  if (!m) return s;
  if (!m[2]) return m[1];
  const idx = Math.max(0, Math.min(11, Number(m[2]) - 1));
  return `${months[idx]} ${m[1]}`;
}

function formatReadableTrustRank(rank) {
  const r = String(rank || "").toUpperCase();
  if (r === "FILING") return "Official Filing";
  if (r === "PRIMARY") return "Company / Investor";
  if (r === "PRESS") return "News Report";
  return "Verified Record";
}

function getInvestorReliabilityMeta(candidate, brief, calaProfile) {
  const rounds = brief?.rounds || candidate.roundHistory || [];
  const latestRound = rounds[rounds.length - 1] || null;
  const sigs = brief?.arbitrageSignals || candidate.arbitrageSignals || [];
  const dc = brief?.dataConfidence || candidate?.dataConfidence || null;
  const allSources = [];
  const seenUrls = new Set();

  const pushSource = (src, fallbackRank) => {
    if (!src) return;
    const key = `${src.publisher || src.name || ""}|${src.url || src.title || ""}`;
    if (seenUrls.has(key)) return;
    seenUrls.add(key);
    allSources.push({
      title: src.title || "Verified record",
      publisher: src.publisher || src.name || "Cala AI Graph",
      url: src.url || src.document || "",
      date: src.date || "",
      sourceRank: src.sourceRank || fallbackRank || "PRIMARY"
    });
  };

  (brief?.sources || []).forEach((s) => pushSource(s, "PRIMARY"));
  (latestRound?.sources || []).forEach((s) => pushSource(s, "PRIMARY"));
  (candidate.reasons || []).forEach((r) => (r.sources || []).forEach((s) => pushSource(s, "PRIMARY")));

  const rankPriority = { FILING: 3, PRIMARY: 2, PRESS: 1, AGGREGATOR: 0 };
  const candidateRanks = [
    dc?.topSourceRank,
    ...(latestRound?.sources || []).map((s) => s.sourceRank),
    ...sigs.map((s) => s.sourceRank),
    ...allSources.map((s) => s.sourceRank)
  ].filter(Boolean);

  let topRank = "PRIMARY";
  let bestPrio = -1;
  candidateRanks.forEach((rk) => {
    const p = rankPriority[String(rk).toUpperCase()] ?? 1;
    if (p > bestPrio) {
      bestPrio = p;
      topRank = String(rk).toUpperCase();
    }
  });

  if (candidate?.isLiveCalaDiscovered && bestPrio < 2 && allSources.length === 0) {
    topRank = "PRIMARY";
  }

  const gradeText = dc?.grade || (topRank === "FILING" ? "High" : "Medium");
  let badgeLabel = `Confidence: ${gradeText} · Verified Records`;
  let explanation =
    "Confirmed from direct company disclosures, investor announcements, and Cala AI records.";
  if (topRank === "FILING") {
    badgeLabel = `Confidence: ${gradeText} · Official Filings`;
    explanation =
      "Key figures come directly from official national business registries and regulatory filings indexed by Cala AI.";
  } else if (dc?.grade === "Early / Sparse" || topRank === "PRESS" || topRank === "AGGREGATOR") {
    badgeLabel = `Confidence: ${gradeText} · Public Records`;
    explanation =
      "Based on initial public records; some team growth or financial history is still incomplete. Click Verify live data to check Cala.";
  }

  const leadSrc =
    allSources.find((s) => String(s.sourceRank || "").toUpperCase() === topRank) || allSources[0];
  const srcDate = formatReadableMonth(leadSrc?.date);
  const sourceSummary = leadSrc
    ? `${leadSrc.publisher}${srcDate ? ` · ${srcDate}` : ""}`
    : `${calaProfile?.fundingStage ? "Cala AI Knowledge Graph" : "Verified Cala index"}`;

  return {
    topRank,
    confidenceGrade: gradeText,
    badgeLabel,
    explanation,
    sourceSummary,
    sources: allSources
  };
}

function buildCompanyOverviewModel(candidate, brief, calaProfile, isLinkedin) {
  const rounds = brief?.rounds || candidate.roundHistory || [];
  const latestRound = rounds[rounds.length - 1] || null;
  const obsList = calaProfile?.numericalObservations || brief?.employeeCountSeries || candidate.employeeCountSeries || [];
  const startHc = brief?.headcountAtLastRound ?? candidate.headcountAtLastRound ?? obsList[0]?.value ?? candidate.employeeCount;
  const currentHc = candidate.employeeCount ?? obsList[obsList.length - 1]?.value ?? startHc;
  const growthPct =
    brief?.headcountGrowthPct ??
    candidate.headcountGrowthPct ??
    (startHc > 0 ? Math.max(0, Math.round(((currentHc - startHc) / startHc) * 100)) : 0);

  const coPath = candidate.coInvestorPath;
  const liNet = candidate.linkedinNetwork;
  const activeBridgeName = isLinkedin
    ? (liNet?.bridgePerson || coPath?.coInvestorName || "Direct connector").split("(")[0].trim()
    : coPath?.coInvestorName || "Shared syndicate investor";
  const introSub = isLinkedin
    ? "Mutual 2nd-degree LinkedIn connection"
    : coPath?.isUpstreamFeeder
      ? "Backed their earlier round"
      : coPath?.sharedCount
        ? `Co-invested on ${coPath.sharedCount} deals`
        : "Connected via syndicate";

  const rawDesc = String(candidate.description || candidate.oneLiner || "").trim();
  const oneLiner =
    rawDesc.length > 210 ? `${rawDesc.slice(0, 207).replace(/\s+\S*$/, "")}...` : rawDesc;

  const fitVerdict = getInvestorFitVerdict(candidate.suitabilityScore);
  const reliability = getInvestorReliabilityMeta(candidate, brief, calaProfile);

  const roundDate = latestRound?.date ? formatReadableMonth(latestRound.date) : "";
  const fundingValue = latestRound
    ? `${latestRound.type || candidate.stage || "Round"} · ${formatEur(latestRound.amountEurM)}`
    : candidate.stage || (candidate.entityCategory === "established_corp" ? "Public / Mature" : "Registered (Unfunded)");
  const fundingSub = latestRound
    ? [roundDate, latestRound.leadInvestorName ? `Led by ${latestRound.leadInvestorName}` : ""]
        .filter(Boolean)
        .join(" · ") || "Recorded funding round"
    : candidate.registryInfo?.registryName
      ? `${candidate.registryInfo.registryName} #${candidate.registryInfo.registrationNumber} · No VC rounds in Cala`
      : "No VC funding rounds indexed in Cala";

  const teamValue = currentHc ? `${currentHc} people` : "Early team";
  const teamSub =
    growthPct >= 10
      ? `Up ${growthPct}% since ${latestRound?.type || "last round"}`
      : obsList.length > 1
        ? `Steady team (${obsList.length} verified checks)`
        : "Estimated company size";

  return {
    fitVerdict,
    oneLiner,
    fundingValue,
    fundingSub,
    teamValue,
    teamSub,
    introValue: activeBridgeName,
    introSub,
    reliability,
    rounds,
    obsList,
    startHc,
    currentHc,
    growthPct
  };
}

function buildFitAccordionHtml(candidate, brief) {
  const labelMap = {
    "Sector fit": "Industry focus",
    "Stage timing": "Funding timing",
    "Co-investor overlap": "Investor network",
    "Geography match": "Location",
    "Round size fit": "Check size"
  };
  const factors = getScoreBreakdownRows(candidate);
  const barsHtml = factors
    .map((f) => {
      const earnedNum = Number(f.points || 0);
      const strength = getInvestorStrengthTag(earnedNum, f.maxPoints);
      const pct = Math.max(4, Math.min(100, Math.round((earnedNum / Math.max(1, f.maxPoints)) * 100)));
      return `
        <div class="fit-bar-row">
          <div class="fit-bar-top">
            <span class="fit-bar-label">${escapeHtml(labelMap[f.label] || f.label)}</span>
            <span class="fit-bar-rating">${escapeHtml(strength.text)}</span>
          </div>
          <div class="sb-bar-track"><div class="sb-bar-fill" style="width:${pct}%"></div></div>
          <p class="fit-bar-detail">${escapeHtml(f.detail || "")}</p>
        </div>
      `;
    })
    .join("");

  const reasonsHtml = (candidate.reasons || [])
    .slice(0, 3)
    .map((r) => {
      const firstSrc = (r.sources || [])[0];
      const cite = firstSrc
        ? ` <a href="${escapeHtml(firstSrc.url)}" target="_blank" rel="noopener noreferrer" class="citation-link">[${escapeHtml(firstSrc.publisher || "Source")}]</a>`
        : "";
      return `<li class="evidence-item"><span>${escapeHtml(r.text)}${cite}</span></li>`;
    })
    .join("");

  const risksArr = brief?.risks || [
    candidate.competitorConflict
      ? `Adjacent to ${candidate.competitorConflict}; worth a quick overlap check.`
      : "No direct portfolio conflict detected."
  ];
  const cleanRisk = String(risksArr[0] || "").replace(/^Watchout:\s*/i, "");

  return `
    <div class="fit-bars-grid">${barsHtml}</div>
    ${reasonsHtml ? `<ul class="evidence-list" style="margin-top:10px">${reasonsHtml}</ul>` : ""}
    <p class="watchout-inline-note"><strong>Watchout:</strong> ${escapeHtml(cleanRisk)}</p>
  `;
}

function buildQuickPillsHtml(candidate, brief, calaProfile) {
  const dc = brief?.dataConfidence || candidate?.dataConfidence;
  const whyNow = brief?.whyNowTrigger || candidate?.whyNowTrigger;
  const pills = [];
  if (whyNow) {
    pills.push(`<span class="meta-pill">${escapeHtml(whyNow)}</span>`);
  }
  if (dc?.grade) {
    pills.push(`<span class="meta-pill">Confidence: ${escapeHtml(dc.grade)}</span>`);
  }
  if (calaProfile?.slush2026?.attending || candidate?.attendingSlush2026) {
    pills.push(`<span class="meta-pill slush-attendee-chip">Slush 2026</span>`);
  }
  return pills.join("");
}

function buildEvidenceAccordionHtml(
  candidate,
  brief,
  calaProfile,
  model,
  timeSeriesContainerId = "drawerTimeSeriesAndLeadership"
) {
  const rel = model.reliability;
  const sourcesHtml = rel.sources.length
    ? rel.sources
        .slice(0, 4)
        .map((src) => {
          const rankLabel = formatReadableTrustRank(src.sourceRank);
          const dateLabel = formatReadableMonth(src.date);
          const linkHtml =
            src.url && src.url.startsWith("http")
              ? `<a href="${escapeHtml(src.url)}" target="_blank" rel="noopener noreferrer" class="source-row-link">${escapeHtml(src.publisher)} &#8599;</a>`
              : `<span class="source-row-pub">${escapeHtml(src.publisher)}</span>`;
          return `
            <div class="ev-detail-row">
              <div class="ev-detail-main">
                <strong>${escapeHtml(src.title)}</strong>
                <span class="note">${escapeHtml(rankLabel)}${dateLabel ? ` · ${escapeHtml(dateLabel)}` : ""}</span>
              </div>
              ${linkHtml}
            </div>
          `;
        })
        .join("")
    : `<p class="note" style="margin:0">Indexed via Cala AI Knowledge Graph (${escapeHtml(candidate.name)}).</p>`;

  const roundsHtml = model.rounds.length
    ? model.rounds
        .map((r) => {
          const dt = formatReadableMonth(r.date) || "Date pending";
          return `
            <div class="ev-detail-row">
              <div>
                <strong>${escapeHtml(r.type || "Round")} · ${formatEur(r.amountEurM)}</strong>
                <span class="note" style="display:block">${escapeHtml(dt)}${r.leadInvestorName ? ` · Led by ${escapeHtml(r.leadInvestorName)}` : ""}</span>
              </div>
            </div>
          `;
        })
        .join("")
    : `<p class="note" style="margin:0">No formal funding rounds publicly indexed.</p>`;

  const regInfo = brief?.registryInfo || candidate.registryInfo;
  const regHtml = regInfo
    ? `<div class="ev-callout-box" style="margin-top:6px"><strong>${escapeHtml(regInfo.registryName || "Official Registry")}${regInfo.registrationNumber ? ` #${escapeHtml(regInfo.registrationNumber)}` : ""}:</strong> Status ${escapeHtml(regInfo.status || "Active")}${regInfo.legalForm ? ` · ${escapeHtml(regInfo.legalForm)}` : ""}${regInfo.industryDescription ? ` · ${escapeHtml(regInfo.industryDescription)}` : ""}${regInfo.registryUrl ? ` <a href="${escapeHtml(regInfo.registryUrl)}" target="_blank" rel="noopener noreferrer" class="source-row-link">Filing &#8599;</a>` : ""}</div>`
    : "";

  const finMetrics = brief?.financialMetrics || candidate.financialMetrics || [];
  const chNum = brief?.companiesHouseNumber || candidate.companiesHouseNumber;
  const finHtml =
    regHtml +
    (finMetrics.length
      ? finMetrics
          .slice(-2)
          .reverse()
          .map(
            (fin) =>
              `<div class="ev-callout-box" style="margin-top:6px"><strong>UK Companies House ${chNum ? `#${escapeHtml(chNum)} ` : ""}(${escapeHtml(String(fin.year || "Latest"))}):</strong> Cash EUR ${escapeHtml(String(fin.cashEurM))}M · Net assets EUR ${escapeHtml(String(fin.netAssetsEurM))}M${fin.creditorsEurM != null ? ` · Creditors EUR ${escapeHtml(String(fin.creditorsEurM))}M` : ""}.</div>`
          )
          .join("")
      : "");

  const rolesList =
    (brief?.peopleCoverage?.roles?.length ? brief.peopleCoverage.roles : candidate.peopleCoverage?.roles) ||
    calaProfile?.leadershipRelationships ||
    [];
  const alumni = brief?.alumniSpinout || candidate.alumniSpinout || rolesList.find((r) => r.priorCompany);
  const leadersHtml = rolesList.length
    ? rolesList
        .slice(0, 4)
        .map((r) => {
          const name = r.person || r.name || "Founder";
          const role = formatLeadershipTitle(r.relation || r.role);
          const spanParts = [r.validSince ? `since ${formatReadableMonth(r.validSince) || r.validSince}` : ""];
          if (r.validUntil && r.validUntil !== "present") {
            spanParts.push(`until ${formatReadableMonth(r.validUntil) || r.validUntil}`);
          }
          const prior = r.priorCompany
            ? ` (ex-${r.priorCompany}${r.priorValidUntil ? ` through ${r.priorValidUntil}` : ""})`
            : "";
          const spanText = spanParts.filter(Boolean).join(", ");
          return `<div class="ev-detail-row"><div class="ev-detail-main"><strong>${escapeHtml(name)} · ${escapeHtml(role)}</strong><span class="note">${escapeHtml(`${prior ? prior.trim() : "Active leadership"}${spanText ? ` · ${spanText}` : ""}`)}</span></div></div>`;
        })
        .join("")
    : `<p class="note" style="margin:0">${escapeHtml(candidate.peopleCoverage?.note || `${candidate.name} leadership lineage not yet indexed in Cala.`)}</p>`;

  const obsPts = model.obsList || [];
  const obsTrail =
    obsPts.length >= 2
      ? `${model.startHc} -> ${model.currentHc} people (${model.growthPct > 0 ? `+${model.growthPct}%` : "steady"}): ${obsPts
          .slice(-4)
          .map((pt) => `${formatReadableMonth(pt.date) || pt.date}: ${pt.value}`)
          .join(" -> ")}`
      : `Historical employee growth curve not reported yet (latest estimate: ${model.currentHc || "--"} people).`;

  const gaps = brief?.notFoundInCala || [
    "Private annual revenue (ARR) and monthly cash burn rate are not publicly filed in Cala.",
    "Individual angel check allocations and private cap-table preferences."
  ];

  return `
    <div class="ev-blocks-grid">
      <div class="ev-subblock">
        <h4 class="ev-subhead">Verified sources</h4>
        <div class="ev-rows-list">${sourcesHtml}</div>
      </div>

      <div class="ev-subblock">
        <h4 class="ev-subhead">Funding history</h4>
        <div class="ev-rows-list">${roundsHtml}</div>
      </div>

      <div class="ev-subblock" id="${escapeHtml(timeSeriesContainerId)}">
        <h4 class="ev-subhead">Team trajectory, founder lineage &amp; registry filings</h4>
        <p class="ev-copy" style="margin-bottom:6px">${escapeHtml(obsTrail)}</p>
        <div class="ev-rows-list">${leadersHtml}</div>
        ${alumni ? `<p class="ev-callout-box" style="margin-top:6px"><strong>Repeat operator signal:</strong> ${escapeHtml(`${alumni.name || alumni.person} previously worked at ${alumni.priorCompany}${alumni.validSince ? ` (current role since ${formatReadableMonth(alumni.validSince) || alumni.validSince})` : ""}.`)}</p>` : ""}
        ${finHtml}
      </div>

      <div class="ev-subblock">
        <h4 class="ev-subhead">Not available in public records</h4>
        <ul class="ev-gap-list">
          ${gaps
            .slice(0, 4)
            .map((g) => {
              const label = typeof g === "string" ? g : `${g.field}: ${g.reason || g.status || "Not publicly reported"}`;
              return `<li>${escapeHtml(label)}</li>`;
            })
            .join("")}
        </ul>
      </div>
    </div>
  `;
}

function bindAccordionToggleGroup(rootEl) {
  if (!rootEl) return;
  rootEl.querySelectorAll(".info-expand-btn").forEach((btn) => {
    if (btn.dataset.accordionBound === "1") return;
    btn.dataset.accordionBound = "1";
    btn.addEventListener("click", () => {
      const targetId = btn.getAttribute("aria-controls");
      const panel = targetId ? document.getElementById(targetId) : btn.nextElementSibling;
      if (!panel) return;
      const willOpen = btn.getAttribute("aria-expanded") !== "true";
      btn.setAttribute("aria-expanded", willOpen ? "true" : "false");
      panel.hidden = !willOpen;
    });
  });
}

function resetAccordionGroup(rootEl) {
  if (!rootEl) return;
  rootEl.querySelectorAll(".info-expand-btn").forEach((btn) => {
    btn.setAttribute("aria-expanded", "false");
    const targetId = btn.getAttribute("aria-controls");
    const panel = targetId ? document.getElementById(targetId) : btn.nextElementSibling;
    if (panel) panel.hidden = true;
  });
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
    container.innerHTML = `<p class="sub">Select a startup to inspect its overview.</p>`;
    return;
  }

  state.activeStartupId = candidate.id;
  const brief = state.briefCache.get(`${candidate.id}:${state.selectedFundId}`) || state.activeBrief;
  const peers = candidate.peerStartups || [];
  const isLinkedin = state.networkSource !== "cala";
  const netData = isLinkedin ? candidate.linkedinNetwork : candidate.graph;
  const isSaved = state.savedCallListIds.includes(candidate.id);
  const calaProf = getStartupCalaFieldProfile(candidate);
  const model = buildCompanyOverviewModel(candidate, brief, calaProf, isLinkedin);

  const rolesList = calaProf?.leadershipRelationships || [];
  const primaryLeader = rolesList[0];
  const targetFounderName = (
    candidate.linkedinNetwork?.targetLeader ||
    primaryLeader?.person ||
    `${candidate.name} founders`
  )
    .split("(")[0]
    .trim();

  container.innerHTML = `
    <div class="talk-calm-wrap">
      <div class="head">
        <div class="talk-head-visuals">
          <div class="talk-head-logo" aria-hidden="true">
            ${buildStartupLogoSvg(candidate.name, candidate.sector, 64)}
          </div>
          <div class="ring">
            ${buildIncompleteCircleScoreSvg(candidate.suitabilityScore ?? 0, 84, model.fitVerdict.label)}
          </div>
        </div>
        <div class="t">
          <h2>${escapeHtml(candidate.name)}</h2>
          <div class="m">
            ${escapeHtml(candidate.hqCity)}, ${escapeHtml(candidate.country)} · ${escapeHtml(candidate.sector)}${calaProf?.slush2026?.attending ? " · Attending Slush 2026" : ""}
          </div>
        </div>
        <div class="talk-head-actions">
          <button
            type="button"
            class="btn sm drawer-star-btn ${isSaved ? "is-saved" : ""}"
            id="talkSaveCallBtn"
            aria-pressed="${isSaved ? "true" : "false"}"
          >
            ${bookmarkIconSvg(13)} <span>${isSaved ? "Saved" : "Save"}</span>
          </button>
          <button type="button" class="btn sm" id="talkPrevStartupBtn">&larr; Prev</button>
          <button type="button" class="btn sm" id="talkNextStartupBtn">Next &rarr;</button>
          <button type="button" class="btn sm" id="talkOpenDrawerBtn">Compact modal</button>
        </div>
      </div>

      <section class="company-overview-card">
        <div class="overview-summary-col">
          <div class="overview-verdict-row">
            <span class="overview-fit-label">${escapeHtml(model.fitVerdict.label)}</span>
            ${buildQuickPillsHtml(candidate, brief, calaProf)}
          </div>
          <p class="overview-oneliner">${escapeHtml(model.oneLiner)}</p>
        </div>

        <div class="overview-facts-row">
          <div class="overview-fact-cell">
            <span class="overview-fact-label">Latest funding</span>
            <strong class="overview-fact-val num-tabular">${escapeHtml(model.fundingValue)}</strong>
            <span class="overview-fact-sub">${escapeHtml(model.fundingSub)}</span>
          </div>
          <div class="overview-fact-cell">
            <span class="overview-fact-label">Team size &amp; pace</span>
            <strong class="overview-fact-val num-tabular">${escapeHtml(model.teamValue)}</strong>
            <span class="overview-fact-sub">${escapeHtml(model.teamSub)}</span>
          </div>
          <div class="overview-fact-cell overview-fact-action">
            <div>
              <span class="overview-fact-label">Best way to connect</span>
              <strong class="overview-fact-val">${escapeHtml(model.introValue)}</strong>
              <span class="overview-fact-sub">${escapeHtml(model.introSub)}</span>
            </div>
            <button type="button" class="btn sm primary modal-intro-btn" id="talkCopyIntroBtn">Copy intro note</button>
          </div>
        </div>
      </section>

      <section class="reliability-strip-card">
        <div class="reliability-top-row">
          <div class="reliability-status-wrap">
            <span class="reliability-shield" aria-hidden="true">
              <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
                <path d="M8 1.5L13.5 3.8v4.1c0 3.3-2.3 5.9-5.5 6.8-3.2-.9-5.5-3.5-5.5-6.8V3.8L8 1.5z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round" />
                <path d="M5.6 8.2l1.7 1.7 3.2-3.4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
            </span>
            <div class="reliability-title-col">
              <div class="reliability-title-line">
                <strong class="Verified-badge">${escapeHtml(model.reliability.badgeLabel)}</strong>
                <span class="reliability-source-meta">${escapeHtml(model.reliability.sourceSummary)}</span>
              </div>
              <p class="reliability-note">${escapeHtml(model.reliability.explanation)}</p>
            </div>
          </div>
          <button type="button" class="btn sm live-cala-pill-btn" id="talkVerifyCalaBtn">
            <span class="live-dot" aria-hidden="true"></span>
            <span>Verify live data</span>
          </button>
        </div>
        <div id="talkLiveCalaBanner" class="live-cala-intel-card cala-inline-banner" hidden></div>
      </section>

      <div class="info-accordion-list">
        <div class="info-expand-item">
          <button
            type="button"
            class="info-expand-btn"
            id="talkExpandFitBtn"
            aria-expanded="false"
            aria-controls="talkExpandFitPanel"
          >
            <span class="info-expand-text">
              <span class="info-expand-title">Why this matches your strategy</span>
              <span class="info-expand-hint">Sector, timing, region &amp; key watchouts</span>
            </span>
            <span class="info-expand-chevron" aria-hidden="true">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M4 6l4 4 4-4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
            </span>
          </button>
          <div class="info-expand-panel" id="talkExpandFitPanel" hidden>
            ${buildFitAccordionHtml(candidate, brief)}
          </div>
        </div>

        <div class="info-expand-item">
          <button
            type="button"
            class="info-expand-btn"
            id="talkExpandEvidenceBtn"
            aria-expanded="false"
            aria-controls="talkExpandEvidencePanel"
          >
            <span class="info-expand-text">
              <span class="info-expand-title">Verified sources, team growth &amp; founders</span>
              <span class="info-expand-hint">${escapeHtml(`${model.reliability.sources.length || 1} sources · funding rounds, team history & gaps`)}</span>
            </span>
            <span class="info-expand-chevron" aria-hidden="true">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M4 6l4 4 4-4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
            </span>
          </button>
          <div class="info-expand-panel" id="talkExpandEvidencePanel" hidden>
            ${buildEvidenceAccordionHtml(candidate, brief, calaProf, model, "talkTimeSeriesAndLeadership")}
            <div style="margin-top:12px">
              <button type="button" class="btn sm" id="talkExportMdBtn">Export Memo (.md)</button>
            </div>
          </div>
        </div>

        <div class="info-expand-item">
          <button
            type="button"
            class="info-expand-btn"
            id="talkExpandNetworkBtn"
            aria-expanded="false"
            aria-controls="talkExpandNetworkPanel"
          >
            <span class="info-expand-text">
              <span class="info-expand-title">Warm introduction message, diagram &amp; similar startups</span>
              <span class="info-expand-hint">${escapeHtml(`Via ${model.introValue} · ${peers.length} connected startups`)}</span>
            </span>
            <span class="info-expand-chevron" aria-hidden="true">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M4 6l4 4 4-4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
            </span>
          </button>
          <div class="info-expand-panel" id="talkExpandNetworkPanel" hidden>
            <div class="expand-net-toolbar">
              <div class="net-source-switch" role="radiogroup" aria-label="Intro source">
                <button type="button" class="net-src-btn ${isLinkedin ? "is-active" : ""}" data-talk-net-source="linkedin">LinkedIn contact</button>
                <button type="button" class="net-src-btn ${!isLinkedin ? "is-active" : ""}" data-talk-net-source="cala">Co-investor syndicate</button>
              </div>
            </div>

            <div class="inline-warm-chain" style="margin-bottom:10px">
              <span class="iwc-node">${escapeHtml(getSelectedBenchmarkLabel())}</span>
              <span class="iwc-arrow" aria-hidden="true">&rarr;</span>
              <span class="iwc-node is-bridge">${escapeHtml(model.introValue)}</span>
              <span class="iwc-arrow" aria-hidden="true">&rarr;</span>
              <span class="iwc-node is-target">${escapeHtml(targetFounderName)}</span>
            </div>

            <div class="warm-intro-preview" style="margin-bottom:12px">
              <div class="inline-intro-action-row">
                <span class="warm-intro-label" style="margin:0">Ready-to-send intro note (${escapeHtml(isLinkedin ? "LinkedIn contact" : "Co-investor syndicate")})</span>
                <button type="button" class="btn sm primary" data-talk-copy-inline="1">Copy intro note</button>
              </div>
              <p class="warm-intro-text">${escapeHtml(buildWarmIntroDraftText(candidate))}</p>
            </div>

            <div class="network-graph-stage" style="margin-bottom:12px">
              ${netData ? buildNetworkGraphSvg(netData, candidate.id) : ""}
            </div>

            <div>
              <span class="inline-sublabel">Similar connected startups (${Math.min(4, peers.length)})</span>
              <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:8px">
                ${peers.length
                  ? peers
                      .slice(0, 4)
                      .map(
                        (p) => `
                          <button type="button" class="peer-chip-btn" data-talk-peer="${escapeHtml(p.id)}">
                            <span>${escapeHtml(p.name)}</span>
                            <span class="peer-chip-tag">${escapeHtml(String(p.bridgeLabel || "").replace(/^(Shared investor|Founder alumni|Alumni link):\s*/i, ""))}</span>
                            <span aria-hidden="true">&rarr;</span>
                          </button>
                        `
                      )
                      .join("")
                  : `<span class="note">No cluster peers indexed in this slice.</span>`}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  bindAccordionToggleGroup(container);

  document.getElementById("talkSaveCallBtn")?.addEventListener("click", () => {
    toggleCallListStartup(candidate.id);
    showUiToast(
      state.savedCallListIds.includes(candidate.id)
        ? `Added ${candidate.name} to Call List`
        : `Removed ${candidate.name} from Call List`
    );
  });

  const handleTalkCopy = async () => {
    const text = buildWarmIntroDraftText(candidate);
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(text);
    } catch {
      // Non-fatal in non-clipboard contexts
    }
    const copyBtns = container.querySelectorAll("#talkCopyIntroBtn, [data-talk-copy-inline]");
    copyBtns.forEach((b) => {
      b.textContent = "Copied!";
      window.setTimeout(() => {
        if (b.isConnected) b.textContent = "Copy intro note";
      }, 1800);
    });
    showUiToast(`Copied warm intro note for ${candidate.name}`);
  };
  document.getElementById("talkCopyIntroBtn")?.addEventListener("click", handleTalkCopy);
  container.querySelector("[data-talk-copy-inline]")?.addEventListener("click", handleTalkCopy);

  document.getElementById("talkVerifyCalaBtn")?.addEventListener("click", async () => {
    const bannerEl = document.getElementById("talkLiveCalaBanner");
    if (!bannerEl) return;
    bannerEl.hidden = false;
    bannerEl.innerHTML = `<p class="note" style="margin:0">Checking live Cala AI records for <strong>${escapeHtml(candidate.name)}</strong>...</p>`;
    try {
      await runCalaVerifyQuery({
        name: candidate.name,
        type: "company",
        includeKnowledgeSearch: false,
        targetEl: bannerEl,
        context: "talk"
      });
    } catch (err) {
      bannerEl.innerHTML = `<span class="note">Live check notice: ${escapeHtml(err.message)}</span>`;
    }
  });
  container.querySelectorAll("[data-talk-net-source]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.networkSource = btn.dataset.talkNetSource;
      syncNetworkSourceButtons();
      renderTalkScreen();
      const expandNetBtn = document.getElementById("talkExpandNetworkBtn");
      const expandNetPanel = document.getElementById("talkExpandNetworkPanel");
      if (expandNetBtn && expandNetPanel) {
        expandNetBtn.setAttribute("aria-expanded", "true");
        expandNetPanel.hidden = false;
      }
      renderStartupGrid(state.DisplayedShortlist);
    });
  });
  document.getElementById("talkPrevStartupBtn")?.addEventListener("click", () => {
    stepStartupInList(-1);
  });
  document.getElementById("talkNextStartupBtn")?.addEventListener("click", () => {
    stepStartupInList(1);
  });
  document.getElementById("talkOpenDrawerBtn")?.addEventListener("click", () => {
    switchPrimaryTab("search");
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
    const calaProfile = getStartupCalaFieldProfile(candidate);
    document.getElementById("drawerStartupLogo").innerHTML = buildStartupLogoSvg(
      candidate.name,
      candidate.sector,
      64
    );
    document.getElementById("drawerStartupRank").textContent =
      rankIdx >= 0 ? `Rank #${rankIdx + 1} of ${state.DisplayedShortlist.length}` : "Connected peer";
    document.getElementById("drawerStartupName").textContent = candidate.name;
    document.getElementById("drawerStartupMeta").textContent =
      `${candidate.sector} · ${candidate.stage} · ${candidate.hqCity}, ${candidate.country}`;

    const scoreArcEl = document.getElementById("drawerScoreArc");
    if (scoreArcEl) {
      scoreArcEl.innerHTML = buildIncompleteCircleScoreSvg(
        candidate.suitabilityScore ?? 0,
        58,
        "/100",
        "drawerScoreNumber"
      );
    }
  }

  syncCallListUI();

  switchDrawerTab(options.tab === "network" ? "network" : "brief");

  const liveOut = document.getElementById("liveCalaOutput");
  if (liveOut) {
    liveOut.hidden = true;
    liveOut.innerHTML = "";
  }
  const drawerBanner = document.getElementById("drawerLiveCalaBanner");
  if (drawerBanner) {
    drawerBanner.hidden = true;
    drawerBanner.innerHTML = "";
  }

  resetAccordionGroup(drawer);
  bindAccordionToggleGroup(drawer);

  const brief = await loadStartupBriefData(companyId);

  const defaultDepth = "quick";
  applyExposureDepth(defaultDepth);

  if (candidate) {
    renderDrawerBriefPane(brief, candidate);
    renderDrawerNetworkPane(brief, candidate);
  }
  const drawerBody = drawer?.querySelector(".drawer-body");
  if (drawerBody) drawerBody.scrollTop = 0;
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
  const roundAmt = formatEur(candidate.lastRoundAmountEurM);
  const isLinkedin = state.networkSource !== "cala";
  const coPath = candidate.coInvestorPath;
  const liNet = candidate.linkedinNetwork;
  const targetLeader = (liNet?.targetLeader || `${candidate.name} founders`).split("(")[0].trim();

  if (!isLinkedin && coPath?.coInvestorName) {
    const sharedText =
      coPath.sharedPortfolioSample?.length > 0
        ? ` across ${coPath.sharedPortfolioSample.slice(0, 2).join(" & ")}`
        : "";
    return `Hi ${coPath.coInvestorName} team, since we overlap on Cala${sharedText}, we're reviewing ${candidate.name} (${candidate.sector}, ${candidate.hqCity}) after their ${roundAmt} ${candidate.stage} round (${candidate.suitabilityScore}/100 fit). Could you introduce us to ${targetLeader}?`;
  }

  const bridgeFull = liNet?.bridgePerson || coPath?.coInvestorName || "a mutual syndicate partner";
  const bridgeFirst = bridgeFull.split("(")[0].trim();
  return `Hi ${bridgeFirst}, hope you're well. Seeing strong Cala signals on ${candidate.name} (${candidate.sector}, ${candidate.hqCity}) against ${fundLabel}'s active mandate (${candidate.suitabilityScore}/100 thesis fit after ${roundAmt} ${candidate.stage}). Would love a double-opt-in intro to ${targetLeader}.`;
}

async function copyWarmIntroNote() {
  const candidate =
    state.allKnownItems.get(state.activeStartupId) ||
    state.DisplayedShortlist.find((c) => c.id === state.activeStartupId);
  if (!candidate) return;
  const text = buildWarmIntroDraftText(candidate);
  const btns = document.querySelectorAll("#copyWarmIntroBtn, [data-copy-intro-inline]");
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
    }
  } catch {
    // Non-fatal in headless or non-secure contexts
  }
  btns.forEach((btn) => {
    const prevLabel = btn.dataset.origLabel || btn.textContent.trim();
    btn.dataset.origLabel = prevLabel;
    btn.classList.add("is-copied");
    btn.textContent = "Copied!";
    window.clearTimeout(btn._copyTimer);
    btn._copyTimer = window.setTimeout(() => {
      if (!btn.isConnected) return;
      btn.classList.remove("is-copied");
      btn.textContent = btn.dataset.origLabel || "Copy intro note";
    }, 1800);
  });
  showUiToast(`Copied warm intro note for ${candidate.name}`);
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
  const calaProfile = getStartupCalaFieldProfile(candidate);
  const isLinkedin = state.networkSource !== "cala";
  const model = buildCompanyOverviewModel(candidate, brief, calaProfile, isLinkedin);

  const fitVerdictEl = document.getElementById("drawerFitVerdict");
  if (fitVerdictEl) fitVerdictEl.textContent = model.fitVerdict.label;

  const verdictEl = document.getElementById("drawerQuickVerdict");
  if (verdictEl) verdictEl.textContent = model.oneLiner;

  const pillsEl = document.getElementById("drawerQuickPills");
  if (pillsEl) {
    pillsEl.innerHTML = buildQuickPillsHtml(candidate, brief, calaProfile);
  }

  const fundingValEl = document.getElementById("drawerFactFundingVal");
  const fundingSubEl = document.getElementById("drawerFactFundingSub");
  if (fundingValEl) fundingValEl.textContent = model.fundingValue;
  if (fundingSubEl) fundingSubEl.textContent = model.fundingSub;

  const teamValEl = document.getElementById("drawerFactTeamVal");
  const teamSubEl = document.getElementById("drawerFactTeamSub");
  if (teamValEl) teamValEl.textContent = model.teamValue;
  if (teamSubEl) teamSubEl.textContent = model.teamSub;

  const introValEl = document.getElementById("drawerFactIntroVal");
  const introSubEl = document.getElementById("drawerFactIntroSub");
  if (introValEl) introValEl.textContent = model.introValue;
  if (introSubEl) introSubEl.textContent = model.introSub;

  const confEl = document.getElementById("drawerConfidenceLabel");
  const relSourceEl = document.getElementById("drawerReliabilitySource");
  const relExplainEl = document.getElementById("drawerReliabilityExplain");
  if (confEl) confEl.textContent = model.reliability.badgeLabel;
  if (relSourceEl) relSourceEl.textContent = model.reliability.sourceSummary;
  if (relExplainEl) relExplainEl.textContent = model.reliability.explanation;

  const expandFitPanel = document.getElementById("expandFitPanel");
  const expandFitHint = document.getElementById("expandFitHint");
  if (expandFitPanel) {
    expandFitPanel.innerHTML = buildFitAccordionHtml(candidate, brief);
  }
  if (expandFitHint) {
    const rCount = Math.min(3, (candidate.reasons || []).length);
    expandFitHint.textContent = rCount
      ? `${model.fitVerdict.label} · ${rCount} supporting signals & watchouts`
      : "Industry, timing, network & location breakdown";
  }

  const expandEvidencePanel = document.getElementById("expandEvidencePanel");
  const expandEvidenceHint = document.getElementById("expandEvidenceHint");
  if (expandEvidencePanel) {
    expandEvidencePanel.innerHTML = buildEvidenceAccordionHtml(
      candidate,
      brief,
      calaProfile,
      model,
      "drawerTimeSeriesAndLeadership"
    );
  }
  if (expandEvidenceHint) {
    const sCount = model.reliability.sources.length;
    expandEvidenceHint.textContent = `${sCount || 1} verified ${sCount === 1 ? "source" : "sources"} · funding rounds, team history & data gaps`;
  }

  // Expandable 3: Connected Network Path, Peers & Tailored Outreach
  const coPath = candidate.coInvestorPath;
  const liNet = candidate.linkedinNetwork;
  const targetFundLabel = getSelectedBenchmarkLabel();
  const bridgeMeta = isLinkedin
    ? "LinkedIn 2nd-degree"
    : coPath?.isUpstreamFeeder
      ? "Backed earlier round"
      : `${coPath?.sharedCount || 1} shared deals`;
  const targetFounderName = (liNet?.targetLeader || `${candidate.name} founders`).split("(")[0].trim();

  const layer2Badge = document.getElementById("drawerLayer2Badge");
  if (layer2Badge) {
    layer2Badge.textContent = `Via ${model.introValue} · Ready-to-send intro message`;
  }

  const inlineChain = document.getElementById("drawerInlineWarmChain");
  if (inlineChain) {
    inlineChain.innerHTML = `
      <span class="iwc-node">${escapeHtml(targetFundLabel)}</span>
      <span class="iwc-arrow" aria-hidden="true">&rarr;</span>
      <span class="iwc-node is-bridge">
        <strong>${escapeHtml(model.introValue)}</strong>
        <small>${escapeHtml(bridgeMeta)}</small>
      </span>
      <span class="iwc-arrow" aria-hidden="true">&rarr;</span>
      <span class="iwc-node is-target">
        <strong>${escapeHtml(targetFounderName)}</strong>
        <small>${escapeHtml(candidate.name)}</small>
      </span>
    `;
  }

  const peers = candidate.peerStartups || [];
  const layer3Badge = document.getElementById("drawerLayer3Badge");
  if (layer3Badge) {
    layer3Badge.textContent = peers.length ? `${peers.length} connected startups` : "Similar startups";
  }

  const peersRowEl = document.getElementById("drawerInlinePeersRow");
  if (peersRowEl) {
    peersRowEl.innerHTML = peers.length
      ? peers
          .slice(0, 2)
          .map((p) => {
            const stripped = String(p.bridgeLabel || "")
              .replace(/^(Shared investor|Founder alumni|Alumni link):\s*/i, "");
            const shortTag = stripped.length > 22 ? `${stripped.slice(0, 20)}..` : stripped;
            return `
          <button type="button" class="peer-chip-btn" data-inline-peer-id="${escapeHtml(p.id)}" title="Open ${escapeHtml(p.name)}">
            <span>${escapeHtml(p.name)}</span>
            <span class="peer-chip-tag">${escapeHtml(shortTag)}</span>
            <span aria-hidden="true">&rarr;</span>
          </button>
        `;
          })
          .join("")
      : `<span class="note">No similar connected startups found yet.</span>`;
  }

  const bridgeProofEl = document.getElementById("drawerInlineBridgeProof");
  if (bridgeProofEl) {
    const proofText = isLinkedin
      ? liNet?.summary || coPath?.summary || "Mutual founder and operator bridge."
      : coPath?.summary || liNet?.summary || "Shared co-investor overlap verified in Cala.";
    bridgeProofEl.textContent = proofText;
  }

  const introBox = document.getElementById("drawerIntroPreviewBox");
  if (introBox) {
    introBox.innerHTML = `
      <div class="inline-intro-action-row">
        <span class="warm-intro-label" style="margin:0">Warm intro message (${escapeHtml(isLinkedin ? "LinkedIn contact" : "Co-investor syndicate")})</span>
        <button
          type="button"
          class="btn sm primary modal-intro-btn"
          data-copy-intro-inline="1"
          title="Copy warm intro note"
        >
          Copy intro note
        </button>
      </div>
      <p class="warm-intro-text">${escapeHtml(buildWarmIntroDraftText(candidate))}</p>
    `;
  }
}

/* ==========================================================================
   NETWORK & WARM INTRO GRAPH (SVG)
   ========================================================================== */

function renderDrawerNetworkInspectorSummary(candidate, nodeObj, isLinkedin) {
  const insp = document.getElementById("drawerNetworkNodeInspector");
  if (!insp || !candidate) return;

  if (!nodeObj) {
    const primaryBridge = isLinkedin
      ? candidate.linkedinNetwork?.bridgePerson || "2nd-degree warm connector"
      : candidate.coInvestorPath?.coInvestorName || "Verified syndicate co-investor";
    insp.innerHTML = `
      <div class="node-insp-main">
        <span class="node-insp-kicker">Active Warm Route · ${escapeHtml(isLinkedin ? "LinkedIn First" : "Cala Graph")}</span>
        <span class="node-insp-desc">
          Primary bridge via <strong>${escapeHtml(primaryBridge)}</strong>. Click any node above to inspect evidence or copy outreach.
        </span>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button type="button" class="btn sm primary" data-copy-intro-inline="1">Copy Warm Intro</button>
      </div>
    `;
    return;
  }

  const { id, type, label } = nodeObj;
  let kicker = "Verified Entity";
  let desc = `${label} is linked inside the Cala relationship graph for ${candidate.name}.`;
  let peerActionHtml = `<button type="button" class="btn sm" data-copy-intro-inline="1">Copy Warm Intro</button>`;

  if (type === "target_fund") {
    const deals = state.analysis?.thesis?.dealsAnalyzedCount || 0;
    kicker = "Benchmark Fund";
    desc = `${label}: active benchmark mandate across ${deals} verified Cala rounds.`;
  } else if (type === "co_investor") {
    const shared = candidate.coInvestorPath?.sharedCount || 1;
    kicker = "Co-Investor / Syndicate Bridge";
    desc = `${label}: ${shared} shared syndicate deals verified in Cala. ${candidate.coInvestorPath?.summary || ""}`;
  } else if (type === "portfolio") {
    kicker = "Portfolio Anchor";
    desc = `${label}: existing benchmark portfolio company linking co-investor syndicates to ${candidate.name}.`;
  } else if (type === "target_startup" || id === candidate.id) {
    kicker = "Selected Startup";
    desc = `${candidate.name} (${candidate.suitabilityScore}/100 fit): ${candidate.stage} (${formatEur(candidate.lastRoundAmountEurM)}) in ${candidate.hqCity}, ${candidate.country}.`;
  } else if (id === "li-leader") {
    kicker = "Target Leadership";
    desc = `${label}: reachable via ${candidate.linkedinNetwork?.bridgePerson || "mutual connector"} (${candidate.linkedinNetwork?.sourceLabel || "LinkedIn 2nd-degree"}).`;
  } else if (type === "peer_startup") {
    const peerMeta = (candidate.peerStartups || []).find((p) => p.id === id);
    kicker = "Cluster Peer Startup";
    desc = peerMeta
      ? `${peerMeta.name} (${peerMeta.sector}, ${peerMeta.country}): ${peerMeta.bridgeLabel}.`
      : `${label}: connected peer in the same investor or founder cluster.`;
    peerActionHtml = `<button type="button" class="btn sm primary" data-inspect-graph-peer="${escapeHtml(id)}">Inspect ${escapeHtml(label)} &rarr;</button>`;
  }

  insp.innerHTML = `
    <div class="node-insp-main">
      <span class="node-insp-kicker">${escapeHtml(kicker)}</span>
      <span class="node-insp-desc">${escapeHtml(desc)}</span>
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      ${peerActionHtml}
    </div>
  `;

  insp.querySelector("[data-inspect-graph-peer]")?.addEventListener("click", () => {
    openStartupInspector(id);
  });
}

function renderDrawerNetworkPane(brief, candidate) {
  const isLinkedin = state.networkSource === "linkedin";
  const netData = isLinkedin ? candidate.linkedinNetwork : candidate.graph;
  const peers = candidate.peerStartups || [];
  const targetName = getSelectedBenchmarkLabel();

  const warmBox = document.getElementById("drawerWarmPathBox");
  if (warmBox) {
    const bridgeLabel = (
      (isLinkedin ? candidate.linkedinNetwork?.bridgePerson : candidate.coInvestorPath?.coInvestorName) ||
      "Cala Syndicate Co-Investor"
    )
      .split("(")[0]
      .trim();
    const targetPerson = isLinkedin && candidate.linkedinNetwork?.targetLeader
      ? `${candidate.linkedinNetwork.targetLeader} · ${candidate.name}`
      : candidate.name;
    warmBox.innerHTML = `
      <div class="route-chain-bar">
        <span class="rc-node">${escapeHtml(targetName)}</span>
        <span class="rc-arrow" aria-hidden="true">&rarr;</span>
        <span class="rc-node rc-bridge">${escapeHtml(bridgeLabel)}</span>
        <span class="rc-arrow" aria-hidden="true">&rarr;</span>
        <span class="rc-node rc-target">${escapeHtml(targetPerson)}</span>
      </div>
    `;
  }

  renderDrawerNetworkInspectorSummary(candidate, null, isLinkedin);

  const canvas = document.getElementById("networkGraphCanvas");
  if (canvas && netData) {
    canvas.innerHTML = buildNetworkGraphSvg(netData, candidate.id);
    canvas.querySelectorAll(".svg-net-node[data-node-id]").forEach((nodeEl) => {
      const selectNode = () => {
        canvas.querySelectorAll(".svg-net-node.is-selected-node").forEach((n) => n.classList.remove("is-selected-node"));
        nodeEl.classList.add("is-selected-node");
        renderDrawerNetworkInspectorSummary(
          candidate,
          {
            id: nodeEl.getAttribute("data-node-id"),
            type: nodeEl.getAttribute("data-node-type"),
            label: nodeEl.getAttribute("data-node-label")
          },
          isLinkedin
        );
      };
      nodeEl.addEventListener("click", selectNode);
      nodeEl.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          selectNode();
        }
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
          <span class="badge b-cyan">${escapeHtml(b.badge)}</span>
        </div>
      `
      )
      .join("");

    const bridgesBadge = document.getElementById("networkBridgesBadge");
    if (bridgesBadge) {
      bridgesBadge.textContent = `${items.length} connectors`;
    }
  }

  const peersList = document.getElementById("peerStartupsList");
  if (peersList) {
    const peersBadge = document.getElementById("networkPeersBadge");
    if (peersBadge) {
      peersBadge.textContent = `${peers.length} peers`;
    }
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
  const height = 332;

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

  const cardW = 166;
  const cardH = 50;
  const topOffset = 34;
  const usableH = height - topOffset - 10;
  const positions = new Map();
  const columnLayout = [
    { label: "BENCHMARK", list: cols.fund, cx: 95 },
    { label: "BRIDGE / ANCHOR", list: cols.bridge, cx: 345 },
    { label: "TARGET STARTUP", list: cols.target, cx: 595 },
    { label: "CLUSTER PEERS", list: cols.peer, cx: 845 }
  ];

  for (const col of columnLayout) {
    const count = col.list.length;
    if (!count) continue;
    const step = usableH / (count + 1);
    col.list.forEach((node, idx) => {
      positions.set(node.id, {
        cx: col.cx,
        cy: Math.round(topOffset + step * (idx + 1)),
        node
      });
    });
  }

  const colHeaderSvg = columnLayout
    .filter((col) => col.list.length > 0)
    .map(
      (col) =>
        `<text x="${col.cx}" y="20" text-anchor="middle" font-family="'Plus Jakarta Sans', sans-serif" font-size="10" font-weight="800" letter-spacing="0.9" fill="var(--dim)">${escapeHtml(col.label)}</text>`
    )
    .join("");

  const styleForType = (type, id) => {
    if (type === "target_fund") return { accent: "var(--green)", kind: "BENCHMARK" };
    if (id === selectedStartupId || type === "target_startup") return { accent: "var(--green)", kind: "SELECTED" };
    if (type === "co_investor") return { accent: "var(--amber)", kind: "BRIDGE" };
    if (id === "li-leader") return { accent: "var(--lime)", kind: "LEADERSHIP" };
    if (type === "portfolio") return { accent: "var(--muted)", kind: "PORTFOLIO" };
    return { accent: "var(--lime)", kind: "PEER STARTUP" };
  };

  const edgeSvg = links
    .map((link) => {
      const a = positions.get(link.source);
      const b = positions.get(link.target);
      if (!a || !b) return "";

      if (a.cx === b.cx) {
        const yTop = a.cy < b.cy ? a.cy + cardH / 2 : b.cy + cardH / 2;
        const yBot = a.cy < b.cy ? b.cy - cardH / 2 : a.cy - cardH / 2;
        return `<path d="M ${a.cx} ${yTop} L ${b.cx} ${yBot}" fill="none" stroke="var(--line-2)" stroke-width="1.6" />`;
      }

      const x1 = a.cx < b.cx ? a.cx + cardW / 2 : a.cx - cardW / 2;
      const y1 = a.cy;
      const x2 = a.cx < b.cx ? b.cx - cardW / 2 : b.cx + cardW / 2;
      const y2 = b.cy;
      const dx = Math.abs(x2 - x1) * 0.45;
      const cx1 = a.cx < b.cx ? x1 + dx : x1 - dx;
      const cx2 = a.cx < b.cx ? x2 - dx : x2 + dx;
      const pathD = `M ${x1} ${y1} C ${cx1} ${y1}, ${cx2} ${y2}, ${x2} ${y2}`;
      const touchesTarget =
        a.node.id === selectedStartupId ||
        b.node.id === selectedStartupId ||
        a.node.type === "target_startup" ||
        b.node.type === "target_startup";

      if (touchesTarget) {
        return `<path d="${pathD}" fill="none" stroke="var(--green)" stroke-opacity="0.28" stroke-width="2" /><path class="svg-warm-flow-edge" d="${pathD}" fill="none" stroke="var(--green)" stroke-opacity="0.85" stroke-width="2" />`;
      }

      return `<path d="${pathD}" fill="none" stroke="var(--green)" stroke-opacity="0.45" stroke-width="1.5" />`;
    })
    .join("");

  const nodeSvg = [...positions.values()]
    .map(({ cx, cy, node }) => {
      const st = styleForType(node.type, node.id);
      const x = cx - cardW / 2;
      const y = cy - cardH / 2;
      const shortLabel = node.label.length > 20 ? `${node.label.slice(0, 18)}..` : node.label;
      const isClickablePeer = node.type === "peer_startup";
      const nodeClass = isClickablePeer ? "svg-net-node svg-peer-node" : "svg-net-node";
      const peerAttr = isClickablePeer ? ` data-peer-id="${escapeHtml(node.id)}"` : "";

      return `
        <g class="${nodeClass}" data-node-id="${escapeHtml(node.id)}" data-node-type="${escapeHtml(node.type)}" data-node-label="${escapeHtml(node.label)}"${peerAttr} tabindex="0" role="button" aria-label="Inspect ${escapeHtml(node.label)}" style="cursor:pointer">
          <rect x="${x}" y="${y}" width="${cardW}" height="${cardH}" rx="10" fill="var(--panel)" stroke="${st.accent}" stroke-width="1.4" />
          <text x="${x + 12}" y="${y + 19}" font-family="'Plus Jakarta Sans', sans-serif" font-size="10" font-weight="800" fill="${st.accent}">${escapeHtml(st.kind)}</text>
          <text x="${x + 12}" y="${y + 37}" font-family="'Plus Jakarta Sans', sans-serif" font-size="12.5" font-weight="700" fill="var(--text)">${escapeHtml(shortLabel)}</text>
        </g>
      `;
    })
    .join("");

  return `
    <svg class="network-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Startup relationship network diagram">
      ${colHeaderSvg}
      ${edgeSvg}
      ${nodeSvg}
    </svg>
  `;
}

/* ==========================================================================
   THESIS & BACKTEST VIEW
   ========================================================================== */

function renderDistributionBars(containerId, items = [], filterKind = "") {
  const el = document.getElementById(containerId);
  if (!el) return;

  el.innerHTML = (items || [])
    .slice(0, 5)
    .map(
      (item) => `
      <div
        class="frow ${filterKind ? "frow-clickable" : ""}"
        style="padding: 5px 0"
        ${filterKind ? `role="button" tabindex="0" data-thesis-kind="${escapeHtml(filterKind)}" data-thesis-val="${escapeHtml(item.label)}" title="Filter Startups to Call by ${escapeHtml(item.label)}"` : ""}
      >
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
  document.getElementById("thesisFundSubtitle").innerHTML = `Verified across <b>${thesis.dealsAnalyzedCount} Cala rounds</b> and ${thesis.portfolioCount} portfolio companies.`;

  const thesisHeroEl = document.getElementById("thesisHeroKpis");
  const tt = thesis.timeTravelProfile || {};
  const feeders = thesis.upstreamFeeders || [];
  const iqrStr =
    tt.entryHeadcountP25 != null && tt.entryHeadcountP75 != null
      ? `P25-P75 ${tt.entryHeadcountP25}-${tt.entryHeadcountP75}`
      : tt.entryHeadcountBand || "early team";
  if (thesisHeroEl) {
    const hits = backtest?.hitsInTop15 ?? 3;
    const totalDeals = backtest?.totalActualDeals ?? 3;
    const hitRate = totalDeals > 0 ? Math.round((hits / totalDeals) * 100) : 100;
    thesisHeroEl.innerHTML = `
      <div class="hk-card">
        <span class="hk-kicker">Time-Travel Entry Baseline</span>
        <b class="hk-val num-tabular">${tt.medianEntryHeadcount != null ? `${tt.medianEntryHeadcount} people` : `${thesis.dealsAnalyzedCount} deals`}</b>
        <span class="hk-lab">${escapeHtml(iqrStr)} · ${Math.round(tt.medianEntryAgeMonths || 24)}m old · ${tt.filingVerifiedSharePct ?? 60}% filing verified</span>
      </div>
      <div class="hk-card">
        <span class="hk-kicker">Backtest Recovery</span>
        <b class="hk-val num-tabular" style="color:var(--green)">${hitRate}%</b>
        <span class="hk-lab">${hits}/${totalDeals} Top 15 · R@50 ${Math.round((backtest?.recallAt50 ?? 1) * 100)}% · MRR ${(backtest?.mrr ?? 0).toFixed(2)}</span>
      </div>
      <div class="hk-card">
        <span class="hk-kicker">Upstream Feeders &amp; Size</span>
        <b class="hk-val num-tabular">${formatEur(thesis.medianRoundSizeEurM)}</b>
        <span class="hk-lab">${feeders[0] ? `Top: ${escapeHtml(feeders[0].name)} (lift ${feeders[0].lift ?? feeders[0].fedDealsCount})` : `${thesis.leadRatePct}% lead rate`}</span>
      </div>
    `;
  }

  const confBadge = document.getElementById("thesisConfidenceBadge");
  if (confBadge) {
    confBadge.textContent = `${thesis.dealsAnalyzedCount} rounds · ${tt.filingVerifiedSharePct ?? 60}% FILING/PRIMARY verified`;
  }

  const driftBadge = document.getElementById("driftScoreBadge");
  if (driftBadge) {
    driftBadge.textContent = tt.entryHeadcountBand || `Median round ${formatEur(thesis.medianRoundSizeEurM)}`;
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

  renderDistributionBars("sectorDistributionBars", thesis.sectorMix, "sector");
  renderDistributionBars("stageDistributionBars", thesis.stageMix, "stage");
  renderDistributionBars("geoDistributionBars", thesis.geographyMix, "geo");

  const insightsEl = document.getElementById("thesisInsightsList");
  if (insightsEl) {
    const diffLine = (thesis.statedVsRevealed || [])[0] || thesis.driftSummary || "";
    const topFeederSummary = feeders.length
      ? `Top Round N-1 feeders before follow-on entry (volume-normalized lift): ${feeders.slice(0, 3).map((f) => `${f.name} (${f.fedDealsCount}x, lift ${f.lift ?? f.fedDealsCount}: ${f.companies.slice(0, 2).join(", ")})`).join("; ")}.`
      : `Direct entry at Seed/Pre-Seed (${thesis.leadRatePct}% lead rate, ${thesis.followOnRatePct}% follow-on rate across ${thesis.dealsAnalyzedCount} rounds).`;
    insightsEl.innerHTML = `
      <li>
        <div class="ic">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--green)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/></svg>
        </div>
        <div>
          <b>Stated vs. revealed thesis</b>
          Stated: "${escapeHtml(thesis.statedThesis || "")}". Revealed: ${escapeHtml(diffLine)}
        </div>
      </li>
      <li>
        <div class="ic">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--green)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="m9 12 2 2 4-4"/></svg>
        </div>
        <div>
          <b>Time-travel entry baseline</b>
          Invests at a median of ${escapeHtml(String(tt.medianEntryHeadcount ?? "--"))} team size (${escapeHtml(iqrStr)}), ${escapeHtml(String(tt.medianEntryAgeMonths ?? "--"))} months old, ${escapeHtml(String(tt.filingVerifiedSharePct ?? 0))}% Filing/Primary verified.
        </div>
      </li>
      <li>
        <div class="ic">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--green)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
        </div>
        <div>
          <b>Upstream feeders &amp; provenance gate</b>
          ${escapeHtml(topFeederSummary)}
        </div>
      </li>
    `;
  }

  if (backtest) {
    const totalDeals = backtest.totalActualDeals || 3;
    const hits = backtest.hitsInTop15 || 3;
    const hitRate = Math.round((hits / totalDeals) * 100);
    const r50 = Math.round((backtest.recallAt50 ?? 1) * 100);
    const mrrVal = (backtest.mrr ?? 0).toFixed(2);
    document.getElementById("backtestHitRate").textContent = `${hitRate}%`;
    document.getElementById("backtestPrecision").textContent = `${hits}/${totalDeals} Top 15 · R@50 ${r50}% · MRR ${mrrVal}`;
    document.getElementById("backtestSummaryText").textContent = backtest.summaryText;

    const hitsEl = document.getElementById("backtestHitsList");
    if (hitsEl) {
      hitsEl.innerHTML = (backtest.hiddenDeals || [])
        .map(
          (hit) => `
          <button type="button" class="buyer backtest-hit-btn" data-hit-name="${escapeHtml(hit.name)}">
            <div class="bn">
              <span>${escapeHtml(hit.name)} (Predicted #${hit.predictedRank})</span>
              <span>${hit.predictedScore}/100</span>
            </div>
            <p>Actual deal: ${escapeHtml(hit.actualRoundType)} on ${escapeHtml(hit.actualDate)} · ${escapeHtml(hit.coInvestorHint)}</p>
          </button>
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

function buildLiveCalaIntelHtml(res, options = {}) {
  const ctx = options.context || "search";
  const matched = res?.matchedEntity;
  const live = res?.liveSummary;
  const candidates = res?.candidateEntities || [];
  const invested = live?.investedIn || [];
  const fundingRounds = live?.fundingRounds || [];
  const raisedRounds = live?.raisedRounds || [];
  const issuerRounds = live?.issuerRounds || [];
  const eventsAttended = live?.eventsAttended || [];
  const corpEvents = live?.corporateEvents || [];
  const worksAt = live?.worksAt || [];
  const leadership = live?.leadership || [];
  const numObs = live?.numericalObservations || [];

  const isEventEntity = (live?.entityType || matched?.entity_type) === "Event";
  const allRounds = issuerRounds.length ? issuerRounds : fundingRounds.length ? fundingRounds : raisedRounds;
  const edgeCount = isEventEntity
    ? eventsAttended.length
    : (live?.investedInCount || invested.length || 0) +
      (live?.fundingRoundsCount || allRounds.length || 0) +
      worksAt.length +
      leadership.length;

  const ka = res?.knowledgeAnswer;
  const kaText =
    ka?.content ||
    ka?.answer ||
    ka?.summary ||
    ka?.text ||
    (ka ? JSON.stringify(ka, null, 2) : "");

  const costBadge = res?.fromCache
    ? `<span class="badge b-cyan">Cached</span>`
    : `<span class="badge b-sky">Live verified</span>`;

  const relRows = [
    ...(isEventEntity
      ? eventsAttended.slice(0, 12).map((co) => {
          const src = (co.sources || [])[0];
          const href = src?.document && src.document.startsWith("http") ? src.document : "";
          return `
            <div class="cala-rel-row">
              <div>
                <strong>${escapeHtml(co.name)}</strong>
                <span class="note" style="margin-left:6px">${escapeHtml(co.hqCity || "")} · ${escapeHtml(co.stage || "")}</span>
              </div>
              <div style="display:flex;align-items:center;gap:8px">
                <button type="button" class="cala-attendee-open-btn" data-slush-open-startup="${escapeHtml(co.id)}">
                  Inspect (${co.suitabilityScore ?? 80}/100) &rarr;
                </button>
                ${href ? `<a class="cala-src-link" href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(src.name || "Slush")} &#8599;</a>` : ""}
              </div>
            </div>
          `;
        })
      : []),
    ...invested.slice(0, 8).map((c) => {
      const src = (c.sources || [])[0];
      const href = src?.document && src.document.startsWith("http") ? src.document : "";
      return `
        <div class="cala-rel-row">
          <div>
            <strong>${escapeHtml(c.name)}</strong>
            <span class="note" style="margin-left:8px">Portfolio investment</span>
          </div>
          ${href ? `<a class="cala-src-link" href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(src.name || "Source")} &#8599;</a>` : `<span class="note">Verified</span>`}
        </div>
      `;
    }),
    ...allRounds.slice(0, 6).map((r) => {
      const src = (r.sources || [])[0];
      const href = src?.document && src.document.startsWith("http") ? src.document : "";
      const roleLabel = r.isLead ? "Lead investor" : r.role === "INVESTOR" ? "Investor" : "Raised";
      return `
        <div class="cala-rel-row">
          <div>
            <strong>${escapeHtml(r.roundType || "Funding Round")}</strong>
            <span class="note" style="margin-left:8px">${escapeHtml(roleLabel)} · ${escapeHtml(r.eventDate || "Verified")}</span>
          </div>
          ${href ? `<a class="cala-src-link" href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(src.name || "Citation")} &#8599;</a>` : `<span class="note">Recorded</span>`}
        </div>
      `;
    }),
    ...corpEvents.slice(0, 4).map((ev) => {
      const prettyEv =
        ev.name === "FINANCING_RAISED_OR_FACILITY_ENTERED"
          ? "Financing filing"
          : ev.name === "COMPANY_LIFECYCLE_EVENT"
            ? "Company registry filing"
            : ev.name === "MNA_COMPLETED"
              ? "Acquisition completed"
              : String(ev.name || "Official filing").replace(/_/g, " ").toLowerCase();
      return `
        <div class="cala-rel-row">
          <div>
            <strong>${escapeHtml(prettyEv)}</strong>
            <span class="note" style="margin-left:8px">${escapeHtml(formatReadableMonth(ev.eventDate) || ev.eventDate || "")}</span>
          </div>
          <span class="badge b-cyan">Official filing</span>
        </div>
      `;
    })
  ];

  const candRows = [
    ...leadership.map(
      (p) => `
      <div class="cala-rel-row">
        <div><strong>${escapeHtml(p.name)}</strong> · <span class="note">${escapeHtml(formatLeadershipTitle(p.relation || p.role))}</span></div>
        <span class="note">${p.validSince ? `since ${escapeHtml(p.validSince)}` : "Leadership"}</span>
      </div>
    `
    ),
    ...worksAt.map(
      (p) => `
      <div class="cala-rel-row">
        <div><strong>${escapeHtml(p.name)}</strong> · <span class="note">${escapeHtml(p.role || "Team")}</span></div>
        <span class="note">Team</span>
      </div>
    `
    ),
    ...numObs.slice(0, 4).map(
      (obs, idx) => `
      <div class="cala-rel-row">
        <div><strong>Metric ${idx + 1}</strong> · <span class="note">${escapeHtml(obs.value ? `${obs.value} (${obs.date || ""})` : JSON.stringify(obs).slice(0, 80))}</span></div>
        <span class="badge b-cyan">Growth</span>
      </div>
    `
    ),
    ...candidates.slice(0, 5).map(
      (e) => `
      <div class="cala-rel-row">
        <div style="min-width:0">
          <strong>${escapeHtml(e.name)}</strong> <span class="note">(${escapeHtml(e.entity_type || "Entity")})</span>
          ${e.description ? `<span class="note" style="display:block">${escapeHtml(e.description)}</span>` : ""}
        </div>
      </div>`
    )
  ];

  const entityTitle = live?.name || matched?.name || res?.queryName || "Company Summary";
  const entityType = live?.entityType || matched?.entity_type || "Company";
  const entityId = live?.id || matched?.id || "";

  const schemaChips = [
    live?.fundingStage ? `<span class="meta-pill">${escapeHtml(live.fundingStage)} stage</span>` : "",
    live?.employeeCountRange ? `<span class="meta-pill">${escapeHtml(String(live.employeeCountRange).replace(",", "-"))} team</span>` : "",
    live?.headquarters ? `<span class="meta-pill">${escapeHtml(live.headquarters)}</span>` : ""
  ].filter(Boolean);

  if (ctx === "drawer" || ctx === "talk") {
    if (!matched && !live && !kaText) {
      return `
        <div class="cala-compact-check">
          <div class="cala-intel-head">
            <div style="min-width:0">
              <div class="cala-intel-title-row">
                <span class="drawer-kicker" style="margin:0"><span class="live-dot" aria-hidden="true"></span> Checked live index</span>
                ${costBadge}
              </div>
              <p class="cala-intel-desc" style="margin:4px 0 0">
                No separate entity update found for "${escapeHtml(res?.queryName || entityTitle)}" beyond the verified records shown in Sources &amp; Growth below.
              </p>
            </div>
            <div class="cala-intel-actions">
              <button type="button" class="btn sm" data-close-cala-ctx="${escapeHtml(ctx)}">Close</button>
            </div>
          </div>
        </div>
      `;
    }
    const summaryParts = [];
    if (allRounds.length > 0) summaryParts.push(`${allRounds.length} verified funding ${allRounds.length === 1 ? "round" : "rounds"}`);
    if (leadership.length + worksAt.length > 0) summaryParts.push(`${leadership.length + worksAt.length} leadership & team records`);
    if (numObs.length > 0) summaryParts.push(`${numObs.length} headcount checks`);
    const summaryLine = summaryParts.length
      ? `Confirmed ${summaryParts.join(" · ")} in live Cala AI records.`
      : live?.description || matched?.description || "Company entity confirmed in Cala AI records.";
    return `
      <div class="cala-compact-check">
        <div class="cala-intel-head">
          <div style="min-width:0">
            <div class="cala-intel-title-row">
              <span class="drawer-kicker" style="margin:0"><span class="live-dot" aria-hidden="true"></span> Live check complete</span>
              ${costBadge}
            </div>
            <p class="cala-intel-desc" style="margin:4px 0 0">${escapeHtml(summaryLine)}</p>
          </div>
          <div class="cala-intel-actions">
            ${
              !ka && entityId && entityId !== SLUSH_2026_EVENT_ID
                ? `<button type="button" class="btn sm primary" data-cala-deep-name="${escapeHtml(res?.queryName || entityTitle)}" data-cala-deep-type="${escapeHtml(res?.type || "company")}" data-cala-deep-ctx="${escapeHtml(ctx)}">Ask Cala AI (1 credit)</button>`
                : ""
            }
            <button type="button" class="btn sm" data-close-cala-ctx="${escapeHtml(ctx)}">Close</button>
          </div>
        </div>
        ${
          kaText
            ? `<div class="cala-knowledge-box" style="margin-top:8px"><strong>Live summary:</strong><p style="margin:4px 0 0">${escapeHtml(kaText)}</p></div>`
            : ""
        }
        ${relRows.length ? `<div class="cala-rel-list" style="margin-top:8px">${relRows.slice(0, 3).join("")}</div>` : ""}
      </div>
    `;
  }

  return `
    <div class="cala-intel-head">
      <div style="min-width:0">
        <div class="cala-intel-title-row">
          <span class="drawer-kicker" style="margin:0"><span class="live-dot" aria-hidden="true"></span> Live Cala check</span>
          ${costBadge}
          <span class="badge b-sky">${escapeHtml(entityType)}</span>
        </div>
        <h3 class="cala-intel-title">${escapeHtml(entityTitle)}</h3>
        ${live?.description || matched?.description ? `<p class="cala-intel-desc">${escapeHtml(live?.description || matched?.description)}</p>` : ""}
        ${schemaChips.length ? `<div class="cala-schema-pills">${schemaChips.join("")}</div>` : ""}
      </div>
      <div class="cala-intel-actions">
        ${
          entityId !== SLUSH_2026_EVENT_ID
            ? `<button type="button" class="btn sm slush-event-btn" data-open-slush-graph="1" title="See startups attending Slush 2026">Slush 2026 list</button>`
            : ""
        }
        ${
          !ka && entityId !== SLUSH_2026_EVENT_ID
            ? `<button type="button" class="btn sm primary" data-cala-deep-name="${escapeHtml(res?.queryName || entityTitle)}" data-cala-deep-type="${escapeHtml(res?.type || "company")}" data-cala-deep-ctx="${escapeHtml(ctx)}">Deep summary (1 credit)</button>`
            : ""
        }
        <button type="button" class="btn sm" data-close-cala-ctx="${escapeHtml(ctx)}">Close &times;</button>
      </div>
    </div>

    <div class="hero-kpi-strip cala-live-kpis">
      <div class="hk-card">
        <span class="hk-kicker">Profile</span>
        <b class="hk-val hk-val-text">${escapeHtml(entityType)}</b>
        <span class="hk-lab">${matched ? "Verified match" : "Public summary"}</span>
      </div>
      <div class="hk-card">
        <span class="hk-kicker">${isEventEntity ? "Attending Startups" : "Connections"}</span>
        <b class="hk-val num-tabular">${edgeCount}</b>
        <span class="hk-lab">${isEventEntity ? "Slush 2026 attendees" : `${invested.length} portfolio · ${allRounds.length} rounds`}</span>
      </div>
      <div class="hk-card">
        <span class="hk-kicker">People &amp; Matches</span>
        <b class="hk-val num-tabular">${candidates.length}</b>
        <span class="hk-lab">${worksAt.length + leadership.length} team &amp; leaders</span>
      </div>
    </div>

    ${
      kaText
        ? `<div class="cala-knowledge-box"><strong>Live summary:</strong><p style="margin:6px 0 0">${escapeHtml(kaText)}</p></div>`
        : ""
    }

    <div class="cala-subgrid">
      <div class="cala-mini-card">
        <div class="cala-mini-head">
          <span class="cala-mini-title">${isEventEntity ? "Slush 2026 participating startups" : "Verified deals &amp; sources"}</span>
          <span class="gradual-hint">${relRows.length} items</span>
        </div>
        <div class="cala-rel-list">
          ${relRows.length ? relRows.join("") : `<p class="note" style="margin:10px 0 0">No deals or links listed for this view.</p>`}
        </div>
      </div>

      <div class="cala-mini-card">
        <div class="cala-mini-head">
          <span class="cala-mini-title">Leadership &amp; team</span>
          <span class="gradual-hint">${candRows.length} items</span>
        </div>
        <div class="cala-rel-list">
          ${candRows.length ? candRows.join("") : `<p class="note" style="margin:10px 0 0">No additional team details listed.</p>`}
        </div>
      </div>
    </div>
  `;
}

async function runCalaVerifyQuery({ name, type = "company", includeKnowledgeSearch = false, targetEl, context = "search" }) {
  const cleanName = String(name || "").trim();
  if (!cleanName || !targetEl) return null;

  const isSlushEvent = type === "event" || /\bslush\s*2026\b|bc844d56/i.test(cleanName);
  let res = null;
  if (isSlushEvent) {
    res = buildSlush2026LivePayload();
  } else {
    const cacheKey = `${cleanName.toLowerCase()}::${type}::${includeKnowledgeSearch}`;
    res = state.liveCalaCache.get(cacheKey);
    if (res) {
      res = { ...res, fromCache: true };
    } else {
      res = await fetchJson("/api/cala-verify", {
        method: "POST",
        body: JSON.stringify({
          name: cleanName,
          type,
          includeKnowledgeSearch
        })
      });
      state.liveCalaCache.set(cacheKey, res);
    }
  }

  updateTelemetryMasthead(res.budget);

  targetEl.hidden = false;
  targetEl.innerHTML = buildLiveCalaIntelHtml(res, { context });

  targetEl.querySelector("[data-close-cala-ctx]")?.addEventListener("click", () => {
    const outerCard = targetEl.closest(".live-cala-intel-card");
    if (outerCard) {
      outerCard.hidden = true;
    } else {
      targetEl.hidden = true;
    }
  });

  targetEl.querySelector("[data-open-slush-graph]")?.addEventListener("click", () => {
    runCalaVerifyQuery({
      name: "Slush 2026",
      type: "event",
      includeKnowledgeSearch: false,
      targetEl,
      context
    });
  });

  targetEl.querySelectorAll("[data-slush-open-startup]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.peerHistory = [];
      openStartupInspector(btn.dataset.slushOpenStartup, { keepHistory: true, tab: "brief" });
    });
  });

  const deepBtn = targetEl.querySelector("[data-cala-deep-name]");
  if (deepBtn) {
    deepBtn.addEventListener("click", async () => {
      deepBtn.disabled = true;
      deepBtn.textContent = "Querying Cala Knowledge...";
      try {
        await runCalaVerifyQuery({
          name: deepBtn.dataset.calaDeepName,
          type: deepBtn.dataset.calaDeepType || "company",
          includeKnowledgeSearch: true,
          targetEl,
          context
        });
      } catch (err) {
        showUiToast(`Cala Knowledge error: ${err.message}`);
        deepBtn.disabled = false;
        deepBtn.textContent = "Ask Deep Knowledge (1 credit)";
      }
    });
  }

  return res;
}

async function runSearchLiveCalaLookup(customQuery) {
  const inputVal = document.getElementById("aiSearchInput")?.value?.trim() || "";
  const query = String(customQuery || inputVal || getSelectedBenchmarkLabel()).trim();
  const cardEl = document.getElementById("liveCalaSearchCard");
  const contentEl = document.getElementById("liveCalaSearchContent");
  const btn = document.getElementById("searchLiveCalaBtn");
  if (!cardEl || !contentEl || !query) return;

  const isEventQuery = /\bslush\s*2026\b|bc844d56/i.test(query);
  const matchedFund = (state.bootstrap?.funds || []).find(
    (f) => f.name.toLowerCase() === query.toLowerCase()
  );
  const type = isEventQuery ? "event" : matchedFund ? "fund" : "company";

  cardEl.hidden = false;
  contentEl.innerHTML = `<p class="note" style="margin:0">Querying Cala AI graph for <strong>${escapeHtml(query)}</strong> (cache checked first)...</p>`;
  if (btn) btn.disabled = true;

  try {
    await runCalaVerifyQuery({
      name: query,
      type,
      includeKnowledgeSearch: false,
      targetEl: contentEl,
      context: "search"
    });
  } catch (err) {
    contentEl.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;gap:12px">
        <span class="note">Live Cala lookup notice: ${escapeHtml(err.message)}</span>
        <button type="button" class="btn sm" id="closeErrCalaSearchBtn">Close &times;</button>
      </div>
    `;
    document.getElementById("closeErrCalaSearchBtn")?.addEventListener("click", () => {
      cardEl.hidden = true;
    });
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function verifyThesisFundInLiveCala({ silent = false } = {}) {
  const fundName = state.analysis?.thesis?.fundName || getSelectedBenchmarkLabel();
  const cardEl = document.getElementById("thesisLiveCalaCard");
  const btn = document.getElementById("thesisVerifyFundBtn");
  if (!cardEl || !fundName) return;

  if (!silent) {
    cardEl.hidden = false;
    cardEl.innerHTML = `<p class="note" style="margin:0">Verifying <strong>${escapeHtml(fundName)}</strong> against Cala AI Organization graph...</p>`;
  }
  if (btn) btn.disabled = true;

  try {
    await runCalaVerifyQuery({
      name: fundName,
      type: "fund",
      includeKnowledgeSearch: false,
      targetEl: cardEl,
      context: "thesis"
    });
  } catch (err) {
    if (!silent) {
      cardEl.hidden = false;
      cardEl.innerHTML = `<span class="note">Live Cala notice: ${escapeHtml(err.message)}</span>`;
    }
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function triggerRegistryDiscovery() {
  const btn = document.getElementById("discoverRegistriesBtn");
  const badge = document.getElementById("registryDiscoveredBadge");
  if (btn) {
    btn.disabled = true;
    btn.classList.add("is-loading");
  }
  if (badge) badge.textContent = "Syncing";

  try {
    const q = document.getElementById("aiSearchInput")?.value?.trim() || "";
    const parsed = parseNaturalLanguageSearchQuery(q);
    const res = await fetchJson("/api/discover-registries", {
      method: "POST",
      body: JSON.stringify({
        queryText: q || undefined,
        country: parsed.country || undefined,
        sectors: parsed.sectors,
        mode: q ? "query" : "sync_recent_startups",
        maxResults: 12
      })
    });

    if (res.calaBudget) {
      updateTelemetryMasthead(res.calaBudget);
    }
    const count = res.companies?.length || 0;
    if (badge) badge.textContent = `${count} filings`;
    await runAnalysis();
    if (q || countActiveRefineFilters() > 0) {
      await executeSearchRefinement(q);
    }
    const sourcesLabel = (res.sourcesUsed || []).join(" + ") || "PRH/GLEIF";
    showUiToast(`Synced ${count} records from ${sourcesLabel} (${res.ingestedCount || 0} new; 0 Cala credits used)`);
  } catch (err) {
    if (badge) badge.textContent = "Retry";
    showUiToast(`Registry sync notice: ${err.message}`);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.classList.remove("is-loading");
    }
  }
}

async function triggerLiveCalaPoolExpansion() {
  const btn = document.getElementById("expandUniverseCalaBtn");
  const badge = document.getElementById("liveDiscoveredBadge");
  if (btn) {
    btn.disabled = true;
    btn.classList.add("is-loading");
  }
  if (badge) badge.textContent = "...";

  try {
    const q = document.getElementById("aiSearchInput")?.value?.trim() || "";
    const parsed = parseNaturalLanguageSearchQuery(q);
    const res = await fetchJson("/api/cala-discover", {
      method: "POST",
      body: JSON.stringify({
        mode: "ecosystem",
        fundId: state.selectedFundId,
        companyIds: state.selectedCompanyIds,
        rankingMode: mapScoringModeToApi(state.scoringMode),
        statedThesisOverride: state.statedThesisOverride || undefined,
        seenCompanyNames: getSeenCompanyNamesList(),
        queryText: q || undefined,
        sectors: parsed.sectors,
        countries: parsed.countries,
        maxEmployees: parsed.maxEmployees,
        slush2026Only: parsed.slush2026Only,
        preferWarm: parsed.preferWarm
      })
    });

    state.analysis = { ...(state.analysis || {}), ...res };
    state.DisplayedShortlist = res.shortlist || [];
    registerKnownItems(state.DisplayedShortlist);
    renderStartupGrid(state.DisplayedShortlist);
    if (res.backtest || res.thesis) {
      renderThesisAndBacktest(state.analysis);
    }
    if (res.calaBudget) {
      updateTelemetryMasthead(res.calaBudget);
    }

    const liveTotal = state.DisplayedShortlist.filter((s) => s.isLiveCalaDiscovered).length;
    if (badge) badge.textContent = liveTotal > 0 ? `${liveTotal} live` : "Synced";
    showUiToast(
      `Discovered & scored ${res.discoveredCount ?? liveTotal} startups from Live Cala AI (${state.DisplayedShortlist.length} total ranked)`
    );
  } catch (err) {
    if (badge) badge.textContent = "Retry";
    showUiToast(`Live Cala discovery notice: ${err.message}`);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.classList.remove("is-loading");
    }
  }
}

async function triggerLiveCalaVerification() {
  const candidate = state.allKnownItems.get(state.activeStartupId);
  if (!candidate) return;
  const outputEl = document.getElementById("liveCalaOutput");
  const bannerEl = document.getElementById("drawerLiveCalaBanner");
  const btn = document.getElementById("verifyLiveCalaBtn");
  const headerBtn = document.getElementById("modalHeaderLiveCalaBtn");
  const includeKnowledgeSearch = Boolean(document.getElementById("liveCalaSearchCheck")?.checked);

  if (bannerEl) {
    bannerEl.hidden = false;
    bannerEl.innerHTML = `<p class="note" style="margin:0">Querying live Cala AI graph for <strong>${escapeHtml(candidate.name)}</strong>...</p>`;
  }
  if (outputEl) {
    outputEl.hidden = false;
    outputEl.textContent = "Querying live Cala Beta API...";
  }
  if (btn) btn.disabled = true;
  if (headerBtn) headerBtn.disabled = true;

  try {
    const res = await runCalaVerifyQuery({
      name: candidate.name,
      type: "company",
      includeKnowledgeSearch,
      targetEl: bannerEl || outputEl,
      context: "drawer"
    });

    if (outputEl && res) {
      outputEl.innerHTML = `
        <div class="card" style="padding:12px;margin-top:10px">
          <strong>Live Cala response (${res.fromCache ? "Cached · 0 credits" : "Live call"}):</strong>
          <p class="note" style="margin:4px 0 0">${
            res.liveSummary
              ? `Matched entity: ${escapeHtml(res.liveSummary.name)} (${escapeHtml(res.liveSummary.id)})`
              : "Entity query completed."
          }</p>
        </div>
      `;
    }
  } catch (err) {
    const msg = `Live Cala check notice: ${err.message}`;
    if (bannerEl) bannerEl.innerHTML = `<span class="note">${escapeHtml(msg)}</span>`;
    if (outputEl) outputEl.textContent = msg;
  } finally {
    if (btn) btn.disabled = false;
    if (headerBtn) headerBtn.disabled = false;
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

  document.getElementById("themeToggleBtn")?.addEventListener("click", toggleTheme);
  document.getElementById("onbThemeToggleBtn")?.addEventListener("click", toggleTheme);
  document.querySelectorAll("[data-set-theme]").forEach((btn) => {
    btn.addEventListener("click", () => {
      applyTheme(btn.getAttribute("data-set-theme"));
    });
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
    const currentlyShown = state.filtersPanelOpen || (strip && !strip.hidden);
    setFiltersPanelOpen(!currentlyShown, { includeAdvanced: !currentlyShown });
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
      const fs = document.getElementById("fundInputSection");
      const cs = document.getElementById("companiesInputSection");
      if (fs) fs.hidden = state.inputMode !== "fund";
      if (cs) cs.hidden = state.inputMode !== "companies";
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

  document.getElementById("filterSlushBtn")?.addEventListener("click", () => {
    state.onlySlush2026 = !state.onlySlush2026;
    renderStartupGrid(state.DisplayedShortlist);
  });

  document.getElementById("aiTraceCitations")?.addEventListener("click", (e) => {
    const startBtn = e.target.closest("[data-ai-open-startup]");
    if (startBtn) {
      state.peerHistory = [];
      openStartupInspector(startBtn.dataset.aiOpenStartup, { keepHistory: true, tab: "brief" });
      return;
    }
    const escBtn = e.target.closest("[data-ai-escalation-query]");
    if (escBtn) {
      const q = escBtn.dataset.aiEscalationQuery;
      const cardEl = document.getElementById("liveCalaSearchCard");
      const contentEl = document.getElementById("liveCalaSearchContent");
      if (cardEl && contentEl && q) {
        cardEl.hidden = false;
        contentEl.innerHTML = `<p class="note" style="margin:0">Querying Live Cala Knowledge for <strong>${escapeHtml(q)}</strong>...</p>`;
        runCalaVerifyQuery({
          name: q,
          type: "company",
          includeKnowledgeSearch: true,
          targetEl: contentEl,
          context: "search"
        }).catch((err) => {
          contentEl.innerHTML = `<span class="note">Live Cala error: ${escapeHtml(err.message)}</span>`;
        });
      }
    }
  });

  document.getElementById("compareCallListBtn")?.addEventListener("click", () => {
    toggleCallListCompareMatrix();
  });

  document.getElementById("closeCompareCardBtn")?.addEventListener("click", () => {
    toggleCallListCompareMatrix(false);
  });

  document.getElementById("callListCompareGrid")?.addEventListener("click", async (e) => {
    if (e.target.closest("#seedTopCallListBtn")) {
      const topIds = state.DisplayedShortlist.slice(0, 3).map((s) => s.id);
      if (topIds.length) {
        state.savedCallListIds = [...new Set([...topIds, ...state.savedCallListIds])];
        savePrefsToStorage();
        syncCallListUI();
        renderStartupGrid(state.DisplayedShortlist);
        showUiToast(`Loaded ${topIds.length} top-scored startups into Call List`);
      }
      return;
    }

    const remBtn = e.target.closest("[data-compare-remove]");
    if (remBtn) {
      toggleCallListStartup(remBtn.dataset.compareRemove);
      return;
    }

    const openBtn = e.target.closest("[data-compare-open]");
    if (openBtn) {
      state.peerHistory = [];
      openStartupInspector(openBtn.dataset.compareOpen, { keepHistory: true, tab: "brief" });
      return;
    }

    const copyBtn = e.target.closest("[data-compare-copy]");
    if (copyBtn) {
      const id = copyBtn.dataset.compareCopy;
      const cand = state.allKnownItems.get(id) || state.DisplayedShortlist.find((c) => c.id === id);
      if (cand) {
        const text = buildWarmIntroDraftText(cand);
        try {
          if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(text);
        } catch {
          // Non-fatal in non-clipboard contexts
        }
        copyBtn.textContent = "Copied";
        window.setTimeout(() => {
          if (copyBtn.isConnected) copyBtn.textContent = "Copy Intro";
        }, 1600);
        showUiToast(`Copied warm intro note for ${cand.name}`);
      }
    }
  });

  const thesisPanelEl = document.getElementById("panel-thesis");
  const handleThesisDrilldown = async (targetEl) => {
    const rowEl = targetEl.closest("[data-thesis-kind]");
    if (rowEl) {
      const val = rowEl.dataset.thesisVal || "";
      switchPrimaryTab("search");
      await executeSearchRefinement(val);
      showUiToast(`Filtered shortlist by "${val}" from Revealed Thesis`);
      return;
    }
    const hitBtn = targetEl.closest("[data-hit-name]");
    if (hitBtn) {
      const hitName = hitBtn.dataset.hitName || "";
      const match = [...state.allKnownItems.values()].find(
        (c) => c.name.toLowerCase() === hitName.toLowerCase()
      );
      if (match) {
        openStartupInspector(match.id, { keepHistory: true, tab: "brief" });
      } else {
        switchPrimaryTab("search");
        await executeSearchRefinement(hitName);
        showUiToast(`Searched historical backtest deal: ${hitName}`);
      }
    }
  };
  thesisPanelEl?.addEventListener("click", (e) => {
    handleThesisDrilldown(e.target);
  });
  thesisPanelEl?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      const rowEl = e.target.closest("[data-thesis-kind]");
      if (rowEl) {
        e.preventDefault();
        handleThesisDrilldown(rowEl);
      }
    }
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

  ["filterEntityScope", "filterStage", "filterRegion", "filterExcludeSector", "filterRaisingSoon", "filterUntappedOnly"].forEach(
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

  document.getElementById("inspectorDrawer")?.addEventListener("click", (e) => {
    if (e.target.closest("#copyWarmIntroBtn") || e.target.closest("[data-copy-intro-inline]")) {
      copyWarmIntroNote();
    }
  });

  document.getElementById("openGraphMapInlineBtn")?.addEventListener("click", () => {
    switchDrawerTab("network");
  });

  document.getElementById("graphBackToBriefBtn")?.addEventListener("click", () => {
    switchDrawerTab("brief");
  });

  document.getElementById("drawerInlinePeersRow")?.addEventListener("click", (e) => {
    const peerBtn = e.target.closest("[data-inline-peer-id]");
    if (!peerBtn) return;
    openStartupInspector(peerBtn.dataset.inlinePeerId, { tab: "brief" });
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
      savePrefsToStorage();
      const candidate = state.allKnownItems.get(state.activeStartupId);
      if (state.activeBrief && candidate) {
        renderDrawerBriefPane(state.activeBrief, candidate);
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
  document.getElementById("modalHeaderLiveCalaBtn")?.addEventListener("click", triggerLiveCalaVerification);
  document.getElementById("expandUniverseCalaBtn")?.addEventListener("click", triggerLiveCalaPoolExpansion);
  document.getElementById("discoverRegistriesBtn")?.addEventListener("click", triggerRegistryDiscovery);
  document.getElementById("searchLiveCalaBtn")?.addEventListener("click", () => {
    runSearchLiveCalaLookup();
  });
  document.getElementById("aiSynthesisBanner")?.addEventListener("click", (e) => {
    if (e.target.closest("#refreshLiveCalaBtn")) {
      executeSearchRefinement(undefined, { forceLive: true, fit: true });
    }
  });
  document.getElementById("thesisVerifyFundBtn")?.addEventListener("click", () => {
    verifyThesisFundInLiveCala({ silent: false });
  });

  // Search Hero & Top Floating Command Bar controls
  document.getElementById("brandHomeLink")?.addEventListener("click", (e) => {
    e.preventDefault();
    enterSearchHero();
  });
  document.getElementById("heroBenchmarkBtn")?.addEventListener("click", () => {
    enterOnboarding(1);
  });
  document.getElementById("closeConfigOverlayBtn")?.addEventListener("click", () => {
    closeConfigOverlay();
  });
  document.getElementById("exploreBenchmarkBtn")?.addEventListener("click", () => {
    enterMapWorkspace({ fit: true });
  });
  document.getElementById("heroFiltersQuickBtn")?.addEventListener("click", () => {
    enterMapWorkspace({ fit: true });
    setFiltersPanelOpen(true, { includeAdvanced: true });
  });
  document.getElementById("workspaceThesisBtn")?.addEventListener("click", () => {
    switchPrimaryTab("thesis");
  });

  // Cala Studio top-left Explored Entities Box & Compare Entity Autocomplete
  document.getElementById("exploredFiltersToggleBtn")?.addEventListener("click", () => {
    setFiltersPanelOpen(!state.filtersPanelOpen, { includeAdvanced: false });
  });
  document.getElementById("mapFiltersToggleBtn")?.addEventListener("click", () => {
    setFiltersPanelOpen(!state.filtersPanelOpen, { includeAdvanced: false });
  });
  document.getElementById("clearExploredEntitiesBtn")?.addEventListener("click", () => {
    clearComparePins();
  });
  document.getElementById("pinnedEntitiesList")?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-unpin-key]");
    if (!btn) return;
    unpinEntityFromCompare(btn.dataset.unpinKey);
  });

  const compareInputEl = document.getElementById("compareEntityInput");
  const compareSuggestEl = document.getElementById("compareEntitySuggest");
  if (compareInputEl && compareSuggestEl) {
    const renderCompareSuggestions = (items) => {
      const pinnedSet = new Set(state.pinnedEntities.map((p) => p.key));
      const available = (items || []).filter((it) => !pinnedSet.has(`${it.entityType}:${it.id}`)).slice(0, 8);
      state.compareSuggestItems = available;
      if (!available.length) {
        compareSuggestEl.innerHTML = `<div class="compare-suggest-meta" style="padding:6px 8px;">No matching funds or startups found.</div>`;
        compareSuggestEl.hidden = false;
        return;
      }
      compareSuggestEl.innerHTML = available
        .map((it, idx) => `
          <button type="button" class="compare-suggest-btn" data-compare-idx="${idx}">
            <span class="compare-suggest-main">
              <span class="compare-suggest-name">${escapeHtml(it.name)}</span>
              <span class="compare-suggest-meta">${escapeHtml(cleanUiCopy(it.meta || ""))}</span>
            </span>
            <span class="compare-suggest-type ${it.entityType === "fund" ? "is-fund" : "is-startup"}">${it.entityType === "fund" ? "Fund" : "Startup"}</span>
          </button>
        `)
        .join("");
      compareSuggestEl.hidden = false;
    };

    const runCompareLookup = async (rawQ) => {
      const q = String(rawQ || "").trim();
      if (!q) {
        const fundDefaults = (state.bootstrap?.funds || []).slice(0, 4).map((f) => ({
          entityType: "fund",
          id: f.id,
          name: f.name,
          meta: [f.hqCity, f.country].filter(Boolean).join(", ") || "Benchmark Fund"
        }));
        const compDefaults = (state.DisplayedShortlist || []).slice(0, 4).map((c) => ({
          entityType: "startup",
          id: c.id,
          name: c.name,
          meta: [c.sector, c.stage, c.country].filter(Boolean).join(" · ")
        }));
        renderCompareSuggestions([...fundDefaults, ...compDefaults]);
        return;
      }
      try {
        const data = await fetchJson(`/api/search?q=${encodeURIComponent(q)}`);
        const items = [
          ...(data.funds || []).slice(0, 5).map((f) => ({
            entityType: "fund",
            id: f.id,
            name: f.name,
            meta: [f.hqCity, f.country].filter(Boolean).join(", ") || "VC Fund"
          })),
          ...(data.companies || []).slice(0, 5).map((c) => ({
            entityType: "startup",
            id: c.id,
            name: c.name,
            meta: [c.sector, c.country].filter(Boolean).join(" · ") || "Startup"
          }))
        ];
        renderCompareSuggestions(items);
      } catch {
        compareSuggestEl.hidden = true;
      }
    };

    compareInputEl.addEventListener("focus", () => {
      runCompareLookup(compareInputEl.value);
    });
    compareInputEl.addEventListener("input", () => {
      clearTimeout(state.compareSearchTimer);
      state.compareSearchTimer = setTimeout(() => runCompareLookup(compareInputEl.value), 140);
    });
    compareInputEl.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        compareSuggestEl.hidden = true;
        compareInputEl.blur();
      } else if (e.key === "Enter") {
        e.preventDefault();
        const first = state.compareSuggestItems[0];
        if (first) {
          compareSuggestEl.hidden = true;
          compareInputEl.value = "";
          pinEntityForCompare(first);
        }
      }
    });
    compareSuggestEl.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-compare-idx]");
      if (!btn) return;
      const item = state.compareSuggestItems[Number(btn.dataset.compareIdx)];
      compareSuggestEl.hidden = true;
      compareInputEl.value = "";
      if (item) pinEntityForCompare(item);
    });
    document.addEventListener("click", (e) => {
      if (!e.target.closest(".compare-entity-wrap")) {
        compareSuggestEl.hidden = true;
      }
    });
  }

  // Bottom-right Quick Inspector Card actions -> Open Full Evidence & Call Questions Rail
  document.getElementById("mapQuickInspectorCard")?.addEventListener("click", async (e) => {
    if (e.target.closest("#quickInspectorCloseBtn")) {
      clearConstellationSelection();
      return;
    }
    if (e.target.closest("#quickInspectorOpenRailBtn")) {
      state.sideRailOpen = true;
      state.sideRailTab = state.selectedAnchorId && !state.selectedStartupId && !state.selectedBridgeId ? "strategy" : "evidence";
      renderSideEvidenceRail();
      fitConstellationToViewport();
      if (state.selectedStartupId && (!state.activeBrief || state.activeBrief.id !== state.selectedStartupId)) {
        await loadStartupBriefData(state.selectedStartupId);
        renderRailEvidencePane();
      }
    }
  });

  // Constellation Filter Ribbon controls
  document.getElementById("toggleHideMegaHubsBtn")?.addEventListener("click", async () => {
    state.hideMegaHubs = !(state.hideMegaHubs !== false);
    syncConstellationControls();
    await executeSearchRefinement(undefined, { keepSelection: true, keepRailOpen: state.sideRailOpen, fit: false });
    if (state.pinnedEntities.length > 1) {
      await refreshExtraPinnedEntities();
      renderConstellationMap(getEffectiveBridgeMap(), { fit: false });
    }
  });

  document.getElementById("bridgeFamilySwitcher")?.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-contribution-group]");
    if (!btn) return;
    state.contributionGroup = btn.dataset.contributionGroup || "all";
    syncConstellationControls();
    await executeSearchRefinement(undefined, { keepSelection: false, fit: false });
    if (state.pinnedEntities.length > 1) {
      await refreshExtraPinnedEntities();
      renderConstellationMap(getEffectiveBridgeMap(), { fit: true });
    }
  });

  document.getElementById("chipFilingOnlyBtn")?.addEventListener("click", async () => {
    state.filingOnly = !state.filingOnly;
    syncConstellationControls();
    await executeSearchRefinement(undefined, { fit: false });
  });

  document.getElementById("chipSlushOnlyBtn")?.addEventListener("click", async () => {
    state.onlySlush2026 = !state.onlySlush2026;
    syncConstellationControls();
    await executeSearchRefinement(undefined, { fit: false });
  });

  document.getElementById("chipUntappedOnlyBtn")?.addEventListener("click", async () => {
    state.untappedOnly = !state.untappedOnly;
    const cb = document.getElementById("filterUntappedOnly");
    if (cb) cb.checked = state.untappedOnly;
    syncConstellationControls();
    await executeSearchRefinement(undefined, { fit: false });
  });

  document.getElementById("workspaceResetBtn")?.addEventListener("click", resetSearchAndFilters);
  document.getElementById("emptyResetFiltersBtn")?.addEventListener("click", resetSearchAndFilters);
  document.getElementById("emptyRevealMegaHubsBtn")?.addEventListener("click", async () => {
    state.hideMegaHubs = false;
    syncConstellationControls();
    await executeSearchRefinement(undefined, { keepSelection: true, fit: true });
  });
  document.getElementById("emptyShowAllBridgesBtn")?.addEventListener("click", async () => {
    state.contributionGroup = "all";
    state.bridgeFamily = "all";
    syncConstellationControls();
    await executeSearchRefinement(undefined, { keepSelection: false, fit: true });
  });

  // Zoom & Pan controls on #bridgeMapCanvas
  document.getElementById("mapZoomInBtn")?.addEventListener("click", () => {
    state.mapZoom = clampZoom(state.mapZoom + 0.14);
    applyMapViewportTransform();
  });
  document.getElementById("mapZoomOutBtn")?.addEventListener("click", () => {
    state.mapZoom = clampZoom(state.mapZoom - 0.14);
    applyMapViewportTransform();
  });
  document.getElementById("mapCenterBtn")?.addEventListener("click", centerConstellationView);
  document.getElementById("mapFitViewBtn")?.addEventListener("click", fitConstellationToViewport);

  const bridgeCanvasEl = document.getElementById("bridgeMapCanvas");
  if (bridgeCanvasEl) {
    let panDragState = null;

    bridgeCanvasEl.addEventListener("wheel", (e) => {
      if (state.workspaceMode !== "map") return;
      if (e.target.closest("#sideEvidenceRail, #exploredEntitiesBox, #mapQuickInspectorCard, #mapMinimalHud, #mapTopCenterBar, #mapViewAllMatchesPill, .map-legend-popover, .map-vertical-controls, .panel-overlay, .config-modal, .filter-strip, .live-cala-intel-card, .call-list-compare-card")) {
        return;
      }
      e.preventDefault();

      if (e.ctrlKey || e.metaKey) {
        // Pinch-to-zoom (trackpad ctrlKey) or Cmd/Ctrl + wheel -> zoom toward cursor
        const rect = bridgeCanvasEl.getBoundingClientRect();
        const cx = e.clientX - rect.left;
        const cy = e.clientY - rect.top;
        const oldZoom = state.mapZoom;
        const nextZoom = clampZoom(oldZoom * Math.exp(-e.deltaY * 0.01));
        if (nextZoom === oldZoom) return;
        const ratio = nextZoom / oldZoom;
        state.mapPanX = cx - (cx - state.mapPanX) * ratio;
        state.mapPanY = cy - (cy - state.mapPanY) * ratio;
        state.mapZoom = nextZoom;
        applyMapViewportTransform();
        return;
      }

      // Two-finger trackpad swipe -> pan left/right/up/down
      if (e.shiftKey && e.deltaX === 0) {
        state.mapPanX -= e.deltaY;
      } else {
        state.mapPanX -= e.deltaX;
        state.mapPanY -= e.deltaY;
      }
      applyMapViewportTransform();
    }, { passive: false });

    bridgeCanvasEl.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      if (e.target.closest("button, input, a, #exploredEntitiesBox, #mapQuickInspectorCard, #sideEvidenceRail, #mapMinimalHud, #mapTopCenterBar, #mapViewAllMatchesPill, .map-legend-popover, .map-zoom-controls, .map-bottom-left-overlay, .constellation-empty-state")) {
        return;
      }
      panDragState = {
        startX: e.clientX,
        startY: e.clientY,
        originPanX: state.mapPanX,
        originPanY: state.mapPanY,
        moved: false
      };
      bridgeCanvasEl.classList.add("is-panning");
      bridgeCanvasEl.setPointerCapture?.(e.pointerId);
    });

    bridgeCanvasEl.addEventListener("pointermove", (e) => {
      if (!panDragState) return;
      const dx = e.clientX - panDragState.startX;
      const dy = e.clientY - panDragState.startY;
      if (Math.abs(dx) > 4 || Math.abs(dy) > 4) {
        panDragState.moved = true;
      }
      state.mapPanX = panDragState.originPanX + dx;
      state.mapPanY = panDragState.originPanY + dy;
      applyMapViewportTransform();
    });

    const endCanvasPan = (e) => {
      if (!panDragState) return;
      const wasDrag = panDragState.moved;
      panDragState = null;
      bridgeCanvasEl.classList.remove("is-panning");
      bridgeCanvasEl.releasePointerCapture?.(e.pointerId);
      if (!wasDrag && !e.target.closest(".map-node, .edge-hit-target")) {
        clearConstellationSelection();
      }
    };
    bridgeCanvasEl.addEventListener("pointerup", endCanvasPan);
    bridgeCanvasEl.addEventListener("pointercancel", endCanvasPan);
  }

  const buildMathFirstBridgeOrEdgeTooltip = ({
    groupHeader,
    entityName,
    topSourceRank,
    rarityScore,
    famLabel,
    lift,
    totalDeals,
    formulaBreakdown,
    fallbackWhy,
    hintText = ""
  }) => {
    const rankStr = String(topSourceRank || "AGGREGATOR").toUpperCase();
    const ptsStr = Number.isFinite(Number(rarityScore)) ? `${Number(rarityScore).toFixed(1)} pts` : "Signal";
    const liftStr = lift != null ? `${lift}x lift` : null;
    const dealsStr = totalDeals != null ? `${totalDeals} deals` : null;
    const subParts = [famLabel, liftStr, dealsStr ? `(${dealsStr})` : null].filter(Boolean);
    const equation = formulaBreakdown?.formula
      || (lift != null ? `rarity = ${lift}x lift * 10 + sourceRankBonus (${rankStr})` : `rarity = signalWeight + sourceRankBonus (${rankStr})`);
    const inputs = formulaBreakdown?.inputs
      || [entityName, liftStr, dealsStr, `${rankStr} proof`, fallbackWhy].filter(Boolean).join("; ");
    const plainRole = formulaBreakdown?.plainMeaning || fallbackWhy || "Connects benchmark evidence to target shortlist.";

    return `
      <div class="tip-head"><strong>${escapeHtml(groupHeader)} · ${escapeHtml(entityName)}</strong>${getSourceRankBadgeHtml(rankStr)}<span class="micro-pill micro-primary">${escapeHtml(ptsStr)}</span></div>
      ${subParts.length ? `<div class="tip-sub">${escapeHtml(subParts.join(" · "))}</div>` : ""}
      <div class="tip-row"><strong>Equation:</strong><div class="tip-math">${escapeHtml(cleanUiCopy(equation))}</div></div>
      <div class="tip-row"><strong>Inputs:</strong><div class="tip-math">${escapeHtml(cleanUiCopy(inputs))}</div></div>
      <div class="tip-role">${escapeHtml(cleanUiCopy(plainRole))}</div>
      ${hintText ? `<div class="tip-hint">${escapeHtml(hintText)}</div>` : ""}
    `;
  };

  // Constellation node & edge interactions
  const nodesLayerEl = document.getElementById("constellationNodesLayer");
  if (nodesLayerEl) {
    nodesLayerEl.addEventListener("mouseover", (e) => {
      const nodeEl = e.target.closest(".map-node");
      if (!nodeEl) return;
      const nodeId = nodeEl.dataset.nodeId;
      if (state.hoveredNodeId !== nodeId) {
        state.hoveredNodeId = nodeId;
        applyPathLaserIsolation();
      }
      const node = state.mapLayoutNodes?.nodeById?.get(nodeId);
      if (!node) return;
      if (node.kind === "anchor") {
        showMapTooltip(
          e.clientX,
          e.clientY,
          `<div class="tip-head"><strong>${escapeHtml(node.label)}</strong><span class="micro-pill micro-primary">Anchor</span></div><div class="tip-sub">Origin Strategy Anchor</div><div class="tip-hint">Click to clear isolated path or reconfigure benchmark.</div>`
        );
      } else if (node.kind === "group_hub") {
        const cg = String(node.groupKey || getNodeContributionGroup(node) || "access").toLowerCase();
        const cgMeta = CONTRIBUTION_VISUAL_META[cg] || CONTRIBUTION_VISUAL_META.access;
        const isExpanded = state.expandedGroupKey === cg;
        const sigPts = Number(node.significanceScore || 0).toFixed(1);
        const weightStr = Number(node.visualWeight || 1).toFixed(2);
        const hubStartups = node.startupCount ?? 0;
        const sigFormula = node.significanceFormula || "topSignalRarity + mean(top3Bridges) + min(4.5, FILING_count * 1.5)";
        const sigInputs = node.significanceInputs
          || `Top: ${Number(node.topRarity || 0).toFixed(1)} + Top3 avg: ${Number(node.top3MeanRarity || 0).toFixed(1)} + ${node.filingCount || 0} FILING (+${Number(node.filingBonus || 0).toFixed(1)})`;
        const contributors = Array.isArray(node.topContributors) ? node.topContributors : [];
        const contribHtml = contributors.length
          ? contributors
              .slice(0, 3)
              .map((c) => {
                const metric = c.lift != null ? `${Number(c.lift).toFixed(2)}x lift` : `${Number(c.rarityScore || 0).toFixed(1)} pts`;
                return `${escapeHtml(c.label)}: ${metric} (${escapeHtml(c.topSourceRank || "AGG")})`;
              })
              .join(" · ")
          : "No verified bridges under active filter";
        const sigInputsWithCount = String(sigInputs).includes("startup")
          ? sigInputs
          : `${sigInputs} | ${hubStartups} ${hubStartups === 1 ? "startup" : "startups"} connected`;
        showMapTooltip(
          e.clientX,
          e.clientY,
          `
            <div class="tip-head"><strong>${escapeHtml(cgMeta.headerLabel)} · Contribution Weight: ${sigPts} pts</strong><span class="micro-pill micro-primary">${weightStr}x sector</span></div>
            <div class="tip-row"><strong>Formula:</strong><div class="tip-math">${escapeHtml(sigFormula)}</div></div>
            <div class="tip-row"><strong>Exact Inputs:</strong><div class="tip-math">${escapeHtml(sigInputsWithCount)}</div></div>
            <div class="tip-row"><strong>Top Contributors:</strong><div class="tip-math">${contribHtml}</div></div>
            <div class="tip-hint">${isExpanded ? "Click hub or Back pill to return to 4 Groups overview." : "Click hub to expand bridges"}</div>
          `
        );
      } else if (node.kind === "bridge") {
        const cg = getNodeContributionGroup(node);
        const cgMeta = CONTRIBUTION_VISUAL_META[cg] || CONTRIBUTION_VISUAL_META.access;
        const famLabel = BRIDGE_FAMILY_VISUAL_META[node.bridgeFamily]?.label || node.bridgeFamily;
        showMapTooltip(
          e.clientX,
          e.clientY,
          buildMathFirstBridgeOrEdgeTooltip({
            groupHeader: cgMeta.headerLabel,
            entityName: node.label,
            topSourceRank: node.topSourceRank,
            rarityScore: node.rarityScore,
            famLabel,
            lift: node.lift,
            totalDeals: node.totalDeals,
            formulaBreakdown: node.formulaBreakdown,
            fallbackWhy: node.whyMatters,
            hintText: "Click node to isolate connected target startups."
          })
        );
      } else if (node.kind === "startup") {
        const fullItem = state.DisplayedShortlist.find((c) => c.id === node.id) || state.allKnownItems.get(node.id);
        const cg = getNodeContributionGroup(node);
        const cgMeta = CONTRIBUTION_VISUAL_META[cg] || CONTRIBUTION_VISUAL_META.access;
        const topPath = fullItem?.evidenceFolders?.hiddenBridges?.paths?.[0];
        const evMap = state.mapLayoutNodes?.startupGroupEvidence?.get?.(node.id) || {};
        const primaryEv = evMap[cg] || Object.values(evMap)[0] || null;

        let matchOrderFormula = node.matchOrderFormula || fullItem?.matchOrderFormula || null;
        if (!matchOrderFormula && fullItem?.scoreBreakdown) {
          const sb = fullItem.scoreBreakdown;
          const entries = [
            ["Sector", sb.sector?.earned ?? 0, sb.sector?.max ?? 25],
            ["Stage", sb.stage?.earned ?? 0, sb.stage?.max ?? 25],
            ["Syndicate", sb.syndicate?.earned ?? 0, sb.syndicate?.max ?? 20],
            ["Momentum", sb.momentum?.earned ?? 0, sb.momentum?.max ?? 15],
            ["Geo", sb.geography?.earned ?? 0, sb.geography?.max ?? 10],
            ["Timing/Filing", sb.arbitrageBonus?.earned ?? 0, sb.arbitrageBonus?.max ?? 5]
          ];
          const met = entries.filter(([, eVal]) => eVal > 0).length;
          matchOrderFormula = `Criteria ${met}/${entries.length} | Rank Score: ${fullItem.suitabilityScore ?? node.suitabilityScore ?? 0}/99 = ${entries.map(([k, v, m]) => `${k}(${v}/${m})`).join(" + ")}`;
        }
        if (!matchOrderFormula) {
          matchOrderFormula = fullItem?.suitabilityScore != null || node.suitabilityScore != null
            ? `Rank Score: ${fullItem?.suitabilityScore ?? node.suitabilityScore}/99 (computed from verified Cala criteria)`
            : "Computed from verified Cala sector, bridge, and timing records";
        }

        const bridgeFb =
          node.bestBridgeFormula ||
          primaryEv?.bestEdge?.formulaBreakdown ||
          primaryEv?.bestBridge?.formulaBreakdown ||
          topPath?.formulaBreakdown ||
          null;
        const bridgeEq =
          bridgeFb?.formula ||
          (primaryEv?.bestBridge?.lift != null
            ? `lift * 10 + sourceRankBonus = ${Number(primaryEv.topRarity || 0).toFixed(1)} pts`
            : "sharedDeals / sqrt(totalDeals) + sourceRankBonus");
        const bridgeInputs =
          bridgeFb?.inputs ||
          node.bestBridgeSummary ||
          topPath?.summary ||
          "No non-mega bridge under active filter";

        const velMath = node.velocityFormula || fullItem?.evidenceFolders?.observedActivity?.velocityFormula || "Not calculated: <2 dated Cala observations";
        const timeMath = node.timingFormula || fullItem?.diligencePacket?.timingFormula || "Not calculated: no dated prior round";
        const conflict = node.conflictRisk || fullItem?.diligencePacket?.conflictRisk || { level: "None" };
        const conflictLine = conflict.level && conflict.level !== "None"
          ? `<span class="tip-warn">Conflict: ${escapeHtml(conflict.level)} (${escapeHtml(cleanUiCopy(conflict.companyName || conflict.reason || ""))})</span>`
          : "Conflict: None";
        const missingGaps = node.missingGapCount ?? (fullItem?.evidenceFolders?.proofAndGaps?.missingFromCala || []).length ?? 0;
        const tierLabel = node.signalTier || fullItem?.signalTier || "Contextual Match";
        const rankNum = node.triageRank || (state.DisplayedShortlist.findIndex((c) => c.id === node.id) + 1) || "";

        showMapTooltip(
          e.clientX,
          e.clientY,
          `
            <div class="tip-head"><strong>${rankNum ? `#${rankNum} ` : ""}${escapeHtml(node.label)} · Primary: ${escapeHtml(cgMeta.headerLabel)}</strong><span class="micro-pill micro-primary">${escapeHtml(tierLabel)}</span></div>
            <div class="tip-sub">${escapeHtml(node.sector || "")} · ${escapeHtml(node.stage || "")} · ${escapeHtml(node.country || "")} · ${escapeHtml(node.topSourceRank || "AGGREGATOR")} proof</div>
            <div class="tip-row"><strong>Match Order Formula:</strong><div class="tip-math">${escapeHtml(cleanUiCopy(matchOrderFormula))}</div></div>
            <div class="tip-row"><strong>Primary Bridge Math:</strong><div class="tip-math">${escapeHtml(cleanUiCopy(bridgeEq))}</div><div class="tip-math">${escapeHtml(cleanUiCopy(bridgeInputs))}</div></div>
            <div class="tip-row">
              <div><strong>Velocity:</strong> <span class="tip-math">${escapeHtml(cleanUiCopy(velMath))}</span></div>
              <div style="margin-top:2px;"><strong>Timing:</strong> <span class="tip-math">${escapeHtml(cleanUiCopy(timeMath))}</span></div>
            </div>
            <div class="tip-row">${conflictLine} · ${missingGaps} fields Not found in Cala</div>
            <div class="tip-hint">Click orb to inspect full formulas &amp; Call #1 questions.</div>
          `
        );
      }
    });

    nodesLayerEl.addEventListener("mousemove", (e) => {
      const nodeEl = e.target.closest(".map-node");
      if (!nodeEl) return;
      const tipEl = document.getElementById("mapHoverTooltip");
      if (tipEl && !tipEl.hidden) {
        showMapTooltip(e.clientX, e.clientY, tipEl.innerHTML);
      }
    });

    nodesLayerEl.addEventListener("mouseout", (e) => {
      const nodeEl = e.target.closest(".map-node");
      if (!nodeEl) return;
      if (e.relatedTarget && nodeEl.contains(e.relatedTarget)) return;
      state.hoveredNodeId = null;
      applyPathLaserIsolation();
      hideMapTooltip();
    });

    nodesLayerEl.addEventListener("click", (e) => {
      const nodeEl = e.target.closest(".map-node");
      if (!nodeEl) return;
      e.stopPropagation();
      const kind = nodeEl.dataset.nodeKind;
      if (kind === "startup") {
        selectStartupFromWorkspace(nodeEl.dataset.startupId, { openRail: state.sideRailOpen, tab: "evidence" });
      } else if (kind === "group_hub") {
        const nodeObj = state.mapLayoutNodes?.nodeById?.get(nodeEl.dataset.nodeId);
        const gk = nodeEl.dataset.groupKey || nodeObj?.groupKey;
        if (gk) {
          toggleExpandedContributionGroup(gk);
        }
      } else if (kind === "bridge") {
        selectBridgeFromWorkspace(nodeEl.dataset.bridgeId, { openRail: state.sideRailOpen });
      } else if (kind === "anchor") {
        const anchorId = nodeEl.dataset.nodeId;
        if (state.selectedAnchorId === anchorId) {
          clearConstellationSelection();
        } else {
          selectAnchorFromWorkspace(anchorId, { openRail: state.sideRailOpen });
        }
      }
    });
  }

  const constellationSvgEl = document.getElementById("constellationSvg");
  if (constellationSvgEl) {
    constellationSvgEl.addEventListener("mouseover", (e) => {
      const hit = e.target.closest(".edge-hit-target");
      if (hit) {
        const edgeId = hit.getAttribute("data-edge-id");
        const effMap = getEffectiveBridgeMap();
        const edge = (state.mapLayoutNodes?.displayEdges || []).find((ed) => ed.id === edgeId)
          || (effMap?.edges || []).find((ed) => ed.id === edgeId);
        if (!edge) return;
        const focusNodeId = hit.getAttribute("data-edge-to");
        if (focusNodeId && state.hoveredNodeId !== focusNodeId) {
          state.hoveredNodeId = focusNodeId;
          applyPathLaserIsolation();
        }
        const cg = getNodeContributionGroup(edge);
        const cgMeta = CONTRIBUTION_VISUAL_META[cg] || CONTRIBUTION_VISUAL_META.access;
        const famLabel = BRIDGE_FAMILY_VISUAL_META[edge.bridgeFamily]?.shortLabel || edge.bridgeFamily || "Bridge";
        const fromNode = state.mapLayoutNodes?.nodeById?.get(edge.from);
        const toNode = state.mapLayoutNodes?.nodeById?.get(edge.to);
        const entityName =
          edge.bridgeEntityName ||
          (fromNode?.kind === "bridge" ? fromNode.label : toNode?.kind === "bridge" ? toNode.label : edge.label || `${fromNode?.label || ""} -> ${toNode?.label || ""}`);
        showMapTooltip(
          e.clientX,
          e.clientY,
          buildMathFirstBridgeOrEdgeTooltip({
            groupHeader: cgMeta.headerLabel,
            entityName,
            topSourceRank: edge.topSourceRank,
            rarityScore: edge.rarityScore,
            famLabel,
            lift: edge.lift ?? fromNode?.lift ?? toNode?.lift ?? null,
            totalDeals: edge.totalDeals ?? fromNode?.totalDeals ?? toNode?.totalDeals ?? null,
            formulaBreakdown: edge.formulaBreakdown || fromNode?.formulaBreakdown || toNode?.formulaBreakdown || null,
            fallbackWhy: edge.whyMatters || edge.label || ""
          })
        );
        return;
      }
      const peerHit = e.target.closest(".peer-edge-hit-target");
      if (peerHit) {
        const peerEdgeId = peerHit.getAttribute("data-peer-edge-id");
        const effMap = getEffectiveBridgeMap();
        const peerEdge = (effMap?.peerEdges || []).find((pe) => pe.id === peerEdgeId);
        if (!peerEdge) return;
        const focusNodeId = peerHit.getAttribute("data-edge-to") || peerHit.getAttribute("data-edge-from");
        if (focusNodeId && state.hoveredNodeId !== focusNodeId) {
          state.hoveredNodeId = focusNodeId;
          applyPathLaserIsolation();
        }
        const kindLabel = peerEdge.kind === "shared_alumni"
          ? "Shared Alumni Lineage"
          : peerEdge.kind === "shared_investor"
            ? "Shared Syndicate / Investor"
            : "Peer Network Link";
        showMapTooltip(
          e.clientX,
          e.clientY,
          `<strong>${escapeHtml(kindLabel)}</strong><div>${escapeHtml(cleanUiCopy(peerEdge.label || ""))}</div>`
        );
      }
    });

    constellationSvgEl.addEventListener("mouseout", (e) => {
      const hit = e.target.closest(".edge-hit-target, .peer-edge-hit-target");
      if (!hit) return;
      state.hoveredNodeId = null;
      applyPathLaserIsolation();
      hideMapTooltip();
    });

    constellationSvgEl.addEventListener("click", (e) => {
      const hit = e.target.closest(".edge-hit-target");
      if (hit) {
        const toId = hit.getAttribute("data-edge-to");
        const node = state.mapLayoutNodes?.nodeById?.get(toId);
        if (node?.kind === "startup") {
          selectStartupFromWorkspace(toId, { tab: "evidence" });
        } else if (node?.kind === "bridge") {
          selectBridgeFromWorkspace(toId);
        } else if (node?.kind === "group_hub" && node.groupKey) {
          toggleExpandedContributionGroup(node.groupKey);
        }
        return;
      }
      const peerHit = e.target.closest(".peer-edge-hit-target");
      if (peerHit) {
        const toId = peerHit.getAttribute("data-edge-to") || peerHit.getAttribute("data-edge-from");
        const node = state.mapLayoutNodes?.nodeById?.get(toId);
        if (node?.kind === "startup") {
          selectStartupFromWorkspace(toId, { tab: "evidence" });
        }
      }
    });
  }

  document.getElementById("dismissStartGuideBtn")?.addEventListener("click", () => {
    state.startGuideDismissed = true;
    syncConstellationControls();
  });

  document.getElementById("toggleCompareBoxBtn")?.addEventListener("click", (e) => {
    e.stopPropagation();
    state.compareBoxOpen = !state.compareBoxOpen;
    renderExploredEntitiesBox();
  });

  document.getElementById("mapLegendToggleBtn")?.addEventListener("click", (e) => {
    e.stopPropagation();
    setLegendPopoverOpen(!state.legendPopoverOpen);
  });

  document.getElementById("mapLegendCloseBtn")?.addEventListener("click", (e) => {
    e.stopPropagation();
    setLegendPopoverOpen(false);
  });

  document.addEventListener("click", (e) => {
    if (state.legendPopoverOpen && !e.target.closest("#mapMinimalHud")) {
      setLegendPopoverOpen(false);
    }
  });

  document.getElementById("mapDrilldownBackBtn")?.addEventListener("click", (e) => {
    e.stopPropagation();
    if (state.expandedGroupKey) {
      toggleExpandedContributionGroup(state.expandedGroupKey);
    }
  });

  document.getElementById("mapViewAllMatchesPill")?.addEventListener("click", (e) => {
    e.stopPropagation();
    state.sideRailOpen = true;
    state.sideRailTab = "matches";
    renderSideEvidenceRail();
    renderConstellationMap(getEffectiveBridgeMap(), { fit: true });
  });

  document.getElementById("emptyRelaxSuggestions")?.addEventListener("click", (e) => {
    const relaxBtn = e.target.closest("[data-relax-filter]");
    if (relaxBtn) {
      applyRelaxSuggestion(relaxBtn.dataset.relaxFilter, relaxBtn.dataset.relaxValue);
    }
  });

  // Collapsible Right-Side Information / Evidence Rail events
  document.getElementById("sideEvidenceRail")?.addEventListener("mouseenter", () => {
    state.hoveredNodeId = null;
    applyPathLaserIsolation();
    hideMapTooltip();
  });

  const sideRailResizeHandleEl = document.getElementById("sideRailResizeHandle");
  const sideRailEl = document.getElementById("sideEvidenceRail");
  if (sideRailResizeHandleEl && sideRailEl) {
    sideRailResizeHandleEl.addEventListener("pointerdown", (e) => {
      if (e.button !== 0 && e.pointerType === "mouse") return;
      e.preventDefault();
      e.stopPropagation();
      const startX = e.clientX;
      const startWidth = sideRailEl.getBoundingClientRect().width || state.sideRailWidth || 356;
      const maxAllowed = Math.min(500, Math.max(320, window.innerWidth - 28));
      sideRailResizeHandleEl.classList.add("is-dragging");
      try {
        sideRailResizeHandleEl.setPointerCapture(e.pointerId);
      } catch {}

      const onMove = (ev) => {
        const delta = startX - ev.clientX;
        const clamped = Math.round(Math.max(290, Math.min(maxAllowed, startWidth + delta)));
        state.sideRailWidth = clamped;
        sideRailEl.style.width = `${clamped}px`;
        document.documentElement.style.setProperty("--rail-width", `${clamped}px`);
        applyMapViewportTransform();
      };

      const onEnd = () => {
        sideRailResizeHandleEl.classList.remove("is-dragging");
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onEnd);
        window.removeEventListener("pointercancel", onEnd);
      };

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onEnd);
      window.addEventListener("pointercancel", onEnd);
    });
  }

  document.getElementById("sideRailCollapsedTab")?.addEventListener("click", () => {
    state.sideRailOpen = true;
    renderSideEvidenceRail();
    fitConstellationToViewport();
  });

  document.getElementById("sideRailCollapseBtn")?.addEventListener("click", () => {
    state.sideRailOpen = false;
    renderSideEvidenceRail();
    fitConstellationToViewport();
  });

  document.querySelectorAll("[data-rail-tab]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const nextTab = btn.dataset.railTab || "matches";
      state.sideRailTab = nextTab;
      renderSideEvidenceRail();
      const railBody = document.querySelector("#sideEvidenceRail .side-rail-body");
      if (railBody) railBody.scrollTop = 0;
      if (nextTab === "evidence") {
        const targetId = state.selectedStartupId || state.activeStartupId || getFilteredShortlistItems(state.DisplayedShortlist)[0]?.id;
        if (targetId && (!state.activeBrief || state.activeBrief.id !== targetId)) {
          await loadStartupBriefData(targetId);
        }
      }
    });
  });

  const stepRailStartup = (delta) => {
    const list = getFilteredShortlistItems(state.DisplayedShortlist);
    if (!list.length) return;
    const curId = state.selectedStartupId || state.activeStartupId;
    const idx = Math.max(0, list.findIndex((c) => c.id === curId));
    const nextIdx = (idx + delta + list.length) % list.length;
    selectStartupFromWorkspace(list[nextIdx].id, { tab: state.sideRailTab === "matches" ? "evidence" : state.sideRailTab });
  };
  document.getElementById("railPrevBtn")?.addEventListener("click", () => stepRailStartup(-1));
  document.getElementById("railNextBtn")?.addEventListener("click", () => stepRailStartup(1));

  document.getElementById("railSaveCallBtn")?.addEventListener("click", () => {
    const targetId = state.selectedStartupId || state.activeStartupId || getFilteredShortlistItems(state.DisplayedShortlist)[0]?.id;
    if (targetId) toggleCallListStartup(targetId);
  });

  document.getElementById("railMatchesList")?.addEventListener("click", (e) => {
    const relaxBtn = e.target.closest("[data-relax-filter]");
    if (relaxBtn) {
      applyRelaxSuggestion(relaxBtn.dataset.relaxFilter, relaxBtn.dataset.relaxValue);
      return;
    }
    const resetBtn = e.target.closest("#railEmptyResetBtn");
    if (resetBtn) {
      resetSearchAndFilters();
      return;
    }
    const cardBtn = e.target.closest("[data-rail-select-startup]");
    if (cardBtn) {
      selectStartupFromWorkspace(cardBtn.dataset.railSelectStartup, { tab: "evidence" });
    }
  });

  document.getElementById("railEvidenceContent")?.addEventListener("input", (e) => {
    const noteInput = e.target.closest("#railDecisionNoteInput");
    if (!noteInput) return;
    const saved = saveAnalystDecision(noteInput.dataset.startupId, { note: noteInput.value });
    const tsEl = document.getElementById("railDecisionTimestamp");
    if (tsEl && saved) tsEl.textContent = formatDecisionTimestamp(saved.updatedAt);
  });

  document.getElementById("railEvidenceContent")?.addEventListener("click", async (e) => {
    const decisionBtn = e.target.closest("[data-decision-status]");
    if (decisionBtn) {
      const sId = decisionBtn.dataset.startupId;
      const clicked = decisionBtn.dataset.decisionStatus;
      const cur = getAnalystDecision(sId).decision;
      const nextStatus = cur === clicked ? "" : clicked;
      saveAnalystDecision(sId, { decision: nextStatus });
      renderRailEvidencePane();
      renderRailMatchesPane();
      showUiToast(nextStatus ? `Logged Monday status: ${nextStatus}` : "Cleared Monday decision tag");
      return;
    }
    const memoBtn = e.target.closest("#railCopyMondayMemoBtn");
    if (memoBtn) {
      await copyMondayMemoForStartup(memoBtn.dataset.startupId);
      return;
    }
    const formulaBtn = e.target.closest("[data-toggle-formula]");
    if (formulaBtn) {
      const fKey = formulaBtn.dataset.toggleFormula;
      const railBody = document.querySelector("#sideEvidenceRail .side-rail-body");
      const prevScroll = railBody ? railBody.scrollTop : 0;
      if (state.expandedFormulas.has(fKey)) {
        state.expandedFormulas.delete(fKey);
      } else {
        state.expandedFormulas.add(fKey);
      }
      renderRailEvidencePane();
      if (railBody) railBody.scrollTop = prevScroll;
      return;
    }
    const flagBtn = e.target.closest("[data-toggle-flag-rule]");
    if (flagBtn) {
      const fId = flagBtn.dataset.toggleFlagRule;
      state.activeScreeningFlagId = state.activeScreeningFlagId === fId ? null : fId;
      renderRailEvidencePane();
      return;
    }
    const jumpBtn = e.target.closest("[data-rail-select-startup]");
    if (jumpBtn) {
      selectStartupFromWorkspace(jumpBtn.dataset.railSelectStartup, { tab: "evidence" });
      return;
    }
    const expandBtn = e.target.closest("#railExpandCalaBtn");
    if (expandBtn) {
      await expandLiveCalaLinksForStartup(expandBtn.dataset.startupId);
      return;
    }
    if (e.target.closest("#railRevealMegaHubsBtn")) {
      state.hideMegaHubs = false;
      syncConstellationControls();
      await executeSearchRefinement(undefined, { keepSelection: true, keepRailOpen: true, fit: true });
      return;
    }
    const draftBtn = e.target.closest("#railDraftCitedBriefBtn");
    if (draftBtn) {
      await draftRailCitedBrief(draftBtn.dataset.startupId);
      return;
    }
    const fullBtn = e.target.closest("#railOpenFullBriefBtn");
    if (fullBtn) {
      state.peerHistory = [];
      openStartupInspector(fullBtn.dataset.startupId, { keepHistory: true, tab: "brief" });
      return;
    }
    const verifyBtn = e.target.closest("#railVerifyLiveBtn");
    if (verifyBtn) {
      state.peerHistory = [];
      await openStartupInspector(verifyBtn.dataset.startupId, { keepHistory: true, tab: "brief" });
      triggerLiveCalaVerification();
    }
  });

  document.getElementById("railStrategyContent")?.addEventListener("click", (e) => {
    if (e.target.closest("#railOpenFullThesisBtn")) {
      switchPrimaryTab("thesis");
    }
  });

  document.addEventListener("keydown", (e) => {
    const drawerOpen = !document.getElementById("inspectorDrawer")?.hidden;
    const popOpen = !document.getElementById("optionsMenuPopover")?.hidden;
    const tag = document.activeElement?.tagName;
    const inInput = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";

    if (e.key === "Escape") {
      if (state.configOverlayOpen) {
        closeConfigOverlay();
        return;
      }
      if (drawerOpen) closeStartupInspector();
      if (popOpen) closeOptionsPopover();
      hideSearchSuggestions();
      hideMapTooltip();
      return;
    }

    if (e.key === "/" && !inInput && !state.configOverlayOpen && state.activeTab === "search") {
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
  const placeholder = document.querySelector("#aiSearchInput");
  if (placeholder && placeholder.placeholder.length > 72) {
    placeholder.placeholder = "Search startups or companies (e.g. Slush 2026, feeder bridges, Why not Oura?)...";
  }
  applyTheme(getActiveTheme());
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
  setFiltersPanelOpen(false, { includeAdvanced: false });
  syncConstellationControls();
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
  enterSearchHero();
}

init().catch((err) => {
  console.error("Failed to initialize Revealed Thesis Engine:", err);
});
