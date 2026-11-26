# buildDetailTabs()

```ts
function buildDetailTabs(metadata, i18n?): DetailTab[];
```

Defined in: [packages/rxdb-model/src/entity-detail/detail-tabs.ts:18](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-detail/detail-tabs.ts#L18)

Builds the detail page tab list from entity metadata.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `metadata` | [`EntityMetadata`](../../rxdb/type-aliases/EntityMetadata.md) | Entity metadata |
| `i18n?` | [`ModelI18n`](../interfaces/ModelI18n.md) | - |

## Returns

[`DetailTab`](../type-aliases/DetailTab.md)[]

The list of detail page tab configurations

## Remarks

The basic information form tab is always pinned first, followed by one table tab generated for each one-to-many / many-to-many relation.
