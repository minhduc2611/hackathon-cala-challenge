import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildBridgeMapPayload,
  buildEvidenceFolders,
  buildStartupBrief,
  computeRevealedThesis,
  enforceFactCitations,
  extractHiddenBridges,
  ingestLiveCalaEntities,
  ingestRegistryEntities,
  interpolateHeadcountAtDate,
  MEGA_HUB_DEAL_THRESHOLD,
  refineShortlist,
  runFullAnalysis,
  runPointInTimeBacktest,
  searchEntities,
  scoreAndRankCandidates,
  SLUSH_2026_EVENT_ID
} from '../src/engine.mjs';
import { COMPANIES, SOURCES } from '../src/data.mjs';

test('searchEntities returns top 3 disambiguation for ambiguous fund queries', () => {
  const res = searchEntities('Ventures');
  assert.equal(res.ambiguousFunds, true);
  assert.equal(res.funds.length, 3);

  const exact = searchEntities('Creandum');
  assert.equal(exact.ambiguousFunds, false);
  assert.equal(exact.funds[0].id, 'creandum');
});

test('computeRevealedThesis calculates metrics, drift, and weak-profile threshold', () => {
  const lifeline = computeRevealedThesis({ mode: 'fund', fundId: 'lifeline-ventures' });
  assert.equal(lifeline.weakProfile, false);
  assert.ok(lifeline.dealsAnalyzedCount >= 10);
  assert.ok(lifeline.medianRoundSizeEurM > 0);
  assert.match(lifeline.roundSizeLabel, /Median size of rounds joined/);
  assert.ok(lifeline.driftSummary.length > 15);
  assert.ok(lifeline.statedVsRevealed.length >= 1);

  const weakFund = computeRevealedThesis({ mode: 'fund', fundId: 'nordic-micro-lab' });
  assert.equal(weakFund.weakProfile, true);
  assert.match(weakFund.weakProfileNote, /5-deal reliability floor/);

  const proxy = computeRevealedThesis({
    mode: 'companies',
    companyIds: ['oura', 'silo-ai', 'flow-computing']
  });
  assert.equal(proxy.mode, 'companies');
  assert.equal(proxy.weakProfile, false);
  assert.equal(proxy.portfolioCount, 3);
});

test('computeRevealedThesis throws 404 on unknown fund', () => {
  assert.throws(
    () => computeRevealedThesis({ mode: 'fund', fundId: 'non-existent-fund' }),
    (err) => err.statusCode === 404
  );
});

test('scoreAndRankCandidates excludes portfolio, flags competitors & raising soon, and respects untapped mode', () => {
  const thesis = computeRevealedThesis({ mode: 'fund', fundId: 'lifeline-ventures' });
  const balanced = scoreAndRankCandidates(thesis, { rankingMode: 'balanced', limit: 30 });
  const untapped = scoreAndRankCandidates(thesis, { rankingMode: 'untapped', limit: 30 });

  // Excludes Lifeline existing portfolio
  const portfolioSet = new Set(thesis.portfolioCompanyIds);
  for (const item of balanced.allRanked) {
    assert.equal(portfolioSet.has(item.id), false);
    assert.ok(item.graph.nodeCount <= 100);
    assert.ok(item.reasons.length >= 1);
    for (const reason of item.reasons) {
      assert.ok(reason.sources.length >= 1);
    }
  }

  // Competitor flag visible (Halcyon Cryo competes with IQM Quantum Computers; Lumen Diagnostics with Oura)
  const halcyon = balanced.allRanked.find((c) => c.id === 'halcyon-cryo');
  assert.ok(halcyon);
  assert.equal(halcyon.directCompetitorOf, 'IQM Quantum Computers');

  // Raising soon flag (12 to 24 months since last round)
  const voltgrid = balanced.allRanked.find((c) => c.id === 'voltgrid');
  assert.ok(voltgrid);
  assert.equal(voltgrid.raisingSoon, true);

  // Untapped mode zeroes co-investor weight so angel-backed startups are not penalized
  assert.equal(untapped.weights.coInvestor, 0);
  const kinetixBalanced = balanced.allRanked.findIndex((c) => c.id === 'kinetix-materials');
  const kinetixUntapped = untapped.allRanked.findIndex((c) => c.id === 'kinetix-materials');
  assert.ok(kinetixUntapped <= kinetixBalanced);
});

test('enforceFactCitations drops ungrounded sentences', () => {
  const filtered = enforceFactCitations([
    { text: 'Grounded sentence', sourceIds: ['src-oura-1'] },
    { text: 'Hallucinated sentence with fake ID', sourceIds: ['src-does-not-exist'] },
    { text: 'Empty sources sentence', sourceIds: [] }
  ]);
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].text, 'Grounded sentence');
});

