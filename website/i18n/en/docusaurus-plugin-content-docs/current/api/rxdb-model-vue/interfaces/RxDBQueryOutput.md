---
sidebar_label: 'RxDBQueryOutput⟨T⟩'
---

# RxDBQueryOutput`<T>`

Defined in: [packages/rxdb-model-vue/src/query-builder/query-builder/query-builder-types.ts:4](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-vue/src/query-builder/query-builder/query-builder-types.ts#L4)

RxDB query output format (aligned with `RxDBQueryOutput` on the Angular side).

## Type Parameters

| Type Parameter                    |
| --------------------------------- |
| <a id="type-parameter-t"></a> `T` |

## Properties

### combinator \{#combinator\}

```ts
combinator: 'and' | 'or';
```

Defined in: [packages/rxdb-model-vue/src/query-builder/query-builder/query-builder-types.ts:5](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-vue/src/query-builder/query-builder/query-builder-types.ts#L5)

---

### rules \{#rules\}

```ts
rules: (
  | RxDBQueryOutput<T>
  | {
  field: keyof T & string;
  operator: string;
  value: unknown;
})[];
```

Defined in: [packages/rxdb-model-vue/src/query-builder/query-builder/query-builder-types.ts:6](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-vue/src/query-builder/query-builder/query-builder-types.ts#L6)
