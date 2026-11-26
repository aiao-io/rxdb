# RxDBExclusionViolationError

Defined in: [packages/rxdb/src/RxDBError.ts:383](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/RxDBError.ts#L383)

A write together with existing rows violated a range exclusion constraint declared by entity metadata (US-030 phase C).

## Remarks

Both backends are normalized to **the same error class**: PG recognizes SQLSTATE `23P01` (`EXCLUDE USING gist`),
SQLite recognizes the exclusion trigger's `rxdb:exclusion_violation:<constraint name>:` message; writes via direct SQL
do not get this class, only the native message.

`ranges` gives the **both sides'** ranges dimension by dimension: the row of this write (`incoming`) and the existing conflicting row (`existing`), with endpoints taken from
PG's `DETAIL` or the trigger message; `null` means that side is unbounded. When the backend does not report conflicting keys (PGlite's worker
mode only returns the error message text), `ranges` is empty while the constraint name is still accurate.

## Example

```typescript
try {
  await rxdb.entityManager.save(occurrence);
} catch (error) {
  if (error instanceof RxDBExclusionViolationError) {
    console.error(`${error.entity} violates the exclusion constraint ${error.constraint}:`, error.ranges);
  } else {
    throw error;
  }
}
```

## Extends

- [`RxDBError`](RxDBError.md)

## Constructors

### Constructor

```ts
new RxDBExclusionViolationError(
   entity,
   constraint,
   ranges,
   cause?
): RxDBExclusionViolationError;
```

Defined in: [packages/rxdb/src/RxDBError.ts:384](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/RxDBError.ts#L384)

#### Parameters

| Parameter    | Type                                                                           | Description                                                                                                                                 |
| ------------ | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `entity`     | `string`                                                                       | Name of the entity that violated the constraint (the `name` in metadata)                                                                    |
| `constraint` | `string`                                                                       | Constraint name (a deterministic name starting with `ex_`)                                                                                  |
| `ranges`     | readonly [`ExclusionRangeConflict`](../interfaces/ExclusionRangeConflict.md)[] | The both sides' ranges dimension by dimension; empty when the backend does not report conflicting keys                                      |
| `cause?`     | `unknown`                                                                      | The original violation error thrown by the adapter (the repository `cause` convention, see [RxDBPartialSyncError](RxDBPartialSyncError.md)) |

#### Returns

`RxDBExclusionViolationError`

#### Overrides

[`RxDBError`](RxDBError.md).[`constructor`](RxDBError.md#constructor)

## Properties

### cause? \{#cause\}

```ts
readonly cause?: unknown;
```

Defined in: [packages/rxdb/src/RxDBError.ts:392](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/RxDBError.ts#L392)

The original violation error thrown by the adapter (the repository `cause` convention, see [RxDBPartialSyncError](RxDBPartialSyncError.md))

#### Inherited from

[`RxDBError`](RxDBError.md).[`cause`](RxDBError.md#cause)

---

### constraint \{#constraint\}

```ts
readonly constraint: string;
```

Defined in: [packages/rxdb/src/RxDBError.ts:388](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/RxDBError.ts#L388)

Constraint name (a deterministic name starting with `ex_`)

---

### entity \{#entity\}

```ts
readonly entity: string;
```

Defined in: [packages/rxdb/src/RxDBError.ts:386](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/RxDBError.ts#L386)

Name of the entity that violated the constraint (the `name` in metadata)

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

### ranges \{#ranges\}

```ts
readonly ranges: readonly ExclusionRangeConflict[];
```

Defined in: [packages/rxdb/src/RxDBError.ts:390](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/RxDBError.ts#L390)

The both sides' ranges dimension by dimension; empty when the backend does not report conflicting keys

---

### stack? \{#stack\}

```ts
stack?: string;
```

Defined in: node\_modules/.pnpm/typescript@6.0.3\_patch\_hash=ef3c2292deb88eb14130359d5acc1febc0226af46b7b945db6c7250c6cb4efbb/node\_modules/typescript/lib/lib.es5.d.ts:1076

#### Inherited from

[`RxDBError`](RxDBError.md).[`stack`](RxDBError.md#stack)

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
