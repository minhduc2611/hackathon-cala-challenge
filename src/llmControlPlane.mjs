import { enforceFactCitations } from './engine.mjs';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
const DEFAULT_ANTHROPIC_MODEL = 'claude-haiku-5-5';
const DEFAULT_TIMEOUT_MS = 2000;

export const ALLOWED_INTENTS = new Set(['general', 'company', 'investor', 'industry', 'why_not']);
export const ALLOWED_REGIONS = new Set(['all', 'Nordics', 'DACH', 'UK', 'Western Europe', 'Europe']);
export const ALLOWED_STAGES = new Set(['all', 'pre_seed_seed', 'seed_series_a', 'series_a_plus']);
export const ALLOWED_ENTITY_SCOPES = new Set(['startups', 'all']);
export const ALLOWED_SECTORS = new Set([
  'AI & ML',
  'DeepTech',
  'HealthTech',
  'Fintech',
  'Climate Tech',
  'B2B SaaS'
]);

const queryCompilerCache = new Map();
const briefNarratorCache = new Map();
const connectionInsightCache = new Map();

function sanitizeShortText(value, maxLen = 80) {
  if (typeof value !== 'string') return null;
  const cleaned = value
    .replace(/[\u0000-\u001f<>`{}]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return null;
  return cleaned.slice(0, maxLen);
}

function stripJsonCodeFences(rawText) {
  const s = String(rawText || '').trim();
  const fenced = s.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced) return fenced[1].trim();
  const objMatch = s.match(/\{[\s\S]*\}/);
  return objMatch ? objMatch[0] : s;
}

export function validateCompiledFilters(rawFilters) {
  if (!rawFilters || typeof rawFilters !== 'object' || Array.isArray(rawFilters)) {
    return null;
  }

  const rawIntent = ALLOWED_INTENTS.has(rawFilters.intent) ? rawFilters.intent : 'general';
  const region = ALLOWED_REGIONS.has(rawFilters.region) ? rawFilters.region : 'all';
  const stageFilter = ALLOWED_STAGES.has(rawFilters.stageFilter) ? rawFilters.stageFilter : 'all';

  const sectors = Array.isArray(rawFilters.sectors)
    ? [...new Set(rawFilters.sectors.filter((s) => typeof s === 'string' && ALLOWED_SECTORS.has(s)))]
    : [];

  const excludeSector = ALLOWED_SECTORS.has(rawFilters.excludeSector) ? rawFilters.excludeSector : 'none';

  const raisingSoonOnly = rawFilters.raisingSoonOnly === true;
  const untappedOnly = rawFilters.untappedOnly === true;
  const slushOnly = rawFilters.slushOnly === true;
  const alumniStr =
    typeof rawFilters.requireAlumniFounder === 'string' && rawFilters.requireAlumniFounder.trim()
      ? rawFilters.requireAlumniFounder.toLowerCase().replace(/[^a-z0-9._-]/g, '').trim()
      : null;
  const requireAlumniFounder =
    rawFilters.requireAlumniFounder === true ||
    (Boolean(alumniStr) && alumniStr !== 'false' && alumniStr !== 'no');

  let minHeadcountGrowthPct = null;
  if (rawFilters.minHeadcountGrowthPct !== null && rawFilters.minHeadcountGrowthPct !== undefined && rawFilters.minHeadcountGrowthPct !== '') {
    const num = Number(rawFilters.minHeadcountGrowthPct);
    if (Number.isFinite(num) && num >= 0 && num <= 500) {
      minHeadcountGrowthPct = Math.round(num);
    }
  }

  const investorQuery = sanitizeShortText(rawFilters.investorQuery);
  const companyQuery = sanitizeShortText(rawFilters.companyQuery);
  const whyNotCompany = sanitizeShortText(rawFilters.whyNotCompany);
  const countryHint = sanitizeShortText(rawFilters.countryHint, 40);
  const entityScope = ALLOWED_ENTITY_SCOPES.has(rawFilters.entityScope) ? rawFilters.entityScope : 'startups';
  const intent =
    (rawIntent === 'company' && !companyQuery) ||
    (rawIntent === 'investor' && !investorQuery) ||
    (rawIntent === 'why_not' && !whyNotCompany)
      ? 'general'
      : rawIntent;

  const kwTokens = [];
  if (Array.isArray(rawFilters.expandedKeywords)) {
    for (const rawKw of rawFilters.expandedKeywords) {
      if (typeof rawKw !== 'string') continue;
      const parts = rawKw
        .toLowerCase()
        .split(/[\s,/]+/)
        .map((p) => p.replace(/[^a-z0-9._-]/g, '').trim())
        .filter((p) => p.length >= 2 && p.length <= 32 && !/^(startup|startups|company|companies|founder|founders|alumni|former|2025|2026)$/i.test(p));
      for (const p of parts) kwTokens.push(p);
    }
  }
  if (alumniStr && alumniStr.length >= 2 && !/^(true|false|yes|no)$/i.test(alumniStr)) {
    kwTokens.push(alumniStr);
  }
  const expandedKeywords = [...new Set(kwTokens)].slice(0, 8);

  return {
    intent,
    entityScope,
    countryHint,
    region,
    stageFilter,
    sectors,
    excludeSector,
    raisingSoonOnly,
    untappedOnly,
    slushOnly,
    minHeadcountGrowthPct,
    requireAlumniFounder,
    investorQuery,
    companyQuery,
    whyNotCompany,
    expandedKeywords
  };
}

async function callAnthropicMessages({ apiKey, model, systemPrompt, userContent, maxTokens = 400, timeoutMs = DEFAULT_TIMEOUT_MS, fetchFn = globalThis.fetch }) {
  const controller = new AbortController();
  const externalTimeout = typeof AbortSignal?.timeout === 'function' ? AbortSignal.timeout(timeoutMs) : null;
  const timer = setTimeout(() => controller.abort(new Error('Anthropic request timed out')), timeoutMs);

  let signal = controller.signal;
  if (externalTimeout && typeof AbortSignal?.any === 'function') {
    signal = AbortSignal.any([controller.signal, externalTimeout]);
  }

  try {
    const isClaude5 = /^claude-(?:haiku|sonnet|opus|fable)-5/i.test(model);
    const sendAttempt = async (includeTemperature) => {
      const payloadBody = {
        model,
        max_tokens: maxTokens,
        system: systemPrompt,
        messages: [{ role: 'user', content: userContent }]
      };
      if (isClaude5) {
        payloadBody.thinking = { type: 'disabled' };
      } else if (includeTemperature) {
        payloadBody.temperature = 0;
      }
      const fetchPromise = fetchFn(ANTHROPIC_API_URL, {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': ANTHROPIC_VERSION,
          'content-type': 'application/json'
        },
        body: JSON.stringify(payloadBody),
        signal
      });
      const timeoutGuard = new Promise((_, reject) => {
        const id = setTimeout(() => reject(new Error(`Anthropic API timeout after ${timeoutMs}ms`)), timeoutMs + 15);
        fetchPromise.finally(() => clearTimeout(id)).catch(() => {});
      });
      return Promise.race([fetchPromise, timeoutGuard]);
    };

    let res = await sendAttempt(true);
    if (res && !res.ok && res.status === 400 && typeof res.text === 'function') {
      const errText = await res.text().catch(() => '');
      if (/temperature/i.test(errText)) {
        res = await sendAttempt(false);
      } else {
        const err = new Error(`Anthropic API returned HTTP 400`);
        err.statusCode = 400;
        throw err;
      }
    }
    if (!res || !res.ok) {
      const status = res ? res.status : 500;
      const err = new Error(`Anthropic API returned HTTP ${status}`);
      err.statusCode = status;
      throw err;
    }
    const payload = await res.json();
    const textBlock = (payload?.content || []).find((c) => c?.type === 'text' && typeof c.text === 'string');
    if (!textBlock) {
      throw new Error('Anthropic API response contained no text content.');
    }
    return textBlock.text;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Control Plane Query Compiler: translates natural-language search queries
 * into strict whitelisted filter JSON. Never invents entities or scores.
 * Falls back silently to deterministic parsing on missing key, 401, error, or timeout.
 */
export async function compileSearchQuery(rawQuery, context = {}, options = {}) {
  const queryText = String(rawQuery || '').trim();
  const apiKey = options.apiKey ?? process.env.ANTHROPIC_API_KEY ?? '';
  if (!queryText || !apiKey) {
    return {
      controlPlaneMode: 'deterministic-parser',
      filters: null,
      fromCache: false
    };
  }

  const cache = options.cache || queryCompilerCache;
  const cacheKey = JSON.stringify({ q: queryText.toLowerCase(), fundId: context.fundId || '' });
  if (cache.has(cacheKey)) {
    return {
      ...cache.get(cacheKey),
      fromCache: true
    };
  }

  const systemPrompt = [
    'Strict VC & company query compiler. Output ONE compact single-line JSON object only (no markdown fences, omit null/false keys unless helpful):',
    'Keys: intent ("general"|"company"|"investor"|"industry"|"why_not"), entityScope ("startups"|"all"), countryHint (string|null), region ("all"|"Nordics"|"DACH"|"UK"|"Western Europe"), stageFilter ("all"|"pre_seed_seed"|"seed_series_a"|"series_a_plus"), sectors (array from ["AI & ML","DeepTech","HealthTech","Fintech","Climate Tech","B2B SaaS"]), excludeSector, raisingSoonOnly (bool), untappedOnly (bool), slushOnly (bool), minHeadcountGrowthPct (int|null), requireAlumniFounder (bool), investorQuery, companyQuery, whyNotCompany, expandedKeywords (up to 5 single lowercase words like ["aiven","grid","storage","battery"]).',
    'Rules: Set entityScope:"all" for public/non-startup chains (e.g. KFC, McDonald\'s, retail) or "all companies"/"registry". For "ex-<Company>", set requireAlumniFounder:true and put "<company>" in expandedKeywords (never companyQuery). Keep sectors [] for cross-sector terms like grid storage.'
  ].join('\n');

  const userContent = JSON.stringify({
    query: queryText,
    fundName: context.fundName || null,
    knownInvestorsSample: Array.isArray(context.knownInvestors) ? context.knownInvestors.slice(0, 20) : []
  });

  try {
    const rawText = await callAnthropicMessages({
      apiKey,
      model: options.model || process.env.ANTHROPIC_MODEL || DEFAULT_ANTHROPIC_MODEL,
      systemPrompt,
      userContent,
      maxTokens: 200,
      timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      fetchFn: options.fetchFn || globalThis.fetch
    });
    const parsedJson = JSON.parse(stripJsonCodeFences(rawText));
    const validated = validateCompiledFilters(parsedJson);
    if (!validated) {
      return {
        controlPlaneMode: 'deterministic-parser',
        filters: null,
        fromCache: false,
        fallbackReason: 'invalid-schema'
      };
    }
    const result = {
      controlPlaneMode: 'anthropic-query-compiler',
      filters: validated,
      fromCache: false
    };
    if (cache.size > 200) {
      const firstKey = cache.keys().next().value;
      cache.delete(firstKey);
    }
    cache.set(cacheKey, result);
    return result;
  } catch (err) {
    return {
      controlPlaneMode: 'deterministic-parser',
      filters: null,
      fromCache: false,
      fallbackReason: err?.statusCode ? `http-${err.statusCode}` : 'error-or-timeout'
    };
  }
}

export function extractAllowedGroundings(briefPacket) {
  const groundedPayload = {
    id: briefPacket?.id || null,
    name: briefPacket?.name || null,
    sector: briefPacket?.sector || null,
    hqCity: briefPacket?.hqCity || null,
    country: briefPacket?.country || null,
    foundingDate: briefPacket?.foundingDate || null,
    companiesHouseNumber: briefPacket?.companiesHouseNumber || null,
    employeeCount: briefPacket?.employeeCount ?? null,
    headcountAtLastRound: briefPacket?.headcountAtLastRound ?? null,
    headcountGrowthPct: briefPacket?.headcountGrowthPct ?? null,
    rounds: (briefPacket?.rounds || []).map((r) => ({
      type: r.type,
      date: r.date,
      amountEurM: r.amountEurM,
      leadInvestorName: r.leadInvestorName,
      investorNames: r.investorNames,
      sourceIds: (r.sources || []).map((s) => s.id)
    })),
    employeeCountSeries: (briefPacket?.employeeCountSeries || []).map((obs) => ({
      date: obs.date,
      value: obs.value,
      sourceRank: obs.sourceRank,
      sourceId: obs.sourceId || null
    })),
    financialMetrics: (briefPacket?.financialMetrics || []).map((m) => ({
      year: m.year || (m.periodEnd ? Number(m.periodEnd.slice(0, 4)) : null),
      periodEnd: m.periodEnd,
      cashEurM: m.cashEurM,
      netAssetsEurM: m.netAssetsEurM,
      creditorsEurM: m.creditorsEurM,
      runwayMonthsEst: m.runwayMonthsEst,
      sourceRank: m.sourceRank || 'FILING',
      sourceId: m.sourceId || null
    })),
    corporateEvents: (briefPacket?.corporateEvents || []).map((ev) => ({
      type: ev.type,
      name: ev.name,
      eventDate: ev.eventDate,
      amountEurM: ev.amountEurM ?? null,
      sourceRank: ev.sourceRank,
      sourceId: ev.sourceId || null
    })),
    alumniSpinout: briefPacket?.alumniSpinout || null,
    sources: (briefPacket?.sources || []).map((s) => ({
      id: s.id,
      title: s.title,
      publisher: s.publisher,
      date: s.date,
      sourceRank: s.sourceRank
    })),
    notFoundInCala: briefPacket?.notFoundInCala || []
  };

  const jsonStr = JSON.stringify(groundedPayload);
  const allowedYears = new Set(jsonStr.match(/\b(?:19|20)\d{2}\b/g) || []);
  const allowedNumbers = new Set(
    (jsonStr.match(/\b\d+(?:\.\d+)?\b/g) || []).map((token) => Number(token))
  );
  const allowedSourceIds = new Set(
    [
      ...(groundedPayload.sources || []).map((s) => s.id),
      ...(groundedPayload.rounds || []).flatMap((r) => r.sourceIds || []),
      ...(groundedPayload.financialMetrics || []).map((m) => m.sourceId),
      ...(groundedPayload.corporateEvents || []).map((e) => e.sourceId),
      ...(groundedPayload.employeeCountSeries || []).map((o) => o.sourceId),
      groundedPayload.alumniSpinout?.sourceId
    ].filter(Boolean)
  );

  return { groundedPayload, allowedYears, allowedNumbers, allowedSourceIds };
}

/**
 * Enforces both `enforceFactCitations()` (exact Cala source IDs) and strict
 * numeric + 4-digit year grounding against pre-retrieved Cala JSON facts.
 */
function filterVerifiedBullets(rawBullets = [], { allowedYears, allowedNumbers, allowedSourceIds, useRegistryCheck = true }) {
  const preFiltered = (Array.isArray(rawBullets) ? rawBullets : [])
    .filter((b) => b && typeof b.text === 'string' && b.text.trim())
    .map((b) => ({
      text: b.text.trim(),
      sourceIds: [...new Set((b.sourceIds || []).filter((id) => allowedSourceIds.has(id)))]
    }));

  const cited = useRegistryCheck
    ? enforceFactCitations(preFiltered)
    : preFiltered.filter((b) => b.sourceIds.length > 0);
  let droppedCount = (Array.isArray(rawBullets) ? rawBullets.length : 0) - cited.length;

  const verified = [];
  for (const item of cited) {
    const bulletYears = item.text.match(/\b(?:19|20)\d{2}\b/g) || [];
    if (bulletYears.some((y) => !allowedYears.has(y))) {
      droppedCount += 1;
      continue;
    }

    const currencyValues = [];
    const currencyRe = /(?:€|EUR|£|GBP|\$|USD)\s*(\d+(?:[.,]\d+)?)\s*(?:[MBKmbk]|million|billion)?\b|(\d+(?:[.,]\d+)?)\s*(?:[MB]\b|million\b|billion\b)/g;
    let m;
    while ((m = currencyRe.exec(item.text)) !== null) {
      const rawNum = (m[1] || m[2] || '').replace(',', '.');
      if (rawNum) currencyValues.push(Number(rawNum));
    }
    if (currencyValues.some((num) => !Number.isFinite(num) || !allowedNumbers.has(num))) {
      droppedCount += 1;
      continue;
    }

    verified.push(item);
  }

  return {
    bullets: verified,
    droppedUnverifiedCount: droppedCount
  };
}

export function applyCitationAndNumericGate(rawBullets = [], briefPacket) {
  return filterVerifiedBullets(rawBullets, extractAllowedGroundings(briefPacket));
}

function buildDeterministicBriefBullets(briefPacket) {
  const candidates = [];
  const rounds = briefPacket?.rounds || [];
  const latest = rounds[rounds.length - 1];
  if (latest) {
    candidates.push({
      text: `${briefPacket.name} closed a €${latest.amountEurM}M ${latest.type} round on ${latest.date}${latest.leadInvestorName ? ` led by ${latest.leadInvestorName}` : ''}.`,
      sourceIds: (latest.sources || []).map((s) => s.id)
    });
  }
  const fins = briefPacket?.financialMetrics || [];
  const latestFin = fins[fins.length - 1];
  if (latestFin && briefPacket.companiesHouseNumber) {
    candidates.push({
      text: `UK Companies House #${briefPacket.companiesHouseNumber} (${latestFin.year || latestFin.periodEnd?.slice(0, 4)}) reported €${latestFin.cashEurM}M cash and €${latestFin.netAssetsEurM}M net assets.`,
      sourceIds: [latestFin.sourceId].filter(Boolean)
    });
  }
  if (briefPacket?.alumniSpinout?.priorCompany && briefPacket.alumniSpinout.sourceId) {
    candidates.push({
      text: `${briefPacket.alumniSpinout.name} (${briefPacket.alumniSpinout.role}) previously worked at ${briefPacket.alumniSpinout.priorCompany} until ${briefPacket.alumniSpinout.priorValidUntil}.`,
      sourceIds: [briefPacket.alumniSpinout.sourceId]
    });
  }
  return applyCitationAndNumericGate(candidates, briefPacket).bullets;
}

