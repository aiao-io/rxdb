---
sidebar_label: 'RxDBQueryOutput⟨T⟩'
---

# RxDBQueryOutput`<T>`

Defined in: [packages/rxdb-model-angular/src/query-builder/query-builder/query-builder.component.ts:30](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/query-builder/query-builder.component.ts#L30)

RxDB query output format

## Type Parameters

| Type Parameter                    |
| --------------------------------- |
| <a id="type-parameter-t"></a> `T` |

## Properties

### combinator \{#combinator\}

```ts
combinator: 'and' | 'or';
```

Defined in: [packages/rxdb-model-angular/src/query-builder/query-builder/query-builder.component.ts:31](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/query-builder/query-builder.component.ts#L31)

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

Defined in: [packages/rxdb-model-angular/src/query-builder/query-builder/query-builder.component.ts:32](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/query-builder/query-builder/query-builder.component.ts#L32)
