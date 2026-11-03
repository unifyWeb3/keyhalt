SHELL := /usr/bin/env bash
export PATH := $(HOME)/.cargo/bin:$(PATH)
.DEFAULT_GOAL := help

.PHONY: help setup verify test build claims secret-scan rpc-check demo fresh-clone mutation gas repro clean

help:
	@echo "FLEET v0.3 — testnet key-lifecycle control plane (unaudited)"
	@echo ""
	@echo "  make setup       check tools, install JS deps, build"
	@echo "  make verify      run all local checks + read-only testnet RPC"
	@echo "  make test        run Rust and TypeScript tests"
	@echo "  make build       build Rust and TypeScript workspaces"
	@echo "  make claims      validate CLAIMS.md"
	@echo "  make secret-scan scan the tree for key material"
	@echo "  make rpc-check   read-only NEAR testnet status check"
	@echo "  make demo        print the 90-second demo script"
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

secret-scan:
	./scripts/secret-scan.sh

rpc-check:
	node scripts/rpc-check.mjs

demo:
	@sed -n '1,260p' docs/DEMO_SCRIPT.md

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
