# derive()

```ts
function derive<S, R>(sources, project): ReadableStore<R>;
```

Defined in: [store.ts:92](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/store.ts#L92)

Derives a read-only store from multiple stores.

## Type Parameters

| Type Parameter                                                                                                            |
| ------------------------------------------------------------------------------------------------------------------------- |
| <a id="type-parameter-s"></a> `S` _extends_ readonly [`ReadableStore`](../interfaces/ReadableStore.md)&lt;`unknown`&gt;[] |
| <a id="type-parameter-r"></a> `R`                                                                                         |

## Parameters

| Parameter | Type                 | Description                   |
| --------- | -------------------- | ----------------------------- |
| `sources` | `S`                  | The source stores.            |
| `project` | (...`values`) => `R` | The pure projection function. |

## Returns

[`ReadableStore`](../interfaces/ReadableStore.md)&lt;`R`&gt;

The derived store.

## Remarks

Lazily evaluated and cached by input references: when none of the source values' references changed, the previous result is returned, and when the projected result reference is identical no notification is emitted, satisfying `useSyncExternalStore`'s snapshot-stability requirement.
