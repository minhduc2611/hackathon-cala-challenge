import {
  COMPANIES,
  COMPANY_LINKEDIN_LEADERS,
  FUNDS,
  LINKEDIN_BRIDGES,
  PEER_INVESTORS,
  REFERENCE_DATE,
  SOURCES
} from './data.mjs';

const SECTOR_ADJACENCY = {
  'AI & ML': ['DeepTech', 'B2B SaaS'],
  'DeepTech': ['AI & ML', 'Climate Tech'],
  'HealthTech': ['AI & ML', 'DeepTech'],
  'Fintech': ['B2B SaaS', 'AI & ML'],
  'Climate Tech': ['DeepTech', 'AI & ML'],
  'B2B SaaS': ['AI & ML', 'Fintech']
};

const NEXT_STAGE = {
  'Pre-Seed': 'Seed',
  'Seed': 'Series A',
  'Series A': 'Series B',
  'Series B': 'Series B'
};

export function monthsBetween(startIso, endIso = REFERENCE_DATE) {
  const start = new Date(startIso);
  const end = new Date(endIso);
  const days = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);
  return Math.max(0, Math.round((days / 30.4375) * 10) / 10);
}

export function subtractMonths(isoDate, months) {
  const d = new Date(isoDate);
  d.setUTCMonth(d.getUTCMonth() - months);
  return d.toISOString().slice(0, 10);
}

export function median(values) {
  const nums = values.filter((v) => typeof v === 'number' && Number.isFinite(v)).sort((a, b) => a - b);
  if (!nums.length) return null;
  const mid = Math.floor(nums.length / 2);
  if (nums.length % 2 === 1) return Math.round(nums[mid] * 10) / 10;
  return Math.round(((nums[mid - 1] + nums[mid]) / 2) * 10) / 10;
}

export function interpolateHeadcountAtDate(company, isoDate, cutoffDate = null) {
  const rawSeries = Array.isArray(company?.employeeCountSeries) ? company.employeeCountSeries : [];
  const series = rawSeries
    .filter((obs) => !cutoffDate || obs.date < cutoffDate)
    .sort((a, b) => a.date.localeCompare(b.date));

  if (!series.length) {
    return {
      headcount: Number(company?.employeeCount || 12),
      preRoundVelocityPct: 0,
      observationDate: cutoffDate || REFERENCE_DATE,
      sourceId: company?.rounds?.[0]?.sourceIds?.[0] || null
    };
  }

  const targetDate = isoDate || cutoffDate || REFERENCE_DATE;
  const exact = series.find((obs) => obs.date === targetDate);
  const onOrBefore = series.filter((obs) => obs.date <= targetDate);
  const after = series.filter((obs) => obs.date > targetDate);

  let headcount;
  let usedObs;

  if (exact) {
    headcount = exact.value;
    usedObs = exact;
  } else if (onOrBefore.length > 0 && after.length > 0) {
    const prev = onOrBefore[onOrBefore.length - 1];
    const next = after[0];
    const spanMs = Math.max(1, new Date(next.date).getTime() - new Date(prev.date).getTime());
    const elapsedMs = Math.max(0, new Date(targetDate).getTime() - new Date(prev.date).getTime());
    const ratio = Math.min(1, elapsedMs / spanMs);
    headcount = Math.round(prev.value + (next.value - prev.value) * ratio);
    usedObs = prev;
  } else if (onOrBefore.length > 0) {
    usedObs = onOrBefore[onOrBefore.length - 1];
    headcount = usedObs.value;
  } else {
    usedObs = series[0];
    headcount = usedObs.value;
  }

  const earlierObs = series.filter((obs) => obs.date < (exact ? exact.date : targetDate));
  const baseline = earlierObs.length > 1 ? earlierObs[earlierObs.length - 1] : earlierObs[0];
  let preRoundVelocityPct = 0;
  if (baseline && baseline.value > 0 && headcount >= baseline.value) {
    preRoundVelocityPct = Math.round(((headcount - baseline.value) / baseline.value) * 100);
  }

  return {
    headcount,
    preRoundVelocityPct,
    observationDate: usedObs.date,
    sourceId: usedObs.sourceId || null
  };
}

function normalizeDistribution(weightMap) {
  const entries = Object.entries(weightMap).filter(([, val]) => val.weight > 0);
  const totalWeight = entries.reduce((sum, [, val]) => sum + val.weight, 0);
  if (totalWeight <= 0) return [];
  return entries
    .map(([label, val]) => ({
      label,
      count: val.count,
      weightedScore: Math.round(val.weight * 10) / 10,
      sharePct: Math.round((val.weight / totalWeight) * 100)
    }))
    .sort((a, b) => b.sharePct - a.sharePct || b.count - a.count || a.label.localeCompare(b.label));
}

export function deriveSourceProvenance(source) {
  if (!source) return { sourceRank: 'PRESS', datePrecision: 'month' };
  const explicitRank = source.sourceRank || source.source_rank;
  const hay = `${source.publisher || ''} ${source.title || ''} ${source.name || ''}`.toLowerCase();
  let sourceRank = explicitRank || 'PRESS';
  if (!explicitRank) {
    if (/(prh|trade register|bolagsverket|bronnoy|brønnøysund|virk|companies house|gleif|registry|patent|echa|tax|grant|esa|business finland|vinnova|eic|filing|sec|ytj|regulatory)/.test(hay)) {
      sourceRank = 'FILING';
    } else if (/(press release|official|portfolio|announcement|disclosure|company|investor|blog|direct)/.test(hay)) {
      sourceRank = 'PRIMARY';
    } else if (/(dealroom|pitchbook|crunchbase|tracxn|cb insights|archive)/.test(hay)) {
      sourceRank = 'AGGREGATOR';
    }
  }
  const explicitPrec = source.datePrecision || source.date_precision;
  let datePrecision = explicitPrec || 'month';
  if (!explicitPrec && typeof source.date === 'string') {
    if (/^\d{4}-\d{2}-\d{2}$/.test(source.date)) datePrecision = 'day';
    else if (/^\d{4}-\d{2}$/.test(source.date)) datePrecision = 'month';
    else if (/^\d{4}$/.test(source.date)) datePrecision = 'year';
  }
  return { sourceRank, datePrecision };
}

export function resolveSources(sourceIds = []) {
  return sourceIds
    .map((id) => SOURCES[id])
    .filter(Boolean)
    .map((s) => ({ ...s, ...deriveSourceProvenance(s) }));
}

/**
 * Enforces Q31: every generated reason sentence must carry at least one valid Cala source ID.
 * Sentences without valid source IDs are dropped.
 */
export function enforceFactCitations(reasons = []) {
  return reasons
    .map((r) => {
      const validIds = (r.sourceIds || []).filter((id) => Boolean(SOURCES[id]));
      if (!validIds.length) return null;
      return {
        text: r.text,
        sourceIds: validIds,
        sources: resolveSources(validIds)
      };
    })
    .filter(Boolean);
}

export function searchEntities(rawQuery = '') {
  const query = String(rawQuery || '').trim().toLowerCase();
  if (!query) {
    return {
      query: '',
      ambiguousFunds: false,
      funds: FUNDS.slice(0, 3).map((f) => ({ id: f.id, name: f.name, hqCity: f.hqCity, country: f.country, calaEntityId: f.calaEntityId })),
      companies: COMPANIES.slice(0, 5).map((c) => ({ id: c.id, name: c.name, sector: c.sector, country: c.country }))
    };
  }

  const fundMatches = FUNDS.filter(
    (f) => f.name.toLowerCase().includes(query) || f.hqCity.toLowerCase().includes(query) || f.country.toLowerCase().includes(query)
  );
  const companyMatches = COMPANIES.filter(
    (c) =>
      c.name.toLowerCase().includes(query) ||
      c.sector.toLowerCase().includes(query) ||
      c.country.toLowerCase().includes(query)
  );

  return {
    query: rawQuery.trim(),
    ambiguousFunds: fundMatches.length > 1,
    funds: fundMatches.slice(0, 3).map((f) => ({
      id: f.id,
      name: f.name,
      hqCity: f.hqCity,
      country: f.country,
      calaEntityId: f.calaEntityId
    })),
    companies: companyMatches.slice(0, 6).map((c) => ({
      id: c.id,
      name: c.name,
      sector: c.sector,
      country: c.country,
      calaEntityId: c.calaEntityId
    }))
  };
}

function addToBucket(map, key, weight) {
  if (!map[key]) map[key] = { count: 0, weight: 0 };
  map[key].count += 1;
  map[key].weight += weight;
}

