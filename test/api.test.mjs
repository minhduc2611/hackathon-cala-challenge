import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createAppServer } from '../server.mjs';
import { createCalaClient } from '../src/calaClient.mjs';
import { createRegistryClient } from '../src/registryClient.mjs';
import { COMPANIES } from '../src/data.mjs';

test('HTTP API endpoints handle bootstrap, search, analyze, brief, refine, and error states', async () => {
  const tmpDir1 = fs.mkdtempSync(path.join(os.tmpdir(), 'rte-api-base-'));
  const server = createAppServer({
    calaClient: createCalaClient({
      apiKey: '',
      cacheFile: path.join(tmpDir1, 'cala-cache.json')
    }),
    registryClient: createRegistryClient({
      cachePath: path.join(tmpDir1, 'reg-cache.json')
    })
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    // 1. Bootstrap
    const bootRes = await fetch(`${baseUrl}/api/bootstrap`);
    assert.equal(bootRes.status, 200);
    const boot = await bootRes.json();
    assert.ok(boot.funds.length >= 6);
    assert.ok(boot.companies.length >= 28);

    // 2. Search disambiguation
    const searchRes = await fetch(`${baseUrl}/api/search?q=Ventures`);
    assert.equal(searchRes.status, 200);
    const search = await searchRes.json();
    assert.equal(search.ambiguousFunds, true);
    assert.equal(search.funds.length, 3);

    // 3. Analyze fund + cache verification
    const analyzeRes = await fetch(`${baseUrl}/api/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'fund', fundId: 'lifeline-ventures', rankingMode: 'balanced' })
    });
    assert.equal(analyzeRes.status, 200);
    const analysis = await analyzeRes.json();
    assert.equal(analysis.thesis.fundId, 'lifeline-ventures');
    assert.ok(analysis.shortlist.length >= 10);
    assert.ok(analysis.backtest.hitsInTop15 >= 2);

    // 4. Brief (on-demand 10-minute view)
    const briefRes = await fetch(`${baseUrl}/api/brief?startupId=voltgrid&fundId=lifeline-ventures`);
    assert.equal(briefRes.status, 200);
    const brief = await briefRes.json();
    assert.equal(brief.name, 'VoltGrid');
    assert.ok(brief.notFoundInCala.length >= 4);

    // 5. Layer-2 refine
    const refineRes = await fetch(`${baseUrl}/api/refine`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode: 'fund',
        fundId: 'lifeline-ventures',
        queryText: 'why not Oura?'
      })
    });
    assert.equal(refineRes.status, 200);
    const refined = await refineRes.json();
    assert.match(refined.explanation, /existing portfolio/i);

    // 5b. Stage filter & free-text city refine (control plane returns controlPlaneMode + compiledQuery)
    const cityStageRes = await fetch(`${baseUrl}/api/refine`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode: 'fund',
        fundId: 'lifeline-ventures',
        queryText: 'Helsinki',
        stageFilter: 'pre_seed_seed',
        minHeadcountGrowthPct: 20
      })
    });
    assert.equal(cityStageRes.status, 200);
    const cityStageData = await cityStageRes.json();
    assert.ok(Array.isArray(cityStageData.shortlist));
    assert.ok(['anthropic-query-compiler', 'deterministic-parser'].includes(cityStageData.controlPlaneMode));

    // 5c. Analyze exposes timeTravelProfile, upstreamFeeders & dataConfidence; brief?narrate=1 runs citation gate
    const analyzeCheck = await fetch(`${baseUrl}/api/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'fund', fundId: 'lifeline-ventures', rankingMode: 'balanced' })
    });
    assert.equal(analyzeCheck.status, 200);
    const analyzePayload = await analyzeCheck.json();
    assert.ok(analyzePayload.timeTravelProfile);
    assert.ok(Array.isArray(analyzePayload.upstreamFeeders));
    assert.ok(analyzePayload.shortlist[0].dataConfidence?.grade);

    const narratedBriefRes = await fetch(
      `${baseUrl}/api/brief?startupId=vectormesh&fundId=lifeline-ventures&narrate=1`
    );
    assert.equal(narratedBriefRes.status, 200);
    const narratedBrief = await narratedBriefRes.json();
    assert.ok(narratedBrief.narrative);
    assert.ok(Array.isArray(narratedBrief.narrative.bullets));
    assert.ok(narratedBrief.narrative.bullets.length >= 1);

    // 6. Error cases (unknown fund -> 404, missing startupId -> 400)
    const err404 = await fetch(`${baseUrl}/api/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'fund', fundId: 'missing-fund-xyz' })
    });
    assert.equal(err404.status, 404);

    const err400 = await fetch(`${baseUrl}/api/brief`);
    assert.equal(err400.status, 400);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(tmpDir1, { recursive: true, force: true });
  }
});

test('Hybrid official registry discovery endpoint & /api/refine auto-fallback spend 0 Cala credits', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rte-api-reg-'));
  const calaClient = createCalaClient({
    apiKey: '',
    cacheFile: path.join(tmpDir, 'cala-cache.json'),
    maxLiveCalls: 250
  });
  const registryClient = createRegistryClient({
    cacheFile: path.join(tmpDir, 'reg-cache.json'),
    fetchFn: async (url) => {
      const u = String(url);
      if (u.includes('api.gleif.org')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            data: [
              {
                id: '549300MOCKKFC000001',
                attributes: {
                  lei: '549300MOCKKFC000001',
                  entity: {
                    legalName: { name: 'KFC Holdings Mock Corp' },
                    legalAddress: { city: 'Louisville', country: 'US' },
                    status: 'ACTIVE',
                    category: 'GENERAL',
                    creationDate: '1991-05-01T00:00:00Z'
                  }
                }
              }
            ]
          })
        };
      }
      if (u.includes('avoindata.prh.fi')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ totalResults: 0, companies: [] })
        };
      }
      throw new Error(`Unexpected external fetch in API test: ${u}`);
    }
  });

  const server = createAppServer({ calaClient, registryClient });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const refRes = await fetch(`${baseUrl}/api/refine`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode: 'fund',
        fundId: 'lifeline-ventures',
        queryText: 'KFC'
      })
    });
    assert.equal(refRes.status, 200);
    const refData = await refRes.json();
    assert.equal(refData.entityScope, 'all');
    assert.equal(refData.calaBudget.liveCallsUsed, 0);
    assert.equal(refData.registryDiscovery.triggered, true);
    assert.ok(refData.registryDiscovery.discoveredCount >= 1);
    assert.ok(refData.shortlist.some((item) => /KFC Holdings Mock Corp/i.test(item.name)));
    const kfc = refData.shortlist.find((item) => /KFC Holdings Mock Corp/i.test(item.name));
    assert.equal(kfc.isRegistryDiscovered, true);
    assert.equal(kfc.lastRoundAmountEurM, null);
    assert.equal(kfc.dataConfidence.topSourceRank, 'FILING');

    const syncRes = await fetch(`${baseUrl}/api/discover-registries`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ queryText: 'KFC', mode: 'query' })
    });
    assert.equal(syncRes.status, 200);
    const syncData = await syncRes.json();
    assert.equal(syncData.calaBudget.liveCallsUsed, 0);
    assert.ok(syncData.companies.length >= 1);
  } finally {
    const idx = COMPANIES.findIndex((c) => /KFC Holdings Mock Corp/i.test(c.name));
    if (idx !== -1) COMPANIES.splice(idx, 1);
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('POST /api/analyze, POST /api/refine (hideMegaHubs/bridgeFamily), and GET /api/brief return evidenceFolders & bridgeMap', async () => {
  const server = createAppServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const analyzeRes = await fetch(`${baseUrl}/api/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'fund', fundId: 'lifeline-ventures' })
    });
    assert.equal(analyzeRes.status, 200);
    const analyzeData = await analyzeRes.json();
    assert.ok(analyzeData.bridgeMap);
    assert.ok(analyzeData.bridgeMap.stats.renderedStartups <= 12);
    assert.equal(analyzeData.bridgeMap.clusters.length, 4);
    assert.ok(analyzeData.shortlist[0].evidenceFolders);
    assert.ok(analyzeData.shortlist[0].evidenceFolders.hiddenBridges);
    assert.ok(analyzeData.shortlist[0].evidenceFolders.observedActivity);
    assert.ok(analyzeData.shortlist[0].evidenceFolders.proofAndGaps);

    const refineAlumniRes = await fetch(`${baseUrl}/api/refine`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode: 'fund',
        fundId: 'lifeline-ventures',
        bridgeFamily: 'alumni_spinout',
        hideMegaHubs: true
      })
    });
    assert.equal(refineAlumniRes.status, 200);
    const refineAlumniData = await refineAlumniRes.json();
    assert.equal(refineAlumniData.appliedFilters.bridgeFamily, 'alumni_spinout');
    assert.equal(refineAlumniData.appliedFilters.hideMegaHubs, true);
    assert.ok(refineAlumniData.shortlist.length >= 1);
    assert.ok(refineAlumniData.bridgeMap);
    assert.ok(refineAlumniData.bridgeMap.clusters.find((c) => c.bridgeFamily === 'alumni_spinout').nodeCount >= 1);

    const refineRevealRes = await fetch(`${baseUrl}/api/refine`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode: 'fund',
        fundId: 'lifeline-ventures',
        hideMegaHubs: false
      })
    });
    assert.equal(refineRevealRes.status, 200);
    const refineRevealData = await refineRevealRes.json();
    assert.equal(refineRevealData.appliedFilters.hideMegaHubs, false);
    assert.equal(refineRevealData.bridgeMap.stats.hideMegaHubsApplied, false);
    assert.equal(refineRevealData.bridgeMap.stats.suppressedMegaHubCount, 0);

    const briefRes = await fetch(`${baseUrl}/api/brief?startupId=voltgrid&fundId=lifeline-ventures`);
    assert.equal(briefRes.status, 200);
    const briefData = await briefRes.json();
    assert.ok(briefData.evidenceFolders);
    assert.ok(briefData.evidenceFolders.hiddenBridges.paths.some((p) => p.bridgeFamily === 'alumni_spinout'));
    assert.ok(Array.isArray(briefData.notFoundInCala) && briefData.notFoundInCala.length >= 4);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
