# Keyring

Defined in: [packages/rxdb-adapter-encrypted/src/keyring.ts:190](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-encrypted/src/keyring.ts#L190)

Database-level AES-GCM-256 key lifecycle and cell envelope encrypter / decrypter.

The keyring starts locked; `unlock()` verifies or initializes the persisted verifier. `lock()` is a completion barrier:
it cancels unlock/encrypt/decrypt started earlier but not yet finished, and decrypted temporary plaintext is zeroed before rejection.
New writes always produce v2 envelopes; v1 is rejected by default and can only be read temporarily via `legacyEnvelopePolicy: 'migration'`.

## Constructors

### Constructor

```ts
new Keyring(opts): Keyring;
```

Defined in: [packages/rxdb-adapter-encrypted/src/keyring.ts:233](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-encrypted/src/keyring.ts#L233)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `opts` | `CreateKeyringOptions` |

#### Returns

`Keyring`

## Properties

### namespace \{#namespace\}

```ts
readonly namespace: string;
```

Defined in: [packages/rxdb-adapter-encrypted/src/keyring.ts:216](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-encrypted/src/keyring.ts#L216)

Database authentication domain participating in all v2 AAD.

## Accessors

### isLocked \{#islocked\}

#### Get Signature

```ts
get isLocked(): boolean;
```

Defined in: [packages/rxdb-adapter-encrypted/src/keyring.ts:219](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-encrypted/src/keyring.ts#L219)

Whether no usable in-memory key is currently available.

##### Returns

`boolean`

***

### kid \{#kid\}

#### Get Signature

```ts
get kid(): string | null;
```

Defined in: [packages/rxdb-adapter-encrypted/src/keyring.ts:224](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-encrypted/src/keyring.ts#L224)

Persistent ID of the currently unlocked key; `null` when locked.

##### Returns

`string` \| `null`

***

### lockChange$ \{#lockchange\}

#### Get Signature

```ts
get lockChange$(): Observable<boolean>;
```

Defined in: [packages/rxdb-adapter-encrypted/src/keyring.ts:229](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-encrypted/src/keyring.ts#L229)

Locked-state stream; initial value is `true`.

##### Returns

`Observable`&lt;`boolean`&gt;

## Methods

### decrypt() \{#decrypt\}

```ts
decrypt(args): Promise<Uint8Array<ArrayBufferLike>>;
```

Defined in: [packages/rxdb-adapter-encrypted/src/keyring.ts:299](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-encrypted/src/keyring.ts#L299)

Returns the plaintext bytes after verifying the envelope, kid and AAD.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `args` | [`DecryptArgs`](../interfaces/DecryptArgs.md) |

#### Returns

`Promise`&lt;`Uint8Array`&lt;`ArrayBufferLike`&gt;&gt;

#### Throws

[EncryptedLockedError](EncryptedLockedError.md) Already locked at call time, or the key was cleared before the operation completed (`lock()` or a new `unlock()`)

#### Throws

[EncryptedDecryptError](EncryptedDecryptError.md) Corrupted envelope, kid/AAD mismatch, authentication failure, or legacy reads not authorized

***

### encrypt() \{#encrypt\}

```ts
encrypt(args): Promise<string>;
```

Defined in: [packages/rxdb-adapter-encrypted/src/keyring.ts:271](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-encrypted/src/keyring.ts#L271)

Encrypts with a random 96-bit IV and a v2 AAD binding the database, entity, table, column, typed primary key and kid.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `args` | [`EncryptArgs`](../interfaces/EncryptArgs.md) |

#### Returns

`Promise`&lt;`string`&gt;

#### Throws

[EncryptedLockedError](EncryptedLockedError.md) Already locked at call time, or the key was cleared before the operation completed (`lock()` or a new `unlock()`)

***

### isInitialized() \{#isinitialized\}

```ts
isInitialized(): Promise<boolean>;
```

Defined in: [packages/rxdb-adapter-encrypted/src/keyring.ts:239](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-encrypted/src/keyring.ts#L239)

Whether the keyring singleton row has been initialized. This check neither unlocks nor verifies the verifier.

#### Returns

`Promise`&lt;`boolean`&gt;

***

### lock() \{#lock\}

```ts
lock(): void;
```

Defined in: [packages/rxdb-adapter-encrypted/src/keyring.ts:260](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-encrypted/src/keyring.ts#L260)

Clears the in-memory key, cancels the idle timer, and cancels sensitive operations started earlier but not yet finished.

#### Returns

`void`

***

### touch() \{#touch\}

```ts
touch(): void;
```

Defined in: [packages/rxdb-adapter-encrypted/src/keyring.ts:368](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-encrypted/src/keyring.ts#L368)

Re-triggers the idle auto-lock timer.
Called internally on every successful encrypt/decrypt.
Exposed for tests or advanced callers to extend the idle window without performing any encryption/decryption.

#### Returns

`void`

***

### unlock() \{#unlock\}

```ts
unlock(opts): Promise<void>;
```

Defined in: [packages/rxdb-adapter-encrypted/src/keyring.ts:250](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-encrypted/src/keyring.ts#L250)

Unlocks serially and verifies the persisted verifier.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `opts` | [`UnlockOptions`](../type-aliases/UnlockOptions.md) |

#### Returns

`Promise`&lt;`void`&gt;

#### Throws

[EncryptedConfigurationError](EncryptedConfigurationError.md) Unsupported parameter shape, key or persisted KDF

#### Throws

[EncryptedUnlockError](EncryptedUnlockError.md) Verifier mismatch (including a persisted salt / verifier corrupted beyond decoding), provider failure, or an in-flight unlock cancelled by `lock()`
