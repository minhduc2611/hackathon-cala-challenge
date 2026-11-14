import http from 'node:http';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { COMPANIES, FUNDS, REFERENCE_DATE, SOURCES } from './src/data.mjs';
import { createCalaClient, loadEnvFile } from './src/calaClient.mjs';
import {
  buildStartupBrief,
  ingestLiveCalaEntities,
  refineShortlist,
  runFullAnalysis,
  searchEntities
} from './src/engine.mjs';

loadEnvFile();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PUBLIC_DIR = path.join(__dirname, 'public');
const CALA_CACHE_FILE = path.join(__dirname, '.cache', 'cala-cache.json');
const SLUSH_2026_ENTITY_ID = 'bc844d56-6ab4-452b-96bf-2661e86e592b';

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png'
};

const analysisCache = new Map();

const ENTITY_LEGAL_SUFFIX_RE = /\b(?:oyj|oy|ab|aps|a\/s|as|ltd|limited|plc|inc|corp|corporation|gmbh|ag|s\.a\.s|sas|sarl|b\.v\.|bv|llc|oü)\b\.?/gi;

function normalizeEntityCoreName(name = '') {
  return String(name || '')
    .toLowerCase()
    .replace(ENTITY_LEGAL_SUFFIX_RE, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isStrongEntityNameMatch(queryName = '', candName = '') {
  const qCore = normalizeEntityCoreName(queryName);
  const cCore = normalizeEntityCoreName(candName);
  if (!qCore || !cCore) return false;
  if (qCore === cCore) return true;
  const qTokens = qCore.split(' ').filter((t) => t.length >= 2);
  const cTokens = cCore.split(' ').filter((t) => t.length >= 2);
  if (!qTokens.length || !cTokens.length) return false;
  if (qTokens.length === 1) {
    return cTokens[0] === qTokens[0] || (cTokens.includes(qTokens[0]) && cTokens.length <= 2);
  }
  return qTokens.every((t) => cTokens.includes(t));
}

function pickBestCalaEntity(entities = [], preferredType = 'Organization', queryName = '') {
  if (!entities.length) return null;
  const pool = queryName
    ? entities.filter((e) => isStrongEntityNameMatch(queryName, e?.name || ''))
    : entities;
  if (!pool.length) return null;
  const exactType = pool.find((e) => e.entity_type === preferredType);
  return exactType || pool[0];
}

function summarizeLiveCalaEntity(entityData) {
  if (!entityData) return null;
  const props = entityData.properties || {};
  const outgoing = entityData.relationships?.outgoing || {};
  const incoming = entityData.relationships?.incoming || {};

  const investedIn = (outgoing.INVESTED_IN || []).map((c) => ({
    id: c.id,
    name: c.name,
    entityType: c.entity_type,
    sources: (c.properties?.sources || []).slice(0, 2)
  }));

  const rawPartRounds = outgoing.PARTICIPATES_IN_FUNDING_ROUND || [];
  const issuerRounds = rawPartRounds
    .filter((r) => !r.properties?.role || r.properties.role === 'ISSUER')
    .map((r) => ({
      id: r.id,
      roundType: r.name,
      role: r.properties?.role || 'ISSUER',
      isLead: Boolean(r.properties?.is_lead),
      eventDate: r.properties?.event_date || null,
      transactionValue: r.properties?.transaction_value ?? null,
      transactionValueUnits: r.properties?.transaction_value_units || null,
      sources: (r.properties?.sources || []).slice(0, 2)
    }));

  const fundingRounds = rawPartRounds.map((r) => ({
    id: r.id,
    roundType: r.name,
    role: r.properties?.role || 'INVESTOR',
    isLead: Boolean(r.properties?.is_lead),
    eventDate: r.properties?.event_date || null,
    sources: (r.properties?.sources || []).slice(0, 2)
  }));

  const raisedRounds = (incoming.PARTICIPATES_IN_FUNDING_ROUND || outgoing.HAS_FUNDING_ROUND || []).map((r) => ({
    id: r.id,
    roundType: r.name,
    role: r.properties?.role || 'ISSUER',
    eventDate: r.properties?.event_date || null,
    sources: (r.properties?.sources || []).slice(0, 2)
  }));

  const corpEvents = (outgoing.PARTICIPATES_IN_CORPORATE_EVENT || []).map((ev) => {
    const evDate = ev.properties?.event_date || null;
    const matchedIssuer = issuerRounds.some((r) => r.eventDate && evDate && r.eventDate.slice(0, 7) === evDate.slice(0, 7));
    return {
      id: ev.id,
      name: ev.name,
      role: ev.properties?.role || null,
      eventDate: evDate,
      deduplicatedAgainstRound: matchedIssuer,
      sources: (ev.properties?.sources || []).slice(0, 2)
    };
  });

  const eventsAttended = [
    ...(outgoing.PARTICIPATES_IN_EVENT || []).map((ev) => ({
      id: ev.id,
      name: ev.name,
      role: ev.properties?.role || 'ATTENDEE',
      sources: (ev.properties?.sources || []).slice(0, 2)
    })),
    ...(incoming.PARTICIPATES_IN_EVENT || []).map((co) => ({
      id: co.id,
      name: co.name,
      entityType: co.entity_type,
      role: co.properties?.role || 'ATTENDEE',
      sources: (co.properties?.sources || []).slice(0, 2)
    }))
  ];

  const leadership = [
    ...(incoming.FOUNDED || []).map((p) => ({ id: p.id, name: p.name, relation: 'FOUNDED', role: 'Founder', validSince: p.properties?.valid_since || null })),
    ...(incoming.IS_CEO_OF || []).map((p) => ({ id: p.id, name: p.name, relation: 'IS_CEO_OF', role: 'CEO', validSince: p.properties?.valid_since || null, validUntil: p.properties?.valid_until || null })),
    ...(incoming.IS_CTO_OF || []).map((p) => ({ id: p.id, name: p.name, relation: 'IS_CTO_OF', role: 'CTO', validSince: p.properties?.valid_since || null, validUntil: p.properties?.valid_until || null })),
    ...(incoming.IS_BOARD_MEMBER_OF || []).map((p) => ({ id: p.id, name: p.name, relation: 'IS_BOARD_MEMBER_OF', role: 'Board Member', validSince: p.properties?.valid_since || null }))
  ];

  const worksAt = (incoming.WORKS_AT || []).map((p) => ({
    id: p.id,
    name: p.name,
    role: p.properties?.role || 'Team member'
  }));

  const numericalObservations = Array.isArray(entityData.numerical_observations)
    ? entityData.numerical_observations.slice(0, 12)
    : [];

  return {
    id: entityData.id,
    name: entityData.name,
    legalName: props.legal_name?.value || null,
    legalNameSources: (props.legal_name?.sources || []).slice(0, 2),
    entityType: entityData.entity_type,
    description: entityData.description,
    website: props.website?.value || null,
    address: props.registered_address?.value || props.headquarters_address?.value || null,
    operationalStatus: props.operational_status?.value || null,
    ownershipStatus: props.company_ownership_status?.value || null,
    fundingStage: props.funding_stage?.value || null,
    foundingDate: props.founding_date?.value || null,
    foundingDatePrecision: props.founding_date?.sources?.[0]?.date_precision || null,
    employeeCountRange: props.employee_count_range?.value || null,
    totalFunding: props.total_funding?.value ?? null,
    totalFundingUnits: props.total_funding_units?.value || null,
    totalFundingExcludingDebt: props.total_funding_excluding_debt?.value ?? null,
    investedInCount: investedIn.length,
    investedIn: investedIn.slice(0, 12),
    fundingRoundsCount: fundingRounds.length,
    issuerRoundsCount: issuerRounds.length,
    leadRoundsCount: fundingRounds.filter((r) => r.isLead).length,
    issuerRounds: issuerRounds.slice(0, 10),
    fundingRounds: fundingRounds.slice(0, 12),
    raisedRounds: raisedRounds.slice(0, 10),
    corporateEvents: corpEvents.slice(0, 8),
    eventsAttended: eventsAttended.slice(0, 25),
    leadership: leadership.slice(0, 10),
    worksAt: worksAt.slice(0, 8),
    numericalObservations
  };
}

function getCachedAnalysis(payload) {
  const key = JSON.stringify({
    mode: payload.mode || 'fund',
    fundId: payload.fundId || null,
    companyIds: Array.isArray(payload.companyIds) ? [...payload.companyIds].sort() : [],
    rankingMode: payload.rankingMode || 'balanced',
    statedThesisOverride: payload.statedThesisOverride || '',
    seenCompanyNames: Array.isArray(payload.seenCompanyNames) ? [...payload.seenCompanyNames].sort() : []
  });

  if (analysisCache.has(key)) {
    return { ...analysisCache.get(key), cacheHit: true };
  }
  const result = runFullAnalysis(
    {
      mode: payload.mode || 'fund',
      fundId: payload.fundId,
      companyIds: payload.companyIds
    },
    {
      rankingMode: payload.rankingMode || 'balanced',
      statedThesisOverride: payload.statedThesisOverride || '',
      seenCompanyNames: payload.seenCompanyNames || []
    }
  );
  if (analysisCache.size > 60) {
    const firstKey = analysisCache.keys().next().value;
    analysisCache.delete(firstKey);
  }
  analysisCache.set(key, result);
  return { ...result, cacheHit: false };
}

function sendJson(res, statusCode, body) {
  const json = JSON.stringify(body);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(json),
    'Cache-Control': 'no-store'
  });
  res.end(json);
}

