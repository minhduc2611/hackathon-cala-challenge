import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildStartupBrief,
  computeRevealedThesis,
  enforceFactCitations,
  interpolateHeadcountAtDate,
  refineShortlist,
  runFullAnalysis,
  runPointInTimeBacktest,
  searchEntities,
  scoreAndRankCandidates
} from '../src/engine.mjs';
import { COMPANIES } from '../src/data.mjs';

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
