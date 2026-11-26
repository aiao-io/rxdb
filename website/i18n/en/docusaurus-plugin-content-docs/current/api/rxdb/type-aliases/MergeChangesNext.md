# MergeChangesNext

```ts
type MergeChangesNext = (host, actions, localChanges?, disableTriggers?) => Promise<number | void>;
```

Defined in: [packages/rxdb/src/capture/capture-interceptor.ts:102](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/capture/capture-interceptor.ts#L102)

The unintercepted `mergeChanges` with a rebindable host

## Parameters

| Parameter | Type |
| ------ | ------ |
| `host` | [`WorkingTreeWriteHost`](../interfaces/WorkingTreeWriteHost.md) |
| `actions` | [`SwitchVersionActions`](../interfaces/SwitchVersionActions.md) |
| `localChanges?` | `Omit`&lt;[`RxDBChange`](../classes/RxDBChange.md), `"id"`&gt;[] |
| `disableTriggers?` | `boolean` |

## Returns

`Promise`&lt;`number` \| `void`&gt;

## Remarks

The only place mount point 2 needs it: capture and the business write must land in the **same transaction**, so the
runtime first asks the host for an executor, then sends the business write to that executor's facade. The `host`
parameter is the object that should act as `this` this time; without it only the real adapter bound at install time
could be used, and that path inevitably deadlocks inside a transaction.
