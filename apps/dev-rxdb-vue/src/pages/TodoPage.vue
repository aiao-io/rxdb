<script lang="ts" setup>
import { EntityStaticType, type HistoryItem } from '@aiao/rxdb';
import { Todo } from '@aiao/rxdb-test/entities';
import { injectRxDB, useFindAll } from '@aiao/rxdb-vue';
import { useVirtualizer } from '@tanstack/vue-virtual';
import { ArrowDown, ArrowUp, History, Pen, Plus, Redo2, Undo2, X } from '@lucide/vue';
import { Subscription } from 'rxjs';
import { computed, nextTick, onMounted, onUnmounted, ref, type ComponentPublicInstance } from 'vue';
import HistorySidebar from '../app/components/HistorySidebar.vue';
import { pairVirtualRows } from '../app/utils/virtual-rows';

const ITEM_SIZE = 48;

const rxdb = injectRxDB()!;
const mainContainerRef = ref<HTMLDivElement | null>(null);
const fullHeaderRef = ref<HTMLDivElement | null>(null);
const editInputRefs = new Map<string, HTMLInputElement>();

const inputValue = ref('');
const currentTab = ref<'all' | 'active' | 'completed'>('all');
const completedSort = ref<'asc' | 'desc'>('asc');
const editingTodoIds = ref<Set<string>>(new Set());
const editValues = ref<Map<string, string>>(new Map());
const showHistory = ref(true);
const showStickyHeader = ref(false);
const addingCount = ref<number | null>(null);

// History - 手动订阅 Observable
const history = rxdb.versionManager.history(Todo);
const undoCount = ref(0);
const redoCount = ref(0);
const histories = ref<HistoryItem[]>([]);

let subscriptions: Subscription[] = [];

// 查询条件
const todoQueryOptions = computed<EntityStaticType<typeof Todo, 'findAllOptions'>>(() => {
  const options: EntityStaticType<typeof Todo, 'findAllOptions'> = {
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
    ]
  };

  if (currentTab.value === 'active') {
    options.where.rules.push({
      field: 'completed',
      operator: '=',
      value: false
    });
  } else if (currentTab.value === 'completed') {
    options.where.rules.push({
      field: 'completed',
      operator: '=',
      value: true
    });
  }

  return options;
});

const todoResource = useFindAll(Todo, todoQueryOptions);
const todos = computed(() => todoResource.value ?? []);

// 虚拟滚动
const rowVirtualizerOptions = computed(() => ({
  count: todos.value.length,
  getScrollElement: () => mainContainerRef.value,
  estimateSize: () => ITEM_SIZE,
  overscan: 10
}));

const virtualizer = useVirtualizer(rowVirtualizerOptions);
const virtualRows = computed(() => pairVirtualRows(todos.value, virtualizer.value.getVirtualItems()));

// 计算派生状态
const activeTodoCount = computed(() => todos.value.filter(todo => !todo.completed).length);
const completedTodos = computed(() => todos.value.filter(todo => todo.completed));
const isAllCompleted = computed(() => todos.value.length > 0 && todos.value.every(todo => todo.completed));
const disabledToggleAllBtn = computed(() => todos.value.length === 0);
const disabledClearCompletedBtn = computed(() => completedTodos.value.length === 0);

// Sticky header 检测
const checkVisibility = () => {
  const mainElement = mainContainerRef.value;
  const headerElement = fullHeaderRef.value;

  if (!mainElement || !headerElement) return;

  const scrollTop = mainElement.scrollTop;
  const headerOffsetTop = headerElement.offsetTop;
  const headerHeight = headerElement.offsetHeight;
  const shouldShow = scrollTop > headerOffsetTop + headerHeight;
  showStickyHeader.value = shouldShow;
};

