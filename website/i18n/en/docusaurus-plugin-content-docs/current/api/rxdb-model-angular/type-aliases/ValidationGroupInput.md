# ValidationGroupInput

```ts
type ValidationGroupInput = object;
```

Defined in: packages/rxdb-model/dist/query-builder/services/validation.service.d.ts:12

Validation rule group input (loose recursive structure)

## Properties

| Property | Type | Description | Defined in |
| ------ | ------ | ------ | ------ |
| <a id="property-combinator"></a> `combinator` | `"and"` \| `"or"` | Logical combinator | packages/rxdb-model/dist/query-builder/services/validation.service.d.ts:20 |
| <a id="property-id"></a> `id` | `string` | Unique identifier of the rule group | packages/rxdb-model/dist/query-builder/services/validation.service.d.ts:16 |
| <a id="property-rules"></a> `rules` | (`ValidationRuleInput` \| `ValidationGroupInput`)[] | Child rule list (supports nesting) | packages/rxdb-model/dist/query-builder/services/validation.service.d.ts:24 |
