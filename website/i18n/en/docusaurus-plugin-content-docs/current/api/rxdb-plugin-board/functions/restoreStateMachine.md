# restoreStateMachine()

```ts
function restoreStateMachine(snapshot, input): RestoreSnapshot;
```

Defined in: [packages/rxdb-plugin-board/src/restore-machine.ts:66](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board/src/restore-machine.ts#L66)

Pure function state machine: `(snapshot, input) → new snapshot`.

State transitions (the "switch uses full page reload" table in the US-537 tech notes):
- Startup selection: with no active position record, choose create new, load demo data or restore; only create new and load connect;
  after a failed / cancelled restore, return here or to the original board (decided by the host based on whether an active position exists).
- Selecting archive: the file selection itself does not write to the database; restoring over an existing database confirms first, and cancel does not start a restore.
- Restoring: writes the "restoring" marker; disconnects this page's connection, generates a new database name and
  `restore()`s on an unconnected adapter. On failure or cancel → cleans up this restore's target, clears the marker; the original active position is unchanged.
- Switching: after restore completes, writes the "pending switch position" and reloads the whole page; on startup, connects to the new database and reads back,
  writing the active position and clearing the marker only on success; read-back failure → disconnects the new database and cleans up this restore's target.
- Restored: opens the board from the backup; subsequent operations follow the normal board flow.
- Failed: shows retry / free up space / cleanup entries according to the error category; an incomplete target never becomes the active position.

## Parameters

| Parameter | Type |
| ------ | ------ |
| `snapshot` | [`RestoreSnapshot`](../interfaces/RestoreSnapshot.md) |
| `input` | [`RestoreInput`](../type-aliases/RestoreInput.md) |

## Returns

[`RestoreSnapshot`](../interfaces/RestoreSnapshot.md)
