# KeyProviderUnlockOptions

Defined in: [packages/rxdb-adapter-encrypted/src/keyring.ts:80](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-encrypted/src/keyring.ts#L80)

Obtains a `CryptoKey` or a 32-byte raw key through an async provider. Provider failures are wrapped in a structured error.

## Extends

- `UnlockLifecycleOptions`

## Properties

### idleTimeoutMs? \{#idletimeoutms\}

```ts
idleTimeoutMs?: number;
```

Defined in: [packages/rxdb-adapter-encrypted/src/keyring.ts:60](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-encrypted/src/keyring.ts#L60)

#### Inherited from

`UnlockLifecycleOptions.idleTimeoutMs`

---

### keyProvider \{#keyprovider\}

```ts
keyProvider: () => Promise<Uint8Array<ArrayBufferLike> | CryptoKey>;
```

Defined in: [packages/rxdb-adapter-encrypted/src/keyring.ts:81](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-encrypted/src/keyring.ts#L81)

#### Returns

`Promise`&lt;`Uint8Array`&lt;`ArrayBufferLike`&gt; \| `CryptoKey`&gt;

---

### legacyEnvelopePolicy? \{#legacyenvelopepolicy\}

```ts
legacyEnvelopePolicy?: LegacyEnvelopePolicy;
```

Defined in: [packages/rxdb-adapter-encrypted/src/keyring.ts:61](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-encrypted/src/keyring.ts#L61)

#### Inherited from

`UnlockLifecycleOptions.legacyEnvelopePolicy`