/**
 * Citation-Locked Brief Narrator: summarizes ONLY pre-retrieved Cala JSON facts
 * and coverage gaps, passing every output sentence through `enforceFactCitations()`
 * plus numeric and 4-digit year grounding guards.
 */
export async function narrateBriefWithCitationGate(briefPacket, options = {}) {
  if (!briefPacket) {
    return {
      controlPlaneMode: 'deterministic-fallback',
      bullets: [],
      droppedUnverifiedCount: 0,
      coverageGaps: []
    };
  }

  const { groundedPayload } = extractAllowedGroundings(briefPacket);
  const apiKey = options.apiKey ?? process.env.ANTHROPIC_API_KEY ?? '';
  if (!apiKey) {
    return {
      controlPlaneMode: 'deterministic-fallback',
      bullets: buildDeterministicBriefBullets(briefPacket),
      droppedUnverifiedCount: 0,
      coverageGaps: briefPacket.notFoundInCala || []
    };
  }

  const cache = options.cache || briefNarratorCache;
  const cacheKey = `${briefPacket.id}:${briefPacket.matchContext?.suitabilityScore ?? 'standalone'}:${groundedPayload.sources.length}`;
  if (cache.has(cacheKey)) {
    return { ...cache.get(cacheKey), fromCache: true };
  }

  const systemPrompt = [
    'Strict citation-locked narrator. Summarize ONLY facts in input JSON. Never invent numbers, years, revenue, ARR, or investors.',
    'Output ONE compact single-line JSON only (no fences): {"bullets":[{"text":"short 1-sentence fact","sourceIds":["exact-id"]}]}. Max 3 short bullets.',
    'Every bullet MUST include exact sourceIds from input.sources and ONLY currency amounts/years from input JSON.'
  ].join('\n');

  try {
    const rawText = await callAnthropicMessages({
      apiKey,
      model: options.model || process.env.ANTHROPIC_MODEL || DEFAULT_ANTHROPIC_MODEL,
      systemPrompt,
      userContent: JSON.stringify(groundedPayload),
      maxTokens: 280,
      timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      fetchFn: options.fetchFn || globalThis.fetch
    });
    const parsed = JSON.parse(stripJsonCodeFences(rawText));
    const gated = applyCitationAndNumericGate(parsed?.bullets || [], briefPacket);
    if (!gated.bullets.length) {
      return {
        controlPlaneMode: 'deterministic-fallback',
        bullets: buildDeterministicBriefBullets(briefPacket),
        droppedUnverifiedCount: gated.droppedUnverifiedCount,
        coverageGaps: briefPacket.notFoundInCala || []
      };
    }
    const result = {
      controlPlaneMode: 'anthropic-citation-narrator',
      bullets: gated.bullets,
      droppedUnverifiedCount: gated.droppedUnverifiedCount,
      coverageGaps: briefPacket.notFoundInCala || []
    };
    if (cache.size > 100) {
      const firstKey = cache.keys().next().value;
      cache.delete(firstKey);
    }
    cache.set(cacheKey, result);
    return result;
  } catch {
    return {
      controlPlaneMode: 'deterministic-fallback',
      bullets: buildDeterministicBriefBullets(briefPacket),
      droppedUnverifiedCount: 0,
      coverageGaps: briefPacket.notFoundInCala || []
    };
  }
}

