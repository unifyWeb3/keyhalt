# Design deviation log

Each entry records one decision where the console deliberately does less than
the product could. The alternative is named, never hidden.

## D-01: Actions without keys

The console shows Freeze / Unfreeze buttons. Selecting one opens a command
sheet with the exact CLI command and a copy button. The console never signs,
never stores a key, and never calls a write method. The user pastes the
command into a terminal and signs with their local key.

Alternative considered: a wallet-signed write from the page. Rejected: it
would put key handling in a browser, which the interface rules forbid
(`docs/INTERFACES.md` §1) and which this draft is not built to audit.
