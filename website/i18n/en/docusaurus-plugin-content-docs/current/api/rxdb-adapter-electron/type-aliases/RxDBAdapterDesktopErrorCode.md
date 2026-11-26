# RxDBAdapterDesktopErrorCode

```ts
type RxDBAdapterDesktopErrorCode =
  | 'unsupported_runtime_engine'
  | 'invalid_database_name'
  | 'host_unavailable'
  | 'session_closed'
  | 'protocol_violation'
  | 'open_failed'
  | 'permission_denied'
  | 'database_corrupted'
  | 'statement_failed'
  | 'host_internal_error'
  | 'database_busy'
  | 'file_not_found'
  | 'invalid_file_path'
  | 'disk_full'
  | 'write_aborted'
  | 'transaction_not_found'
  | 'transaction_unavailable'
  | 'restore_in_progress'
  | 'restore_incomplete'
  | 'target_not_empty'
  | 'cleanup_pending'
  | 'unsupported_operation';
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/desktop/desktop-error.d.ts:38

Stable error codes the desktop adapter commits to externally.

## Remarks

These codes are **part of the contract**: callers branch on `code`, and the message text may change between versions.
New codes may only be appended; never reuse or redefine an existing meaning.

- `unsupported_runtime_engine`: the runtime/engine combination is outside the capability matrix
- `invalid_database_name`: the logical database name is invalid, or tries to escape the app's scope
- `host_unavailable`: the renderer side cannot reach the desktop host (no transport injected / preload not exposing one),
  or the channel failed mid-request (host process exited, IPC dropped); `cause` preserves the transport's original error
- `session_closed`: the session is used after being disconnected
- `protocol_violation`: a request or response does not match the protocol shape
- `open_failed`: opening the database failed; `cause` preserves the original reason
- `permission_denied`: the path has no permission, or the statement is rejected by the SQLite authorizer (`ATTACH` / `VACUUM INTO` and other operations escaping the app's scope)
- `database_corrupted`: the target file is not a usable SQLite database
- `statement_failed`: the SQL itself failed to execute (syntax, constraints, etc.); `cause` preserves the original error
- `host_internal_error`: the host itself failed; a defect rather than a caller problem
- `database_busy`: another connection (usually another window) holds a conflicting lock; retrying works, no data is lost
- `file_not_found`: the target file or directory does not exist; the renderer side restores this into `NotFoundError`
- `invalid_file_path`: the path escapes the storage root, or points to a type that does not match the operation
- `disk_full`: disk space or quota exhausted (ENOSPC / EDQUOT)
- `write_aborted`: the write token is no longer valid (session closed, committed, or discarded); the target keeps its pre-write content
- `transaction_not_found`: the transaction ID does not exist, has ended, or does not belong to this session; not a single statement was executed
- `transaction_unavailable`: waiting to open a transaction timed out — another transaction holds the connection; the database is intact, retry works
- `restore_in_progress`: the target is exclusively held by a restore on the same host; ordinary connections are refused; new restore and cleanup requests
  report `database_busy` like other competing access (US-217)
- `restore_incomplete`: the target has a marker of an unfinished restore; it must be cleaned up before connecting or restoring again (US-217)
- `target_not_empty`: the restore target already contains database content; restore refuses to overwrite (US-217)
- `cleanup_pending`: the cleanup after a failed restore itself failed; the target stays in a discernible unfinished state (US-217)
- `unsupported_operation`: the host does not have the operation enabled, e.g. the host app did not configure backup and restore
