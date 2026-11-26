# tryGetEntityMetadata()

```ts
function tryGetEntityMetadata(target): 
  | Readonly<EntityMetadataType>
  | undefined;
```

Defined in: [packages/rxdb/src/rxdb-utils.ts:59](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-utils.ts#L59)

Probes for entity metadata: returns `undefined` when not found, does not throw.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `target` | `unknown` | Any object; it is not required to be an entity |

## Returns

  \| `Readonly`&lt;[`EntityMetadataType`](../interfaces/EntityMetadataType.md)&gt;
  \| `undefined`

The entity metadata object, or `undefined` when absent

## Remarks

After [getEntityMetadata](getEntityMetadata.md) became fail-fast, **call sites that genuinely need to probe must say so explicitly**,
instead of getting by on "it returns undefined anyway". Currently the only legitimate probe is
`metadata-transition.ts` walking up the prototype chain to find parent class metadata — reaching the layer without metadata is the termination condition,
not an error.
