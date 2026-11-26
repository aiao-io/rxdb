# EncryptedError

Defined in: [packages/rxdb-adapter-encrypted/src/errors.ts:58](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-encrypted/src/errors.ts#L58)

Abstract base class of all errors thrown by `@aiao/rxdb-adapter-encrypted`.

Carries optional structured fields (`entity`, `property`, `hint`, `cause`)
and a stable `code` literal defined by each concrete subclass.

## Extends

- `Error`

## Extended by

- [`EncryptedConfigurationError`](EncryptedConfigurationError.md)
- [`EncryptedDecryptError`](EncryptedDecryptError.md)
- [`EncryptedLockedError`](EncryptedLockedError.md)
- [`EncryptedQueryError`](EncryptedQueryError.md)
- [`EncryptedUnlockError`](EncryptedUnlockError.md)

## Constructors

### Constructor

```ts
protected new EncryptedError(name, init?): EncryptedError;
```

Defined in: [packages/rxdb-adapter-encrypted/src/errors.ts:74](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-encrypted/src/errors.ts#L74)

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `name` | `string` | The stable public identifier of this error class and it **must** be a literal. `new.target.name` cannot be used here: that reads the constructor identity, which degrades to single letters like `"n"` / `"r"` once minified. Source-level unit tests are immune to this (source is never mangled); the degradation only shows up in the artifact installed into user projects — so the literal is the only defense. Any change here must be manually re-checked on the bundled artifact. |
| `init?` | [`EncryptedErrorInit`](../interfaces/EncryptedErrorInit.md) | Structured context |

#### Returns

`EncryptedError`

#### Overrides

`Error.constructor`

## Properties

### cause? \{#cause\}

```ts
readonly cause?: unknown;
```

Defined in: [packages/rxdb-adapter-encrypted/src/errors.ts:63](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-encrypted/src/errors.ts#L63)

#### Overrides

`Error.cause`

***

### code \{#code\}

```ts
abstract readonly code: EncryptedErrorCode;
```

Defined in: [packages/rxdb-adapter-encrypted/src/errors.ts:59](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-encrypted/src/errors.ts#L59)

***

### entity? \{#entity\}

```ts
readonly entity?: string;
```

Defined in: [packages/rxdb-adapter-encrypted/src/errors.ts:60](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-encrypted/src/errors.ts#L60)

***

### hint? \{#hint\}

```ts
readonly hint?: string;
```

Defined in: [packages/rxdb-adapter-encrypted/src/errors.ts:62](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-encrypted/src/errors.ts#L62)

***

### message \{#message\}

```ts
message: string;
```

Defined in: node\_modules/.pnpm/typescript@6.0.3\_patch\_hash=ef3c2292deb88eb14130359d5acc1febc0226af46b7b945db6c7250c6cb4efbb/node\_modules/typescript/lib/lib.es5.d.ts:1075

#### Inherited from

`Error.message`

***

### name \{#name\}

```ts
name: string;
```

Defined in: node\_modules/.pnpm/typescript@6.0.3\_patch\_hash=ef3c2292deb88eb14130359d5acc1febc0226af46b7b945db6c7250c6cb4efbb/node\_modules/typescript/lib/lib.es5.d.ts:1074

#### Inherited from

`Error.name`

***

### property? \{#property\}

```ts
readonly property?: string;
```

Defined in: [packages/rxdb-adapter-encrypted/src/errors.ts:61](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-encrypted/src/errors.ts#L61)

***

### stack? \{#stack\}

```ts
stack?: string;
```

Defined in: node\_modules/.pnpm/typescript@6.0.3\_patch\_hash=ef3c2292deb88eb14130359d5acc1febc0226af46b7b945db6c7250c6cb4efbb/node\_modules/typescript/lib/lib.es5.d.ts:1076

#### Inherited from

`Error.stack`
