/**
 * Console frontend: derives every frame from the machines in state.js.
 * No fetches to RPCs. No keys. No writes. The command sheet only shows a
 * pre-filled CLI command for the user's own shell; nothing here signs.
 */

import {
  INITIAL_DATA_LOAD,
  INITIAL_SHEET,
  INITIAL_SSE_STATE,
  actionForAgent,
  bannerOf,
  sheetReducer,
  dataLoadReducer,
  sseReducer,
  agentStateRead,
  viewportOf,
  viewIdForRoute,
  timelineResultOf,
} from "./state.js";
import { BRAND, BRAND_HTML, BRAND_LABEL } from "./brand.js";

const $ = (id) => document.getElementById(id);
const esc = (v) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
const fmtInt = (v) =>
  v == null || !Number.isFinite(Number(v)) ? "—" : new Intl.NumberFormat("en-US").format(Number(v));
const trunc8_6 = (v) => {
  if (typeof v !== "string" || v.length <= 16) return v ?? "—";
  return `${v.slice(0, 8)}…${v.slice(-6)}`;
};
const fmtKey = (key) => {
  if (typeof key !== "string") return "—";
  const prefix = "ed25519:";
  if (!key.startsWith(prefix)) return trunc8_6(key);
  const body = key.slice(prefix.length);
  return `ed25519:${trunc8_6(body)}`;
};
const shortHash = trunc8_6;
const timeFmt = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 19).replace("T", " ") + "Z";
};
const txUrl = (hash) => `https://testnet.nearblocks.io/txns/${encodeURIComponent(hash)}`;
const accountUrl = (id) => `https://testnet.nearblocks.io/account/${encodeURIComponent(id)}`;
const icon = (name) => {
  switch (name) {
    case "lock": return '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="18" height="11" x="3" y="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>';
    case "openlock": return '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="18" height="11" x="3" y="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg>';
    case "check": return '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>';
    case "alert": return '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>';
    case "copy": return '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>';
    default: return "";
  }
};

const state = {
  route: { name: "keyhalt", account: null },
  fleet: null,
  agent: null,
  timeline: null,
  dataLoad: { ...INITIAL_DATA_LOAD },
  sse: { ...INITIAL_SSE_STATE },
  sheet: { ...INITIAL_SHEET },
  loadGuard: { fleet: false, agent: false, timeline: false, summary: false },
  timers: new Map(),
  lastBlock: null,
  fleetFingerprint: null,
  claims: null,
  timelineExpanded: false,
};

const seenReceipts = new Set();

/* ---------- fetch ---------- */

async function getJSON(path) {
  const response = await fetch(path, { headers: { accept: "application/json" }, cache: "no-store" });
  let body = {};
  try { body = await response.json(); } catch { body = {}; }
  if (!response.ok) { const e = new Error(body.message ?? `HTTP ${response.status}`); e.code = body.code; e.status = response.status; throw e; }
  return body;
}

/* ---------- footer / header ---------- */

function updateNet(block) {
  if (Number.isFinite(Number(block)) && (state.lastBlock === null || Number(block) >= state.lastBlock)) {
    state.lastBlock = Number(block);
    $("block").textContent = String(state.lastBlock);
  } else if (state.lastBlock === null) {
    $("block").textContent = "—";
  }
  $("net").dataset.stale = state.dataLoad.status === "stale" || state.dataLoad.status === "error" ? "true" : "false";
}

async function loadClaimsOnce() {
  if (state.claims !== null) return;
  try {
    const health = await getJSON("/api/health");
    if (health.claims?.total > 0) {
      state.claims = health.claims;
      $("claims-link").textContent = `${fmtInt(health.claims.verified)}/${fmtInt(health.claims.total)}`;
    }
  } catch {
    // Footer ticket stays out of the way if health fails; it is optional.
  }
}

