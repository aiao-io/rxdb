---
sidebar_label: 'EntityWriteStep⟨T⟩'
---

# EntityWriteStep`<T>`

Defined in: [packages/rxdb/src/system/exclusion-write-order.ts:132](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/exclusion-write-order.ts#L132)

One step of a bulk write: a set of creates / updates / deletes for one entity type.

## Type Parameters

| Type Parameter                                                                            | Default type                                  |
| ----------------------------------------------------------------------------------------- | --------------------------------------------- |
| <a id="type-parameter-t"></a> `T` _extends_ [`EntityType`](../type-aliases/EntityType.md) | [`EntityType`](../type-aliases/EntityType.md) |

## Properties

### entities \{#entities\}

```ts
readonly entities: InstanceType<T>[];
```

Defined in: [packages/rxdb/src/system/exclusion-write-order.ts:138](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/exclusion-write-order.ts#L138)

The entities written in this step (original order preserved within the type)

---

### EntityType \{#entitytype\}

```ts
readonly EntityType: T;
```

Defined in: [packages/rxdb/src/system/exclusion-write-order.ts:136](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/exclusion-write-order.ts#L136)

Entity type

---

### kind \{#kind\}

```ts
readonly kind: "create" | "update" | "remove";
```

Defined in: [packages/rxdb/src/system/exclusion-write-order.ts:134](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/exclusion-write-order.ts#L134)

Write kind
