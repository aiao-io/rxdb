# DevToolsSnapshotStore

Defined in: [provider/snapshot.ts:88](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/provider/snapshot.ts#L88)

The snapshot store of a session; **holds at most one active snapshot at a time**.

## Properties

### active \{#active\}

```ts
readonly active: boolean;
```

Defined in: [provider/snapshot.ts:90](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/provider/snapshot.ts#L90)

Whether a pageable snapshot is currently held.

## Methods

### cancel() \{#cancel\}

```ts
cancel(): void;
```

Defined in: [provider/snapshot.ts:116](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/provider/snapshot.ts#L116)

Aborts the in-flight materialization and releases the active snapshot. Idempotent.

#### Returns

`void`

---

### dispose() \{#dispose\}

```ts
dispose(): void;
```

Defined in: [provider/snapshot.ts:119](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/provider/snapshot.ts#L119)

Tears down the store: aborts the in-flight materialization, releases the snapshot, and from then on [open](#open) always returns `snapshot_expired`.

#### Returns

`void`

---

### open() \{#open\}

```ts
open(pageSize?): Promise<DevToolsSnapshotResult>;
```

Defined in: [provider/snapshot.ts:102](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/provider/snapshot.ts#L102)

Materializes a new snapshot and returns its first page.

#### Parameters

| Parameter   | Type     | Description                                         |
| ----------- | -------- | --------------------------------------------------- |
| `pageSize?` | `number` | The number of records per page, 1–500, default 100. |

#### Returns

`Promise`&lt;[`DevToolsSnapshotResult`](../type-aliases/DevToolsSnapshotResult.md)&gt;

The first page, a cancellation, or `invalid_message` / `snapshot_busy` / `snapshot_too_large`.

#### Remarks

An existing active snapshot is released first — its cursor will only get `snapshot_expired` afterwards, never data of the new snapshot.

---

### page() \{#page\}

```ts
page(cursor): DevToolsSnapshotResult;
```

Defined in: [provider/snapshot.ts:110](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/provider/snapshot.ts#L110)

Reads a subsequent page of the active snapshot.

#### Parameters

| Parameter | Type                                                  | Description                                                        |
| --------- | ----------------------------------------------------- | ------------------------------------------------------------------ |
| `cursor`  | [`DevToolsSnapshotCursor`](DevToolsSnapshotCursor.md) | Must be bound to the current snapshot and fall on a page boundary. |

#### Returns

[`DevToolsSnapshotResult`](../type-aliases/DevToolsSnapshotResult.md)

That page, or `snapshot_expired` / `invalid_message`. When rejected, the idle timer is **not** refreshed.

---

### release() \{#release\}

```ts
release(): void;
```

Defined in: [provider/snapshot.ts:113](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/provider/snapshot.ts#L113)

Releases the active snapshot and its idle timer. Idempotent.

#### Returns

`void`