function buildDeterministicConnectionInsight(packet = {}) {
  const sourceIds = (packet.sources || []).map((s) => s.id).filter(Boolean);
  const topSourceId = sourceIds[0] || null;
  const facts = Array.isArray(packet.facts) ? packet.facts : [];
  const bullets = [];

  for (const f of facts.slice(0, 3)) {
    const text = String(f?.text || '').trim();
    const ids = (f?.sourceIds || []).filter(Boolean);
    const chosen = ids.length ? ids : topSourceId ? [topSourceId] : [];
    if (text && chosen.length) {
      bullets.push({ text, sourceIds: chosen });
    }
  }

  const gapList = Array.isArray(packet.gaps) ? packet.gaps.filter(Boolean) : [];
  const question = gapList.length
    ? `Verify missing Cala coverage (${gapList.slice(0, 2).join(', ')}) during primary diligence.`
    : `Confirm strategic context and recency of ${packet.title || 'this Cala relationship'} directly with founders or co-investors.`;

  return {
    summary: String(packet.whyMatters || facts[0]?.text || `${packet.title || 'Relationship'} verified in Cala Knowledge Graph.`).trim(),
    bullets,
    question
  };
}

/**
 * Citation-Locked Connection & Entity Analyzer: generates grounded investment
 * takeaways strictly from verified Cala graph facts, edges, and source IDs.
 */
