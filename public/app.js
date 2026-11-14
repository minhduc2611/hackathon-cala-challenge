/* Revealed Thesis Engine Frontend Controller */
'use strict';

const state = {
  bootstrap: null,
  activeTab: 'config',
  configStep: 1,
  role: 'analyst', // 'analyst' | 'investor'
  inputMode: 'fund', // 'fund' | 'companies'
  fundId: 'lifeline-ventures',
  selectedCompanyIds: [],
  rankingMode: 'balanced', // 'balanced' | 'untapped' | 'warmest'
  seenCompanyNames: '',
  statedThesisOverride: '',
  networkPriority: 'linkedin', // 'linkedin' | 'cala'

  // Analysis & search state
  analysis: null,
  displayedShortlist: [],
  allKnownItems: new Map(),
  lastSearchResult: null,
  filters: {
    queryText: '',
    region: 'all',
    excludeSector: 'none',
    raisingSoonOnly: false,
    untappedOnly: false
  },

  // Drawer state
  activeStartupId: null,
  drawerHistory: [],
  activeDrawerTab: 'score', // 'score' | 'network'
  activeNetworkSource: 'linkedin', // 'linkedin' | 'cala'
  briefCache: new Map(),

  // Live Cala telemetry
  calaBudget: null
};

const WEIGHT_PRESETS = {
  balanced: { sector: 30, stage: 25, coInvestor: 20, geography: 15, roundSize: 10 },
  untapped: { sector: 36, stage: 30, coInvestor: 0, geography: 20, roundSize: 14 },
  warmest: { sector: 25, stage: 20, coInvestor: 35, geography: 12, roundSize: 8 }
};

const LOGO_PALETTES = {
  HealthTech: { bg: '#E5EFEA', fg: '#0B5540', stroke: '#B6D0C5' },
  DeepTech: { bg: '#EBF0F5', fg: '#1D374F', stroke: '#C0CCD8' },
  'Climate Tech': { bg: '#E9F2E6', fg: '#1B522E', stroke: '#BCD4B5' },
  'B2B SaaS': { bg: '#F2EEE6', fg: '#4D3C22', stroke: '#D5CCBC' },
  'AI & ML': { bg: '#ECEFF7', fg: '#293566', stroke: '#C3CAE2' },
  Fintech: { bg: '#FDF1EC', fg: '#9A3412', stroke: '#E7C3B3' }
};

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getInitials(name) {
  const words = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length >= 2) {
    return (words[0][0] + words[1][0]).toUpperCase();
  }
  return String(name || 'ST').slice(0, 2).toUpperCase();
}

function getSectorMotifSvg(sector, fg) {
  switch (sector) {
    case 'DeepTech':
      return `<ellipse cx="19" cy="19" rx="14" ry="6" fill="none" stroke="${fg}" stroke-width="1" opacity="0.18" transform="rotate(-24 19 19)" />`;
    case 'AI & ML':
      return `<g fill="${fg}" opacity="0.2"><circle cx="9" cy="9" r="1.4"/><circle cx="29" cy="9" r="1.4"/><circle cx="29" cy="29" r="1.4"/><line x1="9" y1="9" x2="29" y2="29" stroke="${fg}" stroke-width="0.8"/></g>`;
    case 'Climate Tech':
      return `<g fill="none" stroke="${fg}" stroke-width="0.9" opacity="0.2"><circle cx="19" cy="19" r="13"/><path d="M6 19 Q19 13 32 19"/></g>`;
    case 'HealthTech':
      return `<path d="M4 21 L12 21 L15 14 L20 25 L24 19 L34 19" fill="none" stroke="${fg}" stroke-width="1.1" opacity="0.2"/>`;
    case 'Fintech':
      return `<g fill="${fg}" opacity="0.14"><rect x="7" y="23" width="4" height="8" rx="1"/><rect x="13" y="18" width="4" height="13" rx="1"/><rect x="27" y="14" width="4" height="17" rx="1"/></g>`;
    default:
      return `<polygon points="19,5 32,12 32,26 19,33 6,26 6,12" fill="none" stroke="${fg}" stroke-width="0.9" opacity="0.18"/>`;
  }
}

function renderLogoSvg(name, sector) {
  const palette = LOGO_PALETTES[sector] || { bg: '#EFECE6', fg: '#111615', stroke: '#DCD9D0' };
  const initials = getInitials(name);
  const motif = getSectorMotifSvg(sector, palette.fg);

  return `
    <svg class="startup-logo" viewBox="0 0 38 38" aria-hidden="true">
      <rect x="0.75" y="0.75" width="36.5" height="36.5" rx="6" fill="${palette.bg}" stroke="${palette.stroke}" stroke-width="1.2" />
      ${motif}
      <text x="19" y="23.5" text-anchor="middle" font-family="Plus Jakarta Sans, sans-serif" font-size="13" font-weight="700" fill="${palette.fg}">${esc(initials)}</text>
    </svg>
  `;
}

function formatEur(amount) {
  if (typeof amount !== 'number' || Number.isNaN(amount)) return 'Undisclosed';
  return `€${amount.toFixed(1)}M`;
}

function downloadFile(filename, content, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function apiGet(path) {
  const res = await fetch(path);
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || `Request failed with status ${res.status}`);
  }
  return data;
}

async function apiPost(path, body) {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || `Request failed with status ${res.status}`);
  }
  return data;
}

/* ---------------- FULL-SCREEN ONBOARDING & VIEW NAVIGATION ---------------- */

function switchPrimaryTab(tabName) {
  state.activeTab = tabName;
  const isOnboarding = tabName === 'config';
  document.body.classList.toggle('is-onboarding', isOnboarding);

  const tabs = ['config', 'search', 'thesis'];
  for (const name of tabs) {
    const btn = document.getElementById(`tab-${name}`);
    const panel = document.getElementById(`panel-${name}`);
    const active = name === tabName;
    if (btn) {
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-selected', String(active));
    }
    if (panel) {
      panel.classList.toggle('is-active', active);
      panel.hidden = !active;
    }
  }
}

function setConfigStep(stepNumber) {
  state.configStep = stepNumber;
  for (let i = 1; i <= 3; i += 1) {
    const card = document.getElementById(`configStep${i}`);
    const stepperBtn = document.getElementById(`stepperBtn${i}`);
    if (card) card.hidden = i !== stepNumber;
    if (stepperBtn) {
      stepperBtn.classList.toggle('is-active', i === stepNumber);
      stepperBtn.classList.toggle('is-done', i < stepNumber);
    }
  }
  const fill = document.getElementById('configProgressFill');
  if (fill) {
    fill.style.width = `${(stepNumber / 3) * 100}%`;
  }
  if (stepNumber === 3) {
    renderConfigReviewSummary();
  }
}

function syncRoleSelection(role) {
  state.role = role === 'investor' ? 'investor' : 'analyst';
  document.querySelectorAll('[data-role-card]').forEach((card) => {
    const cardRole = card.getAttribute('data-role-card');
    const selected = cardRole === state.role;
    card.classList.toggle('is-selected', selected);
    const input = card.querySelector('input[type="radio"]');
    if (input) input.checked = selected;
  });

  document.querySelectorAll('[data-quick-role]').forEach((btn) => {
    btn.classList.toggle('is-active', btn.getAttribute('data-quick-role') === state.role);
  });

  updateTelemetryLine();
  if (state.activeStartupId) {
    const item = state.allKnownItems.get(state.activeStartupId);
    if (item) renderDrawerHeaderAndOverview(item);
  }
}

