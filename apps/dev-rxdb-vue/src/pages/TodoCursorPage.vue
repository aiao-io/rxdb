<script lang="ts" setup>
import { Todo, type TodoStaticTypes } from '@aiao/rxdb-test/entities';
import { injectRxDB, useInfiniteScroll } from '@aiao/rxdb-vue';
import { useVirtualizer, type Virtualizer } from '@tanstack/vue-virtual';
import { ArrowDown, ArrowUp, Pen, Plus, X } from '@lucide/vue';
import { computed, ref } from 'vue';
import { pairVirtualRows } from '../app/utils/virtual-rows';

const ITEM_SIZE = 32;

const rxdb = injectRxDB();
const title = ref('');
const currentTab = ref<'all' | 'active' | 'completed'>('all');
const completedSort = ref<'asc' | 'desc'>('asc');
const editingMap = ref<Map<string, boolean>>(new Map());
const loadingActions = ref<Set<string>>(new Set());
const parentRef = ref<HTMLDivElement | null>(null);
const headerRef = ref<HTMLDivElement | null>(null);

// Query options
const queryOptions = computed<TodoStaticTypes['findByCursorOptions']>(() => {
  const options: TodoStaticTypes['findByCursorOptions'] = {
    where: {
      combinator: 'and',
      rules: []
    },
    orderBy: [
      {
        field: 'completed',
        sort: completedSort.value
      },
      {
        field: 'id',
        sort: 'desc'
      }
    ],
    limit: 50
  };

  if (currentTab.value === 'active') {
    options.where!.rules.push({
      field: 'completed',
      operator: '=',
      value: false
    });
  } else if (currentTab.value === 'completed') {
    options.where!.rules.push({
      field: 'completed',
      operator: '=',
      value: true
    });
  }

  return options;
});

// Infinite scroll resource
const resource = useInfiniteScroll(Todo, queryOptions);
const todos = resource.value;

// Virtual scroll setup
const virtualizerOptions = computed(() => ({
  count: todos.value.length,
  getScrollElement: () => parentRef.value,
  estimateSize: () => ITEM_SIZE,
  overscan: 10,
  observeElementOffset: (
    instance: Virtualizer<HTMLDivElement, Element>,
    cb: (offset: number, isScrolling: boolean) => void
  ) => {
    const element = instance.scrollElement;
    if (!element) return undefined;

    const onScroll = () => {
      const headerHeight = headerRef.value?.offsetHeight || 0;
      const offset = Math.max(0, element.scrollTop - headerHeight);
      cb(offset, false);
    };

    element.addEventListener('scroll', onScroll, { passive: true });
    // Initial check
    onScroll();

    return () => {
      element.removeEventListener('scroll', onScroll);
    };
  }
}));

const virtualizer = useVirtualizer(virtualizerOptions);
const virtualRows = computed(() => pairVirtualRows(todos.value, virtualizer.value.getVirtualItems()));

// Handle scroll to load more
const handleScroll = () => {
  if (!parentRef.value) return;

  const { scrollTop, scrollHeight, clientHeight } = parentRef.value;
  const distanceFromBottom = scrollHeight - scrollTop - clientHeight;

  if (distanceFromBottom < 600 && !resource.isLoading.value) {
    resource.loadMore();
  }
};

// Add todo
const handleAddTodo = async (e: Event) => {
  e.preventDefault();
  if (!title.value.trim()) return;

  const todo = new Todo({ title: title.value });
  await todo.save();
  title.value = '';
  resource.refresh();
};

// Toggle completed
const handleToggleCompleted = async (todo: Todo, checked: boolean) => {
  const isEditing = editingMap.value.get(todo.id);
  if (isEditing) return;

  todo.completed = checked;
  await todo.save();
  // 游标分页的 resource 不会因为一次写入自动重新分页。
  // 同文件的 handleAddTodo / handleAddMany 写完都调了 refresh，
  // 而勾选 / 编辑保存 / 删除三条路径**漏了** —— 于是写入落库了，
  // 但当前页的数据快照仍是旧的：切换排序时会按旧快照排，行序不动。
  // （React 端 todo-cursor.tsx 有同源缺陷，已一并修复。）
  resource.refresh();
};

