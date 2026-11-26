# QueryCacheEntityMetadata

Defined in: [packages/rxdb/src/entity/sync-options.interface.ts:173](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/sync-options.interface.ts#L173)

Entity metadata, used for QueryCache freshness comparison.

This is a runtime type and does not correspond to a physical table. Used for metadata query results,
comparing the local and remote `updatedAt` to decide whether the data needs updating.

## Example

```typescript
const remoteMetadata: QueryCacheEntityMetadata[] = [
  { id: 'entity-1', updatedAt: '2026-01-12T10:00:00Z' },
  { id: 'entity-2', updatedAt: '2026-01-12T09:30:00Z' }
];
```

## Properties

### id \{#id\}

```ts
id: string;
```

Defined in: [packages/rxdb/src/entity/sync-options.interface.ts:175](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/sync-options.interface.ts#L175)

Unique identifier of the entity.

---

### updatedAt \{#updatedat\}

```ts
updatedAt: string;
```

Defined in: [packages/rxdb/src/entity/sync-options.interface.ts:177](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/sync-options.interface.ts#L177)

Last update time (ISO 8601 string).
