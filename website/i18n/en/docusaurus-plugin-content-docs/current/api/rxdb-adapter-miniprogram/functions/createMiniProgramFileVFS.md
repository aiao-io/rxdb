# createMiniProgramFileVFS()

```ts
function createMiniProgramFileVFS(module, options): MiniProgramFileVFS;
```

Defined in: [packages/rxdb-adapter-miniprogram/src/wechat-file-vfs.ts:611](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-miniprogram/src/wechat-file-vfs.ts#L611)

Creates a single-connection, rollback-journal mini program synchronous file VFS.

The whole database is buffered in memory and flushed via `writeFileSync`; all hosts share the same module-level single-connection table,
and a second connection to the same database file is rejected directly, without relying on the mini program to provide file locks.
The storage layout is decided by `host.fileLayout`; see [MiniProgramFileLayout](../type-aliases/MiniProgramFileLayout.md).

## Parameters

| Parameter | Type |
| ------ | ------ |
| `module` | [`WaSqliteEmscriptenModule`](../interfaces/WaSqliteEmscriptenModule.md) |
| `options` | [`MiniProgramFileVFSOptions`](../interfaces/MiniProgramFileVFSOptions.md) |

## Returns

[`MiniProgramFileVFS`](../interfaces/MiniProgramFileVFS.md)