onMounted(() => {
  subscriptions = [
    history.undoCount$.subscribe(value => (undoCount.value = value)),
    history.redoCount$.subscribe(value => (redoCount.value = value)),
    history.histories$.subscribe(value => (histories.value = value))
  ];

  const mainElement = mainContainerRef.value;
  if (mainElement) {
    mainElement.addEventListener('scroll', checkVisibility);
    checkVisibility();
  }
});

onUnmounted(() => {
  subscriptions.forEach(sub => sub.unsubscribe());

  const mainElement = mainContainerRef.value;
  if (mainElement) {
    mainElement.removeEventListener('scroll', checkVisibility);
  }
});

const addTodo = async (event?: Event) => {
  event?.preventDefault();
  const value = inputValue.value.trim();
  if (!value) return;

  const todo = new Todo({ title: value });
  await todo.save();
  inputValue.value = '';
};

const toggleTodoCompletion = async (event: Event, todo: Todo) => {
  const isEditing = editingTodoIds.value.has(todo.id);
  if (isEditing) return;

  event.preventDefault();
  const target = event.target as HTMLInputElement;
  todo.completed = target.checked;
  await todo.save();
};

const startEditing = (event: Event, todo: Todo) => {
  event.preventDefault();
  event.stopPropagation();
  editingTodoIds.value = new Set(editingTodoIds.value).add(todo.id);
  editValues.value = new Map(editValues.value).set(todo.id, todo.title);

  nextTick(() => {
    const input = editInputRefs.get(todo.id);
    input?.focus();
    input?.select();
  });
};

const saveTodo = async (event: Event, input: HTMLInputElement, todo: Todo) => {
  event.preventDefault();
  event.stopPropagation();

  if (!editingTodoIds.value.has(todo.id)) return;

  const editValue = editValues.value.get(todo.id);
  if (editValue !== undefined) {
    todo.title = editValue;
  }

  const newSet = new Set(editingTodoIds.value);
  newSet.delete(todo.id);
  editingTodoIds.value = newSet;

  const newMap = new Map(editValues.value);
  newMap.delete(todo.id);
  editValues.value = newMap;

  await todo.save();
  input.blur();
};

const cancelEditing = (todo: Todo) => {
  if (!editingTodoIds.value.has(todo.id)) return;

  const newSet = new Set(editingTodoIds.value);
  newSet.delete(todo.id);
  editingTodoIds.value = newSet;

  const newMap = new Map(editValues.value);
  newMap.delete(todo.id);
  editValues.value = newMap;
};

const removeTodo = async (event: Event, todo: Todo) => {
  event.preventDefault();
  event.stopPropagation();
  await todo.remove();
};

const toggleAllTodos = async () => {
  const newCompletedState = !isAllCompleted.value;
  const todosToUpdate = todos.value.filter(d => d.completed === isAllCompleted.value);

  todosToUpdate.forEach(todo => {
    todo.completed = newCompletedState;
  });

  await rxdb.entityManager.saveMany(todosToUpdate);
};
const clearCompleted = async () => {
  await rxdb.entityManager.removeMany(completedTodos.value);
};

const toggleCompletedSort = () => {
  completedSort.value = completedSort.value === 'asc' ? 'desc' : 'asc';
};

const toggleHistory = () => {
  showHistory.value = !showHistory.value;
};

const stickyTabClick = (tab: 'all' | 'active' | 'completed') => {
  const element = mainContainerRef.value;
  if (!element) return;

  let scrollTimeout: number;
  const onScrollEnd = () => {
    clearTimeout(scrollTimeout);
    scrollTimeout = window.setTimeout(() => {
      currentTab.value = tab;
      element.removeEventListener('scroll', onScrollEnd);
    }, 50);
  };

  element.addEventListener('scroll', onScrollEnd);
  element.scrollTo({ top: 0, behavior: 'smooth' });

  setTimeout(() => {
    element.removeEventListener('scroll', onScrollEnd);
    clearTimeout(scrollTimeout);
  }, 5000);
};

