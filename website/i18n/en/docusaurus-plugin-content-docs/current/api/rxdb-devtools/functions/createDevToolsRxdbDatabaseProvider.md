# createDevToolsRxdbDatabaseProvider()

```ts
function createDevToolsRxdbDatabaseProvider(ports): DevToolsRxdbDatabaseProvider;
```

Defined in: [rxdb/database-provider.ts:164](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/rxdb/database-provider.ts#L164)

Creates an RxDB `database` provider.

## Parameters

| Parameter | Type                                                                                      | Description                                                                                                           |
| --------- | ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `ports`   | [`DevToolsRxdbDatabaseProviderPorts`](../interfaces/DevToolsRxdbDatabaseProviderPorts.md) | The RxDB instance entry point, the metadata reading functions, the runtime used for display, and the event push port. |

## Returns

[`DevToolsRxdbDatabaseProvider`](../interfaces/DevToolsRxdbDatabaseProvider.md)

A provider that can be installed directly into the `DevToolsProviderRegistry`.
