# EncryptedDecryptError

Defined in: [packages/rxdb-adapter-encrypted/src/errors.ts:142](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-encrypted/src/errors.ts#L142)

Envelope-layer failure on read.

## Extends

- [`EncryptedError`](EncryptedError.md)

## Constructors

### Constructor

```ts
new EncryptedDecryptError(init): EncryptedDecryptError;
```

Defined in: [packages/rxdb-adapter-encrypted/src/errors.ts:144](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-encrypted/src/errors.ts#L144)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `init` | [`EncryptedErrorInit`](../interfaces/EncryptedErrorInit.md) & `object` |

#### Returns

`EncryptedDecryptError`

#### Overrides

[`EncryptedError`](EncryptedError.md).[`constructor`](EncryptedError.md#constructor)

## Properties

### cause? \{#cause\}

```ts
readonly cause?: unknown;
```

Defined in: [packages/rxdb-adapter-encrypted/src/errors.ts:63](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-encrypted/src/errors.ts#L63)

#### Inherited from

[`EncryptedError`](EncryptedError.md).[`cause`](EncryptedError.md#cause)

***

### code \{#code\}

```ts
readonly code: DecryptCode;
```

Defined in: [packages/rxdb-adapter-encrypted/src/errors.ts:143](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-encrypted/src/errors.ts#L143)

#### Overrides

[`EncryptedError`](EncryptedError.md).[`code`](EncryptedError.md#code)

***

### entity? \{#entity\}

```ts
readonly entity?: string;
```

Defined in: [packages/rxdb-adapter-encrypted/src/errors.ts:60](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-encrypted/src/errors.ts#L60)

#### Inherited from

[`EncryptedError`](EncryptedError.md).[`entity`](EncryptedError.md#entity)

***

### hint? \{#hint\}

```ts
readonly hint?: string;
```

Defined in: [packages/rxdb-adapter-encrypted/src/errors.ts:62](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-encrypted/src/errors.ts#L62)

#### Inherited from

[`EncryptedError`](EncryptedError.md).[`hint`](EncryptedError.md#hint)

***

### message \{#message\}

```ts
message: string;
```

Defined in: node\_modules/.pnpm/typescript@6.0.3\_patch\_hash=ef3c2292deb88eb14130359d5acc1febc0226af46b7b945db6c7250c6cb4efbb/node\_modules/typescript/lib/lib.es5.d.ts:1075

#### Inherited from

[`EncryptedError`](EncryptedError.md).[`message`](EncryptedError.md#message)

***

### name \{#name\}

```ts
name: string;
```

Defined in: node\_modules/.pnpm/typescript@6.0.3\_patch\_hash=ef3c2292deb88eb14130359d5acc1febc0226af46b7b945db6c7250c6cb4efbb/node\_modules/typescript/lib/lib.es5.d.ts:1074

#### Inherited from

[`EncryptedError`](EncryptedError.md).[`name`](EncryptedError.md#name)

***

### property? \{#property\}

```ts
readonly property?: string;
```

Defined in: [packages/rxdb-adapter-encrypted/src/errors.ts:61](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-encrypted/src/errors.ts#L61)

#### Inherited from

[`EncryptedError`](EncryptedError.md).[`property`](EncryptedError.md#property)

***

### stack? \{#stack\}

```ts
stack?: string;
```

Defined in: node\_modules/.pnpm/typescript@6.0.3\_patch\_hash=ef3c2292deb88eb14130359d5acc1febc0226af46b7b945db6c7250c6cb4efbb/node\_modules/typescript/lib/lib.es5.d.ts:1076

#### Inherited from

[`EncryptedError`](EncryptedError.md).[`stack`](EncryptedError.md#stack)
