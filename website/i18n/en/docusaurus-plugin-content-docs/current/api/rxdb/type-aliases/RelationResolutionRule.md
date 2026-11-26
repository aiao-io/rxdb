# RelationResolutionRule

```ts
type RelationResolutionRule = 'missingRelationPrimary' | 'multipleRelationPrimaries' | 'unsupportedRelationValueType';
```

Defined in: [packages/rxdb/src/entity/metadata-validate.ts:71](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/metadata-validate.ts#L71)

Rules for resolving relation targets.

## Remarks

Deliberately not merged with [MetadataValidationRule](MetadataValidationRule.md): the two differ in producer, timing,
and error type. This union is produced by the entry point that generates the field-descriptor DTOs.
