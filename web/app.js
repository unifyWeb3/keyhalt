/**
 * FLEET console frontend. Reads only the local read-only API.
 *
 * The browser never talks to an RPC, never sees a key, and never calls a write
 * route. Every number rendered comes from CLAIMS.md through the API or from a
 * live chain read pinned by the server.
 */

const $ = (id) => document.getElementById(id);

const ICONS = {
  lock: '<rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  unlock:
    '<rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  arrowRight: '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
  arrowLeft: '<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>',
  warning:
    '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  refresh:
    '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
  key: '<circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6"/><path d="m15.5 7.5 3 3L22 7l-3-3"/>',
  block:
    '<path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 13 9 5 9-5"/><path d="m3 18 9 5 9-5"/>',
  shield:
    '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/>',
  copy: '<rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
  clock:
    '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  terminal:
    '<polyline points="4 17 10 11 4 5"/><line x1="12" x2="20" y1="19" y2="19"/>',
  search:
    '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
};

function icon(name, extraClass = "") {
  const body = ICONS[name] ?? ICONS.block;
  return `<svg class="ic ${extraClass}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
}

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => {
    switch (char) {
      case "&": return "&amp;";
      case "<": return "&lt;";
      case ">": return "&gt;";
      case '"': return "&quot;";
      default: return "&#39;";
    }
  });
}

function fmtInt(value) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return "—";
  return new Intl.NumberFormat("en-US").format(Number(value));
}

function fmtBlock(value) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return "—";
  return String(value);
}

function shortHash(hash, head = 10, tail = 6) {
  if (typeof hash !== "string" || hash.length === 0) return "—";
  if (hash.length <= head + tail + 1) return hash;
  return `${hash.slice(0, head)}…${hash.slice(-tail)}`;
}

function txUrl(hash) {
  return `https://testnet.nearblocks.io/txns/${encodeURIComponent(hash)}`;
}

function actionLabel(action) {
  switch (action) {
    case "init": return "init";
    case "freeze": return "freeze";
    case "unfreeze": return "unfreeze";
    case "execute": return "operator execute";
    case "grant_operator": return "grant operator";
    case "revoke_operator": return "revoke operator";
    case "rotate_operator": return "rotate operator";
    case "propose_admin": return "propose admin";
    case "cancel_admin": return "cancel admin";
    case "recover_confirmed": return "recover admin";
    case "accept_admin": return "accept admin";
    case "revoke_tag": return "revoke tag";
    default: return String(action ?? "event").replaceAll("_", " ");
  }
}

const state = {
  fleet: null,
  agent: null,
  timeline: null,
  route: { name: "fleet", account: null },
  lastBlock: null,
  lastLiveAt: null,
  lastDataAt: null,
  // True when a data fetch failed after we had a good one, independent of
  // the SSE block stream. The stream can keep ticking while data is down.
  dataStale: false,
  connection: "connecting",
  reconnectSince: null,
  timers: { fleet: null, agent: null, timeline: null, retry: null },
  loading: { fleet: false, agent: false, timeline: false },
  timelineLimit: 20,
  sheetCommand: null,
};

/* ---------- API ---------- */

async function getJSON(path) {
  const response = await fetch(path, {
    headers: { accept: "application/json" },
    cache: "no-store",
  });
  let body = {};
  try {
    body = await response.json();
  } catch {
    body = {};
  }
  if (!response.ok) {
    const error = new Error(body.message ?? `HTTP ${response.status}`);
    error.code = body.code ?? "HTTP_ERROR";
    error.status = response.status;
    throw error;
  }
  return body;
}

/* ---------- routing ---------- */

