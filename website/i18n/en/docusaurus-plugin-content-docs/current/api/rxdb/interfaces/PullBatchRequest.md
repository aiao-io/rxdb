# PullBatchRequest

Defined in: [packages/rxdb/src/rxdb-adapter.ts:34](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-adapter.ts#L34)

The watermark request for a **single entity** within one bulk pull

## Remarks

Each entity carries its own `sinceId` rather than the whole database sharing one: change-log ids are globally monotonic,
but the sync progress of different entities is not level (some tables are newly created, others already caught up). A shared minimum watermark
would re-download changes already fetched; a shared maximum watermark would miss changes of lagging tables.

When `namespace` is omitted, the adapter resolves it from the current database's default namespace.

## Properties

### entity \{#entity\}

```ts
entity: string;
```

Defined in: [packages/rxdb/src/rxdb-adapter.ts:36](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-adapter.ts#L36)

***

### namespace? \{#namespace\}

```ts
namespace?: string;
```

Defined in: [packages/rxdb/src/rxdb-adapter.ts:35](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-adapter.ts#L35)

***

### sinceId \{#sinceid\}

```ts
sinceId: number;
```

Defined in: [packages/rxdb/src/rxdb-adapter.ts:37](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-adapter.ts#L37)
