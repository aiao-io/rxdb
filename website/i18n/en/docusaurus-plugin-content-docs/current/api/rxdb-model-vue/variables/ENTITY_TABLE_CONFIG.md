# ENTITY_TABLE_CONFIG

```ts
const ENTITY_TABLE_CONFIG: InjectionKey<EntityTableConfig>;
```

Defined in: [packages/rxdb-model-vue/src/entity-table/config.ts:10](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-vue/src/entity-table/config.ts#L10)

Entity table configuration injection key (aligned with the Angular-side `ENTITY_TABLE_CONFIG` DI token).

The app layer provides global configuration via `provide(ENTITY_TABLE_CONFIG, { tooltipDelay: 200 })`;
the defaults are used when nothing is provided.
