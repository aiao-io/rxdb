# landingRoute()

```ts
function landingRoute<T>(node): string | undefined;
```

Defined in: [layout/menu.ts:106](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/layout/menu.ts#L106)

The node's landing route: its own route, otherwise the first descendant's route.

## Type Parameters

| Type Parameter                    |
| --------------------------------- |
| <a id="type-parameter-t"></a> `T` |

## Parameters

| Parameter | Type                                               | Description    |
| --------- | -------------------------------------------------- | -------------- |
| `node`    | [`MenuNode`](../interfaces/MenuNode.md)&lt;`T`&gt; | The menu node. |

## Returns

`string` \| `undefined`

The route; `undefined` when the whole subtree has no route.
