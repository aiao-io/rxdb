# WaSqliteModuleFactory

```ts
type WaSqliteModuleFactory = (options) => 
  | Promise<WaSqliteEmscriptenModule>
  | WaSqliteEmscriptenModule;
```

Defined in: [packages/rxdb-adapter-miniprogram/src/mini-program.interface.ts:192](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-miniprogram/src/mini-program.interface.ts#L192)

The module factory exported by the wa-sqlite Emscripten glue, provided by `loadSubframeModuleFactory()`.

## Parameters

| Parameter | Type |
| ------ | ------ |
| `options` | [`WaSqliteModuleFactoryOptions`](../interfaces/WaSqliteModuleFactoryOptions.md) |

## Returns

  \| `Promise`&lt;[`WaSqliteEmscriptenModule`](../interfaces/WaSqliteEmscriptenModule.md)&gt;
  \| [`WaSqliteEmscriptenModule`](../interfaces/WaSqliteEmscriptenModule.md)