// Edit mode
const handleStartEdit = (todo: Todo) => {
  editingMap.value = new Map(editingMap.value).set(todo.id, true);
  setTimeout(() => {
    const input = document.querySelector(`input[data-todo-id="${todo.id}"]`) as HTMLInputElement;
    input?.focus();
  }, 0);
};

const handleSaveEdit = async (todo: Todo) => {
  const isEditing = editingMap.value.get(todo.id);
  if (!isEditing) return;

  const next = new Map(editingMap.value);
  next.delete(todo.id);
  editingMap.value = next;

  await todo.save();
  resource.refresh();
};

const handleCancelEdit = (todo: Todo) => {
  const next = new Map(editingMap.value);
  next.delete(todo.id);
  editingMap.value = next;
  todo.reset();
};

// Remove todo
const handleRemove = async (todo: Todo) => {
  await todo.remove();
  resource.refresh();
};

// Add many todos
const handleAddMany = async (count: number, actionKey: string) => {
  if (!rxdb) return;
  loadingActions.value = new Set(loadingActions.value).add(actionKey);
  try {
    const todos: Todo[] = [];
    const timestamp = Date.now();
    for (let i = 0; i < count; i++) {
      const todo = new Todo();
      todo.title = `test-${timestamp}-${i}`;
      todos.push(todo);
    }
    await rxdb.entityManager.saveMany(todos);
    resource.refresh();
  } finally {
    const next = new Set(loadingActions.value);
    next.delete(actionKey);
    loadingActions.value = next;
  }
};

const activeTodoCount = computed(() => todos.value.filter(t => !t.completed).length);
</script>

