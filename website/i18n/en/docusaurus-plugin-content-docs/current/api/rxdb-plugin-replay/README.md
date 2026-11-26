# rxdb-plugin-replay

Session recording and replay plugin for `@aiao/rxdb`. **Does not record by default** — the application starts it explicitly. It uses rrweb to record the page DOM, and events are written into a **separate recording database**, so the recorded application database gains no extra data. Working tree commits are marked on the replay timeline; clicking a marker restores the working tree to that commit.

rrweb is pinned to the exact version `2.2.0`. The replay component loads `import('rrweb')` on demand, so the rrweb player is not loaded until the replay view is opened.

## Installation

```bash
pnpm add @aiao/rxdb @aiao/rxdb-plugin-replay rxjs
# Also install when commit markers and restore are needed (optional peer)
pnpm add @aiao/rxdb-plugin-working-tree
```

## Usage

```typescript
import { RxDB, SyncType } from '@aiao/rxdb';
import { RxDBAdapterSqlite } from '@aiao/rxdb-adapter-sqlite-wasm';
import { rxDBPluginReplay } from '@aiao/rxdb-plugin-replay';

// Recording database factory: return a different RxDB, not the recorded application database
const createRecordingDb = entities =>
  new RxDB({
    dbName: 'my-app-replay',
    entities: [...entities],
    multiInstance: false,
    sync: `{ local: { adapter: 'sqlite-wasm' }, type: SyncType.None }`
  }).adapter('sqlite-wasm', async db => new RxDBAdapterSqlite(db, sqliteOptions));

db.use(rxDBPluginReplay, {
  createRecordingDb,
  limits: { sessionBytes: 16 * 1024 * 1024, storeBytes: 128 * 1024 * 1024 },
  record: `{ maskTextSelector: '.secret' }`
});
await db.connect('sqlite-wasm');

const sessionId = await db.replay.start();
// …user interaction…
await db.replay.stop();

const sessions = await db.replay.listSessions(); // status / event count / size
const events = await db.replay.readEvents(sessionId);
```

The recording database factory is called only once per connection epoch, the first time storage is needed. If the returned database has not been `init()`ed yet, the plugin first calls `init()` on its behalf, then `connect()`, and `destroy()`s it together when the scope is released. When the factory throws or the returned database cannot connect, the plugin throws `RxDBReplayError('recording_db_unavailable')`, and the next call invokes the factory again.

`db.replay` is the `ReplayManager`, with the following members:

- Recording: `state$`, `start()`, `stop()`
- Reading: `listSessions()`, `readEvents(id, range?)`, `listCommitMarkers(id)`, `exportSession(id)`
- Storage: `deleteSession(id)`, `usage()`
- Restore: `restoreToCommit(commitId)`

On page refresh, the recording session is continued with the same id via temporary storage in `sessionStorage`: events that have not been flushed yet are not lost, and a `gap` marker is written when the temporary storage is incomplete.

## Size limits

Limits are measured in UTF-8 bytes of the `JSON.stringify`ed events; both are configurable:

| Option                  | Default  | When exceeded                                                                     |
| ----------------------- | -------- | --------------------------------------------------------------------------------- |
| `limits.sessionBytes` | 16 MiB  | That session stops recording, a `truncated` marker (`session_limit`) is written, and the session status becomes `truncated` |
| `limits.storeBytes`   | 128 MiB | `start()` throws `RxDBReplayError('store_limit')`                                 |

The plugin **never automatically deletes** old recordings; the only way to free space is to call `deleteSession()`.

## Masking

- `maskAllInputs` defaults to `true`, so values in input fields are recorded only as `*` of the same length.
- Add the `data-rxdb-replay-block` attribute (`REPLAY_BLOCK_SELECTOR`) to an element and only a same-size placeholder block remains in the recording. This selector is always merged into the `record.blockSelector` you pass.
- `record` passes through rrweb's `maskInputOptions` / `maskTextSelector` / `maskTextClass` / `blockSelector` / `blockClass` / `ignoreSelector`; their meaning follows the rrweb documentation.

