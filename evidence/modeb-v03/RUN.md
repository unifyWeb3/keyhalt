# FLEET v0.3 Mode B testnet run

- Started: 2026-11-03T22:28:44.788Z
- Finished: 2026-11-03T22:54:21.415Z
- Parent / multisig: `fleet-modeb-748d4372.testnet`
- Mode B agent: `agent-b1.fleet-modeb-748d4372.testnet`
- Mode A latency agent: `agent-lat1.fleet-modeb-748d4372.testnet`
- RPC: `https://rpc.testnet.near.org`
- Controller wasm: 248644 bytes, sha256 `cdb2b37c4692094d1b554f0ab2cab4256b9f9d66bc537c4404f949ee2b589f5f`
- Multisig wasm: 293734 bytes, sha256 `df73f72595382e9e5839431d6589410e37175b04e2ac09aa03a8d793f249c82f`
- Multisig source: pinned `near/core-contracts` commit `1b0436c96379c63aee7d2429c6d5d24019031ab8` (v0.4.0, MIT OR Apache-2.0)
- Checks: 52/52 pass

## Setup transactions

| Step | Transaction | Block |
| --- | --- | ---: |
| Parent faucet | [3kkxz3tGJWYf36YmdfPgXAjBJYpmUsfQkadQeJod8f2U](https://testnet.nearblocks.io/txns/3kkxz3tGJWYf36YmdfPgXAjBJYpmUsfQkadQeJod8f2U) | — |
| Mode B agent create | [FC4TRS6e7FRX9zvb1eS5aP6UYrzYcLzKRkZeY2y43Edh](https://testnet.nearblocks.io/txns/FC4TRS6e7FRX9zvb1eS5aP6UYrzYcLzKRkZeY2y43Edh) | — |
| Mode B agent init | [4QHPzixTgcJk2wB1SE3cUpkmMWCe5bXKLvzhsdT2ja5Y](https://testnet.nearblocks.io/txns/4QHPzixTgcJk2wB1SE3cUpkmMWCe5bXKLvzhsdT2ja5Y) | — |
| Latency agent create | [FY2fKhM3xXo7v36PKD6rNcyjZhuHKtMuMzozvW8fFUQK](https://testnet.nearblocks.io/txns/FY2fKhM3xXo7v36PKD6rNcyjZhuHKtMuMzozvW8fFUQK) | — |
| Latency agent init | [GzioLDH2xrFsciY2mJ8d4WU6Mu7nsY6PYKxXReTiAYyN](https://testnet.nearblocks.io/txns/GzioLDH2xrFsciY2mJ8d4WU6Mu7nsY6PYKxXReTiAYyN) | — |
| Multisig deploy | [8DfC8CZfgLT6S66oH26R6QJ7zvVDn75SLCujnHGkoqT8](https://testnet.nearblocks.io/txns/8DfC8CZfgLT6S66oH26R6QJ7zvVDn75SLCujnHGkoqT8) | 276110066 |
| Multisig init 2-of-2 | [6sEkb5Ga2piDHHwXnNN1vszMBjn3o1RpcuDzm3xG5Efx](https://testnet.nearblocks.io/txns/6sEkb5Ga2piDHHwXnNN1vszMBjn3o1RpcuDzm3xG5Efx) | 276110108 |
| Bootstrap key delete | [CoefaWo5T7Vqq1bWkVJ2rZNnW3LPVud453LUPz6NRPjp](https://testnet.nearblocks.io/txns/CoefaWo5T7Vqq1bWkVJ2rZNnW3LPVud453LUPz6NRPjp) | 276110162 |
| Stranger faucet | [7VmXXfS2mqJCDwxCquPu1zh7DRM4HDzRjEMGAcJ1Q8ZB](https://testnet.nearblocks.io/txns/7VmXXfS2mqJCDwxCquPu1zh7DRM4HDzRjEMGAcJ1Q8ZB) | — |

## Multisig state

- Members: `fleet-v03-5cff9e99.testnet`, `fleet-v03-fund2-8b91351d.testnet`
- Required confirmations: 2 (2-of-2)
- Parent access keys before bootstrap delete: 1; after: 0
- On-chain code hash: `G3GUfe8ZJ2RLe2XphKiKA7YXB4iyjBjUK8knd6T8X1jC` — matches the built wasm

## Mode B lifecycle

| Step | Transaction | Block | Status | Detail |
| --- | --- | ---: | --- | --- |
| Member calls freeze directly | [6pYC2CBPQmH8YA51LR3ArETuzNhBekWWnwcu9btyKvus](https://testnet.nearblocks.io/txns/6pYC2CBPQmH8YA51LR3ArETuzNhBekWWnwcu9btyKvus) | 276110253 | failure | refusal: active admin required |
| Non-member adds request | [B1ZBWv9uh6oUTGrzHY9FGiFWBQvdgMc4EqpS9QrKMre5](https://testnet.nearblocks.io/txns/B1ZBWv9uh6oUTGrzHY9FGiFWBQvdgMc4EqpS9QrKMre5) | 276110304 | failure |  |
| Freeze add_request | [dEjn26NbgqFtY1GSczDJVHmgmunUkuQUciNG9Rq1YQB](https://testnet.nearblocks.io/txns/dEjn26NbgqFtY1GSczDJVHmgmunUkuQUciNG9Rq1YQB) | 276110352 | success | request 0 |
| Freeze first confirm | [E9GSJFVXTX1CexZYS9nRPriJHFQFYr5XaRe4pmP65MDj](https://testnet.nearblocks.io/txns/E9GSJFVXTX1CexZYS9nRPriJHFQFYr5XaRe4pmP65MDj) | 276110400 | success | request 0 |
| Freeze duplicate confirm | [7CNu6Ee1fZ17a2DrA22tnzkTMeH3PuSa8UeqhSzVPbVN](https://testnet.nearblocks.io/txns/7CNu6Ee1fZ17a2DrA22tnzkTMeH3PuSa8UeqhSzVPbVN) | 276110459 | failure | request 0 |
| Freeze second confirm | [3GY9rkAWxmrAkqEwf9TBv3rSo5M9iBPWQfmU8coRZtuk](https://testnet.nearblocks.io/txns/3GY9rkAWxmrAkqEwf9TBv3rSo5M9iBPWQfmU8coRZtuk) | 276110498 | success | request 0 |
| Execute while frozen | [An7vQH16RQAup3kMVEGJDZyKN9Jpw6Dxa8CkJvF8vS2f](https://testnet.nearblocks.io/txns/An7vQH16RQAup3kMVEGJDZyKN9Jpw6Dxa8CkJvF8vS2f) | 276110538 | failure | refusal: controller is frozen |
| Unfreeze add_request | [BM5Xcw17BBvQe2mV3KsUsShF2NYLfaAXpFXfbV82qFaG](https://testnet.nearblocks.io/txns/BM5Xcw17BBvQe2mV3KsUsShF2NYLfaAXpFXfbV82qFaG) | 276110566 | success | request 1 |
| Unfreeze first confirm | [EUHXnabokXLGdkFqfCfmHtJRpBFzkSjDpofwF9bwbEMc](https://testnet.nearblocks.io/txns/EUHXnabokXLGdkFqfCfmHtJRpBFzkSjDpofwF9bwbEMc) | 276110600 | success | request 1 |
| Unfreeze second confirm | [GFvHeSRbbTGiGH765Ef6BBkWCKYu8inDuV8fd1SDT1bm](https://testnet.nearblocks.io/txns/GFvHeSRbbTGiGH765Ef6BBkWCKYu8inDuV8fd1SDT1bm) | 276110650 | success | request 1 |
| Execute after unfreeze | [GR69FWJU4n2xdn58KPbR7wgjCteLz1g826E5Ja8hnLS7](https://testnet.nearblocks.io/txns/GR69FWJU4n2xdn58KPbR7wgjCteLz1g826E5Ja8hnLS7) | 276110695 | success |  |

- One confirmation left the agent unpaused; the second confirmation paused it in 20884 ms (submit → observed state).
- Frozen execute was refused with `controller is frozen`; the same operator key returned `pong` after the second unfreeze confirmation.
- A multisig member calling `freeze` directly was refused with `active admin required`; a non-member request was rejected by the multisig.

## Audit chain

- Entries: 3; on-chain verify: true; independent JS recompute: true
- Head: `82d6e41d73dbbc53144af462bf09340e35dac76e11e8da21a4f2b5bb8796d39b`

| Seq | Action | Actor | Signer | Subject | Block |
| ---: | --- | --- | --- | --- | ---: |
| 0 | init | `` | `` | provisioned | 276109053 |
| 1 | freeze | `fleet-modeb-748d4372.testnet` | `ed25519:27zeqN555dhm6B65WCk4QePiztXthKpPG92nj44z6f5t` | paused=true | 276110500 |
| 2 | unfreeze | `fleet-modeb-748d4372.testnet` | `ed25519:27zeqN555dhm6B65WCk4QePiztXthKpPG92nj44z6f5t` | paused=false | 276110652 |

## Mode A latency, storage, and allowance

| Operation | n | min ms | mean ms | max ms | Gas (mean) |
| --- | ---: | ---: | ---: | ---: | ---: |
| Freeze (Mode A admin key) | 3 | 19518 | 22716 | 28576 | 2396056961409 |
| Unfreeze (Mode A admin key) | 3 | 20312 | 21997 | 25203 | 2431625490962 |

- Storage grew 1713 bytes across 6 added audit entries (about 285.5 bytes each, including vector growth).
- Admin key allowance: 98685604801788700000000 yocto; derived upper bound 454 freeze calls at the measured mean tokens burnt. This is a derived bound, not an exhaustion test.

## Cross-agent isolation

| Direction | Expected | Result | Detail |
| --- | --- | --- | --- |
| latency operator key against the Mode B agent | cross_agent | protocol_rejected | Access key receiver agent-lat1.fleet-modeb-748d4372.testnet does not match transaction receiver agent-b1.fleet-modeb-748d4372.testnet |
| latency operator key on the latency agent | positive_control | success | uSE8JBV9NJa3MUUQNMnE7cCBJDcsHsSK6qW3Xe2sbLZ |
| Mode B operator key against the latency agent | cross_agent | protocol_rejected | Access key receiver agent-b1.fleet-modeb-748d4372.testnet does not match transaction receiver agent-lat1.fleet-modeb-748d4372.testnet |
| Mode B operator key on the Mode B agent | positive_control | success | 3YkKFigE2PLq65YZQAbTEY9NiQ7ZsoBigQp2y9uCxTpR |

## Scope

Testnet only. This run proves the 2-of-2 mechanism with two owner accounts operated by the same test harness in this environment. It does not prove independent organizational custody. The multisig contract is third-party, pinned by commit, source-built, and unaudited. Freeze does not cancel an in-flight receipt.

All wall times are submit → observed state and include transaction finality and RPC polling, not contract-execution-only latency. Latency figures are single-host observations, not an SLA.

Generated from `run.json`; raw artifacts: `run.json`, `audit-modeb.json`, `audit-latency.json`, `build.json`, `multisig-repro-build.json`.

