# parseRxDBEntityIdentityKey()

```ts
function parseRxDBEntityIdentityKey(key): RxDBEntityId;
```

Defined in: [packages/rxdb/src/system/change-codec.ts:484](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/change-codec.ts#L484)

The inverse of [getRxDBEntityIdentityKey](getRxDBEntityIdentityKey.md); a key without the prefix is treated as a "non-identity key" and
returned unchanged — so `parseRxDBEntityIdentityKey(decodeRxDBEntityIdentityKey(x)) === x`
never throws for any string `x`, and callers can round-trip unconditionally.

## Parameters

| Parameter | Type |
| ------ | ------ |
| `key` | `string` |

## Returns

[`RxDBEntityId`](../type-aliases/RxDBEntityId.md)
