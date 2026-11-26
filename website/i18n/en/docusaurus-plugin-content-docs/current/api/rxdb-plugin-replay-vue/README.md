# rxdb-plugin-replay-vue

The Vue integration layer for [`@aiao/rxdb-plugin-replay`](../rxdb-plugin-replay/README.md). Provides the `Replayer` component, which wraps the core package's `mountReplayer` into props / emits / `expose` commands.

## Installation

```bash
pnpm add @aiao/rxdb @aiao/rxdb-plugin-replay @aiao/rxdb-plugin-replay-vue vue rxjs
```

## Usage

```vue
<script lang="ts" setup>
import type { ReplayManager } from '@aiao/rxdb-plugin-replay';
import {
  Replayer,
  replayRestoreHint,
  type ReplayerCommitRestoreEvent,
  type ReplayerRef
} from '@aiao/rxdb-plugin-replay-vue';
import { ref, useTemplateRef } from 'vue';

defineProps<{ replay: ReplayManager; sessionId: string }>();

const replayer = useTemplateRef<ReplayerRef>('replayer');
const time = ref(0);
const hint = ref<string | null>(null);

function onRestore({ result }: ReplayerCommitRestoreEvent): void {
  if (result.ok) hint.value = null;
  else hint.value = result.reason === 'error' ? result.error.message : replayRestoreHint(result.reason);
}
</script>

<template>
  <Replayer
    :initial-time="0"
    :replay="replay"
    :session-id="sessionId"
    @commit-restore="onRestore"
    @time-change="time = $event"
    ref="replayer"
  />
  <button @click="replayer?.play()" type="button">Play</button>
  <button @click="replayer?.pause()" type="button">Pause</button>
  <p>{{ time }} ms</p>
  <p v-if="hint" role="alert">{{ hint }}</p>
</template>
```

Pass `db.replay` as `replay`. The recording plugin must be installed into the connection epoch first (`db.use(rxDBPluginReplay, …)` then `await db.connect()`), otherwise the component gets `not_installed` when loading the session.

| Member                            | Description                                                                                                         |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `replay` (required)               | `ReplayManager`; switching to a different facade reloads                                                            |
| `sessionId` (required)            | The session to replay                                                                                                |
| `initialTime`                     | The moment to land on after loading completes (ms relative to the session start, default 0); changing it afterwards is equivalent to `seek()` |
| `time-change`                     | Emits the current time (ms) during playback / timeline scrubbing                                                     |
| `commit-restore`                  | The result of restoring the working tree after clicking a commit marker; on rejection use `replayRestoreHint(reason)` for the hint; when `reason` is `'error'`, look at `error` |
| `play()` / `pause()` / `seek(ms)` | Called via the template `ref` (`ReplayerRef`); calls before loading completes are no-ops (`seek` records the target time) |

The replayer is automatically released when the component unmounts. The rrweb playback side is only lazily `import('rrweb')`ed when the component first loads a session.

Symmetric functionality across the three frameworks: Angular uses `ao-replayer` ([`@aiao/rxdb-plugin-replay-angular`](../rxdb-plugin-replay-angular/README.md)), React uses `Replayer` ([`@aiao/rxdb-plugin-replay-react`](../rxdb-plugin-replay-react/README.md)).

## Documentation

- Repository home: [https://github.com/aiao-io/rxdb](https://github.com/aiao-io/rxdb)
- See the project documentation site for the plugin guide

## License

[MIT](https://github.com/aiao-io/rxdb/blob/main/LICENSE)

rxdb-plugin-replay-vue - Vue session replay component

Provides [Replayer](variables/Replayer.md), which wraps `@aiao/rxdb-plugin-replay`'s `mountReplayer` into a component with props / emits / `expose`.
Same set of inputs / outputs / commands as Angular `ao-replayer` and React `Replayer` (contracts/replayer-component.md §3).

## Interfaces

| Interface | Description |
| ------ | ------ |
| [ReplayerCommitRestoreEvent](interfaces/ReplayerCommitRestoreEvent.md) | The result of restoring after clicking a commit marker; `reason` is `'error'` when `restoreToCommit()` threw. |

## Type Aliases

| Type Alias | Description |
| ------ | ------ |
| [ReplayerRef](type-aliases/ReplayerRef.md) | The commands obtained via the template `ref` (`expose`); calls before loading completes are no-ops (`seek` records the target time). |

## Variables

| Variable | Description |
| ------ | ------ |
| [Replayer](variables/Replayer.md) | The session replay component: mounts core's `mountReplayer` on the root `div`, routes prop changes through `update()`, and calls `destroy()` before unmounting. |
| [replayRestoreHint](variables/replayRestoreHint.md) | A one-line English hint shown to the user when `restoreToCommit()` is rejected (`git show 2e820521:specs/005-us-909-session-replay/research.md` D8). |