function analyzeStatedVsRevealed(statedText, sectorMix, geographyMix, stageMix, timeTravelProfile = null, upstreamFeeders = []) {
  const text = String(statedText || '').toLowerCase();
  const topSector = sectorMix[0];
  const topTwoSectorShare = (sectorMix[0]?.sharePct || 0) + (sectorMix[1]?.sharePct || 0);
  const topCountry = geographyMix[0];
  const topStage = stageMix[0];
  const findings = [];

  if (text.includes('agnostic') || text.includes('broad') || text.includes('consumer')) {
    if (topTwoSectorShare >= 65) {
      findings.push(
        `Website claims broad or agnostic investing, yet ${topTwoSectorShare}% of weighted deal history concentrates in ${sectorMix.slice(0, 2).map((s) => s.label).join(' and ')}.`
      );
    }
  }
  if (topSector && !text.includes(topSector.label.toLowerCase().split(' ')[0])) {
    findings.push(
      `Primary revealed sector (${topSector.label} at ${topSector.sharePct}% weighted share) receives little explicit emphasis in stated copy.`
    );
  }
  if (topCountry && topCountry.sharePct >= 50) {
    findings.push(
      `Geographic behaviour is tightly concentrated: ${topCountry.sharePct}% of weighted rounds are headquartered in ${topCountry.label}.`
    );
  }
  if (topStage) {
    findings.push(
      `Actual entry discipline centres on ${topStage.label} (${topStage.sharePct}% weighted share), confirming stage alignment.`
    );
  }
  if (timeTravelProfile?.medianEntryHeadcount != null) {
    findings.push(
      `Time-travel entry DNA: writes checks at a median of ${timeTravelProfile.medianEntryHeadcount} employees (${timeTravelProfile.entryHeadcountBand}), ~${timeTravelProfile.medianEntryAgeMonths} months post-incorporation (${timeTravelProfile.filingVerifiedSharePct}% FILING/PRIMARY verified).`
    );
  }
  if (upstreamFeeders.length > 0) {
    findings.push(
      `Upstream feeder reliance: ${upstreamFeeders.slice(0, 2).map((f) => `${f.name} (${f.fedDealsCount}x prior round)`).join(' and ')} backed Round N-1 ahead of follow-on entry.`
    );
  }
  if (!findings.length) {
    findings.push('Public stated thesis aligns broadly with observed Cala sector and stage records.');
  }
  return findings;
}

export function computeRevealedThesis(input, options = {}) {
  const cutoffDate = options.cutoffDate || null;
  const evalDate = cutoffDate || REFERENCE_DATE;
  const recencyCutoff = subtractMonths(evalDate, 36);

  const mode = input?.mode === 'companies' ? 'companies' : 'fund';
  let entity = null;
  const deals = [];
  const portfolioCompanyIds = new Set();
  const portfolioCompetitorGroups = new Map();

  if (mode === 'fund') {
    const fundId = input?.fundId;
    entity = FUNDS.find((f) => f.id === fundId || f.name.toLowerCase() === String(fundId || '').toLowerCase());
    if (!entity) {
      const err = new Error(`Fund "${fundId}" was not found in indexed Cala entities.`);
      err.statusCode = 404;
      throw err;
    }

    for (const company of COMPANIES) {
      for (const round of company.rounds) {
        if (cutoffDate && round.date >= cutoffDate) continue;
        if (round.investorIds.includes(entity.id)) {
          deals.push({ company, round });
          portfolioCompanyIds.add(company.id);
          if (company.competitorGroup) {
            portfolioCompetitorGroups.set(company.competitorGroup, company.name);
          }
        }
      }
    }
  } else {
    const companyIds = Array.isArray(input?.companyIds) ? input.companyIds : [];
    if (!companyIds.length) {
      const err = new Error('Please provide 3 to 5 company IDs to construct a proxy thesis.');
      err.statusCode = 400;
      throw err;
    }
    const matchedCompanies = COMPANIES.filter((c) => companyIds.includes(c.id));
    if (!matchedCompanies.length) {
      const err = new Error('None of the selected companies were found in Cala.');
      err.statusCode = 404;
      throw err;
    }
    entity = {
      id: 'custom-proxy',
      name: `Proxy Profile (${matchedCompanies.map((c) => c.name).slice(0, 3).join(', ')}${matchedCompanies.length > 3 ? '...' : ''})`,
      hqCity: matchedCompanies[0].hqCity,
      country: matchedCompanies[0].country,
      region: matchedCompanies[0].region,
      statedThesis: options.statedThesisOverride || 'Custom thesis inferred from user-selected admired companies.',
      sourceIds: matchedCompanies.flatMap((c) => c.rounds[0]?.sourceIds || [])
    };
    for (const company of matchedCompanies) {
      portfolioCompanyIds.add(company.id);
      if (company.competitorGroup) {
        portfolioCompetitorGroups.set(company.competitorGroup, company.name);
      }
      for (const round of company.rounds) {
        if (cutoffDate && round.date >= cutoffDate) continue;
        deals.push({ company, round });
      }
    }
  }

  deals.sort((a, b) => b.round.date.localeCompare(a.round.date));

  const stageBuckets = {};
  const sectorBuckets = {};
  const olderSectorBuckets = {};
  const recentSectorBuckets = {};
  const countryBuckets = {};
  const regionBuckets = {};
  const coInvestorMap = {};
  const companyRoundCounts = {};
  const roundAmounts = [];
  const dealDates = [];
  let leadCount = 0;
  let recentCount = 0;
  let olderCount = 0;

  const entryHeadcounts = [];
  const entryAgeMonthsList = [];
  const preRoundVelocities = [];
  const dealSnapshots = [];
  let filingVerifiedDeals = 0;

  const entryByCompany = new Map();
  for (const { company, round } of [...deals].sort((a, b) => a.round.date.localeCompare(b.round.date))) {
    if (!entryByCompany.has(company.id)) {
      entryByCompany.set(company.id, { company, round });
    }
  }

  for (const { company, round } of [...entryByCompany.values()].sort((a, b) => b.round.date.localeCompare(a.round.date))) {
    const entryObs = interpolateHeadcountAtDate(company, round.date, cutoffDate);
    const foundingIso = company.foundingDate || `${company.foundedYear}-02-15`;
    const entryAgeMonths = monthsBetween(foundingIso, round.date);
    const resolvedSrcs = resolveSources(round.sourceIds || []);
    const hasFilingOrPrimary = resolvedSrcs.some((s) => s.sourceRank === 'FILING' || s.sourceRank === 'PRIMARY');
    if (hasFilingOrPrimary) filingVerifiedDeals += 1;

    entryHeadcounts.push(entryObs.headcount);
    entryAgeMonthsList.push(entryAgeMonths);
    preRoundVelocities.push(entryObs.preRoundVelocityPct);
    dealSnapshots.push({
      companyId: company.id,
      companyName: company.name,
      roundType: round.type,
      roundDate: round.date,
      entryHeadcount: entryObs.headcount,
      entryAgeMonths,
      preRoundVelocityPct: entryObs.preRoundVelocityPct
    });
  }

  const totalEntryDeals = entryByCompany.size || deals.length;

  for (const { company, round } of deals) {
    const isRecent = round.date >= recencyCutoff;
    const weight = isRecent ? 2.0 : 1.0;

    if (isRecent) {
      recentCount += 1;
      addToBucket(recentSectorBuckets, company.sector, 1);
    } else {
      olderCount += 1;
      addToBucket(olderSectorBuckets, company.sector, 1);
    }

    addToBucket(stageBuckets, round.type, weight);
    addToBucket(sectorBuckets, company.sector, weight);
    addToBucket(countryBuckets, company.country, weight);
    addToBucket(regionBuckets, company.region, weight);

    if (typeof round.amountEurM === 'number') roundAmounts.push(round.amountEurM);
    dealDates.push(round.date);
    companyRoundCounts[company.id] = (companyRoundCounts[company.id] || 0) + 1;

    if (mode === 'fund' && round.leadInvestorId === entity.id) {
      leadCount += 1;
    } else if (mode === 'companies' && round.leadInvestorId) {
      leadCount += 1;
    }

    for (const invId of round.investorIds) {
      if (mode === 'fund' && invId === entity.id) continue;
      if (invId === 'angel-syndicate') continue;
      if (!coInvestorMap[invId]) {
        coInvestorMap[invId] = {
          id: invId,
          name: PEER_INVESTORS[invId] || invId,
          sharedRounds: 0,
          companies: new Set(),
          sourceIds: new Set()
        };
      }
      coInvestorMap[invId].sharedRounds += 1;
      coInvestorMap[invId].companies.add(company.name);
      for (const sId of round.sourceIds || []) coInvestorMap[invId].sourceIds.add(sId);
    }
  }

  // Upstream "Feeder" Syndicate Graph: Round N-1 investors before target fund entered Round N
  const upstreamFeederMap = {};
  for (const compId of portfolioCompanyIds) {
    const company = COMPANIES.find((c) => c.id === compId);
    if (!company) continue;
    const compRounds = company.rounds
      .filter((r) => !cutoffDate || r.date < cutoffDate)
      .sort((a, b) => a.date.localeCompare(b.date));
    if (compRounds.length < 2) continue;

    let entryIdx = compRounds.length - 1;
    if (mode === 'fund') {
      const idx = compRounds.findIndex((r) => r.investorIds.includes(entity.id));
      if (idx <= 0) continue;
      entryIdx = idx;
    }

    for (let i = 0; i < entryIdx; i += 1) {
      const prevRound = compRounds[i];
      for (const invId of prevRound.investorIds) {
        if ((mode === 'fund' && invId === entity.id) || invId === 'angel-syndicate') continue;
        if (!upstreamFeederMap[invId]) {
          upstreamFeederMap[invId] = {
            id: invId,
            name: PEER_INVESTORS[invId] || invId,
            fedDealsCount: 0,
            companies: new Set(),
            sourceIds: new Set(),
            relationshipType: 'feeder_to_lead'
          };
        }
        upstreamFeederMap[invId].fedDealsCount += 1;
        upstreamFeederMap[invId].companies.add(company.name);
        for (const sId of prevRound.sourceIds || []) upstreamFeederMap[invId].sourceIds.add(sId);
      }
    }
  }

  const upstreamFeeders = Object.values(upstreamFeederMap)
    .map((f) => ({
      id: f.id,
      name: f.name,
      fedDealsCount: f.fedDealsCount,
      companies: [...f.companies],
      relationshipType: f.relationshipType,
      sourceIds: [...f.sourceIds]
    }))
    .sort((a, b) => b.fedDealsCount - a.fedDealsCount || a.name.localeCompare(b.name));

  const sortedHc = [...entryHeadcounts].sort((a, b) => a - b);
  const lowHc = sortedHc.length ? sortedHc[Math.floor(sortedHc.length * 0.2)] : null;
  const highHc = sortedHc.length ? sortedHc[Math.min(sortedHc.length - 1, Math.floor(sortedHc.length * 0.8))] : null;
  const entryHeadcountBand =
    lowHc === null
      ? 'Not enough rounds'
      : lowHc === highHc
        ? `${lowHc} employees at entry`
        : `${lowHc}-${highHc} employees at entry`;

  const timeTravelProfile = {
    medianEntryHeadcount: median(entryHeadcounts),
    entryHeadcountBand,
    medianEntryAgeMonths: median(entryAgeMonthsList),
    medianPreRoundVelocityPct: median(preRoundVelocities) ?? 0,
    filingVerifiedSharePct: totalEntryDeals > 0 ? Math.round((filingVerifiedDeals / totalEntryDeals) * 100) : 0,
    dealSnapshots: dealSnapshots.slice(0, 8)
  };

  const stageMix = normalizeDistribution(stageBuckets);
  const sectorMix = normalizeDistribution(sectorBuckets);
  const geographyMix = normalizeDistribution(countryBuckets);
  const regionMix = normalizeDistribution(regionBuckets);
  const olderSectors = normalizeDistribution(olderSectorBuckets);
  const recentSectors = normalizeDistribution(recentSectorBuckets);

  let driftSummary = 'Insufficient historical span to compute multi-year thesis drift.';
  if (recentCount > 0 && olderCount > 0) {
    const topRecent = recentSectors[0];
    const oldMatch = olderSectors.find((s) => s.label === topRecent?.label);
    const oldShare = oldMatch ? oldMatch.sharePct : 0;
    const topOld = olderSectors[0];
    if (topRecent && topRecent.sharePct - oldShare >= 15) {
      driftSummary = `Shifting toward ${topRecent.label}: rose from ${oldShare}% in older rounds to ${topRecent.sharePct}% in the last 3 years (2x recency weight).`;
    } else if (topOld && topRecent && topOld.label !== topRecent.label) {
      driftSummary = `Transitioning focus from ${topOld.label} (${topOld.sharePct}% older) toward ${topRecent.label} (${topRecent.sharePct}% in last 3 years).`;
    } else if (topRecent) {
      driftSummary = `Consistent conviction in ${topRecent.label} (${topRecent.sharePct}% of recent deals vs. ${oldShare}% historically).`;
    }
  } else if (recentCount > 0 && sectorMix[0]) {
    driftSummary = `Recent 3-year activity clusters in ${sectorMix[0].label} (${sectorMix[0].sharePct}% weighted share).`;
  }

  const topCoInvestors = Object.values(coInvestorMap)
    .map((ci) => ({
      id: ci.id,
      name: ci.name,
      sharedRounds: ci.sharedRounds,
      companies: [...ci.companies],
      sourceIds: [...ci.sourceIds]
    }))
    .sort((a, b) => b.sharedRounds - a.sharedRounds || a.name.localeCompare(b.name));

  let pacePerYear = 0;
  if (dealDates.length >= 2) {
    const oldest = new Date(dealDates[dealDates.length - 1]);
    const newest = new Date(dealDates[0]);
    const years = Math.max(1, (newest.getTime() - oldest.getTime()) / (1000 * 60 * 60 * 24 * 365.25));
    pacePerYear = Math.round((deals.length / years) * 10) / 10;
  } else {
    pacePerYear = deals.length;
  }

  const uniqueCompaniesCount = portfolioCompanyIds.size;
  const followOnCompanies = Object.values(companyRoundCounts).filter((c) => c >= 2).length;
  const followOnRatePct = uniqueCompaniesCount > 0 ? Math.round((followOnCompanies / uniqueCompaniesCount) * 100) : 0;
  const leadRatePct = deals.length > 0 ? Math.round((leadCount / deals.length) * 100) : 0;

  const statedText = options.statedThesisOverride || entity.statedThesis;
  const statedVsRevealed = analyzeStatedVsRevealed(
    statedText,
    sectorMix,
    geographyMix,
    stageMix,
    timeTravelProfile,
    upstreamFeeders
  );

  const portfolioList = [...portfolioCompanyIds]
    .map((id) => COMPANIES.find((c) => c.id === id))
    .filter(Boolean)
    .map((c) => ({
      id: c.id,
      name: c.name,
      sector: c.sector,
      country: c.country,
      latestRoundType: c.rounds[c.rounds.length - 1]?.type || 'Seed',
      latestRoundDate: c.rounds[c.rounds.length - 1]?.date || null,
      sourceIds: c.rounds.flatMap((r) => r.sourceIds || [])
    }));

  const weakProfile = mode === 'fund' ? deals.length < 5 : uniqueCompaniesCount < 3;

  return {
    mode,
    evalDate,
    fundId: entity.id,
    fundName: entity.name,
    calaEntityId: entity.calaEntityId || null,
    hqCity: entity.hqCity,
    country: entity.country,
    dealsAnalyzedCount: deals.length,
    portfolioCount: uniqueCompaniesCount,
    weakProfile,
    weakProfileNote: weakProfile
      ? `Only ${deals.length} known deals found in Cala (under the 5-deal reliability floor). Add 3 to 5 admired companies to strengthen the profile.`
      : null,
    stageMix,
    sectorMix,
    geographyMix,
    regionMix,
    medianRoundSizeEurM: median(roundAmounts),
    roundSizeLabel: 'Median size of rounds joined (individual cheque size not public in Cala)',
    leadRatePct,
    followOnRatePct,
    pacePerYear,
    lastDealDate: dealDates[0] || null,
    driftSummary,
    statedThesis: statedText,
    statedVsRevealed,
    timeTravelProfile,
    upstreamFeeders,
    topCoInvestors,
    portfolioCompanyIds: [...portfolioCompanyIds],
    portfolioCompetitorGroups: Object.fromEntries(portfolioCompetitorGroups),
    portfolioCompanies: portfolioList
  };
}

