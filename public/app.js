const MAP_W = 3200;
const MAP_H = 2400;
const CENTER = { x: MAP_W / 2, y: MAP_H / 2 };
const MISSING = "Not found in Cala";
const GROUPS = {
  access: { label: "ACCESS", angle: 220, color: "access", question: "Which verified relationships create a route to the entities on this map?" },
  lineage: { label: "LINEAGE", angle: 310, color: "lineage", question: "Which verified people and organizations establish lineage?" },
  timing: { label: "TIMING", angle: 40, color: "timing", question: "Which dated Cala facts matter now?" },
  caution: { label: "CAUTION", angle: 130, color: "caution", question: "Which verified conflicts, limits, or missing data need attention?" }
};

const state = {
  drafts: [],
  activeRefs: [],
  graph: null,
  display: null,
  highlightId: null,
  highlightEdgeId: null,
  zoom: 0.5,
  panX: 0,
  panY: 0,
  pointer: null,
  searchTimer: null,
  searchSequence: 0,
  resolving: new Map(),
  filters: { sharedOnly: false, filingOnly: false },
  dossier: null,
  dossierCache: new Map()
};

const $ = (selector) => document.querySelector(selector);
const html = (value) => String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
const clean = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
const asList = (value) => Array.isArray(value) ? value : value ? [value] : [];

function setStatus(message, isError = false) {
  $("#mapStatus").textContent = message;
  const notice = $("#adderNotice");
  notice.textContent = message;
  notice.classList.toggle("is-error", isError);
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...options
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || "Unable to load Cala data.");
  return body;
}

function idOf(item = {}) {
  return clean(item.id || item.entityId || item.entity_id || item.calaEntityId || item.cala_entity_id);
}

function nameOf(item = {}) {
  return clean(item.name || item.label || item.entityName || item.entity_name || "Unnamed entity");
}

function typeOf(item = {}) {
  return clean(item.entityType || item.entity_type || item.type || item.kind || "Entity").replace(/_/g, " ");
}

function metaOf(item = {}) {
  const parts = [item.hqCity || item.headquarters || item.country, item.sector || item.category, item.description]
    .map(clean)
    .filter(Boolean);
  return parts.slice(0, 2).join(" | ") || typeOf(item);
}

