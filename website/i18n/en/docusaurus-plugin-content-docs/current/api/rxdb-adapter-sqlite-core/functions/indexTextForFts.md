# indexTextForFts()

```ts
function indexTextForFts(value): string;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/fts5/cjk-bigram.ts:70](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/fts5/cjk-bigram.ts#L70)

Index-side transform: replaces each run of consecutive CJK in the text with a space-separated unigram + bigram sequence.

## Parameters

| Parameter | Type     | Description    |
| --------- | -------- | -------------- |
| `value`   | `string` | Raw field text |

## Returns

`string`

Text for FTS5 to index; non-CJK parts are kept as-is

## Remarks

Only rewrites what goes into the FTS index and does **not modify the source table**. Snippets are still extracted by `search-engine` from the source table's original text,
so bigram traces never appear in what the user sees.

A space is inserted between a CJK run and adjacent Latin/digits (SQLC-013): `unicode61` does not split words at script boundaries,
so `rxdb搜索` without the space is **one** token, while the query side [compileCjkToken](compileCjkToken.md) compiles it segment by segment into
`("rxdb" OR "rxdb"*) AND "搜索"` — neither token exists in the index, zero recall.
Boundaries that are already whitespace are not duplicated, so `'rxdb 全文搜索 guide'` produces no consecutive spaces.

## Example

```ts
indexTextForFts('rxdb 全文搜索'); // 'rxdb 全文 文搜 搜索'
indexTextForFts('rxdb搜索'); // 'rxdb 搜索'
```
