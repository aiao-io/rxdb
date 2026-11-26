# EncryptionContext

Defined in: [packages/rxdb-adapter-sqlite-core/src/sqlite-core.utils.ts:20](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/sqlite-core.utils.ts#L20)

Encryption context: keyring, namespace, and entity metadata resolver.

## Properties

### envelopePassthrough? \{#envelopepassthrough\}

```ts
envelopePassthrough?: boolean;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/sqlite-core.utils.ts:28](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/sqlite-core.utils.ts#L28)

Values of encrypted columns are already envelopes: write them as-is without encrypting, and throw directly on values that are not envelopes (read-only checkout snapshot creation, US-313). The keyring is not touched when opening.

---

### keyring \{#keyring\}

```ts
keyring: Keyring | null;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/sqlite-core.utils.ts:21](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/sqlite-core.utils.ts#L21)

---

### namespace \{#namespace\}

```ts
namespace: string;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/sqlite-core.utils.ts:22](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/sqlite-core.utils.ts#L22)

---

### resolveEntityMetadata? \{#resolveentitymetadata\}

```ts
resolveEntityMetadata?: (entity, namespace) =>
  | Readonly<EntityMetadataType>
  | undefined;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/sqlite-core.utils.ts:23](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/sqlite-core.utils.ts#L23)

#### Parameters

| Parameter   | Type     |
| ----------- | -------- |
| `entity`    | `string` |
| `namespace` | `string` |

#### Returns

\| `Readonly`&lt;[`EntityMetadataType`](../../rxdb/interfaces/EntityMetadataType.md)&gt;
\| `undefined`