function applyBanner() {
  const banner = $("banner");
  const spot = bannerOf(state.dataLoad, state.sse);
  if (spot === null) {
    banner.hidden = true;
    banner.innerHTML = "";
    $("net").dataset.stale = "false";
    return;
  }
  $("banner").hidden = false;
  $("banner").className = `banner${spot.kind === "danger" ? " danger" : ""}`;
  if (state.dataLoad.status === "stale" || state.dataLoad.status === "error") {
    $("banner").innerHTML = `${icon("alert")}<span class="banner-msg">Reads failing · last good block <span class="mono">${esc(state.dataLoad.lastGoodBlock ?? "—")}</span></span>`;
  } else {
    $("banner").innerHTML = `${icon("alert")}<span class="banner-msg">${esc(spot.title ?? "Reconnecting")}</span>`;
  }
}

function setRowFlash(rowEl) {
  rowEl.classList.add("flash");
  rowEl.addEventListener("animationend", () => rowEl.classList.remove("flash"), { once: true });
}
function setChipFlash(chipEl) {
  chipEl.classList.add("flash");
  chipEl.addEventListener("animationend", () => chipEl.classList.remove("flash"), { once: true });
}

/* ---------- helpers ---------- */

function copyButton(text, label = "Copy") {
  return `<button class="copy-icon" type="button" data-copy="${esc(text)}" aria-label="${esc(label)}" title="${esc(label)}">${icon("copy")}</button>`;
}
function hashSpan(full, { link } = {}) {
  const short = fmtKey(full);
  const core = `<span class="mono trunc" title="${esc(full)}">${esc(short)}</span>`;
  if (link) return `<a href="${esc(link)}" rel="noopener noreferrer" target="_blank" class="mono">${core}</a>${copyButton(full, "Copy transaction hash")}`;
  return `<span class="mono hash">${core}${copyButton(full, "Copy hash")}</span>`;
}
function fullTxn(hash) {
  if (!hash) return "";
  return `<a href="${esc(txUrl(hash))}" class="mono" rel="noopener noreferrer" target="_blank">${esc(trunc8_6(hash))}</a>`;
}

/* ---------- keyhalt ---------- */