function getWeights(rankingMode) {
  if (rankingMode === 'untapped') {
    return { sector: 36, stage: 30, coInvestor: 0, geography: 20, roundSize: 14 };
  }
  if (rankingMode === 'warmest') {
    return { sector: 25, stage: 20, coInvestor: 35, geography: 12, roundSize: 8 };
  }
  return { sector: 30, stage: 25, coInvestor: 20, geography: 15, roundSize: 10 };
}

function buildCoInvestorPath(thesis, company, visibleRounds) {
  const coInvestorLookup = new Map((thesis.topCoInvestors || []).map((ci) => [ci.id, ci]));
  const feederLookup = new Map((thesis.upstreamFeeders || []).map((f) => [f.id, f]));
  let bestPath = null;

  for (const round of visibleRounds) {
    for (const invId of round.investorIds) {
      const ci = coInvestorLookup.get(invId);
      const feeder = feederLookup.get(invId);
      if (!ci && !feeder) continue;
      const isLead = round.leadInvestorId === invId;
      const sharedCount = ci?.sharedRounds || 0;
      const feederCount = feeder?.fedDealsCount || 0;
      const rankScore = sharedCount * 2 + feederCount * 2 + (isLead ? 1 : 0);
      if (!bestPath || rankScore > bestPath.rankScore) {
        const invName = ci?.name || feeder?.name || PEER_INVESTORS[invId] || invId;
        const sampleCompanies = (ci?.companies || feeder?.companies || []).slice(0, 2);
        const sourceIds = [
          ...new Set([
            ...(ci?.sourceIds || []).slice(0, 1),
            ...(feeder?.sourceIds || []).slice(0, 1),
            ...(round.sourceIds || []).slice(0, 1)
          ])
        ];
        const summary = feeder
          ? `Upstream feeder ${invName} (${feederCount}x Round N-1 feeder${sampleCompanies.length ? `: ${sampleCompanies.join(', ')}` : ''}) ${isLead ? 'led' : 'backed'} ${company.name} ${round.type} (${round.date.slice(0, 7)}).`
          : `Co-invested with ${invName} ${sharedCount}x (${sampleCompanies.join(', ')}); ${invName} ${isLead ? 'led' : 'joined'} ${company.name} ${round.type} (${round.date.slice(0, 7)}).`;
        bestPath = {
          rankScore,
          coInvestorId: invId,
          coInvestorName: invName,
          sharedCount,
          feederDealsCount: feederCount,
          isUpstreamFeeder: Boolean(feeder),
          pathwayType: feeder ? 'feeder_to_lead' : 'same_round_syndicate',
          sharedPortfolioSample: sampleCompanies,
          startupRole: isLead ? 'led' : 'joined',
          roundType: round.type,
          roundDate: round.date,
          sourceIds,
          summary
        };
      }
    }
  }
  return bestPath;
}

