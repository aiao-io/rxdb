# provideQueryBuilderTheme()

```ts
function provideQueryBuilderTheme(theme): void;
```

Defined in: [packages/rxdb-model-vue/src/query-builder/theme/query-builder-theme.ts:41](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-vue/src/query-builder/theme/query-builder-theme.ts#L41)

Provides a custom query builder theme (must be called during the component's `setup` phase).

## Parameters

| Parameter | Type                                                      | Description  |
| --------- | --------------------------------------------------------- | ------------ |
| `theme`   | [`QueryBuilderTheme`](../interfaces/QueryBuilderTheme.md) | Theme config |

## Returns

`void`

## Example

```typescript
// Provide a custom theme in the app root component
setup() {
  provideQueryBuilderTheme(MY_QUERY_BUILDER_THEME);
}
```