async function readJsonBody(req) {
  const chunks = [];
  let totalBytes = 0;
  for await (const chunk of req) {
    totalBytes += chunk.length;
    if (totalBytes > 512 * 1024) {
      const err = new Error('Request payload exceeds 512KB limit.');
      err.statusCode = 413;
      throw err;
    }
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    const err = new Error('Invalid JSON payload.');
    err.statusCode = 400;
    throw err;
  }
}

async function serveStatic(res, reqPathname) {
  const safePath = reqPathname === '/' ? '/index.html' : reqPathname;
  const resolved = path.resolve(PUBLIC_DIR, `.${safePath}`);
  if (!resolved.startsWith(PUBLIC_DIR)) {
    sendJson(res, 403, { error: 'Forbidden path.' });
    return;
  }
  try {
    const stat = await fs.stat(resolved);
    if (!stat.isFile()) {
      sendJson(res, 404, { error: 'Not found.' });
      return;
    }
    const ext = path.extname(resolved).toLowerCase();
    const content = await fs.readFile(resolved);
    res.writeHead(200, {
      'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
      'Content-Length': content.length
    });
    res.end(content);
  } catch {
    sendJson(res, 404, { error: 'Resource not found.' });
  }
}

export function hydrateEntitiesFromDiskCache(cacheFile = CALA_CACHE_FILE) {
  try {
    if (!fsSync.existsSync(cacheFile)) return { ingestedCount: 0, enrichedCount: 0 };
    const store = JSON.parse(fsSync.readFileSync(cacheFile, 'utf8'));
    let totalIngested = 0;
    let totalEnriched = 0;

    for (const entry of Object.values(store || {})) {
      const data = entry?.data;
      if (!data) continue;
      const apiPath = String(entry.apiPath || '');
      const isSlush = apiPath.includes(SLUSH_2026_ENTITY_ID);
      if (data.id && data.entity_type === 'Company') {
        const r = ingestLiveCalaEntities([data], { slush2026: isSlush });
        totalIngested += r.ingestedCount;
        totalEnriched += r.enrichedCount;
      }
      if (apiPath === '/v1/knowledge/search' && Array.isArray(data.entities)) {
        const r = ingestLiveCalaEntities(data.entities, { slush2026: isSlush });
        totalIngested += r.ingestedCount;
        totalEnriched += r.enrichedCount;
      }
      const invested = data.relationships?.outgoing?.INVESTED_IN || [];
      if (invested.length) {
        const matchedFund = FUNDS.find((f) => f.name.toLowerCase() === String(data.name || '').toLowerCase());
        const r = ingestLiveCalaEntities(invested, matchedFund ? { investorId: matchedFund.id } : {});
        totalIngested += r.ingestedCount;
        totalEnriched += r.enrichedCount;
      }
      const eventCompanies = data.relationships?.incoming?.PARTICIPATES_IN_EVENT || [];
      if (eventCompanies.length) {
        const r = ingestLiveCalaEntities(eventCompanies, { slush2026: isSlush });
        totalIngested += r.ingestedCount;
        totalEnriched += r.enrichedCount;
      }
    }
    return { ingestedCount: totalIngested, enrichedCount: totalEnriched };
  } catch {
    return { ingestedCount: 0, enrichedCount: 0 };
  }
}

