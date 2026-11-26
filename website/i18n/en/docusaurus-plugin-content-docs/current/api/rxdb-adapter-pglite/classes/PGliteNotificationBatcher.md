# PGliteNotificationBatcher

Defined in: [packages/rxdb-adapter-pglite/src/notify/notification-batcher.ts:60](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/notify/notification-batcher.ts#L60)

Aggregates raw NOTIFY messages into [PGliteChangeEvent](../interfaces/PGliteChangeEvent.md).

## Remarks

Deduplicates by `type + table + id`, groups by `type + table`, and dispatches all at once when the window expires or exceeds its limit.

## Constructors

### Constructor

```ts
new PGliteNotificationBatcher(options): PGliteNotificationBatcher;
```

Defined in: [packages/rxdb-adapter-pglite/src/notify/notification-batcher.ts:87](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/notify/notification-batcher.ts#L87)

#### Parameters

| Parameter | Type                                                                                    |
| --------- | --------------------------------------------------------------------------------------- |
| `options` | [`PGliteNotificationBatcherOptions`](../interfaces/PGliteNotificationBatcherOptions.md) |

#### Returns

`PGliteNotificationBatcher`

## Accessors

### batchTimeout \{#batchtimeout\}

#### Get Signature

```ts
get batchTimeout(): number;
```

Defined in: [packages/rxdb-adapter-pglite/src/notify/notification-batcher.ts:73](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/notify/notification-batcher.ts#L73)

Trailing debounce interval (milliseconds).

##### Returns

`number`

---

### hasScheduledFlush \{#hasscheduledflush\}

#### Get Signature

```ts
get hasScheduledFlush(): boolean;
```

Defined in: [packages/rxdb-adapter-pglite/src/notify/notification-batcher.ts:83](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/notify/notification-batcher.ts#L83)

Whether there is currently a debounce timer that has not yet expired.

##### Returns

`boolean`

---

### pendingCount \{#pendingcount\}

#### Get Signature

```ts
get pendingCount(): number;
```

Defined in: [packages/rxdb-adapter-pglite/src/notify/notification-batcher.ts:78](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/notify/notification-batcher.ts#L78)

Number of row events not yet dispatched.

##### Returns

`number`

## Methods

### accept() \{#accept\}

```ts
accept(channel, payload): void;
```

Defined in: [packages/rxdb-adapter-pglite/src/notify/notification-batcher.ts:100](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/notify/notification-batcher.ts#L100)

Accepts a NOTIFY message.

#### Parameters

| Parameter | Type     | Description                                |
| --------- | -------- | ------------------------------------------ |
| `channel` | `string` | Channel name, shaped like `<table>_notify` |
| `payload` | `string` | JSON text written by the trigger           |

#### Returns

`void`

---

### clear() \{#clear\}

```ts
clear(): void;
```

Defined in: [packages/rxdb-adapter-pglite/src/notify/notification-batcher.ts:166](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/notify/notification-batcher.ts#L166)

Discards all events in the window without dispatching. Used on disconnect.

#### Returns

`void`

---

### flush() \{#flush\}

```ts
flush(): void;
```

Defined in: [packages/rxdb-adapter-pglite/src/notify/notification-batcher.ts:140](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/notify/notification-batcher.ts#L140)

Dispatches all events in the window immediately and clears the window; any scheduled debounce timer is cancelled too.

#### Returns

`void`
