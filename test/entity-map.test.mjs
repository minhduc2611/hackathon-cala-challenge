import test from 'node:test';
import assert from 'node:assert/strict';
import { createAppServer } from '../server.mjs';
import { buildEntityBridgeMap, ingestLiveCalaEntities } from '../src/engine.mjs';
import { COMPANIES } from '../src/data.mjs';

function removeLiveRecords(calaEntityIds) {
  for (let index = COMPANIES.length - 1; index >= 0; index -= 1) {
    if (calaEntityIds.has(COMPANIES[index].calaEntityId)) {
      COMPANIES.splice(index, 1);
    }
  }
}

function createLiveSearchClient() {
  const calls = [];
  const records = {
    'cala-nvidia-test': {
      id: 'cala-nvidia-test',
      name: 'NVIDIA Corporation',
      entity_type: 'Organization',
      description: 'NVIDIA is a publicly traded accelerated computing company.',
      properties: {
        name: {
          value: 'NVIDIA Corporation',
          sources: [{
            name: 'NVIDIA investor relations',
            source: 'NVIDIA',
            document: 'https://investor.nvidia.com',
            published_time: '2026-01-15',
            source_rank: 'PRIMARY'
          }]
        },
        cik: { value: '1045810' },
        website: { value: 'https://www.nvidia.com' },
        founding_date: { value: '1993-04-05' }
      },
      relationships: {
        outgoing: {
          TRADED_ON: [{ id: 'nasdaq', name: 'NASDAQ' }],
          PARTICIPATES_IN_FUNDING_ROUND: [{
            id: 'nvidia-verified-round',
            name: 'Strategic Investment',
            properties: {
              role: 'ISSUER',
              event_date: '2025-02-01',
              transaction_value: 50000000,
              sources: [{
                name: 'NVIDIA investment announcement',
                source: 'NVIDIA',
                document: 'https://investor.nvidia.com/announcement',
                published_time: '2025-02-01',
                source_rank: 'PRIMARY'
              }]
            }
          }],
          PARTNERED_WITH: [{
            id: 'cala-openai-test',
            name: 'OpenAI',
            entity_type: 'Organization',
            properties: {
              sources: [{
                name: 'Verified partnership announcement',
                source: 'NVIDIA',
                document: 'https://www.nvidia.com/partnership',
                published_time: '2025-04-10',
                source_rank: 'PRIMARY'
              }]
            }
          }]
        },
        incoming: {
          IS_CEO_OF: [{
            id: 'jensen-huang-test',
            name: 'Jensen Huang',
            entity_type: 'Person',
            properties: {
              role: 'Chief Executive Officer',
              valid_since: '1993-04-05',
              sources: [{
                name: 'NVIDIA leadership',
                source: 'NVIDIA',
                document: 'https://www.nvidia.com/leadership',
                published_time: '2026-01-15',
                source_rank: 'PRIMARY'
              }]
            }
          }]
        }
      },
      numerical_observations: []
    },
    'cala-openai-test': {
      id: 'cala-openai-test',
      name: 'OpenAI',
      entity_type: 'Organization',
      description: 'OpenAI is an artificial intelligence research and deployment organization.',
      properties: {
        website: { value: 'https://openai.com' },
        founding_date: { value: '2015-12-11' }
      },
      relationships: {
        outgoing: {},
        incoming: {}
      },
      numerical_observations: []
    }
  };

  return {
    calls,
    getBudgetStatus: () => ({ configured: true, liveCallsUsed: calls.length, maxLiveCalls: 25, cacheHits: 0 }),
    async calaEntitySearch(query, limit, entityTypes) {
      calls.push({ query, limit, entityTypes });
      const needle = String(query).toLowerCase();
      const entity = needle.includes('nvidia') ? records['cala-nvidia-test'] : records['cala-openai-test'];
      return {
        data: {
          entities: [{ id: entity.id, name: entity.name, entity_type: entity.entity_type, description: entity.description }]
        }
      };
    },
    async calaIntrospect() {
      return {
        data: {
          properties: ['name', 'description', 'website'],
          relationships: { outgoing: ['TRADED_ON'], incoming: [] },
          numerical_observations: {}
        }
      };
    },
    async calaRetrieveEntity(id) {
      return { data: records[id] };
    },
    async calaKnowledgeSearch() {
      return { data: { entities: [] } };
    }
  };
}

test('live entity search keeps Nvidia and OpenAI available even when they are mature organizations', async () => {
  const calaClient = createLiveSearchClient();
  const server = createAppServer({ calaClient });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  try {
    for (const query of ['nvidia', 'openai']) {
      const response = await fetch(`${baseUrl}/api/search?q=${query}&live=1`);
      assert.equal(response.status, 200);
      const payload = await response.json();
      const results = [...(payload.entities || []), ...(payload.liveEntities || [])];
      assert.ok(
        results.some((entity) => entity.name.toLowerCase().includes(query)),
        `Expected live ${query} result, received: ${results.map((entity) => entity.name).join(', ')}`
      );
      assert.ok(
        results.some((entity) => entity.isLiveCalaDiscovered),
        `Expected ${query} to be marked as a live Cala entity`
      );
    }

    assert.equal(calaClient.calls.length, 2);
    for (const call of calaClient.calls) {
      assert.equal(call.limit, 12);
      assert.deepEqual(call.entityTypes, ['Company', 'Organization', 'Person']);
    }
  } finally {
    await new Promise((resolve) => server.close(resolve));
    removeLiveRecords(new Set(['cala-nvidia-test', 'cala-openai-test']));
  }
});

