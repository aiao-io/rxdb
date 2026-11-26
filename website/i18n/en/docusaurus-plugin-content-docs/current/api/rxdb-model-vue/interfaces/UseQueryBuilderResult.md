---
sidebar_label: "UseQueryBuilderResult⟨T⟩"
---

# UseQueryBuilderResult`<T>`

Defined in: [packages/rxdb-model-vue/src/headless.ts:45](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-vue/src/headless.ts#L45)

The controller and reactive snapshot of UseQueryBuilderResult.

## Type Parameters

| Type Parameter | Default type |
| ------ | ------ |
| <a id="type-parameter-t"></a> `T` | `Record`&lt;`string`, `unknown`&gt; |

## Properties

### controller \{#controller\}

```ts
readonly controller: QueryBuilderController<T>;
```

Defined in: [packages/rxdb-model-vue/src/headless.ts:46](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-vue/src/headless.ts#L46)

***

### snapshot \{#snapshot\}

```ts
readonly snapshot: ShallowRef<QueryBuilderSnapshot<T>>;
```

Defined in: [packages/rxdb-model-vue/src/headless.ts:47](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-vue/src/headless.ts#L47)