test('runPointInTimeBacktest avoids future leakage and recovers hidden 12-month deals', () => {
  const bt = runPointInTimeBacktest('lifeline-ventures');
  assert.ok(bt);
  assert.equal(bt.cutoffDate, '2025-11-14');
  assert.equal(bt.hiddenDealsCount, 3);
  assert.ok(bt.hitsInTop50 >= 2);
  assert.ok(bt.hitsInTop15 >= 2);

  // Ensure hidden deals truly occurred >= cutoffDate
  for (const hd of bt.hiddenDeals) {
    assert.ok(hd.actualDate >= bt.cutoffDate);
    assert.ok(hd.predictedRank !== null);
  }
});

test('buildStartupBrief includes explicit Not found in Cala coverage gaps and export memo', () => {
  const brief = buildStartupBrief('voltgrid', 'lifeline-ventures');
  assert.equal(brief.name, 'VoltGrid');
  assert.ok(brief.rounds.length >= 1);
  assert.ok(brief.notFoundInCala.length >= 4);
  assert.ok(brief.notFoundInCala.every((g) => g.status === 'Not found in Cala'));
  assert.match(brief.memoMarkdown, /Not Found in Cala/);
});

test('refineShortlist handles region filter, sector exclusion, and why-not explanations', () => {
  const analysis = runFullAnalysis({ mode: 'fund', fundId: 'lifeline-ventures' });
  const nordicsOnly = refineShortlist(analysis.thesis, analysis.allRanked, {
    queryText: 'only Nordics'
  });
  assert.ok(nordicsOnly.shortlist.every((c) => c.region === 'Nordics'));

  const noFintech = refineShortlist(analysis.thesis, analysis.allRanked, {
    queryText: 'exclude fintech'
  });
  assert.ok(noFintech.shortlist.every((c) => c.sector !== 'Fintech'));

  const whyOura = refineShortlist(analysis.thesis, analysis.allRanked, {
    queryText: 'why not Oura?'
  });
  assert.match(whyOura.explanation, /already in Lifeline Ventures existing portfolio/i);
  assert.equal(whyOura.searchIntent, 'why_not');
  assert.ok(Array.isArray(whyOura.aiTrace) && whyOura.aiTrace.length >= 1);
});

test('analysis shortlist includes LinkedIn bridges and peer startup network links', () => {
  const analysis = runFullAnalysis({ mode: 'fund', fundId: 'lifeline-ventures' });
  const first = analysis.shortlist[0];
  assert.ok(first.linkedinNetwork);
  assert.ok(typeof first.linkedinNetwork.sourceLabel === 'string');
  assert.ok(Array.isArray(first.linkedinNetwork.nodes) && first.linkedinNetwork.nodes.length >= 2);
  assert.ok(Array.isArray(first.linkedinNetwork.links) && first.linkedinNetwork.links.length >= 1);
  assert.ok(Array.isArray(first.peerStartups));
});

test('refineShortlist classifies company, investor, and industry AI searches with trace', () => {
  const analysis = runFullAnalysis({ mode: 'fund', fundId: 'lifeline-ventures' });
  assert.ok(analysis.shortlist.length >= 1);
  const sampleCompany = analysis.shortlist[0].name;

  const companyRes = refineShortlist(analysis.thesis, analysis.allRanked, {
    queryText: sampleCompany
  });
  assert.equal(companyRes.searchIntent, 'company');
  assert.ok(Array.isArray(companyRes.aiTrace) && companyRes.aiTrace.length >= 2);
  assert.ok(companyRes.shortlist.some((item) => item.name === sampleCompany));

  const investorRes = refineShortlist(analysis.thesis, analysis.allRanked, {
    queryText: 'Creandum'
  });
  assert.equal(investorRes.searchIntent, 'investor');
  assert.ok(Array.isArray(investorRes.aiTrace) && investorRes.aiTrace.length >= 2);

  const industryRes = refineShortlist(analysis.thesis, analysis.allRanked, {
    queryText: 'Climate Tech'
  });
  assert.equal(industryRes.searchIntent, 'industry');
  assert.ok(Array.isArray(industryRes.aiTrace) && industryRes.aiTrace.length >= 2);
  assert.ok(industryRes.shortlist.length >= 1);

  const cityRes = refineShortlist(analysis.thesis, analysis.allRanked, {
    queryText: 'Helsinki'
  });
  assert.ok(cityRes.shortlist.length >= 1);
  assert.ok(cityRes.shortlist.every((item) => item.hqCity === 'Helsinki' || item.description.includes('Helsinki')));

  const seedStageRes = refineShortlist(analysis.thesis, analysis.allRanked, {
    stageFilter: 'pre_seed_seed'
  });
  assert.ok(seedStageRes.shortlist.length >= 1);
  assert.ok(seedStageRes.shortlist.every((item) => /seed/i.test(item.stage)));
});

