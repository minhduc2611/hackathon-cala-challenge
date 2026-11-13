import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildStartupBrief,
  computeRevealedThesis,
  enforceFactCitations,
  refineShortlist,
  runFullAnalysis,
  runPointInTimeBacktest,
  searchEntities,
  scoreAndRankCandidates
} from '../src/engine.mjs';

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
});
