// Revealed Thesis: map-first Cala entity explorer.
// Any company, investor or person can be the center. Facts and sources only, no scores.

const GROUPS = [
  { key: "access", label: "Access", question: "Who can open the door?" },
  { key: "lineage", label: "Lineage", question: "Where do the team and portfolio come from?" },
  { key: "timing", label: "Timing", question: "Why look now?" },
  { key: "caution", label: "Caution", question: "What should you check first?" }
];
const GROUP_BY_KEY = Object.fromEntries(GROUPS.map((g) => [g.key, g]));

// Geometry in map units. Fonts are large because the map is usually viewed zoomed out.
const R_HUB = 430;
const R_ITEM = [760, 880, 960];
const CENTER_R = 92;
const HUB_R = 46;
const ITEM_R = 24;
const ITEM_FONT = 30;
const HUB_FONT = 34;
const MIN_ITEM_ARC = 150; // minimum distance between sibling items on the ring
const COMPARE_SEP = 2700;
const MAX_CENTERS = 3;
const LABEL_MIN_SCREEN_PX = 9.5;

const state = {
  bootstrap: null,
  liveAvailable: false,
  centers: [], // [{ ref, data }]
  layout: null,
  view: { x: 0, y: 0, k: 0.3 },
  drillGroup: null,
  selectedKey: null,
  inspector: null // { type: 'item'|'center'|'group', ... }
};

/* ------------------------------------------------------------ utilities */

const $ = (id) => document.getElementById(id);

function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function plain(text) {
  return String(text ?? "").replace(/—/g, ", ");
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function fmtMonth(iso) {
  const m = String(iso || "").match(/^(\d{4})-(\d{2})/);
  return m ? `${MONTHS[Number(m[2]) - 1]} ${m[1]}` : String(iso || "");
}

function rankTag(rank) {
  if (!rank) return `<span class="rank rank-none">Not found in Cala</span>`;
  const label = { FILING: "Filing", PRIMARY: "Primary", PRESS: "Press" }[rank] || rank;
  return `<span class="rank rank-${rank.toLowerCase()}" title="${esc(rankHelp(rank))}">${label}</span>`;
}

function rankHelp(rank) {
  return {
    FILING: "Official filing or registry record (strongest)",
    PRIMARY: "Company or investor's own statement",
    PRESS: "News report"
  }[rank] || "";
}

function initials(name) {
  const parts = String(name || "").replace(/[^A-Za-z0-9 ]/g, " ").trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] || "") + (parts[1]?.[0] || "")).toUpperCase() || "?";
}

function kindLabel(kind) {
  return { company: "Company", investor: "Investor", person: "Person", event: "Event", gap: "Data gap" }[kind] || "Entity";
}

async function fetchJson(url) {
  const res = await fetch(url);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(body.error || `Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return body;
}

let toastTimer = null;
function toast(msg) {
  const el = $("toast");
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), 2600);
}

/* ---------------------------------------------------------------- theme */

function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  try {
    localStorage.setItem("rte_theme_v2", theme);
  } catch (_) {}
}

/* ------------------------------------------------------- search widgets */

const LIVE_OFF_TEXT = "Live Cala lookup unavailable: showing indexed entities.";

function makeSearch({ form, input, list, onPick, onNotice }) {
  let timer = null;
  let pending = null;
  let results = [];
  let activeIdx = -1;

  function close() {
    list.hidden = true;
    input.setAttribute("aria-expanded", "false");
    activeIdx = -1;
  }

  function render(q, res, loading) {
    results = res?.entities || [];
    const rows = results
      .map(
        (e, i) => `
        <button type="button" class="suggest-row${i === activeIdx ? " is-active" : ""}" role="option" data-idx="${i}">
          <span class="kind-dot kind-${esc(e.kind)}" aria-hidden="true">${esc(initials(e.name))}</span>
          <span class="suggest-main"><strong>${esc(e.name)}</strong><small>${esc(plain(e.subtitle || e.typeLabel))}</small></span>
          <span class="suggest-type">${e.live ? "Live Cala" : esc(e.typeLabel || kindLabel(e.kind))}</span>
        </button>`
      )
      .join("");
    let foot = "";
    if (loading) foot = `<div class="suggest-foot">Searching ${state.liveAvailable ? "indexed data and live Cala" : "indexed data"}...</div>`;
    else if (!results.length) foot = `<div class="suggest-foot">${esc(noMatchText(q, res))}</div>`;
    else if (res && !res.live?.available) foot = `<div class="suggest-foot">${LIVE_OFF_TEXT}</div>`;
    else if (res?.live?.error) foot = `<div class="suggest-foot">Live Cala lookup failed, showing indexed entities.</div>`;
    list.innerHTML = rows + foot;
    list.hidden = false;
    input.setAttribute("aria-expanded", "true");
  }

  function query(q) {
    const p = fetchJson(`/api/search?q=${encodeURIComponent(q)}&live=1`).catch(() => ({ entities: [], live: { available: false } }));
    pending = { q, p };
    return p;
  }

  input.addEventListener("input", () => {
    const q = input.value.trim();
    onNotice?.("");
    clearTimeout(timer);
    if (q.length < 2) {
      close();
      return;
    }
    render(q, null, true);
    timer = setTimeout(async () => {
      const res = await query(q);
      if (input.value.trim() === q) render(q, res, false);
    }, 180);
  });

  input.addEventListener("keydown", (e) => {
    if (list.hidden || !results.length) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      activeIdx = (activeIdx + (e.key === "ArrowDown" ? 1 : -1) + results.length) % results.length;
      list.querySelectorAll(".suggest-row").forEach((row, i) => row.classList.toggle("is-active", i === activeIdx));
    } else if (e.key === "Escape") {
      close();
    }
  });

  list.addEventListener("click", (e) => {
    const row = e.target.closest("[data-idx]");
    if (!row) return;
    const picked = results[Number(row.dataset.idx)];
    close();
    input.value = "";
    onPick(picked);
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const q = input.value.trim();
    if (q.length < 2) return;
    clearTimeout(timer);
    // Enter before suggestions arrive still runs the (live) lookup and takes the top match.
    const res = pending?.q === q ? await pending.p : await query(q);
    const pick = results.length && pending?.q === q && activeIdx >= 0 ? results[activeIdx] : res.entities?.[0];
    close();
    if (!pick) {
      onNotice?.(noMatchText(q, res));
      return;
    }
    input.value = "";
    onPick(pick);
  });

  document.addEventListener("click", (e) => {
    if (!form.contains(e.target)) close();
  });
}

function noMatchText(q, res) {
  if (res && res.live && !res.live.available) {
    return `"${q}" is not in the indexed data, and live Cala lookup is unavailable on this server (no API key configured), so the wider Cala graph cannot be searched right now. Try an indexed company, investor or person.`;
  }
  if (res?.live?.error) return `"${q}" is not in the indexed data, and the live Cala lookup failed. Try again in a moment.`;
  return `No company, investor or person matching "${q}" was found in Cala.`;
}

/* ------------------------------------------------------------ data flow */

async function loadEntity(ref) {
  return fetchJson(`/api/entity-map?ref=${encodeURIComponent(ref)}`);
}

function showView(view) {
  document.body.classList.toggle("view-landing", view === "landing");
  document.body.classList.toggle("view-map", view === "map");
  $("landing").hidden = view !== "landing";
  $("mapView").hidden = view !== "map";
}

async function setPrimary(ref, opts = {}) {
  $("mapLoading").hidden = false;
  showView("map");
  try {
    const data = await loadEntity(ref);
    state.centers = [{ ref, data }];
    state.drillGroup = null;
    state.selectedKey = null;
    closeInspector();
    renderAll({ fit: true });
    setMapNotice("");
    if (!opts.silentUrl) history.replaceState(null, "", `#${encodeURIComponent(ref)}`);
  } catch (err) {
    if (!state.centers.length) showView("landing");
    const msg = err.status === 404 ? `${err.message} Try an indexed company, investor or person.` : `Could not load the map: ${err.message}`;
    setNotice(msg);
  } finally {
    $("mapLoading").hidden = true;
  }
}

