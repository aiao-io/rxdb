---
sidebar_label: 'QueryTask⟨T, RT⟩'
---

# QueryTask`<T, RT>`

Defined in: [packages/rxdb/src/repository/QueryTask.ts:116](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/QueryTask.ts#L116)

Query task implementation

Encapsulates the creation and lifecycle management of query tasks

- Manages the refresh and destroy signals of a task
- Handles observer subscription and unsubscription
- Maintains entity type dependencies
- Provides the first-run and cleanup mechanisms of a task

## Type Parameters

| Type Parameter                                                                            | Default type |
| ----------------------------------------------------------------------------------------- | ------------ |
| <a id="type-parameter-t"></a> `T` _extends_ [`EntityType`](../type-aliases/EntityType.md) | -            |
| <a id="type-parameter-rt"></a> `RT`                                                       | `unknown`    |

## Constructors

### Constructor

```ts
new QueryTask<T, RT>(opt): QueryTask<T, RT>;
```

Defined in: [packages/rxdb/src/repository/QueryTask.ts:260](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/QueryTask.ts#L260)

#### Parameters

| Parameter | Type                                                                     |
| --------- | ------------------------------------------------------------------------ |
| `opt`     | [`QueryTaskOptions`](../interfaces/QueryTaskOptions.md)&lt;`T`, `RT`&gt; |

#### Returns

`QueryTask`&lt;`T`, `RT`&gt;

## Properties

### autoCache \{#autocache\}

```ts
readonly autoCache: boolean;
```

Defined in: [packages/rxdb/src/repository/QueryTask.ts:186](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/QueryTask.ts#L186)

Whether to automatically cache query results as an entity or an entity array

---

### cacheKey \{#cachekey\}

```ts
readonly cacheKey: string;
```

Defined in: [packages/rxdb/src/repository/QueryTask.ts:180](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/QueryTask.ts#L180)

---

### destroy$ \{#destroy\}

```ts
readonly destroy$: Observable<void>;
```

Defined in: [packages/rxdb/src/repository/QueryTask.ts:198](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/QueryTask.ts#L198)

Query destroy stream
Fired when the query task is destroyed

---

### entityType \{#entitytype\}

```ts
readonly entityType: T;
```

Defined in: [packages/rxdb/src/repository/QueryTask.ts:181](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/QueryTask.ts#L181)

---

### getFingerprint \{#getfingerprint\}

```ts
getFingerprint: (result) => Fingerprint[];
```

Defined in: [packages/rxdb/src/repository/QueryTask.ts:252](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/QueryTask.ts#L252)

Result fingerprint computation method

#### Parameters

| Parameter | Type |
| --------- | ---- |
| `result`  | `RT` |

#### Returns

[`Fingerprint`](../type-aliases/Fingerprint.md)[]

---

### observerCount \{#observercount\}

```ts
observerCount: number = 0;
```

Defined in: [packages/rxdb/src/repository/QueryTask.ts:237](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/QueryTask.ts#L237)

Observer count
Records how many subscribers are currently listening to this query result

---

### observers \{#observers\}

```ts
readonly observers: Set<Observer<RT>>;
```

Defined in: [packages/rxdb/src/repository/QueryTask.ts:167](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/QueryTask.ts#L167)

Observer set
Stores all observers subscribed to this query result

---

### options \{#options\}

```ts
readonly options:
  | EntityStaticType<T, "idType">
  | FindOneOptions<T, RuleGroup<InstanceType<T>>, string>
  | FindOneOrFailOptions<T, RuleGroup<InstanceType<T>>, string>
  | FindOptions<T, RuleGroup<InstanceType<T>>, string>
  | FindAllOptions<T, RuleGroup<InstanceType<T>>, string>
  | FindByCursorOptions<T, RuleGroup<InstanceType<T>>, string>
  | CountOptions<T, RuleGroup<InstanceType<T>>>;
```

Defined in: [packages/rxdb/src/repository/QueryTask.ts:231](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/QueryTask.ts#L231)

Query options

---

### refresh$ \{#refresh\}

```ts
readonly refresh$: Observable<number>;
```

Defined in: [packages/rxdb/src/repository/QueryTask.ts:192](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/QueryTask.ts#L192)

Refresh trigger stream
Emits the refresh count on each refresh, used to trigger the query to re-execute

---

### refreshCount \{#refreshcount\}

```ts
refreshCount: number = 0;
```

Defined in: [packages/rxdb/src/repository/QueryTask.ts:242](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/QueryTask.ts#L242)

Refresh count
Records the total number of times the query has been refreshed and executed

---

### relationEntityTypes \{#relationentitytypes\}

```ts
readonly relationEntityTypes: Set<EntityType>;
```

Defined in: [packages/rxdb/src/repository/QueryTask.ts:204](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/QueryTask.ts#L204)

Related entity type set
Stores all related entity types involved in the query

---

### result? \{#result\}

```ts
result?: RT;
```

Defined in: [packages/rxdb/src/repository/QueryTask.ts:247](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/QueryTask.ts#L247)

Query result
The cached latest query result data

---

### result$ \{#result-1\}

```ts
result$: Observable<RT>;
```

Defined in: [packages/rxdb/src/repository/QueryTask.ts:258](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/QueryTask.ts#L258)

Query result stream
The reactive stream that sends query results via Observable

---

### resultEntityIds \{#resultentityids\}

```ts
readonly resultEntityIds: Set<EntityStaticType<T, "idType">>;
```

Defined in: [packages/rxdb/src/repository/QueryTask.ts:209](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/QueryTask.ts#L209)

The entity ID set of the query

---

### resultEntitySet \{#resultentityset\}

```ts
readonly resultEntitySet: Set<InstanceType<T>>;
```

Defined in: [packages/rxdb/src/repository/QueryTask.ts:215](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/QueryTask.ts#L215)

The entity set of the query
Stores all entity instances contained in the query results

---

### rxdb \{#rxdb\}

```ts
readonly rxdb: RxDB;
```

Defined in: [packages/rxdb/src/repository/QueryTask.ts:182](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/QueryTask.ts#L182)

---

### serialize \{#serialize\}

```ts
readonly serialize: (data) => InstanceType<T>;
```

Defined in: [packages/rxdb/src/repository/QueryTask.ts:179](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/QueryTask.ts#L179)

Restores the payload of a local entity event into an entity instance

#### Parameters

| Parameter | Type                                                                                 |
| --------- | ------------------------------------------------------------------------------------ |
| `data`    | [`RxDBEntityLocalEventData`](../type-aliases/RxDBEntityLocalEventData.md)&lt;`T`&gt; |

#### Returns

`InstanceType`&lt;`T`&gt;

#### Remarks

It is public because plugins with their own merge pipelines use it: `@aiao/rxdb-plugin-tree`'s `merge_create` calls it directly
to turn matched event data into entities (`query/merge_create.ts`). The cost of each plugin writing its own is not duplication,
but **two sets of restore semantics** — this function goes through `createEntityRef`, respects the entity cache, and the same id is still the same object;
a hand-rolled instance from `Object.assign` bypasses the cache, so the same row becomes two objects in different queries.

---

### type \{#type\}

```ts
readonly type:
  | "find"
  | "get"
  | "findOne"
  | "findOneOrFail"
  | "findAll"
  | "findByCursor"
  | "count";
```

Defined in: [packages/rxdb/src/repository/QueryTask.ts:226](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/QueryTask.ts#L226)

Query type

#### Remarks

Taken from [QueryOptions](../type-aliases/QueryOptions.md) instead of a separate copied literal union. The old literal contained
plugin task types like `findDescendants` / `findNeighbors` — the core therefore "knew" queries
it does not implement, and plugins adding a new task had to come back and change the core. After switching to indexed access,
plugins extend the union via `RepositoryQueryExtensions` module augmentation, and this widens automatically.

## Methods

### clean() \{#clean\}

```ts
clean(): void;
```

Defined in: [packages/rxdb/src/repository/QueryTask.ts:288](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/QueryTask.ts#L288)

Cleans up the task resources

#### Returns

`void`

#### Remarks

Complete the observers before tearing down the pipeline: on the normal unsubscription path `observers` is already empty when it gets here, but
`QueryManager.destroy()` cleans up tasks that still have subscribers — without `complete()`
those subscribers neither receive new data nor ever end, and operators that wait for the termination signal like
`toArray()` / `lastValueFrom()` hang forever.

---

### error() \{#error\}

```ts
error(err): void;
```

Defined in: [packages/rxdb/src/repository/QueryTask.ts:387](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/QueryTask.ts#L387)

Sends an error to all observers

#### Parameters

| Parameter | Type      |
| --------- | --------- |
| `err`     | `unknown` |

#### Returns

`void`

#### Remarks

First let the host stop reusing this task via `onError`, then distribute by snapshot: observers that re-subscribe synchronously
inside the error callback belong to the next generation and do not receive this round's error.

---

### next() \{#next\}

```ts
next(result, autoCache?): void;
```

Defined in: [packages/rxdb/src/repository/QueryTask.ts:375](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/QueryTask.ts#L375)

Sends the result to all observers

#### Parameters

| Parameter    | Type      | Default value | Description                                        |
| ------------ | --------- | ------------- | -------------------------------------------------- |
| `result`     | `RT`      | `undefined`   | Query result                                       |
| `autoCache?` | `boolean` | `true`        | Whether to automatically cache the result entities |

#### Returns

`void`

---

### refresh() \{#refresh-1\}

```ts
refresh(): void;
```

Defined in: [packages/rxdb/src/repository/QueryTask.ts:395](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/QueryTask.ts#L395)

Manually refreshes the query

#### Returns

`void`

---

### run() \{#run\}

```ts
run(): void;
```

Defined in: [packages/rxdb/src/repository/QueryTask.ts:318](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/QueryTask.ts#L318)

Runs the query task for the first time

#### Returns

`void`
