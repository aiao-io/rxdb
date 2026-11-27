# normalizeBoardTitle()

```ts
function normalizeBoardTitle(raw): string | null;
```

Defined in: [packages/rxdb-plugin-board/src/title.ts:9](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board/src/title.ts#L9)

Valid title after trimming surrounding whitespace; returns `null` for an empty or all-whitespace string.

## Parameters

| Parameter | Type      |
| --------- | --------- |
| `raw`     | `unknown` |

## Returns

`string` \| `null`
