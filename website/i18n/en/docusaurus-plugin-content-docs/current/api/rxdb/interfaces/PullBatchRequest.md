# PullBatchRequest

Defined in: [packages/rxdb/src/rxdb-adapter.ts:34](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-adapter.ts#L34)

The watermark request for **a single entity** within one batch pull

## Remarks

The reason each entity carries its own `sinceId` instead of one shared watermark for the whole database: the change log has globally monotonic ids,
but the sync progress of entities is not level (some tables were just created, others have caught up to the latest). Sharing the minimum watermark
would re-download changes already fetched, and sharing the maximum watermark would miss changes of lagging tables.

When `namespace` is omitted, the adapter resolves it by the database's current default namespace.

## Properties

### entity \{#entity\}

```ts
entity: string;
```

Defined in: [packages/rxdb/src/rxdb-adapter.ts:36](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-adapter.ts#L36)

---

### namespace? \{#namespace\}

```ts
namespace?: string;
```

Defined in: [packages/rxdb/src/rxdb-adapter.ts:35](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-adapter.ts#L35)

---

### sinceId \{#sinceid\}

```ts
sinceId: number;
```

Defined in: [packages/rxdb/src/rxdb-adapter.ts:37](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-adapter.ts#L37)
