# PassphraseUnlockOptions

Defined in: [packages/rxdb-adapter-encrypted/src/keyring.ts:65](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-encrypted/src/keyring.ts#L65)

Unlock options that derive and verify the persisted keyring from a PBKDF2 passphrase.

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

### legacyEnvelopePolicy? \{#legacyenvelopepolicy\}

```ts
legacyEnvelopePolicy?: LegacyEnvelopePolicy;
```

Defined in: [packages/rxdb-adapter-encrypted/src/keyring.ts:61](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-encrypted/src/keyring.ts#L61)

#### Inherited from

`UnlockLifecycleOptions.legacyEnvelopePolicy`

***

### passphrase \{#passphrase\}

```ts
passphrase: string;
```

Defined in: [packages/rxdb-adapter-encrypted/src/keyring.ts:66](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-encrypted/src/keyring.ts#L66)
