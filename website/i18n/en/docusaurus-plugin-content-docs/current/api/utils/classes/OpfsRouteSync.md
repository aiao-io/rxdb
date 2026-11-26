# OpfsRouteSync

Defined in: [packages/utils/src/@browser/opfs-route-sync.ts:17](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/utils/src/@browser/opfs-route-sync.ts#L17)

Syncs a route path to an OPFS browser view, serializing concurrent requests.

Only one drain round runs at a time: `sync` calls that arrive during it just overwrite the "target path" and share the same Promise, so **intermediate paths are dropped** — the final state is only guaranteed to converge to the path of the last request.

Stateful; keep one instance per view.

## Constructors

### Constructor

```ts
new OpfsRouteSync(): OpfsRouteSync;
```

#### Returns

`OpfsRouteSync`

## Methods

### sync() \{#sync\}

```ts
sync(
   available,
   routePath,
   getCurrentPath,
   actions
): Promise<void>;
```

Defined in: [packages/utils/src/@browser/opfs-route-sync.ts:32](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/utils/src/@browser/opfs-route-sync.ts#L32)

Requests a sync to `routePath`.

#### Parameters

| Parameter        | Type                                                    | Description                                                                                                          |
| ---------------- | ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `available`      | `boolean`                                               | Whether OPFS is available; when `false`, resolves immediately without recording the path or triggering any callbacks |
| `routePath`      | `string`                                                | Target path                                                                                                          |
| `getCurrentPath` | () => `string`                                          | Reads the currently displayed path, used to skip navigation with no change; read once per drain round                |
| `actions`        | [`OpfsRouteActions`](../interfaces/OpfsRouteActions.md) | See [OpfsRouteActions](../interfaces/OpfsRouteActions.md)                                                            |

#### Returns

`Promise`&lt;`void`&gt;

The Promise of this drain round; concurrent calls share the same instance.
When `actions` throws, it rejects with the same error — **all callers sharing this round reject together**
