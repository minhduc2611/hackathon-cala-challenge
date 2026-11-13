const state = {
  bootstrap: null,
  personaView: 'analyst',
  inputMode: 'fund',
  selectedFundId: 'lifeline-ventures',
  selectedCompanyIds: ['oura', 'silo-ai', 'flow-computing'],
  rankingMode: 'balanced',
  statedOverride: '',
  seenCompanyNames: [],
  analysis: null,
  displayedShortlist: [],
  expandedEvidenceIds: new Set(),
  savedIds: new Set(),
  dismissedIds: new Set(),
  activeBrief: null
};

const el = {
  telemetryLine: document.getElementById('telemetryLine'),
  fundSelect: document.getElementById('fundSelect'),
  fundSearchInput: document.getElementById('fundSearchInput'),
  disambiguationBox: document.getElementById('disambiguationBox'),
  seenCsvInput: document.getElementById('seenCsvInput'),
  runAnalysisBtn: document.getElementById('runAnalysisBtn'),
  fundInputPanel: document.getElementById('fundInputPanel'),
  companiesInputPanel: document.getElementById('companiesInputPanel'),
  companyChecklist: document.getElementById('companyChecklist'),
  selectedCompanyCount: document.getElementById('selectedCompanyCount'),
  runProxyBtn: document.getElementById('runProxyBtn'),
  weakProfileNotice: document.getElementById('weakProfileNotice'),
  weakProfileText: document.getElementById('weakProfileText'),
  switchToProxyBtn: document.getElementById('switchToProxyBtn'),
  errorBanner: document.getElementById('errorBanner'),
  thesisTitle: document.getElementById('thesisTitle'),
  thesisMetricsStrip: document.getElementById('thesisMetricsStrip'),
  driftBanner: document.getElementById('driftBanner'),
  stageDistCol: document.getElementById('stageDistCol'),
  sectorDistCol: document.getElementById('sectorDistCol'),
  geoAndCoInvestorCol: document.getElementById('geoAndCoInvestorCol'),
  statedThesisCopy: document.getElementById('statedThesisCopy'),
  statedOverrideInput: document.getElementById('statedOverrideInput'),
  compareStatedBtn: document.getElementById('compareStatedBtn'),
  statedDivergenceList: document.getElementById('statedDivergenceList'),
  backtestSummaryBox: document.getElementById('backtestSummaryBox'),
  backtestBody: document.getElementById('backtestBody'),
  shortlistHeading: document.getElementById('shortlistHeading'),
  shortlistMeta: document.getElementById('shortlistMeta'),
  rankingModeSelect: document.getElementById('rankingModeSelect'),
  regionFilterSelect: document.getElementById('regionFilterSelect'),
  excludeSectorSelect: document.getElementById('excludeSectorSelect'),
  raisingSoonCheckbox: document.getElementById('raisingSoonCheckbox'),
  refineChatForm: document.getElementById('refineChatForm'),
  refineQueryInput: document.getElementById('refineQueryInput'),
  resetFiltersBtn: document.getElementById('resetFiltersBtn'),
  refineExplanation: document.getElementById('refineExplanation'),
  shortlistContainer: document.getElementById('shortlistContainer'),
  briefModal: document.getElementById('briefModal'),
  briefModalTitle: document.getElementById('briefModalTitle'),
  briefModalSub: document.getElementById('briefModalSub'),
  briefModalBody: document.getElementById('briefModalBody'),
  exportMemoBtn: document.getElementById('exportMemoBtn'),
  exportCsvBtn: document.getElementById('exportCsvBtn'),
  closeBriefBtn: document.getElementById('closeBriefBtn')
};

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function showError(msg) {
  if (!msg) {
    el.errorBanner.hidden = true;
    el.errorBanner.textContent = '';
    return;
  }
  el.errorBanner.textContent = msg;
  el.errorBanner.hidden = false;
}

