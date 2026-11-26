# ExclusionRangeKind

```ts
type ExclusionRangeKind = 'timestamp' | 'integer' | 'bigint';
```

Defined in: [packages/rxdb/src/entity/exclusion-constraint.ts:77](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/exclusion-constraint.ts#L77)

The value domain of the range dimension: decides the range type on the PG side (`tstzrange` / `int8range`) and the JS
shape of the endpoint values.
