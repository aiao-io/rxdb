# ValidationGroupInput

```ts
type ValidationGroupInput = object;
```

Defined in: [packages/rxdb-model/src/query-builder/services/validation.service.ts:26](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/query-builder/services/validation.service.ts#L26)

Validation rule group input (loose recursive structure)

## Properties

| Property                                      | Type                                                | Description                         | Defined in                                                                                                                                                                                                                        |
| --------------------------------------------- | --------------------------------------------------- | ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| <a id="property-combinator"></a> `combinator` | `"and"` \| `"or"`                                   | Logical combinator                  | [packages/rxdb-model/src/query-builder/services/validation.service.ts:35](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/query-builder/services/validation.service.ts#L35) |
| <a id="property-id"></a> `id`                 | `string`                                            | Unique identifier of the rule group | [packages/rxdb-model/src/query-builder/services/validation.service.ts:30](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/query-builder/services/validation.service.ts#L30) |
| <a id="property-rules"></a> `rules`           | (`ValidationRuleInput` \| `ValidationGroupInput`)[] | Child rule list (nesting supported) | [packages/rxdb-model/src/query-builder/services/validation.service.ts:40](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/query-builder/services/validation.service.ts#L40) |
