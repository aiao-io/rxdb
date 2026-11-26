# repositoryKey()

```ts
function repositoryKey(repository): string;
```

Defined in: [packages/rxdb/src/sync-contract/cascade-contract.ts:42](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-contract/cascade-contract.ts#L42)

Renders a repository identifier as `namespace:entity` (the key format shared by the dependency graph and error messages).

## Parameters

| Parameter    | Type                                                            | Description               |
| ------------ | --------------------------------------------------------------- | ------------------------- |
| `repository` | [`RepositoryIdentifier`](../interfaces/RepositoryIdentifier.md) | The repository identifier |

## Returns

`string`

A key of the form `namespace:entity`.
