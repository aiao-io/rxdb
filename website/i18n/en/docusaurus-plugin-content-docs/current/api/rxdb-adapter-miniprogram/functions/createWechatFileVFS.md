# createWechatFileVFS()

```ts
function createWechatFileVFS(module, options): MiniProgramFileVFS;
```

Defined in: [packages/rxdb-adapter-miniprogram/src/wechat-file-vfs.ts:559](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-miniprogram/src/wechat-file-vfs.ts#L559)

Creates a single-connection, rollback-journal WeChat synchronous file VFS; the WeChat wrapper of `createMiniProgramFileVFS`.

## Parameters

| Parameter | Type                                                                    |
| --------- | ----------------------------------------------------------------------- |
| `module`  | [`WaSqliteEmscriptenModule`](../interfaces/WaSqliteEmscriptenModule.md) |
| `options` | [`WechatFileVFSOptions`](../interfaces/WechatFileVFSOptions.md)         |

## Returns

[`MiniProgramFileVFS`](../interfaces/MiniProgramFileVFS.md)
