/**
 * FLEET MCP server — exposes FLEET reads to agents over the
 * Model Context Protocol (stdio transport, JSON-RPC 2.0).
 *
 * Read-only. No signer anywhere; agents get exactly what a human with
 * `fleet inventory`/`fleet audit` could read. Testnet only.
 */

import { createFleetClient, type FleetClient } from "@fleet/sdk";

export const MCP_SERVER_VERSION = "0.3.0";
export const PROTOCOL_VERSION = "2025-06-18";

export interface McpTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export const TOOLS: McpTool[] = [
  {
    name: "fleet_inventory",
    description:
      "Read the current state of a FLEET-managed NEAR testnet agent account: mode, paused state, operator keys, audit length. Pinned to the finalized block at call time.",
    inputSchema: {
      type: "object",
      properties: {
        account: {
          type: "string",
          description: "Testnet account id, e.g. agent-1b.fleet-v03-5cff9e99.testnet",
        },
      },
      required: ["account"],
      additionalProperties: false,
    },
  },
  {
    name: "fleet_audit",
    description:
      "Read the audit chain of a FLEET-managed agent: entries with seq, action, block height, and hashes. Optionally limit to the last N entries.",
    inputSchema: {
      type: "object",
      properties: {
        account: {
          type: "string",
          description: "Testnet account id",
        },
        limit: {
          type: "number",
          description: "Max entries to return, newest last, 1..100; defaults to 100",
        },
      },
      required: ["account"],
      additionalProperties: false,
    },
  },
  {
    name: "fleet_verify",
    description:
      "Verify the audit chain of a FLEET-managed agent both in the SDK and on-chain (the contract's verify_audit view). Returns ok, onChain, and the verified entry count.",
    inputSchema: {
      type: "object",
      properties: {
        account: {
          type: "string",
          description: "Testnet account id",
        },
      },
      required: ["account"],
      additionalProperties: false,
    },
  },
];

function isAccountId(value: unknown): value is string {
  return typeof value === "string" && /^[a-z0-9._-]{2,128}$/.test(value);
}

export class FleetMcpService {
  readonly rpcUrl: string;

  constructor(options: { rpcUrl: string }) {
    if (/mainnet/i.test(options.rpcUrl)) {
      throw new Error("FLEET is testnet-only; mainnet RPC URLs are refused");
    }
    this.rpcUrl = options.rpcUrl;
  }

  private clientFor(accountId: string): FleetClient {
    return createFleetClient({ rpcUrl: this.rpcUrl, accountId });
  }

  async inventory(accountId: string) {
    const client = this.clientFor(accountId);
    const inventory = await client.getInventory();
    return {
      accountId: inventory.accountId,
      contractVersion: inventory.state.contractVersion,
      mode: inventory.state.mode,
      paused: inventory.state.paused,
      adminPublicKey: inventory.state.adminPublicKey,
      adminAccount: inventory.state.adminAccount,
      recoveryPublicKey: inventory.state.recoveryPublicKey,
      receiverId: inventory.state.receiverId,
      methodName: inventory.state.methodName,
      operators: inventory.operators.map((operator) => ({
        publicKey: operator.publicKey,
        tag: operator.tag,
        active: operator.active,
      })),
      nativeKeys: inventory.nativeKeys.map((key) => ({
        publicKey: key.publicKey,
        permission: key.permission,
        receiverId: key.receiverId,
        methodNames: key.methodNames,
      })),
      fullAccessKeys: inventory.fullAccessKeys,
      auditLength: inventory.state.auditLength,
      auditHead: inventory.state.auditHead,
    };
  }

  async audit(accountId: string, limit?: number) {
    const cap = Math.min(100, Math.max(1, Math.floor(limit ?? 100)));
    const client = this.clientFor(accountId);
    const entries = await client.getAudit(0, 100);
    const slice = entries.slice(0, cap);
    return {
      accountId,
      entries: slice.map((entry) => ({
        seq: entry.seq,
        action: entry.action,
        actorAccount: entry.actorAccount,
        blockHeight: entry.blockHeight,
        blockTimestampNs: entry.blockTimestampNs,
        prevHash: entry.prevHash,
        entryHash: entry.entryHash,
      })),
      returned: slice.length,
      totalAuditLength: entries.length,
    };
  }

  async verify(accountId: string) {
    const client = this.clientFor(accountId);
    const [entries, onChain] = await Promise.all([
      client.getAuditAll(),
      client.verifyAuditOnChain(),
    ]);
    return { accountId, entries: entries.length, onChain };
  }

  async callTool(name: string, args: unknown): Promise<unknown> {
    if (
      name !== "fleet_inventory" &&
      name !== "fleet_audit" &&
      name !== "fleet_verify"
    ) {
      throw new McpError(-32601, `unknown tool: ${String(name)}`);
    }
    const bag = (args ?? {}) as Record<string, unknown>;
    const account = bag.account;
    if (!isAccountId(account)) {
      throw new McpError(-32602, "account must be a testnet account id");
    }
    if (name === "fleet_inventory") return this.inventory(account);
    if (name === "fleet_audit") {
      const limit = bag.limit;
      if (
        limit !== undefined &&
        (!Number.isSafeInteger(limit) || Number(limit) < 1 || Number(limit) > 100)
      ) {
        throw new McpError(-32602, "limit must be an integer 1..100");
      }
      return this.audit(account, typeof limit === "number" ? limit : undefined);
    }
    return this.verify(account);
  }
}

export class McpError extends Error {
  readonly code: number;
  constructor(code: number, message: string) {
    super(message);
    this.code = code;
  }
}

export interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: number | string | null;
  method: string;
  params?: unknown;
}

function ok(id: number | string | null | undefined, result: unknown) {
  return { jsonrpc: "2.0" as const, id: id ?? null, result };
}

function fail(id: number | string | null | undefined, error: McpError) {
  return {
    jsonrpc: "2.0" as const,
    id: id ?? null,
    error: { code: error.code, message: error.message },
  };
}

export function handleRpc(
  service: FleetMcpService,
  request: JsonRpcRequest,
): Promise<unknown> | unknown {
  const id = request.id;
  if (request.method === "initialize") {
    return ok(id, {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: { tools: {} },
      serverInfo: { name: "fleet-mcp", version: MCP_SERVER_VERSION },
    });
  }
  if (request.method === "notifications/initialized") {
    return undefined; // no response expected
  }
  if (request.method === "ping") return ok(id, {});
  if (request.method === "tools/list") {
    return ok(id, { tools: TOOLS });
  }
  if (request.method === "tools/call") {
    const params = (request.params ?? {}) as {
      name?: unknown;
      arguments?: unknown;
    };
    if (typeof params.name !== "string") {
      return fail(id, new McpError(-32602, "tools/call requires a tool name"));
    }
    return service
      .callTool(params.name, params.arguments)
      .then((result) =>
        ok(id, {
          content: [
            { type: "text", text: JSON.stringify(result, null, 2) },
          ],
        }),
      )
      .catch((error: unknown) =>
        fail(
          id,
          error instanceof McpError
            ? error
            : new McpError(
                -32603,
                String((error as { message?: unknown })?.message ?? error),
              ),
        ),
      );
  }
  return fail(id, new McpError(-32601, `unknown method: ${request.method}`));
}
