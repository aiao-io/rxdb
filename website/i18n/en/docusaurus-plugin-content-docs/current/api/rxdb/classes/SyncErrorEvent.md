# SyncErrorEvent

Defined in: [packages/rxdb/src/rxdb-events.ts:515](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-events.ts#L515)

Sync error event

Fired when a pull() or push() operation fails

## Constructors

### Constructor

```ts
new SyncErrorEvent(direction, error): SyncErrorEvent;
```

Defined in: [packages/rxdb/src/rxdb-events.ts:518](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-events.ts#L518)

#### Parameters

| Parameter   | Type                                                | Description       |
| ----------- | --------------------------------------------------- | ----------------- |
| `direction` | [`SyncDirection`](../type-aliases/SyncDirection.md) | Sync direction    |
| `error`     | `Error`                                             | Error information |

#### Returns

`SyncErrorEvent`

## Properties

### direction \{#direction\}

```ts
readonly direction: SyncDirection;
```

Defined in: [packages/rxdb/src/rxdb-events.ts:520](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-events.ts#L520)

Sync direction

---

### error \{#error\}

```ts
readonly error: Error;
```

Defined in: [packages/rxdb/src/rxdb-events.ts:522](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-events.ts#L522)

Error information

---

### type \{#type\}

```ts
readonly type: "SYNC_ERROR" = SYNC_ERROR_EVENT;
```

Defined in: [packages/rxdb/src/rxdb-events.ts:516](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-events.ts#L516)