function extractCandidateSignals(company, visibleRounds, evalDate, cutoffDate = null, coInvestorPath = null) {
  const sortedRounds = [...(visibleRounds || [])].sort((a, b) => a.date.localeCompare(b.date));
  const latestRound = sortedRounds[sortedRounds.length - 1] || null;
  const visibleSeries = (company.employeeCountSeries || [])
    .filter((pt) => !cutoffDate || pt.date < cutoffDate)
    .sort((a, b) => a.date.localeCompare(b.date));
  const visibleCorpEvents = (company.corporateEvents || [])
    .filter((ev) => !cutoffDate || ev.eventDate < cutoffDate)
    .sort((a, b) => a.eventDate.localeCompare(b.eventDate));
  const visibleFinMetrics = (company.financialMetrics || [])
    .filter((m) => !cutoffDate || (m.filingDate || m.periodEnd) < cutoffDate)
    .sort((a, b) => (a.periodEnd || '').localeCompare(b.periodEnd || ''));
  const visibleDomains = (company.domainHistory || [])
    .filter((d) => !cutoffDate || d.validSince < cutoffDate);

  const entryObs = latestRound
    ? interpolateHeadcountAtDate(company, latestRound.date, cutoffDate)
    : interpolateHeadcountAtDate(company, evalDate, cutoffDate);
  const latestObs = interpolateHeadcountAtDate(company, evalDate, cutoffDate);

  const headcountAtLastRound = entryObs.headcount;
  const currentObservedEmp = latestObs.headcount;
  const headcountGrowthPct =
    headcountAtLastRound > 0
      ? Math.max(0, Math.round(((currentObservedEmp - headcountAtLastRound) / headcountAtLastRound) * 100))
      : 0;

  const alumniRole = (company.peopleCoverage?.roles || []).find((r) => Boolean(r.priorCompany)) || null;
  const alumniSpinout = alumniRole
    ? {
        name: alumniRole.name,
        role: alumniRole.role,
        relation: alumniRole.relation,
        validSince: alumniRole.validSince,
        priorCompany: alumniRole.priorCompany,
        priorRole: alumniRole.priorRole,
        priorValidUntil: alumniRole.priorValidUntil,
        sourceId: alumniRole.sourceId || latestRound?.sourceIds?.[0] || null
      }
    : null;

  const arbitrageSignals = [];
  const filingEvent = visibleCorpEvents.find((ev) => ev.unannouncedFiling);
  if (filingEvent) {
    arbitrageSignals.push({
      type: 'filing_arbitrage',
      label: filingEvent.name,
      detail: filingEvent.summary,
      date: filingEvent.eventDate,
      sourceRank: 'FILING',
      sourceIds: [filingEvent.sourceId, ...(latestRound?.sourceIds || [])].filter((id) => id && SOURCES[id])
    });
  }

  if (headcountGrowthPct >= 30) {
    arbitrageSignals.push({
      type: 'headcount_velocity',
      label: `+${headcountGrowthPct}% team growth`,
      detail: `Team expanded ${headcountAtLastRound} to ${currentObservedEmp} employees since ${latestRound?.type || 'last round'}.`,
      date: latestObs.observationDate,
      sourceRank: visibleSeries[visibleSeries.length - 1]?.sourceRank || 'PRIMARY',
      sourceIds: [latestObs.sourceId, ...(latestRound?.sourceIds || [])].filter((id) => id && SOURCES[id])
    });
  }

  const latestFin = visibleFinMetrics[visibleFinMetrics.length - 1] || null;
  if (latestFin) {
    arbitrageSignals.push({
      type: 'companies_house_metric',
      label: `Companies House #${company.companiesHouseNumber}`,
      detail: `Cash EUR ${latestFin.cashEurM}M, net assets EUR ${latestFin.netAssetsEurM}M (~${latestFin.runwayMonthsEst}m runway est.).`,
      date: latestFin.filingDate || latestFin.periodEnd,
      sourceRank: 'FILING',
      sourceIds: [latestFin.sourceId].filter((id) => id && SOURCES[id])
    });
  }

  const activeAiDomain = visibleDomains.find((d) => d.status === 'ACTIVE' && d.domain.endsWith('.ai'));
  if (activeAiDomain && visibleDomains.some((d) => d.status === 'INACTIVE')) {
    arbitrageSignals.push({
      type: 'domain_shift',
      label: `Domain upgrade -> ${activeAiDomain.domain}`,
      detail: `HAS_DOMAIN_NAME activated ${activeAiDomain.domain} on ${activeAiDomain.validSince}.`,
      date: activeAiDomain.validSince,
      sourceRank: 'PRIMARY',
      sourceIds: [...(latestRound?.sourceIds || [])].filter((id) => id && SOURCES[id])
    });
  }

  if (alumniSpinout) {
    arbitrageSignals.push({
      type: 'alumni_lineage',
      label: `Ex-${alumniSpinout.priorCompany} founder`,
      detail: `${alumniSpinout.name} (${alumniSpinout.priorRole}, until ${alumniSpinout.priorValidUntil}) -> ${alumniSpinout.role}.`,
      date: alumniSpinout.validSince,
      sourceRank: 'FILING',
      sourceIds: [alumniSpinout.sourceId, ...(latestRound?.sourceIds || [])].filter((id) => id && SOURCES[id])
    });
  }

  const monthsSince = latestRound ? monthsBetween(latestRound.date, evalDate) : 0;
  const raisingSoon = monthsSince >= 12 && monthsSince <= 24;

  let whyNowTrigger = '';
  if (filingEvent) {
    whyNowTrigger = `New ${company.country === 'United Kingdom' ? 'Companies House SH01' : 'registry'} filing (${filingEvent.eventDate.slice(0, 7)})`;
  } else if (headcountGrowthPct >= 35) {
    whyNowTrigger = `+${headcountGrowthPct}% hiring velocity since ${latestRound?.type || 'round'}`;
  } else if (latestFin && latestFin.runwayMonthsEst <= 15) {
    whyNowTrigger = `Companies House: EUR ${latestFin.cashEurM}M cash (~${latestFin.runwayMonthsEst}m runway)`;
  } else if (coInvestorPath?.isUpstreamFeeder) {
    whyNowTrigger = `Feeder backed: ${coInvestorPath.coInvestorName}`;
  } else if (alumniSpinout) {
    whyNowTrigger = `Ex-${alumniSpinout.priorCompany} spinout (${alumniSpinout.name.split(' ')[0]})`;
  } else if (raisingSoon && latestRound) {
    whyNowTrigger = `${NEXT_STAGE[latestRound.type] || 'Next'} window (${Math.round(monthsSince)}m post-${latestRound.type})`;
  } else if (latestRound) {
    whyNowTrigger = `${latestRound.type} (${latestRound.date.slice(0, 7)}) · ${headcountAtLastRound}->${currentObservedEmp} team`;
  }

  return {
    visibleSeries,
    visibleCorpEvents,
    visibleFinMetrics,
    visibleDomains,
    headcountAtLastRound,
    currentObservedEmp,
    headcountGrowthPct,
    alumniSpinout,
    arbitrageSignals,
    whyNowTrigger
  };
}

function buildRelationshipGraph(thesis, company, visibleRounds, coInvestorPath) {
  const nodes = [
    { id: thesis.fundId, label: thesis.fundName, type: 'target_fund' },
    { id: company.id, label: company.name, type: 'target_startup' }
  ];
  const links = [];
  const seenNodes = new Set([thesis.fundId, company.id]);

  // Add top co-investors linked to this startup or fund (capped well below 100 nodes)
  const relevantCoInvestors = thesis.topCoInvestors.slice(0, 6);
  for (const ci of relevantCoInvestors) {
    if (!seenNodes.has(ci.id)) {
      nodes.push({ id: ci.id, label: ci.name, type: 'co_investor' });
      seenNodes.add(ci.id);
    }
    links.push({
      source: thesis.fundId,
      target: ci.id,
      label: `${ci.sharedRounds} shared deals`
    });
  }

  // Add links from rounds of the target startup
  for (const round of visibleRounds) {
    for (const invId of round.investorIds) {
      if (invId === thesis.fundId) continue;
      if (!seenNodes.has(invId) && nodes.length < 95) {
        nodes.push({
          id: invId,
          label: PEER_INVESTORS[invId] || invId,
          type: invId === 'angel-syndicate' ? 'angel' : 'peer_investor'
        });
        seenNodes.add(invId);
      }
      if (seenNodes.has(invId)) {
        links.push({
          source: invId,
          target: company.id,
          label: `${round.leadInvestorId === invId ? 'led' : 'joined'} ${round.type}`
        });
      }
    }
  }

  // Add up to 3 shared portfolio bridge nodes if highlighted path exists
  if (coInvestorPath) {
    for (const sampleName of coInvestorPath.sharedPortfolioSample) {
      const port = thesis.portfolioCompanies.find((p) => p.name === sampleName);
      if (port && !seenNodes.has(port.id) && nodes.length < 98) {
        nodes.push({ id: port.id, label: port.name, type: 'portfolio' });
        seenNodes.add(port.id);
        links.push({ source: thesis.fundId, target: port.id, label: 'backed' });
        links.push({ source: coInvestorPath.coInvestorId, target: port.id, label: 'co-invested' });
      }
    }
  }

  return {
    cappedAt: 100,
    nodeCount: nodes.length,
    nodes: nodes.slice(0, 100),
    links
  };
}

