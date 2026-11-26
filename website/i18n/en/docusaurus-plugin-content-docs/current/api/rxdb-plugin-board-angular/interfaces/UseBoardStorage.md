# UseBoardStorage

Defined in: [packages/rxdb-plugin-board-angular/src/use-board.ts:62](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-angular/src/use-board.ts#L62)

Local record storage: remembers the last opened board (localStorage by default, in-memory table injected in tests).

## Methods

### get() \{#get\}

```ts
get(key): string | null;
```

Defined in: [packages/rxdb-plugin-board-angular/src/use-board.ts:63](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-angular/src/use-board.ts#L63)

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

Defined in: [packages/rxdb-plugin-board-angular/src/use-board.ts:64](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-angular/src/use-board.ts#L64)

#### Parameters

| Parameter | Type     |
| --------- | -------- |
| `key`     | `string` |
| `value`   | `string` |

#### Returns

`void`
