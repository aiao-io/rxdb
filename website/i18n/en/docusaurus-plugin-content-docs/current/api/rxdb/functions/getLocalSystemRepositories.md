# getLocalSystemRepositories()

```ts
function getLocalSystemRepositories(rxdb): Promise<{
  adapter: LocalRxDBAdapter;
  branchRepository: LocalRxDBBranchRepository;
  changeRepository: LocalRxDBChangeRepository;
}>;
```

Defined in: [packages/rxdb/src/system/system-repositories.ts:97](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/system-repositories.ts#L97)

Gets the system table repositories on the local adapter.

## Parameters

| Parameter | Type                         | Description       |
| --------- | ---------------------------- | ----------------- |
| `rxdb`    | [`RxDB`](../classes/RxDB.md) | The RxDB instance |

## Returns

`Promise`&lt;\{
`adapter`: [`LocalRxDBAdapter`](../type-aliases/LocalRxDBAdapter.md);
`branchRepository`: [`LocalRxDBBranchRepository`](../interfaces/LocalRxDBBranchRepository.md);
`changeRepository`: [`LocalRxDBChangeRepository`](../interfaces/LocalRxDBChangeRepository.md);
\}&gt;