export function scoreAndRankCandidates(thesis, options = {}) {
  const rankingMode = options.rankingMode || 'balanced';
  const cutoffDate = options.cutoffDate || null;
  const evalDate = cutoffDate || thesis.evalDate || REFERENCE_DATE;
  const limit = options.limit ?? 20;
  const seenSet = new Set((options.seenCompanyNames || []).map((n) => n.trim().toLowerCase()).filter(Boolean));
  const excludedIds = new Set(thesis.portfolioCompanyIds || []);
  const weights = getWeights(rankingMode);

  const sectorShareMap = Object.fromEntries(thesis.sectorMix.map((s) => [s.label, s.sharePct / 100]));
  const stageShareMap = Object.fromEntries(thesis.stageMix.map((s) => [s.label, s.sharePct / 100]));
  const countryShareMap = Object.fromEntries(thesis.geographyMix.map((g) => [g.label, g.sharePct / 100]));
  const regionShareMap = Object.fromEntries(thesis.regionMix.map((r) => [r.label, r.sharePct / 100]));
  const topSectorSet = new Set(thesis.sectorMix.slice(0, 2).map((s) => s.label));

  const scored = [];

  for (const company of COMPANIES) {
    if (excludedIds.has(company.id)) continue;
    if (seenSet.has(company.name.toLowerCase())) continue;

    const visibleRounds = cutoffDate
      ? company.rounds.filter((r) => r.date < cutoffDate)
      : [...company.rounds];
    if (!visibleRounds.length) continue;

    visibleRounds.sort((a, b) => a.date.localeCompare(b.date));
    const latestRound = visibleRounds[visibleRounds.length - 1];
    const monthsSince = monthsBetween(latestRound.date, evalDate);

    // 1. Sector score
    const exactSectorShare = sectorShareMap[company.sector] || 0;
    const adjacentMatch = (SECTOR_ADJACENCY[company.sector] || []).some((adj) => topSectorSet.has(adj));
    const sectorRatio = Math.min(1, exactSectorShare * 2.1 + (exactSectorShare === 0 && adjacentMatch ? 0.45 : 0));
    const sectorPts = Math.round(weights.sector * sectorRatio * 10) / 10;

    // 2. Stage score (aligned with likely next round or current stage)
    const likelyNextStage = NEXT_STAGE[latestRound.type] || 'Seed';
    const currentStageShare = stageShareMap[latestRound.type] || 0;
    const nextStageShare = stageShareMap[likelyNextStage] || 0;
    const stageRatio = Math.min(1, Math.max(nextStageShare * 1.8, currentStageShare * 1.4));
    const stagePts = Math.round(weights.stage * stageRatio * 10) / 10;

    // 3. Co-investor link
    const coInvestorPath = buildCoInvestorPath(thesis, company, visibleRounds);
    const hasAngelOnly =
      latestRound.investorIds.length === 1 && latestRound.investorIds[0] === 'angel-syndicate';
    let coInvestorPts = 0;
    if (weights.coInvestor > 0 && coInvestorPath) {
      const strength = Math.min(1, 0.55 + coInvestorPath.sharedCount * 0.15);
      coInvestorPts = Math.round(weights.coInvestor * strength * 10) / 10;
    }

    // 4. Geography score
    const countryShare = countryShareMap[company.country] || 0;
    const regionShare = regionShareMap[company.region] || 0;
    const geoRatio = Math.min(1, countryShare * 2.2 + (countryShare === 0 ? regionShare * 0.75 : 0));
    const geoPts = Math.round(weights.geography * geoRatio * 10) / 10;

    // 5. Round size score
    let roundSizePts = Math.round(weights.roundSize * 0.5 * 10) / 10;
    if (thesis.medianRoundSizeEurM && latestRound.amountEurM) {
      const expectedNextSize = latestRound.amountEurM * 2.2;
      const ratioCurrent = Math.min(latestRound.amountEurM, thesis.medianRoundSizeEurM) / Math.max(latestRound.amountEurM, thesis.medianRoundSizeEurM);
      const ratioNext = Math.min(expectedNextSize, thesis.medianRoundSizeEurM) / Math.max(expectedNextSize, thesis.medianRoundSizeEurM);
      const bestSizeFit = Math.max(ratioCurrent, ratioNext);
      roundSizePts = Math.round(weights.roundSize * bestSizeFit * 10) / 10;
    }

    // Timing, Untapped Discovery & Agentic Arbitrage nudges (deterministic)
    const raisingSoon = monthsSince >= 12 && monthsSince <= 24;
    const untappedBoost = rankingMode === 'untapped' && hasAngelOnly ? 4 : 0;
    const signals = extractCandidateSignals(company, visibleRounds, evalDate, cutoffDate, coInvestorPath);
    const hasFilingArbitrage = signals.visibleCorpEvents.some((ev) => ev.unannouncedFiling);
    const agenticBoost = Math.min(
      2,
      (signals.headcountGrowthPct >= 40 ? 1 : 0) +
        (coInvestorPath?.isUpstreamFeeder || hasFilingArbitrage ? 1 : 0)
    );
    const totalScore = Math.min(
      99,
      Math.round(sectorPts + stagePts + coInvestorPts + geoPts + roundSizePts + untappedBoost + agenticBoost)
    );

    const directCompetitorOf = thesis.portfolioCompetitorGroups[company.competitorGroup] || null;

    // Similar past deals in portfolio
    const similarPortfolio = thesis.portfolioCompanies
      .filter((p) => p.sector === company.sector || p.country === company.country)
      .sort((a, b) => {
        const aExact = (a.sector === company.sector ? 2 : 0) + (a.country === company.country ? 1 : 0);
        const bExact = (b.sector === company.sector ? 2 : 0) + (b.country === company.country ? 1 : 0);
        return bExact - aExact;
      })
      .slice(0, 2);

    // Build source-grounded reasons (every sentence must carry a Cala source ID)
    const candidateReasons = [];
    const primarySourceIds = latestRound.sourceIds || [];
    const portfolioSourceIds = similarPortfolio.flatMap((p) => p.sourceIds || []).slice(0, 1);

    const sameSectorPortfolioCount = thesis.portfolioCompanies.filter((p) => p.sector === company.sector).length;
    const sameCountryPortfolioCount = thesis.portfolioCompanies.filter((p) => p.country === company.country).length;

    if (sameSectorPortfolioCount > 0 || sameCountryPortfolioCount > 0) {
      const parts = [];
      if (sameSectorPortfolioCount > 0) parts.push(`${company.sector} (${sameSectorPortfolioCount} portfolio deals)`);
      if (sameCountryPortfolioCount > 0) parts.push(`${company.country} (${sameCountryPortfolioCount} portfolio deals)`);
      candidateReasons.push({
        text: `Matches ${parts.join(' and ')} pattern from recent deals such as ${similarPortfolio.map((p) => p.name).join(' and ') || 'existing portfolio'}.`,
        sourceIds: [...new Set([...primarySourceIds, ...portfolioSourceIds])]
      });
    } else {
      candidateReasons.push({
        text: `${company.sector} operating in ${company.country}, adjacent to ${thesis.sectorMix[0]?.label || 'core'} focus.`,
        sourceIds: primarySourceIds
      });
    }

    if (coInvestorPath) {
      candidateReasons.push({
        text: coInvestorPath.summary,
        sourceIds: coInvestorPath.sourceIds
      });
    } else if (hasAngelOnly) {
      candidateReasons.push({
        text: `Untapped institutional profile: ${latestRound.type} backed by angel syndicate (€${latestRound.amountEurM}M) with no competing VC lead yet.`,
        sourceIds: primarySourceIds
      });
    }

    if (raisingSoon) {
      candidateReasons.push({
        text: `Likely raising ${likelyNextStage} soon: ${monthsSince} months since €${latestRound.amountEurM}M ${latestRound.type} (${latestRound.date.slice(0, 7)}).`,
        sourceIds: primarySourceIds
      });
    } else {
      candidateReasons.push({
        text: `Latest round was €${latestRound.amountEurM}M ${latestRound.type} on ${latestRound.date.slice(0, 7)} (${monthsSince} months ago).`,
        sourceIds: primarySourceIds
      });
    }

    if (signals.arbitrageSignals.length > 0) {
      const topSig = signals.arbitrageSignals[0];
      candidateReasons.push({
        text: `${topSig.label}: ${topSig.detail}`,
        sourceIds: topSig.sourceIds.length ? topSig.sourceIds : primarySourceIds
      });
    }

    const reasons = enforceFactCitations(candidateReasons);
    const graph = buildRelationshipGraph(thesis, company, visibleRounds, coInvestorPath);

    // Build LinkedIn + 3rd-party bridge & Startup-to-Startup network connections
    const leaderInfo = COMPANY_LINKEDIN_LEADERS[company.id] || {
      founder: `${company.name} Founding Team`,
      linkedinDegree: `2nd via ${company.region} founder circle`
    };
    const regionBridge = LINKEDIN_BRIDGES[company.region] || LINKEDIN_BRIDGES['Nordics'];
    const startupInvestorIds = new Set(visibleRounds.flatMap((r) => r.investorIds).filter((id) => id !== 'angel-syndicate'));

    const peerStartups = [];
    for (const other of COMPANIES) {
      if (other.id === company.id) continue;
      const otherInvIds = new Set(other.rounds.flatMap((r) => r.investorIds).filter((id) => id !== 'angel-syndicate'));
      const sharedInvestors = [...startupInvestorIds].filter((id) => otherInvIds.has(id));
      const isCandidate = !excludedIds.has(other.id);
      if (sharedInvestors.length > 0 && isCandidate) {
        const invName = PEER_INVESTORS[sharedInvestors[0]] || sharedInvestors[0];
        peerStartups.push({
          id: other.id,
          name: other.name,
          sector: other.sector,
          country: other.country,
          connectionType: 'cala_shared_investor',
          bridgeLabel: `Shared investor: ${invName}`
        });
      } else if (
        sharedInvestors.length === 0 &&
        other.sector === company.sector &&
        other.region === company.region &&
        isCandidate &&
        peerStartups.length < 3
      ) {
        peerStartups.push({
          id: other.id,
          name: other.name,
          sector: other.sector,
          country: other.country,
          connectionType: 'linkedin_alumni',
          bridgeLabel: `Alumni link: ${regionBridge.networkLabel}`
        });
      }
      if (peerStartups.length >= 4) break;
    }

    const linkedinBridgeSummary = coInvestorPath
      ? `LinkedIn 2nd-degree via ${regionBridge.thirdPartyCoInvestorRep} (${coInvestorPath.coInvestorName}) and ${leaderInfo.founder}.`
      : `LinkedIn ${leaderInfo.linkedinDegree}: ${regionBridge.bridgePerson} connects directly to ${leaderInfo.founder}.`;

    const linkedinGraph = {
      sourceLabel: 'LinkedIn 1st/2nd-degree & 3rd-party founder alumni network',
      bridgePerson: coInvestorPath ? regionBridge.thirdPartyCoInvestorRep : regionBridge.bridgePerson,
      targetLeader: leaderInfo.founder,
      networkName: regionBridge.networkLabel,
      summary: linkedinBridgeSummary,
      nodes: [
        { id: thesis.fundId, label: `${thesis.fundName} Team`, type: 'target_fund' },
        {
          id: 'li-bridge',
          label: coInvestorPath ? regionBridge.thirdPartyCoInvestorRep.split(' (')[0] : regionBridge.bridgePerson.split(' (')[0],
          type: 'co_investor'
        },
        { id: 'li-leader', label: leaderInfo.founder.split(' (')[0], type: 'portfolio' },
        { id: company.id, label: company.name, type: 'target_startup' },
        ...peerStartups.slice(0, 2).map((ps) => ({ id: ps.id, label: ps.name, type: 'peer_startup' }))
      ],
      links: [
        { source: thesis.fundId, target: 'li-bridge', label: 'LinkedIn 1st' },
        { source: 'li-bridge', target: 'li-leader', label: leaderInfo.linkedinDegree.split(' via')[0] },
        { source: 'li-leader', target: company.id, label: 'leads / founded' },
        ...peerStartups.slice(0, 2).map((ps) => ({
          source: company.id,
          target: ps.id,
          label: ps.connectionType === 'cala_shared_investor' ? 'shared investor' : 'alumni tie'
        }))
      ]
    };

    scored.push({
      id: company.id,
      calaEntityId: company.calaEntityId,
      name: company.name,
      oneLiner: company.oneLiner,
      description: company.description,
      sector: company.sector,
      subSectors: company.subSectors,
      country: company.country,
      region: company.region,
      hqCity: company.hqCity,
      foundingDate: company.foundingDate || `${company.foundedYear}-02-15`,
      employeeCount: signals.currentObservedEmp,
      headcountAtLastRound: signals.headcountAtLastRound,
      headcountGrowthPct: signals.headcountGrowthPct,
      employeeCountSeries: signals.visibleSeries,
      whyNowTrigger: signals.whyNowTrigger,
      arbitrageSignals: signals.arbitrageSignals,
      alumniSpinout: signals.alumniSpinout,
      companiesHouseNumber: company.companiesHouseNumber || null,
      financialMetrics: signals.visibleFinMetrics,
      corporateEvents: signals.visibleCorpEvents,
      domainHistory: signals.visibleDomains,
      peopleCoverage: company.peopleCoverage,
      stage: latestRound.type,
      likelyNextStage,
      lastRoundDate: latestRound.date,
      lastRoundAmountEurM: latestRound.amountEurM,
      monthsSinceLastRound: monthsSince,
      raisingSoon,
      untappedSignal: hasAngelOnly,
      directCompetitorOf,
      suitabilityScore: totalScore,
      scoreBreakdown: {
        sector: { earned: sectorPts, max: weights.sector },
        stage: { earned: stagePts, max: weights.stage },
        coInvestor: { earned: coInvestorPts, max: weights.coInvestor },
        geography: { earned: geoPts, max: weights.geography },
        roundSize: { earned: roundSizePts, max: weights.roundSize }
      },
      reasons,
      coInvestorPath,
      linkedinNetwork: linkedinGraph,
      peerStartups,
      similarPortfolio: similarPortfolio.map((p) => ({
        id: p.id,
        name: p.name,
        sector: p.sector,
        country: p.country,
        sources: resolveSources((p.sourceIds || []).slice(0, 1))
      })),
      roundHistory: visibleRounds.map((r) => ({
        id: r.id,
        calaRoundId: r.calaRoundId,
        type: r.type,
        date: r.date,
        amountEurM: r.amountEurM,
        valuationEurM: r.valuationEurM,
        leadInvestorName: PEER_INVESTORS[r.leadInvestorId] || r.leadInvestorId,
        investorNames: r.investorIds.map((id) => PEER_INVESTORS[id] || id),
        sources: resolveSources(r.sourceIds)
      })),
      graph
    });
  }

  scored.sort(
    (a, b) =>
      b.suitabilityScore - a.suitabilityScore ||
      (b.raisingSoon ? 1 : 0) - (a.raisingSoon ? 1 : 0) ||
      a.name.localeCompare(b.name)
  );

  return {
    rankingMode,
    weights,
    totalCandidatesEvaluated: scored.length,
    shortlist: scored.slice(0, limit),
    allRanked: scored
  };
}

