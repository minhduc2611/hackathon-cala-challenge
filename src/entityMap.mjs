// Entity-centered map: put ANY company, investor or person at the center and group its
// verified connections into ACCESS / LINEAGE / TIMING / CAUTION. Facts only, no scores.
import { COMPANIES, FUNDS, PEER_INVESTORS, SOURCES, REFERENCE_DATE } from './data.mjs';

export const GROUP_META = {
  access: { label: 'Access', question: 'Who can open the door?' },
  lineage: { label: 'Lineage', question: 'Where do the team and portfolio come from?' },
  timing: { label: 'Timing', question: 'Why look now?' },
  caution: { label: 'Caution', question: 'What should you check first?' }
};

const RANK_ORDER = { FILING: 3, PRIMARY: 2, PRESS: 1 };
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function normRank(rank) {
  const r = String(rank || '').toUpperCase();
  return r === 'FILING' || r === 'PRIMARY' ? r : 'PRESS';
}

export function fmtMonth(iso) {
  const m = String(iso || '').match(/^(\d{4})-(\d{2})/);
  if (!m) return String(iso || '').slice(0, 4);
  return `${MONTHS[Number(m[2]) - 1]} ${m[1]}`;
}

function fmtEur(m) {
  if (m == null || !Number.isFinite(Number(m))) return '';
  const n = Number(m);
  return n >= 1000 ? `€${(n / 1000).toFixed(1)}B` : `€${n % 1 === 0 ? n : n.toFixed(1)}M`;
}

