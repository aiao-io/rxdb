# DevToolsSnapshotLock

Defined in: [native/native-snapshot-source.ts:47](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/native/native-snapshot-source.ts#L47)

The storage-global exclusive lock.

## Methods

### run() \{#run\}

```ts
run<TValue>(signal, task): Promise<DevToolsSnapshotLockResult<TValue>>;
```

Defined in: [native/native-snapshot-source.ts:60](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/native/native-snapshot-source.ts#L60)

Acquires the exclusive lock and runs `task` inside it.

#### Type Parameters

| Type Parameter |
| ------ |
| <a id="type-parameter-tvalue"></a> `TValue` |

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `signal` | `AbortSignal` | The abort signal. |
| `task` | () => `Promise`&lt;`TValue`&gt; | The materialization executed inside the lock. |

#### Returns

`Promise`&lt;[`DevToolsSnapshotLockResult`](../type-aliases/DevToolsSnapshotLockResult.md)&lt;`TValue`&gt;&gt;

The result from inside the lock, the loss of lock ownership, or an abort while waiting or inside the lock.

#### Remarks

`lost` and `aborted` are reported separately because they mean different things to the host (the former must give up the lease, the latter must stop waiting), even though both reduce to "does not hold at this moment" for this module. Waiting for the lock must respond to `signal`: both the 15-second deadline and explicit cancellation can only interrupt it through that.