/**
 * Q27: Point-in-Time Backtest.
 * Hides deals whose first investment by this fund happened in the last 12 months,
 * strips all post-cutoff rounds across every startup (zero future data leakage),
 * rebuilds the thesis purely from pre-cutoff deals, and checks how many hidden deals
 * land in the Top 15 and Top 50.
 */
export function runPointInTimeBacktest(fundId) {
  const cutoffDate = subtractMonths(REFERENCE_DATE, 12);
  const fund = FUNDS.find((f) => f.id === fundId);
  if (!fund) {
    return null;
  }

  const hiddenDeals = [];
  for (const company of COMPANIES) {
    const fundRounds = company.rounds.filter((r) => r.investorIds.includes(fund.id)).sort((a, b) => a.date.localeCompare(b.date));
    if (!fundRounds.length) continue;
    const firstFundDealDate = fundRounds[0].date;
    const hadPreCutoffRound = company.rounds.some((r) => r.date < cutoffDate);
    if (firstFundDealDate >= cutoffDate && hadPreCutoffRound) {
      hiddenDeals.push({
        companyId: company.id,
        name: company.name,
        actualRoundType: fundRounds[0].type,
        actualDate: firstFundDealDate,
        sourceIds: fundRounds[0].sourceIds || []
      });
    }
  }

  const preCutoffThesis = computeRevealedThesis({ mode: 'fund', fundId }, { cutoffDate });
  const backtestRun = scoreAndRankCandidates(preCutoffThesis, {
    rankingMode: 'balanced',
    cutoffDate,
    limit: 50
  });

  const rankMap = new Map(backtestRun.allRanked.map((item, idx) => [item.id, { rank: idx + 1, item }]));

  const evaluatedHidden = hiddenDeals.map((hd) => {
    const found = rankMap.get(hd.companyId);
    return {
      ...hd,
      sources: resolveSources(hd.sourceIds),
      predictedRank: found ? found.rank : null,
      predictedScore: found ? found.item.suitabilityScore : null,
      inTop15: Boolean(found && found.rank <= 15),
      inTop50: Boolean(found && found.rank <= 50),
      coInvestorHint: found?.item?.coInvestorPath?.summary || 'No shared pre-cutoff co-investor link'
    };
  });

  const hitsTop15 = evaluatedHidden.filter((d) => d.inTop15).length;
  const hitsTop50 = evaluatedHidden.filter((d) => d.inTop50).length;

  return {
    fundId: fund.id,
    fundName: fund.name,
    cutoffDate,
    preCutoffDealsCount: preCutoffThesis.dealsAnalyzedCount,
    candidatePoolAtCutoff: backtestRun.totalCandidatesEvaluated,
    hiddenDealsCount: evaluatedHidden.length,
    hitsInTop15: hitsTop15,
    hitsInTop50: hitsTop50,
    summaryText:
      evaluatedHidden.length > 0
        ? `Using only deals before ${cutoffDate} (${preCutoffThesis.dealsAnalyzedCount} deals, zero post-cutoff leakage), ${hitsTop15} of ${evaluatedHidden.length} actual investments made in the last 12 months ranked in the Top 15 (${hitsTop50}/${evaluatedHidden.length} in Top 50).`
        : `No post-cutoff (${cutoffDate}) new portfolio deals available in Cala snapshot for this fund.`,
    hiddenDeals: evaluatedHidden
  };
}

