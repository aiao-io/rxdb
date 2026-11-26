# decodeJWTPayload()

```ts
function decodeJWTPayload<T>(token): T;
```

Defined in: [packages/utils/src/crypto/decodeJWTPayload.ts:32](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/utils/src/crypto/decodeJWTPayload.ts#L32)

Decodes the payload segment of a JWT token

Decoding only — the signature is **not verified**, so the result must not be used for any authentication decision.

## Type Parameters

| Type Parameter                    | Default type                        | Description                                                                                |
| --------------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------ |
| <a id="type-parameter-t"></a> `T` | `Record`&lt;`string`, `unknown`&gt; | The expected payload shape, declared by the caller (defaults to `Record<string, unknown>`) |

## Parameters

| Parameter | Type     | Description                                         |
| --------- | -------- | --------------------------------------------------- |
| `token`   | `string` | A JWT string of the form `header.payload.signature` |

## Returns

`T`

The parsed payload

## Throws

`JWT is not valid: not a JWT structure` when the structure does not have three segments

## Throws

`JWT payload decode failed: ...` on base64 or JSON parse failure, with the original error attached to `cause`

## Example

```ts
interface Claims `{ sub: string; exp: number }`
const claims = decodeJWTPayload<Claims>(token);
**Note:** the payload is decoded as UTF-8; non-ASCII claims (Chinese, emoji) are not garbled
**Note:** the return value is not validated at runtime; `T` is only a type assertion
```
