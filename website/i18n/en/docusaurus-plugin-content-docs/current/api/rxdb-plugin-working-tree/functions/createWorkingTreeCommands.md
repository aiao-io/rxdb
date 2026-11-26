# createWorkingTreeCommands()

```ts
function createWorkingTreeCommands(database, patch): WorkingTreeCommands;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/working-tree-commands.ts:216](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/working-tree-commands.ts#L216)

Wires the fourteen commands onto the state slots.

## Parameters

| Parameter  | Type                                                                | Description                                                                                           |
| ---------- | ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `database` | [`RxDB`](../../rxdb/classes/RxDB.md)                                | The host database; the commands take its `workingTree` and `versionManager` entries                   |
| `patch`    | [`WorkingTreeStatePatch`](../type-aliases/WorkingTreeStatePatch.md) | Where every phase change lands; see [WorkingTreeStatePatch](../type-aliases/WorkingTreeStatePatch.md) |

## Returns

[`WorkingTreeCommands`](../interfaces/WorkingTreeCommands.md)

See [WorkingTreeCommands](../interfaces/WorkingTreeCommands.md)

## Remarks

**Commands rethrow errors unchanged** (§1 "throw the same set of error codes"). Recording them only into the
state without throwing would let `await entry.commit(msg, opts)` quietly proceed past a failed commit — the
caller receives an already-resolved promise while the working tree has not moved a single byte. State and
exception are not either/or here: state is for templates to bind directly, exceptions are for the caller's
control flow.

**`CommitConflict` is not translated into an exception**: `ok: false` is the **result** of a successful
call; §4 calls it "a retryable return value, not a crash". It lands in the `success` phase, and the UI reads
`result.ok` to decide whether to prompt a retry. `restore()`'s four rejection causes are the same: dirty
working tree and incompatibility need the user to act, unreachable means the wrong node was asked for, and
conflict means try again — none of the four is a crash.

**`restore()` is not followed by a session re-read.** It re-reads status (the working tree just went from
clean to dirty), but does not fire a second `restoreSession()`: the freshly created `sessionId` is already in
the return value, and the only exit for "is this session still valid" is `status()`'s `restoring` /
`conflicted` bits — and that summary was just re-read on the previous line. Likewise, `commit()` /
`discard()` do not re-read the session either, though both end it: three extra queries apiece would buy a
piece of supplementary information that no judgment depends on.

**Takes the whole database rather than just `workingTree`.** The eleventh item in the list, `switchBranch`,
hangs on `versionManager` (contracts/core-api.md §6 pins it there so the judgment can route back to this
plugin through the system contribution); taking only the working tree entry would force each of the three
frameworks to fetch `versionManager` itself and wire the state again — and "re-read status after a switch?"
judgments like these are the very reason this file exists; of three implementations, one is bound to forget
the re-read eventually.
