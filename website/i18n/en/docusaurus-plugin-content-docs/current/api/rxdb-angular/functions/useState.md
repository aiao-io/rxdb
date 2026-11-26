# useState()

```ts
function useState(namespace): (name) => NamespacedState;
```

Defined in: [rxdb-angular/src/use-state.ts:286](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-angular/src/use-state.ts#L286)

Creates a read/write entry point for persisted state under a namespace.

## Parameters

| Parameter   | Type     | Description                                                      |
| ----------- | -------- | ---------------------------------------------------------------- |
| `namespace` | `string` | State namespace; combined with name to form the localStorage key |

## Returns

Returns [NamespacedState](../interfaces/NamespacedState.md) after a name is passed; the same `namespace + name` always returns the same signal

(`name`) => [`NamespacedState`](../interfaces/NamespacedState.md)

## Remarks

**Must be called in an Angular injection context** `useState(namespace)(name)` — the registry is a root service.

The `initialValue` of the first call determines the initial value; later calls with the same key reuse the existing signal, and the passed `initialValue` and `options` are ignored; a value type different from the first registration throws (RAN-010).

`namespace` and `name` may contain arbitrary characters: each is escaped separately in the persistence key, so they cannot collide (RAN-005). Legacy keys containing `:` or `%` are migrated to the new key once on first read.

The `storage` event is not listened to yet, so it does **not sync across tabs**: writes from another tab do not reflect in this page's signal.
