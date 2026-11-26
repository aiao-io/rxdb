# hasCjk()

```ts
function hasCjk(value): boolean;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/fts5/cjk-bigram.ts:41](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/fts5/cjk-bigram.ts#L41)

Determines whether a string contains continuous CJK text.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `value` | `string` | The text to inspect |

## Returns

`boolean`

`true` when it contains any CJK characters
