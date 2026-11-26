# convertSwitchResultToSql()

```ts
function convertSwitchResultToSql(adapter, actions, options?): Promise<SwitchVersionSqlResult>;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/version/switch-result.utils.ts:181](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/version/switch-result.utils.ts#L181)

## Parameters

| Parameter  | Type                                                                    |
| ---------- | ----------------------------------------------------------------------- |
| `adapter`  | [`RxDBAdapterSqliteBase`](../classes/RxDBAdapterSqliteBase.md)          |
| `actions`  | [`SwitchVersionActions`](../../rxdb/interfaces/SwitchVersionActions.md) |
| `options?` | `SwitchSqlOptions`                                                      |

## Returns

`Promise`&lt;[`SwitchVersionSqlResult`](../interfaces/SwitchVersionSqlResult.md)&gt;