## Commit markers and restore

When the recorded database has `@aiao/rxdb-plugin-working-tree` installed, every commit during recording writes a `commit` marker (an rrweb Custom event with `tag` `rxdb-replay:commit`). The marker comes from the working tree facade's `commits$`.

`restoreToCommit(commitId)` fetches the working tree credentials fresh on every call, then calls `workingTree.restore()`. When rejected, use `replayRestoreHint(reason)` for the hint text; possible `reason` values:

- `conflict`
- `dirty_working_tree`
- `incompatible_schema`
- `unreachable_target`

When the working tree plugin is not installed, `working_tree_unavailable` is thrown.

## Replay

`mountReplayer(host, { replay, sessionId, initialTime, onTimeChange, onCommitRestore })` mounts the following inside `host`:

- the rrweb replay iframe
- play / pause buttons
- the timeline
- the commit marker list

It returns `play` / `pause` / `seek` / `update` / `destroy` handles. The three framework wrappers have symmetric APIs:

- Angular: [`@aiao/rxdb-plugin-replay-angular`](../rxdb-plugin-replay-angular/README.md)
- React: [`@aiao/rxdb-plugin-replay-react`](../rxdb-plugin-replay-react/README.md)
- Vue: [`@aiao/rxdb-plugin-replay-vue`](../rxdb-plugin-replay-vue/README.md)

## Errors

All business errors of the plugin throw `RxDBReplayError`; branch on `code`, do not match `message`. Possible `code` values:

- `no_dom`
- `already_recording`
- `store_limit`
- `recording_db_unavailable`
- `session_not_found`
- `session_recording`
- `working_tree_unavailable`
- `invalid_marker`
- `not_installed`

## Testing

Run the following commands at the repository root; pnpm's preinstall gate requires Node 26.

### In-package tests

```bash
pnpm nx test rxdb-plugin-replay                                 # node environment: limits, session continuation, commit markers, restore, option validation, three-framework parity contract
pnpm nx run rxdb-plugin-replay:test-browser                     # real chromium: *.browser.spec.ts (rrweb record / replay, masking)
REPLAY_BENCH=1 pnpm nx test rxdb-plugin-replay -- store.bench   # write benchmark, median < 100 ms; not run by default
```

`test` only runs the node environment; `*.browser.spec.ts` only runs under `test-browser`: if you changed recording, replay, or masking, remember to run the latter.

### Manual verification in the demo

1. `pnpm nx serve dev-rxdb-angular`, open `http://localhost:4200/replay`, turn on the recording switch (the page reloads).
2. Create two Todos in `/todo`, commit each once, return to `/replay` and stop recording.
3. Click "Replay" in the session list: the timeline can be dragged, and the two commit markers are ordered by commit time.
4. Click the first marker: replay jumps to the moment of the first commit, the status area shows `Restored …`, and the working tree on `/working-tree` becomes dirty.
5. Type in the input of the "masking demo" and replay: the input only shows `*` of the same length, and the `data-rxdb-replay-block` area only shows the placeholder block.
6. Reload after turning the switch off: no `rrweb` or `rxdb-plugin-replay` chunks appear in DevTools Network, and no new `*-replay` database is created in IndexedDB.

### Demo e2e

```bash
pnpm nx e2e dev-rxdb-angular-e2e -- replay.spec
```

`apps/dev-rxdb-angular-e2e/src/replay.spec.ts` covers: continuing the same session after refresh, recording not entering the application database, commit markers and restore, input masking and block placeholder.

### Relation to e2e failure artifacts

Angular e2e does not turn recording on by default, so the artifacts left by a failed e2e run contain **no** rrweb recording:

| Artifact                                      | When produced                                              | How to view                                                       |
| --------------------------------------------- | ---------------------------------------------------------- | ----------------------------------------------------------------- |
| Playwright trace (`trace.zip`)                | Kept on failed cases, not kept on passing cases            | `npx playwright show-trace <trace.zip>`, or click Trace in the HTML report |
| Data archive (attachment `rxdb-failure-archive`) | Exported automatically when a case fails; `failure-archive.spec.ts` exports it proactively | Import on the demo's `/failure-archive` page                     |

