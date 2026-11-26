# WaSqliteVfsFactory

Defined in: [packages/rxdb-adapter-wa-sqlite/src/sqlite-load.utils.ts:19](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-wa-sqlite/src/sqlite-load.utils.ts#L19)

Minimal factory shape exposed by the upstream example VFS modules.

## Methods

### create() \{#create\}

```ts
create(
   name,
   module,
   options?
): SQLiteVFS | Promise<SQLiteVFS>;
```

Defined in: [packages/rxdb-adapter-wa-sqlite/src/sqlite-load.utils.ts:20](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-wa-sqlite/src/sqlite-load.utils.ts#L20)

#### Parameters

| Parameter  | Type      |
| ---------- | --------- |
| `name`     | `string`  |
| `module`   | `unknown` |
| `options?` | `unknown` |

#### Returns

`SQLiteVFS` \| `Promise`&lt;`SQLiteVFS`&gt;