function renderKeyhalt(data, changedIds) {
  const body = $("keyhalt-body");
  const meta = $("keyhalt-meta");
  meta.textContent =
    data.status === "loading"
      ? "reading…"
      : `${fmtInt(data.totals?.agents)} agents · ${data.totals?.operatorKeys == null ? "—" : fmtInt(data.totals.operatorKeys)} operators · ${data.totals?.fullAccessKeys == null ? "—" : fmtInt(data.totals.fullAccessKeys)} full-access`;

  if (data.status === "loading") {
    body.innerHTML = `<div class="skeleton-table" aria-hidden="true"><span class="skeleton skeleton-wide"></span><span class="skeleton"></span><span class="skeleton skeleton-wide"></span><span class="skeleton"></span><span class="skeleton skeleton-wide"></span><span class="skeleton"></span></div>`;
    body.setAttribute("aria-busy", "true");
    return;
  }

  const agents = Array.isArray(data.agents) ? data.agents : [];
  if (data.status === "empty" || agents.length === 0) {
    body.innerHTML = `<div class="state-flat"><h2>No agents</h2><p>Set <code>KEYHALT_CONSOLE_ACCOUNTS</code> and restart.</p></div>`;
    body.setAttribute("aria-busy", "false");
    return;
  }

  const rows = agents.map((agent) => {
    const stateCell =
      agent.state === "frozen"
        ? '<span class="state frozen"><span class="dot"></span>Frozen</span>'
        : agent.state === "active"
          ? '<span class="state active"><span class="dot"></span>Active</span>'
          : '<span class="state unknown"><span class="dot"></span>Unknown</span>';
    const action = actionForAgent({ mode: agent.mode ?? "A", paused: agent.paused });
    let actionCell = "";
    if (action.includes("freeze")) actionCell = `<button class="action-btn danger" type="button" data-action="freeze" data-agent="${esc(agent.accountId)}" data-mode="A">Freeze</button>`;
    else if (action.includes("unfreeze")) actionCell = `<button class="action-btn" type="button" data-action="unfreeze" data-agent="${esc(agent.accountId)}" data-mode="A">Unfreeze</button>`;
    else if (action.includes("request-freeze")) actionCell = `<button class="action-btn danger" type="button" data-action="request-freeze" data-agent="${esc(agent.agentId ?? agent.accountId)}" data-mode="B">Request freeze</button>`;
    else if (action.includes("request-unfreeze")) actionCell = `<button class="action-btn" type="button" data-action="request-unfreeze" data-agent="${esc(agent.agentId ?? agent.accountId)}" data-mode="B">Request unfreeze</button>`;
    const last = agent.lastEvent;
    const lastEvent = last
      ? `<span class="mono">${esc(last.event)}</span> · ${last.refused ? `<span class="result refused">refused</span>` : `<span class="result ok">ok</span>`} · ${esc(last.blockHeight)}`
      : '<span class="dim">—</span>';
    return `<tr data-row="${esc(agent.accountId)}">
      <td class="keyhalt-cell-name"><a class="mono" href="#/agent/${encodeURIComponent(agent.accountId)}">${esc(agent.accountId)}</a>
        <span class="key-meta">${fmtInt(agent.operatorKeys)} operators · ${fmtInt(agent.fullAccessKeys)} full-access</span></td>
      <td class="keyhalt-cell-state">${stateCell}</td>
      <td class="keyhalt-cell-event result ${last?.refused ? "refused" : "ok"}">${lastEvent}</td>
      <td class="keyhalt-cell-action">${actionCell}</td>
    </tr>`;
  }).join("");

  body.innerHTML = `<div class="table-wrap"><table class="keyhalt-table"><thead><tr><th scope="col">Name</th><th scope="col">State</th><th scope="col">Last event</th><th scope="col" class="num">Action</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  body.setAttribute("aria-busy", "false");
  if (changedIds?.length) {
    for (const id of changedIds) {
      const row = body.querySelector(`[data-row="${CSS.escape(id)}"]`);
      if (row) setRowFlash(row);
    }
  }
}

async function loadKeyhalt(silent = false) {
  if (state.loadGuard.fleet) return;
  state.loadGuard.keyhalt = true;
  try {
    const data = await getJSON("/api/keyhalt");
    if (state.route.name !== "keyhalt") return;
    const previous = state.fleetFingerprint;
    const fingerprint = (data.agents ?? []).map((a) => `${a.accountId}:${a.state}`).join("|");
    state.keyhalt = data;
    state.fleetFingerprint = fingerprint;
    const changed = previous === null ? [] : diffFingerprint(previous, fingerprint);
    updateNet(data.headBlock);
    applyBanner();
    $("keyhalt-meta").textContent =
      data.status === "loading"
        ? "reading…"
        : `${fmtInt(data.totals?.agents)} agents · ${data.totals?.operatorKeys == null ? "—" : fmtInt(data.totals.operatorKeys)} operators · ${data.totals?.fullAccessKeys == null ? "—" : fmtInt(data.totals.fullAccessKeys)} full-access`;
    if (data.status === "loading") {
      renderKeyhalt(data);
      if (!silent) scheduleRetry(loadKeyhalt);
      return;
    }
    renderKeyhalt(data, changed);
    const hasAgents = Array.isArray(data.agents) && data.agents.length > 0;
    state.dataLoad = dataLoadReducer(state.dataLoad, {
      type: "fetch-ok",
      agents: data.agents?.length ?? 0,
      partial: data.status === "partial" || data.stale,
      block: data.pinnedBlock ?? data.lastGoodBlock ?? data.headBlock,
    });
    applyBanner();
  } catch (error) {
    if (state.route.name !== "keyhalt") return;
    state.dataLoad = dataLoadReducer(state.dataLoad, {
      type: "fetch-fail",
    });
    applyBanner();
    if (state.keyhalt !== null) {
      renderKeyhalt(state.fleet);
      return;
    }
    $("keyhalt-meta").textContent = "read failed";
    $("keyhalt-body").innerHTML = `<div class="state-flat"><h2>Could not read the fleet</h2><p>${esc(error.message ?? "RPC read failed.")}</p><div style="margin-top:10px"><button class="btn" type="button" data-retry="keyhalt">Retry</button></div></div>`;
    $("keyhalt-body").setAttribute("aria-busy", "false");
  } finally {
    state.loadGuard.keyhalt = false;
  }
}
function diffFingerprint(prev, next) {
  const left = new Map(prev.split("|").filter(Boolean).map((s) => { const [k, v] = s.split(":"); return [k, v]; }));
  return next.split("|").filter(Boolean).filter((s) => {
    const [k, v] = s.split(":");
    return left.has(k) && left.get(k) !== v;
  }).map((s) => s.split(":")[0]);
}

/* ---------- agent ---------- */

function renderAgent(data, changed) {
  const agent = data;
  const paused = agent.state.paused === true;
  const action = actionForAgent({ mode: agent.mode ?? "A", paused: agent.paused });
  const strip = $("agent-status");
  const freezeCmd = `node packages/cli/dist/index.js ${paused ? "unfreeze" : "freeze"} ${agent.accountId} --signer-key-file "$KEYHALT_ADMIN_KEY_FILE" --json`;
  const modeBFreeze = `node packages/cli/dist/index.js admin request freeze ${agent.accountId} --signer-key-file "$KEYHALT_OWNER_KEY_FILE" --json`;
  const modeBUnfreeze = `node packages/cli/dist/index.js admin request unfreeze ${agent.accountId} --signer-key-file "$KEYHALT_OWNER_KEY_FILE" --json`;
  const modeBConfirmFreeze = `node packages/cli/dist/index.js admin confirm ${agent.accountId} <request-id> --signer-key-file "$KEYHALT_OWNER_KEY_FILE" --json`;
  const modeBConfirmUnfreeze = modeBConfirmFreeze;
  const modeBStatus = `node packages/cli/dist/index.js admin status ${agent.accountId} --json`;

  const actionButton = (() => {
    if ((agent.mode ?? "A") === "A") {
      const label = paused ? "Unfreeze" : "Freeze";
      return `<button class="action-btn ${paused ? "" : "danger"}" type="button" data-command="${paused ? "unfreeze" : "freeze"}" data-mode="A" data-agent="${esc(agent.accountId)}">${label}</button>`;
    }
    const request = paused
      ? `<button class="action-btn" type="button" data-command="request-unfreeze" data-mode="B" data-agent="${esc(agent.accountId)}">Request unfreeze</button>`
      : `<button class="action-btn danger" type="button" data-command="request-freeze" data-mode="B" data-agent="${esc(agent.accountId)}">Request freeze</button>`;
    const confirm = `<button class="action-btn" type="button" data-command="confirm-freeze" data-mode="B" data-agent="${esc(agent.accountId)}">Confirm request</button>`;
    return `${request}${confirm}`;
  })();

  strip.className = `status-strip${paused ? " frozen" : ""}`;
  strip.innerHTML = `<span class="state-chip ${paused ? "frozen" : "active"}" id="state-chip">${paused ? "Frozen" : "Active"}</span>
    <span class="status-meta">state @ <span class="mono">${esc(agent.stateBlock)}</span></span>
    <span class="status-action">${actionButton}</span>`;
  if (changed) setChipFlash($("state-chip"));

  // operator keys
  $("keys-meta").textContent = `${fmtInt(agent.operators.filter(o => o.active).length)} active · ${fmtInt(agent.operators.length)} total`;
  const rows = agent.operators.length === 0
    ? '<tr><td colspan="3" class="dim">No operator keys.</td></tr>'
    : agent.operators.map((op) => `<tr>
        <td class="key-cell mono">${hashSpan(op.publicKey)}</td>
        <td><span class="tag mono">${esc(op.tag)}</span></td>
        <td class="dim">${esc(op.active ? "member" : "disabled")}</td>
      </tr>`).join("");
  const body = $("keys-body");
  body.innerHTML = rows;

  // roles as data
  const adminCount = agent.admin.publicKey || agent.admin.adminAccount ? 1 : 0;
  const adminLine = adminCount === 0
    ? "admin 0 · recovery none · full-access 0"
    : `admin ${adminCount} · recovery ${agent.admin.recoveryPublicKey ? 1 : 0} · full-access ${fmtInt(agent.fullAccessKeys)} · mode ${esc(agent.mode ?? "A")}`;
  $("roles").innerHTML = `<span><b>${fmtInt(agent.operators.filter(o => o.active).length)}</b>operators</span><span><b>${adminCount}</b>admin</span><span><b>${agent.admin.recoveryPublicKey ? 1 : 0}</b>recovery</span><span><b>${fmtInt(agent.fullAccessKeys)}</b>full-access</span><span><b>${fmtInt(agent.state.auditLength)}</b>audit entries</span>`;

  // admin rows (Mode B link as data)
  const adminRows = $("admin-rows");
  adminRows.innerHTML = `
    <dt>Admin</dt><dd>${hashSpan(agent.admin.adminAccount ?? agent.admin.publicKey ?? "unknown")}</dd>
    <dt>Recovery</dt><dd>${agent.admin.recoveryPublicKey ? hashSpan(agent.admin.recoveryPublicKey) : "<span class=\"none\">none</span>"}</dd>
    <dt>Mode</dt><dd class="mono">${esc(agent.mode ?? "A")}</dd>
    <dt>Mode B demo</dt><dd><a class="modeb-link" href="https://testnet.nearblocks.io/account/agent-b1.fleet-modeb-748d4372.testnet" rel="noopener noreferrer" target="_blank">agent-b1.fleet-modeb-748d4372.testnet →</a></dd>`;

  // audit one-liners
  const auditMeta = agent.state.auditLength;
  const list = $("audit-chain");
  const verification = agent.auditVerification;
  $("audit-meta").textContent = `${fmtInt(agent.state.auditLength)} · ${verification.ok ? "verified" : "not linked"}`;
  const sorted = [...agent.audit].sort((a, b) => b.seq - a.seq);
  list.innerHTML = sorted.map((entry) => `<li class="chain-entry">
     <button class="chain-row" type="button" aria-expanded="false" aria-controls="audit-detail-${entry.seq}">
       <span class="chain-seq mono">${fmtInt(entry.seq)}</span>
       <span class="chain-action">${esc(entry.action.replaceAll("_", " "))}</span>
       <span class="chain-block mono">${esc(entry.blockHeight)}</span>
       ${verification.ok ? '<span class="verified" aria-label="verified">✓</span>' : '<span class="not-verified" aria-label="not linked">✕</span>'}
     </button>
     <div class="chain-detail" id="audit-detail-${entry.seq}" hidden><div class="mono">${esc(entry.entryHash)}</div><div class="mono dim">prev ${esc(entry.prevHash)}</div></div>
   </li>`).join("");

  // events: latest 6 rows, one link to all
  const eventsBox = $("agent-events");
  const events = (agent.events ?? []).slice(0, 6);
  eventsBox.innerHTML = events.length === 0 ? '<p class="dim" style="margin:0">—</p>' : eventsTable(events, { compact: true });
}

function eventsTable(events, { compact = false } = {}) {
  const rows = events.map((event) => `<tr>
    <td class="mono">${esc(event.blockHeight)}</td>
    <td class="event-cell">${eventIcon(event)} ${esc(event.event ?? event.action)}<span class="agent-note">${esc(event.agentLabel ?? event.accountId ?? "")}</span></td>
    <td class="result ${event.refused ? "refused" : "ok"}">${event.refused ? "refused" : "ok"}</td>
    <td class="result mono">${fullTxn(event.txHash)}${event.entryHash && !event.txHash ? ` <span class="dim">${esc(shortHash(event.entryHash))}</span>` : ""}${eventVerifiedMark(event)}</td>
  </tr>`).join("");
  return `<div class="table-wrap"><table class="events"><thead><tr><th scope="col">Block</th><th scope="col">Event</th><th scope="col">Result</th><th scope="col">Tx</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}