const addManyTodo = async (total: number) => {
  addingCount.value = total;
  const newTodos: Todo[] = [];
  for (let i = 0; i < total; i++) {
    const todo = new Todo();
    todo.title = `test-${i}`;
    newTodos.push(todo);
  }
  await rxdb.entityManager.saveMany(newTodos);
  addingCount.value = null;
};

const undo = () => {
  void history.undo();
};

const redo = () => {
  void history.redo();
};

const setEditInputRef = (id: string, el: Element | ComponentPublicInstance | null) => {
  if (el instanceof HTMLInputElement) editInputRefs.set(id, el);
};
</script>

<template>
  <div class="flex h-full">
    <!-- History Sidebar -->
    <HistorySidebar
      :histories="histories"
      :scope-type="history.type"
      :show="showHistory"
      @close="toggleHistory"
      border-side="left"
    />

    <main
      class="h-full min-w-0 flex-1 overflow-auto"
      data-testid="todo-page"
      ref="mainContainerRef"
    >
      <!-- Sticky Header (简化版) -->
      <div
        class="border-base-300 bg-base-100 sticky top-0 z-10 border-b px-4 py-2 shadow-sm"
        v-if="showStickyHeader"
      >
        <div class="mx-auto flex max-w-4xl items-center justify-between">
          <div class="flex items-center gap-3">
            <h2 class="text-lg font-semibold">Todos</h2>
            <div class="badge badge-primary badge-sm">{{ activeTodoCount }} 待办</div>
          </div>
          <div
            class="tabs tabs-boxed tabs-xs"
            role="tablist"
          >
            <button
              :class="['tab', { 'tab-active': currentTab === 'all' }]"
              @click="stickyTabClick('all')"
              type="button"
            >
              全部
            </button>
            <button
              :class="['tab', { 'tab-active': currentTab === 'active' }]"
              @click="stickyTabClick('active')"
              type="button"
            >
              进行中
            </button>
            <button
              :class="['tab', { 'tab-active': currentTab === 'completed' }]"
              @click="stickyTabClick('completed')"
              type="button"
            >
              已完成
            </button>
          </div>
        </div>
      </div>

      <!-- Full Header -->
      <div
        class="border-base-300 flex-none border-b p-4"
        ref="fullHeaderRef"
      >
        <div class="mx-auto flex max-w-4xl flex-col gap-3">
          <!-- Title Bar -->
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-3">
              <h1 class="text-2xl font-bold">Todos</h1>
              <div
                class="badge badge-primary"
                data-testid="todo-count"
                >{{ activeTodoCount }} 待办</div
              >

              <!-- Batch Add Dropdown -->
              <div class="dropdown dropdown-end">
                <button
                  class="btn btn-circle btn-sm"
                  aria-label="批量添加"
                  data-testid="todo-batch-add"
                  tabindex="0"
                >
                  <Plus :size="16" />
                </button>
                <ul class="menu dropdown-content rounded-box bg-base-200 z-[1] w-40 p-2 shadow">
                  <li>
                    <button
                      :disabled="addingCount === 1"
                      @click="addManyTodo(1)"
                      data-testid="todo-batch-option-1"
                    >
                      <span
                        class="loading loading-spinner loading-xs"
                        v-if="addingCount === 1"
                      />
                      添加 1 条
                    </button>
                  </li>
                  <li>
                    <button
                      :disabled="addingCount === 10"
                      @click="addManyTodo(10)"
                      data-testid="todo-batch-option-10"
                    >
                      <span
                        class="loading loading-spinner loading-xs"
                        v-if="addingCount === 10"
                      />
                      添加 10 条
                    </button>
                  </li>
                  <li>
                    <button
                      :disabled="addingCount === 100"
                      @click="addManyTodo(100)"
                      data-testid="todo-batch-option-100"
                    >
                      <span
                        class="loading loading-spinner loading-xs"
                        v-if="addingCount === 100"
                      />
                      添加 100 条
                    </button>
                  </li>
                  <li>
                    <button
                      :disabled="addingCount === 1000"
                      @click="addManyTodo(1000)"
                      data-testid="todo-batch-option-1000"
                    >
                      <span
                        class="loading loading-spinner loading-xs"
                        v-if="addingCount === 1000"
                      />
                      添加 1000 条
                    </button>
                  </li>
                  <li>
                    <button
                      :disabled="addingCount === 10000"
                      @click="addManyTodo(10000)"
                      data-testid="todo-batch-option-10000"
                    >
                      <span
                        class="loading loading-spinner loading-xs"
                        v-if="addingCount === 10000"
                      />
                      添加 10000 条
                    </button>
                  </li>
                </ul>
              </div>
            </div>

            <div class="flex items-center gap-2">
              <!-- Undo/Redo -->
              <div class="join">
                <button
                  class="btn btn-sm join-item"
                  :disabled="undoCount === 0"
                  @click="undo"
                  aria-label="Undo"
                  data-testid="todo-undo"
                >
                  <Undo2 :size="16" />
                  <span
                    class="badge badge-xs"
                    v-if="undoCount > 0"
                  >
                    {{ undoCount }}
                  </span>
                </button>
                <button
                  class="btn btn-sm join-item"
                  :disabled="redoCount === 0"
                  @click="redo"
                  aria-label="Redo"
                  data-testid="todo-redo"
                >
                  <Redo2 :size="16" />
                  <span
                    class="badge badge-xs"
                    v-if="redoCount > 0"
                  >
                    {{ redoCount }}
                  </span>
                </button>
              </div>

              <!-- History Toggle -->
              <button
                :class="['btn btn-sm', { 'btn-primary': showHistory }]"
                @click="toggleHistory"
                aria-label="历史记录"
                data-testid="todo-history"
              >
                <History :size="16" />
              </button>
            </div>
          </div>

          <!-- Tabs and Action Buttons -->
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div
              class="tabs tabs-boxed tabs-sm"
              role="tablist"
            >
              <button
                :class="['tab', { 'tab-active': currentTab === 'all' }]"
                @click="currentTab = 'all'"
                data-testid="todo-tab-all"
                role="tab"
              >
                全部
              </button>
              <button
                :class="['tab', { 'tab-active': currentTab === 'active' }]"
                @click="currentTab = 'active'"
                data-testid="todo-tab-active"
                role="tab"
              >
                进行中
              </button>
              <button
                :class="['tab', { 'tab-active': currentTab === 'completed' }]"
                @click="currentTab = 'completed'"
                data-testid="todo-tab-completed"
                role="tab"
              >
                已完成
              </button>
            </div>

            <div class="flex flex-wrap items-center gap-2">
              <button
                class="btn btn-sm"
                :disabled="disabledToggleAllBtn"
                @click="toggleAllTodos"
                aria-label="全选/取消全选"
                data-testid="todo-toggle-all"
              >
                全选
              </button>
              <button
                class="btn btn-sm"
                :disabled="disabledClearCompletedBtn"
                @click="clearCompleted"
                aria-label="清除已完成"
                data-testid="todo-clear-completed"
              >
                清除已完成
              </button>
              <button
                class="btn btn-sm"
                @click="toggleCompletedSort"
                aria-label="排序"
                data-testid="todo-sort"
              >
                <ArrowUp
                  v-if="completedSort === 'asc'"
                  :size="16"
                />
                <ArrowDown
                  v-else
                  :size="16"
                />
                排序
              </button>
            </div>
          </div>

          <!-- Add Todo Input -->
          <div class="flex w-full gap-2">
            <input
              class="input input-bordered input-sm flex-1"
              v-model="inputValue"
              @keyup.enter="addTodo"
              aria-label="添加新任务"
              data-testid="todo-title-input"
              placeholder="添加新任务..."
              type="text"
            />
            <button
              class="btn btn-primary btn-sm"
              :disabled="!inputValue"
              @click="addTodo"
              aria-label="添加"
              data-testid="todo-add"
            >
              <Plus :size="16" />
              添加
            </button>
          </div>
        </div>
      </div>

      <!-- Todo List -->
      <div class="mx-auto min-h-60 max-w-4xl">
        <div
          class="hero min-h-60"
          v-if="todoResource.isLoading"
        >
          <div class="hero-content text-center">
            <span class="loading loading-spinner loading-md" />
          </div>
        </div>
        <div
          class="hero min-h-60"
          v-else-if="todoResource.isEmpty"
        >
          <div class="hero-content text-center">
            <div>
              <p class="text-base-content/60">暂无任务</p>
              <p class="text-base-content/40 text-sm">添加一个新任务开始吧</p>
            </div>
          </div>
        </div>
        <div
          v-else
          :style="{ height: `${virtualizer.getTotalSize()}px`, position: 'relative' }"
        >
          <ul class="divide-base-200 divide-y">
            <!-- P1-1（React 同源缺陷的 Vue 端）：key 必须是**身份**。
                 原先是 `getEntityStatus(todo).fingerprint`（= `id@updatedAt`），
                 每次写入都换 key，Vue 会销毁重建整行，行内编辑的 input 连焦点一起没。
                 同一应用的 TodoCursorPage 用的就是 `.id`。 -->
            <li
              class="group border-base-200 hover:bg-base-200/50 flex items-center border-b px-4 py-2 transition-colors"
              v-for="{ item: todo, virtualItem } in virtualRows"
              :key="todo.id"
              :style="{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: `${ITEM_SIZE}px`,
                transform: `translateY(${virtualItem.start}px)`
              }"
              data-testid="todo-row"
            >
              <div class="flex w-full flex-1 items-center gap-3">
                <template v-if="editingTodoIds.has(todo.id)">
                  <input
                    class="todo-input input input-bordered input-sm flex-1"
                    :ref="el => setEditInputRef(todo.id, el)"
                    :value="editValues.get(todo.id) ?? todo.title"
                    @blur="cancelEditing(todo)"
                    @input="e => editValues.set(todo.id, (e.target as HTMLInputElement).value)"
                    @keyup.enter="
                      e => {
                        const input = editInputRefs.get(todo.id);
                        if (input) saveTodo(e, input, todo);
                      }
                    "
                    @keyup.escape="cancelEditing(todo)"
                    data-testid="todo-edit-input"
                    placeholder="任务名称..."
                    type="text"
                  />
                  <button
                    class="btn btn-sm"
                    @click="
                      e => {
                        const input = editInputRefs.get(todo.id);
                        if (input) saveTodo(e, input, todo);
                      }
                    "
                    @mousedown.prevent
                    aria-label="保存"
                    data-testid="todo-save"
                  >
                    保存
                  </button>
                </template>
                <template v-else>
                  <input
                    class="checkbox"
                    :checked="todo.completed"
                    @change="e => toggleTodoCompletion(e, todo)"
                    data-testid="todo-completed"
                    type="checkbox"
                  />
                  <div
                    :class="[
                      'flex-1 cursor-pointer truncate select-none',
                      {
                        'line-through': todo.completed,
                        'opacity-50': todo.completed
                      }
                    ]"
                    @dblclick="e => startEditing(e, todo)"
                    data-testid="todo-title"
                  >
                    {{ todo.title }}
                  </div>
                  <div class="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                    <button
                      class="btn btn-ghost btn-xs"
                      @click="e => startEditing(e, todo)"
                      aria-label="编辑"
                      data-testid="todo-edit"
                    >
                      <Pen :size="14" />
                    </button>
                    <button
                      class="btn btn-ghost btn-xs text-error"
                      @click="e => removeTodo(e, todo)"
                      aria-label="删除"
                      data-testid="todo-delete"
                    >
                      <X :size="14" />
                    </button>
                  </div>
                </template>
              </div>
            </li>
          </ul>
        </div>
      </div>
    </main>
  </div>
</template>
