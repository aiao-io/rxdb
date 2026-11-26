# AbstractEntityType

```ts
type AbstractEntityType = abstract new (...args) => object;
```

Defined in: [packages/rxdb/src/entity/entity.interface.ts:157](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity.interface.ts#L157)

Abstract entity type

Only classes decorated with `@Entity({ abstract: true })`. It does **not** trigger the subclassing of the
[Entity](../functions/Entity.md) decorator (there is no runtime `new`), so it commonly appears on base classes meant only
for inheritance, such as `EntityBase` / `TreeAdjacencyListEntityBase`.

## Parameters

| Parameter | Type |
| ------ | ------ |
| ...`args` | `never`[] |

## Returns

`object`