function eventIcon(event) {
  if (event.action === "freeze") return icon("lock");
  if (event.action === "unfreeze") return icon("openlock");
  return "";
}
function eventVerifiedMark(event) {
  if (event.verified === true) return ' <span class="proof" aria-label="verified">✓</span>';
  return "";
}

async function loadAgent(account, silent = false) {
  if (!account || state.loadGuard.agent) return;
  state.loadGuard.agent = true;
  try {
    const data = await getJSON(`/api/agent?account=${encodeURIComponent(account)}`);
    if (state.route.name !== "agent" || state.route.account !== account) return;
    const previousPaused = state.agent?.state?.paused;
    state.agent = data;
    updateNet(data.headBlock);
    const agentState = agentStateRead(state.dataLoad, data.state.paused, data.stateBlock);
    state.dataLoad = dataLoadReducer(state.dataLoad, {
      type: "fetch-ok",
      agents: 1,
      partial: data.status === "partial" || data.stale,
      block: data.stateBlock ?? data.headBlock,
    });
    applyBanner();
    const changed = previousPaused !== undefined && previousPaused !== data.state.paused;
    $("agent-heading").textContent = data.accountId;
    renderAgent(data, changed);
  } catch (error) {
    if (state.route.name !== "agent" || state.route.account !== account) return;
    state.dataLoad = dataLoadReducer(state.dataLoad, { type: "fetch-fail" });
    applyBanner();
    if (state.agent !== null && state.agent.accountId === account) return;
    $("agent-status").innerHTML = `<span class="state-chip unknown">unknown</span><span class="status-meta">read failed</span>`;
  } finally {
    state.loadGuard.agent = false;
  }
}