async function addCompare(ref) {
  if (state.centers.some((c) => c.ref === ref)) {
    toast("Already on the map");
    return;
  }
  if (state.centers.length >= MAX_CENTERS) {
    toast(`Up to ${MAX_CENTERS} entities can be compared. Remove one first.`);
    return;
  }
  $("mapLoading").hidden = false;
  try {
    const data = await loadEntity(ref);
    state.centers.push({ ref, data });
    state.drillGroup = null;
    renderAll({ fit: true });
    const shared = state.layout.items.filter((n) => n.shared).length;
    toast(shared ? `${data.center.name} added. ${shared} shared ${shared === 1 ? "connection" : "connections"} in the middle.` : `${data.center.name} added. No shared connections found in Cala.`);
  } catch (err) {
    setMapNotice(err.status === 404 ? err.message : `Could not add: ${err.message}`);
  } finally {
    $("mapLoading").hidden = true;
  }
}

function removeCenter(ref) {
  state.centers = state.centers.filter((c) => c.ref !== ref);
  if (!state.centers.length) {
    showView("landing");
    history.replaceState(null, "", "/");
    return;
  }
  state.drillGroup = null;
  closeInspector();
  renderAll({ fit: true });
}

function setNotice(msg) {
  const el = $("heroNotice");
  el.textContent = msg;
  el.hidden = !msg;
  if (!$("mapView").hidden) setMapNotice(msg);
}

function setMapNotice(msg) {
  const el = $("mapNotice");
  el.textContent = msg;
  el.hidden = !msg;
}

/* --------------------------------------------------------------- layout */

function polar(cx, cy, r, deg) {
  const a = (deg * Math.PI) / 180;
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
}

function textWidth(text, font) {
  return String(text).length * font * 0.56;
}

