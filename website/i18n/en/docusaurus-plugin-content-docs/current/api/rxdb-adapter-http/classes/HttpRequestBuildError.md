# HttpRequestBuildError

Defined in: [packages/rxdb-adapter-http/src/errors.ts:270](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-http/src/errors.ts#L270)

The request failed to build **before being sent** (US-212 AC#12 / #34).

## Remarks

Its sole reason to exist is to separate "local data/config is wrong" from "the network is down". `JSON.stringify` throws a `TypeError` on a bigint, **exactly the same type** as a `fetch` transport failure throws; if it fell into `classify()`, it would be wrapped as `NetworkOfflineError`, then silently swapped for a stale cache by `offlineFallback` — dirty data and config bugs would never surface again.

The five causes share one class, distinguished by [HttpRequestBuildError.reason](#reason), for the same reason as [HttpPaginationError](HttpPaginationError.md): the caller's handling is identical (fix local, don't retry), and splitting into five classes would only add four more `instanceof` checks on the catch side.

The `method` and `url` entries target the **other two entrances of the same trap**: `fetch` throws a bare `TypeError` for both "`GET` with a body" and "unparseable URL" — the same type as a transport failure — and falling into `classify()` would likewise become a silent cache degradation. They aren't theoretical boundaries: overriding `onFetchMetadata`'s method to `GET` (it always has a body) walks right into the first one.

The `id` entry is a **data** problem, not a configuration problem, which is exactly why it isn't a [HttpConfigError](HttpConfigError.md): with an empty primary key, `PUT /Recipe/` is read by many routing frameworks as the collection endpoint, silently turning one update into a batch write; and no configuration change can fix it — reporting it as a config error would only point the investigation at an option that doesn't exist.

**Carries no `status`**, but is **not** a network error either: none of `isNetworkError`'s five criteria matches, so it neither degrades to the fallback nor gets misreported as a remote failure.

## Extends

- [`HttpAdapterError`](HttpAdapterError.md)

## Constructors

### Constructor

```ts
new HttpRequestBuildError(
   reason,
   operation,
   detail
): HttpRequestBuildError;
```

Defined in: [packages/rxdb-adapter-http/src/errors.ts:271](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-http/src/errors.ts#L271)

#### Parameters

| Parameter   | Type                                                                    |
| ----------- | ----------------------------------------------------------------------- |
| `reason`    | [`HttpRequestBuildFailure`](../type-aliases/HttpRequestBuildFailure.md) |
| `operation` | `string`                                                                |
| `detail`    | `string`                                                                |

#### Returns

`HttpRequestBuildError`

#### Overrides

[`HttpAdapterError`](HttpAdapterError.md).[`constructor`](HttpAdapterError.md#constructor)

## Properties

### cause? \{#cause\}

```ts
cause?: unknown;
```

Defined in: node\_modules/.pnpm/typescript@6.0.3\_patch\_hash=ef3c2292deb88eb14130359d5acc1febc0226af46b7b945db6c7250c6cb4efbb/node\_modules/typescript/lib/lib.es2022.error.d.ts:24

#### Inherited from

[`HttpAdapterError`](HttpAdapterError.md).[`cause`](HttpAdapterError.md#cause)

---

### code \{#code\}

```ts
readonly code: string;
```

Defined in: [packages/rxdb-adapter-http/src/errors.ts:29](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-http/src/errors.ts#L29)

#### Inherited from

[`HttpAdapterError`](HttpAdapterError.md).[`code`](HttpAdapterError.md#code)

---

### message \{#message\}

```ts
message: string;
```

Defined in: node\_modules/.pnpm/typescript@6.0.3\_patch\_hash=ef3c2292deb88eb14130359d5acc1febc0226af46b7b945db6c7250c6cb4efbb/node\_modules/typescript/lib/lib.es5.d.ts:1075

#### Inherited from

[`HttpAdapterError`](HttpAdapterError.md).[`message`](HttpAdapterError.md#message)

---

### name \{#name\}

```ts
name: string;
```

Defined in: node\_modules/.pnpm/typescript@6.0.3\_patch\_hash=ef3c2292deb88eb14130359d5acc1febc0226af46b7b945db6c7250c6cb4efbb/node\_modules/typescript/lib/lib.es5.d.ts:1074

#### Inherited from

[`HttpAdapterError`](HttpAdapterError.md).[`name`](HttpAdapterError.md#name)

---

### operation \{#operation\}

```ts
readonly operation: string;
```

Defined in: [packages/rxdb-adapter-http/src/errors.ts:273](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-http/src/errors.ts#L273)

---

### reason \{#reason\}

```ts
readonly reason: HttpRequestBuildFailure;
```

Defined in: [packages/rxdb-adapter-http/src/errors.ts:272](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-http/src/errors.ts#L272)

---

### stack? \{#stack\}

```ts
stack?: string;
```

Defined in: node\_modules/.pnpm/typescript@6.0.3\_patch\_hash=ef3c2292deb88eb14130359d5acc1febc0226af46b7b945db6c7250c6cb4efbb/node\_modules/typescript/lib/lib.es5.d.ts:1076

#### Inherited from

[`HttpAdapterError`](HttpAdapterError.md).[`stack`](HttpAdapterError.md#stack)

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

[`HttpAdapterError`](HttpAdapterError.md).[`stackTraceLimit`](HttpAdapterError.md#stacktracelimit)

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

[`HttpAdapterError`](HttpAdapterError.md).[`captureStackTrace`](HttpAdapterError.md#capturestacktrace)

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

[`HttpAdapterError`](HttpAdapterError.md).[`prepareStackTrace`](HttpAdapterError.md#preparestacktrace)
