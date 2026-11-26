# SyncBeginEvent

Defined in: [packages/rxdb/src/rxdb-events.ts:485](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-events.ts#L485)

Sync begin event

Fired when a pull() or push() operation begins executing

## Constructors

### Constructor

```ts
new SyncBeginEvent(direction): SyncBeginEvent;
```

Defined in: [packages/rxdb/src/rxdb-events.ts:488](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-events.ts#L488)

#### Parameters

| Parameter   | Type                                                | Description    |
| ----------- | --------------------------------------------------- | -------------- |
| `direction` | [`SyncDirection`](../type-aliases/SyncDirection.md) | Sync direction |

#### Returns

`SyncBeginEvent`

## Properties

### direction \{#direction\}

```ts
readonly direction: SyncDirection;
```

Defined in: [packages/rxdb/src/rxdb-events.ts:490](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-events.ts#L490)

Sync direction

---

### type \{#type\}

```ts
readonly type: "SYNC_BEGIN" = SYNC_BEGIN_EVENT;
```

Defined in: [packages/rxdb/src/rxdb-events.ts:486](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-events.ts#L486)
