# WorkingTreeWriteRejectedError

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/write-entry-matrix.ts:164](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/write-entry-matrix.ts#L164)

A write rejected by the gate

## Remarks

The rejection happens **before the statement executes**, leaving business tables untouched — it is not a rollback
after the write. The raw channel has no transaction to roll back at all, which is precisely why the raw channel exists.

Two discriminators are provided: `name` as a fallback within this process beyond `instanceof`, and `code` for
cross-realm discrimination. `entrance` lets the caller know which path was blocked — the same code can be thrown
at all four mount points and on all six adapters; without it, the log only says "someone wrote to a versioned table raw".

## Extends

- [`RxDBError`](../../rxdb/classes/RxDBError.md)

## Constructors

### Constructor

```ts
new WorkingTreeWriteRejectedError(rejection): WorkingTreeWriteRejectedError;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/write-entry-matrix.ts:185](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/write-entry-matrix.ts#L185)

Constructed from the five rejection points: the gate at each of the four mount points, plus the raw channel's judgment.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `rejection` | \{ `entityName?`: `string`; `entrance`: \| `"unknown"` \| `"crud"` \| `"domain_recompute"` \| `"remote_entity_apply"` \| `"cleanup_expired"` \| `"projection_rewrite"` \| `"metadata_only_prefetch"` \| `"query_cache_maintenance"` \| `"raw_write"` \| `"bulk_write"` \| `"notify_external_update"`; `message`: `string`; \} | The rejection scene: the blocked entrance, the resolved entity name (may be unresolvable on the raw channel), and the already-composed message |
| `rejection.entityName?` | `string` | - |
| `rejection.entrance` | \| `"unknown"` \| `"crud"` \| `"domain_recompute"` \| `"remote_entity_apply"` \| `"cleanup_expired"` \| `"projection_rewrite"` \| `"metadata_only_prefetch"` \| `"query_cache_maintenance"` \| `"raw_write"` \| `"bulk_write"` \| `"notify_external_update"` | - |
| `rejection.message` | `string` | - |

#### Returns

`WorkingTreeWriteRejectedError`

#### Remarks

Takes one object rather than three positional parameters: two of the three are strings, and under positional
parameters swapping `entityName` and `message` would produce no compile error — only turn the entity name in the
log into a whole sentence, when this error's whole purpose is to let the log answer "who is writing to versioned
tables raw".

#### Overrides

[`RxDBError`](../../rxdb/classes/RxDBError.md).[`constructor`](../../rxdb/classes/RxDBError.md#constructor)

## Properties

### cause? \{#cause\}

```ts
cause?: unknown;
```

Defined in: node\_modules/.pnpm/typescript@6.0.3\_patch\_hash=ef3c2292deb88eb14130359d5acc1febc0226af46b7b945db6c7250c6cb4efbb/node\_modules/typescript/lib/lib.es2022.error.d.ts:24

#### Inherited from

[`RxDBError`](../../rxdb/classes/RxDBError.md).[`cause`](../../rxdb/classes/RxDBError.md#cause)

***

### code \{#code\}

```ts
readonly code: "commit_capability_mismatch" = CommitErrorCode.commit_capability_mismatch;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/write-entry-matrix.ts:166](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/write-entry-matrix.ts#L166)

The stable error code specified by epic-006, taken from [CommitErrorCode](../variables/CommitErrorCode.md)

***

### entityName \{#entityname\}

```ts
readonly entityName: string | undefined;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/write-entry-matrix.ts:172](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/write-entry-matrix.ts#L172)

The name of the entity being written; `undefined` when no entity can be resolved on the raw channel

***

### entrance \{#entrance\}

```ts
readonly entrance: 
  | "unknown"
  | "crud"
  | "domain_recompute"
  | "remote_entity_apply"
  | "cleanup_expired"
  | "projection_rewrite"
  | "metadata_only_prefetch"
  | "query_cache_maintenance"
  | "raw_write"
  | "bulk_write"
  | "notify_external_update";
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/write-entry-matrix.ts:169](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/write-entry-matrix.ts#L169)

The write entrance that was blocked

***

### message \{#message\}

```ts
message: string;
```

Defined in: node\_modules/.pnpm/typescript@6.0.3\_patch\_hash=ef3c2292deb88eb14130359d5acc1febc0226af46b7b945db6c7250c6cb4efbb/node\_modules/typescript/lib/lib.es5.d.ts:1075

#### Inherited from

[`RxDBError`](../../rxdb/classes/RxDBError.md).[`message`](../../rxdb/classes/RxDBError.md#message)

***

### name \{#name\}

```ts
name: string;
```

Defined in: node\_modules/.pnpm/typescript@6.0.3\_patch\_hash=ef3c2292deb88eb14130359d5acc1febc0226af46b7b945db6c7250c6cb4efbb/node\_modules/typescript/lib/lib.es5.d.ts:1074

#### Inherited from

[`RxDBError`](../../rxdb/classes/RxDBError.md).[`name`](../../rxdb/classes/RxDBError.md#name)

***

### stack? \{#stack\}

```ts
stack?: string;
```

Defined in: node\_modules/.pnpm/typescript@6.0.3\_patch\_hash=ef3c2292deb88eb14130359d5acc1febc0226af46b7b945db6c7250c6cb4efbb/node\_modules/typescript/lib/lib.es5.d.ts:1076

#### Inherited from

[`RxDBError`](../../rxdb/classes/RxDBError.md).[`stack`](../../rxdb/classes/RxDBError.md#stack)

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

[`RxDBError`](../../rxdb/classes/RxDBError.md).[`stackTraceLimit`](../../rxdb/classes/RxDBError.md#stacktracelimit)

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

[`RxDBError`](../../rxdb/classes/RxDBError.md).[`captureStackTrace`](../../rxdb/classes/RxDBError.md#capturestacktrace)

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

[`RxDBError`](../../rxdb/classes/RxDBError.md).[`prepareStackTrace`](../../rxdb/classes/RxDBError.md#preparestacktrace)
