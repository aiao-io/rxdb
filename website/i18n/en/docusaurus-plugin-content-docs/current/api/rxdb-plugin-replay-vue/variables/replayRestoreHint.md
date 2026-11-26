# replayRestoreHint

```ts
const replayRestoreHint: (reason) => string;
```

Defined in: rxdb-plugin-replay/dist/restore.d.ts:15

A one-line English hint shown to the user when `restoreToCommit()` is rejected (`git show 2e820521:specs/005-us-909-session-replay/research.md` D8).

## Parameters

| Parameter | Type                                                                                        | Description                           |
| --------- | ------------------------------------------------------------------------------------------- | ------------------------------------- |
| `reason`  | [`ReplayRestoreRejection`](../../rxdb-plugin-replay/type-aliases/ReplayRestoreRejection.md) | The `reason` of `ReplayRestoreResult` |

## Returns

`string`
