# Compatibility matrix

This page summarizes the runtime and framework versions currently targeted by the repository. The package `engines` and `peerDependencies` in the release you consume remain authoritative.

| Dependency | Current target |
| ---------- | -------------- |
| Node.js    | `>=26`         |
| pnpm       | `>=10`         |
| TypeScript | `~6.0.3`       |
| Angular    | `22`           |
| React      | `19`           |
| Vue        | `3.5`          |
| RxJS       | `7.8`          |

The browser examples require a modern browser with WebAssembly and the storage APIs required by the selected adapter. Mini-program and desktop adapters have additional host-specific constraints. Read the adapter guide before treating an experimental runtime as a production target.