test('timeTravelProfile reconstructs entry headcount & respects cutoffDate with zero leakage', () => {
  const full = computeRevealedThesis({ mode: 'fund', fundId: 'lifeline-ventures' });
  assert.ok(full.timeTravelProfile);
  assert.ok(full.timeTravelProfile.medianEntryHeadcount > 0);
  assert.match(full.timeTravelProfile.entryHeadcountBand, /employees at entry/);
  assert.ok(full.timeTravelProfile.medianEntryAgeMonths > 0);
  assert.ok(full.timeTravelProfile.filingVerifiedSharePct >= 50);
  assert.ok(full.timeTravelProfile.dealSnapshots.length >= 5);

  const reorbit = COMPANIES.find((c) => c.id === 'reorbit');
  const preCutoff = interpolateHeadcountAtDate(reorbit, '2026-10-15', '2025-11-14');
  assert.ok(preCutoff.observationDate < '2025-11-14');
  assert.ok(preCutoff.headcount < reorbit.employeeCount);
});

test('upstreamFeeders detects Round N-1 feeders and annotates coInvestorPath', () => {
  const lifeline = computeRevealedThesis({ mode: 'fund', fundId: 'lifeline-ventures' });
  assert.ok(Array.isArray(lifeline.upstreamFeeders) && lifeline.upstreamFeeders.length >= 2);
  const inventure = lifeline.upstreamFeeders.find((f) => f.id === 'inventure');
  assert.ok(inventure);
  assert.ok(inventure.fedDealsCount >= 2);
  assert.equal(inventure.relationshipType, 'feeder_to_lead');

  const ranked = scoreAndRankCandidates(lifeline, { limit: 30 });
  const voltgrid = ranked.allRanked.find((c) => c.id === 'voltgrid');
  assert.ok(voltgrid?.coInvestorPath?.isUpstreamFeeder);
  assert.equal(voltgrid.coInvestorPath.pathwayType, 'feeder_to_lead');
});

test('agentic arbitrage signals, alumni spinouts, Companies House metrics, and buildStartupBrief series', () => {
  const analysis = runFullAnalysis({ mode: 'fund', fundId: 'lifeline-ventures' });
  assert.equal(analysis.agentPipeline.length, 4);
  assert.equal(analysis.agentPipeline[0].agent, 'Time-Travel DNA Profiler');
  assert.equal(analysis.agentPipeline[3].agent, 'Provenance Gate');

  const kestrel = analysis.allRanked.find((c) => c.id === 'kestrel-nav');
  assert.ok(kestrel);
  assert.equal(kestrel.alumniSpinout?.priorCompany, 'ICEYE');
  assert.ok(kestrel.headcountGrowthPct >= 50);
  assert.ok(kestrel.whyNowTrigger.length > 5);
  assert.ok(kestrel.arbitrageSignals.some((s) => s.type === 'filing_arbitrage'));

  const brief = buildStartupBrief('vectormesh', 'lifeline-ventures');
  assert.equal(brief.companiesHouseNumber, '15482910');
  assert.ok(brief.financialMetrics.length >= 1);
  assert.ok(brief.employeeCountSeries.length >= 3);
  assert.ok(brief.arbitrageSignals.some((s) => s.type === 'companies_house_metric'));
  assert.match(brief.memoMarkdown, /Time-Series & Filing Arbitrage Signals/);

  const kestrelBrief = buildStartupBrief('kestrel-nav', 'lifeline-ventures');
  assert.ok(kestrelBrief.sources.some((s) => s.sourceRank === 'FILING'));
});

test('refineShortlist handles agentic velocity, feeder, filing, alumni filters & 4-agent trace', () => {
  const analysis = runFullAnalysis({ mode: 'fund', fundId: 'lifeline-ventures' });

  const velocityRes = refineShortlist(analysis.thesis, analysis.allRanked, {
    queryText: 'fast headcount growth'
  });
  assert.ok(velocityRes.shortlist.length >= 1);
  assert.ok(velocityRes.shortlist.every((c) => c.headcountGrowthPct >= 30));
  assert.equal(velocityRes.agentPipeline.length, 4);

  const feederRes = refineShortlist(analysis.thesis, analysis.allRanked, {
    queryText: 'feeder syndicate'
  });
  assert.ok(feederRes.shortlist.length >= 1);
  assert.ok(feederRes.shortlist.every((c) => c.coInvestorPath?.isUpstreamFeeder));

  const filingRes = refineShortlist(analysis.thesis, analysis.allRanked, {
    queryText: 'filing signal'
  });
  assert.ok(filingRes.shortlist.length >= 1);
  assert.ok(filingRes.shortlist.every((c) => c.arbitrageSignals.some((s) => s.sourceRank === 'FILING')));

  const alumniRes = refineShortlist(analysis.thesis, analysis.allRanked, {
    queryText: 'alumni founder'
  });
  assert.ok(alumniRes.shortlist.length >= 1);
  assert.ok(alumniRes.shortlist.every((c) => Boolean(c.alumniSpinout)));
});

