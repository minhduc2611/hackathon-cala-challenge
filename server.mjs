import http from 'node:http';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { COMPANIES, FUNDS, PEER_INVESTORS, REFERENCE_DATE, SOURCES } from './src/data.mjs';
import { createCalaClient, loadEnvFile } from './src/calaClient.mjs';
import { createRegistryClient, extractRegistryLookupTerm } from './src/registryClient.mjs';
import { compileSearchQuery, narrateBriefWithCitationGate } from './src/llmControlPlane.mjs';
import {
  buildStartupBrief,
  ingestLiveCalaEntities,
  ingestRegistryEntities,
  refineShortlist,
  runFullAnalysis,
  searchEntities
} from './src/engine.mjs';
import { buildEntityMap, buildEntityMapFromCala, searchLocalEntities } from './src/entityMap.mjs';

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
    .replace(/['’`]/g, '')
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
    ...(incoming.IS_BOARD_MEMBER_OF || []).map((p) => ({ id: p.id, name: p.name, relation: 'IS_BOARD_MEMBER_OF', role: 'Board Member', validSince: p.properties?.valid_since || null })),
    ...(incoming.IS_CONTROL_PERSON_OF || []).map((p) => ({ id: p.id, name: p.name, relation: 'IS_CONTROL_PERSON_OF', role: 'Control Person', validSince: p.properties?.valid_since || null })),
    ...(incoming.IS_BENEFICIARY_OWNER_OF || []).map((p) => ({ id: p.id, name: p.name, relation: 'IS_BENEFICIARY_OWNER_OF', role: 'Beneficial Owner', validSince: p.properties?.valid_since || null }))
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
  const entityScope = payload.entityScope === 'all' ? 'all' : 'startups';
  const hideMegaHubs = payload.hideMegaHubs !== undefined ? Boolean(payload.hideMegaHubs) : true;
  const bridgeFamily = String(payload.bridgeFamily || 'all').trim().toLowerCase() || 'all';
  const contributionGroup = String(payload.contributionGroup || 'all').trim().toLowerCase() || 'all';
  const includeCompanyNames = Array.isArray(payload.includeCompanyNames)
    ? [...payload.includeCompanyNames].sort()
    : [];
  const key = JSON.stringify({
    mode: payload.mode || 'fund',
    fundId: payload.fundId || null,
    companyIds: Array.isArray(payload.companyIds) ? [...payload.companyIds].sort() : [],
    rankingMode: payload.rankingMode || 'balanced',
    statedThesisOverride: payload.statedThesisOverride || '',
    seenCompanyNames: Array.isArray(payload.seenCompanyNames) ? [...payload.seenCompanyNames].sort() : [],
    entityScope,
    includeCompanyNames,
    hideMegaHubs,
    bridgeFamily,
    contributionGroup
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
      seenCompanyNames: payload.seenCompanyNames || [],
      entityScope,
      includeCompanyNames,
      hideMegaHubs,
      bridgeFamily,
      contributionGroup
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
  const rawNumObs = introRes.data?.numerical_observations;
  if (Array.isArray(rawNumObs) && rawNumObs.length > 0) {
    retrieveBody.numerical_observations = rawNumObs;
  } else if (rawNumObs && typeof rawNumObs === 'object') {
    const mappedNumObs = {};
    for (const [obsType, entries] of Object.entries(rawNumObs)) {
      if (!Array.isArray(entries) || entries.length === 0) continue;
      const ids = entries.map((entry) => (typeof entry === 'string' ? entry : entry?.id)).filter(Boolean);
      if (ids.length > 0) mappedNumObs[obsType] = ids;
    }
    if (Object.keys(mappedNumObs).length > 0) {
      retrieveBody.numerical_observations = mappedNumObs;
    }
  }
  const entityRes = await calaClient.calaRetrieveEntity(entityId, retrieveBody);
  return { introRes, entityRes };
}

function extractCleanCalaSearchQuery(rawQuery) {
  const cleaned = String(rawQuery || '')
    .replace(/^(company|investor|person|founder|similar to):\s*/i, '')
    .replace(/\b(find|show|give|list|recommend|which|what|who|startups?|companies?|raising|soon|in|under|below|employees|staff|people|headcount|fast|growth|velocity|feeder|syndicate|filing|signal|alumni|founder|only|warm|warmest|intro|bridge|slush|2026)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned.length >= 2 ? cleaned : String(rawQuery || '').trim();
}

const PERSON_CONNECTED_REL_LABELS = {
  FOUNDED: 'Founder',
  IS_CEO_OF: 'Chief Executive Officer',
  IS_CTO_OF: 'Chief Technology Officer',
  IS_CFO_OF: 'Chief Financial Officer',
  IS_COO_OF: 'Chief Operating Officer',
  IS_VICEPRESIDENT_OF: 'Vice President',
  IS_BOARD_MEMBER_OF: 'Board Member',
  WORKS_AT: 'Executive / Operator',
  INVESTED_IN: 'Angel / Individual Investor',
  INVESTOR: 'Angel / Individual Investor',
  PARTICIPATES_IN_FUNDING_ROUND: 'Round Participant',
  IS_CONTROL_PERSON_OF: 'Control Person',
  IS_BENEFICIARY_OWNER_OF: 'Beneficial Owner',
  IS_MEMBER_OF: 'Member / Advisor'
};

async function deepHydrateCalaEntities(calaClient, entityIds = [], context = {}) {
  let discoveredCount = 0;
  let enrichedCount = 0;
  const hydratedEntities = [];
  const companies = [];
  const seen = new Set();
  const maxEntities = Math.max(1, Number(context.maxEntities ?? 8));
  const queue = (entityIds || [])
    .filter((id) => {
      if (!id || seen.has(id)) return false;
      seen.add(id);
      return true;
    })
    .slice(0, maxEntities);

  const batchSize = 4;
  for (let i = 0; i < queue.length; i += batchSize) {
    const batch = queue.slice(i, i + batchSize);
    const settled = await Promise.allSettled(
      batch.map((id) => retrieveEntityWithIntrospection(calaClient, id, context.incomingEventLimit ?? 20))
    );
    for (const outcome of settled) {
      if (outcome.status !== 'fulfilled') continue;
      const entityData = outcome.value?.entityRes?.data;
      if (!entityData) continue;
      hydratedEntities.push(entityData);
      const entityContext = typeof context.resolveEntityContext === 'function'
        ? { ...context, ...context.resolveEntityContext(entityData) }
        : context;
      const deepIng = ingestLiveCalaEntities([entityData], entityContext);
      discoveredCount += deepIng.ingestedCount;
      enrichedCount += deepIng.enrichedCount;
      companies.push(...(deepIng.companies || []));
    }
  }
  return { discoveredCount, enrichedCount, hydratedEntities, companies };
}

function collectConnectedTargetsFromPerson(personEntity) {
  const outRels = personEntity?.relationships?.outgoing || {};
  const inRels = personEntity?.relationships?.incoming || {};
  const personName = String(personEntity?.name || '').trim();
  const rolesByCompanyId = new Map();
  const investorNamesByCompanyId = new Map();
  const connectedTargets = [];

  const priorWork = [...(outRels.WORKS_AT || []), ...(inRels.WORKS_AT || [])].find(
    (t) => t?.name && (t?.properties?.valid_until || t?.properties?.end_date)
  );
  const studiedAt = (outRels.STUDIED_AT || []).find((t) => t?.name);
  const fallbackPriorName = priorWork?.name || studiedAt?.name || null;
  const fallbackPriorRole = priorWork
    ? priorWork.properties?.role || 'Operator'
    : studiedAt
      ? 'Alumni'
      : null;
  const fallbackPriorUntil = priorWork?.properties?.valid_until || priorWork?.properties?.end_date || null;

  const isTargetCompanyOrOrg = (t) =>
    t?.id &&
    t?.name &&
    (!t.entity_type || t.entity_type === 'Company' || t.entity_type === 'Organization');

  for (const relName of Object.keys(PERSON_CONNECTED_REL_LABELS)) {
    const edges = [...(outRels[relName] || []), ...(inRels[relName] || [])];
    for (const target of edges) {
      if (!isTargetCompanyOrOrg(target)) continue;
      const tId = String(target.id);
      if (!connectedTargets.some((x) => x.id === tId)) {
        connectedTargets.push(target);
      }
      const isLeadershipOrFounder = ['FOUNDED', 'IS_CEO_OF', 'IS_CTO_OF'].includes(relName);
      const distinctPrior =
        isLeadershipOrFounder &&
        fallbackPriorName &&
        normalizeEntityCoreName(fallbackPriorName) !== normalizeEntityCoreName(target.name)
          ? fallbackPriorName
          : null;
      const roleEntry = {
        relation: relName,
        name: personName,
        role: target.properties?.role || PERSON_CONNECTED_REL_LABELS[relName] || 'Principal',
        validSince: target.properties?.valid_since || target.properties?.start_date || null,
        validUntil: target.properties?.valid_until || target.properties?.end_date || null,
        priorCompany: target.properties?.prior_company || distinctPrior,
        priorRole: target.properties?.prior_role || (distinctPrior ? fallbackPriorRole : null),
        priorValidUntil: target.properties?.prior_valid_until || (distinctPrior ? fallbackPriorUntil : null),
        isMatchedPersonBridge: true,
        sourceRank: relName === 'IS_CONTROL_PERSON_OF' || relName === 'IS_BENEFICIARY_OWNER_OF' ? 'FILING' : 'PRIMARY'
      };
      const prevList = rolesByCompanyId.get(tId) || [];
      prevList.push(roleEntry);
      rolesByCompanyId.set(tId, prevList);

      if (relName === 'INVESTED_IN' || relName === 'INVESTOR') {
        const invList = investorNamesByCompanyId.get(tId) || [];
        if (personName && !invList.includes(personName)) invList.push(personName);
        investorNamesByCompanyId.set(tId, invList);
      }
    }
  }

  return { connectedTargets, rolesByCompanyId, investorNamesByCompanyId };
}

async function discoverStartupsFromCala(calaClient, { queryText = '', mode = 'ecosystem' } = {}) {
  let discoveredCount = 0;
  let enrichedCount = 0;
  let knowledgeAnswer = null;
  const cleanQ = String(queryText || '').trim();
  const hydratedById = new Map();
  const linkedCompanyNames = new Set();
  const matchedCompanyNames = new Set();
  const matchedPersons = [];
  const matchedOrganizations = [];

  if (mode === 'ecosystem' || /slush/i.test(cleanQ)) {
    try {
      const eventRes = await calaClient.calaRetrieveEntity(SLUSH_2026_ENTITY_ID, {
        properties: ['name', 'description'],
        relationships: { incoming: { PARTICIPATES_IN_EVENT: { limit: 100, offset: 0 } } }
      });
      const attendees = (eventRes.data?.relationships?.incoming?.PARTICIPATES_IN_EVENT || [])
        .filter((e) => !e.entity_type || e.entity_type === 'Company')
        .slice(0, 60);
      const ing = ingestLiveCalaEntities(attendees, { slush2026: true, allowUnfundedLive: true });
      discoveredCount += ing.ingestedCount;
      enrichedCount += ing.enrichedCount;

      const deep = await deepHydrateCalaEntities(
        calaClient,
        ing.companies.slice(0, 8).map((c) => c.calaEntityId),
        { slush2026: true, allowUnfundedLive: true, maxEntities: 8 }
      );
      discoveredCount += deep.discoveredCount;
      enrichedCount += deep.enrichedCount;
      for (const h of deep.hydratedEntities) hydratedById.set(h.id, h);
    } catch {
      // Non-fatal in offline/budget-restricted runs
    }
  }

  if (cleanQ) {
    const searchTerm = extractCleanCalaSearchQuery(cleanQ) || cleanQ;
    const isGenericEventWord = /^(slush|2026)$/i.test(searchTerm);
    let directHits = [];
    let ksEntities = [];

    const entitySearchPromise =
      searchTerm.length >= 2 && !isGenericEventWord
        ? calaClient.calaEntitySearch(searchTerm, 12, ['Company', 'Organization', 'Person'])
        : Promise.resolve(null);
    const ksSearchPromise =
      cleanQ.length >= 3 && !isGenericEventWord && typeof calaClient.calaKnowledgeSearch === 'function'
        ? calaClient.calaKnowledgeSearch(cleanQ, { explainability: true, returnEntities: true })
        : Promise.resolve(null);

    const [entitySearchOutcome, ksSearchOutcome] = await Promise.allSettled([entitySearchPromise, ksSearchPromise]);
    if (entitySearchOutcome.status === 'fulfilled' && entitySearchOutcome.value?.data?.entities) {
      directHits = entitySearchOutcome.value.data.entities;
    }
    if (ksSearchOutcome.status === 'fulfilled' && ksSearchOutcome.value?.data) {
      knowledgeAnswer = ksSearchOutcome.value.data;
      ksEntities = Array.isArray(knowledgeAnswer?.entities) ? knowledgeAnswer.entities : [];
    }

    // Combine unique entities from both directHits and knowledgeAnswer.entities, prioritizing strong query matches
    const combinedById = new Map();
    for (const hit of [...directHits, ...ksEntities]) {
      if (!hit?.id || !hit?.name) continue;
      if (!combinedById.has(hit.id)) {
        combinedById.set(hit.id, hit);
      } else {
        const prev = combinedById.get(hit.id);
        combinedById.set(hit.id, { ...hit, ...prev, description: prev.description || hit.description });
      }
    }
    const allMatched = [...combinedById.values()].sort((a, b) => {
      const aStrong = isStrongEntityNameMatch(searchTerm, a.name) || isStrongEntityNameMatch(cleanQ, a.name) ? 1 : 0;
      const bStrong = isStrongEntityNameMatch(searchTerm, b.name) || isStrongEntityNameMatch(cleanQ, b.name) ? 1 : 0;
      return bStrong - aStrong;
    });

    const companyOrgHits = allMatched.filter((e) => !e.entity_type || e.entity_type === 'Company' || e.entity_type === 'Organization');
    const personHits = allMatched.filter((e) => e.entity_type === 'Person');

    if (companyOrgHits.length > 0) {
      for (const hit of companyOrgHits) {
        const strongMatch = isStrongEntityNameMatch(searchTerm, hit.name) || isStrongEntityNameMatch(cleanQ, hit.name);
        if (strongMatch && (!hit.entity_type || hit.entity_type === 'Company')) {
          matchedCompanyNames.add(hit.name);
        }
        const preIng = ingestLiveCalaEntities([hit], {
          allowOrganizations: true,
          allowGeneralCompanies: strongMatch,
          allowUnfundedLive: true
        });
        discoveredCount += preIng.ingestedCount;
        enrichedCount += preIng.enrichedCount;
      }

      // Deep hydrate combined top 8 unique Company/Organization IDs across directHits + knowledgeAnswer.entities
      const topCompanyOrgIds = companyOrgHits.slice(0, 6).map((e) => e.id);
      const deep = await deepHydrateCalaEntities(calaClient, topCompanyOrgIds, {
        maxEntities: 6,
        allowOrganizations: true,
        allowUnfundedLive: true,
        resolveEntityContext: (entityData) => ({
          allowGeneralCompanies:
            isStrongEntityNameMatch(searchTerm, entityData.name) || isStrongEntityNameMatch(cleanQ, entityData.name)
        })
      });
      discoveredCount += deep.discoveredCount;
      enrichedCount += deep.enrichedCount;
      for (const h of deep.hydratedEntities) hydratedById.set(h.id, h);
      for (const co of deep.companies) {
        if (isStrongEntityNameMatch(searchTerm, co.name) || isStrongEntityNameMatch(cleanQ, co.name)) {
          matchedCompanyNames.add(co.name);
        }
      }

      // Expand matched Organizations (e.g. VC funds, accelerators, research institutes) via INVESTED_IN portfolio startups
      const hydratedOrgs = deep.hydratedEntities.filter((e) => e.entity_type === 'Organization');
      for (const org of hydratedOrgs.slice(0, 3)) {
        matchedOrganizations.push(org.name);
        const outInv = org.relationships?.outgoing?.INVESTED_IN || [];
        const inInv = org.relationships?.incoming?.INVESTED_IN || [];
        const invTargets = [...outInv, ...inInv]
          .filter((t) => t?.id && t?.name && (!t.entity_type || t.entity_type === 'Company' || t.entity_type === 'Organization'));
        if (invTargets.length === 0) continue;

        const targetIdsToHydrate = [];
        for (const t of invTargets.slice(0, 5)) {
          linkedCompanyNames.add(t.name);
          if (hydratedById.has(t.id)) {
            const reIng = ingestLiveCalaEntities([hydratedById.get(t.id)], {
              investorName: org.name,
              allowOrganizations: true,
              allowGeneralCompanies: true,
              allowUnfundedLive: true
            });
            discoveredCount += reIng.ingestedCount;
            enrichedCount += reIng.enrichedCount;
          } else {
            targetIdsToHydrate.push(t.id);
          }
        }
        if (targetIdsToHydrate.length > 0) {
          const orgDeep = await deepHydrateCalaEntities(calaClient, targetIdsToHydrate, {
            maxEntities: 5,
            investorName: org.name,
            allowOrganizations: true,
            allowGeneralCompanies: true,
            allowUnfundedLive: true
          });
          discoveredCount += orgDeep.discoveredCount;
          enrichedCount += orgDeep.enrichedCount;
          for (const h of orgDeep.hydratedEntities) hydratedById.set(h.id, h);
          for (const co of orgDeep.companies) linkedCompanyNames.add(co.name);
        }
      }
    }

    // Expand Person / Founder / Angel entities into their full role history & connected Companies/Organizations
    if (personHits.length > 0) {
      const personToHydrate = personHits.slice(0, 3);
      const personSettled = await Promise.allSettled(
        personToHydrate.map((p) => retrieveEntityWithIntrospection(calaClient, p.id))
      );

      const mergedRolesByCompanyId = new Map();
      const mergedInvestorNamesByCompanyId = new Map();
      const unhydratedPersonCompanyIds = [];
      const alreadyHydratedTargets = [];

      for (const outcome of personSettled) {
        if (outcome.status !== 'fulfilled') continue;
        const personData = outcome.value?.entityRes?.data;
        if (!personData?.id) continue;
        hydratedById.set(personData.id, personData);
        matchedPersons.push(personData.name);

        const { connectedTargets, rolesByCompanyId, investorNamesByCompanyId } = collectConnectedTargetsFromPerson(personData);
        for (const [compId, roles] of rolesByCompanyId.entries()) {
          const existingList = mergedRolesByCompanyId.get(compId) || [];
          existingList.push(...roles);
          mergedRolesByCompanyId.set(compId, existingList);
        }
        for (const [compId, invNames] of investorNamesByCompanyId.entries()) {
          const existingInv = mergedInvestorNamesByCompanyId.get(compId) || [];
          for (const invName of invNames) {
            if (!existingInv.includes(invName)) existingInv.push(invName);
          }
          mergedInvestorNamesByCompanyId.set(compId, existingInv);
        }

        for (const target of connectedTargets.slice(0, 5)) {
          linkedCompanyNames.add(target.name);
          if (hydratedById.has(target.id)) {
            alreadyHydratedTargets.push(hydratedById.get(target.id));
          } else if (!unhydratedPersonCompanyIds.includes(target.id)) {
            unhydratedPersonCompanyIds.push(target.id);
          }
        }
      }

      if (alreadyHydratedTargets.length > 0) {
        const reIng = ingestLiveCalaEntities(alreadyHydratedTargets, {
          allowOrganizations: true,
          allowGeneralCompanies: true,
          allowUnfundedLive: true,
          personRolesByCompanyId: mergedRolesByCompanyId,
          personInvestorNamesByCompanyId: mergedInvestorNamesByCompanyId
        });
        discoveredCount += reIng.ingestedCount;
        enrichedCount += reIng.enrichedCount;
        for (const co of reIng.companies) linkedCompanyNames.add(co.name);
      }

      if (unhydratedPersonCompanyIds.length > 0) {
        const personCompDeep = await deepHydrateCalaEntities(
          calaClient,
          unhydratedPersonCompanyIds.slice(0, 6),
          {
            maxEntities: 6,
            allowOrganizations: true,
            allowGeneralCompanies: true,
            allowUnfundedLive: true,
            personRolesByCompanyId: mergedRolesByCompanyId,
            personInvestorNamesByCompanyId: mergedInvestorNamesByCompanyId
          }
        );
        discoveredCount += personCompDeep.discoveredCount;
        enrichedCount += personCompDeep.enrichedCount;
        for (const h of personCompDeep.hydratedEntities) hydratedById.set(h.id, h);
        for (const co of personCompDeep.companies) linkedCompanyNames.add(co.name);
      }
    }
  }

  if (discoveredCount > 0 || enrichedCount > 0) {
    analysisCache.clear();
  }

  return {
    discoveredCount,
    enrichedCount,
    knowledgeAnswer,
    linkedCompanyNames: [...linkedCompanyNames],
    matchedCompanyNames: [...matchedCompanyNames],
    matchedPersons: [...new Set(matchedPersons)],
    matchedOrganizations: [...new Set(matchedOrganizations)],
    hydratedEntityCount: hydratedById.size
  };
}

export function createAppServer(options = {}) {
  const calaClient = options.calaClient || createCalaClient({ maxLiveCalls: options.maxLiveCalls ?? 250 });
  const registryClient = options.registryClient || createRegistryClient();
  const cachedReg = registryClient.getCachedCompanies();
  if (cachedReg.length > 0) {
    ingestRegistryEntities(cachedReg);
  }

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
            latestStage:
              c.rounds[c.rounds.length - 1]?.type ||
              (c.entityCategory === 'established_corp' ? 'Public / Mature' : 'Registered (Unfunded)')
          })),
          coverageStats: {
            fundsIndexed: FUNDS.length,
            companiesIndexed: COMPANIES.length,
            roundsIndexed: COMPANIES.reduce((s, c) => s + c.rounds.length, 0),
            sourcesIndexed: Object.keys(SOURCES).length,
            companiesHouseIndexed: COMPANIES.filter((c) => Boolean(c.companiesHouseNumber)).length,
            registryEntitiesIndexed: COMPANIES.filter((c) => Boolean(c.isRegistryDiscovered)).length,
            timeSeriesPointsIndexed: COMPANIES.reduce((s, c) => s + (c.employeeCountSeries?.length || 0), 0),
            liveCalaConfigured: Boolean(process.env.CALA_API_KEY),
            anthropicConfigured: Boolean(process.env.ANTHROPIC_API_KEY),
            calaBudget: calaClient.getBudgetStatus(),
            registryStatus: registryClient.getStatus()
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
          slush2026: type === 'event' || /slush/i.test(name),
          allowGeneralCompanies: type === 'company'
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
        const wantLive = reqUrl.searchParams.get('live') === '1';
        const entities = searchLocalEntities(q, 8);
        const live = { requested: wantLive, available: Boolean(calaClient.getBudgetStatus().configured), error: null, count: 0 };
        if (wantLive && q.trim().length >= 2 && live.available) {
          try {
            const searchRes = await calaClient.calaEntitySearch(q.trim(), 12, ['Company', 'Organization', 'Person']);
            const hits = (searchRes.data?.entities || []).filter((e) => e?.id && e?.name);
            const known = new Set(entities.map((e) => e.name.toLowerCase()));
            for (const hit of hits) {
              if (known.has(hit.name.toLowerCase())) continue;
              known.add(hit.name.toLowerCase());
              const kind = hit.entity_type === 'Person' ? 'person' : hit.entity_type === 'Organization' ? 'investor' : 'company';
              entities.push({
                ref: `cala:${hit.id}`,
                name: hit.name,
                kind,
                typeLabel: hit.entity_type || 'Entity',
                subtitle: [hit.entity_type, String(hit.description || '').slice(0, 80)].filter(Boolean).join(' · '),
                live: true
              });
              live.count += 1;
            }
            // Ingest companies and organizations so brief/analyze calls work on them immediately.
            const ing = ingestLiveCalaEntities(
              hits.filter((h) => !h.entity_type || h.entity_type === 'Company' || h.entity_type === 'Organization'),
              { allowOrganizations: true, allowGeneralCompanies: true, allowUnfundedLive: true }
            );
            if (ing.ingestedCount > 0 || ing.enrichedCount > 0) analysisCache.clear();
          } catch (err) {
            live.error = err.message || 'Live Cala lookup failed.';
          }
        }
        sendJson(res, 200, { ...searchEntities(q), entities, live });
        return;
      }

      if (req.method === 'GET' && pathname === '/api/entity-map') {
        const ref = String(reqUrl.searchParams.get('ref') || '').trim();
        if (!ref) {
          sendJson(res, 400, { error: 'Missing required query parameter: ref.' });
          return;
        }
        if (ref.startsWith('cala:') && calaClient.getBudgetStatus().configured) {
          try {
            const { entityRes } = await retrieveEntityWithIntrospection(calaClient, ref.slice(5), 20);
            const liveMap = buildEntityMapFromCala(entityRes.data);
            if (liveMap) {
              sendJson(res, 200, { ...liveMap, liveStatus: 'live' });
              return;
            }
          } catch {
            // Fall through to indexed data below.
          }
        }
        const localMap = buildEntityMap(ref);
        if (!localMap) {
          sendJson(res, 404, {
            error: ref.startsWith('cala:')
              ? 'Live Cala lookup unavailable for this entity, and it is not in the indexed data.'
              : 'Entity not found in the indexed data.'
          });
          return;
        }
        sendJson(res, 200, { ...localMap, liveStatus: 'indexed' });
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
        const narrate = reqUrl.searchParams.get('narrate');
        if (!startupId) {
          sendJson(res, 400, { error: 'Missing required query parameter: startupId.' });
          return;
        }
        const brief = buildStartupBrief(startupId, fundId);
        if (narrate === '1' || narrate === 'true') {
          const narrative = await narrateBriefWithCitationGate(brief);
          sendJson(res, 200, { ...brief, narrative });
          return;
        }
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
        if (discovery.discoveredCount > 0 || discovery.enrichedCount > 0) {
          analysisCache.clear();
        }
        const analysis = getCachedAnalysis(body);
        const { allRanked, ...publicPayload } = analysis;
        const hideMegaHubs = body.hideMegaHubs !== undefined ? Boolean(body.hideMegaHubs) : true;
        const bridgeFamily = body.bridgeFamily || 'all';
        const contributionGroup = body.contributionGroup || 'all';
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
              bridgeFamily,
              contributionGroup,
              hideMegaHubs,
              entityScope: body.entityScope,
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
          bridgeMap: refined ? refined.bridgeMap : publicPayload.bridgeMap,
          relaxSuggestions: refined ? refined.relaxSuggestions : [],
          discoveredCount: discovery.discoveredCount,
          enrichedCount: discovery.enrichedCount,
          knowledgeAnswer: discovery.knowledgeAnswer,
          totalCompaniesIndexed: COMPANIES.length,
          calaBudget: calaClient.getBudgetStatus()
        });
        return;
      }

      if (req.method === 'POST' && pathname === '/api/discover-registries') {
        const body = await readJsonBody(req);
        const regRes = await registryClient.discoverFromRegistries({
          queryText: body.queryText || '',
          companyQuery: body.companyQuery || '',
          country: body.country || '',
          sectors: Array.isArray(body.sectors) ? body.sectors : [],
          mode: body.mode || (body.queryText || body.companyQuery ? 'query' : 'sync_recent_startups'),
          maxResults: body.maxResults || 12
        });
        const ing = ingestRegistryEntities(regRes.companies);
        if (ing.ingestedCount > 0 || ing.enrichedCount > 0) {
          analysisCache.clear();
        }
        sendJson(res, 200, {
          ...regRes,
          ingestedCount: ing.ingestedCount,
          enrichedCount: ing.enrichedCount,
          totalCompaniesIndexed: COMPANIES.length,
          registryStatus: registryClient.getStatus(),
          calaBudget: calaClient.getBudgetStatus()
        });
        return;
      }

      if (req.method === 'POST' && pathname === '/api/refine') {
        const body = await readJsonBody(req);
        let liveDiscoveredCount = 0;
        let knowledgeAnswer = null;
        let discovery = null;
        if (body.discoverLive === true && body.queryText && !/^\s*why not\s+/i.test(String(body.queryText))) {
          try {
            discovery = await discoverStartupsFromCala(calaClient, {
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
        const compiled = body.queryText
          ? await compileSearchQuery(body.queryText, {
              fundId: body.fundId,
              knownInvestors: Object.values(PEER_INVESTORS)
            })
          : { controlPlaneMode: 'deterministic-parser', filters: null, fromCache: false };
        const cf = compiled.filters || {};
        let effectiveEntityScope =
          body.entityScope === 'all' || cf.entityScope === 'all' ? 'all' : 'startups';
        let effectiveCompanyQuery = body.companyQuery || cf.companyQuery || null;
        if (!effectiveCompanyQuery && body.queryText && !cf.sectors?.length && !cf.investorQuery) {
          const fallbackTerm = extractRegistryLookupTerm(body.queryText);
          if (
            fallbackTerm.length >= 2 &&
            fallbackTerm.split(/\s+/).length <= 3 &&
            !/\b(slush|raising|untapped|founders|startups?|seed|series|nordics|dach|fintech|deeptech|healthtech|climate|saas)\b/i.test(fallbackTerm)
          ) {
            effectiveCompanyQuery = fallbackTerm;
          } else if (discovery?.matchedPersons?.length > 0) {
            effectiveCompanyQuery = discovery.matchedPersons[0];
          } else if (discovery?.matchedOrganizations?.length > 0 && discovery?.linkedCompanyNames?.length > 0) {
            effectiveCompanyQuery = discovery.matchedOrganizations[0];
          }
        }
        const effectiveCountries =
          Array.isArray(body.countries) && body.countries.length
            ? body.countries
            : cf.countryHint
              ? [cf.countryHint]
              : undefined;
        const liveIncludeCompanyNames = [
          ...new Set([
            ...(effectiveCompanyQuery ? [effectiveCompanyQuery] : []),
            ...(discovery?.matchedCompanyNames || []),
            ...(discovery?.linkedCompanyNames || [])
          ])
        ];

        const refinementPayload = {
          entityScope: effectiveEntityScope,
          intent: body.intent || cf.intent,
          region: body.region && body.region !== 'all' ? body.region : (cf.region || body.region),
          stageFilter:
            body.stageFilter && body.stageFilter !== 'all' ? body.stageFilter : (cf.stageFilter || body.stageFilter),
          excludeSector:
            body.excludeSector && body.excludeSector !== 'none'
              ? body.excludeSector
              : (cf.excludeSector || body.excludeSector),
          raisingSoonOnly: Boolean(body.raisingSoonOnly || cf.raisingSoonOnly),
          untappedOnly: Boolean(body.untappedOnly || cf.untappedOnly),
          highVelocityOnly: body.highVelocityOnly,
          feederOnly: body.feederOnly,
          filingOnly: body.filingOnly,
          hideMegaHubs: body.hideMegaHubs !== undefined ? Boolean(body.hideMegaHubs) : true,
          bridgeFamily: body.bridgeFamily || 'all',
          contributionGroup: body.contributionGroup || 'all',
          alumniOnly: Boolean(body.alumniOnly || body.requireAlumniFounder || cf.requireAlumniFounder),
          requireAlumniFounder: Boolean(body.requireAlumniFounder || body.alumniOnly || cf.requireAlumniFounder),
          minHeadcountGrowthPct: body.minHeadcountGrowthPct ?? cf.minHeadcountGrowthPct,
          investorQuery: body.investorQuery || cf.investorQuery,
          companyQuery: effectiveCompanyQuery,
          linkedCompanyNames: discovery?.linkedCompanyNames || [],
          whyNotCompany: body.whyNotCompany || cf.whyNotCompany,
          expandedKeywords:
            Array.isArray(cf.expandedKeywords) && cf.expandedKeywords.length
              ? cf.expandedKeywords
              : body.expandedKeywords,
          sectors:
            compiled.controlPlaneMode === 'anthropic-query-compiler'
              ? cf.sectors || []
              : Array.isArray(body.sectors) && body.sectors.length
                ? body.sectors
                : cf.sectors,
          countries: effectiveCountries,
          maxEmployees: body.maxEmployees,
          slush2026Only: Boolean(body.slush2026Only || cf.slushOnly),
          preferWarm: body.preferWarm,
          limit: body.limit,
          queryText: body.queryText
        };

        let analysis = getCachedAnalysis({
          ...body,
          entityScope: effectiveEntityScope,
          includeCompanyNames: liveIncludeCompanyNames
        });
        let refined = refineShortlist(analysis.thesis, analysis.allRanked, refinementPayload);

        let registryDiscovery = null;
        const isWhyNot = refined.searchIntent === 'why_not' || /^\s*why not\s+/i.test(String(body.queryText || ''));
        const exactMatchesCount = refined.usedSoftFallback ? 0 : refined.totalMatches;
        const hasExactCompanyInIndex =
          effectiveCompanyQuery && COMPANIES.some((c) => isStrongEntityNameMatch(effectiveCompanyQuery, c.name));
        const hasPersonOrLinkedMatch = Boolean(discovery?.linkedCompanyNames?.length > 0 && exactMatchesCount > 0);
        const shouldDiscoverRegistries =
          !isWhyNot &&
          body.discoverRegistries !== false &&
          Boolean(String(body.queryText || '').trim()) &&
          !hasPersonOrLinkedMatch &&
          (exactMatchesCount === 0 ||
            Boolean(effectiveCompanyQuery && !hasExactCompanyInIndex) ||
            (effectiveEntityScope === 'all' && !hasExactCompanyInIndex));

        if (shouldDiscoverRegistries) {
          try {
            const regRes = await registryClient.discoverFromRegistries({
              queryText: body.queryText,
              companyQuery: effectiveCompanyQuery || '',
              country: cf.countryHint || (effectiveCountries?.[0] || ''),
              sectors: refinementPayload.sectors || [],
              mode: 'query',
              maxResults: 10
            });
            const regIng = ingestRegistryEntities(regRes.companies);
            if (regRes.companies.some((c) => c.entityCategory === 'established_corp')) {
              effectiveEntityScope = 'all';
              refinementPayload.entityScope = 'all';
            }
            if (regIng.ingestedCount > 0 || regIng.enrichedCount > 0 || effectiveEntityScope === 'all') {
              analysisCache.clear();
              const includeNames = [
                ...liveIncludeCompanyNames,
                ...regRes.companies.map((c) => c.name)
              ];
              analysis = getCachedAnalysis({
                ...body,
                entityScope: effectiveEntityScope,
                includeCompanyNames: includeNames
              });
              refined = refineShortlist(analysis.thesis, analysis.allRanked, refinementPayload);
            }
            registryDiscovery = {
              triggered: true,
              discoveredCount: regRes.companies.length,
              ingestedCount: regIng.ingestedCount,
              enrichedCount: regIng.enrichedCount,
              sourcesUsed: regRes.sourcesUsed,
              cacheHits: regRes.cacheHits,
              errors: regRes.errors
            };
            if (regRes.companies.length > 0) {
              refined.aiTrace.unshift(
                `Official Registries (${regRes.sourcesUsed.join(' + ') || 'PRH/GLEIF'}): fetched ${regRes.companies.length} corporate records (${regIng.ingestedCount} new)`
              );
            }
          } catch {
            // Non-fatal in offline/timeout environments
          }
        }

        if (discovery && (discovery.hydratedEntityCount > 0 || discovery.linkedCompanyNames.length > 0)) {
          refined.aiTrace.unshift(
            `Live Cala Graph: hydrated ${discovery.hydratedEntityCount} entities across Companies/Orgs/People (${discovery.discoveredCount} new, ${discovery.enrichedCount} enriched${discovery.matchedPersons.length ? `; Person bridges: ${discovery.matchedPersons.join(', ')}` : ''})`
          );
        }

        sendJson(res, 200, {
          ...refined,
          entityScope: effectiveEntityScope,
          controlPlaneMode: compiled.controlPlaneMode,
          compiledQuery: compiled.filters,
          liveDiscoveredCount,
          liveDiscovery: discovery
            ? {
                discoveredCount: discovery.discoveredCount,
                enrichedCount: discovery.enrichedCount,
                hydratedEntityCount: discovery.hydratedEntityCount,
                matchedPersons: discovery.matchedPersons,
                matchedOrganizations: discovery.matchedOrganizations,
                matchedCompanyNames: discovery.matchedCompanyNames,
                linkedCompanyNames: discovery.linkedCompanyNames
              }
            : null,
          knowledgeAnswer,
          registryDiscovery,
          totalCompaniesIndexed: COMPANIES.length,
          registryStatus: registryClient.getStatus(),
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