/* ---------- timeline ---------- */

function renderTimeline(data) {
  const body = $("timeline-body");
  const meta = $("timeline-meta");
  const events = Array.isArray(data.events) ? data.events : [];
  const counts = data.counts ?? { events: 0, refused: 0, blocks: 0 };

  if (data.status === "loading" && events.length === 0) {
    body.innerHTML = `<div class="skeleton-table" aria-hidden="true"><span class="skeleton skeleton-wide"></span><span class="skeleton"></span><span class="skeleton skeleton-wide"></span><span class="skeleton"></span><span class="skeleton skeleton-wide"></span><span class="skeleton"></span></div>`;
    body.setAttribute("aria-busy", "true");
    return;
  }
  if (data.status === "empty" || events.length === 0) {
    meta.textContent = "0 events · 0 refused";
    body.innerHTML = `<div class="state-flat"><h2>No events</h2><p class="dim"></p></div>`;
    body.setAttribute("aria-busy", "false");
    return;
  }
  const showAll = state.timelineExpanded;
  const shown = showAll ? events : events.slice(0, 20);
  const toggle =
    !showAll && events.length > 20
      ? `<p class="timeline-more"><button class="btn" type="button" data-expand-timeline>Show all events (${fmtInt(events.length)})</button></p>`
      : showAll
        ? `<p class="timeline-more"><button class="btn" type="button" data-collapse-timeline>Show latest session</button></p>`
        : "";
  meta.textContent = `${fmtInt(counts.events)} events · ${fmtInt(counts.refused)} refused · ${fmtInt(counts.blocks)} blocks`;
  body.innerHTML = `${eventsTable(shown)}${toggle}`;
  body.setAttribute("aria-busy", "false");
}

