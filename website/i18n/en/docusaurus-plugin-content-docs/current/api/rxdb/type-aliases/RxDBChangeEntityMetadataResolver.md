# RxDBChangeEntityMetadataResolver

```ts
type RxDBChangeEntityMetadataResolver = (entity, namespace) => EntityMetadata | undefined;
```

Defined in: [packages/rxdb/src/system/change-codec.ts:216](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/change-codec.ts#L216)

Callback that looks up the metadata of the **remote entity**.

## Parameters

| Parameter   | Type     | Description                        |
| ----------- | -------- | ---------------------------------- |
| `entity`    | `string` | The remote entity name             |
| `namespace` | `string` | The namespace of the remote entity |

## Returns

[`EntityMetadata`](EntityMetadata.md) \| `undefined`

Returns the metadata when found, or `undefined` when it is not registered in this process

## Remarks

Used in only one case: a key in the patch is a foreign-key column, but this entity's `propertyMap` does not have it
(a many-to-many join table declaring only its own side of the foreign key is the typical scenario). In that case the
column's real type is written on the **remote** side's `id`, and without the lookup a `bigint` foreign key would be
written straight into JSON as a plain value.

The named export exists so that the working-tree patch codec of `@aiao/rxdb-plugin-working-tree` and each adapter's
`encryptionContext.resolveEntityMetadata` reference **the same** type, instead of each declaring its own structurally
identical anonymous signature — structurally identical types never error against each other when changed, and nobody
finds out when they drift apart.
