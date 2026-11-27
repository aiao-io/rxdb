# rsaDecrypt()

```ts
function rsaDecrypt(cipherText, privateKeyPem): Promise<string>;
```

Defined in: [packages/utils/src/crypto/rsaDecrypt.ts:27](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/utils/src/crypto/rsaDecrypt.ts#L27)

RSA decryption

## Parameters

| Parameter       | Type     | Description               |
| --------------- | -------- | ------------------------- |
| `cipherText`    | `string` | Base64-encoded ciphertext |
| `privateKeyPem` | `string` | PEM-format private key    |

## Returns

`Promise`&lt;`string`&gt;

The decrypted plaintext