async function loadTimeline(silent = false) {
  if (state.loadGuard.timeline) return;
  state.loadGuard.timeline = true;
  try {
    const data = await getJSON("/api/timeline?limit=200");
    if (state.route.name !== "timeline") return;
    state.timeline = data;
    updateNet(data.headBlock);
    state.dataLoad = dataLoadReducer(state.dataLoad, {
      type: "fetch-ok",
      agents: data.status === "empty" ? 0 : 1,
      partial: data.status === "partial" || data.stale,
      block: data.headBlock,
    });
    applyBanner();
    renderTimeline(data);
  } catch (error) {
    if (state.route.name !== "timeline") return;
    state.dataLoad = dataLoadReducer(state.dataLoad, { type: "fetch-fail" });
    applyBanner();
    if (state.timeline !== null) {
      renderTimeline(state.timeline);
      return;
    }
    $("timeline-body").innerHTML = `<div class="state-flat"><h2>Could not read the timeline</h2><p>${esc(error.code ?? "KEYHALT_ERR")}: retry below.</p><div style="margin-top:10px"><button class="btn" type="button" data-retry="timeline">Retry</button></div></div>`;
    $("timeline-body").setAttribute("aria-busy", "false");
  } finally {
    state.loadGuard.timeline = false;
  }
}

/* ---------- command sheet ---------- */

