---
sidebar_label: "IEntityStaticType⟨StaticTypes⟩"
---

# IEntityStaticType`<StaticTypes>`

Defined in: [packages/rxdb/src/entity/entity.interface.ts:44](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity.interface.ts#L44)

The static types of an entity

## Remarks

Only the minimal promise of a "shape attachable to a class constructor". It has **no** runtime field:
`ENTITY_STATIC_TYPES` is a `unique symbol`, not a string key; type inference only takes
the `StaticTypes` generic parameter, and it does not become an enumerable own property after compilation.

The operation that actually attaches the "declared static types" to a class is done by the
back-reference (`ENTITY_TYPE` slot) of [transitionMetadata](../functions/transitionMetadata.md); this interface only plays the type-merging role.

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
