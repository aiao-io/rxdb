# EntityTableConfigProvider()

```ts
function EntityTableConfigProvider(props): Element;
```

Defined in: [packages/rxdb-model-react/src/entity-table/config.tsx:31](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-react/src/entity-table/config.tsx#L31)

Entity table configuration Provider component (equivalent to using ENTITY\_TABLE\_CONFIG.Provider directly).

## Parameters

| Parameter         | Type                                                                                                | Description                                                                |
| ----------------- | --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `props`           | \{ `children?`: `ReactNode`; `value`: [`EntityTableConfig`](../interfaces/EntityTableConfig.md); \} | `value` is the table configuration and `children` is the consuming subtree |
| `props.children?` | `ReactNode`                                                                                         | -                                                                          |
| `props.value`     | [`EntityTableConfig`](../interfaces/EntityTableConfig.md)                                           | -                                                                          |

## Returns

`Element`