Both live under `apps/dev-rxdb-angular-e2e/test-output/playwright/`: traces in `output/<case>/`, attachments in `report/data/*.bin` (starting with `RXDBBAK`). Open the report with
`npx playwright show-report apps/dev-rxdb-angular-e2e/test-output/playwright/report` to see which case each attachment belongs to. Every e2e run overwrites this directory.

Verification on the import page (`http://localhost:4200/failure-archive`; the `data-phase` of the page root node reflects the state):

| Scenario      | Action                                          | Expected                                                    |
| ------------- | ----------------------------------------------- | ----------------------------------------------------------- |
| Parse         | Select an archive file                          | `idle` → `parsed`, showing database name, creation time, format version |
| Import        | Click "Import and open"                         | after `importing` the whole page reloads, and an imported-database banner appears at the top |
| Invalid file  | Select a non-archive file                       | `error`, showing the error code, no "Open this database"    |
| Duplicate import | Import the same archive again after "Back to default database" | `target_not_empty`, "Open this database" opens the previously imported database |
| Target busy   | Import again while the imported database is open in another tab | `target_busy`, likewise offering "Open this database"       |

- The archive restores to the **original database name**: importing in the same browser profile that produced the archive hits `target_not_empty` directly, so for manual testing use an incognito window or another profile.
- After import the application keeps the imported database open (localStorage key `rxdb-demo-imported-db-name`); click "Back to default database" on the banner to restore.
- You can likewise turn on the `/replay` recording switch on the imported database and record your own reproduction; commit markers keep working with the working tree as usual.

To see a complete failure scene, temporarily make an Angular e2e case fail (for example assert a test id that does not exist); after the run, the same case has both the
trace, `rxdb-failure-archive` and `rxdb-failure-summary`: look at the trace first to understand "what happened", then import the archive to see "the state of the data at the time".

## Documentation

