# RemoteChangeResult

```ts
type RemoteChangeResult =
  | {
      localId: number;
      remoteId: number;
      status: 'applied';
    }
  | {
      localId: number;
      rejection: RemoteChangeRejection;
      status: 'rejected';
    };
```

Defined in: [packages/rxdb/src/rxdb-adapter.ts:65](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-adapter.ts#L65)

The remote processing result of a single source change

## Remarks

`localId` corresponds to the local change id passed to `mergeChanges` (i.e. [RxDBChange.id](../classes/RxDBChange.md#id)).
`applied` carries the `remoteId` assigned by the remote — the local change is persisted before pushing, so it carries
a locally auto-incremented id, while the remote has its own sequence; only with the mapping can the local change log be
marked with `remoteId`, so that later pulls recognize "this one I pushed myself" instead of landing it again as a new
remote change. `rejected` carries the rejection details.
