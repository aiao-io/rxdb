---
sidebar_label: "EntityInstanceType⟨T⟩"
---

# EntityInstanceType`<T>`

```ts
type EntityInstanceType<T> = T extends new (...args) => infer R ? R : never;
```

Defined in: [packages/rxdb/src/entity/entity.interface.ts:129](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity.interface.ts#L129)

Entity instance type

Extracts the shape of the instance produced by `new` from [EntityType](EntityType.md).

## Type Parameters

| Type Parameter | Description |
| ------ | ------ |
| <a id="type-parameter-t"></a> `T` *extends* [`EntityType`](EntityType.md) | The entity type (constructor side) |

## Remarks

Do **not** use the built-in `InstanceType<T>` in place of this type. `InstanceType`'s constraint is
`abstract new (...args: any) => any`, while [EntityType](EntityType.md)'s constructor signature is deliberately pinned to
`new (...args: never[])` — at the contravariant position `any` is not assignable to `never`, the constraint is not satisfied,
so the conditional type falls to the `: any` fallback branch: **`InstanceType<EntityType>` is always `any`**.

`any` does not error; it only silently swallows all type checks after it, so this collapse is completely invisible in the compilation output;
the only sign is the `any` appearing in `.d.ts`. This type writes `never[]` into its own conditional branch,
so `R` is inferred correctly.
