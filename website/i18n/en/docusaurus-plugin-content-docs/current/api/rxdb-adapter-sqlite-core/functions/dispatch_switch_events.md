# dispatch_switch_events()

```ts
function dispatch_switch_events(
   adapter, 
   switchAction, 
   tableSet?
): Promise<void>;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/version/execute\_switch\_actions.ts:136](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/version/execute_switch_actions.ts#L136)

Dispatches the local events corresponding to a switch operation.

## Parameters

| Parameter | Type | Default value | Description |
| ------ | ------ | ------ | ------ |
| `adapter` | [`RxDBAdapterSqliteBase`](../classes/RxDBAdapterSqliteBase.md) | `undefined` | The SQLite adapter |
| `switchAction` | [`SwitchVersionSqlResult`](../interfaces/SwitchVersionSqlResult.md) | `undefined` | The executed switch SQL |
| `tableSet?` | [`WorktreeTableSet`](../../rxdb/classes/WorktreeTableSet.md) | `adapter.tableSet` | Which table set this batch of writes landed on; defaults to the set this instance is attached to at dispatch time; events are tagged with the table set based on it (US-314 B2.3) |

## Returns

`Promise`&lt;`void`&gt;
