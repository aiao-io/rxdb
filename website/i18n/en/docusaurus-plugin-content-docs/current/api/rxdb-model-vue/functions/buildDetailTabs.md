# buildDetailTabs()

```ts
function buildDetailTabs(metadata, i18n?): DetailTab[];
```

Defined in: packages/rxdb-model/dist/entity-detail/detail-tabs.d.ts:10

Builds the detail page tab list from entity metadata

## Parameters

| Parameter  | Type                                                          | Description     |
| ---------- | ------------------------------------------------------------- | --------------- |
| `metadata` | [`EntityMetadata`](../../rxdb/type-aliases/EntityMetadata.md) | Entity metadata |
| `i18n?`    | [`ModelI18n`](../interfaces/ModelI18n.md)                     | -               |

## Returns

[`DetailTab`](../type-aliases/DetailTab.md)[]

List of detail page tab configs

## Remarks

The basic-info form tab is always pinned first, followed by one table tab generated for each one-to-many / many-to-many relation