- Repository home: [https://github.com/aiao-io/rxdb](https://github.com/aiao-io/rxdb)
- See the project documentation site for the plugin guide

## License

[MIT](https://github.com/aiao-io/rxdb/blob/main/LICENSE)

## Classes

| Class | Description |
| ------ | ------ |
| [ReplayEventRecord](classes/ReplayEventRecord.md) | One rrweb event (table `replay_event`), existing only in the recording database. |
| [ReplaySessionRecord](classes/ReplaySessionRecord.md) | A recording session (table `replay_session`), existing only in the recording database. |
| [RxDBPluginReplay](classes/RxDBPluginReplay.md) | Main class of `@aiao/rxdb-plugin-replay`: creates one ReplayRuntime per connection epoch, and stops recording and destroys the recording database when the epoch is released. |
| [RxDBReplayError](classes/RxDBReplayError.md) | All business errors thrown by `@aiao/rxdb-plugin-replay`. |

## Interfaces

| Interface | Description |
| ------ | ------ |
| [ReplayCommitMarker](interfaces/ReplayCommitMarker.md) | A commit marker in the recording (`listCommitMarkers()`). |
| [ReplayerCommitRestoreEvent](interfaces/ReplayerCommitRestoreEvent.md) | Result of clicking a commit marker to restore; `reason` is `'error'` when `restoreToCommit()` throws. |
| [ReplayerHandle](interfaces/ReplayerHandle.md) | Handle returned by [mountReplayer](functions/mountReplayer.md). In the non-ready state `play` / `pause` / `seek` are no-ops, and everything is a no-op after `destroy()`. |
| [ReplayerOptions](interfaces/ReplayerOptions.md) | Input of the replayer (`git show 2e820521:specs/005-us-909-session-replay/contracts/replayer-component.md` §1). |
| [ReplayEventRange](interfaces/ReplayEventRange.md) | Time range of `readEvents()` (closed interval, epoch ms). |
| [ReplayManager](interfaces/ReplayManager.md) | Recording/replay entry point (`rxdb.replay`). |
| [ReplayMarkerPayloads](interfaces/ReplayMarkerPayloads.md) | Payload shape of each marker tag. |
| [ReplaySessionExport](interfaces/ReplaySessionExport.md) | Result of `exportSession()`: session summary + all events ordered by `seq`. |
| [ReplaySessionInfo](interfaces/ReplaySessionInfo.md) | Summary of one recording session (`listSessions()` / `exportSession()`). |
| [ReplayUsage](interfaces/ReplayUsage.md) | Recording database usage (`usage()`). |
| [ResolvedReplayOptions](interfaces/ResolvedReplayOptions.md) | Options with defaults filled in and validated. |
| [RxDBReplayOptions](interfaces/RxDBReplayOptions.md) | Options of `rxdb.use(rxDBPluginReplay, options)`. |

## Type Aliases

| Type Alias | Description |
| ------ | ------ |
| [ReplayMarker](type-aliases/ReplayMarker.md) | Result of [parseReplayMarker](functions/parseReplayMarker.md). |
| [ReplayMarkerTag](type-aliases/ReplayMarkerTag.md) | Marker tags of this plugin. |
| [ReplayRecordingDbFactory](type-aliases/ReplayRecordingDbFactory.md) | Recording database factory: receives this plugin's entity list and returns a **separate** `RxDB` (not the recorded application database). |
| [ReplayRestoreRejection](type-aliases/ReplayRestoreRejection.md) | The four reasons `restoreToCommit()` is rejected (same values as the working tree `restore()` `reason`). |
| [ReplayRestoreResult](type-aliases/ReplayRestoreResult.md) | Result of `restoreToCommit()`: the part of the working tree `restore()` result that replay uses. |
| [ReplaySessionStatus](type-aliases/ReplaySessionStatus.md) | Status of a session row: recording → stopped / truncated (terminal states). |
| [ReplayState](type-aliases/ReplayState.md) | Value of `rxdb.replay.state$`. |
| [ReplayTruncatedCode](type-aliases/ReplayTruncatedCode.md) | Reason a session was truncated: single-session limit or total recording database limit. |
| [RxDBReplayErrorCode](type-aliases/RxDBReplayErrorCode.md) | Discriminable reason of [RxDBReplayError](classes/RxDBReplayError.md). |
| [RxDBReplayRecordOptions](type-aliases/RxDBReplayRecordOptions.md) | Subset of masking / blocking options passed through to rrweb `record()`; their meaning follows the rrweb documentation. |

## Variables

| Variable | Description |
| ------ | ------ |
| [REPLAY\_BLOCK\_SELECTOR](variables/REPLAY_BLOCK_SELECTOR.md) | Selector always merged into `record.blockSelector`: add the `data-rxdb-replay-block` attribute to an element and only a same-size placeholder block remains in the recording. Applications can mark sensitive areas without understanding rrweb. |
| [REPLAY\_ENTITIES](variables/REPLAY_ENTITIES.md) | All entities the recording database needs; this is the set the `createRecordingDb` factory receives, to pass as-is to `new RxDB({ entities })`. |
| [REPLAY\_MARKER\_TAGS](variables/REPLAY_MARKER_TAGS.md) | The three marker tags this plugin writes into the recording. |
| [rxDBPluginReplay](variables/rxDBPluginReplay.md) | Recording/replay plugin factory: `rxdb.use(rxDBPluginReplay, { createRecordingDb })`. |

## Functions

| Function | Description |
| ------ | ------ |
| [mountReplayer](functions/mountReplayer.md) | Renders the replayer for one session inside `host`: rrweb replay, play / pause, timeline, commit markers (click restores the working tree) and restore results. |
| [parseReplayMarker](functions/parseReplayMarker.md) | Parses an rrweb event into a marker of this plugin. |
| [replayRestoreHint](functions/replayRestoreHint.md) | One-line English hint shown to the user when `restoreToCommit()` is rejected (`git show 2e820521:specs/005-us-909-session-replay/research.md` D8). |
