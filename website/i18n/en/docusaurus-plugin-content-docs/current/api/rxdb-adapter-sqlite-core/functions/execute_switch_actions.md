# execute_switch_actions()

```ts
function execute_switch_actions(adapter, switchAction, disableTriggers?, localChanges?): Promise<void>;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/version/execute\_switch\_actions.ts:83](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/version/execute_switch_actions.ts#L83)

Executes the SQL operations in a SwitchVersionSqlResult and dispatches events.

## Parameters

| Parameter          | Type                                                                     | Default value | Description                                                                                              |
| ------------------ | ------------------------------------------------------------------------ | ------------- | -------------------------------------------------------------------------------------------------------- |
| `adapter`          | [`RxDBAdapterSqliteBase`](../classes/RxDBAdapterSqliteBase.md)           | `undefined`   | SQLite adapter instance                                                                                  |
| `switchAction`     | [`SwitchVersionSqlResult`](../interfaces/SwitchVersionSqlResult.md)      | `undefined`   | The converted SQL operation set                                                                          |
| `disableTriggers?` | `boolean`                                                                | `false`       | Whether to disable triggers (used for pull and similar operations, to avoid creating RxDBChange records) |
| `localChanges?`    | `Omit`&lt;[`RxDBChange`](../../rxdb/classes/RxDBChange.md), `"id"`&gt;[] | `undefined`   | Changes to record into the RxDBChange table in pull scenarios                                            |

## Returns

`Promise`&lt;`void`&gt;