async function retrieveEntityWithIntrospection(calaClient, entityId, incomingEventLimit = 20) {
  const introRes = await calaClient.calaIntrospect(entityId);
  const outgoingMap = {};
  for (const rel of introRes.data?.relationships?.outgoing || []) {
    outgoingMap[rel] = { limit: 20, offset: 0 };
  }
  const incomingMap = {};
  for (const rel of introRes.data?.relationships?.incoming || []) {
    incomingMap[rel] = { limit: rel === 'PARTICIPATES_IN_EVENT' ? incomingEventLimit : 20, offset: 0 };
  }
  const retrieveBody = {
    properties: introRes.data?.properties || ['name', 'description'],
    relationships: { outgoing: outgoingMap, incoming: incomingMap }
  };
  if (Array.isArray(introRes.data?.numerical_observations) && introRes.data.numerical_observations.length > 0) {
    retrieveBody.numerical_observations = introRes.data.numerical_observations;
  }
  const entityRes = await calaClient.calaRetrieveEntity(entityId, retrieveBody);
  return { introRes, entityRes };
}

function extractCleanCalaSearchQuery(rawQuery) {
  const cleaned = String(rawQuery || '')
    .replace(/\b(find|show|give|list|recommend|which|what|who|startups?|companies?|raising|soon|in|under|below|employees|staff|people|headcount|fast|growth|velocity|feeder|syndicate|filing|signal|alumni|founder|only|warm|warmest|intro|bridge|slush|2026)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned.length >= 2 ? cleaned : String(rawQuery || '').trim();
}

async function deepHydrateCalaEntities(calaClient, entityIds = [], context = {}) {
  let discoveredCount = 0;
  let enrichedCount = 0;
  for (const id of entityIds) {
    if (!id) continue;
    try {
      const { entityRes } = await retrieveEntityWithIntrospection(calaClient, id);
      if (entityRes?.data) {
        const deepIng = ingestLiveCalaEntities([entityRes.data], context);
        discoveredCount += deepIng.ingestedCount;
        enrichedCount += deepIng.enrichedCount;
      }
    } catch {
      // Best-effort deep hydration
    }
  }
  return { discoveredCount, enrichedCount };
}

async function discoverStartupsFromCala(calaClient, { queryText = '', mode = 'ecosystem' } = {}) {
  let discoveredCount = 0;
  let enrichedCount = 0;
  let knowledgeAnswer = null;
  const cleanQ = String(queryText || '').trim();

  if (mode === 'ecosystem' || /slush/i.test(cleanQ)) {
    try {
      const eventRes = await calaClient.calaRetrieveEntity(SLUSH_2026_ENTITY_ID, {
        properties: ['name', 'description'],
        relationships: { incoming: { PARTICIPATES_IN_EVENT: { limit: 100, offset: 0 } } }
      });
      const attendees = (eventRes.data?.relationships?.incoming?.PARTICIPATES_IN_EVENT || [])
        .filter((e) => !e.entity_type || e.entity_type === 'Company')
        .slice(0, 60);
      const ing = ingestLiveCalaEntities(attendees, { slush2026: true });
      discoveredCount += ing.ingestedCount;
      enrichedCount += ing.enrichedCount;

      const deep = await deepHydrateCalaEntities(
        calaClient,
        ing.companies.slice(0, 3).map((c) => c.calaEntityId),
        { slush2026: true }
      );
      discoveredCount += deep.discoveredCount;
      enrichedCount += deep.enrichedCount;
    } catch {
      // Non-fatal in offline/budget-restricted runs
    }
  }

  if (cleanQ) {
    const searchTerm = extractCleanCalaSearchQuery(cleanQ);
    let directHits = [];
    if (searchTerm.length >= 2 && !/^(slush|2026)$/i.test(searchTerm)) {
      try {
        const searchRes = await calaClient.calaEntitySearch(searchTerm, 10, ['Company']);
        directHits = searchRes.data?.entities || [];
        const ing = ingestLiveCalaEntities(directHits);
        discoveredCount += ing.ingestedCount;
        enrichedCount += ing.enrichedCount;

        const deep = await deepHydrateCalaEntities(
          calaClient,
          directHits.filter((e) => !e.entity_type || e.entity_type === 'Company').slice(0, 2).map((e) => e.id)
        );
        discoveredCount += deep.discoveredCount;
        enrichedCount += deep.enrichedCount;
      } catch {
        // Non-fatal in offline/test environments
      }
    }

    if (cleanQ.split(/\s+/).length >= 2) {
      try {
        const ksRes = await calaClient.calaKnowledgeSearch(cleanQ, {
          explainability: true,
          returnEntities: true
        });
        knowledgeAnswer = ksRes.data || null;
        const ksEntities = Array.isArray(knowledgeAnswer?.entities) ? knowledgeAnswer.entities : [];
        if (ksEntities.length > 0) {
          const ksIng = ingestLiveCalaEntities(ksEntities, { allowOrganizations: true });
          discoveredCount += ksIng.ingestedCount;
          enrichedCount += ksIng.enrichedCount;

          if (directHits.length === 0) {
            const ksCompanyIds = ksEntities
              .filter((e) => e.entity_type === 'Company' || e.entity_type === 'Organization')
              .slice(0, 2)
              .map((e) => e.id);
            const deep = await deepHydrateCalaEntities(calaClient, ksCompanyIds, { allowOrganizations: true });
            discoveredCount += deep.discoveredCount;
            enrichedCount += deep.enrichedCount;
          }
        }
      } catch {
        // Non-fatal knowledge search escalation
      }
    }
  }

  if (discoveredCount > 0 || enrichedCount > 0) {
    analysisCache.clear();
  }

  return { discoveredCount, enrichedCount, knowledgeAnswer };
}

export function createAppServer(options = {}) {
  const calaClient = options.calaClient || createCalaClient({ maxLiveCalls: options.maxLiveCalls ?? 250 });

  return http.createServer(async (req, res) => {
    try {
      const reqUrl = new URL(req.url || '/', 'http://127.0.0.1');
      const pathname = reqUrl.pathname;

      if (req.method === 'GET' && pathname === '/api/bootstrap') {
        sendJson(res, 200, {
          referenceDate: REFERENCE_DATE,
          funds: FUNDS.map((f) => ({
            id: f.id,
            calaEntityId: f.calaEntityId,
            name: f.name,
            hqCity: f.hqCity,
            country: f.country,
            region: f.region,
            teamSize: f.teamSize,
            statedThesis: f.statedThesis
          })),
          companies: COMPANIES.map((c) => ({
            id: c.id,
            name: c.name,
            sector: c.sector,
            country: c.country,
            region: c.region,
            latestStage: c.rounds[c.rounds.length - 1]?.type || 'Seed'
          })),
          coverageStats: {
            fundsIndexed: FUNDS.length,
            companiesIndexed: COMPANIES.length,
            roundsIndexed: COMPANIES.reduce((s, c) => s + c.rounds.length, 0),
            sourcesIndexed: Object.keys(SOURCES).length,
            companiesHouseIndexed: COMPANIES.filter((c) => Boolean(c.companiesHouseNumber)).length,
            timeSeriesPointsIndexed: COMPANIES.reduce((s, c) => s + (c.employeeCountSeries?.length || 0), 0),
            liveCalaConfigured: Boolean(process.env.CALA_API_KEY),
            calaBudget: calaClient.getBudgetStatus()
          }
        });
        return;
      }

      if (req.method === 'GET' && pathname === '/api/cala-budget') {
        sendJson(res, 200, calaClient.getBudgetStatus());
        return;
      }

      if (req.method === 'POST' && pathname === '/api/cala-verify') {
        const body = await readJsonBody(req);
        const name = String(body.name || '').trim();
        const type = body.type === 'company' ? 'company' : body.type === 'event' ? 'event' : 'fund';
        const includeKnowledgeSearch = Boolean(body.includeKnowledgeSearch);
        if (!name) {
          sendJson(res, 400, { error: 'Missing required field: name.' });
          return;
        }

        const searchTypes = type === 'event' ? ['Event'] : [];
        const searchRes = await calaClient.calaEntitySearch(name, 5, searchTypes);
        const candidates = searchRes.data?.entities || [];
        const preferredType = type === 'event' ? 'Event' : type === 'fund' ? 'Organization' : 'Company';
        const matched = pickBestCalaEntity(candidates, preferredType, name);

        let introRes = null;
        let entityRes = null;
        let liveSummary = null;
        let knowledgeRes = null;

        if (matched) {
          const retrieved = await retrieveEntityWithIntrospection(calaClient, matched.id, type === 'event' ? 100 : 20);
          introRes = retrieved.introRes;
          entityRes = retrieved.entityRes;
          liveSummary = summarizeLiveCalaEntity(entityRes.data);
        }

        if (includeKnowledgeSearch) {
          const prompt =
            type === 'fund'
              ? `What companies and funding rounds has ${name} invested in recently?`
              : `What is the complete funding history, round dates, amounts, and investors of ${name}?`;
          knowledgeRes = await calaClient.calaKnowledgeSearch(prompt);
        }

        const verifyPool = [
          ...(entityRes?.data?.entity_type === 'Company' ? [entityRes.data] : []),
          ...(entityRes?.data?.relationships?.incoming?.PARTICIPATES_IN_EVENT || []),
          ...(knowledgeRes?.data?.entities || [])
        ].filter(Boolean);
        const verifyIng = ingestLiveCalaEntities(verifyPool, {
          slush2026: type === 'event' || /slush/i.test(name)
        });
        const fundMatch = FUNDS.find((f) => f.name.toLowerCase() === String(entityRes?.data?.name || name || '').toLowerCase());
        const invPool = entityRes?.data?.relationships?.outgoing?.INVESTED_IN || [];
        const invIng = invPool.length
          ? ingestLiveCalaEntities(invPool, fundMatch ? { investorId: fundMatch.id } : {})
          : { ingestedCount: 0, enrichedCount: 0 };
        if (verifyIng.ingestedCount > 0 || verifyIng.enrichedCount > 0 || invIng.ingestedCount > 0 || invIng.enrichedCount > 0) {
          analysisCache.clear();
        }

        const anyLiveCall =
          !searchRes.fromCache ||
          (introRes && !introRes.fromCache) ||
          (entityRes && !entityRes.fromCache) ||
          (knowledgeRes && !knowledgeRes.fromCache);

        sendJson(res, 200, {
          queryName: name,
          type,
          fromCache: !anyLiveCall,
          matchedEntity: matched,
          candidateEntities: candidates,
          introspection: introRes?.data || null,
          liveSummary,
          knowledgeAnswer: knowledgeRes?.data || null,
          budget: calaClient.getBudgetStatus()
        });
        return;
      }

      if (req.method === 'GET' && pathname === '/api/search') {
        const q = reqUrl.searchParams.get('q') || '';
        sendJson(res, 200, searchEntities(q));
        return;
      }

      if (req.method === 'POST' && pathname === '/api/analyze') {
        const body = await readJsonBody(req);
        const result = getCachedAnalysis(body);
        const { allRanked, ...publicPayload } = result;
        sendJson(res, 200, {
          ...publicPayload,
          calaBudget: calaClient.getBudgetStatus()
        });
        return;
      }

      if (req.method === 'GET' && pathname === '/api/brief') {
        const startupId = reqUrl.searchParams.get('startupId');
        const fundId = reqUrl.searchParams.get('fundId');
        if (!startupId) {
          sendJson(res, 400, { error: 'Missing required query parameter: startupId.' });
          return;
        }
        const brief = buildStartupBrief(startupId, fundId);
        sendJson(res, 200, brief);
        return;
      }

      if (req.method === 'POST' && pathname === '/api/cala-discover') {
        const body = await readJsonBody(req);
        const discovery = await discoverStartupsFromCala(calaClient, {
          queryText: body.queryText || '',
          fundId: body.fundId,
          mode: body.mode || 'ecosystem'
        });
        const analysis = getCachedAnalysis(body);
        const { allRanked, ...publicPayload } = analysis;
        const refined = body.queryText
          ? refineShortlist(analysis.thesis, allRanked, {
              region: body.region,
              stageFilter: body.stageFilter,
              excludeSector: body.excludeSector,
              raisingSoonOnly: body.raisingSoonOnly,
              untappedOnly: body.untappedOnly,
              highVelocityOnly: body.highVelocityOnly,
              feederOnly: body.feederOnly,
              filingOnly: body.filingOnly,
              alumniOnly: body.alumniOnly,
              sectors: body.sectors,
              countries: body.countries,
              maxEmployees: body.maxEmployees,
              slush2026Only: body.slush2026Only,
              preferWarm: body.preferWarm,
              queryText: body.queryText
            })
          : null;

        sendJson(res, 200, {
          ...publicPayload,
          shortlist: refined ? refined.shortlist : publicPayload.shortlist,
          discoveredCount: discovery.discoveredCount,
          enrichedCount: discovery.enrichedCount,
          knowledgeAnswer: discovery.knowledgeAnswer,
          totalCompaniesIndexed: COMPANIES.length,
          calaBudget: calaClient.getBudgetStatus()
        });
        return;
      }

      if (req.method === 'POST' && pathname === '/api/refine') {
        const body = await readJsonBody(req);
        let liveDiscoveredCount = 0;
        let knowledgeAnswer = null;
        if (body.discoverLive === true && body.queryText && !/^\s*why not\s+/i.test(String(body.queryText))) {
          try {
            const discovery = await discoverStartupsFromCala(calaClient, {
              queryText: body.queryText,
              fundId: body.fundId,
              mode: 'query'
            });
            liveDiscoveredCount = discovery.discoveredCount;
            knowledgeAnswer = discovery.knowledgeAnswer;
          } catch {
            // Non-fatal in offline/test environments
          }
        }
        const analysis = getCachedAnalysis(body);
        const refined = refineShortlist(analysis.thesis, analysis.allRanked, {
          region: body.region,
          stageFilter: body.stageFilter,
          excludeSector: body.excludeSector,
          raisingSoonOnly: body.raisingSoonOnly,
          untappedOnly: body.untappedOnly,
          highVelocityOnly: body.highVelocityOnly,
          feederOnly: body.feederOnly,
          filingOnly: body.filingOnly,
          alumniOnly: body.alumniOnly,
          sectors: body.sectors,
          countries: body.countries,
          maxEmployees: body.maxEmployees,
          slush2026Only: body.slush2026Only,
          preferWarm: body.preferWarm,
          limit: body.limit,
          queryText: body.queryText
        });
        sendJson(res, 200, {
          ...refined,
          liveDiscoveredCount,
          knowledgeAnswer,
          totalCompaniesIndexed: COMPANIES.length,
          calaBudget: calaClient.getBudgetStatus()
        });
        return;
      }

      if (req.method === 'GET') {
        await serveStatic(res, pathname);
        return;
      }

      sendJson(res, 405, { error: 'Method not allowed.' });
    } catch (err) {
      const status = err.statusCode || 500;
      sendJson(res, status, { error: err.message || 'Internal server error.' });
    }
  });
}

const isEntrypoint = process.argv[1] && path.resolve(process.argv[1]) === __filename;
if (isEntrypoint) {
  hydrateEntitiesFromDiskCache();
  const port = Number(process.env.PORT) || 4173;
  const server = createAppServer();
  server.listen(port, '127.0.0.1', () => {
    console.log(`Revealed Thesis Engine listening on http://127.0.0.1:${port}`);
  });
}
