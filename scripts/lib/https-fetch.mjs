/**
 * Minimal HTTPS-only fetch transport for the testnet harnesses.
 *
 * Node's built-in fetch (undici) fails to connect to the Cloudflare-fronted
 * NEAR testnet RPC hosts on this host while `node:https` succeeds. This shim
 * implements the small `fetch` surface that near-api-js and the faucet use:
 * status/ok, text(), json(), headers, and POST bodies. It pins IPv4 and uses a
 * keep-alive agent. It is not a general-purpose fetch implementation.
 */

import https from "node:https";

const agent = new https.Agent({
  family: 4,
  keepAlive: false,
});

function makeResponse(res, chunks) {
  const text = Buffer.concat(chunks).toString("utf8");
  return {
    ok: res.statusCode >= 200 && res.statusCode < 300,
    status: res.statusCode,
    statusText: res.statusMessage ?? "",
    headers: res.headers,
    text: async () => text,
    json: async () => JSON.parse(text),
  };
}

export function httpsFetch(url, options = {}) {
  const target = url instanceof URL ? url : new URL(String(url));
  if (target.protocol !== "https:") {
    return Promise.reject(
      new Error(`HTTPS-only transport refused ${target.protocol}`),
    );
  }
  const body = options.body;
  const headers = { ...(options.headers || {}) };
  if (!Object.keys(headers).some((key) => key.toLowerCase() === "content-length")) {
    headers["content-length"] = body === undefined || body === null
      ? "0"
      : String(Buffer.byteLength(body));
  }
  if (!Object.keys(headers).some((key) => key.toLowerCase() === "connection")) {
    headers.connection = "close";
  }
  return new Promise((resolve, reject) => {
    const request = https.request(
      target,
      {
        method: options.method || "GET",
        headers,
        agent,
        timeout: options.timeout ?? 90_000,
      },
      (response) => {
        const chunks = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () => resolve(makeResponse(response, chunks)));
      },
    );
    request.on("timeout", () => {
      request.destroy(new Error(`timeout after ${options.timeout ?? 90_000}ms`));
    });
    request.on("error", reject);
    if (body !== undefined && body !== null) request.write(body);
    request.end();
  });
}

export function installHttpsFetch() {
  globalThis.fetch = httpsFetch;
}