function normalizedName(value) {
  return clean(value).toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function typeBadge(item) {
  const type = typeOf(item).toLowerCase();
  const category = clean(item.entityCategory || item.entity_category || item.category).toLowerCase();
  if (category.includes("fund")) return "Fund";
  if (category.includes("invest")) return "Investor";
  if (type.includes("person")) return "Person";
  if (type.includes("fund")) return "Fund";
  if (type.includes("invest") || type.includes("venture")) return "Investor";
  if (type.includes("organization")) return "Organization";
  if (type.includes("startup")) return "Startup";
  return "Company";
}

function entityRef(item) {
  const id = idOf(item);
  return {
    type: typeOf(item),
    id,
    calaId: id,
    name: nameOf(item)
  };
}

function normalizeMatches(payload) {
  const rows = [
    ...asList(payload?.entities),
    ...asList(payload?.liveEntities),
    ...asList(payload?.companies),
    ...asList(payload?.organizations),
    ...asList(payload?.people),
    ...asList(payload?.funds),
    ...asList(payload?.results),
    ...asList(payload?.matches),
    ...asList(payload?.candidateEntities)
  ];
  const unique = new Map();
  for (const row of rows) {
    const id = idOf(row);
    if (!id || unique.has(id)) continue;
    unique.set(id, { ...row, id, name: nameOf(row), entityType: typeOf(row) });
  }
  return [...unique.values()].slice(0, 12);
}

async function searchLive(query) {
  const text = clean(query);
  if (text.length < 2) return [];
  const payload = await fetchJson(`/api/search?q=${encodeURIComponent(text)}&live=1`);
  return normalizeMatches(payload);
}

function draftKey(text) {
  return `${normalizedName(text)}:${Date.now()}:${Math.random().toString(16).slice(2)}`;
}

function renderDrafts() {
  const container = $("#pendingEntityChips");
  container.innerHTML = state.drafts.map((draft) => {
    const body = draft.status === "resolving"
      ? `<span class="chip-spinner" aria-hidden="true"></span><span class="chip-name">${html(draft.text)}</span>`
      : draft.status === "resolved"
        ? `<span class="chip-name">${html(draft.entity.name)}</span><span class="chip-badge">${html(typeBadge(draft.entity))}</span><span class="chip-name">${html(metaOf(draft.entity))}</span>`
        : draft.status === "ambiguous"
          ? `<span class="chip-name">${html(draft.text)}</span><span class="chip-badge">Choose match</span>`
          : `<span class="chip-name">${html(draft.text)}</span><span class="chip-badge">${html(MISSING)}</span>`;
    const picker = draft.status === "ambiguous" ? `
      <div class="chip-picker" role="listbox">
        ${draft.matches.slice(0, 5).map((match, index) => `
          <button type="button" data-draft-pick="${html(draft.key)}" data-match-index="${index}">
            <strong>${html(match.name)}</strong><span class="chip-badge">${html(typeBadge(match))}</span>
            <small>${html(metaOf(match))}</small>
          </button>
        `).join("")}
      </div>` : "";
    return `<span class="entity-chip is-${html(draft.status)}" data-draft-key="${html(draft.key)}">${body}<button type="button" data-remove-draft="${html(draft.key)}" aria-label="Remove ${html(draft.text)}">x</button>${picker}</span>`;
  }).join("");
  container.onclick = (event) => {
    const remove = event.target.closest("[data-remove-draft]");
    if (remove) {
      state.drafts = state.drafts.filter((draft) => draft.key !== remove.dataset.removeDraft);
      renderDrafts();
      return;
    }
    const pick = event.target.closest("[data-draft-pick]");
    if (!pick) return;
    const draft = state.drafts.find((item) => item.key === pick.dataset.draftPick);
    const match = draft?.matches?.[Number(pick.dataset.matchIndex)];
    if (draft && match) {
      draft.status = "resolved";
      draft.entity = match;
      draft.matches = [];
      renderDrafts();
    }
  };
}

function exactOrAmbiguous(text, matches) {
  if (!matches.length) return { status: "missing" };
  const needle = normalizedName(text);
  const exactMatches = matches.filter((match) => normalizedName(match.name) === needle);
  // A unique exact Cala name is unambiguous even when adjacent results are
  // legal entities, subsidiaries, or programs with the same brand prefix.
  // Multiple exact records (for example two distinct Mercury companies) still
  // receive the explicit picker below.
  if (exactMatches.length === 1) return { status: "resolved", entity: exactMatches[0] };
  if (exactMatches.length > 1) return { status: "ambiguous" };
  const first = normalizedName(matches[0].name);
  const second = normalizedName(matches[1]?.name);
  const firstClose = first === needle || first.includes(needle) || needle.includes(first);
  const secondClose = Boolean(second) && (second === needle || second.includes(needle) || needle.includes(second));
  if (firstClose && secondClose) return { status: "ambiguous" };
  return { status: "resolved", entity: matches[0] };
}

async function resolveDraft(draft) {
  try {
    const matches = await searchLive(draft.text);
    const result = exactOrAmbiguous(draft.text, matches);
    draft.status = result.status;
    if (result.entity) draft.entity = result.entity;
    if (result.status === "ambiguous") draft.matches = matches;
  } catch {
    draft.status = "missing";
  } finally {
    state.resolving.delete(draft.key);
    renderDrafts();
  }
}

function addDraftTexts(texts) {
  const entries = [...new Map(texts.map(clean).filter(Boolean).map((text) => [normalizedName(text), text])).values()]
    .filter((text) => !state.drafts.some((draft) => normalizedName(draft.text) === normalizedName(text)));
  if (!entries.length) return;
  const slots = 4 - state.drafts.length;
  if (entries.length > slots) {
    setStatus(`A map can contain at most 4 entities. Remove a chip before adding ${entries.length > 1 ? "these entities" : "this entity"}.`, true);
    return;
  }
  for (const text of entries) {
    const draft = { key: draftKey(text), text, status: "resolving", matches: [] };
    state.drafts.push(draft);
    const task = resolveDraft(draft);
    state.resolving.set(draft.key, task);
  }
  renderDrafts();
}

function addResolvedEntity(entity) {
  if (!entity?.id) return;
  if (state.drafts.length >= 4) {
    setStatus("A map can contain at most 4 entities.", true);
    return;
  }
  if (state.drafts.some((draft) => draft.entity?.id === entity.id || normalizedName(draft.text) === normalizedName(entity.name))) return;
  state.drafts.push({ key: draftKey(entity.name), text: entity.name, status: "resolved", entity, matches: [] });
  renderDrafts();
}

async function settleDrafts() {
  await Promise.all([...state.resolving.values()]);
}

function activeIds() {
  return new Set(state.activeRefs.map((ref) => ref.id));
}

async function buildMap() {
  if (state.resolving.size) {
    setStatus("Resolving Cala entities...");
    await settleDrafts();
  }
  const refs = state.drafts.filter((draft) => draft.status === "resolved" && draft.entity).map((draft) => entityRef(draft.entity));
  if (!refs.length) {
    setStatus("Resolve at least one entity before building the map.", true);
    return;
  }
  if (refs.length > 4) {
    setStatus("A map can contain at most 4 entities.", true);
    return;
  }
  const button = $("#buildMapBtn");
  button.disabled = true;
  button.textContent = "Building...";
  setStatus(`Building one map for ${refs.length} entit${refs.length === 1 ? "y" : "ies"}...`);
  try {
    const payload = {
      mode: "entity",
      entityRefs: refs,
      entities: refs,
      entityId: refs[0].id,
      compareEntityIds: refs.slice(1).map((ref) => ref.id),
      discoverLive: true
    };
    const result = await fetchJson("/api/analyze", { method: "POST", body: JSON.stringify(payload) });
    const canonicalRefs = asList(result.focalEntities).map(entityRef).filter((ref) => ref.id && ref.name);
    state.activeRefs = canonicalRefs.length === refs.length ? canonicalRefs : refs;
    let resolvedIndex = 0;
    state.drafts = state.drafts.map((draft) => {
      if (draft.status !== "resolved" || !draft.entity) return draft;
      const canonical = canonicalRefs[resolvedIndex++];
      return canonical ? { ...draft, entity: { ...draft.entity, ...canonical } } : draft;
    });
    state.graph = result.bridgeMap || result.map || result.entityMap || makeAnchorOnlyGraph(state.activeRefs);
    state.highlightId = state.activeRefs[0].id;
    state.highlightEdgeId = null;
    closeGroupDrilldown();
    renderAll({ fit: true });
    setStatus(`Map built for ${refs.map((ref) => ref.name).join(", ")}`);
  } catch (error) {
    setStatus(error.message || "Unable to build the map.", true);
  } finally {
    button.disabled = false;
    button.textContent = "Build map";
  }
}

function makeAnchorOnlyGraph(refs) {
  const anchors = refs.map((ref) => ({ ...ref, id: ref.id, label: ref.name, kind: "anchor" }));
  return { anchor: anchors[0], nodes: anchors, edges: [], contributionClusters: [] };
}

function renderActiveChips() {
  const box = $("#activeEntityChips");
  box.innerHTML = state.activeRefs.map((ref, index) => `
    <span class="active-chip">
      <span class="color-dot" style="opacity:${Math.max(0.44, 1 - index * 0.15)}"></span>
      <span class="active-chip-name">${html(ref.name)}</span>
      <span class="chip-badge">${html(typeBadge(ref))}</span>
      <button type="button" data-remove-active="${html(ref.id)}" aria-label="Remove ${html(ref.name)}">x</button>
    </span>
  `).join("");
  $("#clearMapBtn").hidden = state.activeRefs.length === 0;
  box.onclick = (event) => {
    const button = event.target.closest("[data-remove-active]");
    if (button) removeActive(button.dataset.removeActive);
  };
}

async function removeActive(id) {
  state.activeRefs = state.activeRefs.filter((ref) => ref.id !== id);
  state.drafts = state.drafts.filter((draft) => draft.entity?.id !== id);
  renderDrafts();
  if (!state.activeRefs.length) {
    clearMap();
    return;
  }
  await buildMap();
}

function clearMap() {
  state.drafts = [];
  state.activeRefs = [];
  state.graph = null;
  state.display = null;
  state.highlightId = null;
  state.highlightEdgeId = null;
  renderDrafts();
  renderActiveChips();
  renderMap();
  closeGroupDrilldown();
  setStatus("Add 1 to 4 entities above to build the map.");
}

function canonicalGroup(value) {
  const key = clean(value).toLowerCase().replace(/[s-]+/g, "_");
  if (key.includes("access") || key.includes("invest") || key.includes("partner") || key.includes("syndicate") || key.includes("feeder")) return "access";
  if (key.includes("lineage") || key.includes("alumni") || key.includes("found") || key.includes("work") || key.includes("board")) return "lineage";
  if (key.includes("tim") || key.includes("event") || key.includes("round") || key.includes("filing") || key.includes("date")) return "timing";
  if (key.includes("caution") || key.includes("conflict") || key.includes("compet") || key.includes("gap") || key.includes("risk")) return "caution";
  return "access";
}

function tierOf(record) {
  const direct = record?.sourceTier || record?.source_tier || record?.tier || record?.rank || record?.["topSource" + "Rank"] || record?.["source" + "Rank"];
  const tiers = [direct, ...asList(record?.sources).map((source) => source?.sourceTier || source?.source_tier || source?.tier || source?.rank || source?.["source" + "Rank"])]
    .map((tier) => clean(tier).toUpperCase());
  if (tiers.includes("FILING")) return "FILING";
  if (tiers.includes("PRIMARY")) return "PRIMARY";
  if (tiers.includes("PRESS")) return "PRESS";
  return MISSING;
}

function strongestTier(records) {
  const tiers = records.map(tierOf);
  if (tiers.includes("FILING")) return "FILING";
  if (tiers.includes("PRIMARY")) return "PRIMARY";
  if (tiers.includes("PRESS")) return "PRESS";
  return MISSING;
}

function contributionText(record = {}) {
  return clean(record.whyMatters || record.summary || record.relationship || record.relation || record.label || record.description) || MISSING;
}

function edgeFrom(edge = {}) { return clean(edge.from || edge.source || edge.fromId || edge.sourceId); }
function edgeTo(edge = {}) { return clean(edge.to || edge.target || edge.toId || edge.targetId); }

function rawNodes(graph) {
  const nodes = new Map();
  for (const raw of [...asList(graph?.nodes), ...(graph?.anchor ? [{ ...graph.anchor, kind: "anchor" }] : []), ...state.activeRefs]) {
    const id = idOf(raw);
    if (!id || nodes.has(id)) continue;
    nodes.set(id, { ...raw, id, label: nameOf(raw) });
  }
  return [...nodes.values()];
}

function nodeRole(node, active) {
  const kind = clean(node.kind).toLowerCase();
  if (active.has(node.id) || kind === "anchor") return "anchor";
  if (kind === "group_hub" || kind === "group" || node.groupKey) return "group";
  if (kind === "bridge" || node.bridgeFamily || node.bridgeType) return "bridge";
  return "entity";
}

function normalizeDisplay(graph) {
  const allNodes = rawNodes(graph);
  const active = activeIds();
  const nodesById = new Map();
  const groups = new Map(Object.entries(GROUPS).map(([key, meta]) => [key, { key, ...meta, members: [], edges: [] }]));
  for (const raw of allNodes) {
    const role = nodeRole(raw, active);
    if (role === "group") continue;
    const group = canonicalGroup(raw.contributionGroup || raw.group || raw.groupKey || raw.bridgeFamily || raw.bridgeType || raw.relationshipType);
    const node = { ...raw, role, group, label: nameOf(raw) };
    nodesById.set(node.id, node);
    if (role !== "anchor") groups.get(group).members.push(node);
  }
  for (const group of groups.values()) {
    const visual = {
      id: `group:${group.key}`,
      label: group.label,
      role: "group",
      group: group.key,
      evidenceSize: Math.min(118, 86 + group.members.length * 4)
    };
    nodesById.set(visual.id, visual);
  }
  const edges = [];
  for (let index = 0; index < asList(graph?.edges).length; index += 1) {
    const raw = graph.edges[index] || {};
    const from = edgeFrom(raw);
    const to = edgeTo(raw);
    if (!from || !to || !nodesById.has(from) || !nodesById.has(to)) continue;
    const group = canonicalGroup(raw.contributionGroup || raw.group || raw.bridgeFamily || raw.bridgeType || raw.relationshipType || nodesById.get(to)?.group || nodesById.get(from)?.group);
    const shared = Boolean(raw.isSharedOverlap || raw.shared || raw.sharedBridge || raw.isSharedBridge || raw.sharedEntities?.length > 1 || raw.connectedAnchors?.length > 1 || nodesById.get(from)?.isSharedBridge || nodesById.get(to)?.isSharedBridge);
    const edge = { ...raw, id: clean(raw.id) || `edge:${from}:${to}:${index}`, from, to, group, shared };
    edges.push(edge);
    groups.get(group).edges.push(edge);
  }
  return { nodes: [...nodesById.values()], edges, nodesById, groups };
}

function degrees(value) { return value * Math.PI / 180; }
function pointAt(radius, angle) { return { x: CENTER.x + radius * Math.cos(degrees(angle)), y: CENTER.y + radius * Math.sin(degrees(angle)) }; }
function normalizedAngle(angle) { let result = angle; while (result <= -180) result += 360; while (result > 180) result -= 360; return result; }
function shortLabel(value) { return nameOf({ label: value }).split(/\s+/).slice(0, 2).join(" ").slice(0, 17); }

function layoutDisplay(display) {
  const positions = new Map();
  const anchors = display.nodes.filter((node) => node.role === "anchor");
  const anchorRadius = anchors.length > 1 ? 290 : 0;
  anchors.forEach((node, index) => {
    const point = anchors.length > 1 ? pointAt(anchorRadius, 270 + index * (360 / anchors.length)) : CENTER;
    positions.set(node.id, { ...point, radius: 63, locked: true, group: "access" });
  });
  const hubRadius = anchors.length > 1 ? 490 : 420;
  for (const group of display.groups.values()) {
    const point = pointAt(hubRadius, group.angle);
    positions.set(`group:${group.key}`, { ...point, radius: Math.max(43, (display.nodesById.get(`group:${group.key}`)?.evidenceSize || 90) / 2), locked: true, group: group.key });
  }
  for (const group of display.groups.values()) {
    const nodes = display.nodes.filter((node) => node.role !== "anchor" && node.role !== "group" && node.group === group.key)
      .sort((a, b) => nameOf(a).localeCompare(nameOf(b)));
    const span = Math.min(96, Math.max(58, 40 + Math.min(46, nodes.length * 5)));
    const perRing = 5;
    nodes.forEach((node, index) => {
      const ring = Math.floor(index / perRing);
      const slot = index % perRing;
      const nodesInRing = Math.min(perRing, nodes.length - ring * perRing);
      const fraction = nodesInRing <= 1 ? 0.5 : slot / (nodesInRing - 1);
      const angle = group.angle - span / 2 + fraction * span + (ring % 2 ? 3 : -3);
      const radius = 780 + ring * 160;
      const point = pointAt(radius, angle);
      positions.set(node.id, { ...point, radius: node.role === "bridge" ? 34 : 44, group: group.key, minRadius: 700, maxRadius: 1260 });
    });
  }
  const movable = display.nodes.filter((node) => positions.has(node.id) && !positions.get(node.id).locked);
  for (let pass = 0; pass < 36; pass += 1) {
    for (let left = 0; left < movable.length; left += 1) {
      const a = positions.get(movable[left].id);
      for (let right = left + 1; right < movable.length; right += 1) {
        const b = positions.get(movable[right].id);
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const distance = Math.hypot(dx, dy) || 1;
        const clearance = a.radius + b.radius + 142;
        if (distance >= clearance) continue;
        const push = (clearance - distance) * 0.55;
        a.x += (dx / distance) * push;
        a.y += (dy / distance) * push;
        b.x -= (dx / distance) * push;
        b.y -= (dy / distance) * push;
      }
    }
    for (const node of movable) {
      const point = positions.get(node.id);
      const dx = point.x - CENTER.x;
      const dy = point.y - CENTER.y;
      const distance = Math.hypot(dx, dy) || point.minRadius;
      const base = GROUPS[point.group]?.angle || 220;
      const offset = Math.max(-44, Math.min(44, normalizedAngle(Math.atan2(dy, dx) * 180 / Math.PI - base)));
      const radius = Math.max(point.minRadius, Math.min(point.maxRadius, distance));
      point.x = CENTER.x + radius * Math.cos(degrees(base + offset));
      point.y = CENTER.y + radius * Math.sin(degrees(base + offset));
    }
  }
  return positions;
}

function sectorPath(start, end) {
  const inner = 230;
  const outer = 1230;
  const a = pointAt(inner, start);
  const b = pointAt(outer, start);
  const c = pointAt(outer, end);
  const d = pointAt(inner, end);
  return `M ${a.x} ${a.y} L ${b.x} ${b.y} A ${outer} ${outer} 0 0 1 ${c.x} ${c.y} L ${d.x} ${d.y} A ${inner} ${inner} 0 0 0 ${a.x} ${a.y} Z`;
}

function visibleEdges() {
  if (!state.display) return [];
  return state.display.edges.filter((edge) => {
    if (state.filters.sharedOnly && !edge.shared) return false;
    if (state.filters.filingOnly && tierOf(edge) !== "FILING") return false;
    return true;
  });
}

function pathForEdge(from, to, index) {
  const mx = (from.x + to.x) / 2;
  const my = (from.y + to.y) / 2;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy) || 1;
  const bend = Math.min(230, Math.max(90, length * 0.2)) * (index % 2 ? 1 : -1);
  return `M ${from.x} ${from.y} Q ${mx - dy / length * bend} ${my + dx / length * bend} ${to.x} ${to.y}`;
}

