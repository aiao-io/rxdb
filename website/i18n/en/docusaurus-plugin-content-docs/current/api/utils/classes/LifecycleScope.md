# LifecycleScope

Defined in: [packages/utils/src/lifecycle/lifecycle-scope.ts:45](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/utils/src/lifecycle/lifecycle-scope.ts#L45)

The lifetime of a piece of code: register "how an ownership is acquired" and "how to give it up" as a pair, and on expiry all of them are undone in reverse order, serially.

It replaces hand-written pairings scattered around — boolean guards, `Map` bookkeeping, `Array<Subscription>` lists — whose common defect is that "setup" and "teardown" live in two places, so adding one new resource risks missing its counterpart.

## Remarks

Semantics:
- Disposal runs in **reverse** order (last registered is undone first) and **serially** awaits async disposal to settle.
- One failing disposer **does not short-circuit** the others; after all of them have run, exactly one error is rethrown as-is, and more than one is thrown as an `AggregateError` preserving execution order.
- Disposal is **idempotent**, and success and failure are treated alike: repeated calls return the **same** `Promise` instance, and a first failure returns that same failed result — no retry, no new errors.
- The three states `active` → `disposing` → `disposed` advance in one direction only and cannot be revived.

This class has zero external dependencies: no process-level registry, `WeakRef`, or `FinalizationRegistry`. It is also unaware of any reactive subscription type — callers return their own unsubscribe action from setup.

## Example

```ts
const scope = new LifecycleScope('connection-epoch');
scope.acquire(() => {
  const timer = setInterval(poll, 1000);
  return () => clearInterval(timer);
}, 'poll-timer');

const pluginScope = scope.child('plugin:search');
pluginScope.acquire(() => {
  const sub = source$.subscribe(handler);
  return () => sub.unsubscribe();
}, 'source-sub');

await scope.dispose(); // pluginScope is disposed along with it; no manual bookkeeping needed
```

## Constructors

### Constructor

```ts
new LifecycleScope(label?): LifecycleScope;
```

Defined in: [packages/utils/src/lifecycle/lifecycle-scope.ts:81](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/utils/src/lifecycle/lifecycle-scope.ts#L81)

#### Parameters

| Parameter | Type | Default value | Description |
| ------ | ------ | ------ | ------ |
| `label?` | `string` | `'anonymous'` | Diagnostic label, defaulting to `'anonymous'` |

#### Returns

`LifecycleScope`

## Properties

### label \{#label\}

```ts
readonly label: string;
```

Defined in: [packages/utils/src/lifecycle/lifecycle-scope.ts:73](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/utils/src/lifecycle/lifecycle-scope.ts#L73)

Used only for diagnostics and error messages; does not participate in identity and duplicates are allowed.

## Accessors

### state \{#state\}

#### Get Signature

```ts
get state(): "active" | "disposing" | "disposed";
```

Defined in: [packages/utils/src/lifecycle/lifecycle-scope.ts:76](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/utils/src/lifecycle/lifecycle-scope.ts#L76)

Current state. Advances in one direction `active` → `disposing` → `disposed`; cannot be revived.

##### Returns

`"active"` \| `"disposing"` \| `"disposed"`

## Methods

### acquire() \{#acquire\}

```ts
acquire(setup, label?): ScopeDisposer;
```

Defined in: [packages/utils/src/lifecycle/lifecycle-scope.ts:104](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/utils/src/lifecycle/lifecycle-scope.ts#L104)

Registers one "acquire ownership + how to give it up" pair.

#### Parameters

| Parameter | Type | Default value | Description |
| ------ | ------ | ------ | ------ |
| `setup` | () => [`AcquireResult`](../type-aliases/AcquireResult.md) | `undefined` | Runs the side effect and returns how to undo it; returning `undefined` means nothing needs to be released. **One `acquire()` wraps only one possibly-throwing acquisition step** — if setup performs two steps and the second throws, the resource created by the first never enters the list and the host's rollback cannot reach it. For N resources, call `acquire()` N times, registering them in acquisition order for safe rollback. |
| `label?` | `string` | `'anonymous'` | Diagnostic label, defaulting to `'anonymous'` |

#### Returns

[`ScopeDisposer`](../type-aliases/ScopeDisposer.md)

A handle to undo this entry early on its own. Once called, the entry is out — disposal will not touch it again; repeated calls are no-ops. The handle is **not part of** the release frame (see the reentrancy contract of [LifecycleScope.dispose](#dispose)): calling this scope's `dispose()` from a disposer triggered by it will truly dispose the whole scope, instead of being treated as reentrancy and doing nothing. This cannot deadlock (the entry has already left the list **before** its disposer runs, so that release round does not wait for it), but it is asymmetric with behavior inside the release frame — before relying on either pattern, make sure you know which path you are on.

#### Throws

[LifecycleScopeDisposedError](LifecycleScopeDisposedError.md) thrown synchronously when the scope is no longer `active`; `setup` is **not executed** (no new resource is created). Disposing this scope **during** `setup` (inside the synchronous callback) is a different timeline: `setup` has already finished and the new resource is already in hand, so here it immediately takes over its disposal (calls the disposer once) and then rejects the registration — instead of quietly stuffing it into a scope whose list has already been emptied and which no `dispose()` will ever touch again (RV-063: previously the disposer was simply discarded after a state check).

***

### child() \{#child\}

```ts
child(label?): LifecycleScope;
```

Defined in: [packages/utils/src/lifecycle/lifecycle-scope.ts:133](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/utils/src/lifecycle/lifecycle-scope.ts#L133)

Opens a shorter-lived child scope within the current scope.

The child occupies its **creation position** in the parent's registration sequence: when the parent is disposed, the child is disposed as a whole at that position — neither all early nor all late. After the child is disposed on its own it is removed from the parent's list, regardless of whether its internal disposers threw.

#### Parameters

| Parameter | Type | Default value | Description |
| ------ | ------ | ------ | ------ |
| `label?` | `string` | `'anonymous'` | Diagnostic label, defaulting to `'anonymous'` |

#### Returns

`LifecycleScope`

The new child scope

#### Throws

[LifecycleScopeDisposedError](LifecycleScopeDisposedError.md) thrown synchronously when the scope is no longer `active`; **no** scope instance is returned — creating a child scope is itself a registration and follows the same rejection rules as [LifecycleScope.acquire](#acquire). Silently returning a child scope hanging under an already-disposed parent would make the caller believe registration succeeded while it would never be disposed.

***

### dispose() \{#dispose\}

```ts
dispose(): Promise<void>;
```

Defined in: [packages/utils/src/lifecycle/lifecycle-scope.ts:182](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/utils/src/lifecycle/lifecycle-scope.ts#L182)

Disposes this scope: runs all disposers in reverse order, serially, then enters `disposed`.

#### Returns

`Promise`&lt;`void`&gt;

A `Promise` that settles only after all disposers have settled.

#### Throws

When exactly one disposer fails, that error is **rethrown as-is**; when more than one fail, throws an `AggregateError` whose `errors` are ordered by **execution order**. Whether or not anything failed, the scope enters `disposed`.

#### Remarks

Idempotent, and **success and failure are treated alike**: repeated calls (including concurrent repeated calls) return the **same** `Promise` instance, and a first failure returns that same failed result. "No new error thrown" here only means the repeated call itself introduces no new error — it absolutely does not mean "replace the failed first disposal with a successful later one"; that would silently swallow the first real failure in defensive repeated disposal on the shutdown path.

A disposer calling this scope's `dispose()` **synchronously** (the `return () => scope.dispose()` pattern) is a no-op: the list is already running, so nothing is re-executed and nothing deadlocks. But a disposer calling this scope's `dispose()` **after** its own `await` is unsupported — by then it is outside the synchronous frame and receives the in-flight Promise of this round, which is itself waiting for this disposer to return; deadlock is guaranteed. To dispose during async teardown, dispose a **child scope**, not yourself.

***

### getEntries() \{#getentries\}

```ts
getEntries(): ScopeEntry[];
```

Defined in: [packages/utils/src/lifecycle/lifecycle-scope.ts:155](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/utils/src/lifecycle/lifecycle-scope.ts#L155)

Reads a tree-shaped **snapshot** of this scope's list, for asserting structure **before** disposal.

#### Returns

[`ScopeEntry`](../interfaces/ScopeEntry.md)[]

Nodes in registration order; a plain entry's `children` is `[]`, and child-scope entries recurse to the bottom. Disposing and disposed scopes return an empty array.

#### Remarks

It only reads what `this` already holds; there is no cross-instance registration — this primitive has no global registry. Calling it **changes nothing**, it can be called repeatedly, and it **does not throw** on `disposing` / `disposed`: it is a diagnostic outlet and must not become a new source of failure.

The purpose is to assert "structural defects" (registered under the wrong parent) separately from "ordering defects" (wrong order at disposal) — inferring only from the call order after disposal would mix both kinds of failure into a single assertion.
