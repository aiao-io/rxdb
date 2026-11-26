# transformEntityValuePGliteToJs()

```ts
function transformEntityValuePGliteToJs(metadata, entity): Record<string, unknown>;
```

Defined in: [packages/rxdb-adapter-pglite/src/pglite.utils.ts:825](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/pglite.utils.ts#L825)

Converts all values in an entity object from PGlite format to JS types
Mainly used for the patch/inversePatch fields of the RxDBChange table

## Parameters

| Parameter  | Type                                                          | Description     |
| ---------- | ------------------------------------------------------------- | --------------- |
| `metadata` | [`EntityMetadata`](../../rxdb/type-aliases/EntityMetadata.md) | Entity metadata |
| `entity`   | `Record`&lt;`string`, `unknown`&gt;                           | Entity object   |

## Returns

`Record`&lt;`string`, `unknown`&gt;

The converted entity object
