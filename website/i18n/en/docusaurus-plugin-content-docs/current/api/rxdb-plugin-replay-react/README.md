# rxdb-plugin-replay-react

The React integration layer for [`@aiao/rxdb-plugin-replay`](../rxdb-plugin-replay/README.md). Provides the `Replayer` component, which wraps the core package's `mountReplayer` into props and a `ref` handle.

## Installation

```bash
pnpm add @aiao/rxdb @aiao/rxdb-plugin-replay @aiao/rxdb-plugin-replay-react react rxjs
```

## Usage

```tsx
import type { ReplayManager } from '@aiao/rxdb-plugin-replay';
import {
  Replayer,
  replayRestoreHint,
  type ReplayerCommitRestoreEvent,
  type ReplayerRef
} from '@aiao/rxdb-plugin-replay-react';
import { useRef, useState } from 'react';

const restoreMessage = ({ result }: ReplayerCommitRestoreEvent): string | null => {
  if (result.ok) return null;
  return result.reason === 'error' ? result.error.message : replayRestoreHint(result.reason);
};

export function SessionPlayer({ replay, sessionId }: { readonly replay: ReplayManager; readonly sessionId: string }) {
  const replayer = useRef<ReplayerRef>(null);
  const [time, setTime] = useState(0);
  const [hint, setHint] = useState<string | null>(null);

  return (
    <section>
      <Replayer
        ref={replayer}
        replay={replay}
        sessionId={sessionId}
        initialTime={0}
        onTimeChange={setTime}
        onCommitRestore={event => setHint(restoreMessage(event))}
      />
      <button onClick={() => replayer.current?.play()} type="button">
        Play
      </button>
      <button onClick={() => replayer.current?.pause()} type="button">
        Pause
      </button>
      <p>{time} ms</p>
      `{hint && <p role="alert">{hint}</p>}`
    </section>
  );
}
```

Pass `db.replay` as `replay`. The recording plugin must be installed into the connection epoch first (`db.use(rxDBPluginReplay, …)` then `await db.connect()`), otherwise the component gets `not_installed` when loading the session.

| Member                            | Description                                                                                                         |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `replay` (required)               | `ReplayManager`; switching to a different facade reloads                                                            |
| `sessionId` (required)            | The session to replay                                                                                                |
| `initialTime`                     | The moment to land on after loading completes (ms relative to the session start, default 0); changing it afterwards is equivalent to `seek()` |
| `onTimeChange`                    | Receives the current time (ms) during playback / timeline scrubbing                                                  |
| `onCommitRestore`                 | The result of restoring the working tree after clicking a commit marker; on rejection use `replayRestoreHint(reason)` for the hint; when `reason` is `'error'`, look at `error` |
| `play()` / `pause()` / `seek(ms)` | Called via `ref` (`ReplayerRef`); calls before loading completes are no-ops (`seek` records the target time)         |

The replayer is automatically released when the component unmounts. The rrweb playback side is only lazily `import('rrweb')`ed when the component first loads a session.

Symmetric functionality across the three frameworks: Angular uses `ao-replayer` ([`@aiao/rxdb-plugin-replay-angular`](../rxdb-plugin-replay-angular/README.md)), Vue uses `Replayer` ([`@aiao/rxdb-plugin-replay-vue`](../rxdb-plugin-replay-vue/README.md)).

## Documentation

- Repository home: [https://github.com/aiao-io/rxdb](https://github.com/aiao-io/rxdb)
- See the project documentation site for the plugin guide

## License

[MIT](https://github.com/aiao-io/rxdb/blob/main/LICENSE)

rxdb-plugin-replay-react - React session replay component

Provides [Replayer](variables/Replayer.md), which wraps `@aiao/rxdb-plugin-replay`'s `mountReplayer` into a component with props / `ref` handles.
Same set of inputs / outputs / commands as Angular `ao-replayer` and Vue `Replayer` (contracts/replayer-component.md §3).

## Interfaces

| Interface | Description |
| ------ | ------ |
| [ReplayerCommitRestoreEvent](interfaces/ReplayerCommitRestoreEvent.md) | The result of restoring after clicking a commit marker; `reason` is `'error'` when `restoreToCommit()` threw. |
| [ReplayerProps](interfaces/ReplayerProps.md) | The props of [Replayer](variables/Replayer.md): inputs share names with `mountReplayer`, and the two callbacks correspond to the core view's `onTimeChange` / `onCommitRestore`. |

## Type Aliases

| Type Alias | Description |
| ------ | ------ |
| [ReplayerRef](type-aliases/ReplayerRef.md) | The command handle obtained via `ref`; calls before loading completes are no-ops (`seek` records the target time). |

## Variables

| Variable | Description |
| ------ | ------ |
| [Replayer](variables/Replayer.md) | The session replay component: mounts core's `mountReplayer` in a `div`, routes input changes through `update()`, and calls `destroy()` on unmount. |
| [replayRestoreHint](variables/replayRestoreHint.md) | A one-line English hint shown to the user when `restoreToCommit()` is rejected (`git show 2e820521:specs/005-us-909-session-replay/research.md` D8). |
