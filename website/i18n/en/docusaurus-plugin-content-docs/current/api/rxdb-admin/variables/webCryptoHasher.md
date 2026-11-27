# webCryptoHasher

```ts
const webCryptoHasher: PasswordHasher;
```

Defined in: [widgets/lock.ts:24](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/widgets/lock.ts#L24)

PBKDF2-SHA256 hashing backed by Web Crypto.

## Returns

The hasher.

## Throws

Throws when the environment lacks `crypto.subtle` (non-HTTPS and not localhost) at call time; never degrades to a weak hash.
