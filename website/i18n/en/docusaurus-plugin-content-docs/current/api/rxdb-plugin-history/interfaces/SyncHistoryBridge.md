# SyncHistoryBridge

Defined in: [packages/rxdb-plugin-history/src/sync-history-bridge.ts:33](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-history/src/sync-history-bridge.ts#L33)

**`Internal`**

The history-side capabilities visible to the sync plugin.

## Remarks

Provided by `VersionManager.syncBridge` and taken over by `SyncManager` at construction.

## Properties

### pushInFlight \{#pushinflight\}

```ts
readonly pushInFlight: PushInFlightRegistry;
```

Defined in: [packages/rxdb-plugin-history/src/sync-history-bridge.ts:42](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-history/src/sync-history-bridge.ts#L42)

The registry of "which changes are currently flying to the remote".

#### Remarks

The only meeting point of push and undo, owned by [VersionManager](VersionManager.md) — the undo side reads it via
`rxdb.versionManager.pushInFlight`, the push side claims ranges via this bridge.
Both sides must read the same instance; see [PushInFlightRegistry](../classes/PushInFlightRegistry.md).

## Methods

### beginPullableSettlement() \{#beginpullablesettlement\}

```ts
beginPullableSettlement(): number;
```

Defined in: [packages/rxdb-plugin-history/src/sync-history-bridge.ts:72](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-history/src/sync-history-bridge.ts#L72)

Issues a settlement token before a pull begins.

#### Returns

`number`

The token, handed back to [settlePull](#settlepull) / [settleAbortedPull](#settleabortedpull) /
[reconcilePullableCount](#reconcilepullablecount)

#### Remarks

Must be taken **before** the pull is actually initiated: remote events arriving during the pull describe new changes after the snapshot,
and the settlement must be able to tell them apart — otherwise the "fully synced" reset would swallow them along with everything else.

***

### captureUndoHistory() \{#captureundohistory\}

```ts
captureUndoHistory(branchId): () => void;
```

Defined in: [packages/rxdb-plugin-history/src/sync-history-bridge.ts:60](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-history/src/sync-history-bridge.ts#L60)

Captures the source branch's current undo session; the callback invalidates only that generation's session, even after re-mounting.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `branchId` | `string` | The source branch being read for sync |

#### Returns

The invalidation callback of the source branch

() => `void`

***

### clearUndoHistory() \{#clearundohistory\}

```ts
clearUndoHistory(): void;
```

Defined in: [packages/rxdb-plugin-history/src/sync-history-bridge.ts:52](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-history/src/sync-history-bridge.ts#L52)

Clears the current branch's undo/redo after merging with the remote — the pre-merge content can no longer be undone

#### Returns

`void`

***

### incrementPullableCount() \{#incrementpullablecount\}

```ts
incrementPullableCount(count): void;
```

Defined in: [packages/rxdb-plugin-history/src/sync-history-bridge.ts:107](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-history/src/sync-history-bridge.ts#L107)

Accumulates the pullable count when remote events arrive.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `count` | `number` | The number of items in this event belonging to the currently active branch |

#### Returns

`void`

***

### reconcilePullableCount() \{#reconcilepullablecount\}

```ts
reconcilePullableCount(token, count): void;
```

Defined in: [packages/rxdb-plugin-history/src/sync-history-bridge.ts:100](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-history/src/sync-history-bridge.ts#L100)

Calibrates the pullable count against the remote watermarks.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `token` | `number` | The token issued by [beginPullableSettlement](#beginpullablesettlement) |
| `count` | `number` | The total pullable count computed from each repository's persisted watermark |

#### Returns

`void`

***

### settleAbortedPull() \{#settleabortedpull\}

```ts
settleAbortedPull(token, pulled): void;
```

Defined in: [packages/rxdb-plugin-history/src/sync-history-bridge.ts:92](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-history/src/sync-history-bridge.ts#L92)

Settles the pullable count by the part of a throwing pull that already landed.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `token` | `number` | The token issued by [beginPullableSettlement](#beginpullablesettlement) |
| `pulled` | `number` | The number of items that actually landed before the error, 0 when none landed |

#### Returns

`void`

#### Remarks

The token must be returned, otherwise the generation stays at its old value forever and every later settlement is judged as "concurrent".

***

### settlePull() \{#settlepull\}

```ts
settlePull(
   token, 
   options, 
   result
): void;
```

Defined in: [packages/rxdb-plugin-history/src/sync-history-bridge.ts:81](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-history/src/sync-history-bridge.ts#L81)

Settles the pullable count by the actual coverage of a successful pull.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `token` | `number` | The token issued by [beginPullableSettlement](#beginpullablesettlement) |
| `options` | [`PullOptions`](../../rxdb/interfaces/PullOptions.md) \| `undefined` | The options the pull was initiated with |
| `result` | [`PullResult`](../../rxdb/interfaces/PullResult.md) | The pull's result |

#### Returns

`void`

***

### syncing() \{#syncing\}

```ts
syncing<T>(fn): Promise<T>;
```

Defined in: [packages/rxdb-plugin-history/src/sync-history-bridge.ts:49](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-history/src/sync-history-bridge.ts#L49)

Executes in a reentrant sync context: local writes produced inside it do not enter the undo/redo stacks.

#### Type Parameters

| Type Parameter |
| ------ |
| <a id="type-parameter-t"></a> `T` |

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `fn` | () => `Promise`&lt;`T`&gt; | The sync action |

#### Returns

`Promise`&lt;`T`&gt;
