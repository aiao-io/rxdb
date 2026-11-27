# browserBoardShellRuntime()

```ts
function browserBoardShellRuntime(): BoardShellRuntime;
```

Defined in: [packages/rxdb-plugin-board/src/board-shell.ts:138](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board/src/board-shell.ts#L138)

Browser capabilities: `localStorage`, Web Locks, IndexedDB database name list, `storage` events and full page reload.

## Returns

[`BoardShellRuntime`](../interfaces/BoardShellRuntime.md)

The shell runtime

## Remarks

The database name list comes from IndexedDB — the storage for the first-round supported combination (sqlite-wasm main thread `vfs: 'idb'`) lives there.
Hosts for other storages (OPFS etc.) implement [BoardShellRuntime.listDatabases](../interfaces/BoardShellRuntime.md#listdatabases) themselves.
