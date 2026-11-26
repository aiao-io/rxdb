---
sidebar_label: "UseEntityListResult⟨T⟩"
---

# UseEntityListResult`<T>`

Defined in: [packages/rxdb-model-vue/src/headless.ts:69](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-vue/src/headless.ts#L69)

The controller and reactive snapshot of UseEntityListResult.

## Type Parameters

| Type Parameter | Default type |
| ------ | ------ |
| <a id="type-parameter-t"></a> `T` *extends* [`EntityInstance`](../type-aliases/EntityInstance.md) | [`EntityInstance`](../type-aliases/EntityInstance.md) |

## Properties

### controller \{#controller\}

```ts
readonly controller: EntityListController<T>;
```

Defined in: [packages/rxdb-model-vue/src/headless.ts:70](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-vue/src/headless.ts#L70)

***

### snapshot \{#snapshot\}

```ts
readonly snapshot: ShallowRef<EntityListSnapshot<T>>;
```

Defined in: [packages/rxdb-model-vue/src/headless.ts:71](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-vue/src/headless.ts#L71)
