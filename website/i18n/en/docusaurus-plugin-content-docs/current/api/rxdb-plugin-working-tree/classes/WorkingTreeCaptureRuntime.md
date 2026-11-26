# WorkingTreeCaptureRuntime

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/capture-hook.ts:305](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/capture-hook.ts#L305)

Capture runtime

## Remarks

One instance per database, installed on the local adapter by `RxDB.connect()` (capability bit already on) or `workingTree.enable()` (just turned on).
On a database without commit capability enabled, this class is never constructed even once.

## Implements

- [`WorkingTreeCaptureHook`](../../rxdb/interfaces/WorkingTreeCaptureHook.md)

## Constructors

### Constructor

```ts
new WorkingTreeCaptureRuntime(options): WorkingTreeCaptureRuntime;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/capture-hook.ts:339](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/capture-hook.ts#L339)

Constructed by [createWorkingTreeCaptureRuntime](../functions/createWorkingTreeCaptureRuntime.md); on a database without commit capability enabled it is never invoked even once.

#### Parameters

| Parameter | Type                                                                                    | Description                                                                                                 |
| --------- | --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `options` | [`WorkingTreeCaptureRuntimeOptions`](../interfaces/WorkingTreeCaptureRuntimeOptions.md) | All dependencies, see [WorkingTreeCaptureRuntimeOptions](../interfaces/WorkingTreeCaptureRuntimeOptions.md) |

#### Returns

`WorkingTreeCaptureRuntime`

#### Remarks

Entity classification and the system table list are frozen here; the raw SQL gate follows the physical table catalog through the option's getters.
The constructor does **not** touch the mount target — `#target` is written by
[bindMountTarget](#bindmounttarget) only at the moment of installation onto the adapter, so the same runtime can be built first,
then decide which adapter to install on.

## Accessors

### domain \{#domain\}

#### Get Signature

```ts
get domain(): VersionedDomain;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/capture-hook.ts:324](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/capture-hook.ts#L324)

The versioned domain this runtime recognizes

##### Remarks

**Not on the core's [WorkingTreeCaptureHook](../../rxdb/interfaces/WorkingTreeCaptureHook.md) contract**: the core never reads it. Putting it there would make the core
vouch for the shape of "what the judgment recognizes", which is exactly the thing that changes with capture rules and must stay in this package.

Exposed on the class for this package itself and the conformance suite to check "which tables are protected". Physical table names are fetched from the adapter each time:
creating checkouts and reconnecting can both add shadow tables, so the physical catalog at install time cannot be reused.

##### Returns

[`VersionedDomain`](../interfaces/VersionedDomain.md)

## Methods

### bindMountTarget() \{#bindmounttarget\}

```ts
bindMountTarget(target): void;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/capture-hook.ts:356](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/capture-hook.ts#L356)

Claims the installation host and its unintercepted primitives; called once immediately after [installWorkingTreeCapture](../../rxdb/functions/installWorkingTreeCapture.md)

#### Parameters

| Parameter | Type                                                                                        | Description                                                                                                            |
| --------- | ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `target`  | [`WorkingTreeCaptureMountTarget`](../../rxdb/type-aliases/WorkingTreeCaptureMountTarget.md) | The adapter instance the mount points are installed on; also the scope key for adapter-level write intent declarations |

#### Returns

`void`

#### Remarks

Both things are known only to the installer, and the runtime needs both: `target` is
the scope identity used by [declareTrustedWrite](../../rxdb/functions/declareTrustedWrite.md) — callers of mount points 2 / 3 declare intent on the adapter,
and the runtime must hold the same object to look it up; `raw` is the only safe entry for capture's own writes,
since going through the intercepted one would immediately recurse back into the mount point itself.

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

Hand-off gate 2: one `notifyExternalUpdate()` (write entrance semantics matrix row 11)

#### Type Parameters

| Type Parameter                    | Description                                                             |
| --------------------------------- | ----------------------------------------------------------------------- |
| <a id="type-parameter-t"></a> `T` | Return type of the notification body; passed through as-is when allowed |

#### Parameters

| Parameter    | Type                    | Description                                          |
| ------------ | ----------------------- | ---------------------------------------------------- |
| `entityName` | `string`                | Name of the entity being notified                    |
| `namespace`  | `string` \| `undefined` | Used directly when known; `rxdb` means system tables |
| `notify`     | () => `T`               | The notification body, **not yet called**            |

#### Returns

`T`

The return value of `notify()` itself

#### Throws

Thrown when the target is a versioned business entity; in that case no event is dispatched at all

#### Remarks

It sits on this contract for the same reason as [gateRawWrite](../../rxdb/interfaces/WorkingTreeCaptureHook.md#gaterawwrite): the core's `notifyExternalUpdate()` can stop
itself, but cannot answer "which category does this entity belong to" — that requires the domain, and the domain is capture's. The core therefore only hands over the entity identity,
leaving the whole "which category, and does row 11 allow or reject this category" to the runtime.

**The gate wraps the notification body, it is not an assertion appended after the notification**: what it receives is an uncalled callback, so "judge first" is
the only possible formulation at the type level; written as dispatch-first-check-later, rejection could not prevent the event from already having gone out.

#### Implementation of

[`WorkingTreeCaptureHook`](../../rxdb/interfaces/WorkingTreeCaptureHook.md).[`gateExternalNotify`](../../rxdb/interfaces/WorkingTreeCaptureHook.md#gateexternalnotify)

---

### gateRawWrite() \{#gaterawwrite\}

```ts
gateRawWrite<T>(sql, execute): Promise<T>;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/capture-hook.ts:514](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/capture-hook.ts#L514)

Hand-off gate 1: one raw write statement (the 4-step judgment of adapter-contract.md §2)

#### Type Parameters

| Type Parameter                      | Description                                                                    |
| ----------------------------------- | ------------------------------------------------------------------------------ |
| <a id="type-parameter-t-1"></a> `T` | Return type of the statement execution body; passed through as-is when allowed |

#### Parameters

| Parameter | Type                              | Description                                 |
| --------- | --------------------------------- | ------------------------------------------- |
| `sql`     | `string`                          | The original text of the statement to judge |
| `execute` | () => `T` \| `Promise`&lt;`T`&gt; | The execution body, **not yet called**      |

#### Returns

`Promise`&lt;`T`&gt;

The return value of `execute()` itself

#### Throws

Thrown when the target is a versioned business table and no allow condition is met; in that case `execute` is never called even once

#### Remarks

`rawQuery?()` is an **optional method** on the adapter interface; the core package cannot wrap it on behalf of the adapter the way it does the four mount points,
so the judgment can only be triggered by each adapter's own implementation calling [gateRawWrite](../../rxdb/interfaces/WorkingTreeCaptureHook.md#gaterawwrite). And that function is reduced to a single dispatch in the core:
pass through directly when the capability bit is false, hand over here when true. **Not one word of the judgment implementation is in the core** — it recognizes statement lexemes,
the six physical forms of table names, and trusted intent, all three of which change with capture rules.

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

Synchronous forwarding, no `await` in between: the gate must throw before the Observable exists (adapter-contract.md §1.1).

`entityName` is split once on `namespace:entity` before judging: this layer's contract has no separate namespace parameter,
and the qualified name is the established form (`resolveQueryCacheTarget` parses it that way). What goes into the gate is still the **original**
`entityName`, so the rejection message can point back at the name the caller wrote.

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

Business writes and capture share the one transaction obtained via `host.runInTransaction()`: inside, `mergeChanges` also goes through
`runInTransaction`; routing it to the facade of that transaction executor makes it reuse the transaction instead of opening a new one. Therefore
"wrote business tables but left no unit" has no crash window at this mount point.

The change rows produced by this write must be registered into CONSUMED\_CHANGE\_IDS: when embedded in mount point 1's transaction body
(the normal strategy of `merge_branch` is exactly this shape), the outer incremental read would otherwise judge the same batch of writes again.
When not in the nested shape the slot does not exist, `has()` is false, and even that watermark read is not issued.

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

The rejection judgment completes synchronously **before** `next()`, so an unregistered call cannot change even one row of business data. Capture can only
open another transaction after `next()` — `switch_branch()` opens its own transaction and flushes the change pipeline before and after, so it cannot be wrapped.
See the note about the §5 deviation at the top of this file.

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

The watermark read happens before `fun`, the incremental read after `fun`, both with the **same** executor: switching to adapter-level reads
would see an uncommitted range outside the transaction, and the captured row count would depend on how fast other transactions commit.

Without an intent declaration the entrance is `crud`, not rejection — `transaction()` is the normal channel for all business writes,
and fail-closing it would turn the whole database read-only. The trusted paths' fail-closed behavior lands on mount points 2 / 3.

Transaction bodies carrying the CAPTURE\_OWNED\_TRANSACTION flag are passed through as-is: those are the transactions mount points 2 / 3 opened themselves to write working tree rows;
the business writes inside have already been captured over there under a trusted entrance.

#### Implementation of

[`WorkingTreeCaptureHook`](../../rxdb/interfaces/WorkingTreeCaptureHook.md).[`interceptTransaction`](../../rxdb/interfaces/WorkingTreeCaptureHook.md#intercepttransaction)

---

### targetClassOf() \{#targetclassof\}

```ts
targetClassOf(entityName, namespace?): "system" | "versioned" | "untracked";
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/capture-hook.ts:502](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/capture-hook.ts#L502)

Entity name → target class in the write entrance semantics matrix

#### Parameters

| Parameter    | Type     | Description                                                               |
| ------------ | -------- | ------------------------------------------------------------------------- |
| `entityName` | `string` | Entity name (without namespace)                                           |
| `namespace?` | `string` | Judged precisely by identity when known; judged by bare name when omitted |

#### Returns

`"system"` \| `"versioned"` \| `"untracked"`

One of `system` / `untracked` / `versioned`

#### Remarks

**Ask the domain first; only if the domain does not recognize it, ask the system table list.** The domain contains only business entities ([createWorkingTreeCaptureRuntime](../functions/createWorkingTreeCaptureRuntime.md)
already removed the system tables when building the domain), so "the domain recognizes this name" is itself proof that "it is not a system table". Judging system tables first
is exactly the hole of review #5: once an adopter names an entity `Commit` (epic-006 happens to have a `rxdb:Commit`),
all writes to that business table would be judged `system` as a whole batch and silently bypass capture — changes do not enter commits, and there is no error shape.

The two projections of the system table list are chosen by whether a namespace is at hand: compare by identity (`rxdb:RxDBBranch`) when there is one, compare by bare name when there is not.
Both are computed from the same registry ([getSystemEntityNames](../../rxdb/functions/getSystemEntityNames.md) / [getSystemEntityIdentities](../../rxdb/functions/getSystemEntityIdentities.md)),
not two lists. No longer cut by `namespace === 'rxdb'` in one stroke: namespaces are free for adopters to choose,
and a business entity that happens to be named `rxdb` has no reason to exit version control as a whole batch.

Like [domain](#domain), it is **not on the core contract**: the core's `notifyExternalUpdate()` used to ask the classification itself and then feed the result into the gate; now it only hands over the entity identity, and the whole judgment goes through [gateExternalNotify](../functions/gateExternalNotify.md).
Thus "which category does it belong to" never appears even once on the core side.
