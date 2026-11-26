# classifyBackupIoError()

```ts
function classifyBackupIoError(error, message): RxDBBackupError;
```

Defined in: [packages/rxdb/src/backup/backup-archive.ts:103](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/backup/backup-archive.ts#L103)

Maps raw exceptions thrown by streams / storage onto a stable classification; already-classified errors are returned as-is.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `error` | `unknown` | The raw exception |
| `message` | `string` | Human-readable description |

## Returns

[`RxDBBackupError`](../classes/RxDBBackupError.md)

The classified error.

## Remarks

Out of space → `storage_full`; everything else → `io_error` (with the raw exception attached to `cause`). Two forms count as out of space:

- Browser storage's `QuotaExceededError`: identified by `name` rather than `instanceof DOMException`, since exceptions forwarded by Worker / Comlink only keep `name` across realms;
- Node file streams (e.g. `Writable.toWeb(createWriteStream(...))`) with `code` `ENOSPC` / `EDQUOT`.

When the error is forwarded via Electron IPC or a Tauri command, `code` is lost; cross-process output streams should report out of space as `new DOMException(message, 'QuotaExceededError')`. Adapters reuse this at their own storage read/write points, guaranteeing that the same failure lands on the same code on every adapter.
