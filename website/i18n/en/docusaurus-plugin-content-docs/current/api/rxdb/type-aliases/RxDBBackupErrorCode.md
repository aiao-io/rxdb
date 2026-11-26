# RxDBBackupErrorCode

```ts
type RxDBBackupErrorCode = 
  | "unsupported_combination"
  | "incompatible_archive"
  | "auth_domain_mismatch"
  | "corrupt_archive"
  | "truncated_archive"
  | "target_not_empty"
  | "target_busy"
  | "restore_in_progress"
  | "restore_incomplete"
  | "cleanup_pending"
  | "aborted"
  | "io_error"
  | "storage_full"
  | "lock_timeout"
  | "invalid_state";
```

Defined in: [packages/rxdb/src/backup/backup-error.ts:27](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/backup/backup-error.ts#L27)

Stable error classification for backup / restore (US-217 public contract).

## Remarks

Callers should branch only on `code`; `message` is human-readable only and may be rewritten at any time.

| code | Meaning |
| --- | --- |
| `unsupported_combination` | The adapter / storage combination is outside the supported matrix, or the adapter does not implement the capability |
| `incompatible_archive` | Archive metadata is missing or incompatible with the target configuration (`details.field` names the offending item) |
| `auth_domain_mismatch` | The authentication domain of the encrypted archive differs from the target |
| `corrupt_archive` | Format corruption, digest mismatch, or the declaration disagrees with the payload |
| `truncated_archive` | The input ends before the archive's end marker |
| `target_not_empty` | The target already contains any database content (including a merely initialized engine directory) |
| `target_busy` | The target is held by another connection or restore operation; or the backup source's storage is still held by another connection, so its commits are invisible to the snapshot |
| `restore_in_progress` | A regular connection hits an in-progress restore |
| `restore_incomplete` | The target carries a marker of an unfinished restore; it must be cleaned up before restoring |
| `cleanup_pending` | The cleanup after a failure itself failed; the target stays in the unfinished state and refuses connections |
| `aborted` | The caller cancelled before the successful-commit boundary |
| `io_error` | Input / output stream or underlying storage read/write failure |
| `storage_full` | Insufficient disk space or storage quota |
| `lock_timeout` | Timed out waiting for the consistency lock (e.g. calling backup inside a transaction callback) |
| `invalid_state` | The adapter is not connected, is shutting down, or is otherwise in a state where the operation cannot run |