test('ingestLiveCalaEntities expands COMPANIES + SOURCES, scores in full analysis, builds brief, and preserves backtest', () => {
  const baselineBacktest = runPointInTimeBacktest('lifeline-ventures');
  const beforeCount = COMPANIES.length;

  const ing = ingestLiveCalaEntities(
    [
      {
        id: '00541f9a-8af0-5d33-b013-c32d90ba3076',
        name: 'Finadeck Oy',
        entity_type: 'Company',
        description: 'AI-based CFO forecasting, budgeting and consolidation software founded in 2019 in Tampere, Finland.'
      },
      {
        id: 'test-unlocated-slush-1',
        name: 'AlphaMesh AI',
        entity_type: 'Company',
        description: 'AlphaMesh AI is a technology startup indexed in the Cala AI knowledge graph.'
      },
      {
        id: 'fake-vc-entity-1',
        name: 'Nordic Test Ventures',
        entity_type: 'Company',
        description: 'A venture capital fund.'
      }
    ],
    { slush2026: true }
  );

  assert.equal(ing.ingestedCount, 2);
  assert.equal(COMPANIES.length, beforeCount + 2);

  const nonSlushIng = ingestLiveCalaEntities(
    [
      {
        id: 'test-legacy-ipg',
        name: 'IPG PHOTONICS CORP',
        entity_type: 'Company',
        description: 'Optical fiber laser manufacturer founded in 1998 in Oxford, Massachusetts.'
      },
      {
        id: 'test-singular-photonics',
        name: 'SINGULAR PHOTONICS LIMITED',
        entity_type: 'Company',
        description: 'SPAD image sensor startup founded in 2024 in Edinburgh, United Kingdom.'
      }
    ],
    { slush2026: false }
  );
  assert.equal(nonSlushIng.ingestedCount, 1);

  const analysis = runFullAnalysis({ mode: 'fund', fundId: 'lifeline-ventures' });
  assert.ok(analysis.shortlist.length > 20);
  const finadeck = analysis.shortlist.find((c) => c.calaEntityId === '00541f9a-8af0-5d33-b013-c32d90ba3076');
  assert.ok(finadeck);
  assert.equal(finadeck.isLiveCalaDiscovered, true);
  assert.equal(finadeck.attendingSlush2026, true);
  assert.equal(finadeck.sector, 'Fintech');
  assert.equal(finadeck.country, 'Finland');

  const alphaMesh = COMPANIES.find((c) => c.calaEntityId === 'test-unlocated-slush-1');
  assert.ok(alphaMesh);
  assert.equal(alphaMesh.country, 'Europe');
  assert.equal(alphaMesh.hqCity, 'Slush 2026');

  const ipg = COMPANIES.find((c) => c.calaEntityId === 'test-legacy-ipg');
  assert.equal(ipg, undefined);

  const singular = COMPANIES.find((c) => c.calaEntityId === 'test-singular-photonics');
  assert.ok(singular);
  assert.equal(singular.country, 'United Kingdom');
  assert.equal(singular.hqCity, 'Edinburgh');

  const brief = buildStartupBrief(finadeck.id, 'lifeline-ventures');
  assert.equal(brief.name, 'Finadeck Oy');
  assert.ok(brief.rounds.length >= 1);
  assert.ok(brief.sources.length >= 1);

  const afterBacktest = runPointInTimeBacktest('lifeline-ventures');
  assert.equal(afterBacktest.hiddenDealsCount, baselineBacktest.hiddenDealsCount);
  assert.equal(afterBacktest.hitsInTop15, baselineBacktest.hitsInTop15);
  assert.equal(afterBacktest.hitsInTop50, baselineBacktest.hitsInTop50);

  // Clean up runtime test companies so baseline remains tidy
  for (const calaId of ['00541f9a-8af0-5d33-b013-c32d90ba3076', 'test-unlocated-slush-1', 'test-singular-photonics']) {
    const idx = COMPANIES.findIndex((c) => c.calaEntityId === calaId);
    if (idx !== -1) COMPANIES.splice(idx, 1);
  }
});

