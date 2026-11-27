# @aiao/rxdb-plugin-replay

`@aiao/rxdb-plugin-replay` adds **session recording and replay** to `@aiao/rxdb`. It records page DOM changes with [rrweb](https://github.com/rrweb-io/rrweb) and writes events into a **separate recording database**. During replay, every working-tree commit is marked on the timeline; clicking a marker restores the working tree to that commit.

Its purpose is issue reproduction: when a user hits an error, bring back that recording together with the data state at the time.

## Core features

- **Off by default**: once installed, the plugin does nothing; the application explicitly calls `start()` to begin.
- **Separate recording database**: events go to another RxDB you provide through a factory; the recorded application database gains not a single row, and the working tree and sync never see the recordings.
- **Survives reloads**: after a page reload the session continues with the same id, and unflushed events are not lost.
- **Size limits**: per-session and total limits, both configurable; the plugin never deletes recordings on its own.
- **Masking by default**: inputs are recorded only as `*` of the same length; blocks marked `data-rxdb-replay-block` are recorded only as a placeholder.
- **Commit markers**: when `@aiao/rxdb-plugin-working-tree` is installed, every commit made while recording writes one marker, and replay can restore to it in one click.
- **Replay components for all three frameworks**: Angular `ao-replayer` / React `Replayer` / Vue `Replayer`, with matching inputs, events, and commands.

rrweb is pinned to the exact version `2.1.7`. The recording side loads with the plugin; the replay side loads `import('rrweb')` on demand the first time a replay view opens.

## Installation

```bash npm2yarn
npm install @aiao/rxdb-plugin-replay
# for commit markers and restore (optional peer)
npm install @aiao/rxdb-plugin-working-tree
# replay components (pick the one you need)
npm install @aiao/rxdb-plugin-replay-angular
npm install @aiao/rxdb-plugin-replay-react
npm install @aiao/rxdb-plugin-replay-vue
```

## Register the plugin

The plugin has exactly one required option: the recording database factory `createRecordingDb`. It receives the recording entities and returns **another RxDB** (whether or not it has been `init()`ed). Do not return the application database being recorded.

```typescript
import { RxDB, SyncType } from '@aiao/rxdb';
import { RxDBAdapterSqlite } from '@aiao/rxdb-adapter-sqlite-wasm';
import { rxDBPluginReplay } from '@aiao/rxdb-plugin-replay';

db.use(rxDBPluginReplay, {
  createRecordingDb: entities =>
    new RxDB({
      dbName: 'my-app-replay',
      entities: [...entities],
      multiInstance: false,
      sync: { local: { adapter: 'sqlite-wasm' }, type: SyncType.None }
    }).adapter('sqlite-wasm', async recordingDb => new RxDBAdapterSqlite(recordingDb, sqliteOptions)),
  limits: { sessionBytes: 16 * 1024 * 1024, storeBytes: 128 * 1024 * 1024 },
  flush: { intervalMs: 1000, maxEvents: 200 },
  record: { maskTextSelector: '.secret' }
});
await db.connect('sqlite-wasm');
```

The plugin declares `inject: ['adapter:local']`; the host installs it into the connection epoch only after the local adapter is ready. Calling `use()` after `connect()` also works, but installation is asynchronous: `await db.connect(...)` once more (connections are deduplicated, and the repeated call waits for the plugin to finish installing) before using `db.replay`. Before installation, every member except `state$` rejects with `not_installed`.

The factory is called once per connection epoch, at the first moment storage is needed. The plugin runs `connect()` for it (a database that was not `init()`ed is initialized by `connect()`), and calls `destroy()` when the scope is released. When the factory throws or the returned database fails to connect, the plugin throws `recording_db_unavailable`; the next call invokes the factory again.

| Option                | Default  | Description                                              |
| --------------------- | -------- | -------------------------------------------------------- |
| `createRecordingDb`   | Required | Recording database factory                               |
| `limits.sessionBytes` | 16 MiB   | Per-session limit                                        |
| `limits.storeBytes`   | 128 MiB  | Total recording database limit                           |
| `flush.intervalMs`    | 1000     | Event buffer flush interval                              |
| `flush.maxEvents`     | 200      | Flush early when the buffer reaches this many events     |
| `record`              | —        | A subset of rrweb recording options; see "Masking" below |

## Recording and reading

```typescript
const sessionId = await db.replay.start();
// …user actions…
await db.replay.stop();

db.replay.state$.subscribe(state => console.log(state.kind)); // idle / recording / truncated / error

const sessions = await db.replay.listSessions(); // startedAt descending: status, event count, size
const events = await db.replay.readEvents(sessionId); // pass { from, to } to read one range
const archive = await db.replay.exportSession(sessionId); // can be JSON.stringify-ed for archival
const { bytes, sessionCount, limits } = await db.replay.usage();
await db.replay.deleteSession(sessionId); // the only way to free space
```

Only one session can record at a time; a second `start()` throws `already_recording`. Environments without a DOM (Node, Worker) throw `no_dom`.

### Survives reloads

A recording session keeps its state in `sessionStorage`. When the plugin reinstalls after a page reload, it claims the stash, keeps writing to the same session id, and picks up events that were not flushed yet. When the stash is incomplete, a `gap` marker is written to say events may be missing here.

## Size limits

Size is counted as the UTF-8 bytes of `JSON.stringify`-ing the events.

- **Per-session limit exceeded**: that session stops recording, a `truncated` marker is written, and the session state becomes `truncated` (`truncatedCode: 'session_limit'`).
- **Total limit exceeded**: `start()` throws `store_limit` and no new session opens.

The plugin **never deletes** old recordings on its own. To free space, call `deleteSession()`.

## Masking

- `maskAllInputs` defaults to `true`: input values are recorded only as `*` of the same length.
- Add the `data-rxdb-replay-block` attribute (the `REPLAY_BLOCK_SELECTOR` constant) to an element, and the recording keeps only a same-size placeholder block; the text inside never enters the recording. This selector is always merged into the `record.blockSelector` you pass.
- `record` also passes through rrweb's `maskInputOptions`, `maskTextSelector`, `maskTextClass`, `blockSelector`, `blockClass`, and `ignoreSelector`; their meanings follow the rrweb documentation.

```html
<input type="password" />
<!-- recorded as ******** -->
<div data-rxdb-replay-block>ID number: …</div>
<!-- recorded as a same-size placeholder -->
```

## Commit markers and restore

When the recorded database has [`@aiao/rxdb-plugin-working-tree`](../rxdb-plugin-working-tree/README.md) installed, the plugin subscribes to the working tree facade's `commits$`. Every commit made while recording writes one commit marker (an rrweb Custom event with `tag` `rxdb-replay:commit`).

```typescript
import { replayRestoreHint } from '@aiao/rxdb-plugin-replay';

const markers = await db.replay.listCommitMarkers(sessionId); // { seq, timestamp, commitId, branchId }[]
const result = await db.replay.restoreToCommit(markers[0].commitId);
if (!result.ok) console.warn(replayRestoreHint(result.reason));
```

`restoreToCommit()` fetches fresh working-tree credentials each time, then calls `workingTree.restore()`. When refused, `reason` is one of the following; use `replayRestoreHint(reason)` for the hint text:

| `reason`              | Meaning                                                           |
| --------------------- | ----------------------------------------------------------------- |
| `conflict`            | The working tree changed during restore; retry                    |
| `dirty_working_tree`  | The working tree has uncommitted changes; commit or discard first |
| `incompatible_schema` | The target commit was written by an incompatible schema version   |
| `unreachable_target`  | The target commit is not on the current branch's history          |

Without the working-tree plugin, `restoreToCommit()` throws `working_tree_unavailable`.

## Replay

The framework-agnostic entry point is `mountReplayer(host, options)`. It mounts an rrweb replay iframe in `host`, play / pause buttons, a timeline (`aria-label="Timeline"`), and a commit marker list (`aria-label="Commits"`), and returns `play` / `pause` / `seek` / `update` / `destroy` handles. Clicking a commit marker first seeks to that moment, then calls `restoreToCommit()`; the result goes into a `role="status"` status line and to the caller through `onCommitRestore`.

The three framework components wrap the same replayer with symmetric APIs:

| Capability     | Angular `ao-replayer`                  | React `Replayer`      | Vue `Replayer`                 |
| -------------- | -------------------------------------- | --------------------- | ------------------------------ |
| Facade         | `[replay]`                             | `replay`              | `:replay`                      |
| Session        | `[sessionId]`                          | `sessionId`           | `:session-id`                  |
| Initial time   | `[initialTime]`                        | `initialTime`         | `:initial-time`                |
| Time change    | `(aoTimeChange)`                       | `onTimeChange`        | `@time-change`                 |
| Restore result | `(aoCommitRestore)`                    | `onCommitRestore`     | `@commit-restore`              |
| Commands       | Template ref `play` / `pause` / `seek` | `ref` (`ReplayerRef`) | Template `ref` (`ReplayerRef`) |

### Angular

```typescript
import { ReplayerComponent } from '@aiao/rxdb-plugin-replay-angular';

@Component({
  imports: [ReplayerComponent],
  template: `
    <ao-replayer #player [replay]="replay" [sessionId]="sessionId" (aoTimeChange)="time.set($event)" />
    <button (click)="player.play()" type="button">Play</button>
  `
})
export class SessionPlayer {
  readonly replay = inject(RxDB).replay;
  readonly sessionId = 'session-id';
  readonly time = signal(0);
}
```

### React

```tsx
import { Replayer, type ReplayerRef } from '@aiao/rxdb-plugin-replay-react';

export function SessionPlayer({ replay, sessionId }: { replay: ReplayManager; sessionId: string }) {
  const player = useRef<ReplayerRef>(null);
  return (
    <>
      <Replayer ref={player} replay={replay} sessionId={sessionId} onTimeChange={console.log} />
      <button onClick={() => player.current?.play()}>Play</button>
    </>
  );
}
```

### Vue

```vue
<script lang="ts" setup>
import { Replayer, type ReplayerRef } from '@aiao/rxdb-plugin-replay-vue';

defineProps<{ replay: ReplayManager; sessionId: string }>();
const player = useTemplateRef<ReplayerRef>('player');
</script>

<template>
  <Replayer :replay="replay" :session-id="sessionId" @time-change="console.log" ref="player" />
  <button @click="player?.play()" type="button">Play</button>
</template>
```

## Errors

Business errors are uniformly thrown as `RxDBReplayError`; branch on `code`, never match `message`:

| `code`                     | When                                                                               |
| -------------------------- | ---------------------------------------------------------------------------------- |
| `not_installed`            | The plugin is not yet installed in the connection epoch, or the epoch was released |
| `no_dom`                   | `start()` in an environment without a DOM                                          |
| `already_recording`        | `start()` while already recording                                                  |
| `store_limit`              | Total recording database limit exceeded; new sessions refused                      |
| `recording_db_unavailable` | The recording database factory threw, or the returned database failed to connect   |
| `session_not_found`        | The session does not exist                                                         |
| `session_recording`        | Deleting a session that is recording                                               |
| `working_tree_unavailable` | `restoreToCommit()` without the working-tree plugin                                |
| `invalid_marker`           | A marker event's payload has the wrong shape (data altered externally)             |

## Example

`apps/dev-rxdb-angular` includes an off-by-default demo: the recording module and rrweb only load after you enable the recording toggle on the `/replay` page and reload. The recording database is `<dbName>-replay` on main-thread IDB.
