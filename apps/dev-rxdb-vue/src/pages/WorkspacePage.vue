<script lang="ts" setup>
import { type RxDB } from '@aiao/rxdb';
import { Todo, type TodoStaticTypes } from '@aiao/rxdb-test/entities';
import { useCount, useFind, useRxDB } from '@aiao/rxdb-vue';
import { firstValueFrom } from 'rxjs';
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';

/**
 * Todo 主表每页条数。此前页面订阅的是 `findAll`（整表、不带 limit），
 * 记录一多就是「一次性拉全表 + 渲染全部 <tr>」，主线程直接卡住。
 */
const TODO_PAGE_SIZE = 20;

/**
 * 清空主表时每轮取多少条来删。刻意与页大小解耦：
 * 「页面显示多少」和「一次删多少」是两回事，删除不该被前者限制。
 */
const TODO_DELETE_BATCH_SIZE = 200;

type NoticeTone = 'info' | 'success' | 'warning' | 'error';

type Notice = {
  tone: NoticeTone;
  text: string;
};

type WorkspaceEntry = {
  cacheId: string;
  id: string;
  entity: string;
  data: Record<string, unknown>;
};

type WorkspaceApi = {
  ready: Promise<void>;
  flush(): Promise<void>;
  list(): WorkspaceEntry[];
  discard(cacheId: string): boolean;
  changes$: {
    subscribe(next: () => void): {
      unsubscribe(): void;
    };
  };
};

type WorkspaceRxDB = RxDB & {
  workspace: WorkspaceApi;
};

function formatDateTime(value: Date | string | null | undefined): string {
  if (!value) return '-';
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleString('zh-CN');
}

function alertClass(tone: NoticeTone): string {
  switch (tone) {
    case 'success':
      return 'alert alert-success alert-soft';
    case 'warning':
      return 'alert alert-warning alert-soft';
    case 'error':
      return 'alert alert-error alert-soft';
    default:
      return 'alert alert-info alert-soft';
  }
}

function titleOf(entry: WorkspaceEntry): string {
  const title = entry.data['title'];
  return typeof title === 'string' && title.trim().length > 0 ? title : 'Untitled Todo';
}

function completedText(entry: WorkspaceEntry): string {
  return entry.data['completed'] === true ? 'completed' : 'open';
}

function createdAtOf(entry: WorkspaceEntry): Date | string | null {
  const createdAt = entry.data['createdAt'];
  return createdAt instanceof Date || typeof createdAt === 'string' ? createdAt : null;
}

const rxdb = useRxDB() as WorkspaceRxDB;

/** 用户点出来的页码。记录被删后可能越界，对外一律读 todoPage。 */
const requestedTodoPage = ref(0);

/** 主表总数走 count，不再靠「把整表拉下来数数组长度」。 */
const savedTodoCountResource = useCount(Todo, { where: { combinator: 'and', rules: [] } });
const savedTodoTotal = computed(() => savedTodoCountResource.value ?? 0);
const todoPageCount = computed(() => Math.max(1, Math.ceil(savedTodoTotal.value / TODO_PAGE_SIZE)));

/**
 * 越界自愈：清空主表、或删到剩下的页数比当前页少时，总数一变页码自己回落，
 * 不需要再挂一个 watch 去纠正 requestedTodoPage。
 */
const todoPage = computed(() => Math.min(requestedTodoPage.value, todoPageCount.value - 1));

const savedTodosResource = useFind(Todo, (): TodoStaticTypes['findOptions'] => ({
  where: { combinator: 'and', rules: [] },
  orderBy: [
    { field: 'updatedAt', sort: 'desc' },
    { field: 'id', sort: 'desc' }
  ],
  limit: TODO_PAGE_SIZE,
  offset: todoPage.value * TODO_PAGE_SIZE
}));

const savedTodos = computed(() => savedTodosResource.value ?? []);

function previousTodoPage() {
  requestedTodoPage.value = Math.max(0, todoPage.value - 1);
}

function nextTodoPage() {
  requestedTodoPage.value = Math.min(todoPageCount.value - 1, todoPage.value + 1);
}

const workspaceEntries = ref<WorkspaceEntry[]>([]);
const recoveredIds = ref<Set<string>>(new Set());
const activeDraftId = ref<string | null>(null);
const draftTitle = ref('整理需求清单');
const draftCompleted = ref(false);
const busy = ref(false);
const notice = ref<Notice | null>(null);

