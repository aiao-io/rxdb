# isValidPathSegment()

```ts
function isValidPathSegment(name): name is string;
```

Defined in: [provider/logical-path.ts:29](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/provider/logical-path.ts#L29)

Checks whether a path segment is valid.

## Parameters

| Parameter | Type      | Description           |
| --------- | --------- | --------------------- |
| `name`    | `unknown` | The segment to check. |

## Returns

`name is string`

`true` when valid.

## Remarks

Non-empty, contains no separators, and is not `.` / `..`. Relative path markers are rejected outright here instead of being resolved in place — resolving would let the peer describe a location outside the root with `a/../../b`, and the resolved result would look perfectly normal.
