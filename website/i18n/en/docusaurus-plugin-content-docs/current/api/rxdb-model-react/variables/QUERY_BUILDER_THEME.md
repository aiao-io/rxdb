# QUERY_BUILDER_THEME

```ts
const QUERY_BUILDER_THEME: Context<QueryBuilderTheme | undefined>;
```

Defined in: [packages/rxdb-model-react/src/query-builder/theme/query-builder-theme.tsx:38](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-react/src/query-builder/theme/query-builder-theme.tsx#L38)

QueryBuilder theme context (the React equivalent of the Angular side's `QUERY_BUILDER_THEME` InjectionToken).

## Example

```tsx
<QueryBuilderThemeProvider theme={MY_THEME}>
  <QueryBuilder fields={fields} />
</QueryBuilderThemeProvider>
```
