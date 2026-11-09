# Shot list

| t | Beat | What the viewer sees |
| --- | --- | --- |
| 0-9 | The blind spot | one line: "Agents ask for keys. Nobody can take them back." |
| 9-18 | The problem expands | fleet list: three agent accounts, six keys each, role tags |
| 18-28 | The freeze | admin signs once, "controller is frozen" receipt visible |
| 28-38 | The ask refused | the operator calls and is refused, with the receipt |
| 38-48 | Tag revoke | tag-based bulk revoke of operator keys, one transaction |
| 48-56 | Admin rotation | one transaction proposed, accepted, rotated, old key goes away |
| 56-64 | The audit chain | 19 entries, SHA-256, on-chain verify passes |
| 64-72 | The numbers | 84 Rust tests, 41 TypeScript tests, 7/7 near-workspaces, mutation 98.41% |
| 72-78 | The link | github.com/unifyWeb3/keyhalt, MIT, testnet only |