function nodeClass(node) {
  const group = node.role === "anchor" ? "anchor" : node.group;
  const selected = state.highlightId === node.id ? " is-selected" : "";
  const shared = node.isSharedBridge ? " is-shared" : "";
  return `map-node is-${node.role} node-${group}${shared}${selected}`;
}

function renderMap() {
  const empty = $("#mapEmptyState");
  const svg = $("#constellationSvg");
  const layer = $("#constellationNodesLayer");
  if (!state.graph) {
    svg.innerHTML = "";
    layer.innerHTML = "";
    empty.hidden = false;
    return;
  }
  empty.hidden = true;
  state.display = normalizeDisplay(state.graph);
  state.display.positions = layoutDisplay(state.display);
  const colors = {
    access: ["rgba(107, 184, 255, 0.08)", "rgba(107, 184, 255, 0.28)"],
    lineage: ["rgba(179, 154, 255, 0.08)", "rgba(179, 154, 255, 0.28)"],
    timing: ["rgba(246, 189, 105, 0.08)", "rgba(246, 189, 105, 0.28)"],
    caution: ["rgba(243, 141, 170, 0.08)", "rgba(243, 141, 170, 0.28)"]
  };
  const wedges = Object.values(GROUPS).map((group) => `<path class="group-wedge" d="${sectorPath(group.angle - 43, group.angle + 43)}" style="--wedge-fill:${colors[group.color][0]};--wedge-edge:${colors[group.color][1]}"></path>`).join("");
  const edges = visibleEdges();
  const edgesHtml = edges.map((edge, index) => {
    const from = state.display.positions.get(edge.from);
    const to = state.display.positions.get(edge.to);
    if (!from || !to) return "";
    const path = pathForEdge(from, to, index);
    const focused = state.highlightEdgeId === edge.id || (state.highlightId && (edge.from === state.highlightId || edge.to === state.highlightId));
    const dimmed = (state.highlightId || state.highlightEdgeId) && !focused;
    return `<path class="map-edge${edge.shared ? " is-shared" : ""}${focused ? " is-focused" : ""}${dimmed ? " is-dimmed" : ""}" d="${path}"></path><path class="edge-hit" data-edge-id="${html(edge.id)}" d="${path}"></path>`;
  }).join("");
  svg.innerHTML = wedges + edgesHtml;
  layer.innerHTML = state.display.nodes.map((node) => {
    const position = state.display.positions.get(node.id);
    if (!position) return "";
    const label = nameOf(node);
    const size = node.role === "group" ? `--node-size:${node.evidenceSize || 90}px;` : "";
    return `<button type="button" class="${nodeClass(node)}" data-node-id="${html(node.id)}" style="left:${position.x}px;top:${position.y}px;${size}" aria-label="${html(label)}"><span class="node-label">${html(label)}</span><span class="node-label-short">${html(shortLabel(label))}</span></button>`;
  }).join("");
  bindRenderedMap(layer, svg);
}

