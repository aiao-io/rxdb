# @aiao/rxdb-vue

Vue 3.5 integration for Aiao RxDB. The package provides dependency injection, reactive query composables, cursor infinite scrolling, async actions, persisted state, entity-change rendering, and sync state.

## Install

```bash
pnpm add @aiao/rxdb @aiao/rxdb-vue rxjs vue
```

## Provide a database

```vue
<script lang="ts" setup>
import { provideRxDB } from '@aiao/rxdb-vue';
import { database } from './database';

provideRxDB(database);
</script>

<template>
  <TodoList />
</template>
```

`provideRxDB` accepts an instance, Promise, factory, or Vue ref. Provider-created instances are destroyed with the provider. Application-owned instances and refs remain application-owned.

## Query data

- `useGet` reads a single ID.
- `useFindOne` and `useFindOneOrFail` read the first match.
- `useFind` and `useFindAll` read matching rows.
- `useFindByCursor` reads a page.
- `useCount` counts matching rows.

Graph API: `useGraphNeighbors`, `useCountNeighbors`, and `useGraphPaths` query entities configured with the graph plugin.

```ts
import { useCount, useFind, useGet } from '@aiao/rxdb-vue';

const todos = useFind(Todo, { where: { combinator: 'and', rules: [] } });
const todo = useGet(Todo, '00000000-0000-4000-8000-000000000001');
const count = useCount(Todo, { where: { combinator: 'and', rules: [] } });
```

The returned reactive resources expose `value`, `isLoading`, `error`, `hasValue`, and `isEmpty`. Keep the resource object together when consuming it in setup code. `useAction`, `useInfiniteScroll`, `usePersistedState`, `useEntityChange`, and `useSyncState` mirror the corresponding Angular and React APIs.

## Render entity updates

`useEntityChange` observes patches on an existing entity. Expose its `value` ref at the top level so the template unwraps it.

```vue
<script lang="ts" setup>
import { useEntityChange } from '@aiao/rxdb-vue';

const props = defineProps<{ todo: Todo }>();
const { value: todo } = useEntityChange(() => props.todo, { debounceTime: 200 });
</script>

<template>
  <div>{{ todo?.title }}</div>
</template>
```

Run package tests with:

```bash
pnpm nx test rxdb-vue --run
```

Read the [English Vue guide](https://rxdb.aiao.io/en/docs/frameworks/vue) and the [Chinese mirror](https://github.com/aiao-io/rxdb/blob/main/packages/rxdb-vue/README.zh-CN.md) for the complete API.
