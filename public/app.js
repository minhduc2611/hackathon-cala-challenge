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
  activeDrawerTab: 'score', // 'score' | 'network'
  activeNetworkSource: 'linkedin', // 'linkedin' | 'cala'
  briefCache: new Map(),

  // Live Cala telemetry
  calaBudget: null
};

const LOGO_PALETTES = {
  HealthTech: { bg: '#E8F1EE', fg: '#0D5C46', stroke: '#B6D3C9' },
  DeepTech: { bg: '#EDF0F4', fg: '#1F3A52', stroke: '#C2CDD9' },
  'Climate Tech': { bg: '#EBF3E8', fg: '#1E5631', stroke: '#BFD8B8' },
  'B2B SaaS': { bg: '#F2EFE9', fg: '#4D3D24', stroke: '#D6CEBF' },
  'AI & ML': { bg: '#EEF0F7', fg: '#2C3867', stroke: '#C5CCE3' },
  Fintech: { bg: '#FDF1EC', fg: '#9A3412', stroke: '#E7C5B5' }
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

function hashSeed(text) {
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 31 + text.charCodeAt(i)) % 997;
  }
  return hash;
}

function renderLogoSvg(name, sector) {
  const palette = LOGO_PALETTES[sector] || { bg: '#ECEEE9', fg: '#0F1715', stroke: '#D5DAD4' };
  const initials = getInitials(name);
  const motif = hashSeed(String(name || ''));
  const cornerX = motif % 2 === 0 ? 27 : 7;
  const cornerY = motif % 3 === 0 ? 9 : 27;

  return `
    <svg class="startup-logo" viewBox="0 0 36 36" aria-hidden="true">
      <rect x="0.75" y="0.75" width="34.5" height="34.5" rx="6" fill="${palette.bg}" stroke="${palette.stroke}" stroke-width="1.25" />
      <circle cx="${cornerX}" cy="${cornerY}" r="2.1" fill="${palette.fg}" opacity="0.32" />
      <text x="18" y="22.5" text-anchor="middle" font-family="Plus Jakarta Sans, sans-serif" font-size="12.5" font-weight="700" fill="${palette.fg}">${esc(initials)}</text>
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

/* ---------------- NAVIGATION & CONFIGURATION WIZARD ---------------- */

function switchPrimaryTab(tabName) {
  state.activeTab = tabName;
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
  if (stepNumber === 3) {
    renderConfigReviewSummary();
  }
}

function syncRoleSelection(role) {
  state.role = role === 'investor' ? 'investor' : 'analyst';
  document.querySelectorAll('[data-role-card]').forEach((card) => {
    const cardRole = card.getAttribute('data-role-card');
    card.classList.toggle('is-selected', cardRole === state.role);
    const input = card.querySelector('input[type="radio"]');
    if (input) input.checked = cardRole === state.role;
  });

  const hintEl = document.getElementById('roleStepHint');
  if (hintEl) {
    hintEl.textContent =
      state.role === 'investor'
        ? 'Default lens for Investor / Partner: High-conviction triage, thesis drift audit, and warm intro paths.'
        : 'Default lens for Analyst: Balanced suitability ranking, expandable Cala tables, and memo exports.';
  }
  updateTelemetryLine();
}

function syncNetworkPrioritySelection(priority) {
  state.networkPriority = priority === 'cala' ? 'cala' : 'linkedin';
  state.activeNetworkSource = state.networkPriority;
  document.querySelectorAll('[data-network-card]').forEach((card) => {
    const cardMode = card.getAttribute('data-network-card');
    card.classList.toggle('is-selected', cardMode === state.networkPriority);
    const input = card.querySelector('input[type="radio"]');
    if (input) input.checked = cardMode === state.networkPriority;
  });
  renderConfigReviewSummary();
}

function renderFundQuickPicks() {
  const container = document.getElementById('fundQuickPicks');
  if (!container || !state.bootstrap) return;
  container.innerHTML = state.bootstrap.funds
    .map(
      (f) => `
      <button
        type="button"
        class="quick-pick-btn ${f.id === state.fundId ? 'is-active' : ''}"
        data-fund-id="${esc(f.id)}"
      >
        ${esc(f.name)}
      </button>
    `
    )
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
    box.textContent = 'Select a fund above to inspect its revealed thesis.';
    return;
  }
  box.innerHTML = `
    <strong>${esc(fund.name)}</strong> · ${esc(fund.hqCity)}, ${esc(fund.country)} (${esc(fund.teamSize)} team members)<br />
    <span class="disambig-meta">Stated positioning: ${esc(fund.statedThesis)}</span>
  `;
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
            <span class="company-check-sub"> · ${esc(c.sector)} (${esc(c.country)})</span>
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
      ? `${payload.companyIds.length} admired companies benchmark`
      : `${fundObj ? fundObj.name : payload.fundId} (indexed fund)`;

  const priorityLabels = {
    balanced: 'Balanced fit',
    untapped: 'Untapped alpha',
    warmest: 'Warmest intro'
  };

  box.innerHTML = `
    <div class="review-grid">
      <div>
        <span class="review-item-label">Role perspective</span>
        <span class="review-item-value">${state.role === 'investor' ? 'Investor or partner' : 'Investment analyst'}</span>
      </div>
      <div>
        <span class="review-item-label">Benchmark target</span>
        <span class="review-item-value">${esc(benchmarkLabel)}</span>
      </div>
      <div>
        <span class="review-item-label">Scoring priority</span>
        <span class="review-item-value">${esc(priorityLabels[payload.rankingMode] || payload.rankingMode)}</span>
      </div>
      <div>
        <span class="review-item-label">Default network graph order</span>
        <span class="review-item-value">${
          state.networkPriority === 'cala'
            ? 'Cala public funding graph first'
            : 'LinkedIn & 3rd-party paths first'
        }</span>
      </div>
      <div>
        <span class="review-item-label">Excluded seen companies</span>
        <span class="review-item-value">${
          payload.seenCompanyNames.length ? esc(payload.seenCompanyNames.join(', ')) : 'None specified'
        }</span>
      </div>
    </div>
  `;
}

/* ---------------- ANALYSIS & AI SEARCH EXECUTION ---------------- */

function updateTelemetryLine() {
  const el = document.getElementById('telemetryLine');
  if (!el || !state.bootstrap) return;
  const stats = state.bootstrap.coverageStats;
  const budget = state.calaBudget || stats.calaBudget;
  const remaining = budget ? `${budget.remainingCalls}/${budget.maxLiveCalls} live credits left` : 'Local cache active';
  const roleName = state.role === 'investor' ? 'Partner view' : 'Analyst view';
  el.textContent = `${stats.companiesIndexed + stats.fundsIndexed} Cala entities · ${stats.roundsIndexed} rounds · ${roleName} · ${remaining}`;
}

function registerKnownItems(items) {
  for (const item of items || []) {
    if (item && item.id) {
      state.allKnownItems.set(item.id, item);
    }
  }
}

async function runAnalysisAndSwitch(shouldSwitchToSearch = true) {
  const payload = getConfigPayload();
  if (payload.mode === 'companies' && payload.companyIds.length < 3) {
    alert('Select between 3 and 5 companies to build a benchmark thesis, or switch to an indexed fund.');
    setConfigStep(2);
    return;
  }

  const launchBtn = document.getElementById('launchDashboardBtn');
  if (launchBtn) {
    launchBtn.disabled = true;
    launchBtn.textContent = 'Running thesis analysis...';
  }

  try {
    const result = await apiPost('/api/analyze', payload);
    state.analysis = result;
    state.calaBudget = result.calaBudget || state.calaBudget;
    state.displayedShortlist = result.shortlist || [];
    state.lastSearchResult = null;
    registerKnownItems(result.shortlist);

    // Clear active search box when relaunching configuration
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

    renderSearchDashboard();
    renderThesisTab();
    updateTelemetryLine();
    updateBudgetReadout();

    if (shouldSwitchToSearch) {
      switchPrimaryTab('search');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  } catch (err) {
    alert(err.message || 'Failed to compute revealed thesis analysis.');
  } finally {
    if (launchBtn) {
      launchBtn.disabled = false;
      launchBtn.textContent = 'Launch AI search dashboard';
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
    alert(err.message || 'AI refinement failed.');
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
  const { thesis, rankingMode } = state.analysis;

  const contextEl = document.getElementById('searchRoleContext');
  if (contextEl) {
    const priorityNames = {
      balanced: 'Balanced fit',
      untapped: 'Untapped alpha',
      warmest: 'Warmest intro'
    };
    const netLabel = state.networkPriority === 'cala' ? 'Cala graph first' : 'LinkedIn network first';
    const roleText = state.role === 'investor' ? 'Investor / Partner' : 'Analyst';
    contextEl.textContent = `${roleText} · Benchmark: ${thesis.fundName} · ${priorityNames[rankingMode] || rankingMode} · ${netLabel}`;
  }

  // AI Trace & Explanation Box
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

  if (state.lastSearchResult && hasFilters) {
    const intentMap = {
      company: 'Company similarity lookup',
      investor: 'Investor & co-investor search',
      industry: 'Industry sector scan',
      why_not: 'Portfolio exclusion audit',
      general: 'Thesis refinement'
    };
    if (intentEl) intentEl.textContent = intentMap[state.lastSearchResult.searchIntent] || 'AI search';
    if (explEl) {
      explEl.textContent =
        state.lastSearchResult.explanation ||
        `Matched ${state.lastSearchResult.totalMatches} startups from ${thesis.fundName} evaluated pool.`;
    }
    if (stepsEl) {
      const traceItems = state.lastSearchResult.aiTrace || [];
      stepsEl.innerHTML = traceItems.map((line) => `<li>${esc(line)}</li>`).join('');
      stepsEl.hidden = traceItems.length === 0;
    }
  } else {
    if (intentEl) intentEl.textContent = 'Baseline thesis shortlist';
    if (explEl) {
      explEl.textContent = `Showing top ${state.displayedShortlist.length} startups ranked from ${state.analysis.totalCandidatesEvaluated} European companies scored out of 100 against ${thesis.fundName}.`;
    }
    if (stepsEl) {
      stepsEl.innerHTML = `
        <li>Scored on Cala-indexed lead history (${esc(thesis.dealsAnalyzedCount)} deals, median check signal ${formatEur(thesis.medianRoundSizeEurM)})</li>
        <li>Portfolio companies and direct category competitors filtered automatically</li>
      `;
      stepsEl.hidden = false;
    }
  }

  // Grid Header & Cards (6-7 startups a line on desktop)
  const countHeading = document.getElementById('gridCountHeading');
  if (countHeading) {
    const total = state.lastSearchResult ? state.lastSearchResult.totalMatches : state.displayedShortlist.length;
    countHeading.textContent = `Showing ${state.displayedShortlist.length} of ${total} startups`;
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

      return `
        <button
          type="button"
          class="startup-tile ${isSelected ? 'is-selected' : ''}"
          data-startup-id="${esc(item.id)}"
          role="listitem"
        >
          <div class="tile-top">
            ${renderLogoSvg(item.name, item.sector)}
            <div class="tile-score-group">
              <span class="tile-score">${esc(item.suitabilityScore)}</span>
              <span class="tile-score-cap">/ 100</span>
            </div>
          </div>
          <div class="tile-identity">
            <span class="tile-name" title="${esc(item.name)}">${esc(item.name)}</span>
            <span class="tile-meta" title="${esc(item.sector)} · ${esc(item.country)}">${esc(item.sector)} · ${esc(item.country)}</span>
          </div>
          <span class="tile-signal ${warmClass}" title="${esc(cueText)}">${esc(cueText)}</span>
        </button>
      `;
    })
    .join('');

  gridEl.querySelectorAll('[data-startup-id]').forEach((card) => {
    card.addEventListener('click', () => {
      openInspectorDrawer(card.getAttribute('data-startup-id'));
    });
  });
}

/* ---------------- TEMPORARY OVERLAP INSPECTOR DRAWER ---------------- */

async function openInspectorDrawer(startupId, initialDrawerTab) {
  let item = state.allKnownItems.get(startupId);

  // If clicked from a peer startup link outside the current 20-item slice, look up via refine
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
        // Ignore and fallback below if unavailable
      }
    }
  }

  if (!item) return;

  state.activeStartupId = startupId;
  state.activeNetworkSource = state.networkPriority;
  if (initialDrawerTab) {
    state.activeDrawerTab = initialDrawerTab;
  }

  // Highlight selected tile in background grid
  document.querySelectorAll('.startup-tile').forEach((el) => {
    el.classList.toggle('is-selected', el.getAttribute('data-startup-id') === startupId);
  });

  // Reset gradual exposure state per role
  const stage2 = document.getElementById('stage2Disclosure');
  const stage3 = document.getElementById('stage3Disclosure');
  if (stage2) stage2.open = false;
  if (stage3) stage3.open = false;

  const drawerLiveOut = document.getElementById('drawerLiveCalaOutput');
  if (drawerLiveOut) drawerLiveOut.hidden = true;

  renderDrawerHeaderAndOverview(item);
  renderDrawerNetworkPane(item);
  switchDrawerTab(state.activeDrawerTab);

  const overlay = document.getElementById('inspectorDrawer');
  if (overlay) {
    overlay.hidden = false;
    document.body.style.overflow = 'hidden';
  }

  // Load detailed brief asynchronously for Stage 2 & Stage 3
  loadDrawerBrief(item);
}

function closeInspectorDrawer() {
  const overlay = document.getElementById('inspectorDrawer');
  if (overlay) {
    overlay.hidden = true;
    document.body.style.overflow = '';
  }
  state.activeStartupId = null;
  document.querySelectorAll('.startup-tile').forEach((el) => el.classList.remove('is-selected'));
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
  document.getElementById('drawerSubtitle').textContent = `${item.sector} · ${item.hqCity}, ${item.country} · ${item.employeeCount} employees`;

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
        ? `Warm intro path via ${item.linkedinNetwork.bridgePerson}.`
        : item.coInvestorPath?.summary || 'Direct founder outreach recommended.';
      roleCallout.textContent = `Partner triage: ${item.raisingSoon ? 'Inside active next-round timing window.' : 'Out-of-cycle thesis match.'} ${bridgeText}`;
    } else {
      roleCallout.textContent = `Analyst verification note: Suitability ${item.suitabilityScore}/100 backed by ${item.roundHistory.length} Cala round record(s) and ${item.reasons.length} cited signal(s).`;
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
        <span class="fact-label">Round date</span>
        <span class="fact-val">${esc(item.lastRoundDate || 'Undisclosed')}</span>
      </div>
      <div class="fact-cell">
        <span class="fact-label">Next target stage</span>
        <span class="fact-val">${esc(item.likelyNextStage)} ${item.raisingSoon ? '(Likely window)' : ''}</span>
      </div>
    `;
  }

  // Score breakdown bars (Sector, Stage, Co-investor, Geography, Round size)
  const sb = item.scoreBreakdown;
  const rows = [
    { label: 'Sector fit', earned: sb.sector.earned, max: sb.sector.max },
    { label: 'Stage timing', earned: sb.stage.earned, max: sb.stage.max },
    { label: 'Co-investor overlap', earned: sb.coInvestor.earned, max: sb.coInvestor.max },
    { label: 'Geography match', earned: sb.geography.earned, max: sb.geography.max },
    { label: 'Round size fit', earned: sb.roundSize.earned, max: sb.roundSize.max }
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

  // Sourced reasons with Cala citations
  const reasonsEl = document.getElementById('drawerReasonsList');
  if (reasonsEl) {
    reasonsEl.innerHTML = (item.reasons || [])
      .map((r) => {
        const cites = (r.sources || [])
          .map(
            (src, idx) =>
              `<a class="source-cite" href="${esc(src.url)}" target="_blank" rel="noopener noreferrer" title="${esc(src.title)} (${esc(src.publisher)})">[${idx + 1}]</a>`
          )
          .join('');
        return `<li>${esc(r.text)} ${cites}</li>`;
      })
      .join('');
  }

  // Stage 2 preliminary data (similar portfolio & round history)
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
            <div class="mini-card">
              <strong>${esc(s.name)}</strong>
              <span>${esc(s.sector)} · ${esc(s.country)}</span>
            </div>
          `
          )
          .join('')
      : '<p class="card-note">No close sector portfolio overlap recorded for this benchmark.</p>';
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
            <th>Lead &amp; investors</th>
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

  // Verify the drawer is still showing this company
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
      people.push({ name: item.linkedinNetwork.targetLeader, role: 'Indexed LinkedIn leadership tie' });
    }

    peopleEl.innerHTML = people.length
      ? people
          .map(
            (p) => `
            <div class="mini-card">
              <strong>${esc(p.name)}</strong>
              <span>${esc(p.role)}</span>
            </div>
          `
          )
          .join('')
      : '<div class="mini-card"><strong>Not found in Cala</strong><span>No public officer feed verified yet.</span></div>';
  }

  const gapsEl = document.getElementById('drawerGapsList');
  if (gapsEl) {
    gapsEl.innerHTML = (brief.notFoundInCala || [])
      .map(
        (g) => `
        <div class="mini-card">
          <strong>${esc(g.field)}</strong>
          <span class="gap-status">${esc(g.status)}</span>
          <span> · ${esc(g.reason)}</span>
        </div>
      `
      )
      .join('');
  }
}

/* ---------------- NETWORK & RELATIONSHIPS TAB ---------------- */

function renderDrawerNetworkPane(item) {
  const sourceInputs = document.querySelectorAll('input[name="drawerNetworkSource"]');
  sourceInputs.forEach((inp) => {
    inp.checked = inp.value === state.activeNetworkSource;
  });

  const summaryEl = document.getElementById('networkViewSummary');
  const svgWrap = document.getElementById('networkSvgWrap');
  const peersEl = document.getElementById('peerStartupsList');

  const isLinkedin = state.activeNetworkSource === 'linkedin';
  const netData = isLinkedin ? item.linkedinNetwork : item.graph;

  if (summaryEl) {
    if (isLinkedin && item.linkedinNetwork) {
      summaryEl.innerHTML = `
        <strong>${esc(item.linkedinNetwork.sourceLabel)}</strong><br />
        <span>${esc(item.linkedinNetwork.summary)}</span>
      `;
    } else {
      const pathText = item.coInvestorPath?.summary || 'Direct round participation and co-investor graph from Cala.';
      summaryEl.innerHTML = `
        <strong>Cala verified co-investment &amp; round graph</strong><br />
        <span>${esc(pathText)}</span>
      `;
    }
  }

  if (svgWrap && netData) {
    svgWrap.innerHTML = buildNetworkGraphSvg(netData, item.id);
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
                <span class="peer-btn-desc">${esc(p.sector)} · ${esc(p.country)} · ${esc(p.bridgeLabel)}</span>
              </span>
            </button>
          `
          )
          .join('')
      : '<p class="card-note">No connected peer startups indexed in this view.</p>';

    peersEl.querySelectorAll('[data-peer-id]').forEach((btn) => {
      btn.addEventListener('click', () => {
        openInspectorDrawer(btn.getAttribute('data-peer-id'), 'network');
      });
    });
  }
}

