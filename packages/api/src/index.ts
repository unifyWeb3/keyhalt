/**
 * FLEET read-only inventory and audit API — Phase 1 scaffold.
 *
 * The API is read-only by construction: no signing key, no write route, and no
 * private-key input. Phase 1 implements only `/health`; the read routes are
 * specified in `docs/INTERFACES.md` and return 501 until Phase 2.
 */

export const FLEET_API_VERSION = "0.0.0-phase1";

export type ReadOnlyMethod = "GET" | "HEAD";

export const READ_ONLY_METHODS: readonly ReadOnlyMethod[] = ["GET", "HEAD"];

export interface ApiResponse {
  status: number;
  body: unknown;
}

export function assertReadOnly(method: string): asserts method is ReadOnlyMethod {
  const upper = method.toUpperCase();
  if (upper !== "GET" && upper !== "HEAD") {
    throw new Error(`FLEET API is read-only; refused method ${method}`);
  }
}

export function createReadOnlyApi(): {
  handle(method: string, path: string): ApiResponse;
} {
  return {
    handle(method: string, path: string): ApiResponse {
      assertReadOnly(method);
      if (path === "/health") {
        return {
          status: 200,
          body: {
            status: "phase1-scaffold",
            version: FLEET_API_VERSION,
            readOnly: true,
          },
        };
      }
      return {
        status: 501,
        body: {
          error: "not implemented in Phase 1",
          path,
          see: "docs/INTERFACES.md",
        },
      };
    },
  };
}
