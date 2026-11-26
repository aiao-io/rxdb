# replayRestoreHint()

```ts
function replayRestoreHint(reason): string;
```

Defined in: [packages/rxdb-plugin-replay/src/restore.ts:27](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-replay/src/restore.ts#L27)

One-line English hint shown to the user when `restoreToCommit()` is rejected (`git show 2e820521:specs/005-us-909-session-replay/research.md` D8).

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `reason` | [`ReplayRestoreRejection`](../type-aliases/ReplayRestoreRejection.md) | The `reason` of `ReplayRestoreResult` |

## Returns

`string`
