<script lang="ts" setup>
import { MergeStrategy, RxDBBranch, RxDBChange } from '@aiao/rxdb';
import { Todo } from '@aiao/rxdb-test/entities';
import { useFindAll, useRxDB } from '@aiao/rxdb-vue';
import { useVirtualizer } from '@tanstack/vue-virtual';
import { AlertCircle, Check, ChevronRight, CircleDot, GitBranch, GitMerge, Plus, RefreshCw, Trash2 } from '@lucide/vue';
import { computed, markRaw, nextTick, ref, watch } from 'vue';
import { pairVirtualRows } from '../app/utils/virtual-rows';

// ── 类型 ──
interface MergeDialogState {
  sourceBranchId: string;
  strategy: MergeStrategy;
  deleteSource: boolean;
}

const CHANGE_ITEM_SIZE = 68;
const CHANGE_PAGE_SIZE = 50;

const formatChangePatch = (change: RxDBChange): string => {
  const MAX = 200;
  let text: string;
  if (change.type === 'INSERT') {
    text = change.patch ? JSON.stringify(change.patch) : '';
  } else if (change.type === 'DELETE') {
    text = change.inversePatch ? JSON.stringify(change.inversePatch) : '';
  } else {
    const ip = (change.inversePatch ?? {}) as Record<string, unknown>;
    const p = (change.patch ?? {}) as Record<string, unknown>;
    const keys = [...new Set([...Object.keys(ip), ...Object.keys(p)])];
    text = keys.map(k => `${k}: ${JSON.stringify(ip[k])} → ${JSON.stringify(p[k])}`).join(', ');
  }
  return text.length > MAX ? text.slice(0, MAX) + '…' : text;
};

const formatChangeTooltip = (change: RxDBChange): string => {
  if (change.type === 'UPDATE') {
    return `patch: ${JSON.stringify(change.patch, null, 2)}\ninversePatch: ${JSON.stringify(change.inversePatch, null, 2)}`;
  }
  if (change.type === 'INSERT') return `patch: ${JSON.stringify(change.patch, null, 2)}`;
  return `inversePatch: ${JSON.stringify(change.inversePatch, null, 2)}`;
};

const rxdb = useRxDB()!;

// ── 状态 ──
const busy = ref(false);
const showCreatePopover = ref(false);
const newBranchName = ref('');
const filterTab = ref<'all' | 'active' | 'stale'>('all');
const selectedBranchId = ref<string | null>(null);
const branchChanges = ref<RxDBChange[]>([]);
const loadingChanges = ref(false);
const hasMoreChanges = ref(true);
const mergeDialog = ref<MergeDialogState | null>(null);
const mergeError = ref<string | null>(null);
const toast = ref<{ type: 'success' | 'error'; message: string } | null>(null);

let changeCursor: number | null = null;
const createInputRef = ref<HTMLInputElement | null>(null);
const scrollContainerRef = ref<HTMLDivElement | null>(null);

// ── 数据 ──
const branchesResource = useFindAll(RxDBBranch, {
  where: { combinator: 'and', rules: [] },
  orderBy: [{ field: 'createdAt', sort: 'asc' }]
});
const branches = computed(() => branchesResource.value ?? []);
const activeBranch = computed(() => branches.value.find(b => b.activated)?.id ?? '');

const filteredBranches = computed(() => {
  if (filterTab.value === 'active') return branches.value.filter(b => b.activated);
  if (filterTab.value === 'stale') return branches.value.filter(b => !b.activated);
  return branches.value;
});

const selectedBranchIsActive = computed(() => selectedBranchId.value === activeBranch.value);

// ── 虚拟滚动 ──
const virtualizer = useVirtualizer(
  computed(() => ({
    count: branchChanges.value.length,
    getScrollElement: () => scrollContainerRef.value,
    estimateSize: () => CHANGE_ITEM_SIZE,
    overscan: 10
  }))
);
const virtualRows = computed(() => pairVirtualRows(branchChanges.value, virtualizer.value.getVirtualItems()));

