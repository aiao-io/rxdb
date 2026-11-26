# MetadataValidationRule

```ts
type MetadataValidationRule =
  | 'unknownFormat'
  | 'formatTypeMismatch'
  | 'formatOnRelation'
  | 'readonlyOnRelation'
  | 'missingFormatConfig'
  | 'invalidFormatConfig'
  | 'invalidRange'
  | 'missingEnum'
  | 'invalidEnumConfig'
  | 'duplicateEnum'
  | 'enumOptionsMismatch'
  | 'invalidOptionsConfig'
  | 'cardinalityConflict'
  | 'unsupportedRepositorySyncType'
  | 'missingQueryCacheAdapter'
  | 'invalidPermissions'
  | 'invalidManualOrder'
  | 'invalidCheck'
  | 'invalidIndexWhere'
  | 'invalidExclusion'
  | 'reservedName';
```

Defined in: [packages/rxdb/src/entity/metadata-validate.ts:41](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/metadata-validate.ts#L41)

Metadata validation rules at registration time.

## Remarks

21 items in total, produced by [validateEntityMetadata](../functions/validateEntityMetadata.md).
`missingRelationPrimary` / `unsupportedRelationValueType` belong to [RelationResolutionRule](RelationResolutionRule.md),
produced by the field description DTO generation phase, not in this union.
