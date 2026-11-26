# SyncCompleteEvent

Defined in: [packages/rxdb/src/rxdb-events.ts:499](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-events.ts#L499)

Sync complete event

Fired when a pull() or push() operation completes successfully

## Constructors

### Constructor

```ts
new SyncCompleteEvent(direction, result): SyncCompleteEvent;
```

Defined in: [packages/rxdb/src/rxdb-events.ts:502](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-events.ts#L502)

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `direction` | [`SyncDirection`](../type-aliases/SyncDirection.md) | Sync direction |
| `result` | \| [`PullResult`](../interfaces/PullResult.md) \| [`PushResult`](../interfaces/PushResult.md) | Sync result |

#### Returns

`SyncCompleteEvent`

## Properties

### direction \{#direction\}

```ts
readonly direction: SyncDirection;
```

Defined in: [packages/rxdb/src/rxdb-events.ts:504](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-events.ts#L504)

Sync direction

***

### result \{#result\}

```ts
readonly result: 
  | PullResult
  | PushResult;
```

Defined in: [packages/rxdb/src/rxdb-events.ts:506](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-events.ts#L506)

Sync result

***

### type \{#type\}

```ts
readonly type: "SYNC_COMPLETE" = SYNC_COMPLETE_EVENT;
```

Defined in: [packages/rxdb/src/rxdb-events.ts:500](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-events.ts#L500)
