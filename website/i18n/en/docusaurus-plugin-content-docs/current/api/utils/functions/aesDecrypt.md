# aesDecrypt()

```ts
function aesDecrypt(
   cipherText, 
   keyString, 
   ivString
): Promise<string>;
```

Defined in: [packages/utils/src/crypto/aesDecrypt.ts:18](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/utils/src/crypto/aesDecrypt.ts#L18)

Decrypts data using the AES-GCM algorithm

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `cipherText` | `string` | The Base64-encoded ciphertext string |
| `keyString` | `string` | The Base64-encoded AES key string |
| `ivString` | `string` | The Base64-encoded initialization vector string |

## Returns

`Promise`&lt;`string`&gt;

The decrypted plaintext string

## Throws

Throws when decryption fails

## Example

```ts
const plaintext = await aesDecrypt('encryptedData', 'keyInBase64', 'ivInBase64');
console.log(plaintext); // prints the decrypted plaintext
**Note:** uses the Web Crypto API for AES-GCM decryption
**Note:** the key length is 256 bits
**Note:** all input parameters should be valid Base64 strings
```
