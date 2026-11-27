# EntityData

```ts
type EntityData = Record<string, unknown>;
```

Defined in: [packages/rxdb/src/entity/entity.interface.ts:139](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity.interface.ts#L139)

Entity data type

A generic key-value data object — used only in places that do not constrain a concrete entity shape, such as
[Rule](Rule.md) / `RuleGroup`; any field declaration coupled to entity properties should go through the derived path of
[EntityStaticType](EntityStaticType.md) instead of using `EntityData` to erase the "concrete field names".