<template>
  <div
    class="flex h-full w-full flex-1 flex-col overflow-auto"
    :data-loaded-count="todos.length"
    @scroll="handleScroll"
    data-page-size="50"
    data-testid="todo-cursor-viewport"
    ref="parentRef"
  >
    <!-- Header -->
    <div
      class="mx-auto flex w-full max-w-sm flex-col gap-2 pt-4"
      ref="headerRef"
    >
      <div class="flex items-center justify-between">
        <h1 class="text-2xl font-bold">
          Todo (Cursor)
          <div
            class="badge badge-outline badge-primary badge-sm ml-2"
            data-testid="todo-cursor-count"
            >{{ activeTodoCount }} left</div
          >
        </h1>
      </div>

      <!-- Tabs -->
      <div
        class="tabs tabs-boxed tabs-sm"
        role="tablist"
      >
        <button
          :class="['tab', { 'tab-active': currentTab === 'all' }]"
          @click="currentTab = 'all'"
          data-testid="todo-cursor-tab-all"
          role="tab"
        >
          All
        </button>
        <button
          :class="['tab', { 'tab-active': currentTab === 'active' }]"
          @click="currentTab = 'active'"
          data-testid="todo-cursor-tab-active"
          role="tab"
        >
          Active
        </button>
        <button
          :class="['tab', { 'tab-active': currentTab === 'completed' }]"
          @click="currentTab = 'completed'"
          data-testid="todo-cursor-tab-completed"
          role="tab"
        >
          Completed
        </button>
      </div>

      <!-- Feature buttons -->
      <div class="flex flex-wrap gap-2">
        <button
          class="btn btn-sm"
          @click="completedSort = completedSort === 'asc' ? 'desc' : 'asc'"
          data-testid="todo-cursor-sort"
        >
          <ArrowUp
            v-if="completedSort === 'asc'"
            :size="16"
          />
          <ArrowDown
            v-else
            :size="16"
          />
          Completed
        </button>
        <template
          v-for="{ count, label } in [
            { count: 1, label: 'add 1' },
            { count: 10, label: 'add 10' },
            { count: 100, label: 'add 100' },
            { count: 1000, label: 'add 1000' },
            { count: 10000, label: 'add 10000' }
          ]"
          :key="`add-${count}`"
        >
          <button
            class="btn btn-sm"
            :data-testid="`todo-cursor-add-${count}`"
            :disabled="loadingActions.has(`add-${count}`)"
            @click="handleAddMany(count, `add-${count}`)"
          >
            <span
              class="loading loading-spinner loading-xs"
              v-if="loadingActions.has(`add-${count}`)"
            />
            {{ label }}
          </button>
        </template>
      </div>

      <!-- Add todo -->
      <form
        class="flex w-full gap-2"
        @submit="handleAddTodo"
      >
        <input
          class="input input-sm flex-1"
          v-model="title"
          data-testid="todo-cursor-title-input"
          placeholder="What needs to be done?"
          type="text"
        />
        <button
          class="btn btn-neutral btn-sm"
          :disabled="!title.trim()"
          data-testid="todo-cursor-add"
          type="submit"
        >
          <Plus :size="16" />
        </button>
      </form>
    </div>

    <!-- Todo List with Virtual Scroll -->
    <div class="mx-auto min-h-40 w-full max-w-sm flex-1">
      <div
        class="hero min-h-40"
        v-if="resource.isEmpty.value && !resource.isLoading.value"
      >
        <div class="hero-content text-center">
          <h1 class="text-sm font-bold">What needs to be done?</h1>
        </div>
      </div>

      <div
        class="flex min-h-40 items-center justify-center"
        v-else-if="resource.isLoading.value && todos.length === 0"
      >
        <span class="loading loading-spinner loading-xs" />
        <span class="ml-2 text-xs">loading...</span>
      </div>

      <ul
        class="mb-4 divide-y divide-gray-200"
        v-else
        :style="{
          height: `${virtualizer.getTotalSize()}px`,
          position: 'relative'
        }"
      >
        <li
          class="absolute top-0 left-0 flex w-full items-center px-1 py-2"
          v-for="{ item: todo, virtualItem: virtualRow } in virtualRows"
          :key="todo.id"
          :style="{
            height: `${virtualRow.size}px`,
            transform: `translateY(${virtualRow.start}px)`
          }"
          data-testid="todo-cursor-row"
        >
          <template v-if="editingMap.get(todo.id)">
            <input
              class="input input-sm m-2 h-8 w-full"
              v-model="todo.title"
              :data-todo-id="todo.id"
              @blur="handleCancelEdit(todo)"
              @keydown.enter="handleSaveEdit(todo)"
              @keydown.escape="handleCancelEdit(todo)"
              data-testid="todo-cursor-edit-input"
              placeholder="What needs to be done?"
              type="text"
            />
          </template>
          <template v-else>
            <input
              class="checkbox checkbox-sm"
              :checked="todo.completed"
              @change="handleToggleCompleted(todo, ($event.target as HTMLInputElement).checked)"
              data-testid="todo-cursor-completed"
              type="checkbox"
            />
            <div
              :class="['flex-1 cursor-pointer truncate px-1', { 'line-through opacity-50': todo.completed }]"
              @dblclick="handleStartEdit(todo)"
              data-testid="todo-cursor-title"
            >
              {{ todo.title }}
            </div>
            <button
              class="btn btn-ghost btn-xs text-primary px-0"
              @click="handleStartEdit(todo)"
              aria-label="Edit"
              data-testid="todo-cursor-edit"
            >
              <Pen :size="16" />
            </button>
            <button
              class="btn btn-ghost btn-xs text-error px-0"
              @click="handleRemove(todo)"
              aria-label="Remove"
              data-testid="todo-cursor-delete"
            >
              <X :size="16" />
            </button>
          </template>
        </li>
      </ul>

      <div
        class="flex justify-center py-4"
        v-if="resource.isLoading.value && todos.length > 0"
      >
        <span class="loading loading-spinner loading-xs" />
      </div>
    </div>

    <!-- Footer -->
    <div class="mx-auto flex h-32 w-full max-w-sm flex-col">
      <div class="divider">footer</div>
    </div>
  </div>
</template>
