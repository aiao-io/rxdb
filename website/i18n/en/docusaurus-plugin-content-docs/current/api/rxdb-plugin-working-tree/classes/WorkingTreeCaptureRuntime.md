# WorkingTreeCaptureRuntime

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/capture-hook.ts:305](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/capture-hook.ts#L305)

The capture runtime

## Remarks

One instance per database, installed onto the local adapter by `RxDB.connect()` (capability bit already on)
or `workingTree.enable()` (just flipped on). On a database without the commit capability enabled, this class
is never constructed.

## Implements

- [`WorkingTreeCaptureHook`](../../rxdb/interfaces/WorkingTreeCaptureHook.md)

## Constructors

### Constructor

```ts
new WorkingTreeCaptureRuntime(options): WorkingTreeCaptureRuntime;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/capture-hook.ts:339](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/capture-hook.ts#L339)

Constructed by [createWorkingTreeCaptureRuntime](../functions/createWorkingTreeCaptureRuntime.md); on a database
without the commit capability enabled it is never called.

#### Parameters

| Parameter | Type                                                                                    | Description                                                                                                 |
| --------- | --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `options` | [`WorkingTreeCaptureRuntimeOptions`](../interfaces/WorkingTreeCaptureRuntimeOptions.md) | All dependencies, see [WorkingTreeCaptureRuntimeOptions](../interfaces/WorkingTreeCaptureRuntimeOptions.md) |

#### Returns

`WorkingTreeCaptureRuntime`

#### Remarks

Entity classification and the system table list are frozen here; the raw SQL gate follows the physical table
catalog through the options' getters. The constructor does **not** touch the mount target — `#target` is only
written by [bindMountTarget](#bindmounttarget) at the moment of installation onto the adapter, so the same
runtime can be created first and then decide which adapter to install on.

## Accessors

### domain \{#domain\}

#### Get Signature

```ts
get domain(): VersionedDomain;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/capture-hook.ts:324](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/capture-hook.ts#L324)

The versioned domain this runtime recognizes

##### Remarks

**Not on the core's [WorkingTreeCaptureHook](../../rxdb/interfaces/WorkingTreeCaptureHook.md) contract**: the
core never reads it. Putting it there would have the core vouch for the shape of "what judgment recognizes",
which is exactly the thing that changes with the capture rules and must stay in this package.

Exposed on the class so this package itself and the conformance suites can verify "which tables are
protected". Physical table names are fetched fresh from the adapter every time: creating worktrees and
reconnecting can both add shadow tables, so the physical catalog from installation time cannot be reused.

##### Returns

[`VersionedDomain`](../interfaces/VersionedDomain.md)

## Methods

### bindMountTarget() \{#bindmounttarget\}

```ts
bindMountTarget(target): void;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/capture-hook.ts:356](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/capture-hook.ts#L356)

Claims the install host and its unintercepted primitives; called once immediately after
[installWorkingTreeCapture](../../rxdb/functions/installWorkingTreeCapture.md)

#### Parameters

| Parameter | Type                                                                                        | Description                                                                                                             |
| --------- | ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `target`  | [`WorkingTreeCaptureMountTarget`](../../rxdb/type-aliases/WorkingTreeCaptureMountTarget.md) | The adapter instance the mount points were installed on; also the scope key for adapter-level write intent declarations |

#### Returns

`void`

#### Remarks

Both are known only to the installer, yet both are needed by the runtime: `target` is the scope identity
used by [declareTrustedWrite](../../rxdb/functions/declareTrustedWrite.md) — mount points 2 / 3's callers
declare their intent on the adapter, and the runtime must hold the same object to look it up; `raw` is the
only safe entry for capture's own writes, since going through the intercepted one would immediately recurse
back into the mount point itself.

#### Implementation of

[`WorkingTreeCaptureHook`](../../rxdb/interfaces/WorkingTreeCaptureHook.md).[`bindMountTarget`](../../rxdb/interfaces/WorkingTreeCaptureHook.md#bindmounttarget)

---

### gateExternalNotify() \{#gateexternalnotify\}

```ts
gateExternalNotify<T>(
   entityName,
   namespace,
   notify
): T;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/capture-hook.ts:526](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/capture-hook.ts#L526)

Hand-off gate 2: a `notifyExternalUpdate()` call (row 11 of the write entrance semantics matrix)

#### Type Parameters

| Type Parameter                    | Description                                                                |
| --------------------------------- | -------------------------------------------------------------------------- |
| <a id="type-parameter-t"></a> `T` | The notification body's return type; passed through unchanged when allowed |

#### Parameters

| Parameter    | Type                    | Description                                          |
| ------------ | ----------------------- | ---------------------------------------------------- |
| `entityName` | `string`                | The notified entity's name                           |
| `namespace`  | `string` \| `undefined` | Used directly when known; `rxdb` means system tables |
| `notify`     | () => `T`               | The **not-yet-invoked** notification body            |

#### Returns

`T`

`notify()`'s return value itself

#### Throws

Thrown when the target is a versioned business entity; in that case not a single event is dispatched

#### Remarks

On this contract for the same reason as [gateRawWrite](../../rxdb/interfaces/WorkingTreeCaptureHook.md#gaterawwrite):
the core's `notifyExternalUpdate()` can intercept itself, but cannot answer "which class does this entity
belong to" — that requires asking the domain, and the domain belongs to capture. The core therefore only
hands over the entity identity, leaving the whole "which class, and does that class allow or reject on row
11" judgment to the runtime.

**The gate wraps the notification body; it is not an assertion added after the notification**: what it
receives is a callback that has not been called yet, so "judge first" is the only possible typing; written as
dispatch-then-check, a rejection could not stop events that have already gone out.

#### Implementation of

[`WorkingTreeCaptureHook`](../../rxdb/interfaces/WorkingTreeCaptureHook.md).[`gateExternalNotify`](../../rxdb/interfaces/WorkingTreeCaptureHook.md#gateexternalnotify)

---

### gateRawWrite() \{#gaterawwrite\}

```ts
gateRawWrite<T>(sql, execute): Promise<T>;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/capture-hook.ts:514](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/capture-hook.ts#L514)

Hand-off gate 1: a raw write statement (the 4-step judgment of adapter-contract.md §2)

#### Type Parameters

| Type Parameter                      | Description                                                                 |
| ----------------------------------- | --------------------------------------------------------------------------- |
| <a id="type-parameter-t-1"></a> `T` | The statement executor's return type; passed through unchanged when allowed |

#### Parameters

| Parameter | Type                              | Description                      |
| --------- | --------------------------------- | -------------------------------- |
| `sql`     | `string`                          | The statement text to be judged  |
| `execute` | () => `T` \| `Promise`&lt;`T`&gt; | The **not-yet-invoked** executor |

#### Returns

`Promise`&lt;`T`&gt;

`execute()`'s return value itself

#### Throws

Thrown when the target lands on a versioned business table and satisfies no allow condition; in that case
`execute` is never called

#### Remarks

`rawQuery?()` is an **optional method** on the adapter interface, so the core cannot wrap it on the adapter's
behalf the way it does the four mount points; the judgment can only be invoked by each adapter's own
implementation calling [gateRawWrite](../../rxdb/interfaces/WorkingTreeCaptureHook.md#gaterawwrite). And that
function in the core is reduced to a single dispatch: if the capability bit is false, allow it through; if
true, hand it over here. **Not one word of the judgment implementation lives in the core** — it recognizes
statement lexemes, the six physical forms of table names, and trusted intents, all three of which change with
the capture rules.

#### Implementation of

[`WorkingTreeCaptureHook`](../../rxdb/interfaces/WorkingTreeCaptureHook.md).[`gateRawWrite`](../../rxdb/interfaces/WorkingTreeCaptureHook.md#gaterawwrite)

---

### interceptBulkWrite() \{#interceptbulkwrite\}

```ts
interceptBulkWrite(
   _host,
   next,
   entityName,
   operation
): Observable<void>;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/capture-hook.ts:462](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/capture-hook.ts#L462)

Mount point 4: the gate for `upsertMany` / `deleteByIds`

#### Parameters

| Parameter    | Type                                                                      |
| ------------ | ------------------------------------------------------------------------- |
| `_host`      | [`WorkingTreeWriteHost`](../../rxdb/interfaces/WorkingTreeWriteHost.md)   |
| `next`       | () => `Observable`&lt;`void`&gt;                                          |
| `entityName` | `string`                                                                  |
| `operation`  | [`InterceptedBulkWrite`](../../rxdb/type-aliases/InterceptedBulkWrite.md) |

#### Returns

`Observable`&lt;`void`&gt;

#### Remarks

Forwards synchronously, with no `await` in between: the gate must throw before the Observable exists
(adapter-contract.md §1.1).

`entityName` is split once on `namespace:entity` before judging: this layer's contract has no separate
namespace parameter, and the qualified name is the established form (`resolveQueryCacheTarget` parses it that
way). What is sent into the gate is still the **unchanged** `entityName`, so the rejection message can point
back at the name the caller wrote.

#### Implementation of

[`WorkingTreeCaptureHook`](../../rxdb/interfaces/WorkingTreeCaptureHook.md).[`interceptBulkWrite`](../../rxdb/interfaces/WorkingTreeCaptureHook.md#interceptbulkwrite)

---

### interceptMergeChanges() \{#interceptmergechanges\}

```ts
interceptMergeChanges(
   host,
   next,
   actions,
   localChanges?,
   disableTriggers?
): Promise<number | void>;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/capture-hook.ts:410](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/capture-hook.ts#L410)

Mount point 2: local `mergeChanges`

#### Parameters

| Parameter          | Type                                                                     |
| ------------------ | ------------------------------------------------------------------------ |
| `host`             | [`WorkingTreeWriteHost`](../../rxdb/interfaces/WorkingTreeWriteHost.md)  |
| `next`             | [`MergeChangesNext`](../../rxdb/type-aliases/MergeChangesNext.md)        |
| `actions`          | [`SwitchVersionActions`](../../rxdb/interfaces/SwitchVersionActions.md)  |
| `localChanges?`    | `Omit`&lt;[`RxDBChange`](../../rxdb/classes/RxDBChange.md), `"id"`&gt;[] |
| `disableTriggers?` | `boolean`                                                                |

#### Returns

`Promise`&lt;`number` \| `void`&gt;

#### Remarks

Business writes and capture share the one transaction obtained from `host.runInTransaction()`: `mergeChanges`
also goes through `runInTransaction` internally, and dispatching it onto that transaction executor's facade
makes it reuse the transaction instead of opening a new one. So on this mount point there is no crash window
where "the business tables were written but no unit was left behind".

The change rows produced by this write must be registered into CONSUMED\_CHANGE\_IDS: when nested inside
mount point 1's transaction body (`merge_branch`'s normal strategy has exactly this shape), the outer
incremental read would otherwise judge the same batch of writes again. Outside the nested form the slot does
not exist, `has()` is false, and not even that watermark read is issued.

#### Implementation of

[`WorkingTreeCaptureHook`](../../rxdb/interfaces/WorkingTreeCaptureHook.md).[`interceptMergeChanges`](../../rxdb/interfaces/WorkingTreeCaptureHook.md#interceptmergechanges)

---

### interceptSwitchBranch() \{#interceptswitchbranch\}

```ts
interceptSwitchBranch(
   host,
   next,
   options
): Promise<void>;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/capture-hook.ts:438](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/capture-hook.ts#L438)

Mount point 3: `switchBranch`

#### Parameters

| Parameter | Type                                                                    |
| --------- | ----------------------------------------------------------------------- |
| `host`    | [`WorkingTreeWriteHost`](../../rxdb/interfaces/WorkingTreeWriteHost.md) |
| `next`    | (`options`) => `Promise`&lt;`void`&gt;                                  |
| `options` | [`SwitchBranchOptions`](../../rxdb/interfaces/SwitchBranchOptions.md)   |

#### Returns

`Promise`&lt;`void`&gt;

#### Remarks

The rejection judgment completes synchronously **before** `next()`, so an unregistered call cannot change a
single row of business data. Capture can only open its own transaction after `next()` — `switch_branch()`
opens its own transaction and flushes the change pipeline before and after, so it cannot be wrapped. See the
note on the §5 deviation at the top of this file.

#### Implementation of

[`WorkingTreeCaptureHook`](../../rxdb/interfaces/WorkingTreeCaptureHook.md).[`interceptSwitchBranch`](../../rxdb/interfaces/WorkingTreeCaptureHook.md#interceptswitchbranch)

---

### interceptTransaction() \{#intercepttransaction\}

```ts
interceptTransaction(
   _host,
   next,
   fun,
   transactionLog?
): Promise<unknown>;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/capture-hook.ts:373](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/capture-hook.ts#L373)

Mount point 1: the whole transaction shares one `unitId`

#### Parameters

| Parameter         | Type                                                                    |
| ----------------- | ----------------------------------------------------------------------- |
| `_host`           | [`WorkingTreeWriteHost`](../../rxdb/interfaces/WorkingTreeWriteHost.md) |
| `next`            | (`fun`, `transactionLog?`) => `Promise`&lt;`unknown`&gt;                |
| `fun`             | [`TransactionFun`](../../rxdb/type-aliases/TransactionFun.md)           |
| `transactionLog?` | `boolean`                                                               |

#### Returns

`Promise`&lt;`unknown`&gt;

#### Remarks

The watermark read happens before `fun` and the incremental read after `fun`, both through **the same**
executor: switching to adapter-level reads would see an uncommitted range outside the transaction, and the
number of rows captured would depend on how fast other transactions commit.

Without an intent declaration the entrance is `crud`, not a rejection — `transaction()` is the normal channel
for all business writes, and fail-closed against it would turn the whole database read-only. The trusted
paths' fail-closed sits on mount points 2 / 3.

Transaction bodies carrying the CAPTURE\_OWNED\_TRANSACTION marker are allowed through unchanged: those are
transactions mount points 2 / 3 open themselves to write working tree rows, and the business writes have
already been captured over there as trusted entrances.

#### Implementation of

[`WorkingTreeCaptureHook`](../../rxdb/interfaces/WorkingTreeCaptureHook.md).[`interceptTransaction`](../../rxdb/interfaces/WorkingTreeCaptureHook.md#intercepttransaction)

---

### targetClassOf() \{#targetclassof\}

```ts
targetClassOf(entityName, namespace?): "system" | "versioned" | "untracked";
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/capture-hook.ts:502](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/capture-hook.ts#L502)

Entity name → the target class in the write entrance semantics matrix

#### Parameters

| Parameter    | Type     | Description                                                                 |
| ------------ | -------- | --------------------------------------------------------------------------- |
| `entityName` | `string` | The entity name (without namespace)                                         |
| `namespace?` | `string` | When known, judges precisely by identity; when omitted, judges by bare name |

#### Returns

`"system"` \| `"versioned"` \| `"untracked"`

One of `system` / `untracked` / `versioned`

#### Remarks

**Ask the domain first; only if the domain does not recognize it, ask the system table list.** The domain
holds only business entities ([createWorkingTreeCaptureRuntime](../functions/createWorkingTreeCaptureRuntime.md)
already excluded system tables when building it), so "the domain recognizes this name" is itself proof that
"it is not a system table". Judging system tables first, on the other hand, is review #5's hole: once an
integration names an entity `Commit` (epic-006 happens to have an `rxdb:Commit`), that business table's
writes would be judged `system` wholesale and silently bypass capture — changes never enter commits, with no
error shape at all.

The system table list's two projections are chosen based on whether a namespace is at hand: with one, compare
identities (`rxdb:RxDBBranch`); without, compare bare names. Both are computed from the same registry
([getSystemEntityNames](../../rxdb/functions/getSystemEntityNames.md) / [getSystemEntityIdentities](../../rxdb/functions/getSystemEntityIdentities.md)),
not two separate lists. The old `namespace === 'rxdb'` blanket cut is gone: namespaces are something
integrations choose themselves, and a business entity that happens to be named `rxdb` has no reason to drop
out of version control wholesale.

Like [domain](#domain), it is **not on the core contract**: the core's `notifyExternalUpdate()` used to ask
for a classification itself and then feed the result into the gate; now it only hands over the entity
identity and the whole judgment goes through [gateExternalNotify](../functions/gateExternalNotify.md). So
"which class does it belong to" never appears on the core side at all.
