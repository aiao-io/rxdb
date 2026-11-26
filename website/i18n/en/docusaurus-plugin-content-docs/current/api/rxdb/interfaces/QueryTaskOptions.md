---
sidebar_label: 'QueryTaskOptions⟨T, RT⟩'
---

# QueryTaskOptions`<T, RT>`

Defined in: [packages/rxdb/src/repository/QueryTask.ts:38](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/QueryTask.ts#L38)

Query task options interface

## Type Parameters

| Type Parameter                                                                            |
| ----------------------------------------------------------------------------------------- |
| <a id="type-parameter-t"></a> `T` _extends_ [`EntityType`](../type-aliases/EntityType.md) |
| <a id="type-parameter-rt"></a> `RT`                                                       |

## Properties

### autoCache? \{#autocache\}

```ts
autoCache?: boolean;
```

Defined in: [packages/rxdb/src/repository/QueryTask.ts:76](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/QueryTask.ts#L76)

Whether to automatically cache the query result as an entity array

---

### cacheKey \{#cachekey\}

```ts
cacheKey: string;
```

Defined in: [packages/rxdb/src/repository/QueryTask.ts:42](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/QueryTask.ts#L42)

Cache key

---

### depEntityTypeMap \{#depentitytypemap\}

```ts
depEntityTypeMap: Map<EntityType, number>;
```

Defined in: [packages/rxdb/src/repository/QueryTask.ts:66](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/QueryTask.ts#L66)

The map of depended-on entity types

---

### entityType \{#entitytype\}

```ts
entityType: T;
```

Defined in: [packages/rxdb/src/repository/QueryTask.ts:56](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/QueryTask.ts#L56)

The entity type

---

### getFingerprint \{#getfingerprint\}

```ts
getFingerprint: (result) => Fingerprint[];
```

Defined in: [packages/rxdb/src/repository/QueryTask.ts:104](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/QueryTask.ts#L104)

The method for computing the result fingerprint

#### Parameters

| Parameter | Type |
| --------- | ---- |
| `result`  | `RT` |

#### Returns

[`Fingerprint`](../type-aliases/Fingerprint.md)[]

---

### onClean \{#onclean\}

```ts
onClean: (cacheKey, task) => void;
```

Defined in: [packages/rxdb/src/repository/QueryTask.ts:90](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/QueryTask.ts#L90)

Cleanup function

#### Parameters

| Parameter  | Type                                                    |
| ---------- | ------------------------------------------------------- |
| `cacheKey` | `string`                                                |
| `task`     | [`QueryTask`](../classes/QueryTask.md)&lt;`T`, `RT`&gt; |

#### Returns

`void`

#### Remarks

The second parameter is the task being cleaned up itself: under the same `cacheKey` there may already be a new task that has taken over (see `onError`),
so compare identities before deleting by key — the old task's cleanup must not remove the new task.

---

### onError? \{#onerror\}

```ts
onError?: (cacheKey, task) => void;
```

Defined in: [packages/rxdb/src/repository/QueryTask.ts:99](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/QueryTask.ts#L99)

Called when one round of the query fails, **before** the error is delivered to the observers.

#### Parameters

| Parameter  | Type                                                    |
| ---------- | ------------------------------------------------------- |
| `cacheKey` | `string`                                                |
| `task`     | [`QueryTask`](../classes/QueryTask.md)&lt;`T`, `RT`&gt; |

#### Returns

`void`

#### Remarks

The error terminates all observers of this generation; those that synchronously re-subscribe during dispatch (e.g. `retry()`) belong to the next generation,
and the host uses this to resolve them to a new task that re-executes the query, rather than attaching them back to this old task that is dispatching the failure.

---

### options \{#options\}

```ts
options: QueryOptions<T>;
```

Defined in: [packages/rxdb/src/repository/QueryTask.ts:46](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/QueryTask.ts#L46)

Query options

---

### relationEntityTypes? \{#relationentitytypes\}

```ts
relationEntityTypes?: Iterable<EntityType, any, any>;
```

Defined in: [packages/rxdb/src/repository/QueryTask.ts:71](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/QueryTask.ts#L71)

Additional entity types the query depends on

---

### runner \{#runner\}

```ts
runner: () => Observable<RT>;
```

Defined in: [packages/rxdb/src/repository/QueryTask.ts:51](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/QueryTask.ts#L51)

The query execution function

#### Returns

`Observable`&lt;`RT`&gt;

---

### rxdb \{#rxdb\}

```ts
rxdb: RxDB;
```

Defined in: [packages/rxdb/src/repository/QueryTask.ts:61](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/QueryTask.ts#L61)

The RxDB instance

---

### serialize \{#serialize\}

```ts
serialize: data => InstanceType<T>;
```

Defined in: [packages/rxdb/src/repository/QueryTask.ts:81](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/QueryTask.ts#L81)

Serialization function

#### Parameters

| Parameter | Type                                                                                 |
| --------- | ------------------------------------------------------------------------------------ |
| `data`    | [`RxDBEntityLocalEventData`](../type-aliases/RxDBEntityLocalEventData.md)&lt;`T`&gt; |

#### Returns

`InstanceType`&lt;`T`&gt;