function buildLayout() {
  const n = state.centers.length;
  const centers = state.centers.map((c, i) => ({ ...c, x: (i - (n - 1) / 2) * COMPARE_SEP, y: 0, idx: i }));

  // Which centers mention each entity? Shared ones become bridges in the middle.
  const owners = new Map();
  centers.forEach((c) => {
    for (const g of GROUPS) {
      for (const it of c.data.groups[g.key].items) {
        if (it.kind === "gap" || it.kind === "event") continue;
        const list = owners.get(it.key) || [];
        if (!list.some((o) => o.ci === c.idx)) list.push({ ci: c.idx, group: g.key, item: it });
        owners.set(it.key, list);
      }
    }
  });
  const centerRefs = new Set(centers.map((c) => c.ref));
  const sharedKeys = new Set(n > 1 ? [...owners].filter(([k, l]) => l.length > 1 && !centerRefs.has(k)).map(([k]) => k) : []);
  // An item that is itself another center on the map is drawn as a direct link between the centers.
  const isOtherCenter = (c, it) => centerRefs.has(it.key) && it.key !== c.ref;
  const directLinks = [];

  const hubs = [];
  const items = [];
  const edges = [];
  const wedges = [];

  for (const c of centers) {
    const counts = GROUPS.map((g) => c.data.groups[g.key].items.filter((it) => !sharedKeys.has(it.key) && !isOtherCenter(c, it)).length);
    // Wedge size follows how much verified evidence a group has; never shown as a number.
    const weights = counts.map((k) => Math.max(1, k) ** 0.6);
    const total = weights.reduce((a, b) => a + b, 0);
    let spans = weights.map((w) => Math.max(55, (w / total) * 360));
    const scale = 360 / spans.reduce((a, b) => a + b, 0);
    spans = spans.map((s) => s * scale);
    let cursor = -180;

    GROUPS.forEach((g, gi) => {
      const start = cursor;
      const end = cursor + spans[gi];
      cursor = end;
      const mid = (start + end) / 2;
      const hubPos = polar(c.x, c.y, R_HUB, mid);
      const groupItems = c.data.groups[g.key].items;
      const hub = {
        id: `hub:${c.idx}:${g.key}`,
        ci: c.idx,
        group: g.key,
        x: hubPos.x,
        y: hubPos.y,
        angle: mid,
        count: groupItems.length,
        verified: groupItems.filter((it) => it.sources?.length).length,
        items: groupItems
      };
      hubs.push(hub);
      wedges.push({ ci: c.idx, group: g.key, start, end, cx: c.x, cy: c.y });
      edges.push({ id: `e:${c.idx}:${g.key}`, from: { x: c.x, y: c.y }, to: hubPos, group: g.key, kind: "spoke", ci: c.idx });

      const own = groupItems.filter((it) => !sharedKeys.has(it.key) && !isOtherCenter(c, it));
      for (const it of groupItems.filter((x) => isOtherCenter(c, x))) directLinks.push({ from: hubPos, toRef: it.key, group: g.key, ci: c.idx, item: it });
      const pad = Math.min(12, spans[gi] * 0.12);
      const usable = Math.max(0, spans[gi] - 2 * pad);
      const maxFit = Math.max(1, Math.floor((usable * Math.PI * R_ITEM[0]) / 180 / MIN_ITEM_ARC) + 1);
      const drilled = state.drillGroup === g.key;
      const cap = drilled ? own.length : Math.min(own.length, maxFit, 9);
      const shown = own.slice(0, cap);
      const hiddenCount = own.length - shown.length;
      const slots = shown.length + (hiddenCount > 0 ? 1 : 0);
      // In drill-down, extra items go further out so they keep the same spacing.
      const step = slots > 1 ? usable / (slots - 1) : 0;
      shown.forEach((it, i) => {
        const ang = slots === 1 ? mid : start + pad + step * i;
        const ringIdx = slots > 3 ? i % 3 : i % 2;
        const r = R_ITEM[ringIdx];
        const pos = polar(c.x, c.y, r, ang);
        const node = { id: `item:${c.idx}:${g.key}:${it.key}`, key: it.key, ci: c.idx, group: g.key, item: it, x: pos.x, y: pos.y, angle: ang, r, shared: false };
        items.push(node);
        edges.push({ id: `e:${node.id}`, from: hubPos, to: pos, group: g.key, kind: "branch", ci: c.idx, ctrl: polar(c.x, c.y, R_HUB + (r - R_HUB) * 0.2, ang), itemId: node.id });
      });
      if (hiddenCount > 0) {
        const ang = start + pad + step * shown.length;
        const pos = polar(c.x, c.y, R_ITEM[0], ang);
        items.push({ id: `more:${c.idx}:${g.key}`, key: `more:${c.idx}:${g.key}`, ci: c.idx, group: g.key, more: hiddenCount, x: pos.x, y: pos.y, angle: ang, r: R_ITEM[0] });
        edges.push({ id: `e:more:${c.idx}:${g.key}`, from: hubPos, to: pos, group: g.key, kind: "branch", ci: c.idx, ctrl: polar(c.x, c.y, R_HUB + (R_ITEM[0] - R_HUB) * 0.2, ang), muted: true });
      }
    });
  }

  // Shared bridges: one node between the centers that share it, linked to each center's hub.
  const sharedList = [...sharedKeys];
  const byColumn = new Map();
  sharedList.forEach((key) => {
    const list = owners.get(key);
    const xs = list.map((o) => centers[o.ci].x);
    const colX = xs.reduce((a, b) => a + b, 0) / xs.length;
    const colKey = `${list.map((o) => o.ci).sort().join("-")}`;
    const col = byColumn.get(colKey) || { x: colX, keys: [], wide: list.length > 2 };
    col.keys.push(key);
    byColumn.set(colKey, col);
  });
  for (const col of byColumn.values()) {
    const m = col.keys.length;
    col.keys.forEach((key, i) => {
      const list = owners.get(key);
      const baseY = col.wide ? 1250 : 0;
      const y = baseY + (i - (m - 1) / 2) * 170;
      const node = { id: `shared:${key}`, key, ci: list[0].ci, group: list[0].group, item: list[0].item, owners: list, x: col.x, y, shared: true };
      items.push(node);
      for (const o of list) {
        const hub = hubs.find((h) => h.ci === o.ci && h.group === o.group);
        edges.push({ id: `e:shared:${key}:${o.ci}`, from: { x: hub.x, y: hub.y }, to: { x: col.x, y }, group: o.group, kind: "bridge", ci: o.ci, ctrl: { x: (hub.x + col.x) / 2, y: hub.y }, itemId: node.id });
      }
    });
  }

  for (const l of directLinks) {
    const target = centers.find((c) => c.ref === l.toRef);
    edges.push({ id: `e:direct:${l.ci}:${l.toRef}`, from: l.from, to: { x: target.x, y: target.y }, group: l.group, kind: "bridge", ci: l.ci, ctrl: { x: (l.from.x + target.x) / 2, y: l.from.y - 220 }, direct: l });
  }

  return { centers, hubs, items, edges, wedges, sharedCount: sharedList.length, directLinks };
}

/* --------------------------------------------------------------- render */

function svgEl(tag, attrs = {}, text = null) {
  const el = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const [k, v] of Object.entries(attrs)) if (v !== null && v !== undefined) el.setAttribute(k, v);
  if (text !== null) el.textContent = text;
  return el;
}

function arcPath(cx, cy, r0, r1, a0, a1) {
  const p0 = polar(cx, cy, r1, a0);
  const p1 = polar(cx, cy, r1, a1);
  const p2 = polar(cx, cy, r0, a1);
  const p3 = polar(cx, cy, r0, a0);
  const large = a1 - a0 > 180 ? 1 : 0;
  return `M${p0.x},${p0.y} A${r1},${r1} 0 ${large} 1 ${p1.x},${p1.y} L${p2.x},${p2.y} A${r0},${r0} 0 ${large} 0 ${p3.x},${p3.y} Z`;
}

function wrapLabel(text, maxChars) {
  const words = String(text).split(/\s+/);
  const lines = [];
  let cur = "";
  for (const w of words) {
    if ((cur + " " + w).trim().length > maxChars && cur) {
      lines.push(cur);
      cur = w;
    } else cur = (cur + " " + w).trim();
  }
  if (cur) lines.push(cur);
  if (lines.length > 2) return [lines[0], `${lines.slice(1).join(" ").slice(0, maxChars - 1)}...`];
  return lines;
}

function renderAll({ fit = false } = {}) {
  state.layout = buildLayout();
  renderMap();
  renderExplored();
  renderLegend();
  renderMobileGroups();
  if (fit) fitView();
  else applyView();
}

