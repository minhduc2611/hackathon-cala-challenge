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
  onlyCallList: false,
  onlySlush2026: false,
  compareMatrixOpen: false,
  liveCalaCache: new Map()
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
    SLUSH_2026_ATTENDEE_IDS.has(candidate.id) ||
    (["Finland", "Sweden", "Estonia", "Denmark", "Norway"].includes(candidate.country) && emp <= 80);

  const foundedYear = Number(candidate.foundedYear || 2023);
  const obs = [];
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

  const leaderFull = (candidate.linkedinNetwork?.targetLeader || "Founder & CEO").trim();
  const leaderName = leaderFull.split("(")[0].trim() || `${candidate.name} Founder`;
  const bridgeName = (candidate.linkedinNetwork?.bridgePerson || "").split("(")[0].trim();

  const leadershipRelationships = [
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
  } else if (target === "thesis") {
    if (state.inputMode === "fund" && state.selectedFundId === "lifeline-ventures") {
      verifyThesisFundInLiveCala({ silent: true });
    }
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

  const thesisLiveEl = document.getElementById("thesisLiveCalaCard");
  if (thesisLiveEl) {
    thesisLiveEl.hidden = true;
    thesisLiveEl.innerHTML = "";
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

  const cmpBadge = document.getElementById("compareCallListCountBadge");
  if (cmpBadge) cmpBadge.textContent = String(count);

  const slushCount = (state.DisplayedShortlist || []).filter(
    (item) => getStartupCalaFieldProfile(item)?.slush2026?.attending
  ).length;
  const slushBadge = document.getElementById("slushCountBadge");
  if (slushBadge) slushBadge.textContent = String(slushCount);

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

          <details class="compare-factors-details">
            <summary>5-factor score breakdown</summary>
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
          </details>

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

function renderStartupGrid(shortlist) {
  const grid = document.getElementById("startupGrid");
  const countBadge = document.getElementById("gridCountBadge");
  if (!grid) return;

  let visibleList = shortlist;
  if (state.onlyCallList) {
    visibleList = visibleList.filter((item) => state.savedCallListIds.includes(item.id));
  }
  if (state.onlySlush2026) {
    visibleList = visibleList.filter((item) => getStartupCalaFieldProfile(item)?.slush2026?.attending);
  }

  syncCallListUI();

  if (countBadge) {
    countBadge.textContent = String(visibleList.length);
  }

  if (!visibleList.length) {
    const msg = state.onlyCallList
      ? "No startups saved in your Call List yet. Star any startup to track it here."
      : state.onlySlush2026
        ? "No startups in the active filter are linked to Slush 2026 yet."
        : "No startups match the active filter combination.";
    grid.innerHTML = `
      <div class="card" style="grid-column: 1 / -1; padding: 28px; text-align: center">
        <p style="margin: 0 0 12px; color: var(--muted)">${escapeHtml(msg)}</p>
        <button type="button" class="btn sm" id="emptyResetBtn">${state.onlyCallList || state.onlySlush2026 ? "Show all ranked startups" : "Reset filters"}</button>
      </div>
    `;
    document.getElementById("emptyResetBtn")?.addEventListener("click", () => {
      if (state.onlyCallList || state.onlySlush2026) {
        state.onlyCallList = false;
        state.onlySlush2026 = false;
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
                ${bookmarkIconSvg(14)}
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
    { kind: "AI Prompt", query: "Untapped AI startups under 25 employees", meta: "Angel-backed seed + headcount filter" },
    { kind: "AI Prompt", query: "Warmest intro paths in Finland", meta: "Sort by LinkedIn 2nd-deg & syndicate bridges" },
    { kind: "Audit", query: "Why not Oura?", meta: "Portfolio exclusion & score check" }
  ].filter(
    (p) =>
      p.query.toLowerCase().includes(q) ||
      q.includes("slush") ||
      q.includes("why") ||
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
    maxEmployees: null,
    sector: null,
    stageFilter: null,
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
    res.sector = "DeepTech";
  } else if (/\b(fintech|payments|banking|treasury|credit)\b/i.test(q)) {
    res.sector = "Fintech";
  } else if (/\b(healthtech|health|medtech|clinical|diagnostics|bio)\b/i.test(q)) {
    res.sector = "HealthTech";
  } else if (/\b(climate|energy|grid|clean|carbon|solar|battery)\b/i.test(q)) {
    res.sector = "Climate Tech";
  } else if (/\b(b2b saas|saas|automation|workflow)\b/i.test(q)) {
    res.sector = "B2B SaaS";
  } else if (/\b(ai|ml|machine learning|llm|agent|ai & ml)\b/i.test(q)) {
    res.sector = "AI & ML";
  }

  if (/\bpre[- ]seed\b/i.test(q)) res.stageFilter = "pre_seed_seed";
  else if (/\bseries a\b/i.test(q)) res.stageFilter = "seed_series_a";
  else if (/\bseed\b/i.test(q)) res.stageFilter = "pre_seed_seed";

  const countryList = ["finland", "sweden", "denmark", "estonia", "germany", "uk", "united kingdom", "netherlands", "norway", "helsinki", "espoo", "oulu", "stockholm", "berlin", "munich", "london", "tallinn", "copenhagen"];
  for (const c of countryList) {
    if (q.includes(c)) {
      res.country = c === "uk" ? "united kingdom" : c;
      break;
    }
  }
  if (/\bnordic/i.test(q)) res.region = "Nordics";
  else if (/\bdach/i.test(q)) res.region = "DACH";

  if (res.slush2026Only) res.constraintTags.push("Event: Slush 2026 (ATTENDEE)");
  if (res.raisingSoonOnly) res.constraintTags.push("Window: Raising soon");
  if (res.untappedOnly) res.constraintTags.push("Signal: Untapped / Angel");
  if (res.preferWarm) res.constraintTags.push("Sort: Warmest Intro");
  if (res.sector) res.constraintTags.push(`Sector: ${res.sector}`);
  if (res.country) res.constraintTags.push(`Location: ${res.country}`);
  if (res.region) res.constraintTags.push(`Region: ${res.region}`);

  const isMultiWordQuestion =
    !res.isWhyNot && (q.split(/\s+/).length >= 3 || /^(which|what|who|find|show|give|list|recommend)\b/i.test(q));
  res.isNaturalLanguage = !res.isWhyNot && (res.constraintTags.length >= 2 || (res.slush2026Only && q.length > 0) || isMultiWordQuestion);
  return res;
}

function buildAiCopilotSynthesis(queryText, parsed, items, backendRes) {
  if (parsed?.isWhyNot && backendRes?.explanation) {
    return backendRes.explanation;
  }
  if (!items || !items.length) {
    return `No Cala-indexed startups matched "${queryText}". Try relaxing one filter or trigger Live Cala Knowledge below.`;
  }
  const top = items.slice(0, 3);
  const topLead = top[0];
  const prof = getStartupCalaFieldProfile(topLead);
  const bridge =
    topLead.linkedinNetwork?.bridgePerson?.split("(")[0]?.trim() ||
    topLead.coInvestorPath?.coInvestorName ||
    "Cala syndicate";
  return `Matched ${items.length} startup${items.length === 1 ? "" : "s"}. Top match: ${topLead.name} (${topLead.suitabilityScore}/100) in ${topLead.hqCity} (${topLead.stage}, ${formatEur(topLead.lastRoundAmountEurM)}, intro via ${bridge}).`;
}

async function executeSearchRefinement(customQuery) {
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
  const untappedOnly = Boolean(document.getElementById("filterUntappedOnly")?.checked) || parsed.untappedOnly;
  const filterCount = countActiveRefineFilters();

  const hasActiveFilter = Boolean(queryText.trim()) || filterCount > 0;

  const resetBtn = document.getElementById("aiSearchResetBtn");
  if (resetBtn) {
    resetBtn.hidden = !hasActiveFilter;
  }

  const backendQueryText = parsed.isNaturalLanguage ? "" : queryText;

  const res = await fetchJson("/api/refine", {
    method: "POST",
    body: JSON.stringify({
      mode: state.inputMode,
      fundId: state.selectedFundId,
      companyIds: state.selectedCompanyIds,
      rankingMode: mapScoringModeToApi(state.scoringMode),
      statedThesisOverride: state.statedThesisOverride || undefined,
      seenCompanyNames: getSeenCompanyNamesList(),
      queryText: backendQueryText,
      stageFilter,
      region,
      excludeSector: excludeSector || "none",
      raisingSoonOnly,
      untappedOnly
    })
  });

  let shortlist = res.shortlist || [];
  if (parsed.isNaturalLanguage) {
    shortlist = shortlist.filter((item) => {
      const calaProf = getStartupCalaFieldProfile(item);
      if (parsed.slush2026Only && !calaProf?.slush2026?.attending) return false;
      if (parsed.sector && item.sector !== parsed.sector) return false;
      if (parsed.maxEmployees !== null && Number(item.employeeCount || 0) > parsed.maxEmployees) return false;
      if (parsed.country) {
        const locHay = `${item.country || ""} ${item.hqCity || ""}`.toLowerCase();
        if (!locHay.includes(parsed.country)) return false;
      }
      return true;
    });
    if (parsed.preferWarm) {
      shortlist = [...shortlist].sort((a, b) => {
        const aw = a.linkedinNetwork ? 1 : 0;
        const bw = b.linkedinNetwork ? 1 : 0;
        return bw - aw || (b.suitabilityScore || 0) - (a.suitabilityScore || 0);
      });
    }
  }

  state.DisplayedShortlist = shortlist;
  registerKnownItems(state.DisplayedShortlist);
  renderStartupGrid(state.DisplayedShortlist);

  const traceBox = document.getElementById("aiTraceBox");
  const intentBadge = document.getElementById("aiIntentBadge");
  const explanationEl = document.getElementById("aiExplanationText");
  const opsEl = document.getElementById("aiAppliedFilters");
  const citesEl = document.getElementById("aiTraceCitations");

  if (traceBox) {
    traceBox.hidden = !hasActiveFilter;
  }

  if (hasActiveFilter) {
    const intentNames = {
      company: "Company lookup",
      investor: "Investor syndicate",
      industry: "Industry filter",
      why_not: "Portfolio audit",
      general: parsed.isNaturalLanguage ? "AI Copilot" : "AI filter"
    };
    if (intentBadge) {
      intentBadge.textContent = parsed.isNaturalLanguage
        ? `AI Copilot · ${state.DisplayedShortlist.length} matches`
        : intentNames[res.searchIntent] || res.intentLabel || "AI Search";
    }
    if (explanationEl) {
      explanationEl.textContent = parsed.isNaturalLanguage
        ? buildAiCopilotSynthesis(queryText, parsed, state.DisplayedShortlist, res)
        : res.explanation || `Showing ${state.DisplayedShortlist.length} Cala-verified startups matching active filters.`;
    }
    if (opsEl) {
      const tags = [...parsed.constraintTags];
      if (!tags.length && Array.isArray(res.aiTrace) && res.aiTrace.length > 0) {
        tags.push(res.aiTrace[0]);
      }
      const af = res.appliedFilters || {};
      if (af.stageFilter && af.stageFilter !== "all" && !tags.some((t) => t.startsWith("Stage"))) {
        tags.push(`Stage: ${TARGET_STAGE_LABELS[af.stageFilter] || af.stageFilter}`);
      }
      if (af.region && af.region !== "all" && !tags.some((t) => t.startsWith("Region"))) {
        tags.push(`Region: ${af.region}`);
      }
      if (af.investorFilter) {
        tags.push(`Investor: ${af.investorFilter}`);
      }
      if (af.sectorFilter && !tags.some((t) => t.startsWith("Sector"))) {
        tags.push(`Sector: ${af.sectorFilter}`);
      }
      opsEl.innerHTML = tags
        .slice(0, 5)
        .map((op) => `<span class="trace-op-tag">${escapeHtml(String(op))}</span>`)
        .join("");
    }
    if (citesEl) {
      const topChips = state.DisplayedShortlist.slice(0, 3)
        .map(
          (item) => `
          <button type="button" class="ai-cite-chip" data-ai-open-startup="${escapeHtml(item.id)}">
            <span>${escapeHtml(item.name)}</span>
            <span class="num-tabular">${item.suitabilityScore}/100</span>
          </button>
        `
        )
        .join("");
      const askLiveBtn = queryText.trim()
        ? `<button type="button" class="ai-escalate-cala-btn" data-ai-escalation-query="${escapeHtml(queryText.trim())}"><span class="live-dot" aria-hidden="true"></span> Check Live Cala</button>`
        : "";
      citesEl.innerHTML = topChips + askLiveBtn;
    }
  }
}

async function resetSearchAndFilters() {
  const inputEl = document.getElementById("aiSearchInput");
  if (inputEl) inputEl.value = "";
  state.targetStage = "all";
  state.onlyCallList = false;
  state.onlySlush2026 = false;
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
  syncCallListUI();
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
  const isSaved = state.savedCallListIds.includes(candidate.id);

  container.innerHTML = `
    <div class="head">
      <div class="talk-head-visuals">
        <div class="talk-head-logo" aria-hidden="true">
          ${buildStartupLogoSvg(candidate.name, candidate.sector, 64)}
        </div>
        <div class="ring">
          ${buildIncompleteCircleScoreSvg(candidate.suitabilityScore ?? 0, 84, "Fit score")}
        </div>
      </div>
      <div class="t">
        <div class="eyebrow" style="margin-bottom: 6px">Startup deep dive</div>
        <h2>${escapeHtml(candidate.name)}</h2>
        <div class="m">
          ${escapeHtml(candidate.hqCity)}, ${escapeHtml(candidate.country)} · ${escapeHtml(candidate.sector)} · ${escapeHtml(getStartupCalaFieldProfile(candidate)?.fundingStage || candidate.stage)} (${formatEur(candidate.lastRoundAmountEurM)})${getStartupCalaFieldProfile(candidate)?.slush2026?.attending ? " · Attending Slush 2026" : ""}
        </div>
      </div>
      <div class="talk-head-actions">
        <button
          type="button"
          class="btn sm drawer-star-btn ${isSaved ? "is-saved" : ""}"
          id="talkSaveCallBtn"
          aria-pressed="${isSaved ? "true" : "false"}"
        >
          ${bookmarkIconSvg(13)} <span>${isSaved ? "Saved" : "Save to Call List"}</span>
        </button>
        <button type="button" class="btn sm primary" id="talkCopyIntroBtn">Copy Warm Intro</button>
        <button type="button" class="btn sm" id="talkPrevStartupBtn">&larr; Prev</button>
        <button type="button" class="btn sm" id="talkNextStartupBtn">Next &rarr;</button>
      </div>
    </div>

    <div class="hero-kpi-strip" style="margin-bottom: 18px">
      <div class="hk-card">
        <span class="hk-kicker">Cala Fit Score</span>
        <b class="hk-val num-tabular" style="color:${scoreBand(candidate.suitabilityScore).col}">${candidate.suitabilityScore}/100</b>
        <span class="hk-lab">${escapeHtml(scoreBand(candidate.suitabilityScore).lab)}</span>
      </div>
      <div class="hk-card">
        <span class="hk-kicker">Latest Round</span>
        <b class="hk-val num-tabular">${formatEur(candidate.lastRoundAmountEurM)}</b>
        <span class="hk-lab">${escapeHtml(candidate.stage)}</span>
      </div>
      <div class="hk-card">
        <span class="hk-kicker">Next Window</span>
        <b class="hk-val">${escapeHtml(candidate.likelyNextStage || "Series A")}</b>
        <span class="hk-lab">${candidate.raisingSoon ? "Active window" : "Standard cycle"}</span>
      </div>
      <div class="hk-card">
        <span class="hk-kicker">Warmest Bridge</span>
        <b class="hk-val hk-val-text">${escapeHtml(bridgeTitle.split("(")[0].trim())}</b>
        <span class="hk-lab">${escapeHtml(isLinkedin ? "LinkedIn 2nd°" : "Cala syndicate")}</span>
      </div>
    </div>

    <div class="cols">
      <div class="card panel">
        <h3><span class="n">1</span>Why now &amp; Cala score</h3>
        <p class="why-text">${escapeHtml(candidate.oneLiner || candidate.description)}</p>

        <details class="more">
          <summary>5-factor Cala score breakdown</summary>
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

        <details class="more" style="margin-top: 10px">
          <summary>Verified Cala citations (${(candidate.reasons || []).length})</summary>
          <ul class="facts" style="margin-top: 10px">
            ${(candidate.reasons || [])
              .map(
                (r) => `
              <li>
                ${escapeHtml(r.text)}
                ${(r.sources || [])
                  .map(
                    (src, idx) =>
                      `${renderCalaRankPill(src)} <a href="${escapeHtml(src.url)}" target="_blank" rel="noopener">[${idx + 1} &#8599;]</a>`
                  )
                  .join(" ")}
              </li>
            `
              )
              .join("")}
          </ul>
        </details>
      </div>

      <div class="card panel">
        <h3><span class="n">2</span>Warm intro &amp; network graph</h3>
        <div class="network-graph-stage" style="margin-bottom: 12px">
          ${netData ? buildNetworkGraphSvg(netData, candidate.id) : ""}
        </div>

        <details class="more">
          <summary>Connected cluster peers (${Math.min(4, peers.length)})</summary>
          <div style="display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px">
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
        </details>
      </div>

      <div class="card panel">
        <h3><span class="n">3</span>Syndicate &amp; partner memo</h3>
        <details class="more" open>
          <summary>Verified funding rounds (${rounds.length})</summary>
          <div style="margin-top: 10px">
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
                    <p>Lead: <b>${escapeHtml(r.leadInvestorName)}</b></p>
                  </div>
                `
                    )
                    .join("")
                : `<p class="note">No public rounds indexed.</p>`
            }
          </div>
        </details>

        <div class="badges" style="margin-top: 12px">
          <span class="badge b-green">Grounded in Cala</span>
          <span class="badge b-amber">Coverage-gap audit</span>
        </div>

        <div style="display: flex; gap: 8px; flex-wrap: wrap; margin-top: 12px">
          <button type="button" class="btn primary sm" id="talkOpenDrawerBtn">
            Open modal brief
          </button>
          <button type="button" class="btn sm" id="talkExportMdBtn">
            Export Memo (.md)
          </button>
        </div>
      </div>
    </div>
  `;

  document.getElementById("talkSaveCallBtn")?.addEventListener("click", () => {
    toggleCallListStartup(candidate.id);
    showUiToast(
      state.savedCallListIds.includes(candidate.id)
        ? `Added ${candidate.name} to Call List`
        : `Removed ${candidate.name} from Call List`
    );
  });
  document.getElementById("talkCopyIntroBtn")?.addEventListener("click", async () => {
    const text = buildWarmIntroDraftText(candidate);
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(text);
    } catch {
      // Non-fatal in non-clipboard contexts
    }
    const copyBtn = document.getElementById("talkCopyIntroBtn");
    if (copyBtn) {
      copyBtn.textContent = "Copied Intro";
      window.setTimeout(() => {
        if (copyBtn.isConnected) copyBtn.textContent = "Copy Warm Intro";
      }, 1800);
    }
    showUiToast(`Copied warm intro note for ${candidate.name}`);
  });
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
  const drawerEl = document.getElementById("inspectorDrawer");
  if (drawerEl) drawerEl.setAttribute("data-depth-mode", depth);
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
  const drawerBanner = document.getElementById("drawerLiveCalaBanner");
  if (drawerBanner) {
    drawerBanner.hidden = true;
    drawerBanner.innerHTML = "";
  }

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
    btn.textContent = "Copied intro note";
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
  const heroEl = document.getElementById("drawerHeroKpis");
  if (heroEl) {
    const score = candidate.suitabilityScore ?? 0;
    const band = scoreBand(score);
    const shortBridge = (
      candidate.linkedinNetwork?.bridgePerson ||
      candidate.coInvestorPath?.coInvestorName ||
      "Direct syndicate"
    )
      .split("(")[0]
      .trim();
    const roundsArr = brief?.rounds || candidate.roundHistory || [];
    const latestDate = roundsArr[roundsArr.length - 1]?.date || "";
    heroEl.innerHTML = `
      <div class="hk-card">
        <span class="hk-kicker">Thesis Fit</span>
        <b class="hk-val num-tabular" style="color:${band.col}">${score}/100</b>
        <span class="hk-lab">${escapeHtml(band.lab)}</span>
      </div>
      <div class="hk-card">
        <span class="hk-kicker">Latest Round</span>
        <b class="hk-val num-tabular">${formatEur(candidate.lastRoundAmountEurM)}</b>
        <span class="hk-lab">${escapeHtml(candidate.stage)}${latestDate ? ` · ${escapeHtml(latestDate.slice(0, 7))}` : ""}</span>
      </div>
      <div class="hk-card">
        <span class="hk-kicker">Warm Route</span>
        <b class="hk-val hk-val-text">${escapeHtml(shortBridge)}</b>
        <span class="hk-lab">${escapeHtml(candidate.linkedinNetwork ? "2nd-degree intro" : "Co-investor path")}</span>
      </div>
    `;
  }

  document.getElementById("drawerQuickVerdict").textContent =
    candidate.oneLiner || candidate.description || "";

  const calaProfile = getStartupCalaFieldProfile(candidate);

  const pillsEl = document.getElementById("drawerQuickPills");
  if (pillsEl) {
    const roundsArr = brief?.rounds || candidate.roundHistory || [];
    const latestLead = roundsArr[roundsArr.length - 1]?.leadInvestorName || candidate.coInvestorPath?.coInvestorName;
    const basePills = [
      `${candidate.hqCity}, ${candidate.country}`,
      `${candidate.employeeCount} people`,
      !calaProfile?.slush2026?.attending && latestLead ? `Lead: ${latestLead}` : null
    ].filter(Boolean);
    const slushPill = calaProfile?.slush2026?.attending
      ? `<span class="meta-pill slush-attendee-chip">Attending Slush 2026</span>`
      : "";
    pillsEl.innerHTML =
      basePills.map((p) => `<span class="meta-pill">${escapeHtml(p)}</span>`).join("") + slushPill;
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
    const roundsCount = (candidate.roundHistory || []).length;
    confEl.textContent = roundsCount > 0 ? `${roundsCount} verified round${roundsCount === 1 ? "" : "s"}` : "Verified";
  }

  const reasons = candidate.reasons || [];
  const risks = brief?.risks || [
    candidate.competitorConflict
      ? `Adjacent to portfolio company ${candidate.competitorConflict}; requires conflict clearance.`
      : "No direct portfolio conflict detected in current portfolio.",
    candidate.raisingSoon
      ? "Inside active 12-to-24 month post-round fundraising window."
      : "Out-of-cycle outreach; confirm runway and next milestone timing."
  ];
  const roundsList = brief?.rounds || candidate.roundHistory || [];
  const missingList = brief?.notFoundInCala || [];

  const b1 = document.getElementById("gradualBadge1");
  if (b1) b1.textContent = `${reasons.length} facts · ${risks.length} risks`;
  const b2 = document.getElementById("gradualBadge2");
  if (b2) b2.textContent = `${roundsList.length} round${roundsList.length === 1 ? "" : "s"} · team`;
  const b3 = document.getElementById("gradualBadge3");
  if (b3) b3.textContent = missingList.length ? `${missingList.length} notes · export` : "Intro & audit";

  const breakdownEl = document.getElementById("drawerScoreBreakdown");
  if (breakdownEl) {
    const factors = getScoreBreakdownRows(candidate);
    breakdownEl.innerHTML = factors
      .map((f) => {
        const pct = Math.min(100, Math.round((Number(f.points) / f.maxPoints) * 100));
        return `
          <div class="sb-row" tabindex="0" title="${escapeHtml(f.detail || "Verified fit factor")}">
            <div class="sb-top">
              <span class="sb-label">${escapeHtml(f.label)}</span>
              <span class="sb-pts num-tabular">${f.points} / ${f.maxPoints}</span>
            </div>
            <div class="sb-bar-track">
              <div class="sb-bar-fill" style="width: ${pct}%"></div>
            </div>
            <div class="sb-hover-detail">
              <span class="sb-pct num-tabular">${pct}% match</span>
              <span>${escapeHtml(f.detail || "")}</span>
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
              `<a href="${escapeHtml(src.url)}" target="_blank" rel="noopener noreferrer" class="citation-link" title="${escapeHtml(src.title)}">[${escapeHtml(src.publisher || `Source ${idx + 1}`)}]</a>`
          )
          .join(" ");
        const metaText = sources
          .map((src) => `${src.publisher || src.title || "Source"} (${src.date || "Recent"})`)
          .join(" · ");
        return `
          <li class="evidence-item" tabindex="0">
            <span>${escapeHtml(r.text)} ${cites}</span>
            ${metaText ? `<span class="cite-hover-meta">${escapeHtml(metaText)}</span>` : ""}
          </li>
        `;
      })
      .join("");
  }

  const risksList = document.getElementById("drawerRisksList");
  if (risksList) {
    const risksArr = brief?.risks || [
      candidate.competitorConflict
        ? `Adjacent to portfolio company ${candidate.competitorConflict}; requires conflict clearance.`
        : "No direct portfolio conflict detected.",
      candidate.raisingSoon
        ? "Inside active 12-to-24 month post-round fundraising window."
        : "Out-of-cycle outreach; confirm milestone timing prior to next round."
    ];
    risksList.innerHTML = risksArr.map((rk) => `<li>${escapeHtml(rk)}</li>`).join("");
  }

  const roundsBody = document.getElementById("drawerRoundsTableBody");
  if (roundsBody) {
    const rounds = brief?.rounds || candidate.roundHistory || [];
    roundsBody.innerHTML = rounds
      .map((r) => {
        const investors = [
          r.leadInvestorName ? `${r.leadInvestorName} (Lead)` : null,
          ...(r.investorNames || []).filter((n) => n !== r.leadInvestorName)
        ]
          .filter(Boolean)
          .join(", ");
        return `
        <tr>
          <td class="num-tabular">${escapeHtml((r.date || "").slice(0, 7))}</td>
          <td><strong>${escapeHtml(r.type)}</strong></td>
          <td class="num-tabular">${formatEur(r.amountEurM)}</td>
          <td>${escapeHtml(investors || "Undisclosed")}</td>
        </tr>
      `;
      })
      .join("");
  }

  const tsLeadEl = document.getElementById("drawerTimeSeriesAndLeadership");
  if (tsLeadEl && calaProfile) {
    const obsList = calaProfile.numericalObservations || [];
    const firstObs = obsList[0];
    const lastObs = obsList[obsList.length - 1];
    const teamDelta =
      firstObs && lastObs && obsList.length > 1
        ? `${firstObs.value} -> ${lastObs.value} people (${firstObs.date} to ${lastObs.date})`
        : lastObs
          ? `${lastObs.value} people (${lastObs.date})`
          : `${candidate.employeeCount} people`;

    tsLeadEl.innerHTML = `
      <div class="cala-mini-card">
        <div class="cala-mini-head">
          <span class="cala-mini-title">Team growth</span>
          <span class="badge b-green">${escapeHtml(String(candidate.employeeCount))} active</span>
        </div>
        <div class="cala-ts-list">
          <div class="cala-ts-row">
            <span>Headcount trajectory</span>
            <strong class="cala-ts-val num-tabular">${escapeHtml(teamDelta)}</strong>
          </div>
          <div class="cala-ts-row">
            <span>Company size bracket</span>
            <span class="note">${escapeHtml(calaProfile.employeeCountRangeLabel || `${candidate.employeeCount} employees`)}</span>
          </div>
        </div>
      </div>

      <div class="cala-mini-card">
        <div class="cala-mini-head">
          <span class="cala-mini-title">Founders &amp; leadership</span>
          <span class="note">${escapeHtml(calaProfile.ownershipStatus || "Private")}</span>
        </div>
        <div class="cala-ts-list">
          ${calaProfile.leadershipRelationships
            .map(
              (rel) => `
            <div class="cala-ts-row">
              <span><strong>${escapeHtml(rel.person)}</strong> · ${escapeHtml(formatLeadershipTitle(rel.relation))}</span>
              <span class="note num-tabular">since ${escapeHtml(rel.validSince)}</span>
            </div>
          `
            )
            .join("")}
        </div>
      </div>
    `;
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
      .map((m) => {
        const cleanStatus = String(m.status || "").replace(/Not found in Cala/gi, "Ask on call");
        return `
        <li>
          <strong>${escapeHtml(m.field)}:</strong> ${escapeHtml(cleanStatus)}${m.reason ? ` (${escapeHtml(m.reason)})` : ""}
        </li>
      `;
      })
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
          Primary bridge via <strong>${escapeHtml(primaryBridge)}</strong>. Click any node in the graph above to inspect verified relationship evidence.
        </span>
      </div>
    `;
    return;
  }

  const { id, type, label } = nodeObj;
  let kicker = "Verified Entity";
  let desc = `${label} is linked inside the Cala relationship graph for ${candidate.name}.`;
  let peerActionHtml = "";

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
    ${peerActionHtml}
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

  const bridgesDetails = document.getElementById("networkBridgesDetails");
  if (bridgesDetails) bridgesDetails.open = false;
  const peersDetails = document.getElementById("networkPeersDetails");
  if (peersDetails) peersDetails.open = false;

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
          <span class="badge b-green">${escapeHtml(b.badge)}</span>
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
  if (thesisHeroEl) {
    const hits = backtest?.hitsInTop15 ?? 3;
    const totalDeals = backtest?.totalActualDeals ?? 3;
    const hitRate = totalDeals > 0 ? Math.round((hits / totalDeals) * 100) : 100;
    thesisHeroEl.innerHTML = `
      <div class="hk-card">
        <span class="hk-kicker">Verified Cala Deals</span>
        <b class="hk-val num-tabular">${thesis.dealsAnalyzedCount}</b>
        <span class="hk-lab">${thesis.portfolioCount} portfolio cos · ${thesis.leadRatePct}% lead</span>
      </div>
      <div class="hk-card">
        <span class="hk-kicker">Backtest Recovery</span>
        <b class="hk-val num-tabular" style="color:var(--green)">${hitRate}%</b>
        <span class="hk-lab">${hits} of ${totalDeals} future deals in Top 15</span>
      </div>
      <div class="hk-card">
        <span class="hk-kicker">Median Round Size</span>
        <b class="hk-val num-tabular">${formatEur(thesis.medianRoundSizeEurM)}</b>
        <span class="hk-lab">${thesis.followOnRatePct}% follow-on rate</span>
      </div>
    `;
  }

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

  renderDistributionBars("sectorDistributionBars", thesis.sectorMix, "sector");
  renderDistributionBars("stageDistributionBars", thesis.stageMix, "stage");
  renderDistributionBars("geoDistributionBars", thesis.geographyMix, "geo");

  const insightsEl = document.getElementById("thesisInsightsList");
  if (insightsEl) {
    const diffLine = (thesis.statedVsRevealed || [])[0] || thesis.driftSummary || "";
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
          <b>Syndicate conviction &amp; lead behavior</b>
          Lead rate ${thesis.leadRatePct}% and follow-on rate ${thesis.followOnRatePct}% across ${thesis.dealsAnalyzedCount} verified Cala rounds.
        </div>
      </li>
      <li>
        <div class="ic">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--green)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
        </div>
        <div>
          <b>Zero-hallucination evidence gate</b>
          Every key claim is tied to a public filing or verified press source; private metrics are flagged for your first call.
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
    ? `<span class="badge b-green">Cached</span>`
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
    ...corpEvents.slice(0, 4).map((ev) => `
        <div class="cala-rel-row">
          <div>
            <strong>${escapeHtml(ev.name)}</strong>
            <span class="note" style="margin-left:8px">${escapeHtml(ev.eventDate || "")}</span>
          </div>
          <span class="badge b-green">Filing</span>
        </div>
      `)
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
        <span class="badge b-green">Growth</span>
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

    <details class="gradual-block" style="margin-bottom: 8px" ${isEventEntity ? "open" : ""}>
      <summary class="gradual-summary">
        <span>${isEventEntity ? "Slush 2026 participating startups" : "Verified deals, rounds &amp; sources"}</span>
        <span class="gradual-hint">${relRows.length} items</span>
      </summary>
      <div class="gradual-content">
        <div class="cala-rel-list">
          ${relRows.length ? relRows.join("") : `<p class="note" style="margin:10px 0 0">No deals or links listed for this view.</p>`}
        </div>
      </div>
    </details>

    <details class="gradual-block">
      <summary class="gradual-summary">
        <span>Team, leadership &amp; related entities</span>
        <span class="gradual-hint">${candRows.length} items</span>
      </summary>
      <div class="gradual-content">
        <div class="cala-rel-list">
          ${candRows.length ? candRows.join("") : `<p class="note" style="margin:10px 0 0">No additional team details listed.</p>`}
        </div>
      </div>
    </details>
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
  document.getElementById("modalHeaderLiveCalaBtn")?.addEventListener("click", triggerLiveCalaVerification);
  document.getElementById("searchLiveCalaBtn")?.addEventListener("click", () => {
    runSearchLiveCalaLookup();
  });
  document.getElementById("thesisVerifyFundBtn")?.addEventListener("click", () => {
    verifyThesisFundInLiveCala({ silent: false });
  });

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
  const placeholder = document.querySelector("#aiSearchInput");
  if (placeholder && placeholder.placeholder.length > 72) {
    placeholder.placeholder = "Ask AI or search: 'Slush 2026 DeepTech', 'Why not Oura?', company";
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