test('timeTravelProfile, upstreamFeeders lift, non-leakage interpolateHeadcountAtDate, and missing-data neutrality work deterministically', () => {
  const result = runFullAnalysis({ mode: 'fund', fundId: 'lifeline-ventures', rankingMode: 'balanced' });
  const tt = result.thesis.timeTravelProfile;
  assert.ok(tt);
  assert.ok(tt.medianEntryHeadcount > 0);
  assert.ok(tt.entryHeadcountP25 > 0);
  assert.ok(tt.entryHeadcountP75 >= tt.entryHeadcountP25);
  assert.ok(tt.medianEntryAgeMonths > 0);
  assert.ok(tt.filingVerifiedSharePct > 0);

  const feeders = result.thesis.upstreamFeeders || [];
  assert.ok(feeders.length > 0);
  assert.ok(typeof feeders[0].lift === 'number' && feeders[0].lift > 0);
  for (let i = 1; i < feeders.length; i += 1) {
    assert.ok(feeders[i - 1].lift >= feeders[i].lift);
  }

  // Point-in-time non-leakage check on interpolateHeadcountAtDate
  const vectormesh = COMPANIES.find((c) => c.id === 'vectormesh');
  assert.ok(vectormesh);
  assert.ok(vectormesh.employeeCountSeries.length >= 2);
  const earliestObs = [...vectormesh.employeeCountSeries].sort((a, b) => a.date.localeCompare(b.date))[0];
  const latestObs = [...vectormesh.employeeCountSeries].sort((a, b) => a.date.localeCompare(b.date)).slice(-1)[0];
  const cut = interpolateHeadcountAtDate(vectormesh, latestObs.date, earliestObs.date);
  assert.equal(cut.headcount, earliestObs.value);

  // Backtest exposes recallAt15, recallAt50, mrr
  assert.ok(typeof result.backtest.recallAt15 === 'number');
  assert.ok(typeof result.backtest.recallAt50 === 'number');
  assert.ok(typeof result.backtest.mrr === 'number');

  // VectorMesh has full series + UK Companies House -> must NOT list "Historical employee growth curve" as missing
  const vmBrief = buildStartupBrief('vectormesh', 'lifeline-ventures');
  assert.ok(vmBrief.employeeCountSeries.length >= 2);
  assert.ok(vmBrief.financialMetrics.length >= 2);
  assert.ok(vmBrief.companiesHouseNumber);
  assert.equal(
    vmBrief.notFoundInCala.some((g) => /Historical employee growth curve/i.test(g.field)),
    false
  );

  // Sparse stealth startup without time-series or people coverage gets exact 0.50 neutral momentum baseline
  ingestLiveCalaEntities([
    {
      id: 'test-sparse-neutral-1',
      name: 'SparseStealth Oy',
      entity_type: 'Company',
      description: 'Pre-seed AI infrastructure startup founded in 2025 in Helsinki, Finland.'
    }
  ]);
  const withSparse = runFullAnalysis({ mode: 'fund', fundId: 'lifeline-ventures', rankingMode: 'balanced' });
  const sparseCand = withSparse.allRanked.find((c) => c.calaEntityId === 'test-sparse-neutral-1');
  assert.ok(sparseCand);
  assert.equal(sparseCand.dataConfidence.grade, 'Early / Sparse');
  assert.equal(sparseCand.scoreBreakdown.momentum.earned, Math.round(withSparse.weights.momentum * 0.5 * 10) / 10);

  const sparseBrief = buildStartupBrief(sparseCand.id, 'lifeline-ventures');
  assert.equal(
    sparseBrief.notFoundInCala.some((g) => /Historical employee growth curve/i.test(g.field)),
    true
  );

  const sparseIdx = COMPANIES.findIndex((c) => c.calaEntityId === 'test-sparse-neutral-1');
  if (sparseIdx !== -1) COMPANIES.splice(sparseIdx, 1);

  // Deterministic refinement supports expandedKeywords, minHeadcountGrowthPct, and requireAlumniFounder
  const filtered = refineShortlist(result.thesis, result.allRanked, {
    requireAlumniFounder: true,
    minHeadcountGrowthPct: 20,
    expandedKeywords: ['grid', 'storage', 'aiven', 'nordic']
  });
  assert.ok(filtered.shortlist.every((item) => Boolean(item.alumniSpinout) && item.headcountGrowthPct >= 20));
});

