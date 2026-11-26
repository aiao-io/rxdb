# MixedVersionedCacheTransactionError

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/versioned-domain.ts:258](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/versioned-domain.ts#L258)

QueryCache entities and other entities were mixed into the same transaction unit

## Remarks

Inherits the existing [RxDBMixedVersionedCacheTransactionError](../../rxdb/classes/RxDBMixedVersionedCacheTransactionError.md) instead of starting a new class: spec.md specifies that
it is the carrier, so existing `catch` branches and `instanceof` checks keep matching, and the `cacheEntities` /
`versionedEntities` arrays remain readable as usual. What is added here is something **only the streaming guard knows** — which two
entities collided. The parent class's array shape serves the batch path of "scan the whole batch, then report"; on that path there is no concept of "which operation collided".
The two fields reuse the parent's two-side naming: the "versioned" side is all entities outside QueryCache,
consistent with the core's `isQueryCacheBatch` split.

Throwing rolls back the whole transaction: the write semantics of the two are irreconcilable (other entities write local transactions, QueryCache entities
write to the remote first and then land in a discardable cache), so the same batch would only end up "half into the local transaction, half already sent to the remote". The rollback is guaranteed by the adapter
(throw ⇒ rollback), not by this class.

## Extends

- [`RxDBMixedVersionedCacheTransactionError`](../../rxdb/classes/RxDBMixedVersionedCacheTransactionError.md)

## Constructors

### Constructor

```ts
new MixedVersionedCacheTransactionError(versionedEntityName, cacheEntityName): MixedVersionedCacheTransactionError;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/versioned-domain.ts:267](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/versioned-domain.ts#L267)

Constructed only by `createTransactionGuard()` at the moment the entity from **the other side** first appears.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `versionedEntityName` | `string` | Name of the first non-QueryCache entity hit in this transaction |
| `cacheEntityName` | `string` | Name of the first QueryCache entity hit in this transaction |

#### Returns

`MixedVersionedCacheTransactionError`

#### Remarks

The two parameters take the **first one hit** on each side, not the full set (reason in `createTransactionGuard`).
When handed to the parent class, each is wrapped into a single-element array: the parent's two array shapes serve the batch path of "scan the whole batch, then report",
while on the streaming guard side there is no full set to hand over at all.

#### Overrides

[`RxDBMixedVersionedCacheTransactionError`](../../rxdb/classes/RxDBMixedVersionedCacheTransactionError.md).[`constructor`](../../rxdb/classes/RxDBMixedVersionedCacheTransactionError.md#constructor)

## Properties

### cacheEntities \{#cacheentities\}

```ts
readonly cacheEntities: readonly string[];
```

Defined in: packages/rxdb/dist/RxDBError.d.ts:192

Names of the entities in this batch that go through QueryCache

#### Inherited from

[`RxDBMixedVersionedCacheTransactionError`](../../rxdb/classes/RxDBMixedVersionedCacheTransactionError.md).[`cacheEntities`](../../rxdb/classes/RxDBMixedVersionedCacheTransactionError.md#cacheentities)

***

### cacheEntityName \{#cacheentityname\}

```ts
readonly cacheEntityName: string;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/versioned-domain.ts:271](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/versioned-domain.ts#L271)

Name of the first QueryCache entity hit in this transaction

***

### cause? \{#cause\}

```ts
cause?: unknown;
```

Defined in: node\_modules/.pnpm/typescript@6.0.3\_patch\_hash=ef3c2292deb88eb14130359d5acc1febc0226af46b7b945db6c7250c6cb4efbb/node\_modules/typescript/lib/lib.es2022.error.d.ts:24

#### Inherited from

[`RxDBMixedVersionedCacheTransactionError`](../../rxdb/classes/RxDBMixedVersionedCacheTransactionError.md).[`cause`](../../rxdb/classes/RxDBMixedVersionedCacheTransactionError.md#cause)

***

### code \{#code\}

```ts
readonly code: "mixed_versioned_cache_transaction" = "mixed_versioned_cache_transaction";
```

Defined in: packages/rxdb/dist/RxDBError.d.ts:196

Stable error code specified by US-306 FR-046; the reason for writing a literal instead of taking from the code table is in this class

#### Remarks

#### Inherited from

[`RxDBMixedVersionedCacheTransactionError`](../../rxdb/classes/RxDBMixedVersionedCacheTransactionError.md).[`code`](../../rxdb/classes/RxDBMixedVersionedCacheTransactionError.md#code)

***

### message \{#message\}

```ts
message: string;
```

Defined in: node\_modules/.pnpm/typescript@6.0.3\_patch\_hash=ef3c2292deb88eb14130359d5acc1febc0226af46b7b945db6c7250c6cb4efbb/node\_modules/typescript/lib/lib.es5.d.ts:1075

#### Inherited from

[`RxDBMixedVersionedCacheTransactionError`](../../rxdb/classes/RxDBMixedVersionedCacheTransactionError.md).[`message`](../../rxdb/classes/RxDBMixedVersionedCacheTransactionError.md#message)

***

### name \{#name\}

```ts
name: string;
```

Defined in: node\_modules/.pnpm/typescript@6.0.3\_patch\_hash=ef3c2292deb88eb14130359d5acc1febc0226af46b7b945db6c7250c6cb4efbb/node\_modules/typescript/lib/lib.es5.d.ts:1074

#### Inherited from

[`RxDBMixedVersionedCacheTransactionError`](../../rxdb/classes/RxDBMixedVersionedCacheTransactionError.md).[`name`](../../rxdb/classes/RxDBMixedVersionedCacheTransactionError.md#name)

***

### stack? \{#stack\}

```ts
stack?: string;
```

Defined in: node\_modules/.pnpm/typescript@6.0.3\_patch\_hash=ef3c2292deb88eb14130359d5acc1febc0226af46b7b945db6c7250c6cb4efbb/node\_modules/typescript/lib/lib.es5.d.ts:1076

#### Inherited from

[`RxDBMixedVersionedCacheTransactionError`](../../rxdb/classes/RxDBMixedVersionedCacheTransactionError.md).[`stack`](../../rxdb/classes/RxDBMixedVersionedCacheTransactionError.md#stack)

***

### versionedEntities \{#versionedentities\}

```ts
readonly versionedEntities: readonly string[];
```

Defined in: packages/rxdb/dist/RxDBError.d.ts:194

Names of the entities in this batch that go through versioned sync

#### Inherited from

[`RxDBMixedVersionedCacheTransactionError`](../../rxdb/classes/RxDBMixedVersionedCacheTransactionError.md).[`versionedEntities`](../../rxdb/classes/RxDBMixedVersionedCacheTransactionError.md#versionedentities)

***

### versionedEntityName \{#versionedentityname\}

```ts
readonly versionedEntityName: string;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/versioned-domain.ts:269](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/versioned-domain.ts#L269)

Name of the first non-QueryCache entity hit in this transaction

***

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

[`RxDBMixedVersionedCacheTransactionError`](../../rxdb/classes/RxDBMixedVersionedCacheTransactionError.md).[`stackTraceLimit`](../../rxdb/classes/RxDBMixedVersionedCacheTransactionError.md#stacktracelimit)

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
myObject.stack;  // Similar to `new Error().stack`
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

| Parameter | Type |
| ------ | ------ |
| `targetObject` | `object` |
| `constructorOpt?` | `Function` |

#### Returns

`void`

#### Inherited from

[`RxDBMixedVersionedCacheTransactionError`](../../rxdb/classes/RxDBMixedVersionedCacheTransactionError.md).[`captureStackTrace`](../../rxdb/classes/RxDBMixedVersionedCacheTransactionError.md#capturestacktrace)

***

### prepareStackTrace() \{#preparestacktrace\}

```ts
static prepareStackTrace(err, stackTraces): any;
```

Defined in: node\_modules/.pnpm/@types+node@26.6.6/node\_modules/@types/node/globals.d.ts:55

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `err` | `Error` |
| `stackTraces` | `CallSite`[] |

#### Returns

`any`

#### See

https://v8.dev/docs/stack-trace-api#customizing-stack-traces

#### Inherited from

[`RxDBMixedVersionedCacheTransactionError`](../../rxdb/classes/RxDBMixedVersionedCacheTransactionError.md).[`prepareStackTrace`](../../rxdb/classes/RxDBMixedVersionedCacheTransactionError.md#preparestacktrace)
