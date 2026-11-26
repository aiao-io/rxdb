# rsaEncrypt()

```ts
function rsaEncrypt(text, publicKeyPem): Promise<string>;
```

Defined in: [packages/utils/src/crypto/rsaEncrypt.ts:29](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/utils/src/crypto/rsaEncrypt.ts#L29)

RSA encryption

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `text` | `string` | The plaintext |
| `publicKeyPem` | `string` | The public key in PEM format |

## Returns

`Promise`&lt;`string`&gt;

The Base64-encoded ciphertext