test('ingestRegistryEntities handles unfunded startups & established_corp without fake VC rounds or backtest leakage', () => {
  const baselineBacktest = runPointInTimeBacktest('lifeline-ventures');

  const regResult = ingestRegistryEntities([
    {
      id: 'reg-test-mcdonalds-corp',
      name: "McDonald's Corporation (Test)",
      oneLiner: 'Global restaurant operator · GLEIF LEI.',
      description: "McDonald's Corporation registered via GLEIF LEI.",
      sector: 'Gaming & Consumer',
      subSectors: ['Consumer', 'Hospitality'],
      country: 'United States',
      region: 'Global',
      hqCity: 'Chicago',
      foundedYear: 1965,
      foundingDate: '1965-03-01',
      website: 'https://www.mcdonalds.com',
      entityCategory: 'established_corp',
      registryInfo: {
        registryName: 'GLEIF Global LEI',
        provider: 'GLEIF',
        registrationNumber: '549300TESTMCD1234',
        legalForm: 'Corporation',
        industryCode: 'LEI-GENERAL',
        industryDescription: 'Corporate entity',
        status: 'ACTIVE',
        registryUrl: 'https://search.gleif.org/#/record/549300TESTMCD1234'
      },
      source: {
        id: 'src-reg-test-mcd',
        title: "GLEIF LEI: McDonald's Corporation (Test)",
        publisher: 'GLEIF Global LEI Registry',
        url: 'https://search.gleif.org/#/record/549300TESTMCD1234',
        date: '1965-03-01',
        sourceRank: 'FILING',
        datePrecision: 'day',
        snippet: 'Test GLEIF corporate filing.'
      }
    }
  ]);

  assert.equal(regResult.ingestedCount, 1);

  try {
    const startupOnly = runFullAnalysis(
      { mode: 'fund', fundId: 'lifeline-ventures' },
      { entityScope: 'startups' }
    );
    assert.equal(
      startupOnly.allRanked.some((c) => c.id === 'reg-test-mcdonalds-corp'),
      false
    );

    const allScope = runFullAnalysis(
      { mode: 'fund', fundId: 'lifeline-ventures' },
      { entityScope: 'all' }
    );
    const mcd = allScope.allRanked.find((c) => c.id === 'reg-test-mcdonalds-corp');
    assert.ok(mcd);
    assert.equal(mcd.isRegistryDiscovered, true);
    assert.equal(mcd.entityCategory, 'established_corp');
    assert.equal(mcd.lastRoundAmountEurM, null);
    assert.equal(mcd.stage, 'Public / Mature');
    assert.equal(mcd.dataConfidence.topSourceRank, 'FILING');
    assert.ok(mcd.reasons.length >= 1);

    const refined = refineShortlist(allScope.thesis, allScope.allRanked, {
      queryText: "McDonald's",
      entityScope: 'all',
      companyQuery: "McDonald's Corporation (Test)"
    });
    assert.equal(refined.shortlist.length, 1);
    assert.equal(refined.shortlist[0].id, 'reg-test-mcdonalds-corp');

    const brief = buildStartupBrief('reg-test-mcdonalds-corp', 'lifeline-ventures');
    assert.equal(brief.rounds.length, 0);
    assert.ok(brief.notFoundInCala.some((g) => /VC funding rounds/i.test(g.field)));
    assert.match(brief.memoMarkdown, /GLEIF Global LEI/);

    const afterBacktest = runPointInTimeBacktest('lifeline-ventures');
    assert.equal(afterBacktest.hiddenDealsCount, baselineBacktest.hiddenDealsCount);
    assert.equal(afterBacktest.hitsInTop15, baselineBacktest.hitsInTop15);
    assert.equal(afterBacktest.hitsInTop50, baselineBacktest.hitsInTop50);
  } finally {
    const idx = COMPANIES.findIndex((c) => c.id === 'reg-test-mcdonalds-corp');
    if (idx !== -1) COMPANIES.splice(idx, 1);
  }
});

