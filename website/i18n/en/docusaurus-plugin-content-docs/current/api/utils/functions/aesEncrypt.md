# aesEncrypt()

```ts
function aesEncrypt(text): Promise<{
  cipherText: string;
  iv: string;
  key: string;
}>;
```

Defined in: [packages/utils/src/crypto/aesEncrypt.ts:27](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/utils/src/crypto/aesEncrypt.ts#L27)

AES encryption

## Parameters

| Parameter | Type     | Description   |
| --------- | -------- | ------------- |
| `text`    | `string` | The plaintext |

## Returns

`Promise`&lt;\{
`cipherText`: `string`;
`iv`: `string`;
`key`: `string`;
\}&gt;

The encryption result. The returned key must be stored separately from the ciphertext and protected independently
