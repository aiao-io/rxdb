<script lang="ts" setup>
import { type RxDB } from '@aiao/rxdb';
import { useI18n } from '@aiao/rxdb-i18n-vue';
import { Todo, type TodoStaticTypes } from '@aiao/rxdb-test/entities';
import { useCount, useFind, useRxDB } from '@aiao/rxdb-vue';
import { firstValueFrom } from 'rxjs';
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import {
  formatWorkspaceDate,
  workspaceError,
  workspaceNoticeText,
  type WorkspaceNotice
} from '@modules/demo-i18n/workspace';

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

const { locale, t, formatNumber } = useI18n();

function titleOf(entry: WorkspaceEntry): string {
  const title = entry.data['title'];
  return typeof title === 'string' && title.trim().length > 0 ? title : t('page.workspace.untitled');
}

function completedText(entry: WorkspaceEntry): string {
  return entry.data['completed'] === true ? t('page.workspace.statusCompleted') : t('page.workspace.statusOpen');
}

function alertClass(tone: WorkspaceNotice['tone']): string {
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
const draftTitleInput = ref<string | null>(null);
const draftTitle = computed({
  get: () => draftTitleInput.value ?? t('page.workspace.defaultTitle'),
  set: value => {
    draftTitleInput.value = value;
  }
});
const draftCompleted = ref(false);
const busy = ref(false);
const notice = ref<WorkspaceNotice | null>(null);

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
    notice.value = workspaceError('page.workspace.errorLoad', error);
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
    notice.value = { key: 'page.workspace.noticeCreated', params: { title: todo.title }, tone: 'success' };
  } catch (error) {
    notice.value = workspaceError('page.workspace.errorCreate', error);
  } finally {
    busy.value = false;
  }
}

