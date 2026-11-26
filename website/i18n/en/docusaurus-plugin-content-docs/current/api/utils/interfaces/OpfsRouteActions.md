# OpfsRouteActions

Defined in: [packages/utils/src/@browser/opfs-route-sync.ts:2](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/utils/src/@browser/opfs-route-sync.ts#L2)

The two side-effect callbacks required by [OpfsRouteSync.sync](../classes/OpfsRouteSync.md#sync).

## Properties

### init \{#init\}

```ts
init: path => Promise<void>;
```

Defined in: [packages/utils/src/@browser/opfs-route-sync.ts:4](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/utils/src/@browser/opfs-route-sync.ts#L4)

Called on the first sync; responsible for navigating the browser to `path`. If it throws, this round of sync fails and the next `sync` retries initialization.

#### Parameters

| Parameter | Type     |
| --------- | -------- |
| `path`    | `string` |

#### Returns

`Promise`&lt;`void`&gt;

---

### navigateTo \{#navigateto\}

```ts
navigateTo: path => Promise<void>;
```

Defined in: [packages/utils/src/@browser/opfs-route-sync.ts:6](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/utils/src/@browser/opfs-route-sync.ts#L6)

Only called after initialization, when the target path differs from the current path.

#### Parameters

| Parameter | Type     |
| --------- | -------- |
| `path`    | `string` |

#### Returns

`Promise`&lt;`void`&gt;
