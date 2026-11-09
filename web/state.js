/**
 * Keyhalt console UI state machines: pure, explicit, testable.
 *
 * Every view in the console derives its render from these reducers. No DOM
 * access, no timers, no fetch. All state transitions live here and nowhere
 * else.
 *
 * Machines
 *   dataLoad        loading | live | stale | partial | error | empty
 *   sseStream       connecting | live | reconnecting | stopped
 *   agentState      unknown | active | frozen
 *   commandSheet    closed | open | copied | copy-failed
 *   timelineResult  ok | refused | pending
 *   viewport        compact | medium | wide
 *   action: canOfferAction(agent) -> the commands the UI may offer
 *
 * An impossible state is a bug. Reducers return the SAME state object for a
 * transition marked impossible so tests can assert it is never taken.
 */

/* ---------- 1. dataLoad ---------- */

export const DATA_LOAD_STATES = Object.freeze([
  "loading", // nothing read yet / first read pending
  "live", // last good read is fresh and agrees with chain
  "partial", // reads succeeding but an agent is behind the finalized head
  "stale", // reads failing; last good block still on screen
  "error", // reads failing and no good read exists
  "empty", // zero agents configured; not an error
]);
export const DATA_LOAD_IMPOSSIBLE = Object.freeze([
  ["live", "stale"], // would silently mix good and bad reads
  ["error", "stale"], // stale requires a last good block
  ["empty", "partial"], // a partial snapshot needs agents
]);

export const INITIAL_DATA_LOAD = Object.freeze({
  status: "loading",
  lastGoodBlock: null,
  hasData: false,
  consecutiveFailures: 0,
  staleSince: null,
});

export function dataLoadReducer(state, event) {
  switch (event.type) {
    case "fetch-start":
      return { ...state };
    case "fetch-ok": {
      const status = event.agents > 0 ? (event.partial ? "partial" : "live") : "empty";
      return {
        status,
        lastGoodBlock: event.block ?? state.lastGoodBlock,
        hasData: event.agents > 0,
        consecutiveFailures: 0,
        staleSince: null,
      };
    }
    case "fetch-fail": {
      const failures = state.consecutiveFailures + 1;
      if (!state.hasData) {
        return {
          ...state,
          status: "error",
          consecutiveFailures: failures,
          staleSince: state.staleSince ?? Date.now(),
        };
      }
      return {
        ...state,
        status: "stale",
        consecutiveFailures: failures,
        staleSince: state.staleSince ?? Date.now(),
      };
    }
    case "stale-marker": {
      if (!state.hasData) return { ...state, status: "error" };
      return { ...state, status: "stale", staleSince: state.staleSince ?? Date.now() };
    }
    default:
      return state;
  }
}

/* ---------- 2. sseStream ---------- */

export const SSE_STATES = Object.freeze([
  "connecting", // EventSource created, nothing yet
  "live", // frames arriving (any event)
  "reconnecting", // errored, waiting for the retry timer in the browser
  "stopped", // user left the page / stream deliberately closed
]);

export const SSE_IMPOSSIBLE = Object.freeze([
  ["live", "connecting"], // a live stream cannot be "connecting"
]);

export const INITIAL_SSE_STATE = Object.freeze({ status: "connecting", since: 0 });

export function sseReducer(state, event, now = 0) {
  switch (event.type) {
    case "open":
      if (state.status === "stopped") return state;
      return { status: "live", since: now };
    case "message":
      if (state.status === "live" || state.status === "reconnecting") {
        return { status: "live", since: state.since };
      }
      return state;
    case "error": {
      if (state.status === "stopped") return state;
      return { status: "reconnecting", since: now };
    }
    case "stop":
      return { status: "stopped", since: now };
    default:
      return state;
  }
}

/* ---------- 3. agentState ---------- */

export const AGENT_STATES = Object.freeze(["unknown", "active", "frozen"]);

export const INITIAL_AGENT_STATE = Object.freeze({ status: "unknown", block: null });

export function agentStateRead(previous, paused, block) {
  const status =
    paused === true ? "frozen" : paused === false ? "active" : "unknown";
  return { status, block: block ?? previous.block ?? null };
}

/* ---------- 4. commandSheet ---------- */

export const SHEET_STATES = Object.freeze(["closed", "open", "copied", "copy-failed"]);
export const SHEET_IMPOSSIBLE = Object.freeze([
  ["closed", "copied"], // cannot copy when closed
  ["closed", "copy-failed"], // same: no open sheet, no copy outcome
]);

export const INITIAL_SHEET = Object.freeze({ status: "closed", commandId: null });

export function sheetReducer(state, action) {
  switch (action.type) {
    case "open":
      return { status: "open", commandId: action.commandId ?? state.commandId };
    case "close":
      return { status: "closed", commandId: null };
    case "toggle":
      return state.status === "open" && state.commandId === action.commandId
        ? { status: "closed", commandId: null }
        : { status: "open", commandId: action.commandId ?? state.commandId };
    case "copy-success":
      if (state.status === "closed") return state;
      return { status: "copied", commandId: state.commandId };
    case "copy-failed":
      if (state.status === "closed") return state;
      return { status: "copy-failed", commandId: state.commandId };
    default:
      return state;
  }
}

/* ---------- 5. timelineResult ---------- */

export const TIMELINE_RESULTS = Object.freeze(["ok", "refused", "pending"]);

export function timelineResultOf(row) {
  if (row == null) return "pending";
  if (row.refused === true || row.result === "refused") return "refused";
  if (row.result === "ok" || row.result === "ok" || row.kind === "receipt") return "ok";
  return "pending";
}

/* ---------- 6. viewport ---------- */

export function viewportOf(widthPx) {
  if (widthPx <= 680) return "compact";
  if (widthPx <= 900) return "medium";
  return "wide";
}

/* ---------- 7. action: what the UI may offer ---------- */

export function actionForAgent(agent) {
  if (agent == null) return [];
  const mode = agent.mode;
  const paused = agent.paused;
  if (paused === null || paused === undefined) {
    return mode === "B"
      ? ["request-freeze", "request-unfreeze", "status"]
      : mode === "A"
        ? ["freeze", "unfreeze"]
        : [];
  }
  if (mode === "A") {
    // The console never offers freeze on a frozen controller (the contract
    // would reject it) nor unfreeze on an unfrozen one.
    return paused ? ["unfreeze"] : ["freeze"];
  }
  if (mode === "B") {
    return paused
      ? ["request-unfreeze", "confirm-unfreeze", "status"]
      : ["request-freeze", "confirm-freeze", "status"];
  }
  return [];
}

/* ---------- 8. banners: one decision, one place ---------- */

export function bannerOf(dataLoad, sse) {
  if (dataLoad.status === "stale" || dataLoad.status === "error") {
    return { kind: "danger", title: "Reads are failing." };
  }
  if (dataLoad.status === "partial") {
    return { kind: "warn", title: "Partial snapshot." };
  }
  if (sse.status === "reconnecting") {
    return { kind: "warn", title: "Reconnecting to the block stream." };
  }
  return null;
}

/* ---------- 9. routes to view ids: one mapping, tested ---------- */

export function viewIdForRoute(routeName) {
  switch (routeName) {
    case "keyhalt":
      return "view-keyhalt";
    case "agent":
      return "view-agent";
    case "timeline":
      return "view-timeline";
    default:
      return null;
  }
}
