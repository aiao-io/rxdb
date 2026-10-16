<script setup lang="ts">
import { computed, ref } from 'vue';
import type { EntityStaticType } from '@aiao/rxdb';
import { useFindAll, useRxDB } from '@aiao/rxdb-vue';
import { Todo } from './todo';

type Filter = 'all' | 'active' | 'completed';

const FILTERS: Filter[] = ['all', 'active', 'completed'];

const rxdb = useRxDB();
const title = ref('');
const filter = ref<Filter>('all');

const options = computed<EntityStaticType<typeof Todo, 'findAllOptions'>>(() => ({
  where: {
    combinator: 'and',
    rules:
      filter.value === 'all'
        ? []
        : [{ field: 'completed', operator: '=', value: filter.value === 'completed' }]
  },
  orderBy: [
    { field: 'completed', sort: 'asc' },
    { field: 'createdAt', sort: 'desc' }
  ]
}));

const todos = useFindAll(Todo, options);

const remaining = computed(() => todos.value.filter(todo => !todo.completed).length);
const completedTodos = computed(() => todos.value.filter(todo => todo.completed));
const allCompleted = computed(() => todos.value.length > 0 && todos.value.every(todo => todo.completed));

async function add() {
  const text = title.value.trim();
  if (!text) return;
  await new Todo({ title: text }).save();
  title.value = '';
}

async function toggle(todo: Todo) {
  todo.completed = !todo.completed;
  await todo.save();
}

async function remove(todo: Todo) {
  await todo.remove();
}

async function toggleAll() {
  const done = allCompleted.value;
  const targets = todos.value.filter(todo => todo.completed === done);
  for (const todo of targets) todo.completed = !done;
  await rxdb.entityManager.saveMany(targets);
}

async function clearCompleted() {
  await rxdb.entityManager.removeMany(completedTodos.value);
}
</script>

<template>
  <main class="todo-app">
    <h1>RxDB Todo</h1>
    <form @submit.prevent="add">
      <input v-model="title" placeholder="What needs to be done?" />
    </form>

    <div class="filters">
      <button
        v-for="item in FILTERS"
        :key="item"
        type="button"
        :class="{ active: filter === item }"
        @click="filter = item"
      >
        {{ item }}
      </button>
    </div>

    <ul class="todo-list">
      <li v-for="todo in todos.value" :key="todo.id" :class="{ completed: todo.completed }">
        <input type="checkbox" :checked="todo.completed" @change="toggle(todo)" />
        <span>{{ todo.title }}</span>
        <button type="button" @click="remove(todo)">×</button>
      </li>
    </ul>

    <p v-if="todos.isLoading" class="hint">Loading…</p>

    <footer class="toolbar">
      <span>{{ remaining }} item{{ remaining === 1 ? '' : 's' }} left</span>
      <button type="button" :disabled="todos.value.length === 0" @click="toggleAll">
        {{ allCompleted ? 'Uncheck all' : 'Check all' }}
      </button>
      <button type="button" :disabled="completedTodos.length === 0" @click="clearCompleted">
        Clear completed
      </button>
    </footer>
  </main>
</template>

<style>
* {
  box-sizing: border-box;
}

body {
  margin: 0;
  font-family: system-ui, -apple-system, sans-serif;
  background: #f5f5f5;
  color: #1a1a1a;
}

.todo-app {
  max-width: 480px;
  margin: 48px auto;
  padding: 24px;
  background: #fff;
  border-radius: 8px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

h1 {
  margin: 0 0 16px;
  font-size: 28px;
  font-weight: 600;
}

form input {
  width: 100%;
  padding: 10px 12px;
  font-size: 16px;
  border: 1px solid #ddd;
  border-radius: 6px;
}

.filters {
  display: flex;
  gap: 8px;
  margin: 16px 0;
}

.filters button {
  padding: 4px 12px;
  border: 1px solid #ddd;
  border-radius: 999px;
  background: #fff;
  cursor: pointer;
}

.filters button.active {
  background: #1a1a1a;
  color: #fff;
}

.todo-list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.todo-list li {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 0;
  border-bottom: 1px solid #eee;
}

.todo-list li span {
  flex: 1;
}

.todo-list li.completed span {
  text-decoration: line-through;
  color: #999;
}

.todo-list li button {
  border: none;
  background: none;
  font-size: 18px;
  color: #999;
  cursor: pointer;
}

.hint {
  color: #999;
}

.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: 16px;
  font-size: 14px;
}

.toolbar button {
  padding: 6px 10px;
  border: 1px solid #ddd;
  border-radius: 6px;
  background: #fff;
  cursor: pointer;
}

.toolbar button:disabled {
  opacity: 0.4;
  cursor: default;
}
</style>