export function buildStartupBrief(startupId, fundId = null) {
  const company = COMPANIES.find((c) => c.id === startupId);
  if (!company) {
    const err = new Error(`Startup "${startupId}" was not found in Cala.`);
    err.statusCode = 404;
    throw err;
  }

  let matchContext = null;
  if (fundId && fundId !== 'custom-proxy') {
    const thesis = computeRevealedThesis({ mode: 'fund', fundId });
    const ranked = scoreAndRankCandidates(thesis, { limit: 50 });
    matchContext = ranked.allRanked.find((r) => r.id === startupId) || null;
  }

  const roundsWithSources = company.rounds.map((r) => ({
    id: r.id,
    calaRoundId: r.calaRoundId,
    type: r.type,
    date: r.date,
    amountEurM: r.amountEurM,
    valuationEurM: r.valuationEurM !== null ? r.valuationEurM : 'Not found in Cala',
    leadInvestorName: PEER_INVESTORS[r.leadInvestorId] || r.leadInvestorId,
    investorNames: r.investorIds.map((id) => PEER_INVESTORS[id] || id),
    sources: resolveSources(r.sourceIds)
  }));

  const signals = extractCandidateSignals(
    company,
    company.rounds,
    REFERENCE_DATE,
    null,
    matchContext?.coInvestorPath || null
  );

  const allSourcesMap = new Map();
  for (const r of roundsWithSources) {
    for (const s of r.sources) allSourcesMap.set(s.id, s);
  }

  const notFoundInCala = [
    { field: 'Private revenue, ARR, and burn rate', status: 'Not found in Cala', reason: company.financialMetrics?.length ? 'UK Companies House provides balance sheet cash/creditors only; ARR splits remain private.' : 'Cala financial metrics cover UK/public statutory filings only.' },
    { field: 'Individual fund cheque sizes', status: 'Not found in Cala', reason: 'Round totals are public; investor-level splits are estimated as not disclosed.' },
    { field: 'Personal founder-partner connections', status: 'Not found in Cala', reason: 'Personal relationships reside in LinkedIn or private CRMs (not scraped).' },
    { field: 'Customer cohort retention and net revenue churn', status: 'Not found in Cala', reason: 'Private unit economics and cohort retention metrics are not disclosed in statutory filings.' }
  ];

  const memoLines = [
    `# Investment Brief: ${company.name}`,
    `Cala Entity ID: ${company.calaEntityId}`,
    `HQ: ${company.hqCity}, ${company.country} | Sector: ${company.sector} | Employees: ${company.employeeCount} | Founded: ${company.foundingDate || company.foundedYear}`,
    ``,
    `## Overview`,
    `${company.description}`,
    ``,
    matchContext ? `## Fit vs. ${matchContext.suitabilityScore}/100 Suitability Score` : `## Fit Context`,
    ...(matchContext ? matchContext.reasons.map((r) => `- ${r.text} [${r.sources.map((s) => s.title).join('; ')}]`) : ['- Standalone Cala company profile']),
    ``,
    `## Time-Series & Filing Arbitrage Signals`,
    `- Why Now: ${signals.whyNowTrigger}`,
    `- Headcount Velocity: ${signals.headcountAtLastRound} -> ${signals.currentObservedEmp} employees (+${signals.headcountGrowthPct}% since latest round)`,
    ...signals.arbitrageSignals.map((sig) => `- [${sig.sourceRank}] ${sig.label}: ${sig.detail} (${sig.date})`),
    ``,
    `## Funding History (Cala Sourced)`,
    ...roundsWithSources.map(
      (r) =>
        `- ${r.date} | ${r.type} | EUR ${r.amountEurM}M | Lead: ${r.leadInvestorName} | Investors: ${r.investorNames.join(', ')} | Sources: ${r.sources.map((s) => s.url).join(', ')}`
    ),
    ``,
    `## Explicit Coverage Gaps (Not Found in Cala)`,
    ...notFoundInCala.map((g) => `- ${g.field}: ${g.status} (${g.reason})`)
  ];

  return {
    id: company.id,
    calaEntityId: company.calaEntityId,
    name: company.name,
    oneLiner: company.oneLiner,
    description: company.description,
    sector: company.sector,
    subSectors: company.subSectors,
    hqCity: company.hqCity,
    country: company.country,
    region: company.region,
    foundedYear: company.foundedYear,
    foundingDate: company.foundingDate || `${company.foundedYear}-02-15`,
    employeeCount: company.employeeCount,
    headcountAtLastRound: signals.headcountAtLastRound,
    headcountGrowthPct: signals.headcountGrowthPct,
    employeeCountSeries: signals.visibleSeries,
    whyNowTrigger: signals.whyNowTrigger,
    arbitrageSignals: signals.arbitrageSignals,
    alumniSpinout: signals.alumniSpinout,
    companiesHouseNumber: company.companiesHouseNumber || null,
    financialMetrics: signals.visibleFinMetrics,
    corporateEvents: signals.visibleCorpEvents,
    domainHistory: signals.visibleDomains,
    peopleCoverage: {
      available: company.peopleCoverage.available,
      note: company.peopleCoverage.note,
      roles: company.peopleCoverage.roles.map((role) => ({
        ...role,
        source: resolveSources([role.sourceId])[0] || null
      }))
    },
    rounds: roundsWithSources,
    matchContext,
    sources: [...allSourcesMap.values()],
    notFoundInCala,
    memoMarkdown: memoLines.join('\n')
  };
}

function matchesStageGroup(stageValue, stageFilter) {
  if (!stageFilter || stageFilter === 'all') return true;
  const s = String(stageValue || '').toLowerCase();
  if (stageFilter === 'pre_seed_seed') {
    return s.includes('pre-seed') || s.includes('seed');
  }
  if (stageFilter === 'seed_series_a') {
    return s.includes('seed') || s.includes('series a');
  }
  if (stageFilter === 'series_a_plus') {
    return s.includes('series a') || s.includes('series b') || s.includes('growth');
  }
  return s.includes(stageFilter.toLowerCase());
}

export function buildAgentPipeline(thesis, shortlist = [], options = {}) {
  const feederCount = (thesis.upstreamFeeders || []).length;
  const topFeeders = (thesis.upstreamFeeders || []).slice(0, 2).map((f) => f.name).join(', ') || 'none indexed';
  const tt = thesis.timeTravelProfile || {};
  const arbitrageHits = shortlist.filter((s) => (s.arbitrageSignals || []).length > 0).length;
  const activeFilterNote = options.filterLabel ? ` Filtered on ${options.filterLabel}.` : '';

  return [
    {
      step: 1,
      agent: 'Time-Travel DNA Profiler',
      status: 'completed',
      detail: `Reconstructed ${thesis.dealsAnalyzedCount} entry rounds (median ${tt.medianEntryHeadcount ?? '--'} employees, ~${tt.medianEntryAgeMonths ?? '--'}m post-founding).`
    },
    {
      step: 2,
      agent: 'Upstream Syndicate Mapper',
      status: 'completed',
      detail: `Mapped ${(thesis.topCoInvestors || []).length} co-investors and ${feederCount} Round N-1 upstream feeders (${topFeeders}).`
    },
    {
      step: 3,
      agent: 'Filing & Velocity Arbitrage Scout',
      status: 'completed',
      detail: `Flagged ${arbitrageHits} candidates with +30% employee_count growth, statutory PRH/Companies House filings, or alumni spinout lineage.${activeFilterNote}`
    },
    {
      step: 4,
      agent: 'Provenance Gate',
      status: 'completed',
      detail: `${tt.filingVerifiedSharePct ?? 0}% deal history backed by FILING/PRIMARY sources; 100% shortlist reasons citation-enforced.`
    }
  ];
}

