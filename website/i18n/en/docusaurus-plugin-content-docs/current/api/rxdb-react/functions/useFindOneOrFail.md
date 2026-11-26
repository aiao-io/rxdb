# useFindOneOrFail()

```ts
function useFindOneOrFail<T>(EntityType, options): RxDBResource<InstanceType<T> | undefined>;
```

Defined in: [rxdb-react/src/hooks.ts:204](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-react/src/hooks.ts#L204)

Finds the first matching entity; when the repository finds none, the error is written to the resource.

## Type Parameters

| Type Parameter |
| ------ |
| <a id="type-parameter-t"></a> `T` *extends* [`EntityType`](../../rxdb/type-aliases/EntityType.md) |

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `EntityType` | `T` | Entity type. |
| `options` | [`UseOptions`](../type-aliases/UseOptions.md)&lt;[`EntityStaticType`](../../rxdb/type-aliases/EntityStaticType.md)&lt;`T`, `"findOneOrFailOptions"`&gt;&gt; | `findOneOrFail` query options or an idempotent factory. |

## Returns

[`RxDBResource`](../interfaces/RxDBResource.md)&lt;`InstanceType`&lt;`T`&gt; \| `undefined`&gt;

Query resource where `error` is set and `hasValue` is `false` when nothing matches.
