# buildListViewTableOptions()

```ts
function buildListViewTableOptions(
   state, 
   columns, 
   i18n?
): Partial<ListTableConstructorOptions>;
```

Defined in: packages/rxdb-model/dist/entity-list/list-view.d.ts:37

Builds the collapsible groups and the loaded record count, without passing the current page count off as the full total.

## Parameters

| Parameter | Type |
| ------ | ------ |
| `state` | [`ListViewState`](../interfaces/ListViewState.md) |
| `columns` | readonly `ColumnDefine`[] |
| `i18n?` | [`ModelI18n`](../interfaces/ModelI18n.md) |

## Returns

`Partial`&lt;`ListTableConstructorOptions`&gt;
