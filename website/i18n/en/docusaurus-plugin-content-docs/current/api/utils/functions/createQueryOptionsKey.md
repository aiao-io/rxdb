# createQueryOptionsKey()

```ts
function createQueryOptionsKey(options, label?): string;
```

Defined in: [packages/utils/src/object/createQueryOptionsKey.ts:92](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/utils/src/object/createQueryOptionsKey.ts#L92)

Computes the content key of query options and projects cursor entities into deterministic data snapshots.

## Parameters

| Parameter | Type      | Default value     | Description                                                                                       |
| --------- | --------- | ----------------- | ------------------------------------------------------------------------------------------------- |
| `options` | `unknown` | `undefined`       | The query options; `after` / `before` may be real entity instances                                |
| `label?`  | `string`  | `'Query options'` | The error message prefix, carrying the caller's context into errors (e.g. `'RxDB query options'`) |

## Returns

`string`

A stable key corresponding one-to-one with "option content + cursor identity"

## Throws

Thrown when the options or cursor identity fields contain functions, symbols, unrecognized host objects, or circular references

## Remarks

RVU-001 / RRE-002: the public type of `FindByCursorOptions.after/before` is `InstanceType<T>`, and entities are created with `Object.create(EntityType.prototype)` then wrapped in a `Proxy` that only has a set trap; `Object.getPrototypeOf` passes through to `EntityType.prototype` — handing the whole object to [createStableKey](createStableKey.md) inevitably hits its "non-plain host object" rejection branch, so components throw `TypeError` directly during setup / render, and the most common usage, "continue scrolling from an item", cannot issue a single query.

The fix is not to loosen the host-object fallback (that is exactly what `createStableKey` guards against — `WeakMap` / DOM nodes whose `Object.keys` is also empty being silently treated as equivalent), but to make the key **understand cursor semantics**: cursor identity = the values of each `orderBy` field on the cursor. Because `orderBy` must end with `id`, this set of values uniquely determines a cursor position; changes to non-`orderBy` fields (title, updatedAt, ...) do not form a new cursor, otherwise live queries back-filling those fields would trigger re-subscription → re-back-fill in an infinite loop.

All three framework bindings share this function to avoid semantic drift from each writing its own.

Projection only happens at the **top level** of `after` / `before`: a self-referential options object brings serialization back to the original object, hits the unprojected cursor prototype, and reports "serializable" rather than "circular". Both are `TypeError`s, neither produces a key nor recurses infinitely — self-referential query options are not a supported input in the first place.

## Example

```ts
const key = createQueryOptionsKey(
  {
    where,
    orderBy: [
      { field: 'createdAt', sort: 'desc' },
      { field: 'id', sort: 'asc' }
    ],
    after: entity
  },
  'RxDB query options'
);
// a new instance with the same identity computes the same key; it only changes when the cursor changes
```
