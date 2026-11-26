# getRemoteSystemRepositories()

```ts
function getRemoteSystemRepositories(rxdb): Promise<{
  adapter: RemoteRxDBAdapter;
  branchRepository: RemoteRxDBBranchRepository;
  changeRepository: RemoteRxDBChangeRepository;
}>;
```

Defined in: [packages/rxdb/src/system/system-repositories.ts:109](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/system-repositories.ts#L109)

Gets the system table repositories on the remote adapter.

## Parameters

| Parameter | Type                         | Description       |
| --------- | ---------------------------- | ----------------- |
| `rxdb`    | [`RxDB`](../classes/RxDB.md) | The RxDB instance |

## Returns

`Promise`&lt;\{
`adapter`: [`RemoteRxDBAdapter`](../type-aliases/RemoteRxDBAdapter.md);
`branchRepository`: [`RemoteRxDBBranchRepository`](../interfaces/RemoteRxDBBranchRepository.md);
`changeRepository`: [`RemoteRxDBChangeRepository`](../interfaces/RemoteRxDBChangeRepository.md);
\}&gt;
