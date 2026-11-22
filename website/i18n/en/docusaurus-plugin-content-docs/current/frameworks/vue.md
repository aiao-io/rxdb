# Vue integration

`@aiao/rxdb-vue` provides Vue 3 Composables backed by Vue provide/inject and reactive subscriptions.

## Install

```bash npm2yarn
npm install @aiao/rxdb @aiao/rxdb-vue
```

## Provide the database

Call `provideRxDB` from a component setup function that is an ancestor of the consuming components.

```vue
<script setup lang="ts">
import { provideRxDB } from '@aiao/rxdb-vue';

provideRxDB(rxdb);
</script>

<template>
  <TodoList />
</template>
```

## Subscribe to a query

```vue
<script setup lang="ts">
import { useFind } from '@aiao/rxdb-vue';

const todos = useFind(() =>
  Todo.find({
    where: { combinator: 'and', rules: [] },
    orderBy: [{ field: 'createdAt', sort: 'desc' }]
  })
);
</script>

<template>
  <ul>
    <li v-for="todo in todos" :key="todo.id">{{ todo.title }}</li>
  </ul>
</template>
```

See the [Vue API reference](../api/rxdb-vue/README.md) and the runnable Vue example for lifecycle and query details.
