# SqliteBackend

Defined in: [packages/rxdb-adapter-sqlite-core/src/sqlite-backend.interface.ts:55](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/sqlite-backend.interface.ts#L55)

Abstraction interface for SQLite WASM backend implementations.

Implementations:

- WaSqliteBackend (packages/rxdb-adapter-wa-sqlite)
- SqliteaiBackend (packages/rxdb-adapter-sqliteai)

## Methods

### changes() \{#changes\}

```ts
changes(): number;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/sqlite-backend.interface.ts:99](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/sqlite-backend.interface.ts#L99)

Returns the number of rows affected by the most recent INSERT/UPDATE/DELETE.

#### Returns

`number`

---

### close() \{#close\}

```ts
close(): Promise<void>;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/sqlite-backend.interface.ts:67](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/sqlite-backend.interface.ts#L67)

Closes the database connection and releases resources. Calling any other method after close() must throw.

#### Returns

`Promise`&lt;`void`&gt;

---

### createFunction() \{#createfunction\}

```ts
createFunction(name, fn): void;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/sqlite-backend.interface.ts:89](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/sqlite-backend.interface.ts#L89)

Registers a custom scalar SQL function.

#### Parameters

| Parameter | Type                                                                             | Description                                 |
| --------- | -------------------------------------------------------------------------------- | ------------------------------------------- |
| `name`    | `string`                                                                         | Function name usable in SQL (e.g. 'regexp') |
| `fn`      | (...`args`) => [`SQLiteCompatibleType`](../type-aliases/SQLiteCompatibleType.md) | The implementation function                 |

#### Returns

`void`

---

### exec() \{#exec\}

```ts
exec(sql, bindings?): Promise<SqliteExecResult>;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/sqlite-backend.interface.ts:75](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/sqlite-backend.interface.ts#L75)

Executes a SQL statement and returns the result.

#### Parameters

| Parameter   | Type                                                                | Description                  |
| ----------- | ------------------------------------------------------------------- | ---------------------------- |
| `sql`       | `string`                                                            | The SQL statement to execute |
| `bindings?` | [`SQLiteCompatibleType`](../type-aliases/SQLiteCompatibleType.md)[] | Optional parameter bindings  |

#### Returns

`Promise`&lt;[`SqliteExecResult`](SqliteExecResult.md)&gt;

The execution result including the number of affected rows

---

### open() \{#open\}

```ts
open(filename, options?): Promise<void>;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/sqlite-backend.interface.ts:61](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/sqlite-backend.interface.ts#L61)

Initializes and opens the SQLite database.

#### Parameters

| Parameter  | Type                                              | Description                                           |
| ---------- | ------------------------------------------------- | ----------------------------------------------------- |
| `filename` | `string`                                          | Database file name (e.g. ':memory:', '/mydb.sqlite3') |
| `options?` | [`SqliteBackendOptions`](SqliteBackendOptions.md) | Backend-specific initialization options               |

#### Returns

`Promise`&lt;`void`&gt;

---

### setUpdateHook() \{#setupdatehook\}

```ts
setUpdateHook(callback): void;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/sqlite-backend.interface.ts:82](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/sqlite-backend.interface.ts#L82)

Registers or unregisters the data-change notification callback. Invoked on INSERT, UPDATE, and DELETE operations.

#### Parameters

| Parameter  | Type                                                                    | Description                                |
| ---------- | ----------------------------------------------------------------------- | ------------------------------------------ |
| `callback` | [`UpdateHookCallback`](../type-aliases/UpdateHookCallback.md) \| `null` | The hook function; pass null to unregister |

#### Returns

`void`

---

### version() \{#version\}

```ts
version(): Promise<string>;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/sqlite-backend.interface.ts:94](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/sqlite-backend.interface.ts#L94)

Returns the SQLite version string.

#### Returns

`Promise`&lt;`string`&gt;
