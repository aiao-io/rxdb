# ListViewSettingsControllerOptions

Defined in: packages/rxdb-model/dist/entity-list/list-view-settings.d.ts:2

The field order and reorder callback used by the list settings interaction controller.

## Properties

### fields \{#fields\}

```ts
fields: () => readonly string[];
```

Defined in: packages/rxdb-model/dist/entity-list/list-view-settings.d.ts:4

The current field sequence, in the same order as the field rows in the panel.

#### Returns

readonly `string`[]

---

### onReorder \{#onreorder\}

```ts
onReorder: (fields) => void;
```

Defined in: packages/rxdb-model/dist/entity-list/list-view-settings.d.ts:6

Commits the new field order.

#### Parameters

| Parameter | Type       |
| --------- | ---------- |
| `fields`  | `string`[] |

#### Returns

`void`
