# PGliteNotificationBatcherOptions

Defined in: [packages/rxdb-adapter-pglite/src/notify/notification-batcher.ts:39](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/notify/notification-batcher.ts#L39)

Input parameters of [PGliteNotificationBatcher](../classes/PGliteNotificationBatcher.md).

## Properties

### batchTimeout? \{#batchtimeout\}

```ts
readonly batchTimeout?: number;
```

Defined in: [packages/rxdb-adapter-pglite/src/notify/notification-batcher.ts:45](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/notify/notification-batcher.ts#L45)

Trailing debounce interval (milliseconds), defaults to [DEFAULT\_NOTIFY\_BATCH\_TIMEOUT\_MS](../variables/DEFAULT_NOTIFY_BATCH_TIMEOUT_MS.md).

***

### emit \{#emit\}

```ts
readonly emit: (event) => void;
```

Defined in: [packages/rxdb-adapter-pglite/src/notify/notification-batcher.ts:43](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/notify/notification-batcher.ts#L43)

Dispatches one aggregated change event at flush time.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `event` | [`PGliteChangeEvent`](PGliteChangeEvent.md) |

#### Returns

`void`

***

### maxBatchWait? \{#maxbatchwait\}

```ts
readonly maxBatchWait?: number;
```

Defined in: [packages/rxdb-adapter-pglite/src/notify/notification-batcher.ts:47](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/notify/notification-batcher.ts#L47)

Hard window limit (milliseconds), defaults to [DEFAULT\_NOTIFY\_MAX\_BATCH\_WAIT\_MS](../variables/DEFAULT_NOTIFY_MAX_BATCH_WAIT_MS.md).

***

### maxPendingEvents? \{#maxpendingevents\}

```ts
readonly maxPendingEvents?: number;
```

Defined in: [packages/rxdb-adapter-pglite/src/notify/notification-batcher.ts:49](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/notify/notification-batcher.ts#L49)

Window capacity limit, defaults to [DEFAULT\_NOTIFY\_MAX\_PENDING\_EVENTS](../variables/DEFAULT_NOTIFY_MAX_PENDING_EVENTS.md).

***

### onParseError? \{#onparseerror\}

```ts
readonly onParseError?: (error) => void;
```

Defined in: [packages/rxdb-adapter-pglite/src/notify/notification-batcher.ts:51](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/notify/notification-batcher.ts#L51)

Reporting hook for payload parse failures; dropped when not provided.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `error` | `unknown` |

#### Returns

`void`

***

### resolveDbName \{#resolvedbname\}

```ts
readonly resolveDbName: () => string;
```

Defined in: [packages/rxdb-adapter-pglite/src/notify/notification-batcher.ts:41](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/notify/notification-batcher.ts#L41)

Returns the current database name; a getter rather than a value because it is only known after `init()`.

#### Returns

`string`