const activeDraftEntry = computed(() => {
  if (!activeDraftId.value) return null;
  return workspaceEntries.value.find(entry => entry.id === activeDraftId.value) ?? null;
});

const canCreateDraft = computed(() => draftTitle.value.trim().length > 0);

function readWorkspaceEntries(): WorkspaceEntry[] {
  return rxdb.workspace
    .list()
    .filter(entry => entry.entity === 'Todo')
    .sort((left, right) => right.cacheId.localeCompare(left.cacheId));
}

function refreshWorkspace(preferredId = activeDraftId.value) {
  const entries = readWorkspaceEntries();
  workspaceEntries.value = entries;

  const nextId =
    preferredId && entries.some(entry => entry.id === preferredId) ? preferredId : (entries[0]?.id ?? null);
  activeDraftId.value = nextId;
}

async function syncWorkspace(preferredId = activeDraftId.value) {
  await Promise.resolve();
  await rxdb.workspace.flush();
  refreshWorkspace(preferredId);
}

async function restoreWorkspaceEntries() {
  try {
    await rxdb.workspace.ready;
    const restoredEntries = readWorkspaceEntries();
    recoveredIds.value = new Set(restoredEntries.map(entry => entry.id));
    refreshWorkspace(activeDraftId.value ?? restoredEntries[0]?.id ?? null);
  } catch (error) {
    notice.value = {
      text: error instanceof Error ? `读取 workspace 草稿失败: ${error.message}` : '读取 workspace 草稿失败',
      tone: 'error'
    };
  }
}

function resolveDraft(entry: WorkspaceEntry): Todo | null {
  return (
    rxdb.entityManager.getEntityRef(Todo, entry.id as Todo['id']) ??
    rxdb.entityManager.createEntityRef(Todo, entry.data as Partial<Todo> & { id: Todo['id'] }, {
      local: false,
      remote: false,
      modified: true
    })
  );
}

async function createDraft() {
  const title = draftTitle.value.trim();
  if (!title) return;

  busy.value = true;
  try {
    const todo = new Todo({ title, completed: draftCompleted.value });
    activeDraftId.value = todo.id;
    draftTitle.value = '';
    draftCompleted.value = false;
    await syncWorkspace(todo.id);
    notice.value = { text: `已创建未保存草稿：${todo.title}`, tone: 'success' };
  } catch (error) {
    notice.value = {
      text: error instanceof Error ? `创建草稿失败: ${error.message}` : '创建草稿失败',
      tone: 'error'
    };
  } finally {
    busy.value = false;
  }
}

async function saveDraft(entry: WorkspaceEntry) {
  const todo = resolveDraft(entry);
  if (!todo) {
    notice.value = { text: '未找到可恢复的 Todo 草稿', tone: 'error' };
    return;
  }

  busy.value = true;
  try {
    await todo.save();
    await syncWorkspace(activeDraftId.value);
    notice.value = { text: `已保存 Todo：${todo.title}`, tone: 'success' };
  } catch (error) {
    notice.value = {
      text: error instanceof Error ? `保存草稿失败: ${error.message}` : '保存草稿失败',
      tone: 'error'
    };
  } finally {
    busy.value = false;
  }
}

async function discardDraft(entry: WorkspaceEntry) {
  busy.value = true;
  try {
    const discarded = rxdb.workspace.discard(entry.cacheId);
    await syncWorkspace(activeDraftId.value === entry.id ? null : activeDraftId.value);
    notice.value = {
      text: discarded ? `已丢弃草稿：${titleOf(entry)}` : '草稿已经不存在',
      tone: discarded ? 'warning' : 'info'
    };
  } finally {
    busy.value = false;
  }
}

/**
 * 分批取、分批删。页面只订阅一页之后 `savedTodos` 不再是全表，
 * 拿它去 `removeMany` 只会删掉当前这一页 —— 「清空」必须自己去翻整表。
 */
