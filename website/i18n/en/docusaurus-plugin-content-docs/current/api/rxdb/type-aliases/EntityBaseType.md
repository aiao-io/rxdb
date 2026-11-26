# EntityBaseType

```ts
type EntityBaseType = IEntityStaticType & (new (...args) => IEntity);
```

Defined in: [packages/rxdb/src/entity/entity.interface.ts:148](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity.interface.ts#L148)

Entity base type

Represents the common shape of "all entity classes inheriting from [EntityBase](../classes/EntityBase.md)"; mainly for
factories inside rxdb-adapter that must construct an `IRepository` while not holding a concrete entity class. The vast
majority of business code should use [EntityType](EntityType.md) directly.
