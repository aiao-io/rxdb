---
sidebar_label: "QueryBuilderEvent⟨T⟩"
---

# QueryBuilderEvent`<T>`

```ts
type QueryBuilderEvent<T> = 
  | {
  state: QueryBuilderState<T>;
  type: "stateChanged";
}
  | {
  fields: readonly FieldMetadata[];
  type: "fieldsChanged";
}
  | {
  type: "validationChanged";
  validation: ValidationResult;
};
```

Defined in: packages/rxdb-model/dist/query-builder/services/headless.d.ts:15

Change event for query state, field metadata or validation results.

## Type Parameters

| Type Parameter | Default type |
| ------ | ------ |
| <a id="type-parameter-t"></a> `T` | `Record`&lt;`string`, `unknown`&gt; |