function bindRenderedMap(layer, svg) {
  layer.onpointerover = (event) => {
    const element = event.target.closest("[data-node-id]");
    if (!element) return;
    const node = state.display.nodesById.get(element.dataset.nodeId);
    if (node) showNodeTooltip(event, node);
  };
  layer.onpointermove = moveTooltip;
  layer.onpointerout = (event) => { if (event.target.closest("[data-node-id]")) hideTooltip(); };
  layer.onclick = (event) => {
    const element = event.target.closest("[data-node-id]");
    if (!element) return;
    const node = state.display.nodesById.get(element.dataset.nodeId);
    if (!node) return;
    if (node.role === "group") openGroupDrilldown(node.group);
    else openEntityDossier(node);
  };
  svg.onpointerover = (event) => {
    const element = event.target.closest("[data-edge-id]");
    if (!element) return;
    const edge = state.display.edges.find((item) => item.id === element.dataset.edgeId);
    if (edge) showEdgeTooltip(event, edge);
  };
  svg.onpointermove = moveTooltip;
  svg.onpointerout = (event) => { if (event.target.closest("[data-edge-id]")) hideTooltip(); };
  svg.onclick = (event) => {
    const element = event.target.closest("[data-edge-id]");
    if (!element) return;
    const edge = state.display.edges.find((item) => item.id === element.dataset.edgeId);
    if (!edge) return;
    state.highlightEdgeId = edge.id;
    state.highlightId = null;
    renderMap();
    const target = state.display.nodesById.get(edge.to) || state.display.nodesById.get(edge.from);
    if (target) openEntityDossier(target);
  };
}

function entityPath(node) {
  const paths = visibleEdges().filter((edge) => edge.from === node.id || edge.to === node.id).map((edge) => {
    const from = state.display.nodesById.get(edge.from);
    const to = state.display.nodesById.get(edge.to);
    return [from?.label, to?.label].filter(Boolean).join(" to ");
  }).filter(Boolean);
  return paths.slice(0, 3).join(" | ") || MISSING;
}

function showTooltip(event, content) {
  const tooltip = $("#mapHoverTooltip");
  tooltip.innerHTML = content;
  tooltip.hidden = false;
  moveTooltip(event);
}

function moveTooltip(event) {
  const tooltip = $("#mapHoverTooltip");
  if (tooltip.hidden) return;
  tooltip.style.left = `${Math.max(12, Math.min(window.innerWidth - tooltip.offsetWidth - 12, event.clientX + 15))}px`;
  tooltip.style.top = `${Math.max(12, Math.min(window.innerHeight - tooltip.offsetHeight - 12, event.clientY + 15))}px`;
}

function hideTooltip() { $("#mapHoverTooltip").hidden = true; }

function showNodeTooltip(event, node) {
  if (node.role === "group") {
    const group = state.display.groups.get(node.group);
    const names = group.members.slice(0, 3).map((member) => nameOf(member)).join(", ") || MISSING;
    showTooltip(event, `<p class="tooltip-title">${html(group.label)}</p><p class="tooltip-row"><strong>Verified paths:</strong> ${html(group.edges.length)}</p><p class="tooltip-row"><strong>Driving entities:</strong> ${html(names)}</p><p class="tooltip-row"><strong>Question:</strong> ${html(group.question)}</p><p class="tooltip-row">Click to expand.</p>`);
    return;
  }
  const edges = visibleEdges().filter((edge) => edge.from === node.id || edge.to === node.id);
  const contribution = edges.map(contributionText).find((text) => text !== MISSING) || contributionText(node);
  showTooltip(event, `<p class="tooltip-title">${html(node.label)}</p><p class="tooltip-row"><strong>Contribution:</strong> ${html(contribution)}</p><p class="tooltip-row"><strong>Path:</strong> ${html(entityPath(node))}</p><p class="tooltip-row"><strong>Highest verified source:</strong> ${html(strongestTier([node, ...edges]))}</p><p class="tooltip-row">Click for full dossier.</p>`);
}

function showEdgeTooltip(event, edge) {
  const from = state.display.nodesById.get(edge.from);
  const to = state.display.nodesById.get(edge.to);
  const path = [from?.label, to?.label].filter(Boolean).join(" to ") || MISSING;
  showTooltip(event, `<p class="tooltip-title">Verified relationship</p><p class="tooltip-row"><strong>Contribution:</strong> ${html(contributionText(edge))}</p><p class="tooltip-row"><strong>Path:</strong> ${html(path)}</p><p class="tooltip-row"><strong>Highest verified source:</strong> ${html(tierOf(edge))}</p><p class="tooltip-row">Click for full dossier.</p>`);
}

function openGroupDrilldown(key) {
  const group = state.display?.groups.get(key);
  if (!group) return;
  const panel = $("#groupDrilldown");
  const entries = group.members.map((node) => {
    const related = group.edges.filter((edge) => edge.from === node.id || edge.to === node.id);
    const path = related.map(contributionText).find((text) => text !== MISSING) || MISSING;
    const gaps = gapList(profileFor(node), node, related).join(" | ") || MISSING;
    return `<button type="button" class="group-entry" data-group-node="${html(node.id)}"><strong>${html(node.label)}</strong><span class="source-tier">${html(strongestTier([node, ...related]))}</span><span>${html(path)}</span><span class="muted">${html(gaps)}</span></button>`;
  }).join("");
  panel.innerHTML = `<button type="button" class="group-close" data-group-close>Close</button><h2>${html(group.label)}</h2><p>${html(group.question)}</p><p>${html(group.edges.length)} verified path${group.edges.length === 1 ? "" : "s"} in this group.</p>${entries || `<p>${html(MISSING)}</p>`}`;
  panel.hidden = false;
  panel.onclick = (event) => {
    if (event.target.closest("[data-group-close]")) return closeGroupDrilldown();
    const entry = event.target.closest("[data-group-node]");
    const node = entry && state.display.nodesById.get(entry.dataset.groupNode);
    if (node) openEntityDossier(node);
  };
}