async function deleteAllTodos() {
  let lastBatchHeadId: Todo['id'] | null = null;
  for (;;) {
    const batch = await firstValueFrom(
      Todo.find({ where: { combinator: 'and', rules: [] }, limit: TODO_DELETE_BATCH_SIZE })
    );
    if (batch.length === 0) return;
    // 游标没推进说明这一批根本没删掉，继续循环就是死循环，宁可把失败抛给调用方。
    if (batch[0].id === lastBatchHeadId) throw new Error('批量删除没有推进：仍有 Todo 未被删除');
    lastBatchHeadId = batch[0].id;
    await rxdb.entityManager.removeMany(batch);
  }
}

async function clearSavedTodos() {
  if (savedTodoTotal.value === 0) return;

  busy.value = true;
  try {
    await deleteAllTodos();
    requestedTodoPage.value = 0;
    notice.value = { text: '已清空 Todo 主表', tone: 'warning' };
  } catch (error) {
    notice.value = {
      text: error instanceof Error ? `清空 Todo 主表失败: ${error.message}` : '清空 Todo 主表失败',
      tone: 'error'
    };
  } finally {
    busy.value = false;
  }
}

async function resetDemo() {
  busy.value = true;
  try {
    for (const entry of readWorkspaceEntries()) {
      rxdb.workspace.discard(entry.cacheId);
    }
    await syncWorkspace(null);

    await deleteAllTodos();
    requestedTodoPage.value = 0;

    recoveredIds.value = new Set();
    notice.value = { text: '已重置 workspace 草稿和 Todo 主表', tone: 'warning' };
  } catch (error) {
    notice.value = {
      text: error instanceof Error ? `重置演示数据失败: ${error.message}` : '重置演示数据失败',
      tone: 'error'
    };
  } finally {
    busy.value = false;
  }
}

let workspaceSubscription: { unsubscribe(): void } | null = null;

function reloadPage() {
  window.location.reload();
}

onMounted(() => {
  workspaceSubscription = rxdb.workspace.changes$.subscribe(() => {
    refreshWorkspace(activeDraftId.value);
  });

  refreshWorkspace(null);
  void restoreWorkspaceEntries();
});

onBeforeUnmount(() => {
  workspaceSubscription?.unsubscribe();
});
</script>

