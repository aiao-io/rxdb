<script setup lang="ts">
import { provideRxDB } from '@aiao/rxdb-vue';
import { getRxdb } from './todo';
import TodoList from './TodoList.vue';

provideRxDB(getRxdb());
</script>

<template>
  <TodoList />
</template>
