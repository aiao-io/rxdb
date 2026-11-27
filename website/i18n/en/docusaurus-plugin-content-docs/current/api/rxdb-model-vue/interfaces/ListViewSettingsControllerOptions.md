# ListViewSettingsControllerOptions

Defined in: packages/rxdb-model/dist/entity-list/list-view-settings.d.ts:2

Field order and reorder callback used by the list configuration interaction controller.

## Properties

### fields \{#fields\}

```ts
fields: () => readonly string[];
```

Defined in: packages/rxdb-model/dist/entity-list/list-view-settings.d.ts:4

Current field sequence; the order matches the field rows in the panel.

#### Returns

readonly `string`[]

---

### onReorder \{#onreorder\}

```ts
onReorder: (fields) => void;
```

Defined in: packages/rxdb-model/dist/entity-list/list-view-settings.d.ts:6

Commits the new order of the fields.

#### Parameters

| Parameter | Type       |
| --------- | ---------- |
| `fields`  | `string`[] |

#### Returns

`void`