function renderMap() {
  const { centers, hubs, items, edges, wedges } = state.layout;
  const wl = $("wedgeLayer");
  const el = $("edgeLayer");
  const nl = $("nodeLayer");
  wl.replaceChildren();
  el.replaceChildren();
  nl.replaceChildren();
  const drill = state.drillGroup;

  for (const w of wedges) {
    const dim = drill && drill !== w.group;
    wl.append(svgEl("path", { d: arcPath(w.cx, w.cy, CENTER_R + 40, 1060, w.start + 1.2, w.end - 1.2), class: `wedge g-${w.group}${dim ? " is-dim" : ""}${drill === w.group ? " is-focus" : ""}` }));
  }

  for (const e of edges) {
    const dim = drill && drill !== e.group;
    const d = e.ctrl
      ? `M${e.from.x},${e.from.y} Q${e.ctrl.x},${e.ctrl.y} ${e.to.x},${e.to.y}`
      : `M${e.from.x},${e.from.y} L${e.to.x},${e.to.y}`;
    el.append(svgEl("path", { d, class: `edge edge-${e.kind} g-${e.group}${dim ? " is-dim" : ""}${e.muted ? " is-muted" : ""}`, "data-item": e.itemId || "" }));
  }

  for (const c of centers) {
    const g = svgEl("g", { class: "node node-center", transform: `translate(${c.x},${c.y})`, tabindex: "0", role: "button", "data-center": c.ref, "aria-label": `${c.data.center.name}, center of the map. Open profile.` });
    g.append(svgEl("circle", { r: CENTER_R, class: "center-disc" }));
    const lines = wrapLabel(c.data.center.name, 12);
    lines.forEach((ln, i) => g.append(svgEl("text", { class: "center-label", y: (i - (lines.length - 1) / 2) * 38 + 12, "text-anchor": "middle" }, ln)));
    g.append(svgEl("text", { class: "center-type", y: CENTER_R + 44, "text-anchor": "middle" }, c.data.center.typeLabel || kindLabel(c.data.center.kind)));
    nl.append(g);
  }

  for (const h of hubs) {
    const meta = GROUP_BY_KEY[h.group];
    const dim = drill && drill !== h.group;
    const g = svgEl("g", { class: `node node-hub g-${h.group}${dim ? " is-dim" : ""}${drill === h.group ? " is-focus" : ""}`, transform: `translate(${h.x},${h.y})`, tabindex: "0", role: "button", "data-hub": h.id, "data-group": h.group, "aria-label": `${meta.label}: ${meta.question} Open group.` });
    g.append(svgEl("circle", { r: HUB_R, class: "hub-disc" }));
    g.append(svgEl("text", { class: "hub-count", y: 12, "text-anchor": "middle" }, String(h.count)));
    const out = polar(0, 0, HUB_R + 46, h.angle);
    const anchor = Math.abs(Math.cos((h.angle * Math.PI) / 180)) < 0.3 ? "middle" : Math.cos((h.angle * Math.PI) / 180) > 0 ? "start" : "end";
    g.append(svgEl("text", { class: "hub-label", x: out.x, y: out.y - 8, "text-anchor": anchor }, meta.label.toUpperCase()));
    g.append(svgEl("text", { class: "hub-question", x: out.x, y: out.y + 28, "text-anchor": anchor }, meta.question));
    nl.append(g);
  }

  for (const n of items) {
    const dim = drill && drill !== n.group && !n.shared;
    const cls = ["node", "node-item", `g-${n.group}`, dim ? "is-dim" : "", n.shared ? "is-shared" : "", n.more ? "is-more" : "", n.item?.kind === "gap" ? "is-gap" : "", state.selectedKey === n.key ? "is-selected" : ""].join(" ");
    const label = n.more ? `+${n.more} more` : n.item.name;
    const g = svgEl("g", { class: cls, transform: `translate(${n.x},${n.y})`, tabindex: "0", role: "button", "data-node": n.id, "aria-label": n.more ? `${n.more} more in ${GROUP_BY_KEY[n.group].label}. Open group.` : `${n.item.name}: ${n.item.relation}. Open details.` });
    const rad = n.shared ? ITEM_R + 8 : ITEM_R;
    g.append(svgEl("circle", { r: rad, class: "item-disc" }));
    if (!n.more) g.append(svgEl("text", { class: "item-glyph", y: 7, "text-anchor": "middle" }, n.item.kind === "gap" ? "?" : n.item.kind === "event" ? "" : initials(n.item.name).slice(0, 2)));
    // Label sits on the outside of the ring so neighbours do not collide.
    const out = n.shared ? { x: 0, y: rad + 34 } : polar(0, 0, rad + 16, n.angle);
    const cos = n.shared ? 0 : Math.cos((n.angle * Math.PI) / 180);
    const anchor = Math.abs(cos) < 0.35 ? "middle" : cos > 0 ? "start" : "end";
    const dy = n.shared ? 0 : Math.sin((n.angle * Math.PI) / 180) > 0.6 ? 26 : Math.sin((n.angle * Math.PI) / 180) < -0.6 ? -8 : 10;
    const lines = wrapLabel(label, 22);
    lines.forEach((ln, i) => g.append(svgEl("text", { class: "item-label", x: out.x, y: out.y + dy + i * 34, "text-anchor": anchor }, ln)));
    nl.append(g);
  }
}

function renderExplored() {
  const box = $("exploredList");
  box.innerHTML = state.centers
    .map(
      (c, i) => `
      <span class="explored-pill">
        <button type="button" class="explored-name" data-focus-center="${esc(c.ref)}" title="Open ${esc(c.data.center.name)}">
          <span class="kind-dot kind-${esc(c.data.center.kind)}" aria-hidden="true">${esc(initials(c.data.center.name))}</span>
          ${esc(c.data.center.name)}${c.data.liveStatus === "live" ? ` <small>Live Cala</small>` : ""}
        </button>
        <button type="button" class="explored-x" data-remove-center="${esc(c.ref)}" aria-label="Remove ${esc(c.data.center.name)} from the map">&times;</button>
      </span>${i < state.centers.length - 1 ? `<span class="explored-vs" aria-hidden="true">vs</span>` : ""}`
    )
    .join("");
  $("compareBtn").disabled = state.centers.length >= MAX_CENTERS;
}

function renderLegend() {
  const primary = state.layout.hubs.filter((h) => h.ci === 0);
  const back = state.drillGroup ? `<button type="button" class="legend-back" data-legend-group="">Show all groups</button>` : "";
  $("mapLegend").innerHTML =
    back +
    primary
      .map(
        (h) => `
      <button type="button" class="legend-pill g-${h.group}${state.drillGroup === h.group ? " is-active" : ""}" data-legend-group="${h.group}" aria-pressed="${state.drillGroup === h.group}">
        <span class="legend-dot" aria-hidden="true"></span>${GROUP_BY_KEY[h.group].label}
      </button>`
      )
      .join("");
}

