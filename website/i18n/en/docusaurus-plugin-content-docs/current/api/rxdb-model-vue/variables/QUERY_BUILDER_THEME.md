# QUERY_BUILDER_THEME

```ts
const QUERY_BUILDER_THEME: InjectionKey<QueryBuilderTheme>;
```

Defined in: [packages/rxdb-model-vue/src/query-builder/theme/query-builder-theme.ts:26](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-vue/src/query-builder/theme/query-builder-theme.ts#L26)

QueryBuilder theme injection key (aligned with the Angular-side `QUERY_BUILDER_THEME` DI token).

The app layer provides a custom theme via [provideQueryBuilderTheme](../functions/provideQueryBuilderTheme.md); when none is provided,
the components fall back to [DEFAULT\_QUERY\_BUILDER\_THEME](DEFAULT_QUERY_BUILDER_THEME.md).
