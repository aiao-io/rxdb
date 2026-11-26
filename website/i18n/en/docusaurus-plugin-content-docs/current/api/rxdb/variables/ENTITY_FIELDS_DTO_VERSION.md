# ENTITY_FIELDS_DTO_VERSION

```ts
const ENTITY_FIELDS_DTO_VERSION: 1 = 1;
```

Defined in: [packages/rxdb/src/entity/entity-field.utils.ts:182](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-field.utils.ts#L182)

Protocol version of the field descriptor DTO.

## Remarks

Single source of truth: `describeEntityFields()` writes it and `parseEntityFieldsDescriptor()` validates it first. Any version mismatch fails parsing outright — no cross-version compatibility.