function renderMobileGroups() {
  const c = state.centers[0];
  if (!c) return;
  $("mobileGroups").innerHTML = GROUPS.map((g) => {
    const items = c.data.groups[g.key].items;
    const names = items.slice(0, 3).map((it) => it.name).join(", ");
    return `
      <button type="button" class="mobile-group g-${g.key}" data-legend-group="${g.key}">
        <span class="mg-head"><span class="legend-dot" aria-hidden="true"></span><strong>${g.label}</strong><span class="mg-q">${g.question}</span></span>
        <span class="mg-names">${esc(names || "Nothing found in Cala")}</span>
      </button>`;
  }).join("");
}

/* -------------------------------------------------------- pan and zoom */

function canvasSize() {
  const r = $("mapCanvas").getBoundingClientRect();
  return { w: r.width, h: r.height };
}

function applyView() {
  const { x, y, k } = state.view;
  $("viewport").setAttribute("transform", `translate(${x},${y}) scale(${k})`);
  $("mapSvg").classList.toggle("labels-hidden", k * ITEM_FONT < LABEL_MIN_SCREEN_PX);
  $("mapSvg").classList.toggle("hub-text-hidden", k * HUB_FONT < LABEL_MIN_SCREEN_PX - 1);
}

function contentBounds() {
  const pts = [];
  for (const c of state.layout.centers) pts.push([c.x - CENTER_R, c.y - CENTER_R], [c.x + CENTER_R, c.y + CENTER_R + 60]);
  for (const n of state.layout.items) {
    const w = textWidth(n.more ? "+9 more" : n.item.name.slice(0, 22), ITEM_FONT) + 50;
    const cos = n.shared ? 0 : Math.cos((n.angle * Math.PI) / 180);
    const left = cos < -0.35 ? n.x - w : cos > 0.35 ? n.x : n.x - w / 2;
    pts.push([left, n.y - 60], [left + w, n.y + 90]);
  }
  for (const h of state.layout.hubs) pts.push([h.x - 200, h.y - 90], [h.x + 200, h.y + 90]);
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
}

function fitView() {
  const { w, h } = canvasSize();
  if (!w || !h || !state.layout) return;
  const b = contentBounds();
  const insetRight = !$("inspector").hidden && window.innerWidth > 900 ? 440 : 0;
  const availW = w - insetRight - 40;
  const availH = h - 150;
  const k = Math.min(availW / (b.x1 - b.x0), availH / (b.y1 - b.y0));
  state.view.k = k;
  state.view.x = 20 + availW / 2 - ((b.x0 + b.x1) / 2) * k;
  state.view.y = 86 + availH / 2 - ((b.y0 + b.y1) / 2) * k;
  applyView();
}

function zoomAt(factor, sx, sy) {
  const v = state.view;
  const nk = Math.max(0.05, Math.min(2.5, v.k * factor));
  v.x = sx - ((sx - v.x) * nk) / v.k;
  v.y = sy - ((sy - v.y) * nk) / v.k;
  v.k = nk;
  applyView();
}

function bindPanZoom() {
  const svg = $("mapSvg");
  let drag = null;
  svg.addEventListener("pointerdown", (e) => {
    if (e.target.closest(".node")) return;
    drag = { x: e.clientX, y: e.clientY, vx: state.view.x, vy: state.view.y, moved: false };
    svg.setPointerCapture(e.pointerId);
  });
  svg.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
    state.view.x = drag.vx + dx;
    state.view.y = drag.vy + dy;
    applyView();
  });
  svg.addEventListener("pointerup", () => (drag = null));
  svg.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      const r = svg.getBoundingClientRect();
      if (e.ctrlKey || e.metaKey) {
        zoomAt(Math.exp(-e.deltaY * 0.01), e.clientX - r.left, e.clientY - r.top);
      } else {
        // Plain scroll pans, so the map never zooms into emptiness by accident.
        state.view.x -= e.deltaX;
        state.view.y -= e.deltaY;
        applyView();
      }
    },
    { passive: false }
  );
  $("zoomInBtn").addEventListener("click", () => {
    const { w, h } = canvasSize();
    zoomAt(1.3, w / 2, h / 2);
  });
  $("zoomOutBtn").addEventListener("click", () => {
    const { w, h } = canvasSize();
    zoomAt(1 / 1.3, w / 2, h / 2);
  });
  $("fitBtn").addEventListener("click", fitView);
  window.addEventListener("resize", () => state.layout && fitView());
}

/* ---------------------------------------------------- hover and tooltip */

function sourceLine(s) {
  if (!s) return `<div class="tt-src">${rankTag(null)}</div>`;
  return `<div class="tt-src">${rankTag(s.rank)} <span>${esc(plain(s.publisher || s.title))}${s.date ? `, ${esc(fmtMonth(s.date))}` : ""}</span></div>`;
}

function itemTooltip(n) {
  if (n.more) return `<strong>${n.more} more in ${GROUP_BY_KEY[n.group].label}</strong><p>Click to see every connection in this group.</p>`;
  const it = n.item;
  const rels = (n.owners || [{ ci: n.ci, group: n.group, item: it }])
    .map((o) => {
      const center = state.layout.centers[o.ci].data.center.name;
      return `<div class="tt-rel"><span class="tt-group g-${o.group}">${GROUP_BY_KEY[o.group].label}</span> <span>${esc(plain(o.item.relation))}${state.centers.length > 1 ? ` <em>(${esc(center)})</em>` : ""}</span></div>`;
    })
    .join("");
  return `
    <div class="tt-head"><strong>${esc(it.name)}</strong><span class="tt-kind">${n.shared ? "Shared connection" : kindLabel(it.kind)}</span></div>
    ${rels}
    <p class="tt-contrib">${esc(plain(it.contribution))}</p>
    ${sourceLine(it.sources?.[0])}
    <div class="tt-cue">Click for full evidence</div>`;
}