export function refineShortlist(thesis, allRanked, refinement = {}) {
  const rawQuery = String(refinement.queryText || '').trim();
  const query = rawQuery.toLowerCase();
  let regionFilter = refinement.region || 'all';
  let stageFilter = refinement.stageFilter || 'all';
  let excludeSector = refinement.excludeSector || 'none';
  let raisingSoonOnly = Boolean(refinement.raisingSoonOnly);
  let untappedOnly = Boolean(refinement.untappedOnly);
  let highVelocityOnly = Boolean(refinement.highVelocityOnly);
  let feederOnly = Boolean(refinement.feederOnly);
  let filingOnly = Boolean(refinement.filingOnly);
  let alumniOnly = Boolean(refinement.alumniOnly);
  let sectorFilter = null;
  let investorFilter = null;
  let companyMatchName = null;
  let freeTextQuery = null;
  let searchIntent = 'general';
  let explanation = null;
  const aiTrace = [];

  if (query) {
    let matchedStructured = false;
    if (query.includes('nordic')) {
      regionFilter = 'Nordics';
      matchedStructured = true;
    } else if (query.includes('dach') || query.includes('german')) {
      regionFilter = 'DACH';
      matchedStructured = true;
    } else if (query.includes('uk') || query.includes('london') || query.includes('britain')) {
      regionFilter = 'UK';
      matchedStructured = true;
    }

    if (query.includes('exclude fintech') || query.includes('no fintech')) {
      excludeSector = 'Fintech';
      matchedStructured = true;
    } else if (query.includes('exclude health') || query.includes('no health')) {
      excludeSector = 'HealthTech';
      matchedStructured = true;
    } else if (query.includes('exclude climate') || query.includes('no climate')) {
      excludeSector = 'Climate Tech';
      matchedStructured = true;
    } else if (query.includes('exclude saas') || query.includes('no saas')) {
      excludeSector = 'B2B SaaS';
      matchedStructured = true;
    }

    if (query.includes('raising')) {
      raisingSoonOnly = true;
      matchedStructured = true;
    }
    if (query.includes('untapped') || query.includes('angel')) {
      untappedOnly = true;
      matchedStructured = true;
    }
    if (/(fast headcount|headcount growth|headcount velocity|high growth|team velocity|hiring velocity)/i.test(query)) {
      highVelocityOnly = true;
      matchedStructured = true;
      aiTrace.push('Filter: Post-round headcount growth >= 30% (employee_count time-series)');
    }
    if (/(feeder syndicate|upstream feeder|prior[- ]round feeder|feeder)/i.test(query)) {
      feederOnly = true;
      matchedStructured = true;
      aiTrace.push('Filter: Backed by Round N-1 upstream feeder syndicate');
    }
    if (/(filing signal|filing arbitrage|companies house|share allotment|unannounced filing|facility)/i.test(query)) {
      filingOnly = true;
      matchedStructured = true;
      aiTrace.push('Filter: Statutory FILING provenance (PRH / UK Companies House / HRB)');
    }
    if (/(alumni founder|spinout|operator lineage|ex-iceye|ex-aiven|ex-iqm|ex-oura|ex-silo)/i.test(query)) {
      alumniOnly = true;
      matchedStructured = true;
      aiTrace.push('Filter: Temporal FOUNDED / valid_until scaleup alumni spinout');
    }

    const whyMatch = query.match(/why not\s+([a-z0-9\s.-]+)/i);
    if (whyMatch) {
      searchIntent = 'why_not';
      const targetName = whyMatch[1].replace(/\?+$/, '').trim();
      const company = COMPANIES.find((c) => c.name.toLowerCase().includes(targetName));
      if (!company) {
        explanation = `Company "${targetName}" was not found in the indexed European Cala universe.`;
      } else if (thesis.portfolioCompanyIds.includes(company.id)) {
        explanation = `${company.name} is excluded from the shortlist because it is already in ${thesis.fundName} existing portfolio (Q24 exclusion rule).`;
      } else {
        const idx = allRanked.findIndex((item) => item.id === company.id);
        if (idx === -1) {
          explanation = `${company.name} had no indexed funding rounds matching the evaluation window.`;
        } else {
          const item = allRanked[idx];
          explanation = `${company.name} ranks #${idx + 1} overall with ${item.suitabilityScore}/100 (Sector ${item.scoreBreakdown.sector.earned}/${item.scoreBreakdown.sector.max}, Stage ${item.scoreBreakdown.stage.earned}/${item.scoreBreakdown.stage.max}, Co-investor ${item.scoreBreakdown.coInvestor.earned}/${item.scoreBreakdown.coInvestor.max}, Geo ${item.scoreBreakdown.geography.earned}/${item.scoreBreakdown.geography.max}).`;
        }
      }
      aiTrace.push(`Intent: Portfolio exclusion audit for "${targetName}"`);
      aiTrace.push(`Checked ${thesis.fundName} Cala portfolio (${thesis.portfolioCount} companies)`);
    } else {
      // Check Investor archetype
      const matchedInvestorEntry = Object.entries(PEER_INVESTORS).find(
        ([id, name]) => query.includes(name.toLowerCase()) || (id !== 'angel-syndicate' && query.includes(id.replace('-', ' ')))
      );
      if (query.startsWith('investor:') || query.includes('co-invest') || matchedInvestorEntry) {
        searchIntent = 'investor';
        if (matchedInvestorEntry) {
          investorFilter = matchedInvestorEntry[1];
          aiTrace.push(`Intent: Investor & co-investor network filter (${investorFilter})`);
        } else {
          aiTrace.push(`Intent: Investor search "${rawQuery}"`);
        }
        aiTrace.push(`Matched rounds backed by ${investorFilter || 'peer co-investors'} in Cala`);
      }

      // Check Industry / Theme archetype
      if (!investorFilter) {
        if (query.includes('deeptech') || query.includes('quantum') || query.includes('space') || query.includes('robotics')) {
          searchIntent = 'industry';
          sectorFilter = 'DeepTech';
        } else if (query.includes('ai') || query.includes('ml') || query.includes('agent')) {
          searchIntent = 'industry';
          sectorFilter = 'AI & ML';
        } else if (query.includes('fintech') && !query.includes('exclude fintech') && !query.includes('no fintech')) {
          searchIntent = 'industry';
          sectorFilter = 'Fintech';
        } else if (query.includes('health') && !query.includes('exclude health') && !query.includes('no health')) {
          searchIntent = 'industry';
          sectorFilter = 'HealthTech';
        } else if (query.includes('climate') && !query.includes('exclude climate') && !query.includes('no climate')) {
          searchIntent = 'industry';
          sectorFilter = 'Climate Tech';
        } else if (query.includes('saas') && !query.includes('exclude saas') && !query.includes('no saas')) {
          searchIntent = 'industry';
          sectorFilter = 'B2B SaaS';
        }
        if (sectorFilter) {
          aiTrace.push(`Intent: Industry & thesis filter (${sectorFilter})`);
        }
      }

      // Check Company archetype (explicit "Company:" or matching company name)
      const cleanedCompanyQuery = query.replace(/^company:\s*/i, '').replace(/^similar to\s+/i, '').trim();
      const matchedComp = COMPANIES.find(
        (c) =>
          cleanedCompanyQuery.length >= 3 &&
          (cleanedCompanyQuery.includes(c.name.toLowerCase()) || c.name.toLowerCase().includes(cleanedCompanyQuery))
      );
      if (query.startsWith('company:') || query.startsWith('similar to') || matchedComp) {
        searchIntent = 'company';
        companyMatchName = matchedComp ? matchedComp.name : cleanedCompanyQuery;
        if (matchedComp) {
          sectorFilter = matchedComp.sector;
          aiTrace.push(`Intent: Company & sector-analog lookup (${matchedComp.name} in ${matchedComp.sector})`);
        } else {
          aiTrace.push(`Intent: Company keyword search ("${cleanedCompanyQuery}")`);
        }
      }

      if (!matchedStructured && !investorFilter && !sectorFilter && !companyMatchName) {
        freeTextQuery = query;
        aiTrace.push(`Intent: Keyword match across Cala profiles ("${rawQuery}")`);
      } else if (!aiTrace.length) {
        aiTrace.push(`Intent: Thesis filter across ${thesis.fundName} candidate pool`);
      }
      aiTrace.push(`Ranked by Suitability Score using verified Cala citations`);
    }
  }

  const filtered = allRanked.filter((item) => {
    if (regionFilter !== 'all' && item.region !== regionFilter) return false;
    if (!matchesStageGroup(item.stage, stageFilter)) return false;
    if (excludeSector !== 'none' && item.sector === excludeSector) return false;
    if (raisingSoonOnly && !item.raisingSoon) return false;
    if (untappedOnly && !item.untappedSignal) return false;
    if (highVelocityOnly && (item.headcountGrowthPct || 0) < 30) return false;
    if (feederOnly && !item.coInvestorPath?.isUpstreamFeeder) return false;
    if (filingOnly && !(item.arbitrageSignals || []).some((s) => s.sourceRank === 'FILING')) return false;
    if (alumniOnly && !item.alumniSpinout) return false;
    if (investorFilter) {
      const hasInv =
        item.coInvestorPath?.coInvestorName === investorFilter ||
        item.roundHistory.some((r) => r.investorNames.includes(investorFilter));
      if (!hasInv) return false;
    }
    if (searchIntent === 'company' && companyMatchName) {
      const exactMatch = item.name.toLowerCase().includes(companyMatchName.toLowerCase());
      const sameSectorMatch = sectorFilter && item.sector === sectorFilter;
      if (!exactMatch && !sameSectorMatch) return false;
    } else if (sectorFilter) {
      const textMatch =
        item.sector === sectorFilter ||
        item.subSectors.some((s) => query.includes(s.toLowerCase())) ||
        item.description.toLowerCase().includes(sectorFilter.toLowerCase().split(' ')[0]);
      if (!textMatch) return false;
    } else if (freeTextQuery) {
      const haystack = [
        item.name,
        item.hqCity,
        item.country,
        item.sector,
        item.stage,
        item.oneLiner,
        item.description,
        item.whyNowTrigger,
        item.alumniSpinout?.priorCompany,
        ...(item.subSectors || []),
        ...(item.roundHistory || []).flatMap((r) => r.investorNames || [])
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      if (!haystack.includes(freeTextQuery)) return false;
    }
    return true;
  });

  if (searchIntent === 'company' && companyMatchName) {
    filtered.sort((a, b) => {
      const aHit = a.name.toLowerCase().includes(companyMatchName.toLowerCase()) ? 1 : 0;
      const bHit = b.name.toLowerCase().includes(companyMatchName.toLowerCase()) ? 1 : 0;
      return bHit - aHit || b.suitabilityScore - a.suitabilityScore;
    });
  } else if (highVelocityOnly) {
    filtered.sort((a, b) => (b.headcountGrowthPct || 0) - (a.headcountGrowthPct || 0) || b.suitabilityScore - a.suitabilityScore);
  }

  if (!explanation && query) {
    explanation = `Matched ${filtered.length} startups from ${thesis.fundName} pool using verified Cala records.`;
  }

  const agentPipeline = buildAgentPipeline(thesis, filtered, {
    filterLabel: rawQuery || null
  });
  for (const stage of agentPipeline) {
    aiTrace.push(`${stage.step}. ${stage.agent}: ${stage.detail}`);
  }

  return {
    searchIntent,
    aiTrace,
    agentPipeline,
    appliedFilters: {
      region: regionFilter,
      stageFilter,
      excludeSector,
      raisingSoonOnly,
      untappedOnly,
      highVelocityOnly,
      feederOnly,
      filingOnly,
      alumniOnly,
      sectorFilter,
      investorFilter,
      queryText: rawQuery
    },
    explanation,
    totalMatches: filtered.length,
    shortlist: filtered.slice(0, 20)
  };
}

export function runFullAnalysis(input, options = {}) {
  const thesis = computeRevealedThesis(input, options);
  const ranking = scoreAndRankCandidates(thesis, {
    rankingMode: options.rankingMode || 'balanced',
    seenCompanyNames: options.seenCompanyNames || [],
    limit: 20
  });
  const backtest = thesis.mode === 'fund' ? runPointInTimeBacktest(thesis.fundId) : null;
  const agentPipeline = buildAgentPipeline(thesis, ranking.shortlist);

  const uniqueSourceIds = new Set();
  for (const item of ranking.shortlist) {
    for (const r of item.reasons) {
      for (const sId of r.sourceIds) uniqueSourceIds.add(sId);
    }
  }

  return {
    thesis,
    rankingMode: ranking.rankingMode,
    weights: ranking.weights,
    totalCandidatesEvaluated: ranking.totalCandidatesEvaluated,
    shortlist: ranking.shortlist,
    allRanked: ranking.allRanked,
    backtest,
    agentPipeline,
    calaTelemetry: {
      entitiesIndexed: FUNDS.length + COMPANIES.length,
      roundsInspected: COMPANIES.reduce((sum, c) => sum + c.rounds.length, 0),
      verifiedCitationsInShortlist: uniqueSourceIds.size,
      pipelineMode: process.env.CALA_API_KEY ? 'Live Cala API + Local Index' : 'Pre-indexed Cala Snapshot (Instant)'
    }
  };
}
