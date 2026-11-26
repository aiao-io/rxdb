# createWorkingTreeCommands()

```ts
function createWorkingTreeCommands(database, patch): WorkingTreeCommands;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/working-tree-commands.ts:216](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/working-tree-commands.ts#L216)

Wires the fourteen commands to the state slots.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `database` | [`RxDB`](../../rxdb/classes/RxDB.md) | The host database; the commands take its two entries `workingTree` and `versionManager` |
| `patch` | [`WorkingTreeStatePatch`](../type-aliases/WorkingTreeStatePatch.md) | The landing point of every phase change; see [WorkingTreeStatePatch](../type-aliases/WorkingTreeStatePatch.md) |

## Returns

[`WorkingTreeCommands`](../interfaces/WorkingTreeCommands.md)

See [WorkingTreeCommands](../interfaces/WorkingTreeCommands.md)

## Remarks

**Commands rethrow errors as-is** (§1 "throw the same set of error codes"). Recording into state without throwing would let
`await entry.commit(msg, opts)` silently continue when the commit fails — the caller gets an already-resolved
promise while the working tree has not moved one byte. State and exception are not either/or here: state is for templates
to bind directly, exceptions for the caller's control flow.

**`CommitConflict` is not translated into an exception**: `ok: false` is the **result** of a successful call; §4 says it is
"a retryable return value, not a crash". It lands in the `success` phase, and the UI reads `result.ok` to decide whether to
prompt a retry. `restore()`'s four rejection causes are the same: dirty working tree and incompatibility need the user to act, unreachable means asking the wrong
node, conflict means redoing it once — none of the four is a crash.

**After `restore()` no re-read of the session on the side.** It re-reads status (the working tree just went from clean to dirty), but does not fire a second round of
`restoreSession()`: the just-created `sessionId` is already in the return value, and the only exit for "does this session still hold" is
the `restoring` / `conflicted` two bits of `status()` — and that summary was re-read in the previous line.
Likewise, `commit()` / `discard()` do not re-read the session either, although both end it: three places each adding a round of queries would only buy
a piece of supplementary information that no judgment depends on.

**Takes the whole database rather than only `workingTree`.** The eleventh item of the list, `switchBranch`, hangs on `versionManager`
(contracts/core-api.md §6 pins it there so the judgment comes back to this plugin through the system contribution port); taking only the working tree entry
would force each of the three frameworks to fetch `versionManager` themselves and each wire the state once more — while judgments like "should status be re-read after switching"
are exactly why this file exists, and of three implementations one would eventually forget the re-read.