async function saveDraft(entry: WorkspaceEntry) {
  const todo = resolveDraft(entry);
  if (!todo) {
    notice.value = { key: 'page.workspace.errorNoDraft', tone: 'error' };
    return;
  }

  busy.value = true;
  try {
    await todo.save();
    await syncWorkspace(activeDraftId.value);
    notice.value = { key: 'page.workspace.noticeSaved', params: { title: todo.title }, tone: 'success' };
  } catch (error) {
    notice.value = workspaceError('page.workspace.errorSave', error);
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
      key: discarded ? 'page.workspace.noticeDiscarded' : 'page.workspace.errorMissingDraft',
      params: { title: titleOf(entry) },
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
    if (batch[0].id === lastBatchHeadId) throw new Error(t('page.workspace.deleteStalled'));
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
    notice.value = { key: 'page.workspace.noticeCleared', tone: 'warning' };
  } catch (error) {
    notice.value = workspaceError('page.workspace.errorClear', error);
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
    notice.value = { key: 'page.workspace.noticeReset', tone: 'warning' };
  } catch (error) {
    notice.value = workspaceError('page.workspace.errorReset', error);
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
        <h1 class="text-lg font-semibold">{{ t('page.workspace.title') }}</h1>
        <span class="badge badge-ghost badge-sm">{{
          t('page.workspace.drafts', { count: workspaceEntries.length })
        }}</span>
        <span class="text-base-content/55 hidden text-xs lg:inline">
          {{ t('page.workspace.cacheHint') }}
        </span>
      </div>
      <div class="flex items-center gap-2">
        <button
          class="btn btn-ghost btn-sm"
          :disabled="busy"
          @click="refreshWorkspace()"
          type="button"
        >
          {{ t('common.refresh') }}
        </button>
        <button
          class="btn btn-ghost btn-sm"
          :disabled="busy"
          @click="reloadPage"
          type="button"
        >
          {{ t('page.workspace.reloadVerify') }}
        </button>
        <button
          class="btn btn-ghost btn-sm text-error"
          :disabled="busy"
          @click="resetDemo"
          type="button"
        >
          {{ t('common.reset') }}
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
        <span class="text-sm">{{ workspaceNoticeText(notice, t) }}</span>
      </div>

      <!-- 紧凑统计行 -->
      <div class="stats stats-vertical bg-base-100 border-base-300 md:stats-horizontal mb-4 w-full border shadow-sm">
        <div class="stat py-3">
          <div class="stat-title text-xs">{{ t('page.workspace.draftStat') }}</div>
          <div class="stat-value text-primary text-2xl">{{ formatNumber(workspaceEntries.length) }}</div>
          <div class="stat-desc">{{ t('page.workspace.draftStatDescription') }}</div>
        </div>
        <div class="stat py-3">
          <div class="stat-title text-xs">{{ t('page.workspace.todoStat') }}</div>
          <div class="stat-value text-2xl">{{ formatNumber(savedTodoTotal) }}</div>
          <div class="stat-desc">{{ t('page.workspace.todoStatDescription') }}</div>
        </div>
        <div class="stat py-3">
          <div class="stat-title text-xs">{{ t('page.workspace.activeDraftStat') }}</div>
          <div class="stat-value text-secondary text-2xl">{{ formatNumber(activeDraftEntry ? 1 : 0) }}</div>
          <div class="stat-desc">{{ t('page.workspace.activeDraftStatDescription') }}</div>
        </div>
      </div>

      <div class="grid gap-4 2xl:grid-cols-[minmax(0,1.15fr)_360px]">
        <div class="flex flex-col gap-4">
          <!-- 创建草稿 -->
          <section class="card border-base-300 bg-base-100 border shadow-sm">
            <div class="card-body gap-3 p-4">
              <div class="flex flex-wrap items-center justify-between gap-2">
                <h2 class="text-base font-semibold">{{ t('page.workspace.createDraft') }}</h2>
                <span class="badge badge-outline badge-sm">{{ t('page.workspace.workspaceOnly') }}</span>
              </div>
              <p class="text-base-content/65 text-xs">
                {{ t('page.workspace.createDescription') }}
              </p>

              <div class="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto_auto] md:items-end">
                <label class="floating-label">
                  <input
                    class="input input-sm w-full"
                    v-model="draftTitle"
                    :placeholder="t('page.workspace.titlePlaceholder')"
                    type="text"
                  />
                  <span>{{ t('page.workspace.draftTitle') }}</span>
                </label>
                <label class="label rounded-box border-base-300 cursor-pointer gap-2 border px-3 py-2">
                  <span class="label-text text-xs">{{ t('page.workspace.completed') }}</span>
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
                  {{ t('page.workspace.createButton') }}
                </button>
              </div>
            </div>
          </section>

          <!-- 草稿列表 -->
          <section class="card border-base-300 bg-base-100 border shadow-sm">
            <div class="card-body gap-3 p-4">
              <div class="flex items-center justify-between">
                <h2 class="text-base font-semibold">{{ t('page.workspace.draftList') }}</h2>
                <span class="badge badge-ghost badge-sm">{{
                  t('page.workspace.drafts', { count: workspaceEntries.length })
                }}</span>
              </div>

              <div
                class="border-base-300 text-base-content/55 rounded-box border border-dashed p-6 text-center text-sm"
                v-if="workspaceEntries.length === 0"
              >
                {{ t('page.workspace.emptyDrafts') }}
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
                        >{{ t('page.workspace.recovered') }}</span
                      >
                    </div>
                    <div class="flex flex-wrap gap-1.5">
                      <button
                        class="btn btn-xs btn-ghost"
                        @click="activeDraftId = entry.id"
                        type="button"
                      >
                        {{ t('page.workspace.view') }}
                      </button>
                      <button
                        class="btn btn-xs btn-primary"
                        :disabled="busy"
                        @click="saveDraft(entry)"
                        type="button"
                      >
                        {{ t('common.save') }}
                      </button>
                      <button
                        class="btn btn-xs btn-ghost text-error"
                        :disabled="busy"
                        @click="discardDraft(entry)"
                        type="button"
                      >
                        {{ t('common.discard') }}
                      </button>
                    </div>
                  </div>
                  <div class="text-base-content/55 grid gap-1 font-mono text-xs sm:grid-cols-3">
                    <span class="truncate">{{
                      t('page.workspace.completedValue', { value: completedText(entry) })
                    }}</span>
                    <span class="truncate">{{ formatWorkspaceDate(createdAtOf(entry), locale) }}</span>
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
                  <h2 class="text-base font-semibold">{{ t('page.workspace.todoTable') }}</h2>
                  <p class="text-base-content/55 text-xs">
                    {{ t('page.workspace.todoDescription', { size: TODO_PAGE_SIZE }) }}
                  </p>
                </div>
                <button
                  class="btn btn-ghost btn-sm"
                  :disabled="busy || savedTodoTotal === 0"
                  @click="clearSavedTodos"
                  type="button"
                >
                  {{ t('page.workspace.clearTable') }}
                </button>
              </div>

              <div class="rounded-box border-base-300 overflow-x-auto border">
                <table class="table-zebra table-sm table">
                  <thead>
                    <tr>
                      <th>{{ t('page.workspace.titleColumn') }}</th>
                      <th>{{ t('page.workspace.statusColumn') }}</th>
                      <th>{{ t('page.workspace.idColumn') }}</th>
                      <th>{{ t('page.workspace.updatedAtColumn') }}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-if="savedTodos.length === 0">
                      <td
                        class="text-base-content/55 text-center text-sm"
                        colspan="4"
                      >
                        {{ t('page.workspace.emptyTodos') }}
                      </td>
                    </tr>
                    <tr
                      v-else
                      v-for="todo in savedTodos"
                      :key="todo.id"
                    >
                      <td class="font-medium">{{ todo.title }}</td>
                      <td>
                        <span class="badge badge-outline badge-sm">{{
                          t(todo.completed ? 'page.workspace.statusCompleted' : 'page.workspace.statusOpen')
                        }}</span>
                      </td>
                      <td class="font-mono text-xs">{{ todo.id.slice(0, 8) }}</td>
                      <td class="text-xs">{{ formatWorkspaceDate(todo.updatedAt, locale) }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div class="flex flex-wrap items-center justify-between gap-2">
                <span class="text-base-content/55 text-xs">
                  {{
                    t('page.workspace.pagination', {
                      count: savedTodoTotal,
                      current: todoPage + 1,
                      total: todoPageCount
                    })
                  }}
                </span>
                <div class="join">
                  <button
                    class="btn btn-sm join-item"
                    :disabled="todoPage === 0"
                    @click="previousTodoPage"
                    type="button"
                  >
                    {{ t('common.previous') }}
                  </button>
                  <button
                    class="btn btn-sm join-item"
                    :disabled="todoPage >= todoPageCount - 1"
                    @click="nextTodoPage"
                    type="button"
                  >
                    {{ t('common.next') }}
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
              <h2 class="text-base font-semibold">{{ t('page.workspace.recoveryPanel') }}</h2>
              <div
                class="space-y-3"
                v-if="activeDraftEntry"
              >
                <div class="flex flex-wrap items-center gap-2">
                  <h3 class="font-semibold">{{ titleOf(activeDraftEntry) }}</h3>
                  <span
                    class="badge badge-secondary badge-soft badge-sm"
                    v-if="recoveredIds.has(activeDraftEntry.id)"
                    >{{ t('page.workspace.recoveredAfterRefresh') }}</span
                  >
                </div>
                <div class="space-y-1.5 text-sm">
                  <div class="flex items-center justify-between gap-3">
                    <span class="text-base-content/55">{{ t('page.workspace.draftId') }}</span>
                    <span class="font-mono text-xs">{{ activeDraftEntry.id }}</span>
                  </div>
                  <div class="flex items-center justify-between gap-3">
                    <span class="text-base-content/55">{{ t('page.workspace.completedStatus') }}</span>
                    <span>{{ completedText(activeDraftEntry) }}</span>
                  </div>
                  <div class="flex items-center justify-between gap-3">
                    <span class="text-base-content/55">{{ t('page.workspace.createdAt') }}</span>
                    <span>{{ formatWorkspaceDate(createdAtOf(activeDraftEntry), locale) }}</span>
                  </div>
                </div>
                <div class="flex gap-2">
                  <button
                    class="btn btn-primary btn-sm flex-1"
                    :disabled="busy"
                    @click="saveDraft(activeDraftEntry)"
                    type="button"
                  >
                    {{ t('common.save') }}
                  </button>
                  <button
                    class="btn btn-ghost btn-sm text-error"
                    :disabled="busy"
                    @click="discardDraft(activeDraftEntry)"
                    type="button"
                  >
                    {{ t('common.discard') }}
                  </button>
                </div>
              </div>
              <div
                class="border-base-300 text-base-content/55 rounded-box border border-dashed p-4 text-sm"
                v-else
              >
                {{ t('page.workspace.emptySelection') }}
              </div>
            </div>
          </section>
        </aside>
      </div>
    </div>
  </div>
</template>
