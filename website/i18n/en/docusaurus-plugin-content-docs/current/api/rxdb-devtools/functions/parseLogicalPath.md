# parseLogicalPath()

```ts
function parseLogicalPath(path): readonly string[] | undefined;
```

Defined in: [provider/logical-path.ts:46](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/provider/logical-path.ts#L46)

Splits a wire path into validated segments.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `path` | `unknown` | The path value from the wire; anything that is not a string is judged illegal. |

## Returns

readonly `string`[] \| `undefined`

The sequence of validated segments, or `undefined` when illegal.

## Remarks

An empty path is legal and denotes the root directory. If any segment is illegal, the whole path is illegal — there is no
"skip the bad segment and keep going" leniency, which would silently resolve `a/../b` into `a/b`. Empty segments produced by
consecutive slashes are dropped (`a//b` is equivalent to `a/b`), because they describe the same location rather than an extra anonymous level.
