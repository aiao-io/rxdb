# KeyBytesUnlockOptions

Defined in: [packages/rxdb-adapter-encrypted/src/keyring.ts:75](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-encrypted/src/keyring.ts#L75)

Unlock via exactly 32 bytes of raw AES-GCM-256 key.

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

### keyBytes \{#keybytes\}

```ts
keyBytes: Uint8Array;
```

Defined in: [packages/rxdb-adapter-encrypted/src/keyring.ts:76](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-encrypted/src/keyring.ts#L76)

***

### legacyEnvelopePolicy? \{#legacyenvelopepolicy\}

```ts
legacyEnvelopePolicy?: LegacyEnvelopePolicy;
```

Defined in: [packages/rxdb-adapter-encrypted/src/keyring.ts:61](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-encrypted/src/keyring.ts#L61)

#### Inherited from

`UnlockLifecycleOptions.legacyEnvelopePolicy`