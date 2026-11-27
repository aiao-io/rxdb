# RawWritePrimitives

Defined in: [packages/rxdb/src/capture/capture-interceptor.ts:73](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/capture/capture-interceptor.ts#L73)

The five write primitives before interception

## Remarks

Captured as-is at install time, for two kinds of callers: **the bootstrap phase** (`bootstrapTransaction` — table creation and migrations are not user changes; capturing them would make whole-database rows sprout out of nowhere in the working tree), and **the capture runtime itself** (the hook wraps a layer around the primitives, and must be able to obtain the layer that does not contain itself, otherwise it recurses).

All five functions here are **bound to the host they were installed on**. The one that needs rebinding per calling host (`mergeChanges`) is provided separately by [MergeChangesNext](../type-aliases/MergeChangesNext.md) and does not go through here.

## Methods

### deleteByIds() \{#deletebyids\}

```ts
deleteByIds(entityName, ids): Observable<void>;
```

Defined in: [packages/rxdb/src/capture/capture-interceptor.ts:91](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/capture/capture-interceptor.ts#L91)

Unintercepted `deleteByIds`

#### Parameters

| Parameter    | Type       |
| ------------ | ---------- |
| `entityName` | `string`   |
| `ids`        | `string`[] |

#### Returns

`Observable`&lt;`void`&gt;

---

### mergeChanges() \{#mergechanges\}

```ts
mergeChanges(
   actions,
   localChanges?,
   disableTriggers?
): Promise<number | void>;
```

Defined in: [packages/rxdb/src/capture/capture-interceptor.ts:78](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/capture/capture-interceptor.ts#L78)

Unintercepted local `mergeChanges` overload

#### Parameters

| Parameter          | Type                                                             |
| ------------------ | ---------------------------------------------------------------- |
| `actions`          | [`SwitchVersionActions`](SwitchVersionActions.md)                |
| `localChanges?`    | `Omit`&lt;[`RxDBChange`](../classes/RxDBChange.md), `"id"`&gt;[] |
| `disableTriggers?` | `boolean`                                                        |

#### Returns

`Promise`&lt;`number` \| `void`&gt;

---

### switchBranch() \{#switchbranch\}

```ts
switchBranch(options): Promise<void>;
```

Defined in: [packages/rxdb/src/capture/capture-interceptor.ts:85](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/capture/capture-interceptor.ts#L85)

Unintercepted `switchBranch`

#### Parameters

| Parameter | Type                                            |
| --------- | ----------------------------------------------- |
| `options` | [`SwitchBranchOptions`](SwitchBranchOptions.md) |

#### Returns

`Promise`&lt;`void`&gt;

---

### transaction() \{#transaction\}

```ts
transaction(fun, transactionLog?): Promise<unknown>;
```

Defined in: [packages/rxdb/src/capture/capture-interceptor.ts:75](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/capture/capture-interceptor.ts#L75)

Unintercepted [RxDBAdapterLocalBase.transaction](../classes/RxDBAdapterLocalBase.md#transaction)

#### Parameters

| Parameter         | Type                                                  |
| ----------------- | ----------------------------------------------------- |
| `fun`             | [`TransactionFun`](../type-aliases/TransactionFun.md) |
| `transactionLog?` | `boolean`                                             |

#### Returns

`Promise`&lt;`unknown`&gt;

---

### upsertMany() \{#upsertmany\}

```ts
upsertMany<T>(entityName, data): Observable<void>;
```

Defined in: [packages/rxdb/src/capture/capture-interceptor.ts:88](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/capture/capture-interceptor.ts#L88)

Unintercepted `upsertMany`

#### Type Parameters

| Type Parameter                    |
| --------------------------------- |
| <a id="type-parameter-t"></a> `T` |

#### Parameters

| Parameter    | Type     |
| ------------ | -------- |
| `entityName` | `string` |
| `data`       | `T`[]    |

#### Returns

`Observable`&lt;`void`&gt;
