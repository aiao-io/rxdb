# CryptoKeyUnlockOptions

Defined in: [packages/rxdb-adapter-encrypted/src/keyring.ts:70](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-encrypted/src/keyring.ts#L70)

Unlock via an AES-GCM-256 `CryptoKey` with encrypt/decrypt usage.

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

***

### key \{#key\}

```ts
key: CryptoKey;
```

Defined in: [packages/rxdb-adapter-encrypted/src/keyring.ts:71](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-encrypted/src/keyring.ts#L71)

***

### legacyEnvelopePolicy? \{#legacyenvelopepolicy\}

```ts
legacyEnvelopePolicy?: LegacyEnvelopePolicy;
```

Defined in: [packages/rxdb-adapter-encrypted/src/keyring.ts:61](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-encrypted/src/keyring.ts#L61)

#### Inherited from

`UnlockLifecycleOptions.legacyEnvelopePolicy`