async function apiGet(url) {
  const res = await fetch(url);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

async function apiPost(url, payload) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

function parseSeenInput() {
  return el.seenCsvInput.value
    .split(/[,\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

async function runAnalysis() {
  showError('');
  try {
    state.seenCompanyNames = parseSeenInput();
    const payload = {
      mode: state.inputMode,
      fundId: state.selectedFundId,
      companyIds: state.selectedCompanyIds,
      rankingMode: state.rankingMode,
      statedThesisOverride: state.statedOverride,
      seenCompanyNames: state.seenCompanyNames
    };

    const result = await apiPost('/api/analyze', payload);
    state.analysis = result;
    state.displayedShortlist = result.shortlist;
    state.expandedEvidenceIds.clear();
    el.refineExplanation.hidden = true;
    renderAll();
  } catch (err) {
    showError(err.message);
  }
}

async function applyRefinement(queryText = '') {
  if (!state.analysis) return;
  showError('');
  try {
    const payload = {
      mode: state.inputMode,
      fundId: state.selectedFundId,
      companyIds: state.selectedCompanyIds,
      rankingMode: state.rankingMode,
      seenCompanyNames: state.seenCompanyNames,
      region: el.regionFilterSelect.value,
      excludeSector: el.excludeSectorSelect.value,
      raisingSoonOnly: el.raisingSoonCheckbox.checked,
      queryText
    };
    const refined = await apiPost('/api/refine', payload);
    state.displayedShortlist = refined.shortlist;

    // Sync UI selectors if NL query updated them
    if (refined.appliedFilters) {
      el.regionFilterSelect.value = refined.appliedFilters.region || 'all';
      el.excludeSectorSelect.value = refined.appliedFilters.excludeSector || 'none';
      el.raisingSoonCheckbox.checked = Boolean(refined.appliedFilters.raisingSoonOnly);
    }

    if (refined.explanation) {
      el.refineExplanation.textContent = refined.explanation;
      el.refineExplanation.hidden = false;
    } else if (queryText) {
      el.refineExplanation.textContent = `Showing ${refined.totalMatches} matching startups for "${queryText}".`;
      el.refineExplanation.hidden = false;
    } else {
      el.refineExplanation.hidden = true;
    }

    renderShortlist();
  } catch (err) {
    showError(err.message);
  }
}

function renderAll() {
  if (!state.analysis) return;
  const { thesis, backtest, calaTelemetry } = state.analysis;

  el.telemetryLine.textContent =
    `${calaTelemetry.entitiesIndexed} Cala entities indexed, ${calaTelemetry.roundsInspected} funding rounds, ${calaTelemetry.verifiedCitationsInShortlist} cited shortlist sources (${calaTelemetry.pipelineMode})`;

  if (thesis.weakProfile) {
    el.weakProfileText.textContent = thesis.weakProfileNote;
    el.weakProfileNotice.hidden = false;
  } else {
    el.weakProfileNotice.hidden = true;
  }

  renderThesis(thesis, backtest);
  renderShortlist();
}

function renderDistributionBars(title, items, limit = 5) {
  if (!items.length) {
    return `<h3>${escapeHtml(title)}</h3><p class="meta-secondary">Not found in Cala</p>`;
  }
  const rows = items
    .slice(0, limit)
    .map(
      (item) => `
      <div class="bar-row tabular">
        <span>${escapeHtml(item.label)} (${item.count})</span>
        <span>${item.sharePct}%</span>
        <div class="bar-track"><div class="bar-fill" style="width:${Math.min(100, item.sharePct)}%"></div></div>
      </div>`
    )
    .join('');
  return `<h3>${escapeHtml(title)}</h3>${rows}`;
}

function renderThesis(thesis, backtest) {
  el.thesisTitle.textContent = `Revealed thesis: ${thesis.fundName}`;

  const roundSizeDisplay = thesis.medianRoundSizeEurM !== null ? `EUR ${thesis.medianRoundSizeEurM}M` : 'Not found';
  el.thesisMetricsStrip.innerHTML = `
    <div class="metric-cell">
      <div class="metric-label">Deals analyzed</div>
      <div class="metric-value">${thesis.dealsAnalyzedCount}</div>
      <div class="metric-note">${thesis.portfolioCount} portfolio companies</div>
    </div>
    <div class="metric-cell">
      <div class="metric-label">Median round size joined</div>
      <div class="metric-value">${escapeHtml(roundSizeDisplay)}</div>
      <div class="metric-note">Cheque size not public</div>
    </div>
    <div class="metric-cell">
      <div class="metric-label">Lead vs. follow</div>
      <div class="metric-value">${thesis.leadRatePct}% lead</div>
      <div class="metric-note">${thesis.followOnRatePct}% follow-on rate</div>
    </div>
    <div class="metric-cell">
      <div class="metric-label">Investment pace</div>
      <div class="metric-value">${thesis.pacePerYear}/yr</div>
      <div class="metric-note">Last deal: ${escapeHtml(thesis.lastDealDate || 'Not found')}</div>
    </div>
    <div class="metric-cell">
      <div class="metric-label">Top co-investor</div>
      <div class="metric-value">${escapeHtml(thesis.topCoInvestors[0]?.name || 'None indexed')}</div>
      <div class="metric-note">${thesis.topCoInvestors[0] ? `${thesis.topCoInvestors[0].sharedRounds} shared rounds` : 'Single-fund history'}</div>
    </div>
  `;

  el.driftBanner.innerHTML = `<strong>Thesis drift (last 3 years weighted 2x):</strong> ${escapeHtml(thesis.driftSummary)}`;

  el.stageDistCol.innerHTML = renderDistributionBars('Stage mix', thesis.stageMix);
  el.sectorDistCol.innerHTML = renderDistributionBars('Sector focus', thesis.sectorMix);

  const coInvList = thesis.topCoInvestors
    .slice(0, 4)
    .map(
      (ci) =>
        `<div class="bar-row tabular"><span>${escapeHtml(ci.name)}</span><span>${ci.sharedRounds}x</span></div>`
    )
    .join('');

  el.geoAndCoInvestorCol.innerHTML = `
    ${renderDistributionBars('Geography', thesis.geographyMix, 3)}
    <h3 style="margin-top:1rem;">Frequent co-investors</h3>
    ${coInvList || '<p class="meta-secondary">No shared co-investors found in Cala</p>'}
  `;

  // Tab 2: Stated vs. Revealed
  el.statedThesisCopy.textContent = thesis.statedThesis;
  el.statedDivergenceList.innerHTML = thesis.statedVsRevealed
    .map((item) => `<li>${escapeHtml(item)}</li>`)
    .join('');

  // Tab 3: Backtest
  if (!backtest) {
    el.backtestSummaryBox.textContent =
      'Point-in-time backtesting applies when analysing a fund with historical deals before the 12-month cutoff.';
    el.backtestBody.innerHTML = '';
  } else {
    el.backtestSummaryBox.innerHTML = `<strong>Zero-leakage backtest (${escapeHtml(backtest.cutoffDate)} cutoff):</strong> ${escapeHtml(backtest.summaryText)}`;
    if (!backtest.hiddenDeals.length) {
      el.backtestBody.innerHTML =
        '<tr><td colspan="5">No post-cutoff portfolio deals with prior round history found for this fund in Cala.</td></tr>';
    } else {
      el.backtestBody.innerHTML = backtest.hiddenDeals
        .map(
          (hd) => `
          <tr>
            <td><strong>${escapeHtml(hd.name)}</strong></td>
            <td>${escapeHtml(hd.actualRoundType)} (${escapeHtml(hd.actualDate)})</td>
            <td><strong>#${hd.predictedRank ?? 'Not ranked'}</strong> of ${backtest.candidatePoolAtCutoff}</td>
            <td>${hd.predictedScore ?? 'N/A'}/100</td>
            <td>${escapeHtml(hd.coInvestorHint)}</td>
          </tr>`
        )
        .join('');
    }
  }
}

function renderRelationshipSvg(graph) {
  const width = 620;
  const height = 270;
  const fundNode = graph.nodes.find((n) => n.type === 'target_fund');
  const startupNode = graph.nodes.find((n) => n.type === 'target_startup');
  const middleNodes = graph.nodes.filter((n) => n.type !== 'target_fund' && n.type !== 'target_startup').slice(0, 7);

  const positions = new Map();
  if (fundNode) positions.set(fundNode.id, { x: 86, y: height / 2, node: fundNode });
  if (startupNode) positions.set(startupNode.id, { x: width - 96, y: height / 2, node: startupNode });

  const stepY = middleNodes.length > 1 ? (height - 70) / (middleNodes.length - 1) : 0;
  middleNodes.forEach((node, idx) => {
    const xOffset = node.type === 'portfolio' ? 235 : 355;
    const y = middleNodes.length === 1 ? height / 2 : 35 + idx * stepY;
    positions.set(node.id, { x: xOffset, y, node });
  });

  const edgesSvg = graph.links
    .filter((l) => positions.has(l.source) && positions.has(l.target))
    .map((l) => {
      const a = positions.get(l.source);
      const b = positions.get(l.target);
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2 - 4;
      const isStrong = l.label.includes('led') || l.label.includes('shared');
      return `
        <g>
          <line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}"
            stroke="${isStrong ? '#0D5C46' : '#9AA49E'}"
            stroke-width="${isStrong ? '1.75' : '1.1'}" />
          <text x="${mx}" y="${my}" text-anchor="middle" font-size="10.5" fill="#4A5552" font-family="Plus Jakarta Sans, sans-serif">${escapeHtml(l.label)}</text>
        </g>`;
    })
    .join('');

  const nodesSvg = [...positions.values()]
    .map(({ x, y, node }) => {
      const fill =
        node.type === 'target_fund'
          ? '#0F1715'
          : node.type === 'target_startup'
            ? '#0D5C46'
            : node.type === 'portfolio'
              ? '#ECEEE9'
              : '#FFFFFF';
      const stroke = node.type === 'target_startup' || node.type === 'target_fund' ? fill : '#0F1715';
      const textFill = node.type === 'target_fund' || node.type === 'target_startup' ? '#FFFFFF' : '#0F1715';
      const shortLabel = node.label.length > 18 ? `${node.label.slice(0, 16)}...` : node.label;
      return `
        <g>
          <rect x="${x - 74}" y="${y - 16}" width="148" height="32" rx="3" fill="${fill}" stroke="${stroke}" stroke-width="1.2" />
          <text x="${x}" y="${y + 4}" text-anchor="middle" font-size="11.5" font-weight="600" fill="${textFill}" font-family="Plus Jakarta Sans, sans-serif">${escapeHtml(shortLabel)}</text>
        </g>`;
    })
    .join('');

  return `
    <div class="graph-box">
      <div class="field-label" style="margin-bottom:0.375rem;">Co-investor &amp; round connection map (${graph.nodeCount} of ${graph.cappedAt} max nodes)</div>
      <svg class="graph-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Investor and startup relationship map">
        ${edgesSvg}
        ${nodesSvg}
      </svg>
    </div>
  `;
}

function renderShortlist() {
  const items = state.displayedShortlist || [];
  const totalPool = state.analysis?.totalCandidatesEvaluated || 0;
  el.shortlistMeta.textContent = `Showing ${items.length} of ${totalPool} evaluated European candidates`;

  if (!items.length) {
    el.shortlistContainer.innerHTML =
      '<p class="body-prose" style="padding:1rem 0;">No startups match your current refinement filters. Click Reset to view the full ranked shortlist.</p>';
    return;
  }

  const isPartner = state.personaView === 'partner';

  el.shortlistContainer.innerHTML = items
    .map((item, idx) => {
      const isExpanded = state.expandedEvidenceIds.has(item.id);
      const isSaved = state.savedIds.has(item.id);
      const isDismissed = state.dismissedIds.has(item.id);
      const visibleReasons = isPartner ? item.reasons.slice(0, 1) : item.reasons.slice(0, 2);

      const reasonsHtml = visibleReasons
        .map((r) => {
          const srcLinks = r.sources
            .slice(0, 2)
            .map(
              (s) =>
                `<button type="button" class="quiet-action source-ref" data-source-title="${escapeHtml(s.title)}" data-source-meta="${escapeHtml(s.publisher)} (${escapeHtml(s.date)})" data-source-snippet="${escapeHtml(s.snippet)}">[${escapeHtml(s.publisher)}]</button>`
            )
            .join('');
          return `<div class="reason-line">${escapeHtml(r.text)} ${srcLinks}</div>`;
        })
        .join('');

      const evidenceHtml = isExpanded
        ? `
        <div class="evidence-drawer">
          <div class="score-breakdown-list">
            <div class="breakdown-item">Sector: <span class="breakdown-val">${item.scoreBreakdown.sector.earned}/${item.scoreBreakdown.sector.max}</span></div>
            <div class="breakdown-item">Stage: <span class="breakdown-val">${item.scoreBreakdown.stage.earned}/${item.scoreBreakdown.stage.max}</span></div>
            <div class="breakdown-item">Co-investor: <span class="breakdown-val">${item.scoreBreakdown.coInvestor.earned}/${item.scoreBreakdown.coInvestor.max}</span></div>
            <div class="breakdown-item">Geography: <span class="breakdown-val">${item.scoreBreakdown.geography.earned}/${item.scoreBreakdown.geography.max}</span></div>
            <div class="breakdown-item">Round size: <span class="breakdown-val">${item.scoreBreakdown.roundSize.earned}/${item.scoreBreakdown.roundSize.max}</span></div>
          </div>

          <div class="intro-box">
            <div>
              <strong>Warm intro path:</strong>
              ${escapeHtml(item.coInvestorPath ? item.coInvestorPath.summary : 'No shared institutional co-investor path in Cala (direct founder outreach or angel syndicate).')}
            </div>
            ${
              item.coInvestorPath
                ? `<button type="button" class="secondary-action copy-intro-btn" data-intro="${escapeHtml(item.coInvestorPath.summary)}">Copy intro path</button>`
                : ''
            }
          </div>

          <div class="evidence-grid">
            <div>
              <h3>Similar past portfolio deals</h3>
              <ul class="clean-list">
                ${
                  item.similarPortfolio.length
                    ? item.similarPortfolio
                        .map((p) => `<li><strong>${escapeHtml(p.name)}</strong> (${escapeHtml(p.sector)}, ${escapeHtml(p.country)})</li>`)
                        .join('')
                    : '<li>No close historical portfolio analog found</li>'
                }
              </ul>
              <h3 style="margin-top:1rem;">Funding round history</h3>
              <table class="data-table">
                <thead>
                  <tr><th>Date</th><th>Round</th><th>Amount</th><th>Lead &amp; investors</th></tr>
                </thead>
                <tbody>
                  ${item.roundHistory
                    .map(
                      (r) => `
                    <tr>
                      <td>${escapeHtml(r.date)}</td>
                      <td>${escapeHtml(r.type)}</td>
                      <td>EUR ${r.amountEurM}M</td>
                      <td>Lead: ${escapeHtml(r.leadInvestorName)} (${escapeHtml(r.investorNames.join(', '))})</td>
                    </tr>`
                    )
                    .join('')}
                </tbody>
              </table>
            </div>
            <div>
              ${renderRelationshipSvg(item.graph)}
            </div>
          </div>
        </div>`
        : '';

      return `
      <article class="startup-row ${isDismissed ? 'is-dismissed' : ''}" data-startup-id="${escapeHtml(item.id)}">
        <div class="row-5sec">
          <div class="rank-num">${idx + 1}</div>
          <div>
            <div class="startup-name-line">
              <span class="startup-name">${escapeHtml(item.name)}</span>
              ${isSaved ? '<span class="saved-note">Saved</span>' : ''}
              ${item.directCompetitorOf ? `<span class="competitor-note">Direct competitor of ${escapeHtml(item.directCompetitorOf)}</span>` : ''}
            </div>
            <p class="startup-oneliner">${escapeHtml(item.oneLiner)}</p>
          </div>
          <div class="meta-col">
            <div>${escapeHtml(item.sector)} · ${escapeHtml(item.stage)}</div>
            <div class="meta-secondary">${escapeHtml(item.hqCity)}, ${escapeHtml(item.country)}</div>
            ${item.untappedSignal ? '<div class="meta-secondary">Angel-only round (untapped)</div>' : ''}
          </div>
          <div class="meta-col">
            <div>Last round: EUR ${item.lastRoundAmountEurM}M (${escapeHtml(item.lastRoundDate.slice(0, 7))})</div>
            ${
              item.raisingSoon
                ? `<div class="raising-text">Likely raising ${escapeHtml(item.likelyNextStage)} (${item.monthsSinceLastRound}m ago)</div>`
                : `<div class="meta-secondary">${item.monthsSinceLastRound} months since last round</div>`
            }
            ${
              item.coInvestorPath
                ? `<div class="intro-text">Intro via ${escapeHtml(item.coInvestorPath.coInvestorName)} (${item.coInvestorPath.sharedCount}x)</div>`
                : ''
            }
          </div>
          <div class="score-cell">
            <div class="score-num">${item.suitabilityScore}</div>
            <div class="score-sub">of 100 fit</div>
          </div>
          <div class="row-actions">
            <button type="button" class="secondary-action open-brief-btn" data-id="${escapeHtml(item.id)}">10-min brief</button>
            <button type="button" class="quiet-action toggle-evidence-btn" data-id="${escapeHtml(item.id)}">
              ${isExpanded ? 'Hide 1-min evidence' : '1-min evidence'}
            </button>
            <div>
              <button type="button" class="quiet-action save-btn" data-id="${escapeHtml(item.id)}">${isSaved ? 'Unsave' : 'Save'}</button>
              <button type="button" class="quiet-action dismiss-btn" data-id="${escapeHtml(item.id)}">${isDismissed ? 'Restore' : 'Dismiss'}</button>
            </div>
          </div>
        </div>
        <div class="reasons-strip">${reasonsHtml}</div>
        <div class="citation-preview" hidden></div>
        ${evidenceHtml}
      </article>`;
    })
    .join('');
}

async function openStartupBrief(startupId) {
  try {
    const fundParam = state.inputMode === 'fund' ? `&fundId=${encodeURIComponent(state.selectedFundId)}` : '';
    const brief = await apiGet(`/api/brief?startupId=${encodeURIComponent(startupId)}${fundParam}`);
    state.activeBrief = brief;
    el.briefModalTitle.textContent = `${brief.name}: 10-minute Sourced Brief`;
    el.briefModalSub.textContent = `${brief.hqCity}, ${brief.country} · ${brief.sector} · Founded ${brief.foundedYear} · ${brief.employeeCount} employees · Cala ID: ${brief.calaEntityId}`;

    const rolesHtml = brief.peopleCoverage.roles.length
      ? brief.peopleCoverage.roles
          .map(
            (r) =>
              `<li>${escapeHtml(r.name)}: ${escapeHtml(r.role)} (since ${escapeHtml(r.startDate)})${r.source ? ` [${escapeHtml(r.source.publisher)}]` : ''}</li>`
          )
          .join('')
      : `<li>${escapeHtml(brief.peopleCoverage.note)}</li>`;

    el.briefModalBody.innerHTML = `
      <div>
        <h3>Company summary</h3>
        <p class="body-prose">${escapeHtml(brief.description)}</p>
      </div>
      <div>
        <h3>Verified Cala funding history</h3>
        <div class="table-scroll">
          <table class="data-table">
            <thead>
              <tr><th>Date</th><th>Round</th><th>Amount</th><th>Valuation</th><th>Lead &amp; investors</th><th>Cala sources</th></tr>
            </thead>
            <tbody>
              ${brief.rounds
                .map(
                  (r) => `
                <tr>
                  <td>${escapeHtml(r.date)}</td>
                  <td>${escapeHtml(r.type)}</td>
                  <td>EUR ${r.amountEurM}M</td>
                  <td>${typeof r.valuationEurM === 'number' ? `EUR ${r.valuationEurM}M` : escapeHtml(r.valuationEurM)}</td>
                  <td>Lead: ${escapeHtml(r.leadInvestorName)} (${escapeHtml(r.investorNames.join(', '))})</td>
                  <td>${r.sources.map((s) => `${escapeHtml(s.publisher)} (${escapeHtml(s.date)})`).join('; ')}</td>
                </tr>`
                )
                .join('')}
            </tbody>
          </table>
        </div>
      </div>
      <div>
        <h3>Team &amp; executive coverage</h3>
        <ul class="clean-list">${rolesHtml}</ul>
      </div>
      <div>
        <h3>Explicit coverage gaps (not guessed by AI)</h3>
        <div class="table-scroll">
          <table class="data-table gap-table">
            <thead>
              <tr><th>Metric</th><th>Status</th><th>Reason</th></tr>
            </thead>
            <tbody>
              ${brief.notFoundInCala
                .map(
                  (g) => `
                <tr>
                  <td>${escapeHtml(g.field)}</td>
                  <td class="gap-status">${escapeHtml(g.status)}</td>
                  <td>${escapeHtml(g.reason)}</td>
                </tr>`
                )
                .join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;

    el.briefModal.hidden = false;
  } catch (err) {
    showError(err.message);
  }
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

function bindEvents() {
  // Analyst vs Partner mode
  document.querySelectorAll('input[name="personaView"]').forEach((radio) => {
    radio.addEventListener('change', (e) => {
      state.personaView = e.target.value;
      document.body.classList.toggle('partner-mode', state.personaView === 'partner');
      renderShortlist();
    });
  });

  // Fund vs 3 to 5 companies mode
  document.querySelectorAll('input[name="inputMode"]').forEach((radio) => {
    radio.addEventListener('change', (e) => {
      state.inputMode = e.target.value;
      el.fundInputPanel.hidden = state.inputMode !== 'fund';
      el.companiesInputPanel.hidden = state.inputMode !== 'companies';
      if (state.inputMode === 'fund') {
        runAnalysis();
      }
    });
  });

  el.switchToProxyBtn.addEventListener('click', () => {
    const radio = document.querySelector('input[name="inputMode"][value="companies"]');
    if (radio) {
      radio.checked = true;
      radio.dispatchEvent(new Event('change'));
    }
  });

  el.fundSelect.addEventListener('change', (e) => {
    state.selectedFundId = e.target.value;
    runAnalysis();
  });

  el.runAnalysisBtn.addEventListener('click', () => {
    runAnalysis();
  });

  el.runProxyBtn.addEventListener('click', () => {
    if (state.selectedCompanyIds.length < 3 || state.selectedCompanyIds.length > 5) {
      showError('Please select between 3 and 5 companies to build a proxy thesis.');
      return;
    }
    runAnalysis();
  });

  // Live Entity Search with Top-3 Disambiguation (Q16)
  let searchTimer = null;
  el.fundSearchInput.addEventListener('input', () => {
    clearTimeout(searchTimer);
    const q = el.fundSearchInput.value.trim();
    if (!q) {
      el.disambiguationBox.hidden = true;
      return;
    }
    searchTimer = setTimeout(async () => {
      try {
        const res = await apiGet(`/api/search?q=${encodeURIComponent(q)}`);
        if (!res.funds.length) {
          el.disambiguationBox.innerHTML =
            '<div class="disambig-header">No indexed fund matched. Try "3 to 5 admired companies" mode.</div>';
          el.disambiguationBox.hidden = false;
          return;
        }
        const header = res.ambiguousFunds
          ? `Top ${res.funds.length} matching Cala fund entities (select one to confirm):`
          : 'Matched Cala fund entity:';
        el.disambiguationBox.innerHTML = `
          <div class="disambig-header">${escapeHtml(header)}</div>
          ${res.funds
            .map(
              (f) => `
            <button type="button" class="disambig-item" data-fund-id="${escapeHtml(f.id)}">
              <span><strong>${escapeHtml(f.name)}</strong> (${escapeHtml(f.hqCity)}, ${escapeHtml(f.country)})</span>
              <span>${escapeHtml(f.calaEntityId)}</span>
            </button>`
            )
            .join('')}
        `;
        el.disambiguationBox.hidden = false;
      } catch {
        el.disambiguationBox.hidden = true;
      }
    }, 150);
  });

  el.disambiguationBox.addEventListener('click', (e) => {
    const btn = e.target.closest('.disambig-item');
    if (!btn) return;
    const fundId = btn.dataset.fundId;
    state.selectedFundId = fundId;
    el.fundSelect.value = fundId;
    el.fundSearchInput.value = '';
    el.disambiguationBox.hidden = true;
    runAnalysis();
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.search-group')) {
      el.disambiguationBox.hidden = true;
    }
  });

  // Thesis inspection tabs
  document.querySelectorAll('[data-thesis-tab]').forEach((tabBtn) => {
    tabBtn.addEventListener('click', () => {
      const target = tabBtn.dataset.thesisTab;
      document.querySelectorAll('[data-thesis-tab]').forEach((b) => {
        const active = b.dataset.thesisTab === target;
        b.classList.toggle('is-active', active);
        b.setAttribute('aria-selected', String(active));
      });
      document.getElementById('tabRevealed').hidden = target !== 'revealed';
      document.getElementById('tabStated').hidden = target !== 'stated';
      document.getElementById('tabBacktest').hidden = target !== 'backtest';
    });
  });

  el.compareStatedBtn.addEventListener('click', () => {
    state.statedOverride = el.statedOverrideInput.value.trim();
    runAnalysis();
  });

  // Layer-2 Controls
  el.rankingModeSelect.addEventListener('change', (e) => {
    state.rankingMode = e.target.value;
    runAnalysis();
  });

  el.regionFilterSelect.addEventListener('change', () => applyRefinement(el.refineQueryInput.value));
  el.excludeSectorSelect.addEventListener('change', () => applyRefinement(el.refineQueryInput.value));
  el.raisingSoonCheckbox.addEventListener('change', () => applyRefinement(el.refineQueryInput.value));

  el.refineChatForm.addEventListener('submit', (e) => {
    e.preventDefault();
    applyRefinement(el.refineQueryInput.value);
  });

  el.resetFiltersBtn.addEventListener('click', () => {
    el.regionFilterSelect.value = 'all';
    el.excludeSectorSelect.value = 'none';
    el.raisingSoonCheckbox.checked = false;
    el.refineQueryInput.value = '';
    el.refineExplanation.hidden = true;
    state.displayedShortlist = state.analysis?.shortlist || [];
    renderShortlist();
  });

  // Shortlist delegated interactions
  el.shortlistContainer.addEventListener('click', (e) => {
    const evidenceBtn = e.target.closest('.toggle-evidence-btn');
    if (evidenceBtn) {
      const id = evidenceBtn.dataset.id;
      if (state.expandedEvidenceIds.has(id)) state.expandedEvidenceIds.delete(id);
      else state.expandedEvidenceIds.add(id);
      renderShortlist();
      return;
    }

    const briefBtn = e.target.closest('.open-brief-btn');
    if (briefBtn) {
      openStartupBrief(briefBtn.dataset.id);
      return;
    }

    const saveBtn = e.target.closest('.save-btn');
    if (saveBtn) {
      const id = saveBtn.dataset.id;
      if (state.savedIds.has(id)) state.savedIds.delete(id);
      else state.savedIds.add(id);
      renderShortlist();
      return;
    }

    const dismissBtn = e.target.closest('.dismiss-btn');
    if (dismissBtn) {
      const id = dismissBtn.dataset.id;
      if (state.dismissedIds.has(id)) state.dismissedIds.delete(id);
      else state.dismissedIds.add(id);
      renderShortlist();
      return;
    }

    const copyBtn = e.target.closest('.copy-intro-btn');
    if (copyBtn) {
      const text = copyBtn.dataset.intro;
      navigator.clipboard?.writeText(text).catch(() => {});
      copyBtn.textContent = 'Copied intro note';
      setTimeout(() => {
        copyBtn.textContent = 'Copy intro path';
      }, 1500);
      return;
    }

    const srcBtn = e.target.closest('.source-ref');
    if (srcBtn) {
      const row = srcBtn.closest('.startup-row');
      const box = row?.querySelector('.citation-preview');
      if (box) {
        box.innerHTML = `<div class="refine-explanation" style="margin-top:0.5rem;"><strong>${escapeHtml(srcBtn.dataset.sourceTitle)}</strong> (${escapeHtml(srcBtn.dataset.sourceMeta)}): "${escapeHtml(srcBtn.dataset.sourceSnippet)}"</div>`;
        box.hidden = false;
      }
    }
  });

  // Brief modal actions
  el.closeBriefBtn.addEventListener('click', () => {
    el.briefModal.hidden = true;
  });

  el.briefModal.addEventListener('click', (e) => {
    if (e.target === el.briefModal) el.briefModal.hidden = true;
  });

  el.exportMemoBtn.addEventListener('click', () => {
    if (!state.activeBrief) return;
    downloadFile(`${state.activeBrief.id}-brief.md`, state.activeBrief.memoMarkdown, 'text/markdown;charset=utf-8');
  });

  el.exportCsvBtn.addEventListener('click', () => {
    if (!state.activeBrief) return;
    const b = state.activeBrief;
    const header = 'Name,HQ,Country,Sector,Employees,LatestRound,Score\n';
    const latest = b.rounds[b.rounds.length - 1];
    const score = b.matchContext ? b.matchContext.suitabilityScore : '';
    const line = `"${b.name}","${b.hqCity}","${b.country}","${b.sector}",${b.employeeCount},"${latest?.type || ''} (${latest?.date || ''})",${score}\n`;
    downloadFile(`${b.id}-cala.csv`, header + line, 'text/csv;charset=utf-8');
  });
}

async function init() {
  bindEvents();
  try {
    const boot = await apiGet('/api/bootstrap');
    state.bootstrap = boot;

    el.fundSelect.innerHTML = boot.funds
      .map(
        (f) =>
          `<option value="${escapeHtml(f.id)}">${escapeHtml(f.name)} (${escapeHtml(f.hqCity)}, ${escapeHtml(f.country)})</option>`
      )
      .join('');
    el.fundSelect.value = state.selectedFundId;

    el.companyChecklist.innerHTML = boot.companies
      .map((c) => {
        const checked = state.selectedCompanyIds.includes(c.id) ? 'checked' : '';
        return `
          <label class="company-check-item">
            <input type="checkbox" value="${escapeHtml(c.id)}" ${checked} />
            <span><strong>${escapeHtml(c.name)}</strong> (${escapeHtml(c.sector)}, ${escapeHtml(c.country)})</span>
          </label>`;
      })
      .join('');
    el.selectedCompanyCount.textContent = String(state.selectedCompanyIds.length);

    el.companyChecklist.addEventListener('change', (e) => {
      if (e.target.type !== 'checkbox') return;
      const checkedIds = [...el.companyChecklist.querySelectorAll('input:checked')].map((i) => i.value);
      state.selectedCompanyIds = checkedIds;
      el.selectedCompanyCount.textContent = String(checkedIds.length);
    });

    await runAnalysis();
  } catch (err) {
    showError(err.message);
  }
}

init();
