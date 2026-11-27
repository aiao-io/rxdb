---
sidebar_label: 'EntityType⟨StaticTypes, Instance⟩'
---

# EntityType`<StaticTypes, Instance>`

```ts
type EntityType<StaticTypes, Instance> = IEntityStaticType<StaticTypes> & (new (...args) => Instance);
```

Defined in: [packages/rxdb/src/entity/entity.interface.ts:107](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity.interface.ts#L107)

Entity type

Represents an instantiable entity constructor type — both "a class you can `new`" and a carrier of the static method
signatures declared via `ENTITY_STATIC_TYPES`.

## Type Parameters

| Type Parameter                                                           | Default type | Description                                                                                                                                                             |
| ------------------------------------------------------------------------ | ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| <a id="type-parameter-statictypes"></a> `StaticTypes` _extends_ `object` | `object`     | The class-side static method type declaration (e.g. `findOptions` / `idType`); defaulting to `object` selects the automatic derivation path of DerivedEntityStaticType. |
| <a id="type-parameter-instance"></a> `Instance` _extends_ `object`       | `object`     | The shape of the `new`ed instance, only useful for conditional-type inference in adapters.                                                                              |

## Remarks

`new (...args: never[])` is deliberate: the entity's actual constructor signature is **rewritten** by the
[Entity](../functions/Entity.md) decorator at compile time to `(initData?)`, and the public type layer does not expose
parameters in order to prevent callers from relying on the implicit contract that "specific parameters will be filled
in".
