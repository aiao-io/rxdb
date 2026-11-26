# createWaSqliteMiniProgramClient()

```ts
function createWaSqliteMiniProgramClient(dbName, options): Promise<WaSqliteMiniProgramClient>;
```

Defined in: [packages/rxdb-adapter-miniprogram/src/create-client.ts:97](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-miniprogram/src/create-client.ts#L97)

Creates and initializes the mini-program-specific wa-sqlite client.

## Parameters

| Parameter | Type |
| ------ | ------ |
| `dbName` | `string` |
| `options` | [`WaSqliteMiniProgramAdapterOptions`](../type-aliases/WaSqliteMiniProgramAdapterOptions.md) |

## Returns

`Promise`&lt;[`WaSqliteMiniProgramClient`](../classes/WaSqliteMiniProgramClient.md)&gt;
