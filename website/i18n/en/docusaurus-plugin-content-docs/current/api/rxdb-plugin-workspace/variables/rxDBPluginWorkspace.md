# rxDBPluginWorkspace

```ts
const rxDBPluginWorkspace: (db, options?) => RxDBPluginWorkspace;
```

Defined in: [packages/rxdb-plugin-workspace/src/RxDBPluginWorkspace.ts:1154](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-workspace/src/RxDBPluginWorkspace.ts#L1154)

Installs or retrieves the installed workspace plugin.

## Parameters

| Parameter  | Type                                                                        | Description                                                 |
| ---------- | --------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `db`       | [`RxDB`](../../rxdb/classes/RxDB.md)                                        | RxDB instance                                               |
| `options?` | [`RxDBPluginWorkspaceOptions`](../interfaces/RxDBPluginWorkspaceOptions.md) | Configuration used at first install; ignored once installed |

## Returns

`RxDBPluginWorkspace`

The single plugin instance on `db.workspace`

## Throws

The `workspace` property is occupied by an incompatible instance, or initialization of the underlying resources failed