function closeGroupDrilldown() { $("#groupDrilldown").hidden = true; $("#groupDrilldown").innerHTML = ""; }

function profileFor(node = {}) {
  const profiles = state.graph?.entityProfiles || state.graph?.profiles || {};
  return { ...node, ...(node.profile || {}), ...(node.entity || {}), ...(profiles[node.id] || {}) };
}

function gapsFrom(...items) {
  const gapText = (gap) => {
    if (typeof gap === "string") return clean(gap);
    return clean(gap?.field || gap?.label || gap?.name || gap?.status);
  };
  return [...new Set(items.flatMap((item) => [...asList(item?.missingFromCala), ...asList(item?.gaps)]).map(gapText).filter(Boolean))];
}

function gapList(profile, node, edges = []) {
  const reported = gapsFrom(profile, node, ...edges);
  const fallback = [];
  if (!clean(profile.category || profile.sector || node.sector)) fallback.push("Category");
  if (!clean(profile.headquarters || profile.hq || profile.hqCity || profile.address || node.hqCity)) fallback.push("Headquarters");
  if (!clean(profile.operationalStatus || profile.status || node.status)) fallback.push("Operational status");
  if (!asList(profile.leadership || profile.people || profile.worksAt).length) fallback.push("Leadership and people");
  if (!asList(profile.rounds || profile.fundingRounds || profile.issuerRounds || profile.raisedRounds).length) fallback.push("Funding timeline");
  return [...new Set([...reported, ...fallback])];
}

function dossierId(node) { return idOf(node); }
function dossierRef(node) { return `${typeOf(node).toLowerCase().replace(/\s+/g, "_")}:${dossierId(node)}`; }

function dataForDossier(node, payload) {
  const root = payload?.dossier || payload?.record || payload || {};
  const identity = root.identity || payload?.identity || root.entity || payload?.entity || {};
  const profile = root.profile || payload?.profile || {};
  const mapRecord = profileFor(node);
  const identityName = clean(identity.name || identity.label || identity.entityName);
  const rootName = clean(root.name || root.label || root.entityName);
  const identityType = clean(identity.entityType || identity.entity_type || identity.type || identity.kind);
  const rootType = clean(root.entityType || root.entity_type || root.type || root.kind);
  return {
    ...mapRecord,
    ...root,
    ...profile,
    ...identity,
    identity,
    profile,
    connections: asList(root.verifiedConnections || root.connections || payload?.verifiedConnections || payload?.connections),
    id: idOf(identity) || idOf(root) || node.id,
    name: identityName || rootName || node.label || nameOf(node),
    entityType: identityType || rootType || typeOf(node)
  };
}

function initials(value) {
  return nameOf({ name: value }).split(/\s+/).slice(0, 2).map((word) => word[0]).join("").toUpperCase() || "E";
}

function hasActiveEntity(node) {
  return state.activeRefs.some((ref) => ref.id === node.id);
}

async function openEntityDossier(node, options = {}) {
  if (!node?.id) return;
  const history = options.history || state.dossier?.history || [];
  const initial = dataForDossier(node);
  const cached = state.dossierCache.get(node.id);
  const currentFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  state.dossier = {
    node,
    data: cached || initial,
    tab: options.tab || "overview",
    history,
    loading: !cached,
    returnFocus: options.returnFocus || state.dossier?.returnFocus || currentFocus
  };
  $("#entityDossierBackdrop").hidden = false;
  renderDossier();
  $("#entityDossierModal").focus();
  if (cached) return;
  try {
    const params = new URLSearchParams({ ref: dossierRef(node) });
    for (const ref of state.activeRefs) params.append("activeRef", dossierRef(ref));
    if (state.activeRefs.length) params.set("mapEntityIds", state.activeRefs.map((ref) => ref.id).join(","));
    const payload = await fetchJson(`/api/entity-dossier?${params.toString()}`);
    const data = dataForDossier(node, payload);
    state.dossierCache.set(node.id, data);
    if (state.dossier?.node.id === node.id) {
      state.dossier.data = data;
      state.dossier.loading = false;
      renderDossier();
    }
  } catch {
    if (state.dossier?.node.id === node.id) {
      state.dossier.loading = false;
      renderDossier();
    }
  }
}

function closeDossier() {
  const returnFocus = state.dossier?.returnFocus;
  $("#entityDossierBackdrop").hidden = true;
  state.dossier = null;
  if (returnFocus?.isConnected) returnFocus.focus();
}

function dossierTier(data) {
  return strongestTier([data, ...asList(data.sources)]);
}

function fact(label, value, data) {
  const content = clean(value) || MISSING;
  return `<div class="fact"><span>${html(label)}</span><strong>${html(content)}</strong><i class="source-tier">${html(content === MISSING ? MISSING : dossierTier(data))}</i></div>`;
}

function renderDossier() {
  const dossier = state.dossier;
  if (!dossier) return;
  const { data, node } = dossier;
  $("#dossierInitials").textContent = initials(data.name);
  $("#dossierTitle").textContent = nameOf(data);
  $("#dossierTypeBadge").textContent = typeBadge(data);
  $("#dossierDescription").textContent = clean(data.description || data.summary) || MISSING;
  $("#dossierMeta").textContent = [clean(data.headquarters || data.hq || data.hqCity || data.country), clean(data.founded || data.foundingDate), clean(data.operationalStatus || data.status)].filter(Boolean).join(" | ") || MISSING;
  $("#dossierTier").textContent = dossierTier(data);
  $("#dossierBackBtn").hidden = !dossier.history.length;
  $("#dossierAddBtn").hidden = hasActiveEntity(node) || state.activeRefs.length >= 4;
  document.querySelectorAll("[data-dossier-tab]").forEach((tab) => {
    const active = tab.dataset.dossierTab === dossier.tab;
    tab.classList.toggle("is-active", active);
    tab.setAttribute("aria-selected", String(active));
    tab.tabIndex = active ? 0 : -1;
    if (active) $("#dossierBody").setAttribute("aria-labelledby", tab.id);
  });
  $("#dossierBody").innerHTML = renderDossierTab(dossier);
  bindDossierBody();
}

function recordText(record) {
  if (typeof record === "string") return record;
  const base = clean(record.name || record.label || record.title || record.type || record.role || record.relation);
  const rest = [record.role, record.eventDate || record.date, record.description].map(clean).filter((value) => value && value !== base).join(" | ");
  return [base, rest].filter(Boolean).join(" | ") || MISSING;
}

function peopleFor(data) { return [...asList(data.people), ...asList(data.leadership), ...asList(data.worksAt)]; }
function roundsFor(data) { return [...asList(data.rounds), ...asList(data.fundingRounds), ...asList(data.issuerRounds), ...asList(data.raisedRounds)]; }
function relationshipRows(value) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object") return [];
  return Object.entries(value).flatMap(([direction, relations]) => {
    if (Array.isArray(relations)) return relations.map((record) => ({ ...record, direction }));
    if (!relations || typeof relations !== "object") return [];
    return Object.entries(relations).flatMap(([relation, records]) => asList(records).map((record) => ({ ...record, relation, direction })));
  });
}

