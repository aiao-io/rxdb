# buildDrawerModel()

```ts
function buildDrawerModel(input): DrawerTab[];
```

Defined in: [preferences/drawer-model.ts:163](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/preferences/drawer-model.ts#L163)

Builds the drawer's tab / group / setting-row view model from preference items: labels are already translated, options resolved, and current values plus actionable states computed, so all three frameworks only need to render by `control.kind` and no longer decide on their own.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `input` | [`DrawerModelInput`](../interfaces/DrawerModelInput.md) | Preferences, preference items, translations, and the write function. |

## Returns

[`DrawerTab`](../interfaces/DrawerTab.md)[]

Tabs in a fixed order; tabs with no content have an empty `sections`.
