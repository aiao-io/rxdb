# PasswordHasher

Defined in: [widgets/lock.ts:5](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/widgets/lock.ts#L5)

Password hashing.

## Methods

### hash() \{#hash\}

```ts
hash(password, salt): Promise<string>;
```

Defined in: [widgets/lock.ts:12](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/widgets/lock.ts#L12)

Hashes a password with a salt.

#### Parameters

| Parameter  | Type     | Description             |
| ---------- | -------- | ----------------------- |
| `password` | `string` | The plaintext.          |
| `salt`     | `string` | The salt (hexadecimal). |

#### Returns

`Promise`&lt;`string`&gt;

The hash (hexadecimal).
