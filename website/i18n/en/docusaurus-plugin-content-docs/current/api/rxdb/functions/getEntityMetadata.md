# getEntityMetadata()

```ts
function getEntityMetadata<T>(target): EntityMetadata;
```

Defined in: [packages/rxdb/src/rxdb-utils.ts:41](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-utils.ts#L41)

Gets the entity metadata.

## Type Parameters

| Type Parameter                                                                            |
| ----------------------------------------------------------------------------------------- |
| <a id="type-parameter-t"></a> `T` _extends_ [`EntityType`](../type-aliases/EntityType.md) |

## Parameters

| Parameter | Type                             | Description                         |
| --------- | -------------------------------- | ----------------------------------- |
| `target`  | `T` \| `InstanceType`&lt;`T`&gt; | The entity class or entity instance |

## Returns

[`EntityMetadata`](../type-aliases/EntityMetadata.md)

The entity metadata object

## Throws

RxDBError when `target` is not decorated with `@Entity`

## Remarks

**Throws when not found, does not return `undefined`.** The old implementation used `!` to force `undefined` into `EntityMetadata`,
so an undecorated object would flow far away with a type-correct `undefined` before exploding,
with the site and the cause bearing no relation to each other. Only 1 of the 403 call sites in the repository ever null-checked the result —
the existing convention has always been "what is passed in must be an entity"; fail-fast just makes the declaration true.
