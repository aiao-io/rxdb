# rxdb-plugin-replay-angular

The Angular integration layer for [`@aiao/rxdb-plugin-replay`](../rxdb-plugin-replay/README.md). Provides `ao-replayer` (`ReplayerComponent`), a standalone component that wraps the core package's `mountReplayer` into signal inputs / `output`s.

## Installation

```bash
pnpm add @aiao/rxdb @aiao/rxdb-plugin-replay @aiao/rxdb-plugin-replay-angular @angular/core rxjs
```

## Usage

```typescript
import type { ReplayManager } from '@aiao/rxdb-plugin-replay';
import {
  ReplayerComponent,
  replayRestoreHint,
  type ReplayerCommitRestoreEvent
} from '@aiao/rxdb-plugin-replay-angular';
import { Component, input, signal } from '@angular/core';

@Component({
  selector: 'app-session-player',
  imports: [ReplayerComponent],
  template: `
    <ao-replayer
      #replayer
      [initialTime]="0"
      [replay]="replay()"
      [sessionId]="sessionId()"
      (aoCommitRestore)="onRestore($event)"
      (aoTimeChange)="time.set($event)"
    />
    <button (click)="replayer.play()" type="button">Play</button>
    <button (click)="replayer.pause()" type="button">Pause</button>
    <p>{{ time() }} ms</p>
    @if (hint(); as hint) {
      <p role="alert">{{ hint }}</p>
    }
  `
})
export class SessionPlayer {
  readonly replay = input.required<ReplayManager>();
  readonly sessionId = input.required<string>();
  readonly time = signal(0);
  readonly hint = signal<string | null>(null);

  onRestore({ result }: ReplayerCommitRestoreEvent): void {
    if (result.ok) this.hint.set(null);
    else this.hint.set(result.reason === 'error' ? result.error.message : replayRestoreHint(result.reason));
  }
}
```

Pass `db.replay` as `replay`. The recording plugin must be installed into the connection epoch first (`db.use(rxDBPluginReplay, …)` then `await db.connect()`), otherwise the component gets `not_installed` when loading the session.

| Member                            | Description                                                                                                         |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `replay` (required)               | `ReplayManager`; switching to a different facade reloads                                                            |
| `sessionId` (required)            | The session to replay                                                                                                |
| `initialTime`                     | The moment to land on after loading completes (ms relative to the session start, default 0); changing it afterwards is equivalent to `seek()` |
| `aoTimeChange`                    | Emits the current time (ms) during playback / timeline scrubbing                                                     |
| `aoCommitRestore`                 | The result of restoring the working tree after clicking a commit marker; on rejection use `replayRestoreHint(reason)` for the hint; when `reason` is `'error'`, look at `error` |
| `play()` / `pause()` / `seek(ms)` | Called via a template reference; calls before loading completes are no-ops (`seek` records the target time)         |

The replayer is automatically released when the component is destroyed. The rrweb playback side is only lazily `import('rrweb')`ed when the component first loads a session.

Symmetric functionality across the three frameworks: React uses `Replayer` ([`@aiao/rxdb-plugin-replay-react`](../rxdb-plugin-replay-react/README.md)), Vue uses `Replayer` ([`@aiao/rxdb-plugin-replay-vue`](../rxdb-plugin-replay-vue/README.md)).

## Documentation

- Repository home: [https://github.com/aiao-io/rxdb](https://github.com/aiao-io/rxdb)
- See the project documentation site for the plugin guide

## License

[MIT](https://github.com/aiao-io/rxdb/blob/main/LICENSE)

rxdb-plugin-replay-angular - Angular session replay component

Provides `ao-replayer` ([ReplayerComponent](classes/ReplayerComponent.md)), which wraps `@aiao/rxdb-plugin-replay`'s `mountReplayer` into a component with signal inputs / `output`s.
Same set of inputs / outputs / commands as the React / Vue `Replayer` (contracts/replayer-component.md §3).

## Classes

| Class | Description |
| ------ | ------ |
| [ReplayerComponent](classes/ReplayerComponent.md) | The session replay component: mounts core's `mountReplayer` on a `div` inside the component, routes input changes through `update()`, and calls `destroy()` on destruction. |

## Interfaces

| Interface | Description |
| ------ | ------ |
| [ReplayerCommitRestoreEvent](interfaces/ReplayerCommitRestoreEvent.md) | The result of restoring after clicking a commit marker; `reason` is `'error'` when `restoreToCommit()` threw. |

## Variables

| Variable | Description |
| ------ | ------ |
| [replayRestoreHint](variables/replayRestoreHint.md) | A one-line English hint shown to the user when `restoreToCommit()` is rejected (`git show 2e820521:specs/005-us-909-session-replay/research.md` D8). |
