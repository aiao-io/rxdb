# RemoteMergeResult

Defined in: [packages/rxdb/src/rxdb-adapter.ts:49](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-adapter.ts#L49)

The result returned after the remote merges a batch of local changes

## Remarks

`results` must cover exactly all the `changes` passed in at call time: one result for each source change,
no more, no fewer. The pusher runs the coverage check from this (see `push-repository.ts`) — missing, duplicated or superfluous
`localId`s are all treated as contract violations, failing the whole round without advancing the watermark. When `changes` was not passed, `results`
is an empty array (no source change to correspond to).

## Properties

### maxChangeId? \{#maxchangeid\}

```ts
maxChangeId?: number;
```

Defined in: [packages/rxdb/src/rxdb-adapter.ts:51](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-adapter.ts#L51)

The maximum remote change id of this round

---

### results \{#results\}

```ts
results: RemoteChangeResult[];
```

Defined in: [packages/rxdb/src/rxdb-adapter.ts:53](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-adapter.ts#L53)

The result for each source change; must cover exactly all the `changes` passed in at call time
