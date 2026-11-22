# @aiao/rxdb-vue

Vue 3.5 integration for Aiao RxDB. The package provides dependency injection, reactive query composables, cursor infinite scrolling, async actions, persisted state, entity-change rendering, and sync state.

## Install

```bash
pnpm add @aiao/rxdb @aiao/rxdb-vue rxjs vue
```

## Provide a database

```vue
<script setup lang="ts">
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

```ts
import { useCount, useFind, useGet } from '@aiao/rxdb-vue';

const todos = useFind(Todo, { where: { combinator: 'and', rules: [] } });
const todo = useGet(Todo, 'todo-1');
const count = useCount(Todo, { where: { combinator: 'and', rules: [] } });
```

The returned reactive resources expose `value`, `isLoading`, `error`, `hasValue`, and `isEmpty`. Keep the resource object together when consuming it in setup code. `useAction`, `useInfiniteScroll`, `usePersistedState`, `useEntityChange`, and `useSyncState` mirror the corresponding Angular and React APIs.

Run package tests with:

```bash
pnpm nx test rxdb-vue --run
```

Read the [English Vue guide](https://rxdb.aiao.io/en/docs/frameworks/vue) and the [Chinese mirror](README.zh-CN.md) for the complete API.
