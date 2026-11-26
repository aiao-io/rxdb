# RxDBMixedVersionedCacheTransactionError

Defined in: [packages/rxdb/src/RxDBError.ts:202](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/RxDBError.ts#L202)

A single bulk mutation mixes QueryCache entities with versioned (Full / Filter) entities.

## Remarks

The write semantics of the two are irreconcilable: versioned entities write locally and enter the changelog, QueryCache entities write to the remote first and then land in a disposable cache.
Executing them in one batch only yields "half entered the change history, half did not", so it is rejected at the entrance and the caller splits the batch.

`code` rather than `name` is this class's discriminant: the string is specified by `US-306 FR-046`, reused across stories,
and must not be renamed. It is also an entry in `@aiao/rxdb-plugin-working-tree`'s `CommitErrorCode` table — but
**this class predates that table**, and this class belongs to the core: the core depending on a plugin for a single string means making
"not installing the plugin" impossible. So the literal is written here, not taken from the table.

The two sides cannot drift: that code table is a const object, not an `enum` (its

## Fileoverview

self-description exists precisely to accommodate the bare literal this class
has long used), so the members' static types are ordinary string literals and the two sides are value-compatible; the code table side also
has a test pinning the key-value pairs byte-for-byte identical.

New errors in the other packages still discriminate primarily by class name; do not copy this class.

## Extends

- [`RxDBError`](RxDBError.md)

## Extended by

- [`MixedVersionedCacheTransactionError`](../../rxdb-plugin-working-tree/classes/MixedVersionedCacheTransactionError.md)

## Constructors

### Constructor

```ts
new RxDBMixedVersionedCacheTransactionError(cacheEntities, versionedEntities): RxDBMixedVersionedCacheTransactionError;
```

Defined in: [packages/rxdb/src/RxDBError.ts:206](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/RxDBError.ts#L206)

#### Parameters

| Parameter           | Type                | Description                                                      |
| ------------------- | ------------------- | ---------------------------------------------------------------- |
| `cacheEntities`     | readonly `string`[] | The names of entities going through QueryCache in this batch     |
| `versionedEntities` | readonly `string`[] | The names of entities going through versioned sync in this batch |

#### Returns

`RxDBMixedVersionedCacheTransactionError`

#### Overrides

[`RxDBError`](RxDBError.md).[`constructor`](RxDBError.md#constructor)

## Properties

### cacheEntities \{#cacheentities\}

```ts
readonly cacheEntities: readonly string[];
```

Defined in: [packages/rxdb/src/RxDBError.ts:208](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/RxDBError.ts#L208)

The names of entities going through QueryCache in this batch

---

### cause? \{#cause\}

```ts
cause?: unknown;
```

Defined in: node\_modules/.pnpm/typescript@6.0.3\_patch\_hash=ef3c2292deb88eb14130359d5acc1febc0226af46b7b945db6c7250c6cb4efbb/node\_modules/typescript/lib/lib.es2022.error.d.ts:24

#### Inherited from

[`RxDBError`](RxDBError.md).[`cause`](RxDBError.md#cause)

---

### code \{#code\}

```ts
readonly code: "mixed_versioned_cache_transaction" = 'mixed_versioned_cache_transaction';
```

Defined in: [packages/rxdb/src/RxDBError.ts:204](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/RxDBError.ts#L204)

The stable error code specified by US-306 FR-046; see this class for why a literal is written instead of taking from the code table

#### Remarks

---

### message \{#message\}

```ts
message: string;
```

Defined in: node\_modules/.pnpm/typescript@6.0.3\_patch\_hash=ef3c2292deb88eb14130359d5acc1febc0226af46b7b945db6c7250c6cb4efbb/node\_modules/typescript/lib/lib.es5.d.ts:1075

#### Inherited from

[`RxDBError`](RxDBError.md).[`message`](RxDBError.md#message)

---

### name \{#name\}

```ts
name: string;
```

Defined in: node\_modules/.pnpm/typescript@6.0.3\_patch\_hash=ef3c2292deb88eb14130359d5acc1febc0226af46b7b945db6c7250c6cb4efbb/node\_modules/typescript/lib/lib.es5.d.ts:1074

#### Inherited from

[`RxDBError`](RxDBError.md).[`name`](RxDBError.md#name)

---

### stack? \{#stack\}

```ts
stack?: string;
```

Defined in: node\_modules/.pnpm/typescript@6.0.3\_patch\_hash=ef3c2292deb88eb14130359d5acc1febc0226af46b7b945db6c7250c6cb4efbb/node\_modules/typescript/lib/lib.es5.d.ts:1076

#### Inherited from

[`RxDBError`](RxDBError.md).[`stack`](RxDBError.md#stack)

---

### versionedEntities \{#versionedentities\}

```ts
readonly versionedEntities: readonly string[];
```

Defined in: [packages/rxdb/src/RxDBError.ts:210](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/RxDBError.ts#L210)

The names of entities going through versioned sync in this batch

---

### stackTraceLimit \{#stacktracelimit\}

```ts
static stackTraceLimit: number;
```

Defined in: node\_modules/.pnpm/@types+node@26.6.6/node\_modules/@types/node/globals.d.ts:67

The `Error.stackTraceLimit` property specifies the number of stack frames
collected by a stack trace (whether generated by `new Error().stack` or
`Error.captureStackTrace(obj)`).

The default value is `10` but may be set to any valid JavaScript number. Changes
will affect any stack trace captured _after_ the value has been changed.

If set to a non-number value, or set to a negative number, stack traces will
not capture any frames.

#### Inherited from

[`RxDBError`](RxDBError.md).[`stackTraceLimit`](RxDBError.md#stacktracelimit)

## Methods

### captureStackTrace() \{#capturestacktrace\}

```ts
static captureStackTrace(targetObject, constructorOpt?): void;
```

Defined in: node\_modules/.pnpm/@types+node@26.6.6/node\_modules/@types/node/globals.d.ts:51

Creates a `.stack` property on `targetObject`, which when accessed returns
a string representing the location in the code at which
`Error.captureStackTrace()` was called.

```js
const myObject = {};
Error.captureStackTrace(myObject);
myObject.stack; // Similar to `new Error().stack`
```

The first line of the trace will be prefixed with
`${myObject.name}: ${myObject.message}`.

The optional `constructorOpt` argument accepts a function. If given, all frames
above `constructorOpt`, including `constructorOpt`, will be omitted from the
generated stack trace.

The `constructorOpt` argument is useful for hiding implementation
details of error generation from the user. For instance:

```js
function a() {
  b();
}

function b() {
  c();
}

function c() {
  // Create an error without stack trace to avoid calculating the stack trace twice.
  const { stackTraceLimit } = Error;
  Error.stackTraceLimit = 0;
  const error = new Error();
  Error.stackTraceLimit = stackTraceLimit;

  // Capture the stack trace above function b
  Error.captureStackTrace(error, b); // Neither function c, nor b is included in the stack trace
  throw error;
}

a();
```

#### Parameters

| Parameter         | Type       |
| ----------------- | ---------- |
| `targetObject`    | `object`   |
| `constructorOpt?` | `Function` |

#### Returns

`void`

#### Inherited from

[`RxDBError`](RxDBError.md).[`captureStackTrace`](RxDBError.md#capturestacktrace)

---

### prepareStackTrace() \{#preparestacktrace\}

```ts
static prepareStackTrace(err, stackTraces): any;
```

Defined in: node\_modules/.pnpm/@types+node@26.6.6/node\_modules/@types/node/globals.d.ts:55

#### Parameters

| Parameter     | Type         |
| ------------- | ------------ |
| `err`         | `Error`      |
| `stackTraces` | `CallSite`[] |

#### Returns

`any`

#### See

https://v8.dev/docs/stack-trace-api#customizing-stack-traces

#### Inherited from

[`RxDBError`](RxDBError.md).[`prepareStackTrace`](RxDBError.md#preparestacktrace)