function hubTooltip(h) {
  const meta = GROUP_BY_KEY[h.group];
  const center = state.layout.centers[h.ci].data.center.name;
  const real = h.items.filter((it) => it.kind !== "gap");
  const gaps = h.items.filter((it) => it.kind === "gap");
  const top = real.slice(0, 3).map((it) => esc(it.name)).join(", ");
  const best = real.map((it) => it.rank).find(Boolean);
  return `
    <div class="tt-head"><strong>${meta.label}</strong><span class="tt-kind">${esc(center)}</span></div>
    <p class="tt-q">${meta.question}</p>
    <p class="tt-contrib">${real.length ? `${h.verified} verified ${h.verified === 1 ? "path" : "paths"}: ${top}${real.length > 3 ? ` and ${real.length - 3} more` : ""}.` : "No verified connections found in Cala."}${gaps.length ? ` ${gaps.length} ${gaps.length === 1 ? "item" : "items"} not found in Cala.` : ""}</p>
    ${best ? `<div class="tt-src">Strongest proof: ${rankTag(best)}</div>` : ""}
    <div class="tt-cue">Click to expand details</div>`;
}

function showTooltip(html, target) {
  const tt = $("tooltip");
  tt.innerHTML = html;
  tt.hidden = false;
  const cr = $("mapCanvas").getBoundingClientRect();
  const r = target.getBoundingClientRect();
  let x = r.right - cr.left + 14;
  let y = r.top - cr.top - 8;
  const tw = tt.offsetWidth;
  const th = tt.offsetHeight;
  if (x + tw > cr.width - 12) x = r.left - cr.left - tw - 14;
  if (x < 12) x = 12;
  if (y + th > cr.height - 12) y = cr.height - th - 12;
  if (y < 12) y = 12;
  tt.style.left = `${x}px`;
  tt.style.top = `${y}px`;
}

function hideTooltip() {
  $("tooltip").hidden = true;
}

function highlightPath(nodeId) {
  document.querySelectorAll(".edge.is-hot").forEach((e) => e.classList.remove("is-hot"));
  if (!nodeId) return;
  document.querySelectorAll(`.edge[data-item="${CSS.escape(nodeId)}"]`).forEach((e) => e.classList.add("is-hot"));
}

function bindNodeEvents() {
  const layer = $("nodeLayer");
  layer.addEventListener("pointerover", (e) => {
    const g = e.target.closest(".node");
    if (!g) return;
    if (g.dataset.node) {
      const n = state.layout.items.find((x) => x.id === g.dataset.node);
      if (n) {
        showTooltip(itemTooltip(n), g.querySelector("circle"));
        highlightPath(n.id);
      }
    } else if (g.dataset.hub) {
      const h = state.layout.hubs.find((x) => x.id === g.dataset.hub);
      if (h) showTooltip(hubTooltip(h), g.querySelector("circle"));
    } else if (g.dataset.center) {
      const c = state.layout.centers.find((x) => x.ref === g.dataset.center);
      showTooltip(`<div class="tt-head"><strong>${esc(c.data.center.name)}</strong><span class="tt-kind">${esc(c.data.center.typeLabel)}</span></div><p class="tt-contrib">${esc(plain(c.data.center.subtitle || ""))}</p><div class="tt-cue">Click for the full profile</div>`, g.querySelector("circle"));
    }
  });
  layer.addEventListener("pointerout", (e) => {
    const g = e.target.closest(".node");
    if (g && !g.contains(e.relatedTarget)) {
      hideTooltip();
      highlightPath(state.selectedNodeId || null);
    }
  });
  const activate = (g) => {
    hideTooltip();
    if (g.dataset.node) {
      const n = state.layout.items.find((x) => x.id === g.dataset.node);
      if (n?.more) return drillInto(n.group, n.ci);
      if (n) openItem(n);
    } else if (g.dataset.hub) {
      const h = state.layout.hubs.find((x) => x.id === g.dataset.hub);
      drillInto(h.group, h.ci);
    } else if (g.dataset.center) {
      openCenter(g.dataset.center);
    }
  };
  layer.addEventListener("click", (e) => {
    const g = e.target.closest(".node");
    if (g) activate(g);
  });
  layer.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    const g = e.target.closest(".node");
    if (g) {
      e.preventDefault();
      activate(g);
    }
  });
}

/* ------------------------------------------------------------ inspector */

function openInspector({ kicker, title, sub, body }) {
  $("inspKicker").textContent = kicker || "";
  $("inspTitle").textContent = title || "";
  $("inspSub").textContent = sub || "";
  $("inspSub").hidden = !sub;
  $("inspBody").innerHTML = body;
  $("inspBody").scrollTop = 0;
  const wasHidden = $("inspector").hidden;
  $("inspector").hidden = false;
  document.body.classList.add("has-inspector");
  if (wasHidden && window.innerWidth > 900) fitView();
}

function closeInspector() {
  if ($("inspector").hidden) return;
  $("inspector").hidden = true;
  document.body.classList.remove("has-inspector");
  state.selectedKey = null;
  state.selectedNodeId = null;
  highlightPath(null);
  document.querySelectorAll(".node.is-selected").forEach((n) => n.classList.remove("is-selected"));
  if (state.layout && window.innerWidth > 900) fitView();
}

function sourcesHtml(sources) {
  if (!sources?.length) return `<p class="muted">No source in Cala for this connection.</p>`;
  return `<ul class="src-list">${sources
    .map(
      (s) => `
      <li>
        ${rankTag(s.rank)}
        <div>
          ${s.url ? `<a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(plain(s.title))}</a>` : `<span>${esc(plain(s.title))}</span>`}
          <small>${esc(plain([s.publisher, fmtMonth(s.date)].filter(Boolean).join(", ")))}</small>
          ${s.snippet ? `<q>${esc(plain(s.snippet))}</q>` : ""}
        </div>
      </li>`
    )
    .join("")}</ul>`;
}

function factsHtml(center) {
  const rows = (center.facts || [])
    .map((f) => `<div class="fact"><dt>${esc(f.label)}</dt><dd>${f.value ? `${esc(plain(f.value))}${f.rank ? ` ${rankTag(f.rank)}` : ""}` : `<span class="rank rank-none">Not found in Cala</span>`}</dd></div>`)
    .join("");
  return rows ? `<dl class="facts">${rows}</dl>` : "";
}

function gapsHtml(gaps) {
  if (!gaps?.length) return `<p class="muted">Cala covers every field we check for this entity.</p>`;
  return `<ul class="gap-list">${gaps.map((g) => `<li><span class="rank rank-none">Not found in Cala</span> ${esc(g.replace(/ not found in Cala$/, ""))}</li>`).join("")}</ul>`;
}

