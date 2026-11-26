# diffPreferences()

```ts
function diffPreferences(current, base): DeepPartial<AdminPreferences> | null;
```

Defined in: [preferences/merge.ts:75](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/preferences/merge.ts#L75)

Computes the structured diff against a baseline.

## Parameters

| Parameter | Type                                                    | Description               |
| --------- | ------------------------------------------------------- | ------------------------- |
| `current` | [`AdminPreferences`](../interfaces/AdminPreferences.md) | The current preferences.  |
| `base`    | [`AdminPreferences`](../interfaces/AdminPreferences.md) | The baseline preferences. |

## Returns

\| [`DeepPartial`](../type-aliases/DeepPartial.md)&lt;[`AdminPreferences`](../interfaces/AdminPreferences.md)&gt;
\| `null`

The diff; returns `null` when there is no difference.
