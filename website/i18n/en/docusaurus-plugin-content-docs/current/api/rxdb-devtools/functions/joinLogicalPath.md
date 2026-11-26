# joinLogicalPath()

```ts
function joinLogicalPath(segments): string;
```

Defined in: [provider/logical-path.ts:58](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/provider/logical-path.ts#L58)

Joins validated segments back into a logical path.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `segments` | readonly `string`[] | Segments that have passed [parseLogicalPath](parseLogicalPath.md) or [isValidPathSegment](isValidPathSegment.md). |

## Returns

`string`

The logical path in canonical form; the root directory is the empty string.
