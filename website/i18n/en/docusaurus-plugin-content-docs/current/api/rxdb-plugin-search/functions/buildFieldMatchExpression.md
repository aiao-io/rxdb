# buildFieldMatchExpression()

```ts
function buildFieldMatchExpression(field, compiled): string;
```

Defined in: [packages/rxdb-plugin-search/src/core/search-engine.ts:81](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-search/src/core/search-engine.ts#L81)

FTS5 column filter expression: `<field> : (<compiled.match>)`

## Parameters

| Parameter | Type |
| ------ | ------ |
| `field` | `string` |
| `compiled` | `CompiledQuery` |

## Returns

`string`