function connectionRows(data) {
  return asList(data.connections || data.verifiedConnections);
}

function connectionGroup(record) {
  return canonicalGroup(record.contributionGroup || record.group || record.relation || record.relationship || record.connectionType);
}

function connectionPath(record) {
  const path = asList(record.path).map((step) => nameOf(step)).filter(Boolean);
  if (path.length) return path.join(" to ");
  return clean(record.entityName || record.name || record.label) || MISSING;
}

function sourcesFor(data) {
  const unique = new Map();
  const sourceBearingRecords = [
    data,
    ...peopleFor(data),
    ...roundsFor(data),
    ...relationshipRows(data.relationships),
    ...connectionRows(data),
    ...asList(data.corporateEvents),
    ...asList(data.financialMetrics),
    ...asList(data.employeeCountSeries)
  ];
  for (const source of sourceBearingRecords.flatMap((record) => asList(record?.sources))) {
    const key = clean(source?.id || source?.url || source?.title || source?.name);
    if (key && !unique.has(key)) unique.set(key, source);
  }
  return [...unique.values()];
}

function renderDossierTab(dossier) {
  const data = dossier.data;
  const loading = dossier.loading ? `<div class="dossier-section"><div class="skeleton" aria-label="Loading verified Cala record"></div></div>` : "";
  if (dossier.tab === "people") return renderPeopleTab(data, loading);
  if (dossier.tab === "funding") return renderFundingTab(data, loading);
  if (dossier.tab === "connections") return renderConnectionsTab(data, dossier.node, loading);
  if (dossier.tab === "timeline") return renderTimelineTab(data, loading);
  if (dossier.tab === "sources") return renderSourcesTab(data, dossier.node, loading);
  return renderOverviewTab(data, loading);
}

function renderOverviewTab(data, loading) {
  return `${loading}<section class="dossier-section"><h2>Identity</h2><div class="facts-grid">
    ${fact("Category", data.category || data.sector || data.entityType, data)}
    ${fact("Aliases", asList(data.aliases).map(recordText).join(" | "), data)}
    ${fact("Headquarters", data.headquarters || data.hq || data.hqCity || data.address, data)}
    ${fact("Country", data.country, data)}
    ${fact("Founded", data.founded || data.foundingDate, data)}
    ${fact("Status", data.operationalStatus || data.status || data.ownershipStatus, data)}
    ${fact("Website", data.website || data.domain || data.url, data)}
    ${fact("Listing or parent", data.listing || data.parentCompany || data.parent || data.acquiredBy, data)}
  </div></section><section class="dossier-section"><h2>Description</h2><p class="dossier-empty">${html(clean(data.description || data.summary) || MISSING)}</p></section>`;
}

function renderPeopleTab(data, loading) {
  const people = peopleFor(data);
  if (!people.length) return `${loading}<p class="dossier-empty">No people records in Cala.</p>`;
  return `${loading}<section class="dossier-section"><h2>People</h2><div class="table-wrap"><table><thead><tr><th>Name</th><th>Relation</th><th>Title</th><th>Since to until</th><th>Prior company</th><th>Source</th></tr></thead><tbody>${people.map((person) => {
    const id = idOf(person);
    const name = nameOf(person);
    const nameCell = id ? `<button class="dossier-link-button" data-open-person="${html(id)}">${html(name)}</button>` : html(name);
    return `<tr><td>${nameCell}</td><td>${html(clean(person.relation || person.relationship) || MISSING)}</td><td>${html(clean(person.role || person.title) || MISSING)}</td><td>${html([clean(person.validSince || person.since), clean(person.validUntil || person.until)].filter(Boolean).join(" to ") || MISSING)}</td><td>${html(clean(person.priorCompany || person.prior_company) || MISSING)}</td><td><span class="source-tier">${html(tierOf(person))}</span></td></tr>`;
  }).join("")}</tbody></table></div></section>`;
}

function clickableEntity(label, record, attribute) {
  const id = idOf(record);
  return id ? `<button type="button" class="inline-chip" ${attribute}="${html(id)}">${html(label)}</button>` : `<span class="inline-chip">${html(label)}</span>`;
}

function renderFundingTab(data, loading) {
  const rounds = roundsFor(data);
  const investors = asList(data.investors);
  const portfolio = asList(data.portfolio);
  const fallback = [data.listing, data.parentCompany || data.parent, data.acquiredBy].filter(Boolean);
  const roundsHtml = rounds.length ? `<div class="timeline">${rounds.map((round) => {
    const names = [...asList(round.investors), ...asList(round.investorNames), round.leadInvestor].filter(Boolean).map((investor) => typeof investor === "string" ? `<span class="inline-chip">${html(investor)}</span>` : clickableEntity(nameOf(investor), investor, "data-open-investor")).join(" ");
    const amount = [clean(round.amount ?? round.amountEurM ?? round.transactionValue), clean(round.currency || round.transactionValueUnits)].filter(Boolean).join(" ");
    return `<div class="timeline-item"><time>${html(clean(round.date || round.eventDate) || MISSING)}</time><strong>${html(clean(round.type || round.roundType) || MISSING)}</strong><div>${html(amount || MISSING)}</div><div>${names || MISSING}</div><span class="source-tier">${html(tierOf(round))}</span></div>`;
  }).join("")}</div>` : `<p class="dossier-empty">No funding rounds in Cala.</p>`;
  return `${loading}<section class="dossier-section"><h2>Funding rounds</h2>${roundsHtml}</section><section class="dossier-section"><h2>Investors</h2>${investors.length ? `<div class="data-list">${investors.map((investor) => `<li>${clickableEntity(nameOf(investor), investor, "data-open-investor")} <span class="source-tier">${html(tierOf(investor))}</span></li>`).join("")}</div>` : `<p class="dossier-empty">${html(MISSING)}</p>`}</section><section class="dossier-section"><h2>Portfolio and corporate facts</h2>${portfolio.length || fallback.length ? `<ul class="data-list">${portfolio.map((item) => `<li>${clickableEntity(nameOf(item), item, "data-open-investor")}</li>`).join("")}${fallback.map((item) => `<li>${html(recordText(item))}</li>`).join("")}</ul>` : `<p class="dossier-empty">${html(MISSING)}</p>`}</section>`;
}

function mapConnections(node) {
  if (!state.display) return [];
  return state.display.edges.filter((edge) => edge.from === node.id || edge.to === node.id);
}

function renderConnectionsTab(data, node, loading) {
  const remoteConnections = connectionRows(data);
  const grouped = Object.entries(GROUPS).map(([key, group]) => {
    const edges = mapConnections(node).filter((edge) => edge.group === key);
    const connections = remoteConnections.filter((connection) => connectionGroup(connection) === key);
    const contribution = [...edges.map(contributionText), ...connections.map((connection) => clean(connection.relation || connection.relationship || connection.connectionType))]
      .filter((text) => text && text !== MISSING)
      .join(" | ") || MISSING;
    return `<li><strong>${html(group.label)}</strong><br>${html(contribution)}<span class="source-tier">${html(strongestTier([...edges, ...connections]))}</span></li>`;
  }).join("");
  const mapPaths = mapConnections(node).map((edge) => {
    const from = state.display.nodesById.get(edge.from);
    const to = state.display.nodesById.get(edge.to);
    return `<button type="button" class="group-entry" data-focus-edge="${html(edge.id)}"><strong>${html([from?.label, to?.label].filter(Boolean).join(" to "))}</strong><span>${html(contributionText(edge))}</span><span class="source-tier">${html(tierOf(edge))}</span></button>`;
  }).join("");
  const verifiedPaths = remoteConnections.map((connection, index) => `<button type="button" class="group-entry" data-focus-connection="${index}"><strong>${html(connectionPath(connection))}</strong><span>${html(clean(connection.relation || connection.relationship || connection.connectionType) || MISSING)}</span><span class="source-tier">${html(tierOf(connection))}</span></button>`).join("");
  return `${loading}<section class="dossier-section"><h2>How ${html(nameOf(data))} contributes to this map</h2><ul class="data-list">${grouped}</ul></section><section class="dossier-section"><h2>Verified paths to mapped entities</h2>${verifiedPaths || mapPaths || `<p class="dossier-empty">${html(MISSING)}</p>`}</section><section class="dossier-section"><h2>Additional Cala connections</h2>${mapPaths && verifiedPaths ? mapPaths : `<p class="dossier-empty">${html(MISSING)}</p>`}</section>`;
}

