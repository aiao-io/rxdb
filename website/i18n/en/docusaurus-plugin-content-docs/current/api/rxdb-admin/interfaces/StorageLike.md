# StorageLike

Defined in: [storage.ts:2](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/storage.ts#L2)

The minimal contract of key-value string storage, which `Storage` naturally satisfies.

## Methods

### getItem() \{#getitem\}

```ts
getItem(key): string | null;
```

Defined in: [storage.ts:4](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/storage.ts#L4)

Reads a key, returning `null` when it does not exist.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `key` | `string` |

#### Returns

`string` \| `null`

***

### removeItem() \{#removeitem\}

```ts
removeItem(key): void;
```

Defined in: [storage.ts:8](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/storage.ts#L8)

Deletes a key.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `key` | `string` |

#### Returns

`void`

***

### setItem() \{#setitem\}

```ts
setItem(key, value): void;
```

Defined in: [storage.ts:6](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/storage.ts#L6)

Writes a key.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `key` | `string` |
| `value` | `string` |

#### Returns

`void`
