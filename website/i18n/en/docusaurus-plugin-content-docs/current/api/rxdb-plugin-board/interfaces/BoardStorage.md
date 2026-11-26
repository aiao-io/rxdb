# BoardStorage

Defined in: [packages/rxdb-plugin-board/src/board-storage.ts:10](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board/src/board-storage.ts#L10)

Key-value storage interface (host-injected: browser `localStorage` / in-memory table in tests).

## Methods

### get() \{#get\}

```ts
get(key): string | null;
```

Defined in: [packages/rxdb-plugin-board/src/board-storage.ts:11](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board/src/board-storage.ts#L11)

#### Parameters

| Parameter | Type     |
| --------- | -------- |
| `key`     | `string` |

#### Returns

`string` \| `null`

---

### remove() \{#remove\}

```ts
remove(key): void;
```

Defined in: [packages/rxdb-plugin-board/src/board-storage.ts:13](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board/src/board-storage.ts#L13)

#### Parameters

| Parameter | Type     |
| --------- | -------- |
| `key`     | `string` |

#### Returns

`void`

---

### set() \{#set\}

```ts
set(key, value): void;
```

Defined in: [packages/rxdb-plugin-board/src/board-storage.ts:12](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board/src/board-storage.ts#L12)

#### Parameters

| Parameter | Type     |
| --------- | -------- |
| `key`     | `string` |
| `value`   | `string` |

#### Returns

`void`
