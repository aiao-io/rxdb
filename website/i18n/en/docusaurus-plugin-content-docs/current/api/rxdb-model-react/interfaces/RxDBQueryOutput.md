---
sidebar_label: "RxDBQueryOutput⟨T⟩"
---

# RxDBQueryOutput`<T>`

Defined in: [packages/rxdb-model-react/src/query-builder/query-builder/query-builder.tsx:33](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-react/src/query-builder/query-builder/query-builder.tsx#L33)

RxDB query output format.

## Type Parameters

| Type Parameter |
| ------ |
| <a id="type-parameter-t"></a> `T` |

## Properties

### combinator \{#combinator\}

```ts
combinator: "and" | "or";
```

Defined in: [packages/rxdb-model-react/src/query-builder/query-builder/query-builder.tsx:34](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-react/src/query-builder/query-builder/query-builder.tsx#L34)

***

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

Defined in: [packages/rxdb-model-react/src/query-builder/query-builder/query-builder.tsx:35](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-react/src/query-builder/query-builder/query-builder.tsx#L35)
