import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createAppServer } from '../server.mjs';
import { createRegistryClient } from '../src/registryClient.mjs';
import { buildEntityMap, buildEntityMapFromCala, searchLocalEntities } from '../src/entityMap.mjs';

const UI_BANNED = /\bpts\b|\/100|\blift\b|sqrt|—/i;

function allText(map) {
  return JSON.stringify(map);
}

// Mocked Cala client: no network, deterministic entities for Nvidia / OpenAI / Jensen Huang.
function mockCalaClient() {
  const ENTITIES = {
    nvidia: [
      { id: 'cala-nvidia', name: 'NVIDIA Corporation', entity_type: 'Company', description: 'Publicly traded maker of GPUs, listed on NASDAQ.' },
      { id: 'cala-jensen', name: 'Jensen Huang', entity_type: 'Person' }
    ],
    openai: [{ id: 'cala-openai', name: 'OpenAI', entity_type: 'Organization', description: 'AI research organization.' }]
  };
  const DETAIL = {
    'cala-nvidia': {
      id: 'cala-nvidia',
      name: 'NVIDIA Corporation',
      entity_type: 'Company',
      description: 'Publicly traded maker of GPUs.',
      properties: {
        founding_date: { value: '1993-04-05', sources: [{ name: 'SEC 10-K filing', document: 'https://sec.gov/x', date: '2025-02-01' }] },
        headquarters_address: { value: 'Santa Clara, CA' }
      },
      relationships: {
        incoming: { IS_CEO_OF: [{ id: 'cala-jensen', name: 'Jensen Huang', entity_type: 'Person', properties: { valid_since: '1993-04-05' } }] },
        outgoing: { INVESTED_IN: [{ id: 'cala-openai', name: 'OpenAI', entity_type: 'Organization', properties: { sources: [{ name: 'Reuters', document: 'https://reuters.com/x', date: '2024-10-02' }] } }] }
      }
    }
  };
  return {
    getBudgetStatus: () => ({ configured: true, liveCallsUsed: 0, maxLiveCalls: 10, cacheHits: 0, cachedEntries: 0 }),
    calaEntitySearch: async (name) => ({ data: { entities: ENTITIES[String(name).toLowerCase()] || [] }, fromCache: false }),
    calaIntrospect: async () => ({ data: { properties: ['name'], relationships: { outgoing: ['INVESTED_IN'], incoming: ['IS_CEO_OF'] } } }),
    calaRetrieveEntity: async (id) => ({ data: DETAIL[id] || null }),
    calaKnowledgeSearch: async () => ({ data: { entities: [] } }),
    calaEntityLookup: async () => ({ data: {} })
  };
}

async function withServer(calaClient, fn) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rte-entity-'));
  const server = createAppServer({ calaClient, registryClient: createRegistryClient({ cachePath: path.join(tmp, 'reg.json') }) });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  try {
    await fn(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((r) => server.close(r));
  }
}

test('entity-first maps work for a company, an investor and a person without picking a fund', () => {
  for (const ref of ['co:kestrel-nav', 'inv:lifeline-ventures', 'person:henrik-ranta']) {
    const map = buildEntityMap(ref);
    assert.ok(map, ref);
    assert.deepEqual(Object.keys(map.groups), ['access', 'lineage', 'timing', 'caution']);
    assert.ok(Object.values(map.groups).some((g) => g.items.length > 0));
    assert.doesNotMatch(allText(map), UI_BANNED);
  }
  const kestrel = buildEntityMap('co:kestrel-nav');
  assert.ok(kestrel.groups.access.items.some((i) => i.name === 'Inventure' && i.rank === 'FILING'));
  assert.ok(kestrel.groups.lineage.items.some((i) => i.name === 'ICEYE'));
  assert.equal(buildEntityMap('co:does-not-exist'), null);
});

test('local search finds companies, investors and people', () => {
  assert.equal(searchLocalEntities('lifeline')[0].ref, 'inv:lifeline-ventures');
  assert.ok(searchLocalEntities('henrik').some((e) => e.kind === 'person'));
  assert.deepEqual(searchLocalEntities('nvidia'), []);
});

test('live /api/search merges Company, Organization and Person results without dropping established corps', async () => {
  await withServer(mockCalaClient(), async (base) => {
    const nv = await (await fetch(`${base}/api/search?q=nvidia&live=1`)).json();
    assert.equal(nv.live.available, true);
    assert.ok(nv.entities.some((e) => e.ref === 'cala:cala-nvidia' && e.kind === 'company'));
    assert.ok(nv.entities.some((e) => e.kind === 'person' && e.name === 'Jensen Huang'));
    const oa = await (await fetch(`${base}/api/search?q=openai&live=1`)).json();
    assert.ok(oa.entities.some((e) => e.ref === 'cala:cala-openai' && e.typeLabel === 'Organization'));

    const map = await (await fetch(`${base}/api/entity-map?ref=cala:cala-nvidia`)).json();
    assert.equal(map.center.name, 'NVIDIA Corporation');
    assert.equal(map.liveStatus, 'live');
    assert.ok(map.groups.lineage.items.some((i) => i.name === 'Jensen Huang'));
    assert.ok(map.groups.lineage.items.some((i) => i.name === 'OpenAI'));
    assert.doesNotMatch(allText(map), UI_BANNED);
  });
});

test('without a Cala key the search degrades honestly and local entities still map', async () => {
  const offline = { ...mockCalaClient(), getBudgetStatus: () => ({ configured: false }) };
  await withServer(offline, async (base) => {
    // Earlier tests in this process may have ingested Nvidia, so use an entity nobody indexed.
    const nv = await (await fetch(`${base}/api/search?q=anthropic&live=1`)).json();
    assert.equal(nv.live.available, false);
    assert.deepEqual(nv.entities, []);
    const missing = await fetch(`${base}/api/entity-map?ref=cala:cala-anthropic`);
    assert.equal(missing.status, 404);
    const local = await (await fetch(`${base}/api/entity-map?ref=co:oura`)).json();
    assert.equal(local.center.name, 'Oura Health');
    assert.equal(local.liveStatus, 'indexed');
  });
});

test('buildEntityMapFromCala lists gaps as Not found in Cala', () => {
  const map = buildEntityMapFromCala({ id: 'x', name: 'Bare Co', entity_type: 'Company', properties: {}, relationships: {} });
  assert.ok(map.gaps.includes('Investors not found in Cala'));
  assert.ok(map.groups.caution.items.every((i) => i.kind === 'gap'));
});