function buildNetworkGraphSvg(graphObj, selectedStartupId) {
  const nodes = (graphObj.nodes || []).slice(0, 10);
  const links = graphObj.links || [];
  const width = 640;
  const height = 270;

  // Assign columns based on node role for a crisp layered diagram
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

  const positions = new Map();
  const columnLayout = [
    { list: cols.fund, x: 90 },
    { list: cols.bridge, x: 255 },
    { list: cols.target, x: 425 },
    { list: cols.peer, x: 560 }
  ];

  for (const col of columnLayout) {
    const count = col.list.length;
    if (!count) continue;
    const step = height / (count + 1);
    col.list.forEach((node, idx) => {
      positions.set(node.id, {
        x: col.x,
        y: Math.round(step * (idx + 1)),
        node
      });
    });
  }

  const colorForType = (type, id) => {
    if (type === 'target_fund') return '#0D5C46';
    if (id === selectedStartupId || type === 'target_startup') return '#0F1715';
    if (type === 'co_investor') return '#9A3412';
    return '#5C6B67';
  };

  const edgeSvg = links
    .map((link) => {
      const a = positions.get(link.source);
      const b = positions.get(link.target);
      if (!a || !b) return '';
      const mx = Math.round((a.x + b.x) / 2);
      const my = Math.round((a.y + b.y) / 2) - 4;
      return `
        <line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="#C6CEC5" stroke-width="1.5" />
        <text x="${mx}" y="${my}" text-anchor="middle" font-family="Plus Jakarta Sans, sans-serif" font-size="10.5" fill="#4A5552">${esc(link.label || '')}</text>
      `;
    })
    .join('');

  const nodeSvg = [...positions.values()]
    .map(({ x, y, node }) => {
      const fill = colorForType(node.type, node.id);
      const shortLabel = node.label.length > 20 ? `${node.label.slice(0, 18)}..` : node.label;
      return `
        <g>
          <circle cx="${x}" cy="${y}" r="8" fill="${fill}" stroke="#FFFFFF" stroke-width="2" />
          <text x="${x}" y="${y + 20}" text-anchor="middle" font-family="Plus Jakarta Sans, sans-serif" font-size="11.5" font-weight="600" fill="#0F1715">${esc(shortLabel)}</text>
        </g>
      `;
    })
    .join('');

  return `
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Startup relationship network graph">
      ${edgeSvg}
      ${nodeSvg}
    </svg>
  `;
}