function renderTimelineTab(data, loading) {
  const observations = asList(data.employeeCountSeries);
  const events = [...asList(data.corporateEvents), ...asList(data.financialMetrics), ...relationshipRows(data.relationships)].sort((a, b) => String(a.date || a.eventDate || "").localeCompare(String(b.date || b.eventDate || "")));
  const observationRows = observations.length ? `<div class="table-wrap"><table><thead><tr><th>Date</th><th>Observed value</th><th>Source</th></tr></thead><tbody>${observations.map((item) => `<tr><td>${html(clean(item.date) || MISSING)}</td><td>${html(clean(item.value ?? item.count ?? item.employeeCount) || MISSING)}</td><td><span class="source-tier">${html(tierOf(item))}</span></td></tr>`).join("")}</tbody></table></div>` : `<p class="dossier-empty">${html(MISSING)}</p>`;
  return `${loading}<section class="dossier-section"><h2>Headcount observations</h2>${observationRows}</section><section class="dossier-section"><h2>Corporate events and filings</h2>${events.length ? `<div class="timeline">${events.map((item) => `<div class="timeline-item"><time>${html(clean(item.date || item.eventDate) || MISSING)}</time><strong>${html(recordText(item))}</strong><span class="source-tier">${html(tierOf(item))}</span></div>`).join("")}</div>` : `<p class="dossier-empty">${html(MISSING)}</p>`}</section>`;
}

function renderSourcesTab(data, node, loading) {
  const sources = sourcesFor(data);
  const gaps = gapList(data, node, mapConnections(node));
  const sourceRows = sources.length ? `<ul class="data-list">${sources.map((source) => {
    const label = clean(source.title || source.name || source.publisher || source.id || source.url) || MISSING;
    const url = clean(source.url || source.document || source.link);
    return `<li>${url ? `<a href="${html(url)}" target="_blank" rel="noreferrer">${html(label)}</a>` : html(label)}<br><span class="muted">${html(clean(source.date) || MISSING)}</span><span class="source-tier">${html(tierOf(source))}</span></li>`;
  }).join("")}</ul>` : `<p class="dossier-empty">${html(MISSING)}</p>`;
  return `${loading}<section class="dossier-section"><h2>Sources</h2>${sourceRows}</section><section class="dossier-section"><h2>Not found in Cala</h2>${gaps.length ? `<ul class="data-list">${gaps.map((gap) => `<li><strong>${html(gap)}</strong><br><span class="muted">${html(MISSING)}</span></li>`).join("")}</ul>` : `<p class="dossier-empty">${html(MISSING)}</p>`}</section>`;
}

function bindDossierBody() {
  $("#dossierBody").onclick = (event) => {
    const person = event.target.closest("[data-open-person]");
    const investor = event.target.closest("[data-open-investor]");
    const focus = event.target.closest("[data-focus-edge]");
    const connection = event.target.closest("[data-focus-connection]");
    const id = person?.dataset.openPerson || investor?.dataset.openInvestor;
    if (id) {
      const candidate = findAnyNode(id) || { id, name: event.target.textContent, entityType: person ? "Person" : "Organization" };
      openEntityDossier(candidate, { history: [...state.dossier.history, state.dossier.node] });
      return;
    }
    if (focus) {
      state.highlightEdgeId = focus.dataset.focusEdge;
      state.highlightId = null;
      closeDossier();
      renderMap();
      fitMap();
      return;
    }
    if (connection) {
      const record = connectionRows(state.dossier.data)[Number(connection.dataset.focusConnection)];
      const bridgeId = idOf(record?.bridge);
      const counterpartId = clean(record?.entityId);
      const relatedEdge = state.display?.edges.find((edge) => {
        if (bridgeId) return edge.from === bridgeId || edge.to === bridgeId;
        return (edge.from === state.dossier.node.id && edge.to === counterpartId) || (edge.to === state.dossier.node.id && edge.from === counterpartId);
      });
      state.highlightEdgeId = relatedEdge?.id || null;
      state.highlightId = bridgeId || counterpartId || state.dossier.node.id;
      closeDossier();
      renderMap();
      if (state.highlightId) focusNodeOnMap(state.highlightId);
    }
  };
}

function findAnyNode(id) {
  return state.display?.nodesById.get(id) || state.graph?.nodes?.find((node) => idOf(node) === id) || state.activeRefs.find((ref) => ref.id === id);
}

function showDossierOnMap() {
  const node = state.dossier?.node;
  if (!node) return;
  state.highlightId = node.id;
  state.highlightEdgeId = null;
  closeDossier();
  renderMap();
  focusNodeOnMap(node.id);
}

async function makeDossierCenter() {
  const node = state.dossier?.node;
  if (!node) return;
  const ref = entityRef(node);
  const all = [ref, ...state.activeRefs.filter((item) => item.id !== ref.id)];
  state.activeRefs = all.slice(0, 4);
  state.drafts = state.activeRefs.map((entry) => ({ key: draftKey(entry.name), text: entry.name, status: "resolved", entity: entry, matches: [] }));
  closeDossier();
  renderDrafts();
  await buildMap();
}

async function addDossierEntity() {
  const node = state.dossier?.node;
  if (!node || state.activeRefs.length >= 4 || hasActiveEntity(node)) return;
  const ref = entityRef(node);
  state.drafts.push({ key: draftKey(ref.name), text: ref.name, status: "resolved", entity: ref, matches: [] });
  closeDossier();
  renderDrafts();
  await buildMap();
}

function focusNodeOnMap(id) {
  const point = state.display?.positions.get(id);
  const canvas = $("#bridgeMapCanvas").getBoundingClientRect();
  if (!point) return;
  state.panX = Math.round(canvas.width / 2 - point.x * state.zoom);
  state.panY = Math.round(canvas.height / 2 - point.y * state.zoom);
  applyViewport();
}

function boundsForPositions(positions) {
  const values = [...positions.values()];
  if (!values.length) return { minX: 0, minY: 0, maxX: MAP_W, maxY: MAP_H };
  return values.reduce((bounds, point) => ({
    minX: Math.min(bounds.minX, point.x - point.radius - 110),
    minY: Math.min(bounds.minY, point.y - point.radius - 70),
    maxX: Math.max(bounds.maxX, point.x + point.radius + 110),
    maxY: Math.max(bounds.maxY, point.y + point.radius + 70)
  }), { minX: MAP_W, minY: MAP_H, maxX: 0, maxY: 0 });
}

function applyViewport() {
  const viewport = $("#mapViewport");
  viewport.style.transform = `translate(${state.panX}px, ${state.panY}px) scale(${state.zoom})`;
  viewport.classList.toggle("is-readable", state.zoom >= 0.78);
}

