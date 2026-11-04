#!/usr/bin/env node
/**
 * Lower the bulk-memory WebAssembly instructions to plain loops.
 *
 * Why this exists:
 * the near-workspaces sandbox (near-sandbox 0.1.5, nearcore 2.6.2) runs the
 * contract with the bulk-memory proposal disabled, while the current Rust
 * toolchain emits `memory.copy` and `memory.fill` by default. The sandbox
 * rejects such a module with `PrepareError::Deserialization` before the
 * contract ever runs.
 *
 * The testnet contract is deployed unmodified: the current testnet runtime
 * accepts the bulk-memory proposal. This script is used only by the
 * integration workflow, so the sandbox can execute the same Rust source.
 * It changes instruction selection only, not contract behaviour.
 *
 * Usage: node scripts/lower-wasm-bulk-memory.mjs <input.wasm> <output.wasm>
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import binaryen from "binaryen";

const input = resolve(
  process.argv[2] ?? "target/wasm32-unknown-unknown/release/fleet_controller.wasm",
);
const output = resolve(
  process.argv[3] ??
    "target/wasm32-unknown-unknown/release/fleet_controller.sandbox.wasm",
);

const bytes = new Uint8Array(readFileSync(input));
// The module has to be parsed with the features it actually uses, otherwise
// the lowering pass does not see the bulk-memory instructions.
const readFeatures =
  binaryen.Features.BulkMemory |
  binaryen.Features.BulkMemoryOpt |
  binaryen.Features.SignExt |
  binaryen.Features.MutableGlobals |
  binaryen.Features.NontrappingFPToInt |
  binaryen.Features.Multivalue |
  binaryen.Features.ReferenceTypes |
  binaryen.Features.ExtendedConst |
  binaryen.Features.TailCall |
  binaryen.Features.SIMD128;
const module = binaryen.readBinary(bytes, readFeatures);
if (!module) {
  throw new Error(`cannot parse wasm module: ${input}`);
}

module.runPasses(["llvm-memory-copy-fill-lowering"], {
  optimizeLevel: 0,
  shrinkLevel: 0,
});

// The emitted module must not advertise the bulk-memory feature either.
const cleared =
  module.getFeatures() &
  ~(binaryen.Features.BulkMemory | binaryen.Features.BulkMemoryOpt);
module.setFeatures(cleared);

const emitted = module.emitBinary();
writeFileSync(output, Buffer.from(emitted));

// Verify on the emitted module: no bulk-memory instruction may survive.
const text = module.emitText();
const survivors = ["memory.copy", "memory.fill", "memory.init"].filter((op) =>
  text.includes(op),
);
const bulkAfter = (cleared & binaryen.Features.BulkMemory) !== 0;
console.log(
  `[lower-wasm] ${input} -> ${output} bytes=${bytes.length}->${emitted.length} ` +
    `bulk_memory=${bulkAfter ? "on" : "off"}`,
);
if (bulkAfter) {
  throw new Error("bulk-memory feature is still enabled after lowering");
}
if (survivors.length > 0) {
  throw new Error(
    `bulk-memory instructions survived the lowering: ${survivors.join(", ")}`,
  );
}
