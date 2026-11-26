# WorkingTreeWriteHost

Defined in: [packages/rxdb/src/capture/capture-interceptor.ts:57](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/capture/capture-interceptor.ts#L57)

The **host** of one write call: the real adapter itself, or the executor facade inside a transaction

## Remarks

The two are two faces of the same class, differing only in `runInTransaction`: on a real adapter it opens a new queued transaction,
on the facade it is special-cased into `executor.run()` — reusing the current transaction and **never re-queueing**. The capture runtime must have an executor to write working tree rows,
and only the host knows whether to open a new one or reuse, so the only correct way to obtain a transaction is
to ask the host, not to call `adapter.transaction()` yourself.

The write primitives' `this` must also be the host: `mergeChanges` passes the received adapter all the way down to internal helpers,
and binding to the real adapter would send their queries through the queue — while the queue's single slot is occupied by the current transaction, i.e. self-locking.

## Methods

### runInTransaction() \{#runintransaction\}

```ts
runInTransaction<T>(fun, transactionLog?): Promise<Awaited<ReturnType<T>>>;
```

Defined in: [packages/rxdb/src/capture/capture-interceptor.ts:59](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/capture/capture-interceptor.ts#L59)

Opens (real adapter) or reuses (executor facade) a transaction

#### Type Parameters

| Type Parameter                                                                                    |
| ------------------------------------------------------------------------------------------------- |
| <a id="type-parameter-t"></a> `T` _extends_ [`TransactionFun`](../type-aliases/TransactionFun.md) |

#### Parameters

| Parameter         | Type      |
| ----------------- | --------- |
| `fun`             | `T`       |
| `transactionLog?` | `boolean` |

#### Returns

`Promise`&lt;`Awaited`&lt;`ReturnType`&lt;`T`&gt;&gt;&gt;