test('entity dossier returns verified profile evidence and explicit Cala gaps', async () => {
  const calaClient = createLiveSearchClient();
  const server = createAppServer({ calaClient });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  try {
    const response = await fetch(
      `${baseUrl}/api/entity-dossier?ref=Organization:cala-nvidia-test&mapEntityIds=cala-openai-test`
    );
    assert.equal(response.status, 200);
    const dossier = await response.json();

    assert.equal(dossier.identity.name, 'NVIDIA Corporation');
    assert.ok(dossier.people.some((person) => person.name === 'Jensen Huang'));
    assert.ok(dossier.rounds.some((round) => round.type));
    assert.ok(dossier.relationships.outgoing.PARTNERED_WITH.some((entity) => entity.name === 'OpenAI'));
    assert.ok(dossier.sources.some((source) => source.sourceRank === 'PRIMARY'));
    assert.ok(Array.isArray(dossier.gaps));
    assert.ok(
      dossier.gaps.some((gap) => gap.status === 'Not found in Cala'),
      'The dossier should state which absent Cala fields need follow-up'
    );
    assert.ok(
      dossier.verifiedConnections.some((connection) => connection.entityId === 'cala-openai-test'),
      'The active map context should surface the verified OpenAI connection'
    );
  } finally {
    await new Promise((resolve) => server.close(resolve));
    removeLiveRecords(new Set(['cala-nvidia-test', 'cala-openai-test']));
  }
});

test('sparse live Cala entities retain unknown employee and funding fields without synthetic defaults', () => {
  const calaEntityId = 'cala-sparse-honest-test';
  try {
    const ingested = ingestLiveCalaEntities([
      {
        id: calaEntityId,
        name: 'Sparse Honest Systems Oy',
        entity_type: 'Company',
        description: 'A newly indexed technology company.',
        properties: {},
        relationships: { outgoing: {}, incoming: {} },
        numerical_observations: []
      }
    ]);

    assert.equal(ingested.ingestedCount, 1);
    const entity = ingested.companies[0];
    assert.equal(entity.employeeCount, null);
    assert.deepEqual(entity.employeeCountSeries, []);
    assert.deepEqual(entity.rounds, []);
    assert.doesNotMatch(JSON.stringify(entity), /2025-04-15|Apr 2025|Mikko Korhonen/i);
  } finally {
    removeLiveRecords(new Set([calaEntityId]));
  }
});

test('entity bridge map draws only verified relationships to its focal entity', () => {
  const anchor = {
    id: 'nvidia',
    name: 'NVIDIA',
    entityType: 'Organization',
    entityCategory: 'established_corp',
    relationships: { outgoing: {}, incoming: {} }
  };
  const unrelated = {
    id: 'openai',
    name: 'OpenAI',
    entityType: 'Organization',
    entityCategory: 'established_corp',
    relationships: { outgoing: {}, incoming: {} }
  };

  const withoutProof = buildEntityBridgeMap(anchor, [unrelated]);
  assert.equal(withoutProof.anchor.id, 'nvidia');
  assert.equal(
    withoutProof.edges.some((edge) =>
      (edge.from === 'nvidia' && edge.to === 'openai') || (edge.from === 'openai' && edge.to === 'nvidia')
    ),
    false,
    'An unrelated live entity must not acquire an anchor edge'
  );

  const verifiedAnchor = {
    ...anchor,
    relationships: {
      outgoing: {
        PARTNERED_WITH: [
          {
            id: 'openai',
            name: 'OpenAI',
            entity_type: 'Organization',
            properties: {
              sources: [{ name: 'Partner announcement', source_rank: 'PRIMARY' }]
            }
          }
        ]
      },
      incoming: {}
    }
  };
  const withProof = buildEntityBridgeMap(verifiedAnchor, [unrelated]);
  const verifiedEdge = withProof.edges.find(
    (edge) =>
      (edge.from === 'nvidia' && edge.to === 'openai') || (edge.from === 'openai' && edge.to === 'nvidia')
  );
  assert.ok(verifiedEdge, 'A verified Cala relationship should render an anchor edge');
  assert.equal(verifiedEdge.topSourceRank, 'PRIMARY');
  assert.match(verifiedEdge.label, /partnered/i);

  const multiCenterMap = buildEntityBridgeMap([verifiedAnchor, unrelated], [], { multiCenter: true });
  assert.deepEqual(multiCenterMap.focalEntityIds, ['nvidia', 'openai']);
  assert.ok(
    multiCenterMap.edges.some((edge) =>
      (edge.from === 'nvidia' && edge.to === 'openai') || (edge.from === 'openai' && edge.to === 'nvidia')
    ),
    'A verified direct relationship should remain visible when both entities are focal centers'
  );
});
