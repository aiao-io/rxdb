# encodeRxDBEntityIdentity()

```ts
function encodeRxDBEntityIdentity(id): Uint8Array;
```

Defined in: [packages/rxdb/src/system/change-codec.ts:433](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/change-codec.ts#L433)

Encodes an entity identity for AAD (Additional Authenticated Data) and identity keys.

- **String ID**: uses the UTF-8 bytes directly; checking "is it valid UTF-8" is left to deserialization;
- **Number / bigint ID**: prepends the `0xFF 0x52 0x58` magic number + version number + type byte before the byte stream.
  A leading `0xFF` is always an **illegal leading byte** in UTF-8, so deserialization can safely distinguish the two ID kinds
  by prefix alone, with no external schema hint needed.

Use cases:

1. The encryption adapter uses these bytes as AES-GCM AAD, participating in integrity verification;
2. [getRxDBEntityIdentityKey](getRxDBEntityIdentityKey.md) hex-encodes them into a stable "identity key" string.

## Parameters

| Parameter | Type                                              |
| --------- | ------------------------------------------------- |
| `id`      | [`RxDBEntityId`](../type-aliases/RxDBEntityId.md) |

## Returns

`Uint8Array`
