# compileCjkToken()

```ts
function compileCjkToken(token): string | undefined;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/fts5/cjk-bigram.ts:88](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/fts5/cjk-bigram.ts#L88)

Query-side transform: compiles a query token into an FTS5 MATCH fragment.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `token` | `string` | Cleaned query token (without FTS5 reserved characters) |

## Returns

`string` \| `undefined`

MATCH fragment; returns `undefined` for non-CJK tokens, leaving the caller to compile them with the original rules

## Remarks

- CJK runs of ≥2 characters are cut into bigrams joined with `AND`, giving "approximate contiguous substring" semantics:
  `数据库优化` does not hit `数据库索引优化` (missing `库优`), which matches intuition.
- A single character cannot form a bigram, so it degrades to `("X" OR "X"*)` prefix matching, hitting bigrams that start with that character.
