# RxDBAdapterDesktopErrorCode

```ts
type RxDBAdapterDesktopErrorCode = 
  | "unsupported_runtime_engine"
  | "invalid_database_name"
  | "host_unavailable"
  | "session_closed"
  | "protocol_violation"
  | "open_failed"
  | "permission_denied"
  | "database_corrupted"
  | "statement_failed"
  | "host_internal_error"
  | "database_busy"
  | "file_not_found"
  | "invalid_file_path"
  | "disk_full"
  | "write_aborted"
  | "transaction_not_found"
  | "transaction_unavailable"
  | "restore_in_progress"
  | "restore_incomplete"
  | "target_not_empty"
  | "cleanup_pending"
  | "unsupported_operation";
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/desktop/desktop-error.d.ts:38

Stable error codes the desktop adapter promises to the outside.

## Remarks

These codes are **part of the contract**: callers branch on `code`, and message text may change
between versions. New codes may only be appended, never reused or redefined.

- `unsupported_runtime_engine`: the runtime and engine combination is outside the capability matrix
- `invalid_database_name`: the logical database name is invalid, or attempts to escape the app scope
- `host_unavailable`: the renderer cannot reach the desktop host (no transport injected / preload did not expose one),
  or the channel failed mid-request (host process exited, IPC dropped); `cause` preserves the transport's original error
- `session_closed`: the session was used after being disconnected
- `protocol_violation`: the request or response does not match the protocol shape
- `open_failed`: opening the database failed; `cause` preserves the original reason
- `permission_denied`: the path lacks permission, or the statement was rejected by the SQLite authorizer (operations escaping the app scope such as `ATTACH` / `VACUUM INTO`)
- `database_corrupted`: the target file is not a usable SQLite database
- `statement_failed`: the SQL itself failed to execute (syntax, constraints, etc.); `cause` preserves the original error
- `host_internal_error`: the host itself errored; a defect rather than a caller problem
- `database_busy`: another connection (usually another window) holds a conflicting lock; retrying works, no data loss
- `file_not_found`: the target file or directory does not exist; the renderer restores this to `NotFoundError`
- `invalid_file_path`: the path escapes the storage root, or points at a type that does not match the operation
- `disk_full`: disk space or quota exhausted (ENOSPC / EDQUOT)
- `write_aborted`: the write token is no longer valid (session closed, committed, or discarded); the target keeps its pre-write contents
- `transaction_not_found`: the transaction ID does not exist, has ended, or does not belong to this session; not a single statement was executed
- `transaction_unavailable`: timed out waiting to open a transaction — another transaction occupies the connection; no data loss, retrying works
- `restore_in_progress`: the target is held exclusively by a restore on the same host; ordinary connections are refused; new restore and cleanup requests
  report `database_busy` like any other competing access (US-217)
- `restore_incomplete`: the target carries an unfinished-restore marker; it must be cleaned up before connecting or restoring again (US-217)
- `target_not_empty`: the restore target already contains database content; restore refuses to overwrite (US-217)
- `cleanup_pending`: the cleanup after a failed restore itself failed; the target stays in a distinguishable unfinished state (US-217)
- `unsupported_operation`: the host does not have the operation enabled, e.g. the host is not configured with backup and restore
