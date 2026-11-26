# RxDBReplayErrorCode

```ts
type RxDBReplayErrorCode = 
  | "no_dom"
  | "already_recording"
  | "store_limit"
  | "recording_db_unavailable"
  | "session_not_found"
  | "session_recording"
  | "working_tree_unavailable"
  | "invalid_marker"
  | "not_installed";
```

Defined in: [packages/rxdb-plugin-replay/src/errors.ts:14](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-replay/src/errors.ts#L14)

Discriminable reason of [RxDBReplayError](../classes/RxDBReplayError.md).

- `no_dom`: the current environment has no `document` (Node, Worker), so there is nothing to record from.
- `already_recording`: a session is already recording; `start()` does not stack a second one.
- `store_limit`: the total stored amount has reached `limits.storeBytes`, so starting a new session is refused; free space with `deleteSession()`.
- `recording_db_unavailable`: the recording database factory threw, or the database it returned cannot connect; `cause` is the original error, and the next call invokes the factory again.
- `session_not_found`: the given session id does not exist in the recording database.
- `session_recording`: the session to delete is still recording; call `stop()` first.
- `working_tree_unavailable`: `@aiao/rxdb-plugin-working-tree` is not installed, so there is no way to restore to a commit.
- `invalid_marker`: the event's tag is one of this plugin's markers, but the payload shape is wrong (data modified externally).
- `not_installed`: the plugin is not installed, or the connection epoch that installed it has been released.
