# mountReplayer()

```ts
function mountReplayer(host, options): ReplayerHandle;
```

Defined in: [packages/rxdb-plugin-replay/src/replayer/mount-replayer.ts:336](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-replay/src/replayer/mount-replayer.ts#L336)

Renders the replayer for one session inside `host`: rrweb replay, play / pause, timeline, commit markers (click restores the working tree) and restore results.

## Parameters

| Parameter | Type                                                  | Description                                                         |
| --------- | ----------------------------------------------------- | ------------------------------------------------------------------- |
| `host`    | `HTMLElement`                                         | Element the replayer mounts into; existing child nodes are replaced |
| `options` | [`ReplayerOptions`](../interfaces/ReplayerOptions.md) | Session source and callbacks                                        |

## Returns

[`ReplayerHandle`](../interfaces/ReplayerHandle.md)

Command handle; call `destroy()` when unmounting

## Remarks

See `git show 2e820521:specs/005-us-909-session-replay/contracts/replayer-component.md` §2 for the DOM and the four states (`loading` / `empty` / `error` / `ready`);
the `Replayer` components of the three frameworks just hand their host element to it. `rrweb` is imported dynamically only at load time.

## Example

```ts
const handle = mountReplayer(element, { replay: rxdb.replay, sessionId });
handle.seek(5_000);
handle.destroy();
```
