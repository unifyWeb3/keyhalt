/**
 * FLEET TypeScript SDK — Phase 1 interface definitions only.
 *
 * No signing, RPC call, key handling, or controller call is implemented in
 * Phase 1. `createFleetClient` throws. The interfaces below are the contract
 * that Phase 2 must implement; they are documented in `docs/INTERFACES.md`.
 */

export const FLEET_SDK_VERSION = "0.0.0-phase1";

export type FleetMode = "A" | "B";

export interface OperatorKey {
  publicKey: string;
  tag: string;
}

export interface FleetState {
  accountId: string;
  mode: FleetMode;
  paused: boolean;
  /** Mode A only. Public key, never a private key. */
  adminPublicKey?: string;
  /** Mode B only. Account ID of the multisig. */
  adminAccount?: string;
  pendingAdminPublicKey?: string;
  recoveryPublicKey?: string;
  contractVersion: string;
}

export interface AuditEntry {
  seq: number;
  action: string;
  actorAccount: string;
  signerPublicKey: string;
  subject: string;
  blockHeight: number;
  blockTimestampNs: string;
  prevHash: string;
  entryHash: string;
}

export interface AuditHead {
  seq: number;
  entryHash: string;
  blockHeight: number;
  blockTimestampNs: string;
}

export interface NativeKey {
  publicKey: string;
  permission: "FullAccess" | "FunctionCall";
  allowanceNear?: string;
  receiverId?: string;
  methodNames?: string[];
}

export interface FleetInventory {
  accountId: string;
  state: FleetState;
  operators: OperatorKey[];
  nativeKeys: NativeKey[];
  auditHead: AuditHead;
}

export interface FleetClientOptions {
  rpcUrl: string;
  accountId: string;
  /**
   * A local signer may be supplied in Phase 2. It must never be serialized,
   * logged, sent to the API, or loaded in a browser.
   */
  signer?: unknown;
}

export interface FleetReadClient {
  getState(): Promise<FleetState>;
  getInventory(): Promise<FleetInventory>;
  getAudit(fromSeq: number, limit: number): Promise<AuditEntry[]>;
  getAuditHead(): Promise<AuditHead>;
}

export interface FleetWriteClient extends FleetReadClient {
  freeze(): Promise<string>;
  unfreeze(): Promise<string>;
  grantOperator(publicKey: string, tag: string): Promise<string>;
  rotateOperator(oldPublicKey: string, newPublicKey: string, tag: string): Promise<string>;
  revokeOperator(publicKey: string): Promise<string>;
  revokeTag(tag: string): Promise<string>;
  proposeAdmin(newPublicKey: string): Promise<string>;
  acceptAdmin(): Promise<string>;
  recoverAdmin(newPublicKey: string): Promise<string>;
}

export interface FleetClient extends FleetWriteClient {}

export function createFleetClient(_options: FleetClientOptions): FleetClient {
  throw new Error(
    "FLEET SDK is not implemented in Phase 1. See docs/INTERFACES.md and docs/PLAN.md.",
  );
}