function syncPrioritySelection(mode) {
  state.rankingMode = ['balanced', 'untapped', 'warmest'].includes(mode) ? mode : 'balanced';
  document.querySelectorAll('input[name="rankingMode"]').forEach((r) => {
    r.checked = r.value === state.rankingMode;
  });
  document.querySelectorAll('[data-quick-priority]').forEach((btn) => {
    btn.classList.toggle('is-active', btn.getAttribute('data-quick-priority') === state.rankingMode);
  });
  renderWeightPreview();
}

function renderWeightPreview() {
  const grid = document.getElementById('weightPreviewBars');
  if (!grid) return;
  const w = WEIGHT_PRESETS[state.rankingMode] || WEIGHT_PRESETS.balanced;
  const rows = [
    { label: 'Sector', val: w.sector },
    { label: 'Stage', val: w.stage },
    { label: 'Co-investor', val: w.coInvestor },
    { label: 'Geo', val: w.geography },
    { label: 'Size', val: w.roundSize }
  ];
  grid.innerHTML = rows
    .map(
      (r) => `
      <div class="weight-bar-item">
        <div class="weight-bar-top">
          <span class="weight-bar-name">${esc(r.label)}</span>
          <span class="weight-bar-pct">${esc(r.val)}%</span>
        </div>
        <div class="weight-bar-track">
          <div class="weight-bar-fill" style="width: ${Math.min(100, Math.round((r.val / 40) * 100))}%"></div>
        </div>
      </div>
    `
    )
    .join('');
}

function syncNetworkPrioritySelection(priority) {
  state.networkPriority = priority === 'cala' ? 'cala' : 'linkedin';
  state.activeNetworkSource = state.networkPriority;
  document.querySelectorAll('[data-network-card]').forEach((card) => {
    const cardMode = card.getAttribute('data-network-card');
    const selected = cardMode === state.networkPriority;
    card.classList.toggle('is-selected', selected);
    const input = card.querySelector('input[type="radio"]');
    if (input) input.checked = selected;
  });
  renderConfigReviewSummary();
}

function renderFundQuickPicks() {
  const container = document.getElementById('fundQuickPicks');
  if (!container || !state.bootstrap) return;
  container.innerHTML = state.bootstrap.funds
    .map((f) => {
      const active = f.id === state.fundId;
      return `
        <button
          type="button"
          class="fund-index-row ${active ? 'is-active' : ''}"
          data-fund-id="${esc(f.id)}"
        >
          <span class="fund-row-left">
            <span class="fund-row-name">${esc(f.name)}</span>
            <span class="fund-row-hq">${esc(f.hqCity)}, ${esc(f.country)}</span>
          </span>
          <span class="fund-row-marker">${active ? 'Selected' : ''}</span>
        </button>
      `;
    })
    .join('');

  container.querySelectorAll('[data-fund-id]').forEach((btn) => {
    btn.addEventListener('click', () => {
      selectFund(btn.getAttribute('data-fund-id'));
    });
  });
}

function selectFund(fundId) {
  state.fundId = fundId;
  renderFundQuickPicks();
  renderSelectedFundSummary();
  const disambig = document.getElementById('fundDisambigResults');
  if (disambig) disambig.hidden = true;
}

function renderSelectedFundSummary() {
  const box = document.getElementById('selectedFundSummary');
  if (!box || !state.bootstrap) return;
  const fund = state.bootstrap.funds.find((f) => f.id === state.fundId);
  if (!fund) {
    box.textContent = '';
    return;
  }
  box.textContent = `Selected: ${fund.name} (${fund.hqCity}, ${fund.country})`;
}

function renderCompanyChecklist(filterQuery = '') {
  const listEl = document.getElementById('companyChecklist');
  const countEl = document.getElementById('companySelectCount');
  if (!listEl || !state.bootstrap) return;

  const q = filterQuery.trim().toLowerCase();
  const filtered = state.bootstrap.companies.filter(
    (c) =>
      !q ||
      c.name.toLowerCase().includes(q) ||
      c.sector.toLowerCase().includes(q) ||
      c.country.toLowerCase().includes(q)
  );

  listEl.innerHTML = filtered
    .slice(0, 32)
    .map((c) => {
      const checked = state.selectedCompanyIds.includes(c.id);
      return `
        <label class="company-check-item">
          <input type="checkbox" value="${esc(c.id)}" ${checked ? 'checked' : ''} />
          <span>
            <strong>${esc(c.name)}</strong>
            <span class="company-check-sub"> · ${esc(c.sector)}</span>
          </span>
        </label>
      `;
    })
    .join('');

  listEl.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
    cb.addEventListener('change', () => {
      const id = cb.value;
      if (cb.checked) {
        if (state.selectedCompanyIds.length >= 5) {
          cb.checked = false;
          return;
        }
        if (!state.selectedCompanyIds.includes(id)) {
          state.selectedCompanyIds.push(id);
        }
      } else {
        state.selectedCompanyIds = state.selectedCompanyIds.filter((x) => x !== id);
      }
      if (countEl) {
        countEl.textContent = `${state.selectedCompanyIds.length} selected`;
      }
    });
  });

  if (countEl) {
    countEl.textContent = `${state.selectedCompanyIds.length} selected`;
  }
}

function getConfigPayload() {
  const seenRaw = document.getElementById('seenCompaniesInput')?.value || '';
  const statedRaw = document.getElementById('statedThesisInput')?.value || '';
  state.seenCompanyNames = seenRaw;
  state.statedThesisOverride = statedRaw;

  const seenCompanyNames = seenRaw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  return {
    mode: state.inputMode,
    fundId: state.fundId,
    companyIds: state.selectedCompanyIds,
    rankingMode: state.rankingMode,
    statedThesisOverride: statedRaw.trim() || undefined,
    seenCompanyNames
  };
}

function renderConfigReviewSummary() {
  const box = document.getElementById('configReviewSummary');
  if (!box || !state.bootstrap) return;

  const payload = getConfigPayload();
  const fundObj = state.bootstrap.funds.find((f) => f.id === payload.fundId);
  const benchmarkLabel =
    payload.mode === 'companies'
      ? `${payload.companyIds.length} companies`
      : fundObj
        ? fundObj.name
        : payload.fundId;

  const priorityLabels = {
    balanced: 'Balanced',
    untapped: 'Untapped',
    warmest: 'Warmest intro'
  };

  box.innerHTML = `
    <div class="review-grid">
      <div>
        <span class="review-item-label">Role</span>
        <span class="review-item-value">${state.role === 'investor' ? 'Investor' : 'Analyst'}</span>
      </div>
      <div>
        <span class="review-item-label">Benchmark</span>
        <span class="review-item-value">${esc(benchmarkLabel)}</span>
      </div>
      <div>
        <span class="review-item-label">Focus</span>
        <span class="review-item-value">${esc(priorityLabels[payload.rankingMode] || payload.rankingMode)}</span>
      </div>
      <div>
        <span class="review-item-label">Network</span>
        <span class="review-item-value">${state.networkPriority === 'cala' ? 'Cala first' : 'LinkedIn first'}</span>
      </div>
    </div>
  `;
}

/* ---------------- ANALYSIS & AI SEARCH EXECUTION ---------------- */

function getBudgetNumbers(budget) {
  const max = budget?.maxLiveCalls ?? 8;
  const used = budget?.liveCallsUsed ?? 0;
  const remaining = Math.max(0, max - used);
  const cached = budget?.cachedEntries ?? 0;
  return { remaining, max, cached };
}

function updateTelemetryLine() {
  const el = document.getElementById('telemetryLine');
  if (!el || !state.bootstrap) return;
  const stats = state.bootstrap.coverageStats;
  const budget = state.calaBudget || stats.calaBudget;
  let remaining = 'Local cache';
  if (budget) {
    const { remaining: rem, max } = getBudgetNumbers(budget);
    remaining = `${rem}/${max} Cala credits`;
  }
  el.textContent = `${stats.companiesIndexed + stats.fundsIndexed} entities · ${remaining}`;
}

