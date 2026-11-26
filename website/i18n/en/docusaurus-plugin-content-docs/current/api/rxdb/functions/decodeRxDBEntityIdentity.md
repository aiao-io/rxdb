# decodeRxDBEntityIdentity()

```ts
function decodeRxDBEntityIdentity(encoded): RxDBEntityId;
```

Defined in: [packages/rxdb/src/system/change-codec.ts:455](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/change-codec.ts#L455)

Deserialization of [encodeRxDBEntityIdentity](encodeRxDBEntityIdentity.md).

Distinguishes the two ID kinds by prefix rather than external schema: a byte stream starting with the magic number `0xFF 0x52 0x58` is
a number / bigint, otherwise the whole span is decoded as a UTF-8 string. `0xFF` is an illegal leading byte in UTF-8,
so a legitimate string ID **cannot** accidentally fall into the typed branch.

The decoder uses `fatal: true`: illegal UTF-8 throws directly instead of being silently replaced with U+FFFD —
one wrong character in an identity key points at another record, and silent degradation is far more dangerous than throwing.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `encoded` | `Uint8Array` | The bytes produced by [encodeRxDBEntityIdentity](encodeRxDBEntityIdentity.md) |

## Returns

[`RxDBEntityId`](../type-aliases/RxDBEntityId.md)

## Throws

When the magic number matches but the version byte is not a currently supported version

## Throws

When the type byte is unrecognizable, or the numeric payload is not a finite number
