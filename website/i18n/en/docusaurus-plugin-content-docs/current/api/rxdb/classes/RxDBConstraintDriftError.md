# RxDBConstraintDriftError

Defined in: [packages/rxdb/src/RxDBError.ts:430](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/RxDBError.ts#L430)

Storage constraints on an existing table do not match the entity metadata declaration (US-030, thrown during `init()`).

## Remarks

The drift check is a read-only comparison: the set of constraint names deterministically generated from metadata versus the actual set of like objects
in the database catalog, with missing and extra listed separately. Three kinds are included: `ck_` CHECK, `uq_` conditional unique indexes, `ex_` range exclusions
(an `EXCLUDE` constraint on PG, its `_i` / `_u` two triggers on SQLite). Nothing is backfilled automatically — backfill is written by the user into
`migrations`, which happens to run just before the drift check; after the user migration fills it in, `init()` passes again (AC#10).

Foreign key constraints, `idx_` ordinary indexes, system CRUD triggers and FTS triggers are all outside the comparison scope (AC#16).

## Example

```typescript
try {
  await rxdb.connect('local');
} catch (error) {
  if (error instanceof RxDBConstraintDriftError) {
    console.error('missing:', error.missing, 'extra:', error.extra);
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
new RxDBConstraintDriftError(
   entity, 
   tableName, 
   missing, 
   extra, 
   tableMissing?
): RxDBConstraintDriftError;
```

Defined in: [packages/rxdb/src/RxDBError.ts:431](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/RxDBError.ts#L431)

#### Parameters

| Parameter | Type | Default value | Description |
| ------ | ------ | ------ | ------ |
| `entity` | `string` | `undefined` | The name of the entity where drift occurred (the `name` in metadata) |
| `tableName` | `string` | `undefined` | The name of the table where drift occurred (the `tableName` in metadata) |
| `missing` | readonly `string`[] | `undefined` | Constraint names declared by metadata but absent in the database |
| `extra` | readonly `string`[] | `undefined` | Constraint names present in the database but not declared by metadata |
| `tableMissing?` | `boolean` | `false` | The table itself does not exist in the catalog (missing table), named separately from "table exists but constraints mismatch" |

#### Returns

`RxDBConstraintDriftError`

#### Overrides

[`RxDBError`](RxDBError.md).[`constructor`](RxDBError.md#constructor)

## Properties

### cause? \{#cause\}

```ts
cause?: unknown;
```

Defined in: node\_modules/.pnpm/typescript@6.0.3\_patch\_hash=ef3c2292deb88eb14130359d5acc1febc0226af46b7b945db6c7250c6cb4efbb/node\_modules/typescript/lib/lib.es2022.error.d.ts:24

#### Inherited from

[`RxDBError`](RxDBError.md).[`cause`](RxDBError.md#cause)

***

### entity \{#entity\}

```ts
readonly entity: string;
```

Defined in: [packages/rxdb/src/RxDBError.ts:433](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/RxDBError.ts#L433)

The name of the entity where drift occurred (the `name` in metadata)

***

### extra \{#extra\}

```ts
readonly extra: readonly string[];
```

Defined in: [packages/rxdb/src/RxDBError.ts:439](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/RxDBError.ts#L439)

Constraint names present in the database but not declared by metadata

***

### message \{#message\}

```ts
message: string;
```

Defined in: node\_modules/.pnpm/typescript@6.0.3\_patch\_hash=ef3c2292deb88eb14130359d5acc1febc0226af46b7b945db6c7250c6cb4efbb/node\_modules/typescript/lib/lib.es5.d.ts:1075

#### Inherited from

[`RxDBError`](RxDBError.md).[`message`](RxDBError.md#message)

***

### missing \{#missing\}

```ts
readonly missing: readonly string[];
```

Defined in: [packages/rxdb/src/RxDBError.ts:437](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/RxDBError.ts#L437)

Constraint names declared by metadata but absent in the database

***

### name \{#name\}

```ts
name: string;
```

Defined in: node\_modules/.pnpm/typescript@6.0.3\_patch\_hash=ef3c2292deb88eb14130359d5acc1febc0226af46b7b945db6c7250c6cb4efbb/node\_modules/typescript/lib/lib.es5.d.ts:1074

#### Inherited from

[`RxDBError`](RxDBError.md).[`name`](RxDBError.md#name)

***

### stack? \{#stack\}

```ts
stack?: string;
```

Defined in: node\_modules/.pnpm/typescript@6.0.3\_patch\_hash=ef3c2292deb88eb14130359d5acc1febc0226af46b7b945db6c7250c6cb4efbb/node\_modules/typescript/lib/lib.es5.d.ts:1076

#### Inherited from

[`RxDBError`](RxDBError.md).[`stack`](RxDBError.md#stack)

***

### tableMissing \{#tablemissing\}

```ts
readonly tableMissing: boolean = false;
```

Defined in: [packages/rxdb/src/RxDBError.ts:441](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/RxDBError.ts#L441)

The table itself does not exist in the catalog (missing table), named separately from "table exists but constraints mismatch"

***

### tableName \{#tablename\}

```ts
readonly tableName: string;
```

Defined in: [packages/rxdb/src/RxDBError.ts:435](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/RxDBError.ts#L435)

The name of the table where drift occurred (the `tableName` in metadata)

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

[`RxDBError`](RxDBError.md).[`captureStackTrace`](RxDBError.md#capturestacktrace)

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

[`RxDBError`](RxDBError.md).[`prepareStackTrace`](RxDBError.md#preparestacktrace)
