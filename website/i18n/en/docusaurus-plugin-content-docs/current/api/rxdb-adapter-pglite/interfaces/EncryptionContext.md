# EncryptionContext

Defined in: [packages/rxdb-adapter-pglite/src/pglite.utils.ts:49](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/pglite.utils.ts#L49)

Encryption context, threaded through every PGlite helper that may touch encrypted columns. When the database has no encrypted columns the keyring is `null` and the helpers take the plaintext branch. Kept structurally consistent with sqlite-core's `EncryptionContext`.

## Properties

### envelopePassthrough? \{#envelopepassthrough\}

```ts
envelopePassthrough?: boolean;
```

Defined in: [packages/rxdb-adapter-pglite/src/pglite.utils.ts:57](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/pglite.utils.ts#L57)

Values of encrypted columns are already envelopes: write them down as-is without encrypting, and throw on any value that is not an envelope (read-only checkouts building snapshots, US-313). Does not touch the keyring when opened.

---

### keyring \{#keyring\}

```ts
keyring: Keyring | null;
```

Defined in: [packages/rxdb-adapter-pglite/src/pglite.utils.ts:50](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/pglite.utils.ts#L50)

---

### namespace \{#namespace\}

```ts
namespace: string;
```

Defined in: [packages/rxdb-adapter-pglite/src/pglite.utils.ts:51](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/pglite.utils.ts#L51)

---

### resolveEntityMetadata? \{#resolveentitymetadata\}

```ts
resolveEntityMetadata?: (entity, namespace) =>
  | Readonly<EntityMetadataType>
  | undefined;
```

Defined in: [packages/rxdb-adapter-pglite/src/pglite.utils.ts:52](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/pglite.utils.ts#L52)

#### Parameters

| Parameter   | Type     |
| ----------- | -------- |
| `entity`    | `string` |
| `namespace` | `string` |

#### Returns

\| `Readonly`&lt;[`EntityMetadataType`](../../rxdb/interfaces/EntityMetadataType.md)&gt;
\| `undefined`
