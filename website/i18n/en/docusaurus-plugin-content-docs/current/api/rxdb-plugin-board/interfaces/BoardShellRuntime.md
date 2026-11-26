# BoardShellRuntime

Defined in: [packages/rxdb-plugin-board/src/board-shell.ts:74](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board/src/board-shell.ts#L74)

Browser capabilities the shell depends on; defaults to [browserBoardShellRuntime](../functions/browserBoardShellRuntime.md), tests inject an in-memory implementation.

## Properties

### storage \{#storage\}

```ts
readonly storage: BoardStorage;
```

Defined in: [packages/rxdb-plugin-board/src/board-shell.ts:76](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board/src/board-shell.ts#L76)

Storage for the active position / pending switch / restore target / restoring marker (`localStorage` in the browser).

## Methods

### download() \{#download\}

```ts
download(archive, fileName): void;
```

Defined in: [packages/rxdb-plugin-board/src/board-shell.ts:89](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board/src/board-shell.ts#L89)

Hands the archive to the browser for download.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `archive` | `Blob` |
| `fileName` | `string` |

#### Returns

`void`

***

### listDatabases() \{#listdatabases\}

```ts
listDatabases(): Promise<readonly string[]>;
```

Defined in: [packages/rxdb-plugin-board/src/board-shell.ts:83](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board/src/board-shell.ts#L83)

The logical database names of existing databases: for avoiding new names and checking whether a restore target exists.

#### Returns

`Promise`&lt;readonly `string`[]&gt;

***

### reload() \{#reload\}

```ts
reload(): void;
```

Defined in: [packages/rxdb-plugin-board/src/board-shell.ts:87](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board/src/board-shell.ts#L87)

Full page reload (switching databases only ever goes through a full page reload, US-537 tech notes).

#### Returns

`void`

***

### watchStorage() \{#watchstorage\}

```ts
watchStorage(listener): () => void;
```

Defined in: [packages/rxdb-plugin-board/src/board-shell.ts:85](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board/src/board-shell.ts#L85)

Callback when another page rewrites the storage (browser `storage` event); returns an unsubscribe function.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `listener` | (`key`, `value`) => `void` |

#### Returns

() => `void`

***

### withLock() \{#withlock\}

```ts
withLock<T>(operation, wait): Promise<T>;
```

Defined in: [packages/rxdb-plugin-board/src/board-shell.ts:81](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board/src/board-shell.ts#L81)

Cross-page mutual exclusion: restore, startup read-back and residue cleanup share one lock.
When `wait` is `false`, failing to get the lock fails immediately (another page is preparing or restoring).

#### Type Parameters

| Type Parameter |
| ------ |
| <a id="type-parameter-t"></a> `T` |

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `operation` | () => `Promise`&lt;`T`&gt; |
| `wait` | `boolean` |

#### Returns

`Promise`&lt;`T`&gt;