export async function analyzeConnectionWithCitationGate(packet = {}, options = {}) {
  if (!packet || typeof packet !== 'object') {
    return {
      controlPlaneMode: 'deterministic-fallback',
      summary: 'No verified Cala packet provided.',
      insights: [],
      question: '',
      droppedUnverifiedCount: 0
    };
  }

  const cleanSources = (Array.isArray(packet.sources) ? packet.sources : [])
    .filter((s) => s && s.id)
    .slice(0, 12)
    .map((s) => ({
      id: String(s.id),
      title: sanitizeShortText(s.title || s.publisher || s.id, 90) || String(s.id),
      publisher: sanitizeShortText(s.publisher || 'Cala Knowledge Graph', 60) || 'Cala Knowledge Graph',
      date: s.date ? String(s.date).slice(0, 10) : null,
      sourceRank: String(s.sourceRank || 'AGGREGATOR')
    }));

  const groundedPacket = {
    mode: packet.mode === 'entity' ? 'entity' : 'connection',
    title: sanitizeShortText(packet.title || '', 120) || 'Cala Relationship',
    hopType: sanitizeShortText(packet.hopType || '', 60),
    relation: sanitizeShortText(packet.relation || '', 60),
    roundSummary: sanitizeShortText(packet.roundSummary || '', 90),
    date: packet.date ? String(packet.date).slice(0, 10) : null,
    whyMatters: sanitizeShortText(packet.whyMatters || '', 220),
    facts: (Array.isArray(packet.facts) ? packet.facts : []).slice(0, 8).map((f) => ({
      text: String(f?.text || '').slice(0, 220),
      date: f?.date ? String(f.date).slice(0, 10) : null,
      tier: f?.tier || null,
      sourceIds: Array.isArray(f?.sourceIds) ? f.sourceIds.filter(Boolean).slice(0, 4) : []
    })),
    syndicatePeers: (Array.isArray(packet.syndicatePeers) ? packet.syndicatePeers : []).slice(0, 8),
    gaps: (Array.isArray(packet.gaps) ? packet.gaps : []).slice(0, 6),
    sources: cleanSources
  };

  const fallback = buildDeterministicConnectionInsight(groundedPacket);
  const apiKey = options.apiKey ?? process.env.ANTHROPIC_API_KEY ?? '';
  if (!apiKey || !cleanSources.length) {
    return {
      controlPlaneMode: 'deterministic-fallback',
      summary: fallback.summary,
      insights: fallback.bullets,
      question: fallback.question,
      droppedUnverifiedCount: 0
    };
  }

  const cache = options.cache || connectionInsightCache;
  const cacheKey = `${groundedPacket.mode}:${groundedPacket.title}:${groundedPacket.facts.length}:${cleanSources.map((s) => s.id).join(',')}`;
  if (cache.has(cacheKey)) {
    return { ...cache.get(cacheKey), fromCache: true };
  }

  const jsonStr = JSON.stringify(groundedPacket);
  const groundings = {
    allowedYears: new Set(jsonStr.match(/\b(?:19|20)\d{2}\b/g) || []),
    allowedNumbers: new Set((jsonStr.match(/\b\d+(?:\.\d+)?\b/g) || []).map((n) => Number(n))),
    allowedSourceIds: new Set(cleanSources.map((s) => s.id)),
    useRegistryCheck: false
  };

  const systemPrompt = [
    'Strict VC investment-diligence analyst grounded ONLY in input JSON.',
    'Analyze why the connection or entity graph matters for deal access, operator lineage, timing, or competitive caution.',
    'NEVER invent numbers, round sizes, dates, or entities not present in input JSON.',
    'Output ONE compact single-line JSON only (no markdown fences):',
    '{"summary":"20-35 word crisp investment takeaway","insights":[{"text":"1 sharp verified insight","sourceIds":["exact-source-id"]}],"question":"1 concrete next diligence question"}.',
    'Max 3 insights. Every insight MUST cite at least 1 exact sourceId from input.sources.'
  ].join('\n');

  try {
    const rawText = await callAnthropicMessages({
      apiKey,
      model: options.model || process.env.ANTHROPIC_MODEL || DEFAULT_ANTHROPIC_MODEL,
      systemPrompt,
      userContent: jsonStr,
      maxTokens: 340,
      timeoutMs: options.timeoutMs ?? 6000,
      fetchFn: options.fetchFn || globalThis.fetch
    });
    const parsed = JSON.parse(stripJsonCodeFences(rawText));
    const gated = filterVerifiedBullets(parsed?.insights || [], groundings);
    if (!gated.bullets.length) {
      return {
        controlPlaneMode: 'deterministic-fallback',
        summary: fallback.summary,
        insights: fallback.bullets,
        question: fallback.question,
        droppedUnverifiedCount: gated.droppedUnverifiedCount
      };
    }

    const rawSummary = typeof parsed?.summary === 'string' ? parsed.summary.trim() : '';
    const summaryYears = rawSummary.match(/\b(?:19|20)\d{2}\b/g) || [];
    const safeSummary = rawSummary && !summaryYears.some((y) => !groundings.allowedYears.has(y))
      ? rawSummary.slice(0, 260)
      : fallback.summary;
    const rawQuestion = typeof parsed?.question === 'string' ? parsed.question.trim() : '';
    const safeQuestion = rawQuestion ? rawQuestion.slice(0, 220) : fallback.question;

    const result = {
      controlPlaneMode: 'anthropic-connection-analyst',
      summary: safeSummary,
      insights: gated.bullets.slice(0, 3),
      question: safeQuestion,
      droppedUnverifiedCount: gated.droppedUnverifiedCount
    };
    if (cache.size > 150) {
      const firstKey = cache.keys().next().value;
      cache.delete(firstKey);
    }
    cache.set(cacheKey, result);
    return result;
  } catch {
    return {
      controlPlaneMode: 'deterministic-fallback',
      summary: fallback.summary,
      insights: fallback.bullets,
      question: fallback.question,
      droppedUnverifiedCount: 0
    };
  }
}