function currentCommandFor(action, mode, agent) {
  if (mode === "B") {
    if (action === "request-freeze") return { id: "request-freeze", text: () => `node packages/cli/dist/index.js admin request freeze ${agent} --signer-key-file "$KEYHALT_OWNER_KEY_FILE" --json` };
    if (action === "request-unfreeze") return { id: "request-unfreeze", text: () => `node packages/cli/dist/index.js admin request unfreeze ${agent} --signer-key-file "$KEYHALT_OWNER_KEY_FILE" --json` };
    if (action === "confirm-freeze" || action === "confirm-freeze-both" || action === "confirm") return { id: "confirm", text: () => `node packages/cli/dist/index.js admin confirm ${agent} <request-id> --signer-key-file "$KEYHALT_OWNER_KEY_FILE" --json` };
    return { id: "status", text: () => `node packages/cli/dist/index.js admin status ${agent} --json` };
  }
  const method = action === "unfreeze" ? "unfreeze" : "freeze";
  return { id: method, text: () => `node packages/cli/dist/index.js ${method} ${agent} --signer-key-file "$KEYHALT_ADMIN_KEY_FILE" --json` };
}
function renderSheet() {
  const sheet = $("command-sheet");
  if (state.sheet.status === "closed") {
    sheet.hidden = true;
    return;
  }
  sheet.hidden = false;
  $("copy-status").hidden = state.sheet.status !== "copied" && state.sheet.status !== "copy-failed";
  const statusEl = $("copy-status");
  if (state.sheet.status === "copied") { statusEl.textContent = "Copied"; statusEl.className = "copied"; }
  else if (state.sheet.status === "copy-failed") { statusEl.textContent = "Copy failed: select the command"; statusEl.className = "copy-failed"; }
  else { statusEl.textContent = ""; statusEl.className = "copied"; }
}
function openSheetFor(action, mode, agent) {
  const cmd = currentCommandFor(action, mode, agent);
  state.sheet = sheetReducer(state.sheet, { type: "open", commandId: cmd.id });
  $("command-text").textContent = cmd.text();
  renderSheet();
}

async function copyCurrentCommand() {
  const ok = await copyText($("command-text").textContent ?? "");
  state.sheet = sheetReducer(state.sheet, { type: ok ? "copy-success" : "copy-failed" });
  renderSheet();
  setTimeout(() => {
    state.sheet = { ...state.sheet, status: "open" };
    renderSheet();
  }, 2600);
}
async function copyText(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
    const area = document.createElement("textarea");
    area.className = "copy-fallback";
    area.value = text;
    area.setAttribute("readonly", "");
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    area.remove();
    return ok;
  } catch {
    return false;
  }
}

/* ---------- routing ---------- */