// ── Popover 自动聚焦 ──
watch(showCreatePopover, val => {
  if (val) {
    nextTick(() => createInputRef.value?.focus());
  }
});

// ── Toast ──
const showToast = (type: 'success' | 'error', message: string) => {
  toast.value = { type, message };
  setTimeout(() => (toast.value = null), 3000);
};

// ── 变更加载 ──
const loadBranchChanges = async (branchId: string | null, reset: boolean) => {
  if (!branchId || loadingChanges.value) return;
  if (reset) {
    changeCursor = null;
    branchChanges.value = [];
    hasMoreChanges.value = true;
  }
  if (!reset && !hasMoreChanges.value) return;
  loadingChanges.value = true;
  try {
    const { changeRepository } = await rxdb.versionManager.getLocalRepositories();
    const branch = branches.value.find(b => b.id === branchId);
    const changes = await changeRepository.find({
      where: {
        combinator: 'and',
        rules: [
          { field: 'branchId', operator: '=', value: branchId },
          ...(branch?.fromChangeId != null ?
            [{ field: 'id' as const, operator: '>' as const, value: branch.fromChangeId }]
          : []),
          ...(changeCursor != null ? [{ field: 'id' as const, operator: '<' as const, value: changeCursor }] : [])
        ]
      },
      orderBy: [{ field: 'id', sort: 'desc' }],
      limit: CHANGE_PAGE_SIZE
    });
    const items = changes.map(c => markRaw(c));
    if (reset) {
      branchChanges.value = items;
    } else {
      branchChanges.value = [...branchChanges.value, ...items];
    }
    if (changes.length < CHANGE_PAGE_SIZE) hasMoreChanges.value = false;
    if (changes.length > 0) changeCursor = changes[changes.length - 1].id;
  } finally {
    loadingChanges.value = false;
  }
};

// ── 无限滚动 ──
const handleScroll = () => {
  const el = scrollContainerRef.value;
  if (!el || !selectedBranchId.value) return;
  if (el.scrollHeight - el.scrollTop - el.clientHeight < 400) {
    loadBranchChanges(selectedBranchId.value, false);
  }
};

// ── 分支操作 ──
const selectBranch = (id: string) => {
  selectedBranchId.value = id;
  loadBranchChanges(id, true);
};

const refreshChanges = () => loadBranchChanges(selectedBranchId.value, true);

const toggleCreatePopover = () => {
  if (showCreatePopover.value) {
    showCreatePopover.value = false;
  } else {
    newBranchName.value = '';
    showCreatePopover.value = true;
  }
};

const createBranch = async () => {
  const name = newBranchName.value.trim();
  if (!name) return;
  busy.value = true;
  try {
    await rxdb.versionManager.createBranch(name);
    newBranchName.value = '';
    showCreatePopover.value = false;
    showToast('success', `分支 "${name}" 创建成功`);
  } catch (e: unknown) {
    showToast('error', e instanceof Error ? e.message : '创建失败');
  } finally {
    busy.value = false;
  }
};

const switchBranch = async (branchId: string, event: MouseEvent) => {
  event.stopPropagation();
  busy.value = true;
  try {
    await rxdb.versionManager.switchBranch(branchId);
    showToast('success', `已切换到分支 "${branchId}"`);
    await loadBranchChanges(selectedBranchId.value, true);
  } catch (e: unknown) {
    showToast('error', e instanceof Error ? e.message : '切换失败');
  } finally {
    busy.value = false;
  }
};

const deleteBranch = async (branchId: string, event: MouseEvent) => {
  event.stopPropagation();
  if (!confirm(`确定要删除分支 "${branchId}" 吗？`)) return;
  busy.value = true;
  try {
    await rxdb.versionManager.removeBranch(branchId);
    if (selectedBranchId.value === branchId) {
      selectedBranchId.value = null;
      branchChanges.value = [];
    }
    showToast('success', `分支 "${branchId}" 已删除`);
  } catch (e: unknown) {
    showToast('error', e instanceof Error ? e.message : '删除失败');
  } finally {
    busy.value = false;
  }
};