function fitMap() {
  if (!state.display?.positions) return;
  const rect = $("#bridgeMapCanvas").getBoundingClientRect();
  const bounds = boundsForPositions(state.display.positions);
  const zoom = Math.min(0.82, Math.max(0.23, Math.min((rect.width - 80) / (bounds.maxX - bounds.minX), (rect.height - 80) / (bounds.maxY - bounds.minY))));
  state.zoom = Math.round(zoom * 100) / 100;
  state.panX = Math.round((rect.width - (bounds.minX + bounds.maxX) * state.zoom) / 2);
  state.panY = Math.round((rect.height - (bounds.minY + bounds.maxY) * state.zoom) / 2);
  applyViewport();
}

function renderAll({ fit = false } = {}) {
  renderActiveChips();
  renderMap();
  if (fit) fitMap();
}

function renderAutocomplete(matches) {
  const popup = $("#searchSuggestPopup");
  if (!matches.length) {
    popup.hidden = true;
    popup.innerHTML = "";
    return;
  }
  popup.innerHTML = matches.map((match, index) => `<button type="button" class="search-result" data-autocomplete-index="${index}" role="option"><span class="search-result-name">${html(match.name)}</span><span class="search-result-kind">${html(typeBadge(match))}</span><span class="search-result-meta">${html(metaOf(match))}</span></button>`).join("");
  popup.hidden = false;
  popup.onclick = (event) => {
    const button = event.target.closest("[data-autocomplete-index]");
    if (!button) return;
    addResolvedEntity(matches[Number(button.dataset.autocompleteIndex)]);
    $("#aiSearchInput").value = "";
    popup.hidden = true;
  };
}

function bindAdder() {
  const form = $("#aiSearchForm");
  const input = $("#aiSearchInput");
  input.addEventListener("input", () => {
    if (input.value.includes(",")) {
      const parts = input.value.split(",");
      input.value = parts.pop();
      addDraftTexts(parts);
    }
    clearTimeout(state.searchTimer);
    const value = clean(input.value);
    if (value.length < 2) return renderAutocomplete([]);
    const sequence = ++state.searchSequence;
    state.searchTimer = setTimeout(async () => {
      try {
        const matches = await searchLive(value);
        if (sequence === state.searchSequence && clean(input.value) === value) renderAutocomplete(matches);
      } catch {
        if (sequence === state.searchSequence) renderAutocomplete([]);
      }
    }, 250);
  });
  input.addEventListener("keydown", (event) => {
    if ((event.key === "Enter" || event.key === "Tab" || event.key === ",") && clean(input.value)) {
      event.preventDefault();
      addDraftTexts([input.value]);
      input.value = "";
      renderAutocomplete([]);
      return;
    }
    if (event.key === "Backspace" && !input.value && state.drafts.length) {
      state.drafts.pop();
      renderDrafts();
    }
    if (event.key === "Escape") renderAutocomplete([]);
  });
  input.addEventListener("paste", (event) => {
    const pasted = event.clipboardData?.getData("text") || "";
    if (!pasted.includes(",")) return;
    event.preventDefault();
    if (clean(input.value)) addDraftTexts([input.value]);
    input.value = "";
    addDraftTexts(pasted.split(","));
    renderAutocomplete([]);
  });
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (clean(input.value)) {
      addDraftTexts([input.value]);
      input.value = "";
      renderAutocomplete([]);
      return;
    }
    buildMap();
  });
}

function bindCanvas() {
  const canvas = $("#bridgeMapCanvas");
  canvas.addEventListener("wheel", (event) => {
    event.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const beforeX = (event.clientX - rect.left - state.panX) / state.zoom;
    const beforeY = (event.clientY - rect.top - state.panY) / state.zoom;
    const factor = event.deltaY < 0 ? 1.12 : 0.89;
    const next = Math.max(0.22, Math.min(1.6, state.zoom * factor));
    state.panX = event.clientX - rect.left - beforeX * next;
    state.panY = event.clientY - rect.top - beforeY * next;
    state.zoom = next;
    applyViewport();
  }, { passive: false });
  canvas.addEventListener("pointerdown", (event) => {
    if (event.target.closest(".map-node, .edge-hit, button, input")) return;
    state.pointer = { x: event.clientX, y: event.clientY, panX: state.panX, panY: state.panY };
    canvas.classList.add("is-panning");
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener("pointermove", (event) => {
    if (!state.pointer) return;
    state.panX = state.pointer.panX + event.clientX - state.pointer.x;
    state.panY = state.pointer.panY + event.clientY - state.pointer.y;
    applyViewport();
  });
  const stop = () => { state.pointer = null; canvas.classList.remove("is-panning"); };
  canvas.addEventListener("pointerup", stop);
  canvas.addEventListener("pointercancel", stop);
}

function focusTrap(event) {
  if (event.key !== "Tab" || $("#entityDossierBackdrop").hidden) return;
  const focusable = [...$("#entityDossierModal").querySelectorAll("button:not([hidden]), a[href], [tabindex]:not([tabindex='-1'])")].filter((item) => !item.disabled);
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function cycleDossier(direction) {
  if (!state.dossier || !state.activeRefs.length) return;
  const current = state.activeRefs.findIndex((ref) => ref.id === state.dossier.node.id);
  const index = (Math.max(0, current) + direction + state.activeRefs.length) % state.activeRefs.length;
  const node = findAnyNode(state.activeRefs[index].id) || state.activeRefs[index];
  openEntityDossier(node, { history: state.dossier.history });
}

function bindDossier() {
  $("#entityDossierBackdrop").addEventListener("click", (event) => {
    if (event.target === $("#entityDossierBackdrop")) closeDossier();
  });
  $("#dossierCloseBtn").addEventListener("click", closeDossier);
  $("#dossierShowMapBtn").addEventListener("click", showDossierOnMap);
  $("#dossierCenterBtn").addEventListener("click", makeDossierCenter);
  $("#dossierAddBtn").addEventListener("click", addDossierEntity);
  $("#dossierBackBtn").addEventListener("click", () => {
    const previous = state.dossier?.history.pop();
    if (previous) openEntityDossier(previous, { history: state.dossier.history });
  });
  document.querySelectorAll("[data-dossier-tab]").forEach((tab) => tab.addEventListener("click", () => {
    if (!state.dossier) return;
    state.dossier.tab = tab.dataset.dossierTab;
    renderDossier();
  }));
  document.addEventListener("keydown", (event) => {
    if ($("#entityDossierBackdrop").hidden) return;
    if (event.key === "Escape") {
      event.preventDefault();
      closeDossier();
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      cycleDossier(-1);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      cycleDossier(1);
    }
    focusTrap(event);
  });
}

function bindControls() {
  $("#clearMapBtn").addEventListener("click", clearMap);
  $("#filtersBtn").addEventListener("click", () => {
    const panel = $("#mapFilterPanel");
    panel.hidden = !panel.hidden;
    $("#filtersBtn").setAttribute("aria-expanded", String(!panel.hidden));
  });
  $("#sharedOnlyFilter").addEventListener("change", (event) => { state.filters.sharedOnly = event.target.checked; renderMap(); fitMap(); });
  $("#filingOnlyFilter").addEventListener("change", (event) => { state.filters.filingOnly = event.target.checked; renderMap(); fitMap(); });
  $("#mapZoomIn").addEventListener("click", () => { state.zoom = Math.min(1.6, state.zoom * 1.16); applyViewport(); });
  $("#mapZoomOut").addEventListener("click", () => { state.zoom = Math.max(0.22, state.zoom * 0.86); applyViewport(); });
  $("#mapFit").addEventListener("click", fitMap);
  document.addEventListener("click", (event) => {
    if (!event.target.closest(".token-input-shell")) renderAutocomplete([]);
  });
  window.addEventListener("resize", fitMap);
}

bindAdder();
bindCanvas();
bindDossier();
bindControls();
renderDrafts();
renderActiveChips();
applyViewport();
