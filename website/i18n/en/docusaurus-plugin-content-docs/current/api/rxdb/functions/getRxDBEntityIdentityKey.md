# getRxDBEntityIdentityKey()

```ts
function getRxDBEntityIdentityKey(id): string;
```

Defined in: [packages/rxdb/src/system/change-codec.ts:476](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/change-codec.ts#L476)

Computes a stable, indexable "identity key" string: `rxid1:` + hex of the encoded bytes.

Used as the directory bucket primary key of encrypted adapters (`Map<identityKey, encryptedData>`). It can never collide with a raw ID — the prefix is a fixed non-empty string that can never appear inside a legal ID.

## Parameters

| Parameter | Type                                              |
| --------- | ------------------------------------------------- |
| `id`      | [`RxDBEntityId`](../type-aliases/RxDBEntityId.md) |

## Returns

`string`
