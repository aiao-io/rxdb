---
sidebar_label: "UseQueryTableResult⟨T⟩"
---

# UseQueryTableResult`<T>`

Defined in: [packages/rxdb-model-vue/src/headless.ts:180](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-vue/src/headless.ts#L180)

The controller and reactive snapshot of UseQueryTableResult.

## Type Parameters

| Type Parameter | Default type |
| ------ | ------ |
| <a id="type-parameter-t"></a> `T` *extends* [`EntityInstance`](../type-aliases/EntityInstance.md) | [`EntityInstance`](../type-aliases/EntityInstance.md) |

## Properties

### controller \{#controller\}

```ts
readonly controller: QueryTableController<T>;
```

Defined in: [packages/rxdb-model-vue/src/headless.ts:181](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-vue/src/headless.ts#L181)

***

### snapshot \{#snapshot\}

```ts
readonly snapshot: ShallowRef<QueryTableSnapshot<T>>;
```

Defined in: [packages/rxdb-model-vue/src/headless.ts:182](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-vue/src/headless.ts#L182)
