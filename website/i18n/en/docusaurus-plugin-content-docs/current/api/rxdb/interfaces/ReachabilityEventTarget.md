# ReachabilityEventTarget

Defined in: [packages/rxdb/src/network/reachability.ts:33](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/network/reachability.ts#L33)

The shape of an event source for listening to `online` / `offline`

## Remarks

Declares only the two methods actually used, rather than taking a whole `Window`: Node / the Electron main process / workers
have no `window`, and narrowing to these two methods is what allows tests to pass a fake implementation directly.

## Methods

### addEventListener() \{#addeventlistener\}

```ts
addEventListener(type, listener): void;
```

Defined in: [packages/rxdb/src/network/reachability.ts:34](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/network/reachability.ts#L34)

#### Parameters

| Parameter  | Type                      |
| ---------- | ------------------------- |
| `type`     | `"online"` \| `"offline"` |
| `listener` | () => `void`              |

#### Returns

`void`

---

### removeEventListener() \{#removeeventlistener\}

```ts
removeEventListener(type, listener): void;
```

Defined in: [packages/rxdb/src/network/reachability.ts:35](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/network/reachability.ts#L35)

#### Parameters

| Parameter  | Type                      |
| ---------- | ------------------------- |
| `type`     | `"online"` \| `"offline"` |
| `listener` | () => `void`              |

#### Returns

`void`