async function openItem(n) {
  const it = n.item;
  state.selectedKey = n.key;
  state.selectedNodeId = n.id;
  document.querySelectorAll(".node.is-selected").forEach((x) => x.classList.remove("is-selected"));
  document.querySelector(`[data-node="${CSS.escape(n.id)}"]`)?.classList.add("is-selected");
  highlightPath(n.id);

  const owners = n.owners || [{ ci: n.ci, group: n.group, item: it }];
  const relHtml = owners
    .map((o) => {
      const center = state.layout.centers[o.ci].data.center.name;
      return `
        <div class="rel-card g-${o.group}">
          <div class="rel-top"><span class="tt-group g-${o.group}">${GROUP_BY_KEY[o.group].label}</span><span class="muted">with ${esc(center)}</span></div>
          <p class="rel-relation">${esc(plain(o.item.relation))}</p>
          <p>${esc(plain(o.item.contribution))}</p>
        </div>`;
    })
    .join("");
  const allSources = owners.flatMap((o) => o.item.sources || []);
  const uniqSources = allSources.filter((s, i) => allSources.findIndex((x) => (x.id || x.url) === (s.id || s.url)) === i);
  const actions = it.ref
    ? `<div class="insp-actions">
         <button type="button" class="btn-primary" data-recenter="${esc(it.ref)}">Put ${esc(it.name)} at the center</button>
         ${state.centers.some((c) => c.ref === it.ref) ? "" : `<button type="button" class="btn-ghost" data-add-compare="${esc(it.ref)}"${state.centers.length >= MAX_CENTERS ? " disabled" : ""}>Compare side by side</button>`}
       </div>`
    : "";

  openInspector({
    kicker: n.shared ? "Shared connection" : `${kindLabel(it.kind)} · ${GROUP_BY_KEY[n.group].label}`,
    title: it.name,
    sub: "",
    body: `
      ${actions}
      <section class="insp-sec"><h3>How it connects</h3>${relHtml}</section>
      <section class="insp-sec"><h3>Evidence</h3>${sourcesHtml(uniqSources)}</section>
      ${it.ref ? `<section class="insp-sec" id="itemProfile"><h3>Profile</h3><p class="muted">Loading profile from Cala...</p></section>` : it.kind === "gap" ? `<section class="insp-sec"><h3>Not found in Cala</h3><p>${esc(plain(it.contribution))}</p></section>` : ""}`
  });

  if (it.ref) {
    try {
      const prof = await loadEntity(it.ref);
      const sec = $("itemProfile");
      if (!sec || state.selectedKey !== n.key) return;
      const c = prof.center;
      sec.innerHTML = `
        <h3>Profile</h3>
        ${c.description ? `<p>${esc(plain(c.description))}</p>` : ""}
        ${factsHtml(c)}
        ${timelineHtml(c.timeline)}
        <h4>Not found in Cala</h4>${gapsHtml(prof.gaps)}`;
    } catch (err) {
      const sec = $("itemProfile");
      if (sec) sec.innerHTML = `<h3>Profile</h3><p class="muted">${esc(err.status === 404 ? "No profile for this entity in the indexed data, and live Cala lookup is unavailable." : err.message)}</p>`;
    }
  }
}

function timelineHtml(timeline) {
  if (!timeline?.length) return "";
  const rows = [...timeline]
    .filter((t) => t.date)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))
    .slice(0, 8)
    .map((t) => `<li><span class="tl-date">${esc(fmtMonth(t.date))}</span><span>${esc(plain(t.text))}</span>${t.sources?.[0] ? rankTag(t.sources[0].rank) : ""}</li>`)
    .join("");
  return rows ? `<h4>Timeline</h4><ul class="timeline">${rows}</ul>` : "";
}

function openCenter(ref) {
  const c = state.centers.find((x) => x.ref === ref);
  if (!c) return;
  const d = c.data;
  const groupsHtml = GROUPS.map((g) => {
    const items = d.groups[g.key].items;
    const real = items.filter((it) => it.kind !== "gap");
    return `
      <button type="button" class="group-row g-${g.key}" data-drill="${g.key}" data-drill-ci="${state.centers.indexOf(c)}">
        <span class="gr-head"><span class="legend-dot" aria-hidden="true"></span><strong>${g.label}</strong><span class="muted">${g.question}</span></span>
        <span class="gr-names">${real.length ? esc(real.slice(0, 3).map((it) => it.name).join(", ")) + (real.length > 3 ? ` and ${real.length - 3} more` : "") : "Nothing found in Cala"}</span>
      </button>`;
  }).join("");
  openInspector({
    kicker: `${d.center.typeLabel}${d.liveStatus === "live" ? " · Live Cala" : " · Indexed Cala data"}`,
    title: d.center.name,
    sub: plain(d.center.subtitle || ""),
    body: `
      ${d.center.description ? `<p class="lead">${esc(plain(d.center.description))}</p>` : ""}
      <section class="insp-sec"><h3>Verified profile</h3>${factsHtml(d.center)}${timelineHtml(d.center.timeline)}</section>
      <section class="insp-sec"><h3>What the map shows</h3><div class="group-rows">${groupsHtml}</div></section>
      <section class="insp-sec"><h3>Not found in Cala</h3>${gapsHtml(d.gaps)}</section>`
  });
}

function drillInto(groupKey, ci = 0) {
  state.drillGroup = groupKey;
  renderAll({ fit: false });
  const c = state.layout.centers[ci] || state.layout.centers[0];
  const g = GROUP_BY_KEY[groupKey];
  const items = c.data.groups[groupKey].items;
  const real = items.filter((it) => it.kind !== "gap");
  const gaps = items.filter((it) => it.kind === "gap");
  const ranks = ["FILING", "PRIMARY", "PRESS"].map((r) => ({ r, n: real.filter((it) => it.rank === r).length })).filter((x) => x.n);
  const list = real
    .map(
      (it) => `
      <li>
        <button type="button" class="drill-row" data-focus-key="${esc(it.key)}" data-focus-ci="${c.idx}">
          <span class="kind-dot kind-${esc(it.kind)}" aria-hidden="true">${it.kind === "event" ? "" : esc(initials(it.name))}</span>
          <span class="drill-main"><strong>${esc(it.name)}</strong><small>${esc(plain(it.relation))}</small><span>${esc(plain(it.contribution))}</span></span>
          ${rankTag(it.rank)}
        </button>
      </li>`
    )
    .join("");
  openInspector({
    kicker: `Group · ${c.data.center.name}`,
    title: `${g.label}: ${g.question}`,
    sub: "",
    body: `
      <p class="lead">${real.length ? `${real.length} verified ${real.length === 1 ? "connection" : "connections"}.` : "No verified connections found in Cala."} ${ranks.length ? `Proof: ${ranks.map((x) => `${x.n} ${x.r.toLowerCase()}`).join(", ")}.` : ""}</p>
      <div class="insp-actions"><button type="button" class="btn-ghost" data-legend-group="">Back to all groups</button></div>
      ${real.length ? `<section class="insp-sec"><h3>Connections</h3><ul class="drill-list">${list}</ul></section>` : ""}
      ${gaps.length ? `<section class="insp-sec"><h3>Not found in Cala</h3>${gapsHtml(gaps.map((x) => `${x.name} not found in Cala`))}</section>` : ""}`
  });
}

