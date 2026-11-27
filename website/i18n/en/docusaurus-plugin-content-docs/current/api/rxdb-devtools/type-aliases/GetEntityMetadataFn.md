# GetEntityMetadataFn

```ts
type GetEntityMetadataFn = (entity) => DevToolsEntityMetadata | undefined;
```

Defined in: [connector-types.ts:95](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/connector-types.ts#L95)

Entity metadata reader function.

## Parameters

| Parameter | Type                                                  |
| --------- | ----------------------------------------------------- |
| `entity`  | [`EntityType`](../../rxdb/type-aliases/EntityType.md) |

## Returns

\| [`DevToolsEntityMetadata`](../interfaces/DevToolsEntityMetadata.md)
\| `undefined`

## Remarks

Both the upstream `getEntityMetadata` (fail-fast, throws when not decorated) and `tryGetEntityMetadata`
(returns `undefined`) satisfy this signature; the caller decides which semantics it wants.
