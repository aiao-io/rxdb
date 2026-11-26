# canReorderEntityList()

```ts
function canReorderEntityList(state): boolean;
```

Defined in: [packages/rxdb-model/src/entity-list/manual-order-list.ts:92](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-list/manual-order-list.ts#L92)

Whether drag-and-drop reordering is currently allowed for the entity list.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `state` | [`ListReorderState`](../interfaces/ListReorderState.md) | The list state |

## Returns

`boolean`

`true` when all conditions are met: a manually ordered entity, string primary key, no column sorting, no user filter, not in selection mode,
  a fixed query pinning one complete ordering domain, everything loaded, and no read-only rows / drafts / unfinished edits / unsettled reordering.

## Example

```typescript
const enabled = canReorderEntityList({ metadata, sortOrder: 'normal', fixedQuery, ...flags });
```
