# ENTITY_TABLE_CONFIG

```ts
const ENTITY_TABLE_CONFIG: Context<EntityTableConfig | undefined>;
```

Defined in: [packages/rxdb-model-react/src/entity-table/config.tsx:24](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-react/src/entity-table/config.tsx#L24)

Entity table configuration context.

## Example

```tsx
<ENTITY_TABLE_CONFIG.Provider value={{ tooltipDelay: 400 }}>
  <EntityTable records={records} columns={columns} />
</ENTITY_TABLE_CONFIG.Provider>
```
