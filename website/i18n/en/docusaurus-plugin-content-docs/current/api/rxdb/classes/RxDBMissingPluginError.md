# RxDBMissingPluginError

Defined in: [packages/rxdb/src/RxDBError.ts:158](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/RxDBError.ts#L158)

A strategy was declared, but the plugin that provides it is not installed.

## Remarks

US-025 phase B moved the QueryCache read engine into `@aiao/rxdb-plugin-querycache`, but
the `SyncType.QueryCache` value stays in the core (the strategy axis is closed, and `Repository`'s branching relies on judging by it).
The gap is therefore structural: the configuration can be written even when the implementation is absent.

After phase D the same entity has **two** such gaps: the read engine in the querycache plugin, and the outbox in
`@aiao/rxdb-plugin-sync`. Each site throws its own, distinguished by [RxDBMissingPluginError.subject](#subject) —
someone who installed one but not the other must read which half is still missing, rather than a
"the engine is not installed" that is already false for them.

Thrown inside `connect()` rather than waiting for the first `find()`: configuration errors should sound at startup. It also **does not degrade to a local read**
— after degradation callers would see "the remote has no data", the same rationale as [RxDBQueryCacheCapabilityError](RxDBQueryCacheCapabilityError.md)
refusing to degrade.

## Example

```typescript
import { rxDBPluginQueryCache } from '@aiao/rxdb-plugin-querycache';

rxdb.use(rxDBPluginQueryCache);
await rxdb.connect('sqlite');
```

## Extends

- [`RxDBError`](RxDBError.md)

## Constructors

### Constructor

```ts
new RxDBMissingPluginError(
   entity,
   capability,
   packageName,
   registration,
   subject?
): RxDBMissingPluginError;
```

Defined in: [packages/rxdb/src/RxDBError.ts:159](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/RxDBError.ts#L159)

#### Parameters

| Parameter      | Type     | Default value | Description                                                                  |
| -------------- | -------- | ------------- | ---------------------------------------------------------------------------- |
| `entity`       | `string` | `undefined`   | The name of the entity that triggered this error (the `name` in metadata)    |
| `capability`   | `string` | `undefined`   | The capability this entity declares and needs plugin support for             |
| `packageName`  | `string` | `undefined`   | The package name to install                                                  |
| `registration` | `string` | `undefined`   | The registration spelling after installation                                 |
| `subject?`     | `string` | `'engine'`    | What the missing half is called, embedded into `no ${subject} is installed`. |

#### Returns

`RxDBMissingPluginError`

#### Overrides

[`RxDBError`](RxDBError.md).[`constructor`](RxDBError.md#constructor)

## Properties

### capability \{#capability\}

```ts
readonly capability: string;
```

Defined in: [packages/rxdb/src/RxDBError.ts:163](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/RxDBError.ts#L163)

The capability this entity declares and needs plugin support for

---

### cause? \{#cause\}

```ts
cause?: unknown;
```

Defined in: node\_modules/.pnpm/typescript@6.0.3\_patch\_hash=ef3c2292deb88eb14130359d5acc1febc0226af46b7b945db6c7250c6cb4efbb/node\_modules/typescript/lib/lib.es2022.error.d.ts:24

#### Inherited from

[`RxDBError`](RxDBError.md).[`cause`](RxDBError.md#cause)

---

### entity \{#entity\}

```ts
readonly entity: string;
```

Defined in: [packages/rxdb/src/RxDBError.ts:161](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/RxDBError.ts#L161)

The name of the entity that triggered this error (the `name` in metadata)

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

### packageName \{#packagename\}

```ts
readonly packageName: string;
```

Defined in: [packages/rxdb/src/RxDBError.ts:165](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/RxDBError.ts#L165)

The package name to install

---

### registration \{#registration\}

```ts
readonly registration: string;
```

Defined in: [packages/rxdb/src/RxDBError.ts:167](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/RxDBError.ts#L167)

The registration spelling after installation

---

### stack? \{#stack\}

```ts
stack?: string;
```

Defined in: node\_modules/.pnpm/typescript@6.0.3\_patch\_hash=ef3c2292deb88eb14130359d5acc1febc0226af46b7b945db6c7250c6cb4efbb/node\_modules/typescript/lib/lib.es5.d.ts:1076

#### Inherited from

[`RxDBError`](RxDBError.md).[`stack`](RxDBError.md#stack)

---

### subject \{#subject\}

```ts
readonly subject: string = 'engine';
```

Defined in: [packages/rxdb/src/RxDBError.ts:173](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/RxDBError.ts#L173)

What the missing half is called, embedded into `no ${subject} is installed`.

#### Default Value

`'engine'`

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
