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

Defined in: [packages/rxdb-model/src/query-builder/services/headless.ts:29](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/query-builder/services/headless.ts#L29)

Event for changes to query state, field metadata, or validation results.

## Type Parameters

| Type Parameter | Default type |
| ------ | ------ |
| <a id="type-parameter-t"></a> `T` | `Record`&lt;`string`, `unknown`&gt; |
