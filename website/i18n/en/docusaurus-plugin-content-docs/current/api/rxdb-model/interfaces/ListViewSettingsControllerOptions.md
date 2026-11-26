# ListViewSettingsControllerOptions

Defined in: [packages/rxdb-model/src/entity-list/list-view-settings.ts:6](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-list/list-view-settings.ts#L6)

Field order and reorder callbacks used by the list settings interaction controller.

## Properties

### fields \{#fields\}

```ts
fields: () => readonly string[];
```

Defined in: [packages/rxdb-model/src/entity-list/list-view-settings.ts:8](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-list/list-view-settings.ts#L8)

Current field sequence; the order matches the field rows in the panel.

#### Returns

readonly `string`[]

---

### onReorder \{#onreorder\}

```ts
onReorder: (fields) => void;
```

Defined in: [packages/rxdb-model/src/entity-list/list-view-settings.ts:10](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-list/list-view-settings.ts#L10)

Commit the new field order.

#### Parameters

| Parameter | Type       |
| --------- | ---------- |
| `fields`  | `string`[] |

#### Returns

`void`
