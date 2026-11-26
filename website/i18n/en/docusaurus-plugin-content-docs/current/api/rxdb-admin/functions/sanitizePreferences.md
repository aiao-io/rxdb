# sanitizePreferences()

```ts
function sanitizePreferences(
   raw, 
   defaults, 
   constraints?
): AdminPreferences;
```

Defined in: [preferences/merge.ts:148](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/preferences/merge.ts#L148)

Sanitizes arbitrary input against the shape of the defaults tree: unknown keys are dropped, leaves with mismatched types or out-of-range values fall back to the default, numbers are clamped per constraints, and widget ordering is completed into a full permutation. Never throws.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `raw` | `unknown` | The input to sanitize (from storage, import, or a patch-merge result). |
| `defaults` | [`AdminPreferences`](../interfaces/AdminPreferences.md) | The defaults tree, which determines the shape and fallback values. |
| `constraints?` | [`PreferenceConstraints`](../type-aliases/PreferenceConstraints.md) | Leaf constraints. |

## Returns

[`AdminPreferences`](../interfaces/AdminPreferences.md)

A complete, valid preferences tree.
