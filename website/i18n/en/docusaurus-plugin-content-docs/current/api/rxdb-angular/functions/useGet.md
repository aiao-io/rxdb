# useGet()

```ts
function useGet<T>(EntityType, options): RxDBResource<InstanceType<T> | undefined>;
```

Defined in: [rxdb-angular/src/hooks.ts:142](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-angular/src/hooks.ts#L142)

Fetches a single entity by ID

## Type Parameters

| Type Parameter                                                                                    |
| ------------------------------------------------------------------------------------------------- |
| <a id="type-parameter-t"></a> `T` _extends_ [`EntityType`](../../rxdb/type-aliases/EntityType.md) |

## Parameters

| Parameter    | Type                                                                                                                                              | Description                           |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| `EntityType` | `T`                                                                                                                                               | Entity class                          |
| `options`    | [`UseOptions`](../type-aliases/UseOptions.md)&lt;[`EntityStaticType`](../../rxdb/type-aliases/EntityStaticType.md)&lt;`T`, `"getOptions"`&gt;&gt; | Entity ID or a query parameter object |

## Returns

[`RxDBResource`](../interfaces/RxDBResource.md)&lt;`InstanceType`&lt;`T`&gt; \| `undefined`&gt;

Resource signal containing the entity

## Example

```typescript
const user = useGet(User, 'user-1');
```