function slug(text) {
  return String(text || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function cleanText(text) {
  return String(text || '').replace(/—/g, ', ').replace(/\s+/g, ' ').trim();
}

function localSource(id) {
  const s = SOURCES[id];
  if (!s) return null;
  return {
    id: s.id,
    title: cleanText(s.title),
    publisher: cleanText(s.publisher),
    url: s.url || null,
    date: s.date || null,
    snippet: cleanText(s.snippet || ''),
    rank: normRank(s.sourceRank)
  };
}

function uniqSources(list) {
  const seen = new Set();
  return list
    .filter(Boolean)
    .filter((s) => {
      const k = s.id || s.url || s.title;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .sort((a, b) => (RANK_ORDER[b.rank] || 0) - (RANK_ORDER[a.rank] || 0));
}

function topRank(sources) {
  return sources[0]?.rank || null;
}

function item(fields) {
  const sources = uniqSources(fields.sources || []);
  return { ...fields, sources, rank: topRank(sources) };
}

const ALL_INVESTOR_NAMES = () => {
  const map = new Map(Object.entries(PEER_INVESTORS));
  for (const f of FUNDS) map.set(f.id, f.name);
  return map;
};

function investorName(id) {
  return ALL_INVESTOR_NAMES().get(id) || id;
}

function isPersonName(name) {
  // Data contains placeholder seats like "Inventure Partner Rep" or "Founding Team"; those are not people.
  return Boolean(name) && !/\b(rep|team|representative|founder)\b/i.test(name);
}

function companyKindLabel(c) {
  if (c.isRegistryDiscovered) return 'Registry record';
  return c.entityCategory === 'established_corp' ? 'Company' : 'Startup';
}

function companySubtitle(c) {
  // Sector and city of live-ingested companies are inferred by the ingester, not read from Cala.
  if (c.isLiveCalaDiscovered) return 'Live Cala entity';
  if (c.isRegistryDiscovered) return `Official registry record · ${[c.hqCity, c.country].filter(Boolean).join(', ')}`;
  return [c.sector, c.rounds?.at(-1)?.type, [c.hqCity, c.country].filter(Boolean).join(', ')].filter(Boolean).join(' · ');
}

function peopleIndex() {
  const people = new Map();
  for (const c of COMPANIES) {
    for (const r of c.peopleCoverage?.roles || []) {
      if (!isPersonName(r.name)) continue;
      const key = slug(r.name);
      const entry = people.get(key) || { ref: `person:${key}`, name: r.name, roles: [] };
      entry.roles.push({ ...r, company: c });
      people.set(key, entry);
    }
  }
  return people;
}

/* ------------------------------------------------------------------ search */

export function searchLocalEntities(rawQuery = '', limit = 8) {
  const q = String(rawQuery || '').trim().toLowerCase();
  if (!q) return [];
  const out = [];
  const score = (name, extra = '') => {
    const n = name.toLowerCase();
    if (n === q) return 4;
    if (n.startsWith(q)) return 3;
    if (n.includes(q)) return 2;
    if (extra.toLowerCase().includes(q)) return 1;
    return 0;
  };
  for (const c of COMPANIES) {
    const s = score(c.name, c.isLiveCalaDiscovered ? '' : `${c.sector} ${c.country} ${c.hqCity}`);
    if (s) out.push({ s, ref: c.isLiveCalaDiscovered && c.calaEntityId ? `cala:${c.calaEntityId}` : `co:${c.id}`, name: c.name, kind: 'company', typeLabel: companyKindLabel(c), subtitle: companySubtitle(c) });
  }
  for (const [id, name] of ALL_INVESTOR_NAMES()) {
    const fund = FUNDS.find((f) => f.id === id);
    const s = score(name, fund ? `${fund.hqCity} ${fund.country}` : '');
    if (s) out.push({ s, ref: `inv:${id}`, name, kind: 'investor', typeLabel: 'Investor', subtitle: fund ? `Investor · ${fund.hqCity}, ${fund.country}` : 'Investor' });
  }
  for (const p of peopleIndex().values()) {
    const s = score(p.name);
    if (s) {
      const r = p.roles[0];
      out.push({ s, ref: p.ref, name: p.name, kind: 'person', typeLabel: 'Person', subtitle: `${r.role} at ${r.company.name}` });
    }
  }
  return out
    .sort((a, b) => b.s - a.s || (a.typeLabel === 'Registry record') - (b.typeLabel === 'Registry record') || a.name.localeCompare(b.name))
    .slice(0, limit)
    .map(({ s, ...rest }) => rest);
}

/* --------------------------------------------------------------- builders */

function emptyGroups() {
  return { access: [], lineage: [], timing: [], caution: [] };
}

function finalize(center, groups, gaps) {
  const out = {};
  for (const key of Object.keys(GROUP_META)) {
    out[key] = { key, ...GROUP_META[key], items: groups[key] };
  }
  return { center, groups: out, gaps: [...new Set(gaps)], referenceDate: REFERENCE_DATE };
}

function roundLabel(r, investorId) {
  const verb = r.leadInvestorId === investorId ? 'Led' : 'Joined';
  return `${verb} ${r.type}, ${fmtMonth(r.date)}`;
}

function investorPortfolio(investorId) {
  return COMPANIES.filter((c) => (c.rounds || []).some((r) => (r.investorIds || []).includes(investorId) || r.leadInvestorId === investorId));
}

function listNames(names, max = 3) {
  const uniq = [...new Set(names)];
  if (uniq.length <= max) return uniq.join(', ');
  return `${uniq.slice(0, max).join(', ')} and ${uniq.length - max} more`;
}

function humanizeMarket(slugText) {
  return String(slugText || '').replace(/-/g, ' ');
}

function buildCompanyMap(c) {
  const groups = emptyGroups();
  const gaps = [];
  const rounds = c.rounds || [];

  // ACCESS: every investor on the cap table, with the rounds that prove it.
  const byInvestor = new Map();
  for (const r of rounds) {
    for (const invId of new Set([...(r.investorIds || []), r.leadInvestorId].filter(Boolean))) {
      const list = byInvestor.get(invId) || [];
      list.push(r);
      byInvestor.set(invId, list);
    }
  }
  const boardSeats = (c.peopleCoverage?.roles || []).filter((r) => /board/i.test(r.role) && /\brep\b/i.test(r.name));
  for (const [invId, invRounds] of byInvestor) {
    const seat = boardSeats.find((r) => r.name.toLowerCase().startsWith(investorName(invId).toLowerCase()));
    const others = investorPortfolio(invId).filter((x) => x.id !== c.id).map((x) => x.name);
    groups.access.push(
      item({
        key: `inv:${invId}`,
        ref: `inv:${invId}`,
        name: investorName(invId),
        kind: 'investor',
        relation: [...invRounds.map((r) => roundLabel(r, invId)), seat ? `Board seat since ${fmtMonth(seat.validSince || seat.startDate)}` : ''].filter(Boolean).join(' · '),
        contribution: others.length
          ? `Already on the cap table, so a warm route in. Also backed ${listNames(others)}.`
          : 'Already on the cap table, so a warm route in.',
        sources: [...invRounds.flatMap((r) => (r.sourceIds || []).map(localSource)), seat ? localSource(seat.sourceId) : null],
        date: invRounds.at(-1)?.date || null
      })
    );
  }

  // LINEAGE: people and where they came from.
  const roles = (c.peopleCoverage?.roles || []).filter((r) => isPersonName(r.name));
  const byPerson = new Map();
  for (const r of roles) {
    const list = byPerson.get(r.name) || [];
    list.push(r);
    byPerson.set(r.name, list);
  }
  for (const [name, list] of byPerson) {
    const prior = list.find((r) => r.priorCompany);
    groups.lineage.push(
      item({
        key: `person:${slug(name)}`,
        ref: `person:${slug(name)}`,
        name,
        kind: 'person',
        relation: [...new Set(list.map((r) => r.role))].join(', '),
        contribution: prior
          ? `Previously ${prior.priorRole || 'worked'} at ${prior.priorCompany}${prior.priorValidUntil ? ` until ${fmtMonth(prior.priorValidUntil)}` : ''}.`
          : `In role since ${fmtMonth(list[0].validSince || list[0].startDate)}.`,
        sources: list.map((r) => localSource(r.sourceId)),
        date: list[0].validSince || list[0].startDate || null
      })
    );
    if (prior) {
      const priorCo = COMPANIES.find((x) => x.name === prior.priorCompany);
      groups.lineage.push(
        item({
          key: priorCo ? `co:${priorCo.id}` : `org:${slug(prior.priorCompany)}`,
          ref: priorCo ? `co:${priorCo.id}` : null,
          name: prior.priorCompany,
          kind: 'company',
          relation: `Former employer of ${name}`,
          contribution: `${name} left in ${fmtMonth(prior.priorValidUntil)} to start or join ${c.name}.`,
          sources: [localSource(prior.sourceId)],
          date: prior.priorValidUntil || null
        })
      );
    }
  }
  if (!roles.length) gaps.push('Leadership and founders not found in Cala');
  else if (!roles.some((r) => r.priorCompany)) gaps.push('Founder prior jobs not found in Cala');

  // TIMING: funding rounds, unannounced filings, team growth.
  for (const r of [...rounds].reverse().slice(0, 4)) {
    groups.timing.push(
      item({
        key: `round:${r.id}`,
        ref: null,
        name: `${r.type} round, ${fmtMonth(r.date)}`,
        kind: 'event',
        relation: [r.amountEurM ? `Raised ${fmtEur(r.amountEurM)}` : 'Amount not found in Cala', r.leadInvestorId ? `led by ${investorName(r.leadInvestorId)}` : ''].filter(Boolean).join(', '),
        contribution: `${Math.max(0, Math.round(monthsSince(r.date)))} months ago (as of ${fmtMonth(REFERENCE_DATE)}).`,
        sources: (r.sourceIds || []).map(localSource),
        date: r.date
      })
    );
  }
  for (const ev of c.corporateEvents || []) {
    if (!ev.unannouncedFiling) continue;
    groups.timing.push(
      item({
        key: `event:${slug(ev.name)}:${ev.eventDate}`,
        ref: null,
        name: `Registry filing, ${fmtMonth(ev.eventDate)}`,
        kind: 'event',
        relation: cleanText(ev.name),
        contribution: cleanText(ev.summary),
        sources: [localSource(ev.sourceId)],
        date: ev.eventDate
      })
    );
  }
  const series = c.employeeCountSeries || [];
  const lastRoundDate = rounds.at(-1)?.date;
  if (series.length >= 2 && lastRoundDate) {
    const base = [...series].reverse().find((p) => p.date <= lastRoundDate) || series[0];
    const latest = series.at(-1);
    if (latest.value > base.value) {
      groups.timing.push(
        item({
          key: `growth:${c.id}`,
          ref: null,
          name: `Team ${base.value} to ${latest.value}`,
          kind: 'event',
          relation: `Headcount ${fmtMonth(base.date)} to ${fmtMonth(latest.date)}`,
          contribution: `Team grew from ${base.value} to ${latest.value} people since the ${rounds.at(-1).type} round.`,
          sources: [localSource(base.sourceId), localSource(latest.sourceId)],
          date: latest.date
        })
      );
    }
  }
  if (!rounds.length) gaps.push('Funding rounds not found in Cala');
  if (rounds.length && rounds.every((r) => r.valuationEurM == null)) gaps.push('Valuation not found in Cala');
  if (!(c.financialMetrics || []).length) gaps.push('Revenue and financial statements not found in Cala');

  // CAUTION: same-market companies, press-only funding proof, data gaps.
  if (c.competitorGroup) {
    for (const peer of COMPANIES.filter((x) => x.id !== c.id && x.competitorGroup === c.competitorGroup)) {
      groups.caution.push(
        item({
          key: `co:${peer.id}`,
          ref: `co:${peer.id}`,
          name: peer.name,
          kind: 'company',
          relation: 'Same market',
          contribution: `Both work on ${humanizeMarket(c.competitorGroup)}. Check how they differ before a call.`,
          sources: (peer.rounds || []).slice(-1).flatMap((r) => (r.sourceIds || []).map(localSource)),
          date: null
        })
      );
    }
  }
  const roundSources = uniqSources(rounds.flatMap((r) => (r.sourceIds || []).map(localSource)));
  if (roundSources.length && roundSources.every((s) => s.rank === 'PRESS')) {
    groups.caution.push(
      item({
        key: `pressonly:${c.id}`,
        ref: null,
        name: 'Funding seen in press only',
        kind: 'gap',
        relation: 'No filing or company source',
        contribution: 'Every funding round is backed by news reports only. Confirm amounts with the company.',
        sources: roundSources.slice(0, 2),
        date: null
      })
    );
  }
  for (const g of gaps) {
    groups.caution.push(item({ key: `gap:${slug(g)}`, ref: null, name: g.replace(/ not found in Cala$/, ''), kind: 'gap', relation: 'Not found in Cala', contribution: `${g}. Ask directly or verify elsewhere.`, sources: [] }));
  }

  const latestHeadcount = series.at(-1);
  const total = rounds.reduce((s, r) => s + (Number(r.amountEurM) || 0), 0);
  const center = {
    ref: `co:${c.id}`,
    name: c.name,
    kind: 'company',
    typeLabel: companyKindLabel(c),
    subtitle: companySubtitle(c),
    description: cleanText(c.description || c.oneLiner),
    facts: c.isLiveCalaDiscovered ? [] : c.isRegistryDiscovered ? [
      { label: 'Registry', value: c.registryInfo ? `${c.registryInfo.registryName} #${c.registryInfo.registrationNumber}` : null, rank: 'FILING' },
      { label: 'Status', value: c.registryInfo?.status || null },
      { label: 'Registered in', value: [c.hqCity, c.country].filter(Boolean).join(', ') || null },
      { label: 'Founded', value: c.foundedYear ? String(c.foundedYear) : null }
    ] : [
      { label: 'Sector', value: [c.sector, ...(c.subSectors || []).slice(0, 2)].filter(Boolean).join(', ') || null },
      { label: 'Stage', value: rounds.at(-1)?.type || (c.entityCategory === 'established_corp' ? 'Mature company' : null) },
      { label: 'Headquarters', value: [c.hqCity, c.country].filter(Boolean).join(', ') || null },
      { label: 'Founded', value: c.foundedYear ? String(c.foundedYear) : null },
      { label: 'Team size', value: latestHeadcount ? `${latestHeadcount.value} people (${fmtMonth(latestHeadcount.date)})` : null, rank: latestHeadcount ? normRank(latestHeadcount.sourceRank) : null },
      { label: 'Total raised', value: total ? `${fmtEur(Math.round(total * 10) / 10)} across ${rounds.length} ${rounds.length === 1 ? 'round' : 'rounds'}` : null }
    ],
    timeline: rounds.map((r) => ({
      date: r.date,
      text: `${r.type}${r.amountEurM ? `, ${fmtEur(r.amountEurM)}` : ''}${r.leadInvestorId ? `, led by ${investorName(r.leadInvestorId)}` : ''}`,
      sources: (r.sourceIds || []).map(localSource).filter(Boolean)
    })),
    people: [...byPerson.keys()],
    live: Boolean(c.isLiveCalaDiscovered)
  };
  return finalize(center, groups, gaps);
}

function monthsSince(iso) {
  const a = new Date(iso);
  const b = new Date(REFERENCE_DATE);
  return (b - a) / (1000 * 60 * 60 * 24 * 30.44);
}

function buildInvestorMap(invId) {
  const name = investorName(invId);
  const fund = FUNDS.find((f) => f.id === invId);
  const portfolio = investorPortfolio(invId);
  if (!fund && !portfolio.length) return null;
  const groups = emptyGroups();
  const gaps = [];

  // ACCESS: co-investors, the people most likely to share deal flow or make an intro.
  const coMap = new Map();
  for (const c of portfolio) {
    for (const r of c.rounds || []) {
      const ids = new Set([...(r.investorIds || []), r.leadInvestorId].filter(Boolean));
      if (!ids.has(invId)) continue;
      for (const other of ids) {
        if (other === invId) continue;
        const e = coMap.get(other) || { companies: new Set(), rounds: [] };
        e.companies.add(c.name);
        e.rounds.push(r);
        coMap.set(other, e);
      }
    }
  }
  for (const [otherId, e] of [...coMap].sort((a, b) => b[1].companies.size - a[1].companies.size).slice(0, 10)) {
    groups.access.push(
      item({
        key: `inv:${otherId}`,
        ref: `inv:${otherId}`,
        name: investorName(otherId),
        kind: 'investor',
        relation: `Co-invested in ${e.companies.size} ${e.companies.size === 1 ? 'company' : 'companies'}`,
        contribution: `Together in ${listNames([...e.companies])}.`,
        sources: e.rounds.flatMap((r) => (r.sourceIds || []).map(localSource)),
        date: e.rounds.map((r) => r.date).sort().at(-1)
      })
    );
  }

  // LINEAGE: the portfolio itself.
  const firstCheck = (c) => (c.rounds || []).find((r) => (r.investorIds || []).includes(invId) || r.leadInvestorId === invId);
  for (const c of [...portfolio].sort((a, b) => String(firstCheck(b)?.date).localeCompare(String(firstCheck(a)?.date))).slice(0, 12)) {
    const r = firstCheck(c);
    groups.lineage.push(
      item({
        key: `co:${c.id}`,
        ref: `co:${c.id}`,
        name: c.name,
        kind: 'company',
        relation: `Portfolio: ${roundLabel(r, invId)}`,
        contribution: `${cleanText(c.oneLiner)} (${[c.sector, c.country].filter(Boolean).join(', ')})`,
        sources: (r.sourceIds || []).map(localSource),
        date: r.date
      })
    );
  }

  // TIMING: deals in the last 24 months.
  const recent = [];
  for (const c of portfolio) {
    for (const r of c.rounds || []) {
      if (((r.investorIds || []).includes(invId) || r.leadInvestorId === invId) && monthsSince(r.date) <= 24) recent.push({ c, r });
    }
  }
  for (const { c, r } of recent.sort((a, b) => b.r.date.localeCompare(a.r.date)).slice(0, 6)) {
    groups.timing.push(
      item({
        key: `round:${r.id}`,
        ref: `co:${c.id}`,
        name: `${c.name} ${r.type}`,
        kind: 'event',
        relation: `${roundLabel(r, invId)}${r.amountEurM ? `, ${fmtEur(r.amountEurM)} round` : ''}`,
        contribution: `Recent deal: shows what ${name} is buying right now.`,
        sources: (r.sourceIds || []).map(localSource),
        date: r.date
      })
    );
  }
  if (!recent.length) gaps.push('No deals in the last 24 months found in Cala');

  // CAUTION: concentration and missing fund facts.
  const bySector = new Map();
  for (const c of portfolio) bySector.set(c.sector, (bySector.get(c.sector) || 0) + 1);
  const [topSector, topCount] = [...bySector].sort((a, b) => b[1] - a[1])[0] || [];
  if (topSector && portfolio.length >= 3 && topCount / portfolio.length >= 0.5) {
    groups.caution.push(
      item({
        key: `concentration:${invId}`,
        ref: null,
        name: `Concentrated in ${topSector}`,
        kind: 'gap',
        relation: `${topCount} of ${portfolio.length} indexed portfolio companies`,
        contribution: fund?.statedThesis && !fund.statedThesis.toLowerCase().includes(String(topSector).toLowerCase().split(' ')[0])
          ? `Their stated thesis does not mention ${topSector}, but most indexed deals are there.`
          : `Most indexed deals are in ${topSector}.`,
        sources: fund ? (fund.sourceIds || []).map(localSource) : [],
        date: null
      })
    );
  }
  gaps.push('Fund size not found in Cala', 'Individual check sizes not found in Cala');
  if (!fund) gaps.push('Stated thesis and team not found in Cala');
  for (const g of gaps) {
    groups.caution.push(item({ key: `gap:${slug(g)}`, ref: null, name: g.replace(/ not found in Cala$/, '').replace(/ found in Cala$/, ''), kind: 'gap', relation: 'Not found in Cala', contribution: `${g}.`, sources: [] }));
  }

  const center = {
    ref: `inv:${invId}`,
    name,
    kind: 'investor',
    typeLabel: 'Investor',
    subtitle: fund ? `Investor · ${fund.hqCity}, ${fund.country}` : 'Investor',
    description: cleanText(fund?.statedThesis || ''),
    facts: [
      { label: 'Headquarters', value: fund ? `${fund.hqCity}, ${fund.country}` : null },
      { label: 'Team', value: fund?.teamSize ? `${fund.teamSize} partners` : null },
      { label: 'Indexed portfolio', value: portfolio.length ? `${portfolio.length} companies` : null },
      { label: 'Website', value: fund?.websiteUrl || null }
    ],
    timeline: recent
      .sort((a, b) => b.r.date.localeCompare(a.r.date))
      .slice(0, 6)
      .map(({ c, r }) => ({ date: r.date, text: `${c.name}: ${roundLabel(r, invId)}`, sources: (r.sourceIds || []).map(localSource).filter(Boolean) })),
    people: [],
    live: false
  };
  return finalize(center, groups, gaps);
}

function buildPersonMap(key) {
  const p = peopleIndex().get(key);
  if (!p) return null;
  const groups = emptyGroups();
  const gaps = ['Contact details not found in Cala', 'Full employment history not found in Cala'];
  const byCompany = new Map();
  for (const r of p.roles) {
    const list = byCompany.get(r.company.id) || [];
    list.push(r);
    byCompany.set(r.company.id, list);
  }
  for (const list of byCompany.values()) {
    const c = list[0].company;
    groups.access.push(
      item({
        key: `co:${c.id}`,
        ref: `co:${c.id}`,
        name: c.name,
        kind: 'company',
        relation: [...new Set(list.map((r) => r.role))].join(', '),
        contribution: `Current role since ${fmtMonth(list[0].validSince || list[0].startDate)}: the direct way into ${c.name}.`,
        sources: list.map((r) => localSource(r.sourceId)),
        date: list[0].validSince || list[0].startDate
      })
    );
    for (const invId of new Set((c.rounds || []).flatMap((r) => r.investorIds || []))) {
      groups.access.push(
        item({
          key: `inv:${invId}`,
          ref: `inv:${invId}`,
          name: investorName(invId),
          kind: 'investor',
          relation: `Investor in ${c.name}`,
          contribution: `Backs ${p.name}'s company, so can vouch or introduce.`,
          sources: (c.rounds || []).filter((r) => (r.investorIds || []).includes(invId)).flatMap((r) => (r.sourceIds || []).map(localSource)),
          date: null
        })
      );
    }
    const start = list[0].validSince || list[0].startDate;
    if (start) {
      groups.timing.push(item({ key: `start:${c.id}`, ref: null, name: `Joined ${c.name}, ${fmtMonth(start)}`, kind: 'event', relation: list[0].role, contribution: `Role start date at ${c.name}.`, sources: [localSource(list[0].sourceId)], date: start }));
    }
  }
  const prior = p.roles.find((r) => r.priorCompany);
  if (prior) {
    const priorCo = COMPANIES.find((x) => x.name === prior.priorCompany);
    groups.lineage.push(
      item({
        key: priorCo ? `co:${priorCo.id}` : `org:${slug(prior.priorCompany)}`,
        ref: priorCo ? `co:${priorCo.id}` : null,
        name: prior.priorCompany,
        kind: 'company',
        relation: `Former employer${prior.priorRole ? `: ${prior.priorRole}` : ''}`,
        contribution: `Left in ${fmtMonth(prior.priorValidUntil)}. Former colleagues there are a second route in.`,
        sources: [localSource(prior.sourceId)],
        date: prior.priorValidUntil
      })
    );
  } else {
    gaps.push('Prior employers not found in Cala');
  }
  for (const g of gaps) {
    groups.caution.push(item({ key: `gap:${slug(g)}`, ref: null, name: g.replace(/ not found in Cala$/, ''), kind: 'gap', relation: 'Not found in Cala', contribution: `${g}.`, sources: [] }));
  }
  const center = {
    ref: p.ref,
    name: p.name,
    kind: 'person',
    typeLabel: 'Person',
    subtitle: p.roles.map((r) => `${r.role} at ${r.company.name}`)[0],
    description: '',
    facts: [
      { label: 'Current roles', value: [...new Set(p.roles.map((r) => `${r.role}, ${r.company.name}`))].join('; ') },
      { label: 'Previously', value: prior ? `${prior.priorRole || 'Worked'} at ${prior.priorCompany}` : null }
    ],
    timeline: p.roles.map((r) => ({ date: r.validSince || r.startDate, text: `${r.role} at ${r.company.name}`, sources: [localSource(r.sourceId)].filter(Boolean) })),
    people: [],
    live: false
  };
  return finalize(center, groups, gaps);
}

/* ---------------------------------------------------------- live Cala map */

function liveSources(raw = []) {
  return (raw || []).slice(0, 3).map((s, i) => ({
    id: s.document || s.url || `${s.name}-${i}`,
    title: cleanText(s.name || s.title || 'Cala source'),
    publisher: cleanText(s.publisher || s.name || 'Cala'),
    url: s.document || s.url || null,
    date: s.date || null,
    snippet: '',
    rank: normRank(s.source_rank || s.sourceRank || (/registry|filing|sec\.gov|companies house|prh/i.test(`${s.name} ${s.document}`) ? 'FILING' : 'PRESS'))
  }));
}

const LIVE_ROLE_LABELS = {
  FOUNDED: 'Founder',
  IS_CEO_OF: 'CEO',
  IS_CTO_OF: 'CTO',
  IS_CFO_OF: 'CFO',
  IS_BOARD_MEMBER_OF: 'Board member',
  WORKS_AT: 'Works at'
};

function liveKind(entityType) {
  if (entityType === 'Person') return 'person';
  if (entityType === 'Organization') return 'investor';
  return 'company';
}

export function buildEntityMapFromCala(entity) {
  if (!entity?.id || !entity?.name) return null;
  const props = entity.properties || {};
  const out = entity.relationships?.outgoing || {};
  const inc = entity.relationships?.incoming || {};
  const groups = emptyGroups();
  const gaps = [];
  const kind = liveKind(entity.entity_type);
  const ref = (t) => `cala:${t.id}`;

  for (const inv of inc.INVESTED_IN || []) {
    groups.access.push(item({ key: ref(inv), ref: ref(inv), name: inv.name, kind: liveKind(inv.entity_type), relation: 'Investor', contribution: `${inv.name} invested in ${entity.name}.`, sources: liveSources(inv.properties?.sources), date: inv.properties?.event_date || null }));
  }
  for (const [rel, label] of Object.entries(LIVE_ROLE_LABELS)) {
    for (const p of inc[rel] || []) {
      groups.lineage.push(item({ key: ref(p), ref: ref(p), name: p.name, kind: 'person', relation: label, contribution: `${label} of ${entity.name}${p.properties?.valid_since ? ` since ${fmtMonth(p.properties.valid_since)}` : ''}.`, sources: liveSources(p.properties?.sources), date: p.properties?.valid_since || null }));
    }
    for (const t of out[rel] || []) {
      groups.access.push(item({ key: ref(t), ref: ref(t), name: t.name, kind: liveKind(t.entity_type), relation: label, contribution: `${entity.name} is ${label.toLowerCase()} at ${t.name}${t.properties?.valid_since ? ` since ${fmtMonth(t.properties.valid_since)}` : ''}.`, sources: liveSources(t.properties?.sources), date: t.properties?.valid_since || null }));
    }
  }
  for (const t of out.INVESTED_IN || []) {
    groups.lineage.push(item({ key: ref(t), ref: ref(t), name: t.name, kind: liveKind(t.entity_type), relation: 'Portfolio company', contribution: `${entity.name} invested in ${t.name}.`, sources: liveSources(t.properties?.sources), date: t.properties?.event_date || null }));
  }
  const roundsRaw = [...(out.PARTICIPATES_IN_FUNDING_ROUND || []), ...(inc.PARTICIPATES_IN_FUNDING_ROUND || [])];
  for (const r of roundsRaw.slice(0, 6)) {
    const role = r.properties?.role || 'ISSUER';
    const d = r.properties?.event_date || null;
    groups.timing.push(item({ key: ref(r), ref: null, name: `${cleanText(r.name)}${d ? `, ${fmtMonth(d)}` : ''}`, kind: 'event', relation: role === 'ISSUER' ? 'Raised this round' : r.properties?.is_lead ? 'Led this round' : 'Joined this round', contribution: d ? `Funding event dated ${fmtMonth(d)}.` : 'Funding event, date not found in Cala.', sources: liveSources(r.properties?.sources), date: d }));
  }
  for (const ev of (out.PARTICIPATES_IN_CORPORATE_EVENT || []).slice(0, 4)) {
    const d = ev.properties?.event_date || null;
    groups.timing.push(item({ key: ref(ev), ref: null, name: `${cleanText(ev.name)}${d ? `, ${fmtMonth(d)}` : ''}`, kind: 'event', relation: ev.properties?.role || 'Corporate event', contribution: 'Corporate event recorded in Cala.', sources: liveSources(ev.properties?.sources), date: d }));
  }
  for (const rel of ['COMPETES_WITH', 'COMPETITOR_OF']) {
    for (const t of [...(out[rel] || []), ...(inc[rel] || [])]) {
      groups.caution.push(item({ key: ref(t), ref: ref(t), name: t.name, kind: liveKind(t.entity_type), relation: 'Competitor', contribution: `Listed as a competitor of ${entity.name}.`, sources: liveSources(t.properties?.sources), date: null }));
    }
  }

  const fact = (label, value, raw) => ({ label, value: value == null || value === '' ? null : String(value), rank: raw?.sources?.length ? liveSources(raw.sources)[0].rank : null });
  const facts = [
    fact('Type', entity.entity_type),
    fact('Funding stage', props.funding_stage?.value, props.funding_stage),
    fact('Founded', props.founding_date?.value, props.founding_date),
    fact('Headquarters', props.headquarters_address?.value || props.registered_address?.value, props.headquarters_address || props.registered_address),
    fact('Team size', props.employee_count_range?.value, props.employee_count_range),
    fact('Total funding', props.total_funding?.value != null ? `${props.total_funding.value}${props.total_funding_units?.value ? ` ${props.total_funding_units.value}` : ''}` : null, props.total_funding),
    fact('Website', props.website?.value, props.website)
  ];
  if (kind !== 'person') {
    for (const f of facts) if (!f.value && f.label !== 'Type') gaps.push(`${f.label} not found in Cala`);
  }
  if (!groups.access.length) gaps.push(kind === 'person' ? 'Current roles not found in Cala' : 'Investors not found in Cala');
  if (!groups.lineage.length) gaps.push(kind === 'person' ? 'Career history not found in Cala' : 'Leadership not found in Cala');
  if (!groups.timing.length) gaps.push('Funding or corporate events not found in Cala');
  for (const g of gaps) {
    groups.caution.push(item({ key: `gap:${slug(g)}`, ref: null, name: g.replace(/ not found in Cala$/, ''), kind: 'gap', relation: 'Not found in Cala', contribution: `${g}.`, sources: [] }));
  }
  for (const k of Object.keys(groups)) groups[k] = groups[k].slice(0, 14);

  const center = {
    ref: `cala:${entity.id}`,
    name: entity.name,
    kind,
    typeLabel: entity.entity_type || 'Entity',
    subtitle: [entity.entity_type, props.headquarters_address?.value].filter(Boolean).join(' · '),
    description: cleanText(entity.description || props.description?.value || ''),
    facts: facts.filter((f) => f.label !== 'Type'),
    timeline: groups.timing.filter((t) => t.date).map((t) => ({ date: t.date, text: t.name, sources: t.sources })),
    people: groups.lineage.filter((x) => x.kind === 'person').map((x) => x.name),
    live: true
  };
  return finalize(center, groups, gaps);
}

/* ---------------------------------------------------------------- router */

export function buildEntityMap(ref = '') {
  const [type, ...rest] = String(ref || '').split(':');
  const id = rest.join(':');
  if (!id) return null;
  if (type === 'co') {
    const c = COMPANIES.find((x) => x.id === id);
    return c ? buildCompanyMap(c) : null;
  }
  if (type === 'inv') return buildInvestorMap(id);
  if (type === 'person') return buildPersonMap(id);
  if (type === 'cala') {
    const c = COMPANIES.find((x) => x.calaEntityId === id);
    if (c) return buildCompanyMap(c);
    const f = FUNDS.find((x) => x.calaEntityId === id);
    return f ? buildInvestorMap(f.id) : null;
  }
  return null;
}
