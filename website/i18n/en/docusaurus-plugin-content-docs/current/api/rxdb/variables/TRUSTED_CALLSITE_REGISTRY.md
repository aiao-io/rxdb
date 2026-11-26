# TRUSTED_CALLSITE_REGISTRY

```ts
const TRUSTED_CALLSITE_REGISTRY: readonly TrustedCallsite[];
```

Defined in: [packages/rxdb/src/trusted-write/trusted-write-intent.ts:157](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/trusted-write/trusted-write-intent.ts#L157)

The 12 trusted-callsite rows verified against the real code (full-table verification date 2026-09-16)

## Remarks

The order matches the epic-006 "trusted callsite registry table" row by row, to make drift scans bidirectional.

The 2026-09-16 verification followed the US-025 package extraction: 9 declarations moved wholesale from the core
`version/` into the history / sync plugins, the keys (file basename + symbol + intent) unchanged, and all nine
`verifiedAtLine` rows changed.

On 2026-09-24 only rows #7 / #8 were refreshed: `pull-batch.ts` and `pull-repository.ts` extracted the shared
`pull-round.ts` (splitting self-pushed changes and backfilling `remoteId`), and both declarations moved up. **The other
seven rows were not re-verified**, and the date in the header still vouches only for the 2026-09-16 full-table
verification — updating the date as well would vouch for the other seven rows with a check nobody performed.

On 2026-09-25 row #10 was added: a review found that the materialization barrier on the metadata-only takeover path did
not self-report its intent, so mount point 1 recorded the whole snapshot as a batch of uncommitted changes under
`crud` (real-backend regression in the switchBranch mount-point section of `capture.suite.ts`). Again only the new row
was verified, and the header date stays.

On 2026-09-26 row #10 was rewritten and #11 added: the takeover path no longer opens its own transaction to switch
`active`, but issues one `adapter.switchBranch()` putting the barrier into `prepare` (materialization and switching
`active` in the same transaction). #10 therefore became that `switchBranch` declaration (symbol
`switchWithMaterialization`), and each batch of `executor.mergeChanges` that lands the projection inside the barrier
took #11 (symbol `applyMaterializedActions`). Only these two rows were verified, and the header date stays.

On 2026-10-05 row #12 was added (US-218 phase B): for entities rejected by the remote in push receipts, the local
business rows must be aligned to the remote's current state in the same transaction (overwrite when the remote has the
row, delete when it does not), going through `executor.mergeChanges(…, true)`. Again only the new row was verified, and
the header date stays.
