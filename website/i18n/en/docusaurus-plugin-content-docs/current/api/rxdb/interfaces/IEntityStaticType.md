---
sidebar_label: "IEntityStaticType⟨StaticTypes⟩"
---

# IEntityStaticType`<StaticTypes>`

Defined in: [packages/rxdb/src/entity/entity.interface.ts:44](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity.interface.ts#L44)

The static types of an entity

## Remarks

Only a minimal commitment to "a shape attachable to a class constructor". Has **no** runtime field:
`ENTITY_STATIC_TYPES` is a `unique symbol` rather than a string key, so type inference only takes
the `StaticTypes` generic parameter, and nothing enumerable becomes an own property after compilation.

Actually attaching the "declared static types" to the class is done by the back-reference of [transitionMetadata](../functions/transitionMetadata.md)
(the `ENTITY_TYPE` slot); this interface only plays the role of type merging.

## Type Parameters

| Type Parameter | Default type |
| ------ | ------ |
| <a id="type-parameter-statictypes"></a> `StaticTypes` *extends* `object` | `object` |

## Properties

### \[ENTITY\_STATIC\_TYPES\]? \{#entity_static_types\}

```ts
[ENTITY_STATIC_TYPES]?: StaticTypes;
```

Defined in: [packages/rxdb/src/entity/entity.interface.ts:45](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity.interface.ts#L45)
