# decodeEnvelope()

```ts
function decodeEnvelope(text): CryptoEnvelope;
```

Defined in: [packages/rxdb-adapter-encrypted/src/envelope.ts:126](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-encrypted/src/envelope.ts#L126)

Parses from the on-disk text form.

## Parameters

| Parameter | Type |
| ------ | ------ |
| `text` | `string` |

## Returns

[`CryptoEnvelope`](../interfaces/CryptoEnvelope.md)

## Throws

Any input format error throws EncryptedDecryptError.