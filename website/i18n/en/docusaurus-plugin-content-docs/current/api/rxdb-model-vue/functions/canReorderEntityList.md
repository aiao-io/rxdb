# canReorderEntityList()

```ts
function canReorderEntityList(state): boolean;
```

Defined in: packages/rxdb-model/dist/entity-list/manual-order-list.d.ts:57

Whether the entity list currently allows drag and drop ordering

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `state` | [`ListReorderState`](../interfaces/ListReorderState.md) | List state |

## Returns

`boolean`

`true` when all conditions are met: manually ordered entity, string primary key, not sorted by a column, no user filter, not in selection mode,
  a fixed query pinning a complete ordering domain, everything loaded, and no readonly rows / drafts / unfinished edits / unsettled reorders

## Example

```typescript
const enabled = canReorderEntityList({ metadata, sortOrder: 'normal', fixedQuery, ...flags });
```
