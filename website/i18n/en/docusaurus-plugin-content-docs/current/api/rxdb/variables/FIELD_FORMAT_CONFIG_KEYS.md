# FIELD_FORMAT_CONFIG_KEYS

```ts
const FIELD_FORMAT_CONFIG_KEYS: Record<FieldFormat["kind"], readonly string[]>;
```

Defined in: [packages/rxdb/src/entity/metadata-validate.ts:142](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/metadata-validate.ts#L142)

Config keys allowed per kind (excluding `kind` itself).

## Remarks

The value type stays `readonly string[]` rather than literal tuples: callers need to test membership with `includes` against arbitrary `string`s, and narrowing to literals would only force a pile of assertions.
