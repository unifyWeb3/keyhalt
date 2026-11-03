/**
 * FLEET read-only inventory and audit API — v0.3 scaffold.
 *
 * The API is read-only by construction: no signing key, no write route, and no
 * private-key input. v0.3 implements only `/health`; the read routes are
 * specified in `docs/INTERFACES.md` and still return 501. The SDK and CLI are
 * the product interfaces until the console is designed and approved.
 */

export const FLEET_API_VERSION = "0.3.0-phase1";

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
            status: "v03-scaffold",
            version: FLEET_API_VERSION,
            readOnly: true,
          },
        };
      }
      return {
        status: 501,
        body: {
          error: "not implemented in the v0.3 scaffold",
          path,
          see: "docs/INTERFACES.md",
        },
      };
    },
  };
}
