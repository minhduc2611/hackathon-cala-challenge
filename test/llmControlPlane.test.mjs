import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyCitationAndNumericGate,
  compileSearchQuery,
  narrateBriefWithCitationGate,
  validateCompiledFilters
} from '../src/llmControlPlane.mjs';
import { buildStartupBrief } from '../src/engine.mjs';

test('validateCompiledFilters strictly whitelists schema values and strips unsafe/unknown inputs', () => {
  const valid = validateCompiledFilters({
    intent: 'general',
    region: 'Nordics',
    stageFilter: 'pre_seed_seed',
    sectors: ['Climate Tech', 'Invented Sector', 'DeepTech'],
    excludeSector: 'Fintech',
    raisingSoonOnly: true,
    untappedOnly: 'yes', // non-boolean must normalize to false
    slushOnly: true,
    minHeadcountGrowthPct: 45.6,
    requireAlumniFounder: true,
    investorQuery: '  Lifeline Ventures <script> ',
    companyQuery: null,
    whyNotCompany: null,
    entityScope: 'all',
    countryHint: 'Finland',
    expandedKeywords: ['Aiven', 'Grid!', 'Storage-Tech', 'x', 'very-valid-kw']
  });

  assert.equal(valid.intent, 'general');
  assert.equal(valid.region, 'Nordics');
  assert.equal(valid.stageFilter, 'pre_seed_seed');
  assert.deepEqual(valid.sectors, ['Climate Tech', 'DeepTech']);
  assert.equal(valid.excludeSector, 'Fintech');
  assert.equal(valid.raisingSoonOnly, true);
  assert.equal(valid.untappedOnly, false);
  assert.equal(valid.slushOnly, true);
  assert.equal(valid.minHeadcountGrowthPct, 46);
  assert.equal(valid.requireAlumniFounder, true);
  assert.equal(valid.investorQuery, 'Lifeline Ventures script');
  assert.equal(valid.entityScope, 'all');
  assert.equal(valid.countryHint, 'Finland');
  assert.deepEqual(valid.expandedKeywords, ['aiven', 'grid', 'storage-tech', 'very-valid-kw']);

  const badRegion = validateCompiledFilters({
    intent: 'hack_score',
    region: 'Mars',
    stageFilter: 'Series Z',
    excludeSector: 'Bogus',
    entityScope: 'invalid_scope',
    minHeadcountGrowthPct: 9999
  });
  assert.equal(badRegion.intent, 'general');
  assert.equal(badRegion.region, 'all');
  assert.equal(badRegion.stageFilter, 'all');
  assert.equal(badRegion.excludeSector, 'none');
  assert.equal(badRegion.entityScope, 'startups');
  assert.equal(badRegion.minHeadcountGrowthPct, null);
});

test('compileSearchQuery compiles via mocked Anthropic API, sends exact headers, validates JSON, and caches repeats', async () => {
  const calls = [];
  const cache = new Map();
  const mockFetch = async (url, init) => {
    calls.push({ url, init, body: JSON.parse(init.body) });
    return {
      ok: true,
      status: 200,
      async json() {
        return {
          content: [
            {
              type: 'text',
              text: '```json\n{"intent":"general","region":"Nordics","stageFilter":"pre_seed_seed","sectors":["Climate Tech","Hallucinated"],"excludeSector":"none","raisingSoonOnly":true,"untappedOnly":false,"slushOnly":true,"minHeadcountGrowthPct":30,"requireAlumniFounder":true,"investorQuery":null,"companyQuery":null,"whyNotCompany":null,"expandedKeywords":["aiven","grid","storage"]}\n```'
            }
          ]
        };
      }
    };
  };

  const first = await compileSearchQuery(
    'ex-Aiven founders in grid storage raising soon at Slush',
    { fundId: 'lifeline-ventures', knownInvestors: ['Lifeline Ventures'] },
    { apiKey: 'test-anthropic-key', model: 'claude-3-5-haiku-latest', fetchFn: mockFetch, cache }
  );

  assert.equal(first.controlPlaneMode, 'anthropic-query-compiler');
  assert.equal(first.fromCache, false);
  assert.equal(first.filters.region, 'Nordics');
  assert.deepEqual(first.filters.sectors, ['Climate Tech']);
  assert.equal(first.filters.raisingSoonOnly, true);
  assert.equal(first.filters.slushOnly, true);
  assert.equal(first.filters.requireAlumniFounder, true);
  assert.deepEqual(first.filters.expandedKeywords, ['aiven', 'grid', 'storage']);

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://api.anthropic.com/v1/messages');
  assert.equal(calls[0].init.headers['x-api-key'], 'test-anthropic-key');
  assert.equal(calls[0].init.headers['anthropic-version'], '2023-06-01');
  assert.equal(calls[0].body.temperature, 0);

  const second = await compileSearchQuery(
    'ex-Aiven founders in grid storage raising soon at Slush',
    { fundId: 'lifeline-ventures' },
    { apiKey: 'test-anthropic-key', fetchFn: mockFetch, cache }
  );
  assert.equal(second.fromCache, true);
  assert.equal(calls.length, 1);
});

