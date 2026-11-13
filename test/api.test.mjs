import test from 'node:test';
import assert from 'node:assert/strict';
import { createAppServer } from '../server.mjs';

test('HTTP API endpoints handle bootstrap, search, analyze, brief, refine, and error states', async () => {
  const server = createAppServer();
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
  }
});