function parseRoute() {
  const raw = location.hash.replace(/^#\/?/, "");
  if (raw.startsWith("agent/")) {
    return { name: "agent", account: decodeURIComponent(raw.slice("agent/".length)) };
  }
  if (raw.startsWith("agent=")) {
    return { name: "agent", account: decodeURIComponent(raw.slice("agent=".length)) };
  }
  if (raw === "timeline") return { name: "timeline", account: null };
  return { name: "fleet", account: null };
}

function updateNav() {
  const navName = state.route.name === "agent" ? "fleet" : state.route.name;
  document.querySelectorAll(".nav a[data-nav]").forEach((link) => {
    if (link.dataset.nav === navName) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  });
}

function showView() {
  const views = { fleet: $("view-fleet"), agent: $("view-agent"), timeline: $("view-timeline") };
  for (const [name, element] of Object.entries(views)) {
    element.hidden = name !== state.route.name;
  }
  document.title =
    state.route.name === "agent"
      ? "FLEET · Agent"
      : state.route.name === "timeline"
        ? "FLEET · Timeline"
        : "FLEET · Fleet";
}

function route() {
  state.route = parseRoute();
  state.timelineLimit = 20;
  closeSheet();
  showView();
  updateNav();
  if (state.timers.retry !== null) {
    clearTimeout(state.timers.retry);
    state.timers.retry = null;
  }
  if (state.route.name !== "fleet") loadSummary();
  if (state.route.name === "fleet") {
    loadFleet();
  } else if (state.route.name === "agent") {
    const account = state.route.account;
    $("agent-heading").textContent = account ?? "Agent";
    if (!account) {
      $("agent-meta").textContent = "No agent selected";
      $("agent-body").innerHTML = stateBox(
        "No agent selected",
        '<p>Open an agent from the <a href="#/fleet">Fleet screen</a>.</p>',
        { icon: "search" },
      );
      $("agent-body").setAttribute("aria-busy", "false");
    } else {
      $("agent-meta").textContent = "Reading finalized block…";
      $("agent-body").innerHTML = loadingBody("Reading this agent at the same finalized block.");
      $("agent-body").setAttribute("aria-busy", "true");
      loadAgent(account);
    }
  } else {
    loadTimeline();
  }
  updateTicker(state.fleet?.headBlock ?? state.lastBlock);
  updateBanner();
}

/* ---------- ticker / banner / footer ---------- */

function updateTicker(block) {
  if (Number.isFinite(Number(block))) {
    const value = Number(block);
    if (state.lastBlock === null || value >= state.lastBlock) {
      state.lastBlock = value;
      $("block").textContent = fmtBlock(value);
    }
  }
  if (state.lastBlock !== null) {
    $("block").title = `Finalized testnet block ${fmtBlock(state.lastBlock)} from the live RPC feed`;
  }
}

function updateBanner() {
  const banner = $("banner");
  const data = state.fleet;
  let kind = null;
  let title = "";
  let detail = "";

  if (data !== null && data.stale) {
    kind = "danger";
    title = "Reads are failing.";
    detail = `Showing the last good read at block ${fmtBlock(data.lastGoodBlock)}. The server is retrying with paced RPC failover.`;
  } else if (data !== null && data.status === "partial") {
    kind = "warn";
    title = "Partial snapshot.";
    detail = `Last good read at block ${fmtBlock(data.lastGoodBlock)}. One or more agents are behind the finalized head.`;
  } else if (state.dataStale) {
    kind = "warn";
    title = "Live updates stopped.";
    detail = `The last block on screen is ${fmtBlock(state.lastBlock)}. Showing the last good read; reconnecting.`;
  } else if (
    state.connection === "reconnecting" &&
    state.reconnectSince !== null &&
    Date.now() - state.reconnectSince > 4_000
  ) {
    kind = "warn";
    title = "Reconnecting to the block stream.";
    detail = "The last snapshot stays on screen while the stream reconnects.";
  }

  if (kind === null) {
    banner.hidden = true;
    banner.innerHTML = "";
    $("net").dataset.stale = "false";
    return;
  }
  banner.hidden = false;
  banner.className = `banner${kind === "danger" ? " danger" : ""}`;
  banner.innerHTML = `${icon("warning")}<div><strong>${esc(title)}</strong> <span class="banner-detail">${esc(detail)}</span></div>`;
  $("net").dataset.stale = data?.stale ? "true" : "false";
}

async function loadSummary() {
  if (state.fleet !== null) {
    updateFooter(state.fleet);
    updateBanner();
    return;
  }
  try {
    const data = await getJSON("/api/fleet");
    state.fleet = data;
    updateTicker(data.headBlock);
    updateFooter(data);
    updateBanner();
  } catch {
    // The current screen reports its own read failure; the footer stays quiet.
  }
}

function updateFooter(data) {
  const claims = data?.claims;
  $("claims-link").textContent =
    claims && claims.total > 0 ? `${fmtInt(claims.verified)}/${fmtInt(claims.total)}` : "—";
  const snapshot = data?.pinnedBlock ?? data?.lastGoodBlock ?? data?.headBlock;
  $("foot-note").textContent =
    snapshot === null || snapshot === undefined
      ? "Read-only · no key stored"
      : `snapshot @ block ${fmtBlock(snapshot)} · read-only`;
  if (data?.modeB?.url) $("modeb-link").href = data.modeB.url;
}

function markLive() {
  state.lastLiveAt = Date.now();
}

function noteData(ok) {
  if (ok) {
    state.lastDataAt = Date.now();
    state.dataStale = false;
  } else {
    state.dataStale = true;
  }
  updateBanner();
}

function scheduleRefresh(kind) {
  if (state.timers[kind] !== null) return;
  state.timers[kind] = setTimeout(() => {
    state.timers[kind] = null;
    if (state.route.name !== kind) return;
    if (kind === "fleet") loadFleet(true);
    else if (kind === "agent") loadAgent(state.route.account, true);
    else loadTimeline(true);
  }, 1_500);
}

function scheduleRetry(fn) {
  if (state.timers.retry !== null) return;
  state.timers.retry = setTimeout(() => {
    state.timers.retry = null;
    fn();
  }, 2_000);
}

/* ---------- shared render pieces ---------- */

function loadingBody(note = "Waiting for the first pinned testnet read.") {
  return `<div class="skeleton-table" aria-hidden="true">
    <span class="skeleton skeleton-wide"></span><span class="skeleton"></span>
    <span class="skeleton skeleton-wide"></span><span class="skeleton"></span>
    <span class="skeleton skeleton-wide"></span><span class="skeleton"></span>
  </div><p class="loading-note">${esc(note)}</p>`;
}

function stateCell(value) {
  if (value === "frozen") {
    return '<span class="state frozen"><span class="dot"></span>Frozen</span>';
  }
  if (value === "active") {
    return '<span class="state active"><span class="dot"></span>Active</span>';
  }
  return '<span class="state unknown"><span class="dot"></span>Unknown</span>';
}

function stateBox(title, body, options = {}) {
  return `<div class="state-box${options.error ? " error" : ""}"${options.alert ? ' role="alert"' : ""}>
    <span class="box-icon">${icon(options.icon ?? "warning")}</span>
    <div>
      <h2>${esc(title)}</h2>
      ${body}
      ${options.retry ? `<button class="btn" type="button" data-retry="${esc(options.retry)}">${icon("refresh")} Retry read</button>` : ""}
    </div>
  </div>`;
}

function resultCell(event) {
  if (event.refused) {
    const text = String(event.resultText ?? "").replace(/^refused\s*·\s*/i, "");
    return `<span class="result refused">${icon("lock")}refused${text ? ` · ${esc(text)}` : ""}</span>`;
  }
  return `<span class="result ${event.result === "ok" ? "ok" : ""}">${esc(event.resultText ?? "ok")}</span>`;
}

function txCell(event) {
  if (event.txHash) {
    return `<div class="tx-line"><a href="${esc(txUrl(event.txHash))}" title="${esc(event.txHash)}" rel="noopener noreferrer" target="_blank">${esc(shortHash(event.txHash))}</a>${icon("check")}</div>`;
  }
  if (event.entryHash) {
    return `<span class="audit-ref mono" title="Audit entry ${esc(event.entryHash)}">${esc(shortHash(event.entryHash, 12, 6))}</span>`;
  }
  return '<span class="dim">—</span>';
}

function eventIcon(event) {
  if (event.action === "freeze") return icon("lock");
  if (event.action === "unfreeze") return icon("unlock");
  if (event.refused) return icon("lock");
  return "";
}

function eventRows(events) {
  return events.map((event) => `<tr>
    <td class="block" data-label="Block"><span class="mono">${esc(fmtBlock(event.blockHeight))}</span></td>
    <td class="event" data-label="Event">${eventIcon(event)}${esc(event.event)}<span class="agent-note">${esc(event.agentLabel)}</span></td>
    <td class="result-cell" data-label="Result">${resultCell(event)}</td>
    <td class="tx-cell" data-label="Tx">${txCell(event)}</td>
  </tr>`).join("");
}

function eventTable(events) {
  return `<div class="table-wrap">
    <table class="timeline-table">
      <caption class="sr-only">Recorded fleet events, newest first</caption>
      <thead><tr><th scope="col">Block</th><th scope="col">Event</th><th scope="col">Result</th><th scope="col">Tx</th></tr></thead>
      <tbody>${eventRows(events)}</tbody>
    </table>
  </div>`;
}

/* ---------- fleet ---------- */

async function loadFleet(silent = false) {
  if (state.loading.fleet) return;
  state.loading.fleet = true;
  try {
    const data = await getJSON("/api/fleet");
    if (state.route.name !== "fleet") return;
    state.fleet = data;
    updateTicker(data.headBlock);
    updateFooter(data);
    markLive();
    noteData(true);
    renderFleet(data, silent);
  } catch (error) {
    if (state.route.name !== "fleet") return;
    if (state.fleet !== null) {
      noteData(false);
    } else {
      renderFleetError(error);
    }
  } finally {
    state.loading.fleet = false;
  }
}

function renderFleet(data, silent) {
  const body = $("fleet-body");
  const meta = $("fleet-meta");
  const agents = Array.isArray(data.agents) ? data.agents : [];

  if (data.status === "loading") {
    meta.textContent = "Reading finalized block…";
    if (!silent || agents.length === 0 || agents.every((agent) => agent.state === "unknown")) {
      body.innerHTML = loadingBody("Waiting for the first pinned testnet read.");
    }
    body.setAttribute("aria-busy", "true");
    scheduleRetry(() => loadFleet());
    return;
  }

  if (data.status === "empty" || agents.length === 0) {
    meta.textContent = `${fmtInt(data.totals?.agents ?? 0)} agents · ${fmtInt(data.totals?.operatorKeys ?? 0)} operator keys · ${fmtInt(data.totals?.fullAccessKeys ?? 0)} full-access keys`;
    body.innerHTML = stateBox(
      "No agents configured",
      `<p>This console is running without a fleet. Set <code>FLEET_CONSOLE_ACCOUNTS</code> to a comma-separated list of testnet controllers and restart it.</p>
       <p>For the canonical run: <code>make console</code>.</p>`,
      { icon: "key" },
    );
    body.setAttribute("aria-busy", "false");
    return;
  }

  meta.textContent = `${fmtInt(data.totals?.agents)} agents · ${data.totals?.operatorKeys === null ? "—" : fmtInt(data.totals.operatorKeys)} operator keys · ${data.totals?.fullAccessKeys === null ? "—" : fmtInt(data.totals.fullAccessKeys)} full-access keys`;

  const rows = agents.map((agent) => {
    const tags = Object.entries(agent.operatorTags ?? {})
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([tag, count]) => `${fmtInt(count)} ${tag}`)
      .join(" · ");
    const operatorLine = `${agent.operatorKeys === null ? "—" : fmtInt(agent.operatorKeys)} operator keys${tags ? ` · ${tags}` : ""}`;
    const staleLine = agent.stale
      ? `<span class="key-meta">read behind at block ${esc(fmtBlock(agent.blockHeight))}</span>`
      : "";
    const errorLine = agent.error
      ? `<span class="key-meta">read error · showing last good</span>`
      : "";
    const last = agent.lastEvent;
    const lastEvent = last === null
      ? '<span class="dim">No recorded event</span>'
      : `<span class="dim">${esc(actionLabel(last.action))}</span> <span class="mono block">${esc(fmtBlock(last.blockHeight))}</span> <span class="dim">·</span> ${resultCell(last)} ${txCell(last)}`;
    return `<tr>
      <td class="id" data-label="Name"><a href="#/agent/${encodeURIComponent(agent.accountId)}">${esc(agent.accountId)}</a><span class="key-meta mono">${esc(operatorLine)}</span>${staleLine}${errorLine}</td>
      <td class="state-cell" data-label="State">${stateCell(agent.state)}</td>
      <td class="num full" data-label="Full-access keys">${agent.fullAccessKeys === null ? "—" : fmtInt(agent.fullAccessKeys)}</td>
      <td class="last" data-label="Last event">${lastEvent}</td>
    </tr>`;
  }).join("");

  body.innerHTML = `<div class="table-wrap">
    <table class="fleet-table">
      <caption class="sr-only">Fleet agents read at finalized block ${esc(fmtBlock(data.pinnedBlock))}</caption>
      <thead><tr><th scope="col">Name</th><th scope="col">State</th><th scope="col" class="num">Full-access keys</th><th scope="col">Last event</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;
  body.setAttribute("aria-busy", "false");
}

function renderFleetError(error) {
  const lastGood = state.fleet?.lastGoodBlock;
  $("fleet-meta").textContent = "Read failed";
  $("fleet-body").innerHTML = stateBox(
    "Could not read the fleet",
    `<p>${esc(error.message ?? "The console API did not return a snapshot.")}</p>
     ${lastGood ? `<p class="last-good">Last good block <span class="mono">${esc(fmtBlock(lastGood))}</span>.</p>` : '<p>The console never falls back to invented data. Retry when the RPC is reachable.</p>'}`,
    { error: true, alert: true, retry: "fleet", icon: "warning" },
  );
  $("fleet-body").setAttribute("aria-busy", "false");
}

/* ---------- agent ---------- */

async function loadAgent(account, silent = false) {
  if (!account || state.loading.agent) return;
  state.loading.agent = true;
  try {
    const data = await getJSON(`/api/agent?account=${encodeURIComponent(account)}`);
    if (state.route.name !== "agent" || state.route.account !== account) return;
    state.agent = data;
    updateTicker(data.headBlock);
    updateFooter(state.fleet);
    markLive();
    noteData(true);
    renderAgent(data, silent);
  } catch (error) {
    if (state.route.name !== "agent" || state.route.account !== account) return;
    if (error.status === 503) {
      if (state.agent !== null && state.agent.accountId === account) {
        noteData(false);
        return;
      }
      $("agent-meta").textContent = "Reading finalized block…";
      $("agent-body").innerHTML = loadingBody("Waiting for this agent's first pinned read.");
      $("agent-body").setAttribute("aria-busy", "true");
      scheduleRetry(() => loadAgent(account));
      return;
    }
    if (state.agent !== null && state.agent.accountId === account) {
      noteData(false);
      return;
    }
    $("agent-meta").textContent = "Read failed";
    $("agent-body").innerHTML = stateBox(
      "Could not read this agent",
      `<p>${esc(error.message ?? "The console API did not return an agent snapshot.")}</p>
       <p>The agent screen only renders chain reads at a finalized block.</p>`,
      { error: true, alert: true, retry: "agent", icon: "warning" },
    );
    $("agent-body").setAttribute("aria-busy", "false");
  } finally {
    state.loading.agent = false;
  }
}

function renderAgent(data, silent) {
  const body = $("agent-body");
  const meta = $("agent-meta");
  $("agent-heading").textContent = data.accountId;
  meta.textContent = `Mode A · ${fmtInt(data.operators.length)} operator keys · ${fmtInt(data.state.auditLength)} audit entries`;

  const paused = data.state.paused === true;
  const frozenEvent = [...data.audit]
    .filter((entry) => entry.action === "freeze")
    .sort((left, right) => right.blockHeight - left.blockHeight)[0];
  const statusDetail = paused && frozenEvent
    ? `Frozen at block ${esc(fmtBlock(frozenEvent.blockHeight))}`
    : paused
      ? "Controller paused"
      : "Controller accepts operator calls";

  const operatorRows = data.operators.length === 0
    ? '<tr><td colspan="3" class="dim" data-label="">No operator keys are active.</td></tr>'
    : data.operators.map((operator) => `<tr>
        <td class="key mono" data-label="Key">${esc(operator.publicKey)}</td>
        <td class="scope" data-label="Scope"><span class="tag mono">${esc(operator.tag)}</span></td>
        <td class="active" data-label="Active">${operator.active ? "Yes" : "No"}</td>
      </tr>`).join("");

  const nativeKeys = Array.isArray(data.nativeKeys) ? data.nativeKeys : null;
  const functionCallKeys =
    nativeKeys === null
      ? null
      : nativeKeys.filter((key) => key.permission === "FunctionCall").length;
  const fullAccess = data.fullAccessKeys;

  const audit = [...data.audit].sort((left, right) => right.seq - left.seq);
  const verification = data.auditVerification;
  const verificationText = verification.ok
    ? data.onChainVerified === true
      ? "verified on chain and in the SDK"
      : data.onChainVerified === false
        ? "on-chain verifier returned false"
        : "prev-hash linked; on-chain verification pending"
    : `chain check failed${verification.error ? `: ${verification.error}` : ""}`;
  const chainMeta = audit.length === 0
    ? "No audit entries read yet."
    : `head ${esc(shortHash(verification.head, 12, 6))} · ${esc(verificationText)}${audit.length < data.state.auditLength ? ` · showing ${fmtInt(audit.length)} of ${fmtInt(data.state.auditLength)}` : ""}`;

  const chain = audit.map((entry) => `<li class="chain-entry">
    <span class="chain-rail" aria-hidden="true"><span class="chain-node"></span></span>
    <div>
      <p class="chain-line"><span class="seq mono">seq ${fmtInt(entry.seq)}</span><span class="action">${esc(actionLabel(entry.action))}</span><span class="block mono">· block ${esc(fmtBlock(entry.blockHeight))}</span></p>
      <p class="chain-hash mono">${esc(shortHash(entry.entryHash, 12, 6))}${verification.ok ? `<span class="verified">${icon("check")}verified</span>` : `<span class="verified bad">${icon("warning")}not linked</span>`}</p>
      <p class="chain-prev mono">prev ${esc(shortHash(entry.prevHash, 12, 6))}</p>
    </div>
  </li>`).join("");

  const recent = data.events.slice(0, 6);
  const recentSection = recent.length === 0
    ? '<p class="dim">No recorded events for this agent yet.</p>'
    : eventTable(recent);

  body.innerHTML = `
    <div class="agent-status${paused ? " frozen" : ""}">
      ${paused ? icon("lock") : icon("unlock")}
      <span class="state-chip ${paused ? "frozen" : "active"}">${paused ? "Frozen" : "Active"}</span>
      <span>${statusDetail}</span>
      <span class="status-detail mono">state @ block ${esc(fmtBlock(data.stateBlock))}</span>
    </div>

    <div class="group">
      <div class="group-head"><h3>Operator keys</h3><span class="group-meta mono">${fmtInt(data.operators.filter((operator) => operator.active).length)} active · ${fmtInt(data.state.operators.length)} total</span></div>
      <div class="table-wrap">
        <table class="keys-table">
          <caption class="sr-only">Operator keys for ${esc(data.accountId)}</caption>
          <thead><tr><th scope="col">Key</th><th scope="col">Scope</th><th scope="col">Active</th></tr></thead>
          <tbody>${operatorRows}</tbody>
        </table>
      </div>
      <p class="native-summary">${functionCallKeys === null ? "—" : fmtInt(functionCallKeys)} FunctionCall keys <span class="dim">·</span> ${fullAccess === null ? "—" : fmtInt(fullAccess)} full-access keys</p>
    </div>

    <div class="group">
      <h3>Admin</h3>
      <div class="admin-row"><span class="admin-label">Admin key</span><code class="key-block mono">${esc(data.admin.publicKey ?? "not set")}</code></div>
      <div class="admin-row"><span class="admin-label">Recovery key</span><code class="key-block mono">${esc(data.admin.recoveryPublicKey ?? "not set")}</code></div>
      ${data.admin.pendingPublicKey ? `<div class="admin-row"><span class="admin-label">Pending admin key</span><code class="key-block mono">${esc(data.admin.pendingPublicKey)}</code><p class="dim">origin: ${esc(data.admin.pendingOrigin ?? "unknown")}</p></div>` : ""}
      <p class="admin dim">Mode A controller · single admin key plus recovery key · ${fullAccess === null ? "—" : fmtInt(fullAccess)} full-access keys</p>
    </div>

    <div class="group">
      <h3>Recent audit entries</h3>
      <p class="chain-meta mono">${chainMeta}</p>
      ${audit.length === 0 ? '<p class="dim">No audit entries read yet.</p>' : `<ol class="chain">${chain}</ol>`}
    </div>

    <div class="group">
      <div class="group-head"><h3>Recent events</h3><a class="group-meta" href="#/timeline">View timeline →</a></div>
      ${recentSection}
    </div>

    <div class="actions">
      <button class="btn btn-primary" type="button" data-command="${paused ? "unfreeze" : "freeze"}" aria-controls="command-sheet" aria-expanded="false">${paused ? "Show unfreeze command" : "Show freeze command"}</button>
      <button class="btn" type="button" data-command="inventory" aria-controls="command-sheet" aria-expanded="false">Show inventory command</button>
      <a class="btn" href="${esc(data.exportUrl)}">Export audit chain</a>
    </div>
  `;
  body.setAttribute("aria-busy", "false");
  if (state.sheetCommand !== null) {
    document.querySelectorAll("[data-command]").forEach((button) => {
      button.setAttribute("aria-expanded", String(button.dataset.command === state.sheetCommand));
    });
  }
}

/* ---------- timeline ---------- */

async function loadTimeline(silent = false) {
  if (state.loading.timeline) return;
  state.loading.timeline = true;
  try {
    const data = await getJSON("/api/timeline?limit=200");
    if (state.route.name !== "timeline") return;
    state.timeline = data;
    updateTicker(data.headBlock);
    updateFooter(state.fleet);
    markLive();
    noteData(true);
    renderTimeline(data, silent);
  } catch (error) {
    if (state.route.name !== "timeline") return;
    if (state.timeline !== null) {
      noteData(false);
      return;
    }
    $("timeline-meta").textContent = "Read failed";
    $("timeline-body").innerHTML = stateBox(
      "Could not read the timeline",
      `<p>${esc(error.message ?? "The console API did not return events.")}</p>`,
      { error: true, alert: true, retry: "timeline", icon: "warning" },
    );
    $("timeline-body").setAttribute("aria-busy", "false");
  } finally {
    state.loading.timeline = false;
  }
}

function renderTimeline(data, silent) {
  const body = $("timeline-body");
  const meta = $("timeline-meta");
  const events = Array.isArray(data.events) ? data.events : [];
  const counts = data.counts ?? { events: 0, refused: 0, blocks: 0 };

  if (data.status === "empty") {
    meta.textContent = "No agents configured";
    body.innerHTML = stateBox(
      "No events to show",
      "<p>This console is running without a fleet. Set <code>FLEET_CONSOLE_ACCOUNTS</code> and restart to read audit entries and watched receipts.</p>",
      { icon: "block" },
    );
    body.setAttribute("aria-busy", "false");
    return;
  }

  if (data.status === "loading" && counts.events === 0) {
    meta.textContent = "Reading finalized block…";
    if (!silent) body.innerHTML = loadingBody("Reading audit entries and watched receipts.");
    body.setAttribute("aria-busy", "true");
    scheduleRetry(() => loadTimeline());
    return;
  }

  meta.textContent = `${fmtInt(counts.events)} events · ${fmtInt(counts.refused)} refused · ${fmtInt(counts.blocks)} blocks`;

  if (events.length === 0) {
    meta.textContent = "0 events · 0 refused";
    body.innerHTML = stateBox(
      "No events recorded yet",
      "<p>The audit log is empty and no watched receipt has resolved. The timeline does not invent rows.</p>",
      { icon: "clock" },
    );
    body.setAttribute("aria-busy", "false");
    return;
  }

  const shown = events.slice(0, state.timelineLimit);
  const more = events.length > shown.length
    ? `<p class="more"><button class="btn" type="button" data-more="1">Show ${fmtInt(Math.min(20, events.length - shown.length))} more</button> <span class="dim">${fmtInt(shown.length)} of ${fmtInt(events.length)}</span></p>`
    : "";
  body.innerHTML = `${eventTable(shown)}${more}`;
  body.setAttribute("aria-busy", "false");
}

/* ---------- command sheet ---------- */

function openSheet(key) {
  const commands = state.agent?.commands;
  const command = commands?.[key];
  if (!command) return;
  const sheet = $("command-sheet");
  sheet.hidden = false;
  $("command-text").textContent = command;
  $("copy-status").hidden = true;
  $("copy-status").className = "copied";
  state.sheetCommand = key;
  requestAnimationFrame(() => sheet.classList.add("open"));
  document.querySelectorAll("[data-command]").forEach((button) => {
    button.setAttribute("aria-expanded", String(button.dataset.command === key));
  });
}

function closeSheet() {
  const sheet = $("command-sheet");
  sheet.classList.remove("open");
  sheet.hidden = true;
  state.sheetCommand = null;
  document.querySelectorAll("[data-command]").forEach((button) => {
    button.setAttribute("aria-expanded", "false");
  });
}

async function copyCommand() {
  const text = $("command-text").textContent ?? "";
  const status = $("copy-status");
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      const area = document.createElement("textarea");
      area.className = "copy-fallback";
      area.value = text;
      area.setAttribute("readonly", "");
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand("copy");
      area.remove();
      if (!ok) throw new Error("execCommand refused");
    }
    status.textContent = "Copied";
    status.className = "copied";
  } catch {
    status.textContent = "Copy failed — select the command and copy it manually";
    status.className = "copy-error";
  }
  status.hidden = false;
  setTimeout(() => {
    status.hidden = true;
  }, 3_000);
}

/* ---------- events ---------- */

document.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const retry = target.closest("[data-retry]");
  if (retry !== null) {
    if (retry.dataset.retry === "fleet") loadFleet();
    else if (retry.dataset.retry === "agent") loadAgent(state.route.account);
    else if (retry.dataset.retry === "timeline") loadTimeline();
    return;
  }
  const more = target.closest("[data-more]");
  if (more !== null && state.timeline !== null) {
    state.timelineLimit += 20;
    renderTimeline(state.timeline, true);
    return;
  }
  const command = target.closest("[data-command]");
  if (command !== null) {
    if (state.sheetCommand === command.dataset.command && !$("command-sheet").hidden) {
      closeSheet();
    } else {
      openSheet(command.dataset.command);
    }
  }
});

$("copy-command").addEventListener("click", copyCommand);

window.addEventListener("hashchange", route);

setInterval(() => {
  const staleAfter = Math.max(12_000, (state.fleet?.blockPollMs ?? 1_000) * 8);
  if (
    state.lastDataAt !== null &&
    Date.now() - state.lastDataAt > staleAfter &&
    !state.dataStale
  ) {
    state.dataStale = true;
    updateBanner();
  }
  if (state.connection === "reconnecting") updateBanner();
}, 2_000);

/* ---------- stream ---------- */

function connectStream() {
  if (typeof EventSource === "undefined") return;
  const source = new EventSource("/api/stream");
  source.addEventListener("open", () => {
    state.connection = "live";
    state.reconnectSince = null;
    markLive();
    updateBanner();
    if (state.route.name === "fleet") scheduleRefresh("fleet");
  });
  source.addEventListener("init", (message) => {
    let data = {};
    try {
      data = JSON.parse(message.data);
    } catch {
      return;
    }
    state.connection = "live";
    state.reconnectSince = null;
    markLive();
    updateTicker(data.headBlock);
    updateBanner();
  });
  source.addEventListener("block", (message) => {
    let data = {};
    try {
      data = JSON.parse(message.data);
    } catch {
      return;
    }
    state.connection = "live";
    state.reconnectSince = null;
    markLive();
    updateTicker(data.height);
    if (state.fleet !== null && data.height >= (state.fleet.headBlock ?? 0)) {
      state.fleet.headBlock = data.height;
    }
    updateBanner();
    if (state.route.name === "fleet") scheduleRefresh("fleet");
    else if (state.route.name === "agent") scheduleRefresh("agent");
    else scheduleRefresh("timeline");
  });
  source.addEventListener("snapshot", () => {
    state.connection = "live";
    state.reconnectSince = null;
    markLive();
    if (state.route.name === "fleet") scheduleRefresh("fleet");
    else if (state.route.name === "agent") scheduleRefresh("agent");
    else scheduleRefresh("timeline");
  });
  source.addEventListener("timeline", () => {
    markLive();
    if (state.route.name === "timeline") scheduleRefresh("timeline");
    else if (state.route.name === "agent") scheduleRefresh("agent");
    else scheduleRefresh("fleet");
  });
  source.addEventListener("error", () => {
    if (state.connection !== "reconnecting") {
      state.reconnectSince = Date.now();
    }
    state.connection = "reconnecting";
    updateBanner();
  });
}

/* ---------- boot ---------- */

route();
connectStream();
