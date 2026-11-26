# WorkingTreeCaptureHook

Defined in: [packages/rxdb/src/capture/capture-interceptor.ts:123](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/capture/capture-interceptor.ts#L123)

The hand-off interface through which the capture runtime takes over the four mount points

## Remarks

Every method receives a `next` — the primitive **not yet invoked**. Thus "adjudicate first / take the watermark first, then execute the business write"
is the only possible shape in the type system, and the "reject synchronously before returning an Observable" required by `gateBulkWrite` has somewhere to be realized:
the return type of [interceptBulkWrite](#interceptbulkwrite) is a bare `Observable<void>`, and the `next` it receives
may never be called even once.

Every method also receives a `host` — the actual `this` of this call. The mount point is installed on the **instance**, and the same instance gets called again
through the executor facade (`executor.mergeChanges` is exactly
`adapter.mergeChanges.call(facade, …)`); dropping the `host` would rewrite an inside-transaction call into an outside-transaction
call, with the consequence of self-locking rather than an error.

## Methods

### bindMountTarget() \{#bindmounttarget\}

```ts
bindMountTarget(target, raw): void;
```

Defined in: [packages/rxdb/src/capture/capture-interceptor.ts:136](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/capture/capture-interceptor.ts#L136)

Claims the installation host and its copy of the unintercepted primitives; called once immediately after [installWorkingTreeCapture](../functions/installWorkingTreeCapture.md)

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `target` | [`WorkingTreeCaptureMountTarget`](../type-aliases/WorkingTreeCaptureMountTarget.md) | The adapter instance the mount points were installed on; also the scope key of adapter-level write intent declarations |
| `raw` | [`RawWritePrimitives`](RawWritePrimitives.md) | The five primitives before interception |

#### Returns

`void`

#### Remarks

Both things are known only to the installer, and both are needed by the runtime: `target` is
the scope identity used by [declareTrustedWrite](../functions/declareTrustedWrite.md) — the callers of mount points 2 / 3 declare their intents on the adapter,
and the runtime must hold the same object to look them up; `raw` is the only safe entry for capture to issue writes itself,
going through the intercepted copy would immediately recurse back into the mount point itself.

***

### gateExternalNotify() \{#gateexternalnotify\}

```ts
gateExternalNotify<T>(
   entityName, 
   namespace, 
   notify
): T;
```

Defined in: [packages/rxdb/src/capture/capture-interceptor.ts:205](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/capture/capture-interceptor.ts#L205)

Hand-off gate 2: one `notifyExternalUpdate()` (row 11 of the write entry semantics matrix)

#### Type Parameters

| Type Parameter | Description |
| ------ | ------ |
| <a id="type-parameter-t"></a> `T` | The return type of the notification body; passed through as-is when allowed |

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `entityName` | `string` | The name of the entity being notified |
| `namespace` | `string` \| `undefined` | Used directly when known; `rxdb` means a system table |
| `notify` | () => `T` | The notification body, **not yet invoked** |

#### Returns

`T`

The return value of `notify()` itself

#### Throws

Thrown when the target is a versioned business entity; in that case no event is dispatched at all

#### Remarks

It sits on this contract for the same reason as [gateRawWrite](#gaterawwrite): core's `notifyExternalUpdate()` can intercept
itself, but it cannot answer "which class does this entity belong to" — that requires asking the domain, and the domain is capture's. Core therefore only hands over the entity identity,
leaving the whole "which class, and does row 11 allow or reject that class" judgment to the runtime.

**The gate wraps the notification body, it is not an assertion added after the notification**: what is received is a not-yet-invoked callback, so "adjudicate first" is
the only possible shape in the type system; written as dispatch-then-check, the rejection could not stop the event from already having gone out.

***

### gateRawWrite() \{#gaterawwrite\}

```ts
gateRawWrite<T>(sql, execute): Promise<T>;
```

Defined in: [packages/rxdb/src/capture/capture-interceptor.ts:185](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/capture/capture-interceptor.ts#L185)

Hand-off gate 1: one raw write statement (the 4-step adjudication of adapter-contract.md §2)

#### Type Parameters

| Type Parameter | Description |
| ------ | ------ |
| <a id="type-parameter-t-1"></a> `T` | The return type of the statement executor; passed through as-is when allowed |

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `sql` | `string` | The raw text of the statement to be adjudicated |
| `execute` | () => `T` \| `Promise`&lt;`T`&gt; | The executor, **not yet invoked** |

#### Returns

`Promise`&lt;`T`&gt;

The return value of `execute()` itself

#### Throws

Thrown when the target lands on a versioned business table and satisfies no allow condition; in that case `execute` is never called even once

#### Remarks

`rawQuery?()` is an **optional method** on the adapter interface, and core cannot wrap it on the adapter's behalf the way it does for the four mount points,
so adjudication can only be done by each adapter's own implementation calling [gateRawWrite](#gaterawwrite). And what that function has left in core is a single dispatch line:
the capability bit false → allow directly, true → hand off to here. **Not a single word of the adjudication implementation is in core** — it recognizes statement lexemes,
the six physical shapes of table names and trusted intents, all three of which change with the capture rules.

***

### interceptBulkWrite() \{#interceptbulkwrite\}

```ts
interceptBulkWrite(
   host, 
   next, 
   entityName, 
   operation
): Observable<void>;
```

Defined in: [packages/rxdb/src/capture/capture-interceptor.ts:163](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/capture/capture-interceptor.ts#L163)

Mount point 4: the gate of `upsertMany` / `deleteByIds`

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `host` | [`WorkingTreeWriteHost`](WorkingTreeWriteHost.md) |
| `next` | () => `Observable`&lt;`void`&gt; |
| `entityName` | `string` |
| `operation` | [`InterceptedBulkWrite`](../type-aliases/InterceptedBulkWrite.md) |

#### Returns

`Observable`&lt;`void`&gt;

***

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

Defined in: [packages/rxdb/src/capture/capture-interceptor.ts:147](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/capture/capture-interceptor.ts#L147)

Mount point 2: the local `mergeChanges` (the same-name remote overload is not in this list; it lives on `RxDBAdapterRemoteBase`)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `host` | [`WorkingTreeWriteHost`](WorkingTreeWriteHost.md) |
| `next` | [`MergeChangesNext`](../type-aliases/MergeChangesNext.md) |
| `actions` | [`SwitchVersionActions`](SwitchVersionActions.md) |
| `localChanges?` | `Omit`&lt;[`RxDBChange`](../classes/RxDBChange.md), `"id"`&gt;[] |
| `disableTriggers?` | `boolean` |

#### Returns

`Promise`&lt;`number` \| `void`&gt;

***

### interceptSwitchBranch() \{#interceptswitchbranch\}

```ts
interceptSwitchBranch(
   host, 
   next, 
   options
): Promise<void>;
```

Defined in: [packages/rxdb/src/capture/capture-interceptor.ts:156](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/capture/capture-interceptor.ts#L156)

Mount point 3: branch materialization / redo invalidation / undo-redo application

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `host` | [`WorkingTreeWriteHost`](WorkingTreeWriteHost.md) |
| `next` | (`options`) => `Promise`&lt;`void`&gt; |
| `options` | [`SwitchBranchOptions`](SwitchBranchOptions.md) |

#### Returns

`Promise`&lt;`void`&gt;

***

### interceptTransaction() \{#intercepttransaction\}

```ts
interceptTransaction(
   host, 
   next, 
   fun, 
   transactionLog?
): Promise<unknown>;
```

Defined in: [packages/rxdb/src/capture/capture-interceptor.ts:139](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/capture/capture-interceptor.ts#L139)

Mount point 1: the atomic boundary where a whole transaction shares one `unitId`

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `host` | [`WorkingTreeWriteHost`](WorkingTreeWriteHost.md) |
| `next` | (`fun`, `transactionLog?`) => `Promise`&lt;`unknown`&gt; |
| `fun` | [`TransactionFun`](../type-aliases/TransactionFun.md) |
| `transactionLog?` | `boolean` |

#### Returns

`Promise`&lt;`unknown`&gt;
