# CommitEncryptedAtRestError

Defined in: [packages/rxdb-plugin-working-tree/src/commit/commit-codec.ts:142](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/commit/commit-codec.ts#L142)

An encrypted column's value did not enter the commit in its at-rest form (FR-038).

## Remarks

It carries only **identity and location**: namespace, entity name, entity primary key, unit id, column name, property name, cause.
**It does not carry the value itself** — diagnostics such as `errorSurfaceOf` serialize the error's own properties wholesale,
and the rejected value here is very likely plaintext; including it would mean writing plaintext into logs.

The entity primary key is safe to include: `@aiao/rxdb-adapter-encrypted`'s `validateEncryptedPropertyMetadata`
forbids declaring the primary key as an encrypted column, so `entityId` is never an encrypted field value.

There is no corresponding [CommitErrorCode](../type-aliases/CommitErrorCode.md): that code table is pinned by `commit-error-codes.spec.ts` to
"exactly eight, no more, no less", while this error is pre-write argument validation, not a database state the caller needs to branch on.

## Extends

- [`RxDBError`](../../rxdb/classes/RxDBError.md)

## Constructors

### Constructor

```ts
new CommitEncryptedAtRestError(
   namespace,
   entity,
   entityId,
   unitId,
   column,
   property,
   reason
): CommitEncryptedAtRestError;
```

Defined in: [packages/rxdb-plugin-working-tree/src/commit/commit-codec.ts:152](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/commit/commit-codec.ts#L152)

Constructed only by `assertColumnEncryptedAtRest` in this file during its per-column scan.

#### Parameters

| Parameter   | Type                                                                            | Description                                                                       |
| ----------- | ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `namespace` | `string`                                                                        | The target entity's namespace                                                     |
| `entity`    | `string`                                                                        | The target entity name                                                            |
| `entityId`  | `string`                                                                        | The target entity primary key                                                     |
| `unitId`    | `string`                                                                        | The change unit the hit belongs to                                                |
| `column`    | [`CommitPatchColumn`](../type-aliases/CommitPatchColumn.md)                     | The column the hit is in                                                          |
| `property`  | `string`                                                                        | The encrypted property name at the hit                                            |
| `reason`    | [`CommitEncryptedAtRestReason`](../type-aliases/CommitEncryptedAtRestReason.md) | See [CommitEncryptedAtRestReason](../type-aliases/CommitEncryptedAtRestReason.md) |

#### Returns

`CommitEncryptedAtRestError`

#### Remarks

All seven fields are parameter properties, so the invariant "the error's own properties are exactly identity and location, and only identity and location"
can be verified at the signature level. Anyone wanting to add context to the error must change this signature rather than `Object.assign`
a field onto it at the throw site — the latter produces no compile error whatsoever, yet is enough to let the rejected value
(very likely plaintext) leak out through diagnostic serialization, and keeping it from leaking is the very reason this class exists (see the class comment).

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

---

### column \{#column\}

```ts
readonly column: CommitPatchColumn;
```

Defined in: [packages/rxdb-plugin-working-tree/src/commit/commit-codec.ts:162](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/commit/commit-codec.ts#L162)

The column the hit is in

---

### entity \{#entity\}

```ts
readonly entity: string;
```

Defined in: [packages/rxdb-plugin-working-tree/src/commit/commit-codec.ts:156](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/commit/commit-codec.ts#L156)

The target entity name

---

### entityId \{#entityid\}

```ts
readonly entityId: string;
```

Defined in: [packages/rxdb-plugin-working-tree/src/commit/commit-codec.ts:158](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/commit/commit-codec.ts#L158)

The target entity primary key

---

### message \{#message\}

```ts
message: string;
```

Defined in: node\_modules/.pnpm/typescript@6.0.3\_patch\_hash=ef3c2292deb88eb14130359d5acc1febc0226af46b7b945db6c7250c6cb4efbb/node\_modules/typescript/lib/lib.es5.d.ts:1075

#### Inherited from

[`RxDBError`](../../rxdb/classes/RxDBError.md).[`message`](../../rxdb/classes/RxDBError.md#message)

---

### name \{#name\}

```ts
name: string;
```

Defined in: node\_modules/.pnpm/typescript@6.0.3\_patch\_hash=ef3c2292deb88eb14130359d5acc1febc0226af46b7b945db6c7250c6cb4efbb/node\_modules/typescript/lib/lib.es5.d.ts:1074

#### Inherited from

[`RxDBError`](../../rxdb/classes/RxDBError.md).[`name`](../../rxdb/classes/RxDBError.md#name)

---

### namespace \{#namespace\}

```ts
readonly namespace: string;
```

Defined in: [packages/rxdb-plugin-working-tree/src/commit/commit-codec.ts:154](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/commit/commit-codec.ts#L154)

The target entity's namespace

---

### property \{#property\}

```ts
readonly property: string;
```

Defined in: [packages/rxdb-plugin-working-tree/src/commit/commit-codec.ts:164](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/commit/commit-codec.ts#L164)

The encrypted property name at the hit

---

### reason \{#reason\}

```ts
readonly reason: CommitEncryptedAtRestReason;
```

Defined in: [packages/rxdb-plugin-working-tree/src/commit/commit-codec.ts:166](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/commit/commit-codec.ts#L166)

See [CommitEncryptedAtRestReason](../type-aliases/CommitEncryptedAtRestReason.md)

---

### stack? \{#stack\}

```ts
stack?: string;
```

Defined in: node\_modules/.pnpm/typescript@6.0.3\_patch\_hash=ef3c2292deb88eb14130359d5acc1febc0226af46b7b945db6c7250c6cb4efbb/node\_modules/typescript/lib/lib.es5.d.ts:1076

#### Inherited from

[`RxDBError`](../../rxdb/classes/RxDBError.md).[`stack`](../../rxdb/classes/RxDBError.md#stack)

---

### unitId \{#unitid\}

```ts
readonly unitId: string;
```

Defined in: [packages/rxdb-plugin-working-tree/src/commit/commit-codec.ts:160](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/commit/commit-codec.ts#L160)

The change unit the hit belongs to

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

[`RxDBError`](../../rxdb/classes/RxDBError.md).[`captureStackTrace`](../../rxdb/classes/RxDBError.md#capturestacktrace)

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

[`RxDBError`](../../rxdb/classes/RxDBError.md).[`prepareStackTrace`](../../rxdb/classes/RxDBError.md#preparestacktrace)