function parseRoute() {
  const raw = location.hash.replace(/^#\/?/, "");
  if (raw.startsWith("agent/")) return { name: "agent", account: decodeURIComponent(raw.slice("agent/".length)) };
  if (raw.startsWith("timeline")) return { name: "timeline", account: null };
  return { name: "keyhalt", account: null };
}
function route() {
  state.route = parseRoute();
  showView();
  updateNet(state.fleet?.headBlock ?? state.lastBlock);
  if (state.route.name === "keyhalt") loadKeyhalt();
  else if (state.route.name === "agent") {
    const account = state.route.account;
    if (!account) {
      $("agent-status").innerHTML = '<span class="state-chip unknown">unknown</span><span class="status-meta">no agent</span>';
      return;
    }
    loadAgent(account);
  } else {
    loadTimeline();
  }
}
function showView() {
  const views = Object.fromEntries(["keyhalt", "agent", "timeline"].map((name) => [name, $(viewIdForRoute(name))]));
  for (const [name, element] of Object.entries(views)) element.hidden = name !== state.route.name;
  $("brand-mark").textContent = BRAND_HTML;
  $("brand-home").setAttribute("aria-label", BRAND_LABEL);
  document.title = state.route.name === "keyhalt" ? `${BRAND} · Keyhalt` : state.route.name === "agent" ? `${BRAND} · Agent` : `${BRAND} · Timeline`;
  document.querySelectorAll(".nav a[data-nav]").forEach((link) => {
    const active = (state.route.name === "agent" ? "keyhalt" : state.route.name) === link.dataset.nav;
    if (active) link.setAttribute("aria-current", "page"); else link.removeAttribute("aria-current");
  });
}

/* ---------- sse & polling ---------- */

let streamSrc = null;
function scheduleRouteRefresh(kind) {
  const key = `refresh:${kind}`;
  if (state.timers.has(key)) return;
  state.timers.set(key, setTimeout(() => {
    state.timers.delete(key);
    if (kind === "keyhalt" && state.route.name === "keyhalt") loadKeyhalt(true);
    else if (kind === "agent" && state.route.name === "agent") loadAgent(state.route.account, true);
    else if (kind === "timeline" && state.route.name === "timeline") loadTimeline(true);
  }, 1400));
}
function scheduleRetry(fn) {
  const key = `retry:${fn.name || "fn"}`;
  if (state.timers.has(key)) return;
  state.timers.set(key, setTimeout(() => { state.timers.delete(key); fn(); }, 2000));
}
function connectStream() {
  if (typeof EventSource === "undefined") return;
  if (streamSrc) { streamSrc.close(); streamSrc = null; }
  streamSrc = new EventSource("/api/stream");
  streamSrc.addEventListener("open", () => { state.sse = sseReducer(state.sse, { type: "open" }, Date.now()); applyBanner(); });
  streamSrc.addEventListener("block", (message) => {
    let data = {};
    try { data = JSON.parse(message.data); } catch { return; }
    state.sse = sseReducer(state.sse, { type: "message" }, Date.now());
    updateNet(data.height);
    const kind = state.route.name === "keyhalt" ? "keyhalt" : state.route.name === "agent" ? "agent" : "timeline";
    scheduleRouteRefresh(kind);
  });
  streamSrc.addEventListener("snapshot", () => { state.sse = sseReducer(state.sse, { type: "message" }, Date.now()); });
  streamSrc.addEventListener("timeline", () => { state.sse = sseReducer(state.sse, { type: "message" }, Date.now()); scheduleRouteRefresh(state.route.name === "agent" ? "agent" : "timeline"); });
  streamSrc.addEventListener("error", () => { state.sse = sseReducer(state.sse, { type: "error" }, Date.now()); applyBanner(); });
}

/* ---------- events ---------- */

document.addEventListener("click", (event) => {
  const t = event.target;
  if (!(t instanceof Element)) return;
  const retry = t.closest("[data-retry]");
  if (retry) { if (retry.dataset.retry === "keyhalt") loadKeyhalt(); else if (retry.dataset.retry === "agent") loadAgent(state.route.account); else loadTimeline(); return; }
  const copyEl = t.closest("[data-copy]");
  if (copyEl) { copyText(copyEl.getAttribute("data-copy") ?? ""); return; }
  const expandRow = t.closest(".chain-row");
  if (expandRow) {
    const detail = expandRow.parentElement?.querySelector(".chain-detail");
    if (detail) { detail.hidden = !detail.hidden; expandRow.setAttribute("aria-expanded", String(!detail.hidden)); }
    return;
  }
  const actionBtn = t.closest("[data-action]");
  if (actionBtn) { openSheetFor(actionBtn.dataset.action, actionBtn.dataset.mode, actionBtn.dataset.agent); return; }
  const commandBtn = t.closest("[data-command]");
  if (commandBtn) { openSheetFor(commandBtn.dataset.command, commandBtn.dataset.mode ?? "A", commandBtn.dataset.agent); return; }
  const expand = t.closest("[data-expand-timeline]");
  if (expand) { state.timelineExpanded = true; renderTimeline(state.timeline); return; }
  const collapse = t.closest("[data-collapse-timeline]");
  if (collapse) { state.timelineExpanded = false; renderTimeline(state.timeline); return; }
  if (t.id === "copy-command" || t.closest("#copy-command")) { copyCurrentCommand(); }
});

$("copy-command").addEventListener("click", copyCurrentCommand);
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && state.sheet.status !== "closed") {
    state.sheet = sheetReducer(state.sheet, { type: "close" });
    renderSheet();
  }
});
window.addEventListener("hashchange", route);
window.addEventListener("resize", () => viewportOf(window.innerWidth));

/* ---------- boot ---------- */

state.sse = sseReducer(state.sse, { type: "open" }, Date.now());
route();
connectStream();
loadClaimsOnce();
