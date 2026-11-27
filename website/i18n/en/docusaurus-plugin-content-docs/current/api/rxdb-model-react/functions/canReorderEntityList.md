# canReorderEntityList()

```ts
function canReorderEntityList(state): boolean;
```

Defined in: packages/rxdb-model/dist/entity-list/manual-order-list.d.ts:57

Whether drag-and-drop reordering is currently allowed for the entity list

## Parameters

| Parameter | Type                                                    | Description    |
| --------- | ------------------------------------------------------- | -------------- |
| `state`   | [`ListReorderState`](../interfaces/ListReorderState.md) | The list state |

## Returns

`boolean`

`true` when all conditions are met: a manually ordered entity, string primary key, not sorted by a column, no user filter, not in selection mode,
a fixed query pinning a complete ordering domain, fully loaded, and no read-only rows / drafts / unfinished edits / unsettled reorders

## Example

```typescript
const enabled = canReorderEntityList({ metadata, sortOrder: 'normal', fixedQuery, ...flags });
```