function registerKnownItems(items) {
  for (const item of items || []) {
    if (item && item.id) {
      state.allKnownItems.set(item.id, item);
    }
  }
}

async function runAnalysisAndSwitch(shouldSwitchToSearch = true, preserveFilters = false) {
  const payload = getConfigPayload();
  if (payload.mode === 'companies' && payload.companyIds.length < 3) {
    alert('Select between 3 and 5 companies, or switch to a venture fund.');
    setConfigStep(2);
    return;
  }

  const launchBtn = document.getElementById('launchDashboardBtn');
  if (launchBtn) {
    launchBtn.disabled = true;
    launchBtn.textContent = 'Loading...';
  }

  try {
    const result = await apiPost('/api/analyze', payload);
    state.analysis = result;
    state.calaBudget = result.calaBudget || state.calaBudget;
    registerKnownItems(result.shortlist);

    if (!preserveFilters) {
      state.displayedShortlist = result.shortlist || [];
      state.lastSearchResult = null;
      state.filters = {
        queryText: '',
        region: 'all',
        excludeSector: 'none',
        raisingSoonOnly: false,
        untappedOnly: false
      };
      const searchInput = document.getElementById('aiSearchInput');
      if (searchInput) searchInput.value = '';
      const regionEl = document.getElementById('filterRegion');
      if (regionEl) regionEl.value = 'all';
      const excEl = document.getElementById('filterExcludeSector');
      if (excEl) excEl.value = 'none';
      const rsEl = document.getElementById('filterRaisingSoon');
      if (rsEl) rsEl.checked = false;
      const utEl = document.getElementById('filterUntapped');
      if (utEl) utEl.checked = false;
    } else {
      await executeAiRefine();
    }

    renderSearchDashboard();
    renderThesisTab();
    updateTelemetryLine();
    updateBudgetReadout();

    if (shouldSwitchToSearch) {
      switchPrimaryTab('search');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  } catch (err) {
    alert(err.message || 'Analysis failed.');
  } finally {
    if (launchBtn) {
      launchBtn.disabled = false;
      launchBtn.textContent = 'Open workspace \u2192';
    }
  }
}

async function executeAiRefine() {
  const payload = getConfigPayload();
  const queryText = document.getElementById('aiSearchInput')?.value?.trim() || '';
  const region = document.getElementById('filterRegion')?.value || 'all';
  const excludeSector = document.getElementById('filterExcludeSector')?.value || 'none';
  const raisingSoonOnly = Boolean(document.getElementById('filterRaisingSoon')?.checked);
  const untappedOnly = Boolean(document.getElementById('filterUntapped')?.checked);

  state.filters = { queryText, region, excludeSector, raisingSoonOnly, untappedOnly };

  const submitBtn = document.getElementById('aiSearchSubmitBtn');
  if (submitBtn) submitBtn.disabled = true;

  try {
    const res = await apiPost('/api/refine', {
      ...payload,
      queryText,
      region,
      excludeSector,
      raisingSoonOnly,
      untappedOnly
    });
    state.lastSearchResult = res;
    state.displayedShortlist = res.shortlist || [];
    registerKnownItems(res.shortlist);
    renderSearchDashboard();
  } catch (err) {
    alert(err.message || 'Search failed.');
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
}

function resetAiSearch() {
  document.getElementById('aiSearchInput').value = '';
  document.getElementById('filterRegion').value = 'all';
  document.getElementById('filterExcludeSector').value = 'none';
  document.getElementById('filterRaisingSoon').checked = false;
  document.getElementById('filterUntapped').checked = false;
  state.filters = {
    queryText: '',
    region: 'all',
    excludeSector: 'none',
    raisingSoonOnly: false,
    untappedOnly: false
  };
  state.lastSearchResult = null;
  state.displayedShortlist = state.analysis?.shortlist || [];
  renderSearchDashboard();
}

function renderSearchDashboard() {
  if (!state.analysis) return;
  const { thesis } = state.analysis;

  const benchLabel = document.getElementById('activeBenchmarkLabel');
  if (benchLabel) benchLabel.textContent = thesis.fundName;

  document.querySelectorAll('[data-quick-role]').forEach((btn) => {
    btn.classList.toggle('is-active', btn.getAttribute('data-quick-role') === state.role);
  });
  document.querySelectorAll('[data-quick-priority]').forEach((btn) => {
    btn.classList.toggle('is-active', btn.getAttribute('data-quick-priority') === state.rankingMode);
  });

  // Show AI trace strip ONLY when a search or filter is active
  const traceBox = document.getElementById('aiTraceBox');
  const intentEl = document.getElementById('aiTraceIntent');
  const explEl = document.getElementById('aiExplanationText');
  const stepsEl = document.getElementById('aiTraceSteps');
  const resetBtn = document.getElementById('aiSearchResetBtn');

  const hasFilters =
    Boolean(state.filters.queryText) ||
    state.filters.region !== 'all' ||
    state.filters.excludeSector !== 'none' ||
    state.filters.raisingSoonOnly ||
    state.filters.untappedOnly;

  if (resetBtn) resetBtn.hidden = !hasFilters;

  if (state.lastSearchResult && hasFilters && traceBox) {
    traceBox.hidden = false;
    const intentMap = {
      company: 'Company match',
      investor: 'Investor match',
      industry: 'Industry filter',
      why_not: 'Portfolio audit',
      general: 'Filtered'
    };
    if (intentEl) intentEl.textContent = intentMap[state.lastSearchResult.searchIntent] || 'AI Search';
    if (explEl) {
      explEl.textContent =
        state.lastSearchResult.explanation ||
        `${state.lastSearchResult.totalMatches} startups matched.`;
    }
    if (stepsEl) {
      const traceItems = state.lastSearchResult.aiTrace || [];
      stepsEl.innerHTML = traceItems.map((line) => `<li>${esc(line)}</li>`).join('');
      stepsEl.hidden = traceItems.length === 0;
    }
  } else if (traceBox) {
    traceBox.hidden = true;
  }

  // Grid Header & 6-7 Startups Per Row Grid
  const countHeading = document.getElementById('gridCountHeading');
  if (countHeading) {
    countHeading.textContent = `${state.displayedShortlist.length} startups`;
  }

  const gridEl = document.getElementById('startupGrid');
  const emptyEl = document.getElementById('gridEmptyState');
  if (!gridEl || !emptyEl) return;

  if (!state.displayedShortlist.length) {
    gridEl.innerHTML = '';
    emptyEl.hidden = false;
    return;
  }

  emptyEl.hidden = true;
  gridEl.innerHTML = state.displayedShortlist
    .map((item) => {
      const isSelected = item.id === state.activeStartupId;
      let cueText = `${item.stage} · ${formatEur(item.lastRoundAmountEurM)}`;
      let warmClass = '';
      if (item.raisingSoon) {
        cueText = 'Raising window';
        warmClass = 'is-warm';
      } else if (item.coInvestorPath?.coInvestorName) {
        cueText = `Via ${item.coInvestorPath.coInvestorName}`;
      } else if (item.untappedSignal) {
        cueText = 'Untapped deal';
      }

      const barPct = Math.max(0, Math.min(100, item.suitabilityScore || 0));

      return `
        <button
          type="button"
          class="startup-tile ${isSelected ? 'is-selected' : ''}"
          data-startup-id="${esc(item.id)}"
          role="listitem"
        >
          <div class="tile-top">
            ${renderLogoSvg(item.name, item.sector)}
            <div class="tile-score-col">
              <span class="tile-score">${esc(item.suitabilityScore)}</span>
              <div class="tile-score-meter" aria-hidden="true">
                <div class="tile-score-fill" style="width: ${barPct}%"></div>
              </div>
            </div>
          </div>
          <div class="tile-identity">
            <span class="tile-name" title="${esc(item.name)}">${esc(item.name)}</span>
            <span class="tile-meta" title="${esc(item.sector)} · ${esc(item.country)}">${esc(item.sector)} · ${esc(item.country)}</span>
          </div>
          <div class="tile-footer">
            <span class="tile-signal ${warmClass}" title="${esc(cueText)}">${esc(cueText)}</span>
            <span class="tile-inspect-cue" aria-hidden="true">Open &rarr;</span>
          </div>
        </button>
      `;
    })
    .join('');

  gridEl.querySelectorAll('[data-startup-id]').forEach((card) => {
    card.addEventListener('click', () => {
      openInspectorDrawer(card.getAttribute('data-startup-id'), null, 'reset');
    });
  });
}

/* ---------------- TEMPORARY OVERLAP INSPECTOR DRAWER ---------------- */

async function openInspectorDrawer(startupId, initialDrawerTab, historyMode = 'reset') {
  let item = state.allKnownItems.get(startupId);

  if (!item && state.bootstrap) {
    const companyMeta = state.bootstrap.companies.find((c) => c.id === startupId);
    if (companyMeta) {
      try {
        const res = await apiPost('/api/refine', {
          ...getConfigPayload(),
          queryText: companyMeta.name
        });
        registerKnownItems(res.shortlist);
        item = state.allKnownItems.get(startupId);
      } catch (_err) {
        // Fallback below
      }
    }
  }

  if (!item) return;

  if (historyMode === 'push' && state.activeStartupId && state.activeStartupId !== startupId) {
    state.drawerHistory.push(state.activeStartupId);
  } else if (historyMode === 'reset') {
    state.drawerHistory = [];
  }

  state.activeStartupId = startupId;
  state.activeNetworkSource = state.networkPriority;
  if (initialDrawerTab) {
    state.activeDrawerTab = initialDrawerTab;
  }

  document.querySelectorAll('.startup-tile').forEach((el) => {
    el.classList.toggle('is-selected', el.getAttribute('data-startup-id') === startupId);
  });

  setExposureDepth('5s');

  const drawerLiveOut = document.getElementById('drawerLiveCalaOutput');
  if (drawerLiveOut) drawerLiveOut.hidden = true;

  renderDrawerUtilityControls();
  renderDrawerHeaderAndOverview(item);
  renderDrawerNetworkPane(item);
  switchDrawerTab(state.activeDrawerTab);

  const overlay = document.getElementById('inspectorDrawer');
  if (overlay) {
    overlay.hidden = false;
    document.body.style.overflow = 'hidden';
    requestAnimationFrame(() => {
      overlay.classList.add('is-open');
    });
  }

  loadDrawerBrief(item);
}

function closeInspectorDrawer() {
  const overlay = document.getElementById('inspectorDrawer');
  if (overlay) {
    overlay.classList.remove('is-open');
    setTimeout(() => {
      if (!state.activeStartupId) {
        overlay.hidden = true;
      }
    }, 220);
  }
  document.body.style.overflow = '';
  state.activeStartupId = null;
  state.drawerHistory = [];
  document.querySelectorAll('.startup-tile').forEach((el) => el.classList.remove('is-selected'));
}

function renderDrawerUtilityControls() {
  const backBtn = document.getElementById('drawerBackPeerBtn');
  const backNameEl = document.getElementById('drawerBackPeerName');
  if (backBtn && backNameEl) {
    if (state.drawerHistory.length > 0) {
      const prevId = state.drawerHistory[state.drawerHistory.length - 1];
      const prevItem = state.allKnownItems.get(prevId);
      backNameEl.textContent = prevItem ? prevItem.name : prevId;
      backBtn.hidden = false;
    } else {
      backBtn.hidden = true;
    }
  }

  const prevBtn = document.getElementById('drawerPrevBtn');
  const nextBtn = document.getElementById('drawerNextBtn');
  const posEl = document.getElementById('drawerPositionText');
  const list = state.displayedShortlist || [];
  const idx = list.findIndex((x) => x.id === state.activeStartupId);

  if (posEl) {
    posEl.textContent = idx >= 0 ? `${idx + 1} / ${list.length}` : 'Peer';
  }
  if (prevBtn) prevBtn.disabled = idx <= 0;
  if (nextBtn) nextBtn.disabled = idx === -1 || idx >= list.length - 1;
}

function stepDrawerStartup(delta) {
  const list = state.displayedShortlist || [];
  const idx = list.findIndex((x) => x.id === state.activeStartupId);
  if (idx === -1) return;
  const targetIdx = idx + delta;
  if (targetIdx >= 0 && targetIdx < list.length) {
    openInspectorDrawer(list[targetIdx].id, state.activeDrawerTab, 'reset');
  }
}

function setExposureDepth(depth) {
  const s2 = document.getElementById('stage2Disclosure');
  const s3 = document.getElementById('stage3Disclosure');
  if (s2) s2.open = depth === '1m' || depth === '10m';
  if (s3) s3.open = depth === '10m';
  syncDepthButtons(depth);
}

function syncDepthButtons(forcedDepth) {
  const s2Open = Boolean(document.getElementById('stage2Disclosure')?.open);
  const s3Open = Boolean(document.getElementById('stage3Disclosure')?.open);
  const current = forcedDepth || (s3Open ? '10m' : s2Open ? '1m' : '5s');
  document.querySelectorAll('[data-depth]').forEach((btn) => {
    btn.classList.toggle('is-active', btn.getAttribute('data-depth') === current);
  });
}

function switchDrawerTab(tabName) {
  state.activeDrawerTab = tabName === 'network' ? 'network' : 'score';
  const scoreBtn = document.getElementById('drawerTabScore');
  const netBtn = document.getElementById('drawerTabNetwork');
  const scorePane = document.getElementById('drawerPaneScore');
  const netPane = document.getElementById('drawerPaneNetwork');

  const isScore = state.activeDrawerTab === 'score';
  if (scoreBtn) {
    scoreBtn.classList.toggle('is-active', isScore);
    scoreBtn.setAttribute('aria-selected', String(isScore));
  }
  if (netBtn) {
    netBtn.classList.toggle('is-active', !isScore);
    netBtn.setAttribute('aria-selected', String(!isScore));
  }
  if (scorePane) scorePane.hidden = !isScore;
  if (netPane) netPane.hidden = isScore;
}

function renderDrawerHeaderAndOverview(item) {
  const logoWrap = document.getElementById('drawerLogo');
  if (logoWrap) logoWrap.innerHTML = renderLogoSvg(item.name, item.sector);

  document.getElementById('drawerTitle').textContent = item.name;
  document.getElementById('drawerSubtitle').textContent = `${item.sector} · ${item.hqCity}, ${item.country}`;

  const scoreBox = document.getElementById('drawerScoreBox');
  if (scoreBox) {
    scoreBox.innerHTML = `
      <span class="drawer-score-val">${esc(item.suitabilityScore)}</span>
      <span class="drawer-score-cap">/ 100</span>
    `;
  }

  document.getElementById('drawerOneLiner').textContent = item.oneLiner || item.description;

  const roleCallout = document.getElementById('drawerRoleTakeaway');
  if (roleCallout) {
    if (state.role === 'investor') {
      const bridgeText = item.linkedinNetwork?.bridgePerson
        ? `Intro via ${item.linkedinNetwork.bridgePerson.split('(')[0].trim()}.`
        : item.coInvestorPath?.summary || 'Direct founder outreach.';
      roleCallout.textContent = `${item.raisingSoon ? 'Raising window open.' : 'Thesis match.'} ${bridgeText}`;
    } else {
      roleCallout.textContent = `${item.roundHistory.length} Cala round(s) · ${item.reasons.length} verified signal(s).`;
    }
  }

  const factsEl = document.getElementById('drawerQuickFacts');
  if (factsEl) {
    factsEl.innerHTML = `
      <div class="fact-cell">
        <span class="fact-label">Latest round</span>
        <span class="fact-val">${esc(item.stage)} · ${formatEur(item.lastRoundAmountEurM)}</span>
      </div>
      <div class="fact-cell">
        <span class="fact-label">Date</span>
        <span class="fact-val">${esc(item.lastRoundDate || 'Undisclosed')}</span>
      </div>
      <div class="fact-cell">
        <span class="fact-label">Next stage</span>
        <span class="fact-val">${esc(item.likelyNextStage)}</span>
      </div>
    `;
  }

  const sb = item.scoreBreakdown;
  const rows = [
    { label: 'Sector', earned: sb.sector.earned, max: sb.sector.max },
    { label: 'Stage', earned: sb.stage.earned, max: sb.stage.max },
    { label: 'Co-investor', earned: sb.coInvestor.earned, max: sb.coInvestor.max },
    { label: 'Geography', earned: sb.geography.earned, max: sb.geography.max },
    { label: 'Round size', earned: sb.roundSize.earned, max: sb.roundSize.max }
  ];

  const sbEl = document.getElementById('drawerScoreBreakdown');
  if (sbEl) {
    sbEl.innerHTML = rows
      .map((r) => {
        const pct = r.max > 0 ? Math.min(100, Math.round((r.earned / r.max) * 100)) : 0;
        return `
          <div class="breakdown-row">
            <span class="breakdown-name">${esc(r.label)}</span>
            <div class="bar-track">
              <div class="bar-fill" style="width: ${pct}%"></div>
            </div>
            <span class="breakdown-val">${esc(r.earned.toFixed(1))} / ${esc(r.max)}</span>
          </div>
        `;
      })
      .join('');
  }

  const reasonsEl = document.getElementById('drawerReasonsList');
  if (reasonsEl) {
    reasonsEl.innerHTML = (item.reasons || [])
      .map((r) => {
        const cites = (r.sources || [])
          .map(
            (src, idx) =>
              `<a class="source-cite" href="${esc(src.url)}" target="_blank" rel="noopener noreferrer" title="${esc(src.title)}">[${idx + 1}]</a>`
          )
          .join('');
        return `<li>${esc(r.text)} ${cites}</li>`;
      })
      .join('');
  }

  renderDrawerStage2(item);
}

function renderDrawerStage2(item, brief) {
  const simEl = document.getElementById('drawerSimilarPortfolio');
  if (simEl) {
    const sims = item.similarPortfolio || [];
    simEl.innerHTML = sims.length
      ? sims
          .map(
            (s) => `
            <div class="ledger-item">
              <strong>${esc(s.name)}</strong>
              <span>${esc(s.sector)} · ${esc(s.country)}</span>
            </div>
          `
          )
          .join('')
      : '<p class="card-note">None recorded.</p>';
  }

  const rounds = brief?.rounds || item.roundHistory || [];
  const roundsWrap = document.getElementById('drawerRoundsTableWrap');
  if (roundsWrap) {
    roundsWrap.innerHTML = `
      <table class="data-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Stage</th>
            <th>Amount</th>
            <th>Investors</th>
          </tr>
        </thead>
        <tbody>
          ${rounds
            .map(
              (r) => `
              <tr>
                <td>${esc(r.date)}</td>
                <td>${esc(r.type)}</td>
                <td>${formatEur(r.amountEurM)}</td>
                <td><strong>${esc(r.leadInvestorName)}</strong> · ${esc((r.investorNames || []).join(', '))}</td>
              </tr>
            `
            )
            .join('')}
        </tbody>
      </table>
    `;
  }
}

async function loadDrawerBrief(item) {
  const cacheKey = `${item.id}:${state.fundId}`;
  let brief = state.briefCache.get(cacheKey);

  if (!brief) {
    try {
      const qs = new URLSearchParams({
        startupId: item.id,
        fundId: state.inputMode === 'fund' ? state.fundId : ''
      });
      brief = await apiGet(`/api/brief?${qs.toString()}`);
      state.briefCache.set(cacheKey, brief);
    } catch (_err) {
      return;
    }
  }

  if (state.activeStartupId !== item.id) return;

  renderDrawerStage2(item, brief);

  const peopleEl = document.getElementById('drawerPeopleList');
  if (peopleEl) {
    const people = [];
    if (Array.isArray(brief.peopleCoverage) && brief.peopleCoverage.length) {
      for (const p of brief.peopleCoverage) {
        people.push({ name: p.name || p.personName, role: p.role || p.title || 'Executive' });
      }
    } else if (item.linkedinNetwork?.targetLeader) {
      people.push({ name: item.linkedinNetwork.targetLeader, role: 'Leadership' });
    }

    peopleEl.innerHTML = people.length
      ? people
          .map(
            (p) => `
            <div class="ledger-item">
              <strong>${esc(p.name)}</strong>
              <span>${esc(p.role)}</span>
            </div>
          `
          )
          .join('')
      : '<div class="ledger-item"><strong>Not found in Cala</strong><span>No public officer record.</span></div>';
  }

  const gapsEl = document.getElementById('drawerGapsList');
  if (gapsEl) {
    gapsEl.innerHTML = (brief.notFoundInCala || [])
      .map(
        (g) => `
        <div class="ledger-item">
          <strong>${esc(g.field)}</strong>
          <span class="gap-status">${esc(g.status)}</span>
        </div>
      `
      )
      .join('');
  }
}

/* ---------------- NETWORK & RELATIONSHIPS ---------------- */

function renderIntroPathChain(item, isLinkedin) {
  const el = document.getElementById('introPathChain');
  if (!el) return;
  const fundName = state.analysis?.thesis?.fundName || 'Fund';

  if (isLinkedin && item.linkedinNetwork) {
    const hops = [
      fundName,
      item.linkedinNetwork.bridgePerson?.split('(')[0]?.trim() || 'Bridge',
      item.linkedinNetwork.targetLeader?.split('(')[0]?.trim() || 'Leader',
      item.name
    ];
    el.innerHTML = hops
      .map((hop, idx) => {
        const arrow = idx < hops.length - 1 ? '<span class="chain-arrow" aria-hidden="true">&rarr;</span>' : '';
        const highlight = idx === hops.length - 1 ? 'is-highlight' : '';
        return `<span class="chain-hop ${highlight}">${esc(hop)}</span>${arrow}`;
      })
      .join('');
  } else {
    const coInv = item.coInvestorPath?.coInvestorName || 'Syndicate';
    const hops = [fundName, coInv, item.name];
    el.innerHTML = hops
      .map((hop, idx) => {
        const arrow = idx < hops.length - 1 ? '<span class="chain-arrow" aria-hidden="true">&rarr;</span>' : '';
        const highlight = idx === hops.length - 1 ? 'is-highlight' : '';
        return `<span class="chain-hop ${highlight}">${esc(hop)}</span>${arrow}`;
      })
      .join('');
  }
}

function renderDrawerNetworkPane(item) {
  const sourceInputs = document.querySelectorAll('input[name="drawerNetworkSource"]');
  sourceInputs.forEach((inp) => {
    inp.checked = inp.value === state.activeNetworkSource;
  });

  const isLinkedin = state.activeNetworkSource === 'linkedin';
  const netData = isLinkedin ? item.linkedinNetwork : item.graph;

  renderIntroPathChain(item, isLinkedin);

  const summaryEl = document.getElementById('networkViewSummary');
  const svgWrap = document.getElementById('networkSvgWrap');
  const peersEl = document.getElementById('peerStartupsList');

  if (summaryEl) {
    summaryEl.textContent = isLinkedin
      ? item.linkedinNetwork?.summary || ''
      : item.coInvestorPath?.summary || 'Verified Cala funding relationships.';
  }

  if (svgWrap && netData) {
    svgWrap.innerHTML = buildNetworkGraphSvg(netData, item.id);
    svgWrap.querySelectorAll('.svg-peer-node[data-peer-id]').forEach((nodeEl) => {
      nodeEl.addEventListener('click', () => {
        openInspectorDrawer(nodeEl.getAttribute('data-peer-id'), 'network', 'push');
      });
    });
  }

  if (peersEl) {
    const peers = item.peerStartups || [];
    peersEl.innerHTML = peers.length
      ? peers
          .map(
            (p) => `
            <button type="button" class="peer-btn" data-peer-id="${esc(p.id)}">
              ${renderLogoSvg(p.name, p.sector)}
              <span class="peer-btn-meta">
                <span class="peer-btn-name">${esc(p.name)}</span>
                <span class="peer-btn-desc">${esc(p.sector)} · ${esc(p.bridgeLabel)}</span>
              </span>
            </button>
          `
          )
          .join('')
      : '<p class="card-note">No connected startups indexed.</p>';

    peersEl.querySelectorAll('[data-peer-id]').forEach((btn) => {
      btn.addEventListener('click', () => {
        openInspectorDrawer(btn.getAttribute('data-peer-id'), 'network', 'push');
      });
    });
  }
}

function buildNetworkGraphSvg(graphObj, selectedStartupId) {
  const nodes = (graphObj.nodes || []).slice(0, 8);
  const links = graphObj.links || [];
  const width = 940;
  const height = 310;

  const cols = { fund: [], bridge: [], target: [], peer: [] };
  for (const n of nodes) {
    if (n.type === 'target_fund') cols.fund.push(n);
    else if (n.id === selectedStartupId || n.type === 'target_startup') cols.target.push(n);
    else if (n.type === 'co_investor' || n.type === 'portfolio') cols.bridge.push(n);
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
    if (type === 'target_fund') return { accent: '#0B5540', kind: 'FUND' };
    if (id === selectedStartupId || type === 'target_startup') return { accent: '#111615', kind: 'SELECTED' };
    if (type === 'co_investor') return { accent: '#9A3412', kind: 'BRIDGE' };
    if (id === 'li-leader') return { accent: '#0B5540', kind: 'LEADERSHIP' };
    if (type === 'portfolio') return { accent: '#525B58', kind: 'PORTFOLIO' };
    return { accent: '#525B58', kind: 'PEER' };
  };

  const edgeSvg = links
    .map((link) => {
      const a = positions.get(link.source);
      const b = positions.get(link.target);
      if (!a || !b) return '';

      const edgeText = String(link.label || '').slice(0, 16);
      const pillW = Math.max(46, edgeText.length * 6.5 + 14);

      if (a.cx === b.cx) {
        const yTop = a.cy < b.cy ? a.cy + cardH / 2 : b.cy + cardH / 2;
        const yBot = a.cy < b.cy ? b.cy - cardH / 2 : a.cy - cardH / 2;
        const my = Math.round((yTop + yBot) / 2);
        return `
          <path d="M ${a.cx} ${yTop} L ${b.cx} ${yBot}" fill="none" stroke="#C5C1B5" stroke-width="1.5" />
          ${
            edgeText
              ? `<rect x="${a.cx - pillW / 2}" y="${my - 9}" width="${pillW}" height="18" rx="3" fill="#F6F5F0" stroke="#DCD9D0" stroke-width="0.75" />
                 <text x="${a.cx}" y="${my + 3.5}" text-anchor="middle" font-family="Plus Jakarta Sans, sans-serif" font-size="11.5" fill="#525B58">${esc(edgeText)}</text>`
              : ''
          }
        `;
      }

      const x1 = a.cx < b.cx ? a.cx + cardW / 2 : a.cx - cardW / 2;
      const y1 = a.cy;
      const x2 = a.cx < b.cx ? b.cx - cardW / 2 : b.cx + cardW / 2;
      const y2 = b.cy;
      const dx = Math.abs(x2 - x1) * 0.45;
      const cx1 = a.cx < b.cx ? x1 + dx : x1 - dx;
      const cx2 = a.cx < b.cx ? x2 - dx : x2 + dx;
      const mx = Math.round((x1 + x2) / 2);
      const my = Math.round((y1 + y2) / 2);

      return `
        <path d="M ${x1} ${y1} C ${cx1} ${y1}, ${cx2} ${y2}, ${x2} ${y2}" fill="none" stroke="#C5C1B5" stroke-width="1.5" />
        ${
          edgeText
            ? `<rect x="${mx - pillW / 2}" y="${my - 9}" width="${pillW}" height="18" rx="3" fill="#F6F5F0" stroke="#DCD9D0" stroke-width="0.75" />
               <text x="${mx}" y="${my + 3.5}" text-anchor="middle" font-family="Plus Jakarta Sans, sans-serif" font-size="11.5" fill="#525B58">${esc(edgeText)}</text>`
            : ''
        }
      `;
    })
    .join('');

  const nodeSvg = [...positions.values()]
    .map(({ cx, cy, node }) => {
      const st = styleForType(node.type, node.id);
      const x = cx - cardW / 2;
      const y = cy - cardH / 2;
      const shortLabel = node.label.length > 22 ? `${node.label.slice(0, 20)}..` : node.label;
      const isClickablePeer = node.type === 'peer_startup';
      const peerClass = isClickablePeer ? 'svg-peer-node' : '';
      const peerAttr = isClickablePeer ? `data-peer-id="${esc(node.id)}"` : '';

      return `
        <g class="${peerClass}" ${peerAttr}>
          <rect x="${x}" y="${y}" width="${cardW}" height="${cardH}" rx="5" fill="#FFFFFF" stroke="${st.accent}" stroke-width="1.2" />
          <rect x="${x}" y="${y}" width="4" height="${cardH}" rx="2" fill="${st.accent}" />
          <text x="${x + 12}" y="${y + 18}" font-family="Plus Jakarta Sans, sans-serif" font-size="11.5" font-weight="600" fill="${st.accent}">${esc(st.kind)}</text>
          <text x="${x + 12}" y="${y + 36}" font-family="Plus Jakarta Sans, sans-serif" font-size="12" font-weight="600" fill="#111615">${esc(shortLabel)}</text>
        </g>
      `;
    })
    .join('');

  return `
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Startup relationship network diagram">
      ${edgeSvg}
      ${nodeSvg}
    </svg>
  `;
}

/* ---------------- THESIS & BACKTEST TAB ---------------- */

function renderThesisTab() {
  if (!state.analysis) return;
  const { thesis, backtest } = state.analysis;

  document.getElementById('thesisTitleHeading').textContent = thesis.fundName;
  document.getElementById('thesisHeaderSummary').textContent = thesis.driftSummary || '';

  const verifyInput = document.getElementById('calaVerifyInput');
  if (verifyInput && !verifyInput.value && thesis.mode === 'fund') {
    verifyInput.value = thesis.fundName;
  }

  const stripEl = document.getElementById('thesisMetricsStrip');
  if (stripEl) {
    const topSector = thesis.sectorMix?.[0]?.label || 'Mixed';
    const topCountry = thesis.geographyMix?.[0]?.label || 'Europe';
    const metrics = [
      { label: 'Deals', value: thesis.dealsAnalyzedCount },
      { label: 'Portfolio', value: thesis.portfolioCount },
      { label: 'Lead rate', value: `${thesis.leadRatePct}%` },
      { label: 'Follow-on', value: `${thesis.followOnRatePct}%` },
      { label: 'Median round', value: formatEur(thesis.medianRoundSizeEurM) },
      { label: 'Core cluster', value: `${topSector} · ${topCountry}` }
    ];
    stripEl.innerHTML = metrics
      .map(
        (m) => `
        <div class="metric-cell">
          <span class="metric-label">${esc(m.label)}</span>
          <span class="metric-value">${esc(m.value)}</span>
        </div>
      `
      )
      .join('');
  }

  const distEl = document.getElementById('thesisDistributions');
  if (distEl) {
    const renderBars = (title, items) => `
      <div>
        <h3 class="dist-group-title">${esc(title)}</h3>
        ${(items || [])
          .slice(0, 5)
          .map(
            (row) => `
            <div class="bar-row">
              <span class="bar-label">${esc(row.label)}</span>
              <div class="bar-track"><div class="bar-fill" style="width: ${Math.min(100, row.sharePct)}%"></div></div>
              <span class="bar-pct">${esc(row.sharePct)}%</span>
            </div>
          `
          )
          .join('')}
      </div>
    `;

    distEl.innerHTML =
      renderBars('Sectors', thesis.sectorMix) +
      renderBars('Stages', thesis.stageMix) +
      renderBars('Geography', thesis.geographyMix);
  }

  const statedEl = document.getElementById('statedVsRevealedPanel');
  if (statedEl) {
    statedEl.innerHTML = `
      <p><strong>Stated:</strong> ${esc(thesis.statedThesis)}</p>
      <ul class="stated-diff-list">
        ${(thesis.statedVsRevealed || []).map((line) => `<li>${esc(line)}</li>`).join('')}
      </ul>
    `;
  }

  const btPanel = document.getElementById('backtestPanel');
  const btNote = document.getElementById('backtestSummaryNote');
  if (btPanel && btNote) {
    if (!backtest) {
      btNote.textContent = 'Available when benchmarking an indexed fund.';
      btPanel.innerHTML = '';
    } else {
      btNote.textContent = backtest.summaryText;
      btPanel.innerHTML = `
        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>Hidden deal</th>
                <th>Stage</th>
                <th>Date</th>
                <th>Predicted rank</th>
                <th>Co-investor bridge</th>
              </tr>
            </thead>
            <tbody>
              ${(backtest.hiddenDeals || [])
                .map(
                  (hd) => `
                  <tr>
                    <td><strong>${esc(hd.name)}</strong></td>
                    <td>${esc(hd.actualRoundType)}</td>
                    <td>${esc(hd.actualDate)}</td>
                    <td>#${esc(hd.predictedRank)} (${esc(hd.predictedScore)}/100)</td>
                    <td>${esc(hd.coInvestorHint)}</td>
                  </tr>
                `
                )
                .join('')}
            </tbody>
          </table>
        </div>
      `;
    }
  }
}

function updateBudgetReadout() {
  const el = document.getElementById('calaBudgetReadout');
  if (!el) return;
  const b = state.calaBudget || state.bootstrap?.coverageStats?.calaBudget;
  if (!b) {
    el.textContent = 'Local cache';
    return;
  }
  const { remaining, max, cached } = getBudgetNumbers(b);
  el.textContent = `${remaining}/${max} live calls left (${cached} cached)`;
}

function formatCalaLiveHtml(res) {
  const live = res.liveSummary;
  if (!live) {
    return `<p>No live Cala entity found for "${esc(res.queryName)}".</p>`;
  }

  const cacheStatus = res.fromCache ? 'Cached (0 credits used)' : 'Live Cala response (cached)';
  const investedList = (live.investedIn || [])
    .slice(0, 8)
    .map((item) => esc(item.name || item.title || item.id))
    .join(', ');

  const roundsRows = (live.fundingRounds || live.raisedRounds || [])
    .slice(0, 6)
    .map(
      (r) =>
        `<li><strong>${esc(r.name || r.roundType || 'Round')}</strong>${r.isLead ? ' (Lead)' : ''}${r.amount ? ` · ${esc(r.amount)}` : ''}</li>`
    )
    .join('');

  return `
    <p><strong>${esc(live.name)}</strong> (${esc(live.entityType || 'Entity')}) · ${esc(cacheStatus)}</p>
    ${live.description ? `<p>${esc(live.description)}</p>` : ''}
    ${live.investedInCount > 0 ? `<p><strong>Portfolio (${esc(live.investedInCount)}):</strong> ${investedList}</p>` : ''}
    ${roundsRows ? `<ul>${roundsRows}</ul>` : ''}
    ${res.knowledgeAnswer ? `<p><strong>Knowledge Search:</strong> ${esc(res.knowledgeAnswer)}</p>` : ''}
  `;
}

async function handleLiveCalaVerify(type, name, includeKnowledgeSearch, outputEl, triggerBtn) {
  if (!name.trim()) return;
  const originalLabel = triggerBtn.textContent;
  triggerBtn.disabled = true;
  triggerBtn.textContent = 'Verifying...';

  try {
    const res = await apiPost('/api/cala-verify', {
      type,
      name: name.trim(),
      includeKnowledgeSearch: Boolean(includeKnowledgeSearch)
    });
    if (res.budget) {
      state.calaBudget = res.budget;
      updateBudgetReadout();
      updateTelemetryLine();
    }
    outputEl.innerHTML = formatCalaLiveHtml(res);
    outputEl.hidden = false;
  } catch (err) {
    outputEl.innerHTML = `<p>${esc(err.message || 'Verification failed.')}</p>`;
    outputEl.hidden = false;
  } finally {
    triggerBtn.disabled = false;
    triggerBtn.textContent = originalLabel;
  }
}

/* ---------------- EVENT BINDING & BOOTSTRAP ---------------- */

function bindEvents() {
  document.querySelectorAll('.primary-tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      switchPrimaryTab(btn.getAttribute('data-tab'));
    });
  });

  document.getElementById('stepperBtn1')?.addEventListener('click', () => setConfigStep(1));
  document.getElementById('stepperBtn2')?.addEventListener('click', () => setConfigStep(2));
  document.getElementById('stepperBtn3')?.addEventListener('click', () => setConfigStep(3));
  document.getElementById('skipToWorkspaceBtn')?.addEventListener('click', () => runAnalysisAndSwitch(true));

  document.getElementById('step1NextBtn')?.addEventListener('click', () => setConfigStep(2));
  document.getElementById('step2BackBtn')?.addEventListener('click', () => setConfigStep(1));
  document.getElementById('step2NextBtn')?.addEventListener('click', () => setConfigStep(3));
  document.getElementById('step3BackBtn')?.addEventListener('click', () => setConfigStep(2));
  document.getElementById('launchDashboardBtn')?.addEventListener('click', () => runAnalysisAndSwitch(true));

  document.querySelectorAll('input[name="configRole"]').forEach((radio) => {
    radio.addEventListener('change', (e) => {
      syncRoleSelection(e.target.value);
    });
  });

  document.querySelectorAll('input[name="inputMode"]').forEach((radio) => {
    radio.addEventListener('change', (e) => {
      state.inputMode = e.target.value === 'companies' ? 'companies' : 'fund';
      document.getElementById('fundModePanel').hidden = state.inputMode !== 'fund';
      document.getElementById('companiesModePanel').hidden = state.inputMode !== 'companies';
    });
  });

  document.querySelectorAll('input[name="rankingMode"]').forEach((radio) => {
    radio.addEventListener('change', (e) => {
      syncPrioritySelection(e.target.value);
    });
  });

  document.querySelectorAll('input[name="networkPriority"]').forEach((radio) => {
    radio.addEventListener('change', (e) => {
      syncNetworkPrioritySelection(e.target.value);
    });
  });

  // Inline Calibration Controls
  document.querySelectorAll('[data-quick-role]').forEach((btn) => {
    btn.addEventListener('click', () => {
      syncRoleSelection(btn.getAttribute('data-quick-role'));
    });
  });

  document.querySelectorAll('[data-quick-priority]').forEach((btn) => {
    btn.addEventListener('click', () => {
      syncPrioritySelection(btn.getAttribute('data-quick-priority'));
      runAnalysisAndSwitch(false, true);
    });
  });

  // Fund search top-3 disambiguation
  let searchTimer = null;
  document.getElementById('fundSearchInput')?.addEventListener('input', (e) => {
    const q = e.target.value.trim();
    clearTimeout(searchTimer);
    const resultsBox = document.getElementById('fundDisambigResults');
    if (!q) {
      resultsBox.hidden = true;
      return;
    }
    searchTimer = setTimeout(async () => {
      try {
        const res = await apiGet(`/api/search?q=${encodeURIComponent(q)}`);
        if (!res.funds || !res.funds.length) {
          resultsBox.innerHTML = '<div class="disambig-option">No matching funds.</div>';
          resultsBox.hidden = false;
          return;
        }
        resultsBox.innerHTML = res.funds
          .map(
            (f) => `
            <button type="button" class="disambig-option" data-pick-fund="${esc(f.id)}">
              <span><strong>${esc(f.name)}</strong></span>
              <span class="disambig-meta">${esc(f.hqCity)}, ${esc(f.country)}</span>
            </button>
          `
          )
          .join('');
        resultsBox.hidden = false;
        resultsBox.querySelectorAll('[data-pick-fund]').forEach((opt) => {
          opt.addEventListener('click', () => {
            selectFund(opt.getAttribute('data-pick-fund'));
            document.getElementById('fundSearchInput').value = '';
          });
        });
      } catch (_err) {
        resultsBox.hidden = true;
      }
    }, 150);
  });

  document.getElementById('companyBenchmarkSearch')?.addEventListener('input', (e) => {
    renderCompanyChecklist(e.target.value);
  });

  document.getElementById('aiSearchForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    executeAiRefine();
  });

  document.getElementById('aiSearchResetBtn')?.addEventListener('click', resetAiSearch);
  document.getElementById('emptyResetBtn')?.addEventListener('click', resetAiSearch);

  document.querySelectorAll('.example-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const q = btn.getAttribute('data-query') || '';
      document.getElementById('aiSearchInput').value = q;
      executeAiRefine();
    });
  });

  ['filterRegion', 'filterExcludeSector', 'filterRaisingSoon', 'filterUntapped'].forEach((id) => {
    document.getElementById(id)?.addEventListener('change', executeAiRefine);
  });

  document.getElementById('editSetupBtn')?.addEventListener('click', () => {
    setConfigStep(1);
    switchPrimaryTab('config');
  });

  document.getElementById('backToSearchBtn')?.addEventListener('click', () => {
    switchPrimaryTab('search');
  });

  // Temporary Overlap Drawer Events
  document.getElementById('drawerCloseBtn')?.addEventListener('click', closeInspectorDrawer);
  document.getElementById('drawerBackdrop')?.addEventListener('click', closeInspectorDrawer);

  document.getElementById('drawerPrevBtn')?.addEventListener('click', () => stepDrawerStartup(-1));
  document.getElementById('drawerNextBtn')?.addEventListener('click', () => stepDrawerStartup(1));
  document.getElementById('drawerBackPeerBtn')?.addEventListener('click', () => {
    const prevId = state.drawerHistory.pop();
    if (prevId) {
      openInspectorDrawer(prevId, state.activeDrawerTab, 'preserve');
    }
  });

  document.getElementById('drawerTabScore')?.addEventListener('click', () => switchDrawerTab('score'));
  document.getElementById('drawerTabNetwork')?.addEventListener('click', () => switchDrawerTab('network'));

  document.querySelectorAll('[data-depth]').forEach((btn) => {
    btn.addEventListener('click', () => {
      setExposureDepth(btn.getAttribute('data-depth'));
    });
  });

  document.getElementById('stage2Disclosure')?.addEventListener('toggle', () => syncDepthButtons());
  document.getElementById('stage3Disclosure')?.addEventListener('toggle', () => syncDepthButtons());

  document.querySelectorAll('input[name="drawerNetworkSource"]').forEach((radio) => {
    radio.addEventListener('change', (e) => {
      state.activeNetworkSource = e.target.value === 'cala' ? 'cala' : 'linkedin';
      const item = state.allKnownItems.get(state.activeStartupId);
      if (item) renderDrawerNetworkPane(item);
    });
  });

  document.addEventListener('keydown', (e) => {
    const tag = document.activeElement?.tagName;
    const isTyping = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';

    if (e.key === 'Escape' && state.activeStartupId) {
      closeInspectorDrawer();
      return;
    }

    if (state.activeStartupId && !isTyping) {
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        stepDrawerStartup(-1);
        return;
      }
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        stepDrawerStartup(1);
        return;
      }
    }

    if (e.key === '/' && state.activeTab === 'search' && !state.activeStartupId && !isTyping) {
      e.preventDefault();
      document.getElementById('aiSearchInput')?.focus();
    }
  });

  document.getElementById('drawerExportMdBtn')?.addEventListener('click', () => {
    if (!state.activeStartupId) return;
    const item = state.allKnownItems.get(state.activeStartupId);
    const cacheKey = `${state.activeStartupId}:${state.fundId}`;
    const brief = state.briefCache.get(cacheKey);
    if (brief?.memoMarkdown) {
      downloadFile(`${item.id}-thesis-memo.md`, brief.memoMarkdown, 'text/markdown');
    }
  });

  document.getElementById('drawerExportCsvBtn')?.addEventListener('click', () => {
    if (!state.activeStartupId) return;
    const item = state.allKnownItems.get(state.activeStartupId);
    const csv = [
      'name,sector,country,stage,suitabilityScore,sectorEarned,stageEarned,coInvestorEarned,geoEarned,roundSizeEarned',
      `"${item.name}","${item.sector}","${item.country}","${item.stage}",${item.suitabilityScore},${item.scoreBreakdown.sector.earned},${item.scoreBreakdown.stage.earned},${item.scoreBreakdown.coInvestor.earned},${item.scoreBreakdown.geography.earned},${item.scoreBreakdown.roundSize.earned}`
    ].join('\n');
    downloadFile(`${item.id}-score.csv`, csv, 'text/csv');
  });

  document.getElementById('drawerVerifyCalaBtn')?.addEventListener('click', (e) => {
    const item = state.allKnownItems.get(state.activeStartupId);
    if (!item) return;
    handleLiveCalaVerify(
      'company',
      item.name,
      false,
      document.getElementById('drawerLiveCalaOutput'),
      e.target
    );
  });

  document.getElementById('calaVerifyBtn')?.addEventListener('click', (e) => {
    const type = document.getElementById('calaVerifyType').value;
    const name = document.getElementById('calaVerifyInput').value;
    const deep = Boolean(document.getElementById('calaDeepSearchToggle').checked);
    handleLiveCalaVerify(type, name, deep, document.getElementById('calaLiveResult'), e.target);
  });
}

async function bootstrap() {
  bindEvents();
  renderWeightPreview();
  try {
    const data = await apiGet('/api/bootstrap');
    state.bootstrap = data;
    state.calaBudget = data.coverageStats?.calaBudget || null;
    if (data.funds?.length) {
      state.fundId = data.funds[0].id;
    }

    renderFundQuickPicks();
    renderSelectedFundSummary();
    renderCompanyChecklist();
    renderConfigReviewSummary();
    updateTelemetryLine();
    updateBudgetReadout();

    await runAnalysisAndSwitch(false);
    switchPrimaryTab('config');
  } catch (err) {
    document.getElementById('telemetryLine').textContent = `Error: ${err.message}`;
  }
}

bootstrap();
