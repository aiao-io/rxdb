# BranchNotMaterializedError

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/branch-materialization.ts:123](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/branch-materialization.ts#L123)

Insufficient materialization basis; the whole attempt rolls back entirely with `branch_not_materialized` (FR-044).

## Remarks

The discriminative power of the eight causes lives entirely in this class, which is why it is not a bare
[RxDBError](../../rxdb/classes/RxDBError.md): `stage_missing` means pull again from scratch, `stage_incomplete` means
continue from where the last pull stopped, `intent_drift` means retry with a fresh intent, `stage_tampered` means
throw this staging away wholesale and re-pull (continuing would only leave the bad pages in place), `page_conflict`
means another path is continuing the same staging (it is not corrupted itself — re-judge the resume position once
and keep pulling), and `target_already_materialized` means this branch should never have taken this path;
`source_unavailable` and `source_failed` have nothing to do with the database's state — the former means this
connection has no snapshot source yet (the sync plugin is not installed or not connected), the latter means the
source failed to deliver this time (most likely the network), and the pages already persisted stay put for the
next switch to continue from. Collapsing these into one error code would leave callers no choice but to start
over every time.

The staging is **not deleted as a side effect** of throwing: that half payload, together with its `scopeManifest`,
is exactly what diagnosing "why the last attempt did not connect" needs. Cleanup is a capability listed separately
under FR-044 (discardMaterializationAttempt); it is the caller's decision, not a side effect of the judgment.

## Extends

- [`RxDBError`](../../rxdb/classes/RxDBError.md)

## Constructors

### Constructor

```ts
new BranchNotMaterializedError(
   branchId,
   attemptId,
   reason,
   detail,
   cause?
): BranchNotMaterializedError;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/branch-materialization.ts:143](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/branch-materialization.ts#L143)

#### Parameters

| Parameter   | Type                                                                            | Description                                                                                              |
| ----------- | ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `branchId`  | `string`                                                                        | The id of the target branch whose materialization failed                                                 |
| `attemptId` | `string` \| `null`                                                              | The attempt id of this attempt, usable for cleanup or resumption; `null` when no attempt has started yet |
| `reason`    | [`BranchNotMaterializedReason`](../type-aliases/BranchNotMaterializedReason.md) | The cause                                                                                                |
| `detail`    | `string`                                                                        | A human-readable supplement                                                                              |
| `cause?`    | `unknown`                                                                       | The original error thrown by the source; only `source_failed` carries it                                 |

#### Returns

`BranchNotMaterializedError`

#### Remarks

`attemptId` is nullable because `source_unavailable` (and `source_failed` failing at intent-freeze time) is judged
**before any** attempt begins: at that moment the database has not a single staging row. Inventing a nonexistent
id would make discardMaterializationAttempt silently succeed when the user passes it (cleanup is idempotent),
so "what does this id point to" could never be answered.

`cause` is carried as-is rather than folded into `detail`: the network error's type and status code are what the
caller uses to decide between "retry later" and "prompt the user", and folding them into a string leaves only a sentence.

#### Overrides

[`RxDBError`](../../rxdb/classes/RxDBError.md).[`constructor`](../../rxdb/classes/RxDBError.md#constructor)

## Properties

### attemptId \{#attemptid\}

```ts
readonly attemptId: string | null;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/branch-materialization.ts:145](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/branch-materialization.ts#L145)

The attempt id of this attempt, usable for cleanup or resumption; `null` when no attempt has started yet

---

### branchId \{#branchid\}

```ts
readonly branchId: string;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/branch-materialization.ts:144](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/branch-materialization.ts#L144)

The id of the target branch whose materialization failed

---

### cause? \{#cause\}

```ts
readonly cause?: unknown;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/branch-materialization.ts:148](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/branch-materialization.ts#L148)

The original error thrown by the source; only `source_failed` carries it

#### Inherited from

[`RxDBError`](../../rxdb/classes/RxDBError.md).[`cause`](../../rxdb/classes/RxDBError.md#cause)

---

### code \{#code\}

```ts
readonly code: CommitErrorCode = CommitErrorCode.branch_not_materialized;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/branch-materialization.ts:125](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/branch-materialization.ts#L125)

The error code, always [CommitErrorCode.branch\_not\_materialized](../variables/CommitErrorCode.md#branch_not_materialized)

---

### detail \{#detail\}

```ts
readonly detail: string;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/branch-materialization.ts:147](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/branch-materialization.ts#L147)

A human-readable supplement

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

### reason \{#reason\}

```ts
readonly reason: BranchNotMaterializedReason;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/branch-materialization.ts:146](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/branch-materialization.ts#L146)

The cause

---

### stack? \{#stack\}

```ts
stack?: string;
```

Defined in: node\_modules/.pnpm/typescript@6.0.3\_patch\_hash=ef3c2292deb88eb14130359d5acc1febc0226af46b7b945db6c7250c6cb4efbb/node\_modules/typescript/lib/lib.es5.d.ts:1076

#### Inherited from

[`RxDBError`](../../rxdb/classes/RxDBError.md).[`stack`](../../rxdb/classes/RxDBError.md#stack)

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
