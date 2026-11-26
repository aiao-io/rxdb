# EntityMetadataFeatures

Defined in: [packages/rxdb/src/entity/entity-options.interface.ts:32](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-options.interface.ts#L32)

EntityMetadata extension features.

## Remarks

The core does not build in any concrete feature — `tree` is attached by `@aiao/rxdb-plugin-tree` and `graph` by
`@aiao/rxdb-plugin-graph`, each via `declare module '@aiao/rxdb'`. The index signature is the landing point of
this extension path: in an application that has not installed the corresponding plugin, not even the field names
should appear on the metadata.

## Indexable

```ts
[name: string]: unknown
```