test('extractHiddenBridges filters mega-hubs, ranks by rarity/lift, and extracts all 4 bridge families', () => {
  assert.equal(MEGA_HUB_DEAL_THRESHOLD, 8);

  const thesis = computeRevealedThesis({ mode: 'fund', fundId: 'lifeline-ventures' });
  assert.ok(thesis.upstreamFeeders.every((f) => typeof f.totalDeals === 'number' && typeof f.lift === 'number' && typeof f.isMegaHub === 'boolean'));
  assert.ok(thesis.topCoInvestors.every((ci) => typeof ci.totalDeals === 'number' && typeof ci.lift === 'number' && typeof ci.isMegaHub === 'boolean'));
  assert.ok(thesis.topCoInvestors.some((ci) => ci.isMegaHub === true));

  // Synthetic startup mixing a mega-hub co-investor (seedcamp, 13 deals), boutique feeder/co-investor (eqt-ventures, 3 deals),
  // an ex-Aiven alumni spinout, and a Slush 2026 event participation record.
  const syntheticStartup = {
    id: 'test-bridge-mix',
    name: 'TestBridge Quantum',
    sector: 'DeepTech',
    country: 'Finland',
    region: 'Nordics',
    hqCity: 'Espoo',
    foundingDate: '2024-02-15',
    employeeCount: 18,
    attendingSlush2026: true,
    corporateEvents: [
      {
        id: SLUSH_2026_EVENT_ID,
        name: 'Slush 2026 (Helsinki)',
        eventType: 'PARTICIPATES_IN_EVENT',
        eventDate: '2026-11-19',
        summary: 'TestBridge Quantum exhibited in Slush 2026 Founder Stage.',
        sourceRank: 'PRIMARY',
        sourceId: 'src-iceye-1'
      }
    ],
    peopleCoverage: {
      available: true,
      note: 'Test founder lineage',
      roles: [
        {
          relation: 'FOUNDED',
          name: 'Kaisa Korhonen',
          role: 'CEO & Co-Founder',
          validSince: '2024-02-15',
          priorCompany: 'Aiven',
          priorRole: 'Principal Distributed Systems Lead',
          priorValidUntil: '2024-01-10',
          sourceRank: 'FILING',
          sourceId: 'src-prh-filing-2026'
        }
      ]
    },
    rounds: [
      {
        id: 'tb-r1',
        type: 'Seed',
        date: '2025-05-10',
        amountEurM: 3.5,
        valuationEurM: null,
        leadInvestorId: 'eqt-ventures',
        investorIds: ['eqt-ventures', 'seedcamp'],
        sourceIds: ['src-iceye-1', 'src-prh-filing-2026']
      }
    ]
  };

  // Inject boutique feeder entry & mega-hub co-investor cleanly into test thesis copy
  const testThesis = {
    ...thesis,
    topCoInvestors: [
      { id: 'seedcamp', name: 'Seedcamp', sharedRounds: 3, totalDeals: 13, lift: 0.83, isMegaHub: true, companies: ['Oura Health'], sourceIds: ['src-oura-1'] },
      { id: 'eqt-ventures', name: 'EQT Ventures', sharedRounds: 2, totalDeals: 3, lift: 1.15, isMegaHub: false, companies: ['Varjo'], sourceIds: ['src-varjo-1'] }
    ],
    upstreamFeeders: [
      { id: 'eqt-ventures', name: 'EQT Ventures', fedDealsCount: 2, totalDeals: 3, lift: 1.15, isMegaHub: false, companies: ['Varjo'], sourceIds: ['src-varjo-1'] },
      { id: 'seedcamp', name: 'Seedcamp', fedDealsCount: 2, totalDeals: 13, lift: 0.55, isMegaHub: true, companies: ['Wolt'], sourceIds: ['src-oura-1'] }
    ]
  };

  const hiddenResult = extractHiddenBridges(testThesis, syntheticStartup, syntheticStartup.rounds, null, {
    hideMegaHubs: true,
    maxPaths: 5
  });
  assert.ok(hiddenResult.suppressedMegaHubCount >= 2);
  assert.ok(hiddenResult.bridges.length >= 3);
  assert.ok(hiddenResult.bridges.every((b) => b.isMegaHub === false));
  for (let i = 1; i < hiddenResult.bridges.length; i++) {
    assert.ok(hiddenResult.bridges[i - 1].rarityScore >= hiddenResult.bridges[i].rarityScore);
  }
  for (const br of hiddenResult.bridges) {
    assert.ok(br.hops.length >= 2 && br.hops.length <= 4);
    assert.ok(br.sourceIds.length >= 1 && br.sourceIds.every((id) => Boolean(SOURCES[id])));
  }

  const revealedResult = extractHiddenBridges(testThesis, syntheticStartup, syntheticStartup.rounds, null, {
    hideMegaHubs: false,
    maxPaths: 10
  });
  assert.equal(revealedResult.suppressedMegaHubCount, 0);
  assert.ok(revealedResult.bridges.some((b) => b.isMegaHub === true));

  const alumniOnly = extractHiddenBridges(testThesis, syntheticStartup, syntheticStartup.rounds, null, {
    bridgeFamily: 'alumni_spinout'
  });
  assert.equal(alumniOnly.bridges.length, 1);
  assert.equal(alumniOnly.bridges[0].bridgeFamily, 'alumni_spinout');

  const eventOnly = extractHiddenBridges(testThesis, syntheticStartup, syntheticStartup.rounds, null, {
    bridgeFamily: 'event'
  });
  assert.equal(eventOnly.bridges.length, 1);
  assert.equal(eventOnly.bridges[0].bridgeFamily, 'event');

  const filingOnlyRes = extractHiddenBridges(testThesis, syntheticStartup, syntheticStartup.rounds, null, {
    hideMegaHubs: false,
    filingOnly: true
  });
  assert.ok(filingOnlyRes.bridges.every((b) => b.topSourceRank === 'FILING'));
});

