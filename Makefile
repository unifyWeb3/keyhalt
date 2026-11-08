SHELL := /usr/bin/env bash
export PATH := $(HOME)/.cargo/bin:$(PATH)
.DEFAULT_GOAL := help

.PHONY: help setup verify test build claims style secret-scan rpc-check demo console console-smoke console-demo mcp fresh-clone mutation gas repro clean

help:
	@echo "Keyhalt v0.3 — testnet key-lifecycle control plane (unaudited)"
	@echo ""
	@echo "  make setup       check tools, install JS deps, build"
	@echo "  make verify      run all local checks + read-only testnet RPC"
	@echo "  make test        run Rust and TypeScript tests"
	@echo "  make build       build Rust and TypeScript workspaces"
	@echo "  make claims      validate CLAIMS.md"
	@echo "  make style       U+2014/U+2013 and banned-phrase gate"
	@echo "  make secret-scan scan the tree for key material"
	@echo "  make rpc-check   read-only NEAR testnet status check"
	@echo "  make demo        print the 90-second demo script"
	@echo "  make console     start the read-only console at http://127.0.0.1:4173"
	@echo "  make console-smoke  deterministic console start/read-only/static check"
	@echo "  make console-demo   rehearse freeze -> refusal -> unfreeze (needs key env)"
	@echo "  make mcp         run the read-only Keyhalt MCP server on stdio"
	@echo "  make mutation    run the 8-mutant state-machine test"
	@echo "  make gas         rebuild the testnet gas profile"
	@echo "  make repro       build the wasm twice and compare hashes"
	@echo "  make fresh-clone run the fresh-clone reproducibility test"
	@echo "  make clean       remove build outputs"

setup:
	./scripts/setup.sh

verify:
	./scripts/verify.sh

test:
	cargo test --workspace
	npm test

build:
	cargo build --workspace
	npm run build

claims:
	node scripts/check-claims.mjs

style:
	node scripts/style-check.mjs

secret-scan:
	./scripts/secret-scan.sh

rpc-check:
	node scripts/rpc-check.mjs

demo:
	@sed -n '1,260p' docs/DEMO_SCRIPT.md

console:
	npm run build
	node packages/console/dist/cli.js

console-smoke:
	node scripts/console-smoke.mjs

console-demo:
	node scripts/console-demo.mjs

mcp:
	npm run build
	node packages/mcp/dist/cli.js

mutation:
	node scripts/mutation-test.mjs

gas:
	node scripts/gas-profile.mjs

repro:
	./scripts/repro-build.sh

fresh-clone:
	./scripts/fresh-clone-test.sh

clean:
	cargo clean
	npm run clean
	rm -rf packages/*/dist