// ── 合并 ──
const openMergeDialog = (sourceBranchId: string, event: MouseEvent) => {
  event.stopPropagation();
  mergeError.value = null;
  mergeDialog.value = { sourceBranchId, strategy: 'squash', deleteSource: false };
};

const closeMergeDialog = () => {
  mergeDialog.value = null;
  mergeError.value = null;
};

const executeMerge = async () => {
  if (!mergeDialog.value) return;
  busy.value = true;
  mergeError.value = null;
  try {
    const result = await rxdb.versionManager.mergeBranch(mergeDialog.value.sourceBranchId, {
      strategy: mergeDialog.value.strategy,
      deleteSource: mergeDialog.value.deleteSource
    });
    closeMergeDialog();
    showToast(
      'success',
      `合并完成：${result.merged} 条变更已应用到 ${activeBranch.value}` + (result.sourceDeleted ? `，源分支已删除` : '')
    );
    if (selectedBranchId.value) {
      await loadBranchChanges(selectedBranchId.value, true);
    }
  } catch (e: unknown) {
    mergeError.value = e instanceof Error ? e.message : '合并失败';
  } finally {
    busy.value = false;
  }
};

// ── 示例数据 ──
const addSampleTodo = async () => {
  busy.value = true;
  try {
    const titles = [
      'Fix bug in login flow',
      'Add unit tests for merge_branch',
      'Update README docs',
      'Refactor query builder',
      'Improve error messages',
      'Add dark mode support',
      'Performance optimizations'
    ];
    const title = titles[Math.floor(Math.random() * titles.length)];
    const todo = new Todo({ title });
    await todo.save();
    showToast('success', `已添加 Todo：${title}`);
    if (selectedBranchId.value === activeBranch.value) {
      await loadBranchChanges(selectedBranchId.value, true);
    }
  } catch (e: unknown) {
    showToast('error', e instanceof Error ? e.message : '添加失败');
  } finally {
    busy.value = false;
  }
};

const filterTabs = [
  { key: 'all' as const, label: '全部' },
  { key: 'active' as const, label: '当前分支' },
  { key: 'stale' as const, label: '其他分支' }
];
</script>

