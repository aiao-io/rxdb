# buildListViewTableOptions()

```ts
function buildListViewTableOptions(state, columns, i18n?): Partial<ListTableConstructorOptions>;
```

Defined in: [packages/rxdb-model/src/entity-list/list-view.ts:103](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-list/list-view.ts#L103)

Builds collapsible groups and the loaded record count, without passing off the current page count as the full count.

## Parameters

| Parameter | Type                                              |
| --------- | ------------------------------------------------- |
| `state`   | [`ListViewState`](../interfaces/ListViewState.md) |
| `columns` | readonly `ColumnDefine`[]                         |
| `i18n?`   | [`ModelI18n`](../interfaces/ModelI18n.md)         |

## Returns

`Partial`&lt;`ListTableConstructorOptions`&gt;