function exitDrill() {
  state.drillGroup = null;
  renderAll({ fit: false });
  closeInspector();
}

/* --------------------------------------------------------- status popup */

function renderStatus() {
  const b = state.bootstrap;
  const live = state.liveAvailable;
  $("dataStatusLabel").textContent = live ? "Live Cala on" : "Indexed data";
  $("dataStatusDot").classList.toggle("is-live", live);
  const s = b?.coverageStats || {};
  $("dataStatusPop").innerHTML = `
    <strong>Where the data comes from</strong>
    <p>${live ? "Live Cala lookup is on: searches also query the Cala knowledge graph and new entities are added to the map." : "Live Cala lookup is unavailable on this server (no API key configured). Search and maps use the indexed Cala snapshot only."}</p>
    <p class="muted">Indexed: ${s.companiesIndexed ?? "?"} companies, ${s.fundsIndexed ?? "?"} funds, ${s.roundsIndexed ?? "?"} funding rounds, ${s.sourcesIndexed ?? "?"} cited sources.</p>
    <p class="muted">Proof labels: ${rankTag("FILING")} official filing, ${rankTag("PRIMARY")} company or investor statement, ${rankTag("PRESS")} news report.</p>`;
}

/* ---------------------------------------------------------------- init */

function bindUi() {
  $("themeBtn").addEventListener("click", () => applyTheme(document.documentElement.getAttribute("data-theme") === "light" ? "dark" : "light"));
  $("brandHome").addEventListener("click", (e) => {
    e.preventDefault();
    showView("landing");
    history.replaceState(null, "", "/");
    $("heroSearchInput").focus();
  });
  $("dataStatusBtn").addEventListener("click", (e) => {
    e.stopPropagation();
    const pop = $("dataStatusPop");
    pop.hidden = !pop.hidden;
    $("dataStatusBtn").setAttribute("aria-expanded", String(!pop.hidden));
  });
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".status-wrap")) {
      $("dataStatusPop").hidden = true;
      $("dataStatusBtn").setAttribute("aria-expanded", "false");
    }
  });

  const pickPrimary = (e) => setPrimary(e.ref);
  makeSearch({ form: $("heroSearchForm"), input: $("heroSearchInput"), list: $("heroSuggest"), onPick: pickPrimary, onNotice: setNotice });
  makeSearch({ form: $("topSearchForm"), input: $("topSearchInput"), list: $("topSuggest"), onPick: pickPrimary, onNotice: setMapNotice });
  makeSearch({
    form: $("compareForm"),
    input: $("compareInput"),
    list: $("compareSuggest"),
    onPick: (e) => {
      $("compareForm").hidden = true;
      $("compareBtn").setAttribute("aria-expanded", "false");
      addCompare(e.ref);
    },
    onNotice: setMapNotice
  });

  document.querySelectorAll("[data-example-ref]").forEach((b) => b.addEventListener("click", () => setPrimary(b.dataset.exampleRef)));

  $("compareBtn").addEventListener("click", () => {
    const f = $("compareForm");
    f.hidden = !f.hidden;
    $("compareBtn").setAttribute("aria-expanded", String(!f.hidden));
    if (!f.hidden) $("compareInput").focus();
  });

  $("inspClose").addEventListener("click", () => (state.drillGroup ? exitDrill() : closeInspector()));

  document.addEventListener("click", (e) => {
    const t = e.target;
    const rm = t.closest("[data-remove-center]");
    if (rm) return removeCenter(rm.dataset.removeCenter);
    const fc = t.closest("[data-focus-center]");
    if (fc) return openCenter(fc.dataset.focusCenter);
    const lg = t.closest("[data-legend-group]");
    if (lg) return lg.dataset.legendGroup ? drillInto(lg.dataset.legendGroup, 0) : exitDrill();
    const dr = t.closest("[data-drill]");
    if (dr) return drillInto(dr.dataset.drill, Number(dr.dataset.drillCi || 0));
    const rc = t.closest("[data-recenter]");
    if (rc) return setPrimary(rc.dataset.recenter);
    const ac = t.closest("[data-add-compare]");
    if (ac) return addCompare(ac.dataset.addCompare);
    const fk = t.closest("[data-focus-key]");
    if (fk) {
      const n = state.layout.items.find((x) => x.key === fk.dataset.focusKey && (x.shared || x.ci === Number(fk.dataset.focusCi)));
      if (n) {
        focusNode(n);
        openItem(n);
      }
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (!$("tooltip").hidden) hideTooltip();
    if (!$("compareForm").hidden) {
      $("compareForm").hidden = true;
      $("compareBtn").setAttribute("aria-expanded", "false");
      return;
    }
    if (state.drillGroup) exitDrill();
    else closeInspector();
  });

  bindPanZoom();
  bindNodeEvents();
}

function focusNode(n) {
  const { w, h } = canvasSize();
  const insetRight = !$("inspector").hidden && window.innerWidth > 900 ? 440 : 0;
  state.view.x = (w - insetRight) / 2 - n.x * state.view.k;
  state.view.y = h / 2 - n.y * state.view.k;
  applyView();
}

async function init() {
  bindUi();
  try {
    state.bootstrap = await fetchJson("/api/bootstrap");
    state.liveAvailable = Boolean(state.bootstrap.coverageStats?.liveCalaConfigured);
  } catch (_) {
    state.liveAvailable = false;
  }
  renderStatus();
  const hashRef = decodeURIComponent(location.hash.slice(1));
  if (hashRef) setPrimary(hashRef, { silentUrl: true });
  else showView("landing");
}

init();
