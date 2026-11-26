# isCanonicalUuidV4()

```ts
function isCanonicalUuidV4(value): value is string;
```

Defined in: [v2/ids.ts:60](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/v2/ids.ts#L60)

Checks whether a value is a canonical (lowercase, hyphenated) UUID v4.

## Parameters

| Parameter | Type      | Description         |
| --------- | --------- | ------------------- |
| `value`   | `unknown` | The value to check. |

## Returns

`value is string`

`true` when the value conforms.

## Remarks

Only the lowercase form is accepted. Mixed casing would make "two spellings of the same session" look like two different sessions under string comparison, and this kind of fork usually shows up in tests as an occasional `session_invalid`.
