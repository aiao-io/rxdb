# UseBoardStorage

Defined in: [packages/rxdb-plugin-board-vue/src/use-board.ts:58](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-vue/src/use-board.ts#L58)

Local storage: remembers the last opened board (defaults to localStorage; tests inject an in-memory table).

## Methods

### get() \{#get\}

```ts
get(key): string | null;
```

Defined in: [packages/rxdb-plugin-board-vue/src/use-board.ts:59](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-vue/src/use-board.ts#L59)

#### Parameters

| Parameter | Type     |
| --------- | -------- |
| `key`     | `string` |

#### Returns

`string` \| `null`

---

### set() \{#set\}

```ts
set(key, value): void;
```

Defined in: [packages/rxdb-plugin-board-vue/src/use-board.ts:60](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-vue/src/use-board.ts#L60)

#### Parameters

| Parameter | Type     |
| --------- | -------- |
| `key`     | `string` |
| `value`   | `string` |

#### Returns

`void`
