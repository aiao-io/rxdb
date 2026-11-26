# rsaGenerateKey()

```ts
function rsaGenerateKey(modulusLength?): Promise<{
  privateKey: string;
  publicKey: string;
}>;
```

Defined in: [packages/utils/src/crypto/rsaGenerateKey.ts:55](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/utils/src/crypto/rsaGenerateKey.ts#L55)

Generates an RSA key pair

## Parameters

| Parameter | Type | Default value | Description |
| ------ | ------ | ------ | ------ |
| `modulusLength?` | `number` | `2048` | The modulus length; defaults to 2048; allowed values: 1024, 2048, 4096 |

## Returns

`Promise`&lt;\{
  `privateKey`: `string`;
  `publicKey`: `string`;
\}&gt;

An object containing the public and private keys as PEM strings

## Throws

Throws when the environment lacks the Web Crypto API or key generation fails

## Example

```ts
const keyPair = await rsaGenerateKey(2048);
console.log(keyPair.publicKey);  // public key in PEM format
console.log(keyPair.privateKey); // private key in PEM format
**Note:** uses the Web Crypto API to generate an RSA-OAEP key pair
**Note:** uses the SHA-256 hash algorithm
**Note:** the public exponent is fixed at 65537 (0x010001)
**Note:** the generated keys can be used for encryption and decryption
**Note:** the PEM body is wrapped into 64 columns per RFC 7468
**Breaking change (UTL-026):** the private key label changed from `RSA PRIVATE KEY` (PKCS#1) to
`PRIVATE KEY` (PKCS#8), matching the body of `exportKey('pkcs8')`; the DER content is unchanged —
only the text label and line wrapping changed. Old PEMs already persisted / distributed do not need to be regenerated; this package's
`rsaDecrypt` / `rsaEncrypt` strip the label on import and can read both old and new text.
```
