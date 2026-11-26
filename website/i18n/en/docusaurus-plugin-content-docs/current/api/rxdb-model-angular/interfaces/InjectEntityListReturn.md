---
sidebar_label: 'InjectEntityListReturn⟨T⟩'
---

# InjectEntityListReturn`<T>`

Defined in: [packages/rxdb-model-angular/src/headless/bindings.ts:121](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/headless/bindings.ts#L121)

The controller and reactive snapshot of InjectEntityListReturn.

## Type Parameters

| Type Parameter                                                                                    | Default type                                          |
| ------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| <a id="type-parameter-t"></a> `T` _extends_ [`EntityInstance`](../type-aliases/EntityInstance.md) | [`EntityInstance`](../type-aliases/EntityInstance.md) |

## Properties

### controller \{#controller\}

```ts
readonly controller: EntityListController<T>;
```

Defined in: [packages/rxdb-model-angular/src/headless/bindings.ts:122](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/headless/bindings.ts#L122)

---

### snapshot \{#snapshot\}

```ts
readonly snapshot: Signal<EntityListSnapshot<T>>;
```

Defined in: [packages/rxdb-model-angular/src/headless/bindings.ts:123](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/headless/bindings.ts#L123)
