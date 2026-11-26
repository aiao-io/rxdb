# diffMetadata()

```ts
function diffMetadata(remoteMetadata, localMetadata): DiffResult;
```

Defined in: [packages/rxdb/src/repository/diff-metadata.ts:66](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/diff-metadata.ts#L66)

Compares remote metadata with local metadata to determine the sync action.

Both sides' `updatedAt` are **parsed into points in time** before comparison, not compared as strings lexicographically.
Time complexity: O(n), n = max(remote.length, local.size)

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `remoteMetadata` | [`QueryCacheEntityMetadata`](../interfaces/QueryCacheEntityMetadata.md)[] | Metadata from the remote adapter (id + updatedAt, any time string `Date.parse` recognizes) |
| `localMetadata` | `Map`&lt;`string`, `string`&gt; | Map\<id, updatedAt\> from the local adapter |

## Returns

[`DiffResult`](../interfaces/DiffResult.md)

The DiffResult containing the classified IDs

## Throws

TypeError when either side's `updatedAt` cannot be parsed into a point in time.

## Example

```typescript
const diff = diffMetadata(
  [{ id: '1', updatedAt: '2024-01-02T00:00:00Z' }],
  new Map([['1', '2024-01-01T00:00:00Z']])
);
// diff.staleIds = ['1'] - remote is newer
```

## Remarks

Previously this compared ISO strings lexicographically; see the failure scenario recorded in [isRemoteNewer](isRemoteNewer.md).