/* ---------------- THESIS & BACKTEST TAB ---------------- */

function renderThesisTab() {
  if (!state.analysis) return;
  const { thesis, backtest } = state.analysis;

  document.getElementById('thesisTitleHeading').textContent = `Revealed thesis: ${thesis.fundName}`;
  document.getElementById('thesisHeaderSummary').textContent = `${thesis.driftSummary || ''} ${thesis.weakProfileNote || ''}`.trim();

  // Sync Cala verify input default
  const verifyInput = document.getElementById('calaVerifyInput');
  if (verifyInput && !verifyInput.value && thesis.mode === 'fund') {
    verifyInput.value = thesis.fundName;
  }

  const stripEl = document.getElementById('thesisMetricsStrip');
  if (stripEl) {
    const topSector = thesis.sectorMix?.[0]?.label || 'Mixed';
    const topCountry = thesis.geographyMix?.[0]?.label || 'Europe';
    const metrics = [
      { label: 'Deals analyzed', value: thesis.dealsAnalyzedCount },
      { label: 'Portfolio companies', value: thesis.portfolioCount },
      { label: 'Lead rate', value: `${thesis.leadRatePct}%` },
      { label: 'Follow-on rate', value: `${thesis.followOnRatePct}%` },
      { label: 'Median round size', value: formatEur(thesis.medianRoundSizeEurM) },
      { label: 'Primary cluster', value: `${topSector} · ${topCountry}` }
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
      renderBars('Sector concentration', thesis.sectorMix) +
      renderBars('Stage distribution', thesis.stageMix) +
      renderBars('Geography footprint', thesis.geographyMix);
  }

  const statedEl = document.getElementById('statedVsRevealedPanel');
  if (statedEl) {
    statedEl.innerHTML = `
      <p><strong>Stated positioning:</strong> ${esc(thesis.statedThesis)}</p>
      <ul class="stated-diff-list">
        ${(thesis.statedVsRevealed || []).map((line) => `<li>${esc(line)}</li>`).join('')}
      </ul>
    `;
  }

  const btPanel = document.getElementById('backtestPanel');
  const btNote = document.getElementById('backtestSummaryNote');
  if (btPanel && btNote) {
    if (!backtest) {
      btNote.textContent = 'Point-in-time backtest requires an indexed fund with historical rounds.';
      btPanel.innerHTML = '<p class="card-note">Switch Configuration to an indexed venture fund to evaluate 12-month out-of-time precision.</p>';
    } else {
      btNote.textContent = backtest.summaryText;
      btPanel.innerHTML = `
        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>Hidden subsequent deal</th>
                <th>Stage</th>
                <th>Actual deal date</th>
                <th>Predicted rank</th>
                <th>Co-investor bridge clue</th>
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
    el.textContent = 'Local snapshot active';
    return;
  }
  el.textContent = `Cala budget: ${b.remainingCalls} / ${b.maxLiveCalls} live calls remaining (${b.cachedResponses || 0} cached)`;
}

function formatCalaLiveHtml(res) {
  const live = res.liveSummary;
  if (!live) {
    return `<p>No matching live Cala entity found for "${esc(res.queryName)}".</p>`;
  }

  const cacheStatus = res.fromCache
    ? 'Served from local Cala disk cache (0 live credits consumed)'
    : 'Fetched live from Cala API and persisted to local disk cache';

  const investedList = (live.investedIn || [])
    .slice(0, 8)
    .map((item) => esc(item.name || item.title || item.id))
    .join(', ');

  const roundsRows = (live.fundingRounds || live.raisedRounds || [])
    .slice(0, 6)
    .map(
      (r) =>
        `<li><strong>${esc(r.name || r.roundType || 'Funding round')}</strong>${r.isLead ? ' (Lead)' : ''}${r.amount ? ` · ${esc(r.amount)}` : ''}</li>`
    )
    .join('');

  return `
    <p><strong>${esc(live.name)}</strong> (${esc(live.entityType || 'Entity')}) · UUID ${esc(live.id)}</p>
    <p class="disambig-meta">${esc(cacheStatus)}</p>
    ${live.description ? `<p>${esc(live.description)}</p>` : ''}
    ${
      live.investedInCount > 0
        ? `<p><strong>Cala INVESTED_IN (${esc(live.investedInCount)}):</strong> ${investedList}</p>`
        : ''
    }
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
    outputEl.innerHTML = `<p>${esc(err.message || 'Live Cala API call failed.')}</p>`;
    outputEl.hidden = false;
  } finally {
    triggerBtn.disabled = false;
    triggerBtn.textContent = originalLabel;
  }
}

/* ---------------- EVENT BINDING & BOOTSTRAP ---------------- */

function bindEvents() {
  // Primary Masthead Tabs
  document.querySelectorAll('.primary-tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      switchPrimaryTab(btn.getAttribute('data-tab'));
    });
  });

  // Configuration Stepper Buttons
  document.getElementById('stepperBtn1')?.addEventListener('click', () => setConfigStep(1));
  document.getElementById('stepperBtn2')?.addEventListener('click', () => setConfigStep(2));
  document.getElementById('stepperBtn3')?.addEventListener('click', () => setConfigStep(3));

  document.getElementById('step1NextBtn')?.addEventListener('click', () => setConfigStep(2));
  document.getElementById('step2BackBtn')?.addEventListener('click', () => setConfigStep(1));
  document.getElementById('step2NextBtn')?.addEventListener('click', () => setConfigStep(3));
  document.getElementById('step3BackBtn')?.addEventListener('click', () => setConfigStep(2));
  document.getElementById('launchDashboardBtn')?.addEventListener('click', () => runAnalysisAndSwitch(true));

  // Role radios
  document.querySelectorAll('input[name="configRole"]').forEach((radio) => {
    radio.addEventListener('change', (e) => {
      syncRoleSelection(e.target.value);
    });
  });

  // Benchmark inputMode switch
  document.querySelectorAll('input[name="inputMode"]').forEach((radio) => {
    radio.addEventListener('change', (e) => {
      state.inputMode = e.target.value === 'companies' ? 'companies' : 'fund';
      document.getElementById('fundModePanel').hidden = state.inputMode !== 'fund';
      document.getElementById('companiesModePanel').hidden = state.inputMode !== 'companies';
    });
  });

  // Ranking priority radios
  document.querySelectorAll('input[name="rankingMode"]').forEach((radio) => {
    radio.addEventListener('change', (e) => {
      state.rankingMode = e.target.value;
    });
  });

  // Network priority radios (Step 3)
  document.querySelectorAll('input[name="networkPriority"]').forEach((radio) => {
    radio.addEventListener('change', (e) => {
      syncNetworkPrioritySelection(e.target.value);
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
          resultsBox.innerHTML = '<div class="disambig-option">No matching indexed funds found.</div>';
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

  // Companies checklist filter
  document.getElementById('companyBenchmarkSearch')?.addEventListener('input', (e) => {
    renderCompanyChecklist(e.target.value);
  });

  // Centered AI Search Form
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
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && state.activeStartupId) {
      closeInspectorDrawer();
    }
  });

  document.getElementById('drawerTabScore')?.addEventListener('click', () => switchDrawerTab('score'));
  document.getElementById('drawerTabNetwork')?.addEventListener('click', () => switchDrawerTab('network'));

  document.getElementById('expandAllBriefBtn')?.addEventListener('click', () => {
    const s2 = document.getElementById('stage2Disclosure');
    const s3 = document.getElementById('stage3Disclosure');
    const willOpen = !(s2.open && s3.open);
    s2.open = willOpen;
    s3.open = willOpen;
    document.getElementById('expandAllBriefBtn').textContent = willOpen ? 'Collapse brief sections' : 'Expand full brief';
  });

  document.querySelectorAll('input[name="drawerNetworkSource"]').forEach((radio) => {
    radio.addEventListener('change', (e) => {
      state.activeNetworkSource = e.target.value === 'cala' ? 'cala' : 'linkedin';
      const item = state.allKnownItems.get(state.activeStartupId);
      if (item) renderDrawerNetworkPane(item);
    });
  });

  // Drawer Export & Live Cala Verify
  document.getElementById('drawerExportMdBtn')?.addEventListener('click', async () => {
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

    // Precompute baseline analysis silently so users can jump straight to Tab 2 or 3 anytime
    await runAnalysisAndSwitch(false);
    // Keep Configuration tab active on first entry as requested
    switchPrimaryTab('config');
  } catch (err) {
    document.getElementById('telemetryLine').textContent = `Bootstrap error: ${err.message}`;
  }
}

bootstrap();
