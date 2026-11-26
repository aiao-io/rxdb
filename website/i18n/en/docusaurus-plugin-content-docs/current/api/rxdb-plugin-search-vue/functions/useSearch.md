# useSearch()

```ts
function useSearch(source, options?): UseSearchReturn;
```

Defined in: [packages/rxdb-plugin-search-vue/src/use-search.ts:115](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-search-vue/src/use-search.ts#L115)

Adapts the reactive output of `SearchHandle` into a Vue composable.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `source` | `MaybeRefOrGetter`&lt;[`SearchSourceLike`](../interfaces/SearchSourceLike.md)&gt; | The data source exposing a `search()` method (`RxDB` / `RxCollection`); accepts a value / `Ref` / getter and rebuilds the handle when the resolved value changes |
| `options?` | `MaybeRefOrGetter`&lt;[`SearchOptions`](../interfaces/SearchOptions.md) \| `undefined`&gt; | Per-call [SearchOptions](../interfaces/SearchOptions.md); accepts a value / `Ref` / getter and rebuilds the handle on semantic changes (`collections` / `debounce` / `pageSize` / `snippetLength`) |

## Returns

[`UseSearchReturn`](../interfaces/UseSearchReturn.md)

## Example

```vue
<script setup>
  const { query, results, state } = useSearch(db, { debounce: 200 });
</script>
<template><input v-model="query" /></template>
```
