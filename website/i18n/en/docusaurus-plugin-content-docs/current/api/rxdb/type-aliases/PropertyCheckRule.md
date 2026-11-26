# PropertyCheckRule

```ts
type PropertyCheckRule = Omit<CheckRule, "field">;
```

Defined in: [packages/rxdb/src/entity/check-constraint.ts:127](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/check-constraint.ts#L127)

Property-level `check` syntactic sugar: a rule with `field` omitted, compiled into an entity-level CHECK whose `name`
is the property name.
