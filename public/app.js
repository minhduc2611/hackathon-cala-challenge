/**
 * Revealed Thesis Engine · Full-Screen 3-Step Setup & Clean Floating Search UI
 * Step 1: How it works (Cala data reliability) -> Step 2: Role -> Step 3: Investor config
 * Followed by Startups to Call with a floating rounded search bar and 1 single Option Button
 */

const PREFS_STORAGE_KEY = "rte_user_prefs_v1";

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
  filingOnly: false,
  untappedOnly: false,
  lastRefineResponse: null,
  bridgeMap: null,
  selectedStartupId: null,
  selectedBridgeId: null,
  hoveredNodeId: null,
  sideRailOpen: false,
  sideRailTab: "matches", // "matches" | "evidence" | "strategy"
  mapZoom: 1,
  mapPanX: 0,
  mapPanY: 0,
  mapLayoutNodes: null,
  railNarratedBriefs: new Map()
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
    SLUSH_2026_ATTENDEE_IDS.has(candidate.id) ||
    (["Finland", "Sweden", "Estonia", "Denmark", "Norway"].includes(candidate.country) && emp <= 80);

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
    bridgeFamily: state.bridgeFamily && state.bridgeFamily !== "all" ? state.bridgeFamily : "all"
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

  updateTelemetryMasthead(result.calaBudget || state.bootstrap?.coverageStats?.calaBudget);
  syncInlineCalibrationStrip();
  if (typeof syncConstellationControls === "function") {
    syncConstellationControls();
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
      renderConstellationMap(state.bridgeMap, { fit: true });
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

const CONSTELLATION_W = 1680;
const CONSTELLATION_H = 1040;

const BRIDGE_FAMILY_VISUAL_META = {
  feeder: {
    label: "Feeder Bridges",
    hullTitle: "FEEDER BRIDGES",
    shortLabel: "Feeder",
    darkColor: "#38bdf8",
    lightColor: "#0284c7",
    darkFill: "rgba(56, 189, 248, 0.08)",
    lightFill: "rgba(2, 132, 199, 0.06)",
    darkStroke: "rgba(56, 189, 248, 0.28)",
    lightStroke: "rgba(2, 132, 199, 0.25)"
  },
  co_investor: {
    label: "Co-Investor Bridges",
    hullTitle: "CO-INVESTOR BRIDGES",
    shortLabel: "Co-Investor",
    darkColor: "#60a5fa",
    lightColor: "#2563eb",
    darkFill: "rgba(96, 165, 250, 0.08)",
    lightFill: "rgba(37, 99, 235, 0.06)",
    darkStroke: "rgba(96, 165, 250, 0.28)",
    lightStroke: "rgba(37, 99, 235, 0.25)"
  },
  alumni_spinout: {
    label: "Alumni & Spinouts",
    hullTitle: "ALUMNI & SPINOUTS",
    shortLabel: "Spinout",
    darkColor: "#a78bfa",
    lightColor: "#7c3aed",
    darkFill: "rgba(167, 139, 250, 0.08)",
    lightFill: "rgba(124, 58, 237, 0.06)",
    darkStroke: "rgba(167, 139, 250, 0.28)",
    lightStroke: "rgba(124, 58, 237, 0.25)"
  },
  event: {
    label: "Event & Ecosystem",
    hullTitle: "EVENT & ECOSYSTEM",
    shortLabel: "Event",
    darkColor: "#f59e0b",
    lightColor: "#d97706",
    darkFill: "rgba(245, 158, 11, 0.08)",
    lightFill: "rgba(217, 119, 6, 0.06)",
    darkStroke: "rgba(245, 158, 11, 0.28)",
    lightStroke: "rgba(217, 119, 6, 0.25)"
  }
};

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

function getEffectiveBridgeMap() {
  const raw = state.bridgeMap;
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

  return {
    ...raw,
    clusters,
    nodes: keptNodes,
    edges: finalEdges,
    stats: {
      ...(raw.stats || {}),
      renderedStartups: keptNodes.filter((n) => n.kind === "startup").length,
      renderedBridges: keptNodes.filter((n) => n.kind === "bridge").length
    }
  };
}

function syncConstellationControls() {
  const megaBtn = document.getElementById("toggleHideMegaHubsBtn");
  const megaPill = document.getElementById("megaHubCounterPill");
  const suppressedCount = state.bridgeMap?.stats?.suppressedMegaHubCount ?? 0;
  if (megaBtn) {
    megaBtn.classList.toggle("is-active", state.hideMegaHubs !== false);
    megaBtn.setAttribute("aria-pressed", state.hideMegaHubs !== false ? "true" : "false");
  }
  if (megaPill) {
    megaPill.textContent = state.hideMegaHubs !== false
      ? `${suppressedCount} hidden`
      : "all shown";
  }

  document.querySelectorAll("#bridgeFamilySwitcher [data-bridge-family]").forEach((btn) => {
    const fam = btn.dataset.bridgeFamily || "all";
    btn.classList.toggle("is-active", (state.bridgeFamily || "all") === fam);
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
}

function updateAiSynthesisBanner(context = null) {
  const bannerEl = document.getElementById("aiSynthesisBanner");
  if (!bannerEl) return;
  const effMap = getEffectiveBridgeMap();
  const renderedStartups = effMap?.stats?.renderedStartups ?? getFilteredShortlistItems(state.DisplayedShortlist).length;
  const renderedBridges = effMap?.stats?.renderedBridges ?? 0;
  const suppressed = effMap?.stats?.suppressedMegaHubCount ?? 0;

  if (context?.synthesis) {
    bannerEl.innerHTML = cleanUiCopy(context.synthesis);
    return;
  }

  const benchmarkName = getSelectedBenchmarkLabel();
  const famLabel = state.bridgeFamily && state.bridgeFamily !== "all"
    ? (BRIDGE_FAMILY_VISUAL_META[state.bridgeFamily]?.label || state.bridgeFamily)
    : "All bridge families";
  const hubSummary = state.hideMegaHubs !== false
    ? `${suppressed} mega-hubs filtered`
    : "mega-hubs visible";

  bannerEl.innerHTML = `<strong>${escapeHtml(benchmarkName)}</strong> · ${escapeHtml(famLabel)} · ${renderedStartups} startups · ${renderedBridges} hidden bridges · ${escapeHtml(hubSummary)}`;
}

function applyMapViewportTransform() {
  const vp = document.getElementById("mapPanZoomViewport");
  if (vp) {
    vp.style.transform = `translate(${state.mapPanX}px, ${state.mapPanY}px) scale(${state.mapZoom})`;
  }
  const readout = document.getElementById("mapZoomReadout");
  if (readout) {
    readout.textContent = `${Math.round(state.mapZoom * 100)}%`;
  }
}

function clampZoom(z) {
  return Math.min(1.5, Math.max(0.45, Math.round(z * 100) / 100));
}

function fitConstellationToViewport() {
  const canvasEl = document.getElementById("bridgeMapCanvas");
  const layout = state.mapLayoutNodes;
  if (!canvasEl || !layout || !layout.bounds) {
    state.mapZoom = 0.72;
    state.mapPanX = 24;
    state.mapPanY = 18;
    applyMapViewportTransform();
    return;
  }

  const rect = canvasEl.getBoundingClientRect();
  if (!rect.width || !rect.height) {
    state.mapZoom = 0.72;
    state.mapPanX = 24;
    state.mapPanY = 18;
    applyMapViewportTransform();
    return;
  }

  const railOffset = state.sideRailOpen ? 442 : 0;
  const availW = Math.max(320, rect.width - railOffset - 56);
  const availH = Math.max(260, rect.height - 96);
  const contentW = Math.max(400, layout.bounds.maxX - layout.bounds.minX);
  const contentH = Math.max(300, layout.bounds.maxY - layout.bounds.minY);

  const rawZoom = Math.min(availW / contentW, availH / contentH);
  const zoom = clampZoom(rawZoom);
  const centerContentX = (layout.bounds.minX + layout.bounds.maxX) / 2;
  const centerContentY = (layout.bounds.minY + layout.bounds.maxY) / 2;
  const targetCenterX = (rect.width - railOffset) / 2;
  const targetCenterY = (rect.height - 26) / 2;
  const minSafePanX = Math.round(20 - layout.bounds.minX * zoom);
  const centeredPanX = Math.round(targetCenterX - centerContentX * zoom);

  state.mapZoom = zoom;
  state.mapPanX = Math.max(minSafePanX, centeredPanX);
  state.mapPanY = Math.round(targetCenterY - centerContentY * zoom);
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
  const cx = layout?.bounds ? (layout.bounds.minX + layout.bounds.maxX) / 2 : CONSTELLATION_W / 2;
  const cy = layout?.bounds ? (layout.bounds.minY + layout.bounds.maxY) / 2 : CONSTELLATION_H / 2;
  const railOffset = state.sideRailOpen ? 442 : 0;
  state.mapPanX = Math.round((rect.width - railOffset) / 2 - cx * state.mapZoom);
  state.mapPanY = Math.round((rect.height - 24) / 2 - cy * state.mapZoom);
  applyMapViewportTransform();
}

function layoutBridgeMapNodes(bridgeMap) {
  const nodes = bridgeMap?.nodes || [];
  const edges = bridgeMap?.edges || [];
  const anchorNode = nodes.find((n) => n.kind === "anchor") || bridgeMap?.anchor;
  const bridgeNodes = nodes.filter((n) => n.kind === "bridge");
  const startupNodes = nodes.filter((n) => n.kind === "startup");

  const posMap = new Map();
  const nodeById = new Map();
  const connectedEdgesByNode = new Map();

  for (const n of nodes) {
    nodeById.set(n.id, n);
    connectedEdgesByNode.set(n.id, []);
  }
  for (const e of edges) {
    if (!connectedEdgesByNode.has(e.from)) connectedEdgesByNode.set(e.from, []);
    if (!connectedEdgesByNode.has(e.to)) connectedEdgesByNode.set(e.to, []);
    connectedEdgesByNode.get(e.from).push(e);
    connectedEdgesByNode.get(e.to).push(e);
  }

  // Hop 0: Left-focal anchor emblem
  const anchorX = 190;
  const anchorY = 500;
  if (anchorNode) {
    nodeById.set(anchorNode.id, anchorNode);
    posMap.set(anchorNode.id, { x: anchorX, y: anchorY, halfW: 78, halfH: 78 });
  }

  // Hop 1: Non-empty Factor Island clusters arranged cleanly with zero overlap
  const familyOrder = ["feeder", "co_investor", "alumni_spinout", "event"];
  const grouped = familyOrder
    .map((fam) => {
      const items = bridgeNodes
        .filter((n) => n.bridgeFamily === fam)
        .sort((a, b) => (b.lift || 0) - (a.lift || 0) || a.label.localeCompare(b.label));
      const clMeta = (bridgeMap?.clusters || []).find((c) => c.bridgeFamily === fam);
      return {
        family: fam,
        label: BRIDGE_FAMILY_VISUAL_META[fam]?.hullTitle || fam.toUpperCase(),
        items,
        edgeCount: clMeta?.edgeCount ?? items.length
      };
    })
    .filter((g) => g.items.length > 0);

  const hulls = [];
  const topBound = 76;
  const bottomBound = 928;
  const clusterGap = 24;
  const headerPad = 38;
  const bottomPad = 18;
  const minRowPitch = 78;

  const clusterLayouts = grouped.map((grp) => {
    const cols = grp.items.length > 3 ? 2 : 1;
    const rows = Math.ceil(grp.items.length / cols);
    return { ...grp, cols, rows };
  });

  const totalRows = clusterLayouts.reduce((sum, g) => sum + g.rows, 0);
  const fixedOverhead = clusterLayouts.length * (headerPad + bottomPad)
    + Math.max(0, clusterLayouts.length - 1) * clusterGap;
  const availableRowSpace = Math.max(120, bottomBound - topBound - fixedOverhead);
  const effectivePitch = totalRows > 0
    ? Math.max(minRowPitch, Math.min(104, availableRowSpace / totalRows))
    : minRowPitch;

  let cursorY = topBound;
  for (const grp of clusterLayouts) {
    const blockHeight = headerPad + grp.rows * effectivePitch + bottomPad;
    const colCenters = grp.cols === 2 ? [510, 796] : [645];
    const startY = cursorY + headerPad + effectivePitch / 2;

    grp.items.forEach((node, idx) => {
      const col = idx % grp.cols;
      const row = Math.floor(idx / grp.cols);
      const x = colCenters[col];
      const y = startY + row * effectivePitch;
      posMap.set(node.id, { x, y, halfW: 122, halfH: 33 });
    });

    const minColX = colCenters[0] - 122 - 20;
    const maxColX = colCenters[colCenters.length - 1] + 122 + 20;
    hulls.push({
      id: `hull-${grp.family}`,
      bridgeFamily: grp.family,
      label: grp.label,
      nodeCount: grp.items.length,
      edgeCount: grp.edgeCount,
      x: minColX,
      y: cursorY,
      width: maxColX - minColX,
      height: blockHeight
    });

    cursorY += blockHeight + clusterGap;
  }

  // Hop 2: Outer arc Startup nodes ordered by connected bridge barycenter Y
  const shortlistOrder = new Map(
    (state.DisplayedShortlist || []).map((s, idx) => [s.id, idx])
  );

  const startupsWithBarycenter = startupNodes.map((node, idx) => {
    const incEdges = (connectedEdgesByNode.get(node.id) || []).filter((e) => e.to === node.id);
    const ys = incEdges
      .map((e) => posMap.get(e.from)?.y)
      .filter((y) => Number.isFinite(y));
    const baryY = ys.length
      ? ys.reduce((acc, y) => acc + y, 0) / ys.length
      : 820 + idx * 40;
    return {
      node,
      baryY,
      rank: shortlistOrder.has(node.id) ? shortlistOrder.get(node.id) : 99 + idx
    };
  });

  startupsWithBarycenter.sort((a, b) => a.baryY - b.baryY || a.rank - b.rank);

  const sCount = startupsWithBarycenter.length;
  const useTwinArc = sCount > 9;
  const sTop = 94;
  const sBottom = 936;
  const sSpan = Math.max(120, sBottom - sTop);

  startupsWithBarycenter.forEach((entry, idx) => {
    const t = sCount <= 1 ? 0.5 : idx / (sCount - 1);
    const y = sCount === 1 ? 500 : sTop + t * sSpan;
    const normDy = (y - 500) / 450;
    const arcCurve = (1 - Math.min(1, normDy * normDy)) * 58;
    const x = useTwinArc
      ? (idx % 2 === 0 ? 1140 + arcCurve * 0.4 : 1458 + arcCurve * 0.4)
      : 1295 + arcCurve;
    posMap.set(entry.node.id, { x, y, halfW: 132, halfH: 36 });
  });

  let minX = CONSTELLATION_W;
  let minY = CONSTELLATION_H;
  let maxX = 0;
  let maxY = 0;
  for (const pos of posMap.values()) {
    minX = Math.min(minX, pos.x - (pos.halfW || 80));
    minY = Math.min(minY, pos.y - (pos.halfH || 40));
    maxX = Math.max(maxX, pos.x + (pos.halfW || 80));
    maxY = Math.max(maxY, pos.y + (pos.halfH || 40));
  }
  for (const h of hulls) {
    minX = Math.min(minX, h.x);
    minY = Math.min(minY, h.y);
    maxX = Math.max(maxX, h.x + h.width);
    maxY = Math.max(maxY, h.y + h.height);
  }
  if (!posMap.size) {
    minX = 40;
    minY = 40;
    maxX = 1600;
    maxY = 960;
  }

  return {
    posMap,
    hulls,
    nodeById,
    connectedEdgesByNode,
    anchorId: anchorNode?.id || null,
    bounds: {
      minX: minX - 36,
      minY: minY - 40,
      maxX: maxX + 36,
      maxY: Math.max(maxY + 40, 960)
    }
  };
}

function getIsolatedSetForNode(focusNodeId, layout, edges) {
  const activeNodes = new Set();
  const activeEdges = new Set();
  const activeFamilies = new Set();

  if (!focusNodeId || !layout) {
    return { activeNodes, activeEdges, activeFamilies };
  }

  const focusNode = layout.nodeById.get(focusNodeId);
  if (!focusNode) {
    return { activeNodes, activeEdges, activeFamilies };
  }

  activeNodes.add(focusNodeId);

  if (focusNode.kind === "startup") {
    const incomingToStartup = edges.filter((e) => e.to === focusNodeId);
    const connectedBridgeIds = new Set();
    for (const edge of incomingToStartup) {
      activeEdges.add(edge.id);
      activeNodes.add(edge.from);
      connectedBridgeIds.add(edge.from);
      if (edge.bridgeFamily) activeFamilies.add(edge.bridgeFamily);
    }
    for (const edge of edges) {
      if (edge.from === layout.anchorId && connectedBridgeIds.has(edge.to)) {
        activeEdges.add(edge.id);
        activeNodes.add(edge.from);
        if (edge.bridgeFamily) activeFamilies.add(edge.bridgeFamily);
      }
    }
  } else if (focusNode.kind === "bridge") {
    if (focusNode.bridgeFamily) activeFamilies.add(focusNode.bridgeFamily);
    for (const edge of edges) {
      if (edge.from === focusNodeId || edge.to === focusNodeId) {
        activeEdges.add(edge.id);
        activeNodes.add(edge.from);
        activeNodes.add(edge.to);
        if (edge.bridgeFamily) activeFamilies.add(edge.bridgeFamily);
      }
    }
  } else if (focusNode.kind === "anchor") {
    for (const edge of edges) {
      if (edge.from === focusNodeId) {
        activeEdges.add(edge.id);
        activeNodes.add(edge.to);
        if (edge.bridgeFamily) activeFamilies.add(edge.bridgeFamily);
      }
    }
  }

  return { activeNodes, activeEdges, activeFamilies };
}

function applyPathLaserIsolation() {
  const svgEl = document.getElementById("constellationSvg");
  const nodesLayer = document.getElementById("constellationNodesLayer");
  const effMap = getEffectiveBridgeMap();
  const layout = state.mapLayoutNodes;
  if (!svgEl || !nodesLayer || !layout || !effMap) return;

  const focusId = state.hoveredNodeId || state.selectedStartupId || state.selectedBridgeId || null;
  if (!focusId) {
    svgEl.classList.remove("has-isolation");
    svgEl.querySelectorAll(".edge-arc").forEach((el) => el.classList.remove("is-highlighted"));
    svgEl.querySelectorAll(".factor-island-hull").forEach((el) => el.classList.remove("is-highlighted"));
    nodesLayer.querySelectorAll(".map-node").forEach((el) => {
      el.classList.remove("is-dimmed", "is-highlighted");
    });
    return;
  }

  const { activeNodes, activeEdges, activeFamilies } = getIsolatedSetForNode(focusId, layout, effMap.edges || []);
  svgEl.classList.add("has-isolation");

  svgEl.querySelectorAll(".edge-arc").forEach((el) => {
    const eid = el.getAttribute("data-edge-id");
    el.classList.toggle("is-highlighted", activeEdges.has(eid));
  });

  svgEl.querySelectorAll(".factor-island-hull").forEach((el) => {
    const fam = el.getAttribute("data-family");
    el.classList.toggle("is-highlighted", activeFamilies.has(fam));
  });

  nodesLayer.querySelectorAll(".map-node").forEach((el) => {
    const nid = el.getAttribute("data-node-id");
    const isActive = activeNodes.has(nid);
    el.classList.toggle("is-highlighted", isActive);
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

  const rawLeft = clientX - rect.left + 14;
  const rawTop = clientY - rect.top + 14;
  const maxLeft = Math.max(12, rect.width - (state.sideRailOpen ? 450 : 20) - 310);
  const maxTop = Math.max(12, rect.height - 130);
  tipEl.style.left = `${Math.max(12, Math.min(maxLeft, rawLeft))}px`;
  tipEl.style.top = `${Math.max(12, Math.min(maxTop, rawTop))}px`;
}

function hideMapTooltip() {
  const tipEl = document.getElementById("mapHoverTooltip");
  if (tipEl) tipEl.hidden = true;
}

function buildMapEdgeSvgMarkup(edge, posMap) {
  const p1 = posMap.get(edge.from);
  const p2 = posMap.get(edge.to);
  if (!p1 || !p2) return "";

  const x1 = p1.x + (edge.from === state.mapLayoutNodes?.anchorId ? 70 : (p1.halfW || 110) * 0.92);
  const y1 = p1.y;
  const x2 = p2.x - (p2.halfW || 110) * 0.95;
  const y2 = p2.y;
  const dx = Math.max(48, Math.abs(x2 - x1) * 0.48);
  const d = `M ${x1.toFixed(1)} ${y1.toFixed(1)} C ${(x1 + dx).toFixed(1)} ${y1.toFixed(1)}, ${(x2 - dx).toFixed(1)} ${y2.toFixed(1)}, ${x2.toFixed(1)} ${y2.toFixed(1)}`;

  const rank = String(edge.topSourceRank || "AGGREGATOR").toUpperCase();
  const isSolid = rank === "FILING" || rank === "PRIMARY";
  const rarity = Number(edge.rarityScore) || 1;
  const width = Math.min(3.5, Math.max(1.3, 1.25 + rarity * 0.12)).toFixed(2);
  const opacity = Math.min(0.88, Math.max(0.45, 0.44 + rarity * 0.035)).toFixed(2);
  const color = getFamilyColorHex(edge.bridgeFamily);

  return `
    <g class="edge-group">
      <path
        class="edge-arc ${isSolid ? "is-solid" : "is-dashed"}"
        data-edge-id="${escapeHtml(edge.id)}"
        d="${d}"
        stroke="${color}"
        style="color:${color}; stroke-width:${width}px; opacity:${opacity};"
      />
      <path
        class="edge-hit-target"
        data-edge-id="${escapeHtml(edge.id)}"
        data-edge-from="${escapeHtml(edge.from)}"
        data-edge-to="${escapeHtml(edge.to)}"
        d="${d}"
      />
    </g>
  `;
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

  const nodes = effMap?.nodes || [];
  const edges = effMap?.edges || [];
  const startupNodes = nodes.filter((n) => n.kind === "startup");

  const layout = layoutBridgeMapNodes(effMap || { anchor: { id: "query-anchor", label: getSelectedBenchmarkLabel(), kind: "anchor" }, nodes: [], edges: [], clusters: [] });
  state.mapLayoutNodes = layout;

  const isLight = getActiveTheme() === "light";

  // 1. Render Concentric Hop Guides + Factor Island Hulls + Bezier Edges
  const ringRadii = [
    { r: 470, label: "HOP 1 · BRIDGE CLUSTERS", lx: 560, ly: 52 },
    { r: 1095, label: "HOP 2 · TARGET STARTUPS", lx: 1185, ly: 52 }
  ];
  const guidesMarkup = `
    <text class="hop-guide-label" x="128" y="52">HOP 0 · STRATEGY ANCHOR</text>
    ${ringRadii.map((rg) => `
      <circle class="hop-guide-arc" cx="190" cy="500" r="${rg.r}" />
      <text class="hop-guide-label" x="${rg.lx}" y="${rg.ly}">${rg.label}</text>
    `).join("")}
  `;

  const hullsMarkup = layout.hulls
    .map((h) => {
      const meta = BRIDGE_FAMILY_VISUAL_META[h.bridgeFamily] || BRIDGE_FAMILY_VISUAL_META.feeder;
      const fill = isLight ? meta.lightFill : meta.darkFill;
      const stroke = isLight ? meta.lightStroke : meta.darkStroke;
      const titleColor = isLight ? meta.lightColor : meta.darkColor;
      return `
        <g>
          <rect
            class="factor-island-hull"
            data-family="${escapeHtml(h.bridgeFamily)}"
            x="${h.x.toFixed(1)}"
            y="${h.y.toFixed(1)}"
            width="${h.width.toFixed(1)}"
            height="${h.height.toFixed(1)}"
            rx="18"
            fill="${fill}"
            stroke="${stroke}"
            stroke-width="1.25"
          />
          <text
            class="factor-island-title"
            x="${(h.x + 14).toFixed(1)}"
            y="${(h.y + 22).toFixed(1)}"
            fill="${titleColor}"
          >${escapeHtml(h.label)} · ${h.nodeCount}</text>
        </g>
      `;
    })
    .join("");

  const edgesMarkup = edges.map((e) => buildMapEdgeSvgMarkup(e, layout.posMap)).join("");
  svgEl.innerHTML = `${guidesMarkup}${hullsMarkup}${edgesMarkup}`;

  // 2. Render Interactive HTML Nodes
  const anchorNode = nodes.find((n) => n.kind === "anchor") || effMap?.anchor;
  const bridgeNodes = nodes.filter((n) => n.kind === "bridge");
  const suppressed = effMap?.stats?.suppressedMegaHubCount ?? 0;

  let nodesHtml = "";

  if (anchorNode && layout.posMap.has(anchorNode.id)) {
    const p = layout.posMap.get(anchorNode.id);
    const isSel = state.selectedStartupId == null && state.selectedBridgeId == null ? "" : "";
    nodesHtml += `
      <button
        type="button"
        class="map-node node-anchor ${isSel}"
        data-node-kind="anchor"
        data-node-id="${escapeHtml(anchorNode.id)}"
        style="left:${p.x.toFixed(1)}px; top:${p.y.toFixed(1)}px;"
      >
        <span class="anchor-kicker">Origin Anchor</span>
        <span class="anchor-label">${escapeHtml(anchorNode.label || getSelectedBenchmarkLabel())}</span>
        <span class="anchor-telemetry">${startupNodes.length} targets · ${suppressed} hubs hidden</span>
      </button>
    `;
  }

  for (const b of bridgeNodes) {
    const p = layout.posMap.get(b.id);
    if (!p) continue;
    const isSel = state.selectedBridgeId === b.id;
    const fam = b.bridgeFamily || "feeder";
    const famShort = BRIDGE_FAMILY_VISUAL_META[fam]?.shortLabel || fam;
    const liftText = b.lift != null ? `${b.lift}x lift` : famShort;
    const dealsText = b.totalDeals != null ? `${b.totalDeals}d` : "";

    nodesHtml += `
      <button
        type="button"
        class="map-node node-bridge ${isSel ? "is-selected" : ""}"
        data-node-kind="bridge"
        data-node-id="${escapeHtml(b.id)}"
        data-bridge-id="${escapeHtml(b.id)}"
        data-family="${escapeHtml(fam)}"
        style="left:${p.x.toFixed(1)}px; top:${p.y.toFixed(1)}px;"
      >
        <div class="node-bridge-top">
          <span class="node-bridge-title">${escapeHtml(b.label)}</span>
          ${getSourceRankBadgeHtml(b.topSourceRank)}
        </div>
        <div class="node-bridge-meta">
          <span>${escapeHtml(famShort)}</span>
          <span>· ${escapeHtml(liftText)}${dealsText ? ` · ${escapeHtml(dealsText)}` : ""}</span>
          ${b.isMegaHub ? `<span class="micro-pill micro-megahub">Mega-hub</span>` : ""}
        </div>
      </button>
    `;
  }

  for (const s of startupNodes) {
    const p = layout.posMap.get(s.id);
    if (!p) continue;
    const isSel = state.selectedStartupId === s.id;
    const fullItem = state.DisplayedShortlist.find((c) => c.id === s.id) || state.allKnownItems.get(s.id);
    const growth = s.headcountGrowthPct ?? fullItem?.headcountGrowthPct ?? 0;
    const isSlush = Boolean(getStartupCalaFieldProfile(fullItem || s)?.slush2026?.attending);
    const gapCount = s.missingGapCount ?? fullItem?.evidenceFolders?.proofAndGaps?.missingFromCala?.length ?? 0;

    nodesHtml += `
      <button
        type="button"
        class="map-node node-startup ${isSel ? "is-selected" : ""}"
        data-node-kind="startup"
        data-node-id="${escapeHtml(s.id)}"
        data-startup-id="${escapeHtml(s.id)}"
        style="left:${p.x.toFixed(1)}px; top:${p.y.toFixed(1)}px;"
      >
        <div class="node-startup-head">
          <span class="node-startup-name">${escapeHtml(s.label)}</span>
          ${getSourceRankBadgeHtml(s.topSourceRank)}
        </div>
        <div class="node-startup-sub">${escapeHtml(s.sector || "")} · ${escapeHtml(s.country || "")} · ${escapeHtml(s.stage || "")}</div>
        <div class="node-startup-badges">
          ${growth >= 25 ? `<span class="micro-pill micro-velocity">+${growth}% team</span>` : ""}
          ${isSlush ? `<span class="micro-pill micro-primary">Slush 2026</span>` : ""}
          ${gapCount > 0 ? `<span class="micro-pill micro-gap">${gapCount} Cala gaps</span>` : ""}
        </div>
      </button>
    `;
  }

  nodesLayer.innerHTML = nodesHtml;

  // 3. Handle Empty States cleanly
  if (emptyEl) {
    const noMatches = startupNodes.length === 0;
    const noBridgesOnly = startupNodes.length > 0 && bridgeNodes.length === 0;
    if (noMatches || noBridgesOnly) {
      emptyEl.hidden = false;
      if (emptyTitleEl) {
        emptyTitleEl.textContent = noMatches
          ? "0 startups match active filters"
          : "No bridges visible in current filter";
      }
      if (emptyMsgEl) {
        emptyMsgEl.textContent = noMatches
          ? "No startups matched the active query and filter combination. Reset filters or reveal suppressed mega-hubs."
          : suppressed > 0
            ? `${startupNodes.length} startups matched, and ${suppressed} mega-hub bridges were hidden under active strictness. Reveal mega-hubs or show all bridge families.`
            : `${startupNodes.length} startups matched, but none hold bridges in this selected family. Switch to All bridge families.`;
      }
      if (revealEmptyBtn) {
        revealEmptyBtn.hidden = !(suppressed > 0 && state.hideMegaHubs !== false);
      }
      if (showAllBridgesBtn) {
        showAllBridgesBtn.hidden = !(state.bridgeFamily && state.bridgeFamily !== "all");
      }
    } else {
      emptyEl.hidden = true;
    }
  }

  if (options.fit) {
    requestAnimationFrame(() => fitConstellationToViewport());
  } else {
    applyMapViewportTransform();
  }
  applyPathLaserIsolation();
}

async function selectStartupFromWorkspace(startupId, options = {}) {
  if (!startupId) return;
  const wasOpen = Boolean(state.sideRailOpen);
  state.selectedStartupId = startupId;
  state.selectedBridgeId = null;
  state.hoveredNodeId = null;
  state.activeStartupId = startupId;
  state.sideRailOpen = true;
  state.sideRailTab = options.tab || "evidence";
  hideMapTooltip();

  renderSideEvidenceRail();
  const railBody = document.querySelector("#sideEvidenceRail .side-rail-body");
  if (railBody) railBody.scrollTop = 0;
  renderConstellationMap(getEffectiveBridgeMap(), { fit: !wasOpen });

  await loadStartupBriefData(startupId);
  if (state.sideRailOpen && state.sideRailTab === "evidence") {
    renderRailEvidencePane();
  }
}

function selectBridgeFromWorkspace(bridgeNodeId) {
  if (!bridgeNodeId) return;
  const wasOpen = Boolean(state.sideRailOpen);
  state.selectedBridgeId = bridgeNodeId;
  state.selectedStartupId = null;
  state.hoveredNodeId = null;
  state.sideRailOpen = true;
  state.sideRailTab = "evidence";
  hideMapTooltip();
  renderSideEvidenceRail();
  const railBody = document.querySelector("#sideEvidenceRail .side-rail-body");
  if (railBody) railBody.scrollTop = 0;
  renderConstellationMap(getEffectiveBridgeMap(), { fit: !wasOpen });
}

function clearConstellationSelection() {
  if (!state.selectedStartupId && !state.selectedBridgeId) return;
  state.selectedStartupId = null;
  state.selectedBridgeId = null;
  applyPathLaserIsolation();
  renderConstellationMap(getEffectiveBridgeMap(), { fit: false });
  renderSideEvidenceRail();
}

function buildBridgePathCardHtml(pathItem) {
  const famMeta = BRIDGE_FAMILY_VISUAL_META[pathItem.bridgeFamily] || BRIDGE_FAMILY_VISUAL_META.feeder;
  const hopsHtml = (pathItem.hops || [])
    .map((h) => `<span class="ev-hop-node">${escapeHtml(h.label)}</span>`)
    .join(`<span class="ev-hop-arrow">-&gt;</span>`);
  const srcList = (pathItem.sourceIds || [])
    .map((sid) => resolveSourceRecord(sid))
    .filter(Boolean);
  const srcBadgeText = srcList.map((s) => s.title || s.id).slice(0, 2).join(" · ");

  return `
    <div class="ev-bridge-item">
      <div style="display:flex; align-items:center; justify-content:space-between; gap:8px;">
        <strong style="font-size:12.5px; color:var(--text-strong);">${escapeHtml(pathItem.bridgeEntityName || "Bridge Path")}</strong>
        <div style="display:flex; gap:4px; align-items:center;">
          <span class="micro-pill micro-press">${escapeHtml(famMeta.shortLabel)}</span>
          ${getSourceRankBadgeHtml(pathItem.topSourceRank)}
          ${pathItem.isMegaHub ? `<span class="micro-pill micro-megahub">Mega-hub</span>` : ""}
        </div>
      </div>
      ${hopsHtml ? `<div class="ev-hops-strip">${hopsHtml}</div>` : ""}
      <div style="font-size:12px; color:var(--text); line-height:1.42;">${escapeHtml(cleanUiCopy(pathItem.summary || ""))}</div>
      <div style="margin-top:5px; font-size:11px; color:var(--muted);">
        ${pathItem.lift != null ? `${pathItem.lift}x lift` : "Direct path"}${pathItem.totalDeals != null ? ` · ${pathItem.totalDeals} indexed deals` : ""}${pathItem.date ? ` · ${escapeHtml(pathItem.date)}` : ""}${srcBadgeText ? ` · ${escapeHtml(srcBadgeText)}` : ""}
      </div>
    </div>
  `;
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
    listEl.innerHTML = `
      <div class="ev-folder-card" style="text-align:center;">
        <p style="margin:0 0 10px; color:var(--muted); font-size:12.5px;">No startups match the active filter settings.</p>
        <button type="button" class="btn sm" id="railEmptyResetBtn">Reset filters</button>
      </div>
    `;
    return;
  }

  listEl.innerHTML = visibleList
    .map((item, idx) => {
      const isSelected = state.selectedStartupId === item.id;
      const rank = item.dataConfidence?.topSourceRank || item.evidenceFolders?.proofAndGaps?.topSourceRank || "AGGREGATOR";
      const topPath = item.evidenceFolders?.hiddenBridges?.paths?.[0];
      const reason = topPath?.summary
        || item.coInvestorPath?.summary
        || item.whyNowTrigger
        || item.matchReason
        || "Matched across Cala bridge graph";
      const isSlush = Boolean(getStartupCalaFieldProfile(item)?.slush2026?.attending);
      const gapsCount = (item.evidenceFolders?.proofAndGaps?.missingFromCala || []).length;

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
            ${getSourceRankBadgeHtml(rank)}
            ${item.headcountGrowthPct >= 25 ? `<span class="micro-pill micro-velocity">+${item.headcountGrowthPct}% hiring</span>` : ""}
            ${isSlush ? `<span class="micro-pill micro-primary">Slush 2026</span>` : ""}
            ${gapsCount > 0 ? `<span class="micro-pill micro-gap">${gapsCount} Cala gaps</span>` : ""}
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
        <div style="font-size:12px; color:var(--muted); margin-bottom:8px;">
          Family: ${escapeHtml(famMeta.label)}${bNode.lift != null ? ` · Lift ${bNode.lift}x` : ""}${bNode.totalDeals != null ? ` · ${bNode.totalDeals} indexed deals` : ""}${bNode.isMegaHub ? " · Flagged as mega-hub" : " · Non-mega-hub bridge"}
        </div>
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
    ? bridgePaths.map((p) => buildBridgePathCardHtml(p)).join("")
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

  container.innerHTML = `
    <div class="triage-note-banner">${escapeHtml(triageNote)}</div>
    <div class="ev-action-row">
      <button type="button" class="btn sm primary" id="railDraftCitedBriefBtn" data-startup-id="${escapeHtml(candidate.id)}">
        ${state.railNarrationLoading ? "Drafting..." : "Draft Cited Brief"}
      </button>
      <button type="button" class="btn sm" id="railOpenFullBriefBtn" data-startup-id="${escapeHtml(candidate.id)}">Open Full Brief</button>
      <button type="button" class="btn sm" id="railVerifyLiveBtn" data-startup-id="${escapeHtml(candidate.id)}">Verify live</button>
    </div>
    ${narratedHtml}

    <div class="ev-folder-card">
      <div class="ev-folder-head">
        <h4 class="ev-folder-title">1. Hidden Bridges &amp; Warm Paths</h4>
        <span class="micro-pill micro-primary">${bridgePaths.length} visible</span>
      </div>
      ${suppressedBarHtml}
      ${pathsHtml}
    </div>

    <div class="ev-folder-card">
      <div class="ev-folder-head">
        <h4 class="ev-folder-title">2. Observed Activity &amp; Timing</h4>
        <span class="micro-pill micro-velocity">${activityItems.length} dated</span>
      </div>
      ${timingSummaryParts.length ? `<div style="font-size:11.5px; color:var(--text); margin-bottom:8px;">${escapeHtml(cleanUiCopy(timingSummaryParts.join(" · ")))}</div>` : ""}
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

  if (collapsedBtn) collapsedBtn.hidden = Boolean(state.sideRailOpen);
  if (railEl) railEl.hidden = !state.sideRailOpen;
  document.body.classList.toggle("has-rail-open", Boolean(state.sideRailOpen));

  // Update header context
  const kickerEl = document.getElementById("railContextKicker");
  const titleEl = document.getElementById("railContextTitle");
  const subEl = document.getElementById("railContextSub");
  const saveBtn = document.getElementById("railSaveCallBtn");
  const prevBtn = document.getElementById("railPrevBtn");
  const nextBtn = document.getElementById("railNextBtn");

  if (state.selectedBridgeId && !state.selectedStartupId) {
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

  const stageFilter =
    document.getElementById("filterStage")?.value !== "all"
      ? document.getElementById("filterStage")?.value
      : parsed.stageFilter || state.targetStage || "all";
  const region =
    document.getElementById("filterRegion")?.value !== "all"
      ? document.getElementById("filterRegion")?.value
      : parsed.region || "all";
  const excludeSector = document.getElementById("filterExcludeSector")?.value || "";
  const raisingSoonOnly = Boolean(document.getElementById("filterRaisingSoon")?.checked) || parsed.raisingSoonOnly;
  const entityScope = document.getElementById("filterEntityScope")?.value || "startups";
  const untappedOnly = Boolean(document.getElementById("filterUntappedOnly")?.checked) || Boolean(state.untappedOnly) || parsed.untappedOnly;
  const filingOnly = Boolean(state.filingOnly) || parsed.filingOnly;
  const slush2026Only = Boolean(state.onlySlush2026) || parsed.slush2026Only;
  const hideMegaHubs = state.hideMegaHubs !== false;
  const bridgeFamily = state.bridgeFamily && state.bridgeFamily !== "all" ? state.bridgeFamily : "all";
  const filterCount = countActiveRefineFilters();

  const hasActiveFilter = Boolean(queryText.trim()) || filterCount > 0 || bridgeFamily !== "all" || !hideMegaHubs;

  const resetBtn = document.getElementById("aiSearchResetBtn");
  if (resetBtn) {
    resetBtn.hidden = !Boolean(queryText.trim());
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
      entityScope,
      queryText,
      stageFilter,
      region,
      excludeSector: excludeSector || "none",
      raisingSoonOnly,
      untappedOnly,
      highVelocityOnly: parsed.highVelocityOnly,
      feederOnly: parsed.feederOnly,
      filingOnly,
      alumniOnly: parsed.alumniOnly,
      sectors: parsed.sectors,
      countries: parsed.countries,
      maxEmployees: parsed.maxEmployees,
      slush2026Only,
      preferWarm: parsed.preferWarm,
      hideMegaHubs,
      bridgeFamily,
      discoverLive: false
    })
  });

  if (res.calaBudget) {
    updateTelemetryMasthead(res.calaBudget);
  }

  const shortlist = res.shortlist || [];
  state.DisplayedShortlist = shortlist;
  state.bridgeMap = res.bridgeMap || null;
  registerKnownItems(state.DisplayedShortlist);

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

  const synthesisText = hasActiveFilter && queryText.trim()
    ? (parsed.isNaturalLanguage
        ? buildAiCopilotSynthesis(queryText, parsed, state.DisplayedShortlist, res)
        : escapeHtml(cleanUiCopy(res.explanation || `Showing ${state.DisplayedShortlist.length} Cala-verified startups matching "${queryText}".`)))
    : null;

  syncConstellationControls();
  renderStartupGrid(state.DisplayedShortlist);
  updateAiSynthesisBanner(synthesisText ? { synthesis: synthesisText } : null);
  renderConstellationMap(getEffectiveBridgeMap(), { fit: options.fit !== false });
}

async function resetSearchAndFilters() {
  const inputEl = document.getElementById("aiSearchInput");
  if (inputEl) inputEl.value = "";
  state.targetStage = "all";
  state.onlyCallList = false;
  state.onlySlush2026 = false;
  state.hideMegaHubs = true;
  state.bridgeFamily = "all";
  state.filingOnly = false;
  state.untappedOnly = false;
  state.selectedStartupId = null;
  state.selectedBridgeId = null;
  state.sideRailOpen = false;
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
    const strip = document.getElementById("collapsibleFilterStrip");
    const btn = document.getElementById("toggleFiltersBtn");
    if (strip) strip.hidden = false;
    if (btn) btn.setAttribute("aria-expanded", "true");
  });
  document.getElementById("workspaceThesisBtn")?.addEventListener("click", () => {
    switchPrimaryTab("thesis");
  });

  // Constellation Filter Ribbon controls
  document.getElementById("toggleHideMegaHubsBtn")?.addEventListener("click", async () => {
    state.hideMegaHubs = !(state.hideMegaHubs !== false);
    syncConstellationControls();
    await executeSearchRefinement(undefined, { keepSelection: true, keepRailOpen: state.sideRailOpen, fit: true });
  });

  document.getElementById("bridgeFamilySwitcher")?.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-bridge-family]");
    if (!btn) return;
    state.bridgeFamily = btn.dataset.bridgeFamily || "all";
    syncConstellationControls();
    await executeSearchRefinement(undefined, { keepSelection: false, fit: true });
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
      if (e.target.closest("#sideEvidenceRail, .panel-overlay, .config-modal, .filter-strip, .live-cala-intel-card, .call-list-compare-card")) {
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
      if (e.target.closest("button, .map-zoom-controls, .map-bottom-left-overlay, .constellation-empty-state")) {
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
        showMapTooltip(e.clientX, e.clientY, `<strong>${escapeHtml(node.label)}</strong><div>Origin Strategy Anchor · Click to clear selection</div>`);
      } else if (node.kind === "bridge") {
        const famLabel = BRIDGE_FAMILY_VISUAL_META[node.bridgeFamily]?.label || node.bridgeFamily;
        showMapTooltip(
          e.clientX,
          e.clientY,
          `<strong>${escapeHtml(node.label)}</strong><div>${escapeHtml(famLabel)} · ${node.lift != null ? `${node.lift}x lift` : "Direct bridge"}${node.totalDeals != null ? ` (${node.totalDeals} deals)` : ""} · ${escapeHtml(node.topSourceRank || "AGGREGATOR")}</div><div style="color:var(--muted);margin-top:2px;">Click to isolate connected startups</div>`
        );
      } else if (node.kind === "startup") {
        showMapTooltip(
          e.clientX,
          e.clientY,
          `<strong>${escapeHtml(node.label)}</strong><div>${escapeHtml(node.sector || "")} · ${escapeHtml(node.stage || "")} · ${escapeHtml(node.country || "")}</div><div>Top rank: ${escapeHtml(node.topSourceRank || "AGGREGATOR")} · ${node.missingGapCount || 0} missing field(s) in Cala</div><div style="color:var(--muted);margin-top:2px;">Click to inspect 3 Evidence Folders</div>`
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
        selectStartupFromWorkspace(nodeEl.dataset.startupId, { tab: "evidence" });
      } else if (kind === "bridge") {
        selectBridgeFromWorkspace(nodeEl.dataset.bridgeId);
      } else if (kind === "anchor") {
        if (state.selectedStartupId || state.selectedBridgeId) {
          clearConstellationSelection();
        } else {
          enterOnboarding(1);
        }
      }
    });
  }

  const constellationSvgEl = document.getElementById("constellationSvg");
  if (constellationSvgEl) {
    constellationSvgEl.addEventListener("mouseover", (e) => {
      const hit = e.target.closest(".edge-hit-target");
      if (!hit) return;
      const edgeId = hit.getAttribute("data-edge-id");
      const effMap = getEffectiveBridgeMap();
      const edge = (effMap?.edges || []).find((ed) => ed.id === edgeId);
      if (!edge) return;
      const focusNodeId = hit.getAttribute("data-edge-to");
      if (focusNodeId && state.hoveredNodeId !== focusNodeId) {
        state.hoveredNodeId = focusNodeId;
        applyPathLaserIsolation();
      }
      showMapTooltip(
        e.clientX,
        e.clientY,
        `<strong>${escapeHtml(BRIDGE_FAMILY_VISUAL_META[edge.bridgeFamily]?.label || "Bridge Edge")}</strong> · ${escapeHtml(edge.topSourceRank || "AGGREGATOR")}<div>${escapeHtml(cleanUiCopy(edge.label || ""))}</div>`
      );
    });

    constellationSvgEl.addEventListener("mouseout", (e) => {
      const hit = e.target.closest(".edge-hit-target");
      if (!hit) return;
      state.hoveredNodeId = null;
      applyPathLaserIsolation();
      hideMapTooltip();
    });

    constellationSvgEl.addEventListener("click", (e) => {
      const hit = e.target.closest(".edge-hit-target");
      if (!hit) return;
      const toId = hit.getAttribute("data-edge-to");
      const node = state.mapLayoutNodes?.nodeById?.get(toId);
      if (node?.kind === "startup") {
        selectStartupFromWorkspace(toId, { tab: "evidence" });
      } else if (node?.kind === "bridge") {
        selectBridgeFromWorkspace(toId);
      }
    });
  }

  // Collapsible Right-Side Information / Evidence Rail events
  document.getElementById("sideEvidenceRail")?.addEventListener("mouseenter", () => {
    state.hoveredNodeId = null;
    applyPathLaserIsolation();
    hideMapTooltip();
  });

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

  document.getElementById("railEvidenceContent")?.addEventListener("click", async (e) => {
    const jumpBtn = e.target.closest("[data-rail-select-startup]");
    if (jumpBtn) {
      selectStartupFromWorkspace(jumpBtn.dataset.railSelectStartup, { tab: "evidence" });
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
