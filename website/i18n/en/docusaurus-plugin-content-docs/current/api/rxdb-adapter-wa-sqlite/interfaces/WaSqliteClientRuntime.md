---
sidebar_label: 'WaSqliteClientRuntime⟨TOptions⟩'
---

# WaSqliteClientRuntime`<TOptions>`

Defined in: [packages/rxdb-adapter-wa-sqlite/src/WaSqliteClientBase.ts:47](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-wa-sqlite/src/WaSqliteClientBase.ts#L47)

Platform runtime of the wa-sqlite client.

## Type Parameters

| Type Parameter                                                     |
| ------------------------------------------------------------------ |
| <a id="type-parameter-toptions"></a> `TOptions` _extends_ `object` |

## Properties

### clientName \{#clientname\}

```ts
readonly clientName: string;
```

Defined in: [packages/rxdb-adapter-wa-sqlite/src/WaSqliteClientBase.ts:48](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-wa-sqlite/src/WaSqliteClientBase.ts#L48)

## Methods

### initializationSql()? \{#initializationsql\}

```ts
initializationSql ? cacheSizeKb : string;
```

Defined in: [packages/rxdb-adapter-wa-sqlite/src/WaSqliteClientBase.ts:53](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-wa-sqlite/src/WaSqliteClientBase.ts#L53)

#### Parameters

| Parameter     | Type     |
| ------------- | -------- |
| `cacheSizeKb` | `number` |

#### Returns

`string`

---

### load() \{#load\}

```ts
load(dbName, options): Promise<LoadedWaSqliteClientRuntime>;
```

Defined in: [packages/rxdb-adapter-wa-sqlite/src/WaSqliteClientBase.ts:49](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-wa-sqlite/src/WaSqliteClientBase.ts#L49)

#### Parameters

| Parameter | Type       |
| --------- | ---------- |
| `dbName`  | `string`   |
| `options` | `TOptions` |

#### Returns

`Promise`&lt;`LoadedWaSqliteClientRuntime`&gt;

---

### open() \{#open\}

```ts
open<T>(
   attempt,
   dbName,
   options
): Promise<T>;
```

Defined in: [packages/rxdb-adapter-wa-sqlite/src/WaSqliteClientBase.ts:66](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-wa-sqlite/src/WaSqliteClientBase.ts#L66)

Performs the open and decides whether to start over entirely after a failed open.

#### Type Parameters

| Type Parameter                    |
| --------------------------------- |
| <a id="type-parameter-t"></a> `T` |

#### Parameters

| Parameter | Type                       | Description                                                                                                                            |
| --------- | -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `attempt` | () => `Promise`&lt;`T`&gt; | One complete open: `load` creates the module and VFS → `open_v2` → initialization SQL; this attempt's VFS is already closed on failure |
| `dbName`  | `string`                   | Database name                                                                                                                          |
| `options` | `TOptions`                 | Platform loading configuration                                                                                                         |

#### Returns

`Promise`&lt;`T`&gt;

Result of `attempt`

#### Remarks

Starting over calls `attempt` again, without reusing the failed attempt's module and VFS. Browsers retry `OPFSCoopSyncVFS` with backoff (US-221: on a full page refresh
the previous page still holds the database file's sync access handle); platforms that need no retry simply call `attempt()`.

---

### releaseListener()? \{#releaselistener\}

```ts
releaseListener?(listener): void;
```

Defined in: [packages/rxdb-adapter-wa-sqlite/src/WaSqliteClientBase.ts:52](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-wa-sqlite/src/WaSqliteClientBase.ts#L52)

Releases the runtime's remote listener proxy; platforms using local callbacks do not need to provide it.

#### Parameters

| Parameter  | Type                                                                                                                                                      |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `listener` | [`EventListener`](../../utils/type-aliases/EventListener.md)&lt;[`SqliteChangeEvent`](../../rxdb-adapter-sqlite-core/interfaces/SqliteChangeEvent.md)&gt; |

#### Returns

`void`

---

### resolve() \{#resolve\}

```ts
resolve(dbName, options): ResolvedWaSqliteClientOptions;
```

Defined in: [packages/rxdb-adapter-wa-sqlite/src/WaSqliteClientBase.ts:50](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-wa-sqlite/src/WaSqliteClientBase.ts#L50)

#### Parameters

| Parameter | Type       |
| --------- | ---------- |
| `dbName`  | `string`   |
| `options` | `TOptions` |

#### Returns

[`ResolvedWaSqliteClientOptions`](ResolvedWaSqliteClientOptions.md)