<template>
  <div class="flex h-full flex-col overflow-hidden">
    <!-- ▸ 顶部标题栏 -->
    <div class="border-base-300 flex shrink-0 items-center justify-between border-b px-4 py-3">
      <div class="flex items-center gap-2">
        <GitBranch
          class="text-primary"
          :size="20"
        />
        <h1 class="text-lg font-semibold">分支管理</h1>
        <span class="badge badge-ghost badge-sm">{{ branches.length }} 个分支</span>
      </div>
      <div class="flex items-center gap-2">
        <button
          class="btn btn-ghost btn-sm gap-1"
          :disabled="busy"
          @click="addSampleTodo"
        >
          <Plus :size="14" />
          添加 Todo 变更
        </button>
        <div class="relative">
          <button
            class="btn btn-primary btn-sm gap-1"
            :disabled="busy"
            @click="toggleCreatePopover"
          >
            <GitBranch :size="14" />
            新建分支
          </button>
          <template v-if="showCreatePopover">
            <div
              class="fixed inset-0 z-40"
              @click="showCreatePopover = false"
            />
            <div
              class="bg-base-100 border-base-300 absolute top-full right-0 z-50 mt-2 rounded-lg border p-3 shadow-xl"
            >
              <div class="flex flex-col gap-2">
                <div class="text-xs font-medium">
                  创建新分支 <span class="text-base-content/40">（基于 {{ activeBranch }}）</span>
                </div>
                <input
                  class="input input-sm input-bordered w-56"
                  v-model="newBranchName"
                  @keydown.enter="createBranch"
                  @keydown.escape="showCreatePopover = false"
                  placeholder="feature/my-feature"
                  ref="createInputRef"
                  type="text"
                />
                <div class="flex justify-end gap-2">
                  <button
                    class="btn btn-ghost btn-sm"
                    @click="showCreatePopover = false"
                  >
                    取消
                  </button>
                  <button
                    class="btn btn-primary btn-sm"
                    :disabled="!newBranchName.trim() || busy"
                    @click="createBranch"
                  >
                    创建
                  </button>
                </div>
              </div>
            </div>
          </template>
        </div>
      </div>
    </div>

    <!-- ▸ 主体（两栏） -->
    <div class="flex min-h-0 flex-1 overflow-hidden">
      <!-- ══ 左栏：分支列表 ══ -->
      <div class="border-base-300 flex w-72 shrink-0 flex-col overflow-hidden border-r">
        <!-- 分类 Tab -->
        <div class="border-base-300 flex shrink-0 border-b">
          <button
            class="flex-1 py-2 text-xs font-medium transition-colors"
            v-for="tab in filterTabs"
            :class="{
              'border-primary text-primary border-b-2': filterTab === tab.key
            }"
            :key="tab.key"
            @click="filterTab = tab.key"
          >
            {{ tab.label }}
          </button>
        </div>

        <!-- 分支列表 -->
        <ul class="flex-1 overflow-y-auto py-1">
          <li
            class="hover:bg-base-200 cursor-pointer border-b border-transparent px-3 py-2.5 transition-colors"
            v-for="branch in filteredBranches"
            :class="{
              'bg-base-200 border-base-300': selectedBranchId === branch.id
            }"
            :key="branch.id"
            @click="selectBranch(branch.id)"
            @keydown.enter="selectBranch(branch.id)"
            @keydown.space="selectBranch(branch.id)"
            role="button"
            tabindex="0"
          >
            <div class="flex items-start justify-between gap-1">
              <div class="flex min-w-0 flex-1 flex-col gap-0.5">
                <div class="flex items-center gap-1.5">
                  <CircleDot
                    class="text-success shrink-0"
                    v-if="branch.activated"
                    :size="12"
                  />
                  <GitBranch
                    class="text-base-content/40 shrink-0"
                    v-else
                    :size="12"
                  />
                  <span
                    class="min-w-0 truncate text-sm font-medium"
                    :class="{ 'text-success': branch.activated }"
                    :title="branch.id"
                  >
                    {{ branch.id }}
                  </span>
                </div>
                <div
                  class="text-base-content/50 ml-4 flex items-center gap-0.5 text-xs"
                  v-if="branch.parentId"
                >
                  <ChevronRight :size="10" />
                  <span>来自 {{ branch.parentId }}</span>
                </div>
              </div>
              <span
                class="badge badge-success badge-xs shrink-0"
                v-if="branch.activated"
                >当前</span
              >
            </div>

            <!-- 操作按钮行 -->
            <div
              class="mt-2 flex flex-wrap gap-1.5"
              v-if="selectedBranchId === branch.id && !branch.activated"
            >
              <button
                class="btn btn-xs btn-outline btn-primary"
                :disabled="busy"
                @click="switchBranch(branch.id, $event)"
              >
                切换
              </button>
              <button
                class="btn btn-xs btn-outline btn-success gap-1"
                :disabled="busy"
                @click="openMergeDialog(branch.id, $event)"
              >
                <GitMerge :size="11" />
                合并到 {{ activeBranch }}
              </button>
              <button
                class="btn btn-xs btn-outline btn-error gap-1"
                :disabled="busy"
                @click="deleteBranch(branch.id, $event)"
              >
                <Trash2 :size="11" />
                删除
              </button>
            </div>
          </li>
          <li
            class="text-base-content/40 px-4 py-8 text-center text-sm"
            v-if="filteredBranches.length === 0"
          >
            暂无分支
          </li>
        </ul>
      </div>

      <!-- ══ 右栏：变更记录 ══ -->
      <div class="flex min-w-0 flex-1 flex-col overflow-hidden">
        <template v-if="selectedBranchId">
          <!-- 变更列表头 -->
          <div class="border-base-300 flex shrink-0 items-center justify-between border-b px-4 py-2.5">
            <div class="flex items-center gap-2">
              <GitBranch
                class="text-primary"
                :size="16"
              />
              <span class="font-medium">{{ selectedBranchId }}</span>
              <span
                class="badge badge-success badge-sm"
                v-if="selectedBranchIsActive"
                >当前分支</span
              >
            </div>
            <div class="flex items-center gap-2">
              <span class="text-base-content/50 text-xs">
                {{ branchChanges.length }} 条{{ hasMoreChanges ? '+' : '' }}
              </span>
              <button
                class="btn btn-ghost btn-xs btn-circle"
                :disabled="loadingChanges"
                @click="refreshChanges"
                title="刷新"
              >
                <RefreshCw
                  :class="{ 'animate-spin': loadingChanges }"
                  :size="13"
                />
              </button>
            </div>
          </div>

          <!-- 变更列表（虚拟滚动） -->
          <div
            class="flex-1 overflow-auto"
            @scroll="handleScroll"
            ref="scrollContainerRef"
          >
            <!-- 空状态 -->
            <div
              class="flex flex-col items-center gap-2 p-12 text-center"
              v-if="!loadingChanges && branchChanges.length === 0"
            >
              <Check
                class="text-base-content/20"
                :size="32"
              />
              <p class="text-base-content/50 text-sm">此分支无变更记录</p>
              <p class="text-base-content/30 text-xs">
                <template v-if="selectedBranchIsActive"> 点击「添加 Todo 变更」来创建一些变更 </template>
                <template v-else> 切换到此分支后添加数据即可产生变更 </template>
              </p>
            </div>

            <!-- 变更列表 -->
            <div
              v-if="branchChanges.length > 0"
              :style="{ height: `${virtualizer.getTotalSize()}px`, position: 'relative', width: '100%' }"
            >
              <ul>
                <li
                  class="border-base-300 hover:bg-base-200 absolute flex w-full flex-col justify-center gap-0.5 border-b px-4 transition-colors"
                  v-for="{ item: change, virtualItem: virtualRow } in virtualRows"
                  :key="change.id"
                  :style="{
                    height: `${CHANGE_ITEM_SIZE}px`,
                    transform: `translateY(${virtualRow.start}px)`
                  }"
                  :title="formatChangeTooltip(change)"
                >
                  <!-- 第一行: badge + entity + id -->
                  <div class="flex items-center gap-3">
                    <div class="w-16 shrink-0">
                      <span
                        class="badge badge-success badge-sm"
                        v-if="change.type === 'INSERT'"
                        >INSERT</span
                      >
                      <span
                        class="badge badge-warning badge-sm"
                        v-else-if="change.type === 'UPDATE'"
                        >UPDATE</span
                      >
                      <span
                        class="badge badge-error badge-sm"
                        v-else-if="change.type === 'DELETE'"
                        >DELETE</span
                      >
                    </div>
                    <div class="flex min-w-0 flex-1 items-center gap-2">
                      <span class="text-sm font-medium">{{ change.entity }}</span>
                      <span class="text-base-content/40 font-mono text-xs"> #{{ change.entityId }} </span>
                      <span
                        class="badge badge-ghost badge-xs shrink-0"
                        v-if="change.revertChangeId"
                        >已撤销</span
                      >
                    </div>
                    <div class="text-base-content/30 shrink-0 font-mono text-xs"> #{{ change.id }} </div>
                  </div>
                  <!-- 第二行: patch 摘要 -->
                  <div class="text-base-content/40 ml-[76px] truncate font-mono text-xs leading-none">
                    {{ formatChangePatch(change) }}
                  </div>
                </li>
              </ul>
            </div>

            <!-- 加载更多指示器 -->
            <div
              class="flex justify-center py-4"
              v-if="loadingChanges"
            >
              <span class="loading loading-spinner loading-sm" />
            </div>
            <div
              class="text-base-content/30 py-4 text-center text-xs"
              v-if="!hasMoreChanges && branchChanges.length > 0"
            >
              已加载全部 {{ branchChanges.length }} 条变更
            </div>
          </div>
        </template>

        <!-- 未选择分支时的空状态 -->
        <div
          class="flex flex-1 flex-col items-center justify-center gap-3 p-12 text-center"
          v-else
        >
          <GitBranch
            class="text-base-content/15"
            :size="48"
          />
          <p class="text-base-content/50">选择一个分支查看变更记录</p>
        </div>
      </div>
    </div>

    <!-- ═══════ 合并对话框 ═══════ -->
    <div
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      v-if="mergeDialog"
      @click="closeMergeDialog"
      @keydown.escape="closeMergeDialog"
      aria-label="关闭对话框"
      role="button"
      tabindex="0"
    >
      <div
        class="bg-base-100 w-full max-w-md rounded-xl p-6 shadow-2xl"
        @click.stop
        @keydown.stop
        aria-modal="true"
        role="dialog"
      >
        <div class="mb-4 flex items-center gap-2">
          <GitMerge
            class="text-success"
            :size="20"
          />
          <h2 class="text-lg font-semibold">合并分支</h2>
        </div>

        <!-- 合并路径 -->
        <div class="bg-base-200 mb-4 flex items-center gap-2 rounded-lg px-3 py-2 text-sm">
          <span class="font-mono font-medium text-orange-500">{{ mergeDialog.sourceBranchId }}</span>
          <ChevronRight
            class="text-base-content/50"
            :size="14"
          />
          <span class="font-mono font-medium text-green-600">{{ activeBranch }}</span>
        </div>

        <!-- 合并策略 -->
        <div class="mb-4">
          <span class="mb-1.5 block text-sm font-medium">合并策略</span>
          <div class="flex gap-2">
            <button
              class="flex-1 rounded-lg border px-3 py-2 text-left text-sm transition"
              :class="mergeDialog.strategy === 'squash' ? 'bg-primary/10 border-primary' : 'border-base-300'"
              @click="mergeDialog = { ...mergeDialog, strategy: 'squash' }"
            >
              <div class="font-medium">Squash</div>
              <div class="text-base-content/50 mt-0.5 text-xs">压缩为最小变更集，过滤幽灵操作</div>
            </button>
            <button
              class="flex-1 rounded-lg border px-3 py-2 text-left text-sm transition"
              :class="mergeDialog.strategy === 'normal' ? 'bg-primary/10 border-primary' : 'border-base-300'"
              @click="mergeDialog = { ...mergeDialog, strategy: 'normal' }"
            >
              <div class="font-medium">Normal</div>
              <div class="text-base-content/50 mt-0.5 text-xs">逐条应用，保留每条独立变更记录</div>
            </button>
          </div>
        </div>

        <!-- 删除源分支 -->
        <label class="mb-6 flex cursor-pointer items-center gap-3">
          <input
            class="checkbox checkbox-sm"
            v-model="mergeDialog.deleteSource"
            type="checkbox"
          />
          <span class="text-sm">
            合并后删除源分支 <code class="text-xs opacity-70">{{ mergeDialog.sourceBranchId }}</code>
          </span>
        </label>

        <!-- 错误信息 -->
        <div
          class="alert alert-error mb-4 py-2 text-sm"
          v-if="mergeError"
        >
          <AlertCircle :size="16" />
          {{ mergeError }}
        </div>

        <div class="flex justify-end gap-2">
          <button
            class="btn btn-ghost btn-sm"
            :disabled="busy"
            @click="closeMergeDialog"
          >
            取消
          </button>
          <button
            class="btn btn-success btn-sm gap-1"
            :disabled="busy"
            @click="executeMerge"
          >
            <span
              class="loading loading-spinner loading-xs"
              v-if="busy"
            />
            <GitMerge
              v-else
              :size="14"
            />
            确认合并
          </button>
        </div>
      </div>
    </div>

    <!-- Toast -->
    <div
      class="toast toast-top toast-end z-50"
      v-if="toast"
    >
      <div
        class="alert text-sm"
        :class="toast.type === 'error' ? 'alert-error' : 'alert-success'"
      >
        {{ toast.message }}
      </div>
    </div>
  </div>
</template>

<style scoped>
:deep(.vue-recycle-scroller) {
  height: 100%;
}
</style>
