import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { COMPANIES, FUNDS, REFERENCE_DATE, SOURCES } from './src/data.mjs';
import { createCalaClient, loadEnvFile } from './src/calaClient.mjs';
import {
  buildStartupBrief,
  refineShortlist,
  runFullAnalysis,
  searchEntities
} from './src/engine.mjs';

loadEnvFile();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PUBLIC_DIR = path.join(__dirname, 'public');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png'
};

const analysisCache = new Map();

function pickBestCalaEntity(entities = [], preferredType = 'Organization') {
  if (!entities.length) return null;
  const exactType = entities.find((e) => e.entity_type === preferredType);
  return exactType || entities[0];
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

export function createAppServer(options = {}) {
  const calaClient = options.calaClient || createCalaClient({ maxLiveCalls: options.maxLiveCalls ?? 8 });

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
        const matched = pickBestCalaEntity(candidates, preferredType);

        let introRes = null;
        let entityRes = null;
        let liveSummary = null;
        let knowledgeRes = null;

        if (matched) {
          introRes = await calaClient.calaIntrospect(matched.id);
          const outgoingMap = {};
          for (const rel of introRes.data?.relationships?.outgoing || []) {
            outgoingMap[rel] = { limit: 20, offset: 0 };
          }
          const incomingMap = {};
          for (const rel of introRes.data?.relationships?.incoming || []) {
            incomingMap[rel] = { limit: type === 'event' ? 100 : 20, offset: 0 };
          }
          const retrieveBody = {
            properties: introRes.data?.properties || ['name', 'description'],
            relationships: { outgoing: outgoingMap, incoming: incomingMap }
          };
          if (Array.isArray(introRes.data?.numerical_observations) && introRes.data.numerical_observations.length > 0) {
            retrieveBody.numerical_observations = introRes.data.numerical_observations;
          }
          entityRes = await calaClient.calaRetrieveEntity(matched.id, retrieveBody);
          liveSummary = summarizeLiveCalaEntity(entityRes.data);
        }

        if (includeKnowledgeSearch) {
          const prompt =
            type === 'fund'
              ? `What companies and funding rounds has ${name} invested in recently?`
              : `What is the complete funding history, round dates, amounts, and investors of ${name}?`;
          knowledgeRes = await calaClient.calaKnowledgeSearch(prompt);
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

      if (req.method === 'POST' && pathname === '/api/refine') {
        const body = await readJsonBody(req);
        const analysis = getCachedAnalysis(body);
        const refined = refineShortlist(analysis.thesis, analysis.allRanked, {
          region: body.region,
          stageFilter: body.stageFilter,
          excludeSector: body.excludeSector,
          raisingSoonOnly: body.raisingSoonOnly,
          untappedOnly: body.untappedOnly,
          queryText: body.queryText
        });
        sendJson(res, 200, refined);
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
  const port = Number(process.env.PORT) || 4173;
  const server = createAppServer();
  server.listen(port, '127.0.0.1', () => {
    console.log(`Revealed Thesis Engine listening on http://127.0.0.1:${port}`);
  });
}