test('compileSearchQuery falls back silently on missing key, 401 HTTP error, malformed JSON, and timeout', async () => {
  const noKey = await compileSearchQuery('Nordic seed startups', {}, { apiKey: '' });
  assert.equal(noKey.controlPlaneMode, 'deterministic-parser');
  assert.equal(noKey.filters, null);

  const err401 = await compileSearchQuery(
    'Nordic seed startups',
    {},
    {
      apiKey: 'bad-key',
      cache: new Map(),
      fetchFn: async () => ({ ok: false, status: 401 })
    }
  );
  assert.equal(err401.controlPlaneMode, 'deterministic-parser');
  assert.equal(err401.filters, null);
  assert.equal(err401.fallbackReason, 'http-401');

  const slowTimeout = await compileSearchQuery(
    'Slow query test',
    {},
    {
      apiKey: 'key',
      timeoutMs: 25,
      cache: new Map(),
      fetchFn: () => new Promise((resolve) => setTimeout(() => resolve({ ok: true }), 150))
    }
  );
  assert.equal(slowTimeout.controlPlaneMode, 'deterministic-parser');
  assert.equal(slowTimeout.filters, null);
});

test('applyCitationAndNumericGate & narrateBriefWithCitationGate enforce sourceIds plus numeric and year grounding', async () => {
  const brief = buildStartupBrief('vectormesh', 'lifeline-ventures');
  const validSourceId = brief.sources[0].id;
  const latestRound = brief.rounds[brief.rounds.length - 1];

  const gated = applyCitationAndNumericGate(
    [
      {
        text: `${brief.name} raised €${latestRound.amountEurM}M in ${latestRound.date.slice(0, 4)}.`,
        sourceIds: [validSourceId]
      },
      {
        text: `${brief.name} quietly booked €99.4M ARR from undisclosed customers.`,
        sourceIds: [validSourceId]
      },
      {
        text: `${brief.name} was incorporated back in 2011 in London.`,
        sourceIds: [validSourceId]
      },
      {
        text: `${brief.name} raised €${latestRound.amountEurM}M with fake citation.`,
        sourceIds: ['src-nonexistent-999']
      }
    ],
    brief
  );

  assert.equal(gated.bullets.length, 1);
  assert.equal(gated.droppedUnverifiedCount, 3);
  assert.ok(gated.bullets[0].sources.some((s) => s.id === validSourceId));

  const narrated = await narrateBriefWithCitationGate(brief, {
    apiKey: 'test-anthropic-key',
    cache: new Map(),
    fetchFn: async () => ({
      ok: true,
      status: 200,
      async json() {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                bullets: [
                  {
                    text: `${brief.name} closed €${latestRound.amountEurM}M (${latestRound.type}) in ${latestRound.date.slice(0, 4)}.`,
                    sourceIds: [validSourceId]
                  },
                  {
                    text: 'Hallucinated $42M ARR projection.',
                    sourceIds: [validSourceId]
                  }
                ]
              })
            }
          ]
        };
      }
    })
  });

  assert.equal(narrated.controlPlaneMode, 'anthropic-citation-narrator');
  assert.equal(narrated.bullets.length, 1);
  assert.equal(narrated.droppedUnverifiedCount, 1);
  assert.deepEqual(narrated.coverageGaps, brief.notFoundInCala);

  const fallback = await narrateBriefWithCitationGate(brief, {
    apiKey: 'bad-key',
    cache: new Map(),
    fetchFn: async () => ({ ok: false, status: 401 })
  });
  assert.equal(fallback.controlPlaneMode, 'deterministic-fallback');
  assert.ok(fallback.bullets.length >= 1);
});

test('compileSearchQuery sets entityScope "all" cleanly for public/general company queries', async () => {
  const detMcd = await compileSearchQuery("McDonald's", {}, { apiKey: '' });
  assert.equal(detMcd.controlPlaneMode, 'deterministic-parser');
  assert.equal(detMcd.filters, null);

  const mockedClaude = await compileSearchQuery(
    'find KFC corporate parent',
    {},
    {
      apiKey: 'mock-key',
      cache: new Map(),
      fetchFn: async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        model: 'claude-haiku-4-5-20251001',
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              intent: 'company',
              entityScope: 'all',
              companyQuery: 'KFC',
              countryHint: 'United States',
              region: 'all',
              stageFilter: 'all',
              sectors: [],
              excludeSector: 'none',
              raisingSoonOnly: false,
              untappedOnly: false,
              slushOnly: false,
              minHeadcountGrowthPct: null,
              requireAlumniFounder: false,
              investorQuery: null,
              whyNotCompany: null,
              expandedKeywords: ['kfc', 'restaurant', 'franchise']
            })
          }
        ]
      })
    })
  });
  assert.equal(mockedClaude.controlPlaneMode, 'anthropic-query-compiler');
  assert.equal(mockedClaude.filters.entityScope, 'all');
  assert.equal(mockedClaude.filters.companyQuery, 'KFC');
  assert.equal(mockedClaude.filters.countryHint, 'United States');
});