<template>
  <div class="page-host flex h-full flex-col overflow-hidden">
    <!-- 顶部 toolbar -->
    <div class="border-base-300 flex shrink-0 flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
      <div class="flex flex-wrap items-center gap-2">
        <h1 class="text-lg font-semibold">Workspace 草稿恢复</h1>
        <span class="badge badge-ghost badge-sm">{{ workspaceEntries.length }} 草稿</span>
        <span class="text-base-content/55 hidden text-xs lg:inline">
          new Todo() 先入 workspace 缓存，刷新后从 IndexedDB 恢复
        </span>
      </div>
      <div class="flex items-center gap-2">
        <button
          class="btn btn-ghost btn-sm"
          :disabled="busy"
          @click="refreshWorkspace()"
          type="button"
        >
          刷新
        </button>
        <button
          class="btn btn-ghost btn-sm"
          :disabled="busy"
          @click="reloadPage"
          type="button"
        >
          刷新页面验证恢复
        </button>
        <button
          class="btn btn-ghost btn-sm text-error"
          :disabled="busy"
          @click="resetDemo"
          type="button"
        >
          重置
        </button>
      </div>
    </div>

    <!-- 主体（可滚动） -->
    <div class="min-h-0 flex-1 overflow-auto p-4">
      <div
        v-if="notice"
        :class="[alertClass(notice.tone), 'mb-4']"
        role="alert"
      >
        <span class="text-sm">{{ notice.text }}</span>
      </div>

      <!-- 紧凑统计行 -->
      <div class="stats stats-vertical bg-base-100 border-base-300 md:stats-horizontal mb-4 w-full border shadow-sm">
        <div class="stat py-3">
          <div class="stat-title text-xs">Workspace 草稿</div>
          <div class="stat-value text-primary text-2xl">{{ workspaceEntries.length }}</div>
          <div class="stat-desc">还没保存到主表的草稿</div>
        </div>
        <div class="stat py-3">
          <div class="stat-title text-xs">Todo 主表</div>
          <div class="stat-value text-2xl">{{ savedTodoTotal }}</div>
          <div class="stat-desc">已写入数据库的全部记录</div>
        </div>
        <div class="stat py-3">
          <div class="stat-title text-xs">当前活动草稿</div>
          <div class="stat-value text-secondary text-2xl">{{ activeDraftEntry ? 1 : 0 }}</div>
          <div class="stat-desc">恢复面板聚焦的草稿</div>
        </div>
      </div>

      <div class="grid gap-4 2xl:grid-cols-[minmax(0,1.15fr)_360px]">
        <div class="flex flex-col gap-4">
          <!-- 创建草稿 -->
          <section class="card border-base-300 bg-base-100 border shadow-sm">
            <div class="card-body gap-3 p-4">
              <div class="flex flex-wrap items-center justify-between gap-2">
                <h2 class="text-base font-semibold">创建未保存草稿</h2>
                <span class="badge badge-outline badge-sm">Workspace only</span>
              </div>
              <p class="text-base-content/65 text-xs">
                只创建草稿对象，不直接写入 Todo 主表。草稿先落 workspace，刷新后还能继续处理。
              </p>

              <div class="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto_auto] md:items-end">
                <label class="floating-label">
                  <input
                    class="input input-sm w-full"
                    v-model="draftTitle"
                    placeholder="例如：整理需求清单"
                    type="text"
                  />
                  <span>草稿标题</span>
                </label>
                <label class="label rounded-box border-base-300 cursor-pointer gap-2 border px-3 py-2">
                  <span class="label-text text-xs">已完成</span>
                  <input
                    class="checkbox checkbox-sm checkbox-primary"
                    v-model="draftCompleted"
                    type="checkbox"
                  />
                </label>
                <button
                  class="btn btn-primary btn-sm"
                  :disabled="!canCreateDraft || busy"
                  @click="createDraft"
                  type="button"
                >
                  创建草稿
                </button>
              </div>
            </div>
          </section>

          <!-- 草稿列表 -->
          <section class="card border-base-300 bg-base-100 border shadow-sm">
            <div class="card-body gap-3 p-4">
              <div class="flex items-center justify-between">
                <h2 class="text-base font-semibold">草稿列表</h2>
                <span class="badge badge-ghost badge-sm">{{ workspaceEntries.length }} drafts</span>
              </div>

              <div
                class="border-base-300 text-base-content/55 rounded-box border border-dashed p-6 text-center text-sm"
                v-if="workspaceEntries.length === 0"
              >
                当前没有未保存草稿。先创建一个，再刷新页面验证恢复链路。
              </div>
              <div
                class="space-y-2"
                v-else
              >
                <article
                  v-for="entry in workspaceEntries"
                  :class="[
                    'rounded-box border-base-300 space-y-2 border p-3 transition-colors',
                    entry.id === activeDraftId ? 'bg-primary/5 border-primary' : 'bg-base-100'
                  ]"
                  :key="entry.cacheId"
                >
                  <div class="flex flex-wrap items-center justify-between gap-2">
                    <div class="flex min-w-0 flex-1 items-center gap-2">
                      <h3 class="truncate text-sm font-medium">{{ titleOf(entry) }}</h3>
                      <span
                        class="badge badge-secondary badge-soft badge-xs"
                        v-if="recoveredIds.has(entry.id)"
                        >已恢复</span
                      >
                    </div>
                    <div class="flex flex-wrap gap-1.5">
                      <button
                        class="btn btn-xs btn-ghost"
                        @click="activeDraftId = entry.id"
                        type="button"
                      >
                        查看
                      </button>
                      <button
                        class="btn btn-xs btn-primary"
                        :disabled="busy"
                        @click="saveDraft(entry)"
                        type="button"
                      >
                        保存
                      </button>
                      <button
                        class="btn btn-xs btn-ghost text-error"
                        :disabled="busy"
                        @click="discardDraft(entry)"
                        type="button"
                      >
                        丢弃
                      </button>
                    </div>
                  </div>
                  <div class="text-base-content/55 grid gap-1 font-mono text-xs sm:grid-cols-3">
                    <span class="truncate">完成: {{ completedText(entry) }}</span>
                    <span class="truncate">{{ formatDateTime(createdAtOf(entry)) }}</span>
                    <span class="truncate">{{ entry.cacheId }}</span>
                  </div>
                </article>
              </div>
            </div>
          </section>

          <!-- Todo 主表 -->
          <section class="card border-base-300 bg-base-100 border shadow-sm">
            <div class="card-body gap-3 p-4">
              <div class="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 class="text-base font-semibold">Todo 主表</h2>
                  <p class="text-base-content/55 text-xs">
                    草稿保存后落到这里，最新在前。只查询当前这一页（每页 {{ TODO_PAGE_SIZE }} 条）
                  </p>
                </div>
                <button
                  class="btn btn-ghost btn-sm"
                  :disabled="busy || savedTodoTotal === 0"
                  @click="clearSavedTodos"
                  type="button"
                >
                  清空主表
                </button>
              </div>

              <div class="rounded-box border-base-300 overflow-x-auto border">
                <table class="table-zebra table-sm table">
                  <thead>
                    <tr>
                      <th>Title</th>
                      <th>Status</th>
                      <th>ID</th>
                      <th>Updated At</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-if="savedTodos.length === 0">
                      <td
                        class="text-base-content/55 text-center text-sm"
                        colspan="4"
                      >
                        主表还没有记录。保存一条草稿看它落库。
                      </td>
                    </tr>
                    <tr
                      v-else
                      v-for="todo in savedTodos"
                      :key="todo.id"
                    >
                      <td class="font-medium">{{ todo.title }}</td>
                      <td>
                        <span class="badge badge-outline badge-sm">{{ todo.completed ? 'completed' : 'open' }}</span>
                      </td>
                      <td class="font-mono text-xs">{{ todo.id.slice(0, 8) }}</td>
                      <td class="text-xs">{{ formatDateTime(todo.updatedAt) }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div class="flex flex-wrap items-center justify-between gap-2">
                <span class="text-base-content/55 text-xs">
                  共 {{ savedTodoTotal }} 条 · 第 {{ todoPage + 1 }} / {{ todoPageCount }} 页
                </span>
                <div class="join">
                  <button
                    class="btn btn-sm join-item"
                    :disabled="todoPage === 0"
                    @click="previousTodoPage"
                    type="button"
                  >
                    上一页
                  </button>
                  <button
                    class="btn btn-sm join-item"
                    :disabled="todoPage >= todoPageCount - 1"
                    @click="nextTodoPage"
                    type="button"
                  >
                    下一页
                  </button>
                </div>
              </div>
            </div>
          </section>
        </div>

        <!-- 侧栏 -->
        <aside class="flex flex-col gap-4">
          <section class="card border-base-300 bg-base-100 border shadow-sm">
            <div class="card-body gap-3 p-4">
              <h2 class="text-base font-semibold">恢复面板</h2>
              <div
                class="space-y-3"
                v-if="activeDraftEntry"
              >
                <div class="flex flex-wrap items-center gap-2">
                  <h3 class="font-semibold">{{ titleOf(activeDraftEntry) }}</h3>
                  <span
                    class="badge badge-secondary badge-soft badge-sm"
                    v-if="recoveredIds.has(activeDraftEntry.id)"
                    >刷新后恢复</span
                  >
                </div>
                <div class="space-y-1.5 text-sm">
                  <div class="flex items-center justify-between gap-3">
                    <span class="text-base-content/55">草稿 ID</span>
                    <span class="font-mono text-xs">{{ activeDraftEntry.id }}</span>
                  </div>
                  <div class="flex items-center justify-between gap-3">
                    <span class="text-base-content/55">完成状态</span>
                    <span>{{ completedText(activeDraftEntry) }}</span>
                  </div>
                  <div class="flex items-center justify-between gap-3">
                    <span class="text-base-content/55">创建时间</span>
                    <span>{{ formatDateTime(createdAtOf(activeDraftEntry)) }}</span>
                  </div>
                </div>
                <div class="flex gap-2">
                  <button
                    class="btn btn-primary btn-sm flex-1"
                    :disabled="busy"
                    @click="saveDraft(activeDraftEntry)"
                    type="button"
                  >
                    保存
                  </button>
                  <button
                    class="btn btn-ghost btn-sm text-error"
                    :disabled="busy"
                    @click="discardDraft(activeDraftEntry)"
                    type="button"
                  >
                    丢弃
                  </button>
                </div>
              </div>
              <div
                class="border-base-300 text-base-content/55 rounded-box border border-dashed p-4 text-sm"
                v-else
              >
                还没有选中的草稿。先创建一个，或从左侧列表点"查看"。
              </div>
            </div>
          </section>
        </aside>
      </div>
    </div>
  </div>
</template>