test('buildEvidenceFolders attaches 3 provenance-ordered analyst folders to shortlist & buildStartupBrief', () => {
  const analysis = runFullAnalysis({ mode: 'fund', fundId: 'lifeline-ventures' });
  const topCandidate = analysis.shortlist[0];
  assert.ok(topCandidate.evidenceFolders);
  assert.match(topCandidate.triageNote, /not an investment recommendation/i);
  assert.match(topCandidate.evidenceFolders.triageNote, /not an investment recommendation/i);
  assert.ok(topCandidate.evidenceFolders.hiddenBridges);
  assert.ok(topCandidate.evidenceFolders.observedActivity);
  assert.ok(topCandidate.evidenceFolders.proofAndGaps);
  assert.ok(topCandidate.evidenceFolders.proofAndGaps.missingFromCala.some((g) => g.status === 'Not found in Cala'));

  const rankOrder = { FILING: 4, PRIMARY: 3, PRESS: 2, AGGREGATOR: 1 };
  const facts = topCandidate.evidenceFolders.proofAndGaps.verifiedFacts;
  assert.ok(facts.length >= 1);
  for (let i = 1; i < facts.length; i++) {
    assert.ok(rankOrder[facts[i - 1].sourceRank] >= rankOrder[facts[i].sourceRank]);
  }

  const voltgridBrief = buildStartupBrief('voltgrid', 'lifeline-ventures');
  assert.ok(voltgridBrief.evidenceFolders);
  assert.ok(voltgridBrief.evidenceFolders.hiddenBridges.paths.some((p) => p.bridgeFamily === 'alumni_spinout'));
  assert.ok(voltgridBrief.evidenceFolders.proofAndGaps.missingFromCala.length >= 4);

  // Confirm buildEvidenceFolders works cleanly when called standalone
  const manualFolders = buildEvidenceFolders(
    { id: 'voltgrid', name: 'VoltGrid', peopleCoverage: { available: false, roles: [] } },
    [],
    { headcountGrowthPct: 0 },
    { bridges: [], suppressedMegaHubCount: 0 },
    { grade: 'Early / Sparse', topSourceRank: 'AGGREGATOR' }
  );
  assert.ok(manualFolders.proofAndGaps.missingFromCala.some((g) => /Verified leadership/i.test(g.field)));
});

test('refineShortlist filters by bridgeFamily/hideMegaHubs and buildBridgeMapPayload enforces graph invariants', () => {
  const analysis = runFullAnalysis({ mode: 'fund', fundId: 'lifeline-ventures' });
  assert.ok(analysis.bridgeMap);
  assert.ok(analysis.bridgeMap.stats.renderedStartups <= 12);

  const nodeIds = new Set(analysis.bridgeMap.nodes.map((n) => n.id));
  assert.equal(nodeIds.size, analysis.bridgeMap.nodes.length);
  for (const edge of analysis.bridgeMap.edges) {
    assert.ok(nodeIds.has(edge.from), `Orphan edge source ${edge.from}`);
    assert.ok(nodeIds.has(edge.to), `Orphan edge target ${edge.to}`);
  }
  assert.equal(analysis.bridgeMap.clusters.length, 4);

  const alumniRefined = refineShortlist(analysis.thesis, analysis.allRanked, {
    bridgeFamily: 'alumni_spinout',
    hideMegaHubs: true
  });
  assert.equal(alumniRefined.appliedFilters.bridgeFamily, 'alumni_spinout');
  assert.equal(alumniRefined.appliedFilters.hideMegaHubs, true);
  assert.ok(alumniRefined.aiTrace.some((line) => /alumni_spinout/i.test(line)));
  assert.ok(alumniRefined.shortlist.length >= 1);
  assert.ok(
    alumniRefined.shortlist.every((item) =>
      item.evidenceFolders.hiddenBridges.paths.some((p) => p.bridgeFamily === 'alumni_spinout')
    )
  );
  assert.ok(alumniRefined.bridgeMap);
  assert.ok(alumniRefined.bridgeMap.clusters.find((c) => c.bridgeFamily === 'alumni_spinout').nodeCount >= 1);

  const revealedMap = buildBridgeMapPayload(analysis.thesis, analysis.shortlist, { hideMegaHubs: false });
  const hiddenMap = buildBridgeMapPayload(analysis.thesis, analysis.shortlist, { hideMegaHubs: true });
  assert.equal(revealedMap.stats.suppressedMegaHubCount, 0);
  assert.equal(revealedMap.stats.hideMegaHubsApplied, false);
  assert.equal(hiddenMap.stats.hideMegaHubsApplied, true);
  assert.ok(hiddenMap.stats.suppressedMegaHubCount >= revealedMap.stats.suppressedMegaHubCount);
});
