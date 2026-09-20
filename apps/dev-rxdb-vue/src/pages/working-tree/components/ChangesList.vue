<script lang="ts" setup>
import type { WorkingTreeDiff, WorkingTreeDiffEntry, WorkingTreeQueryState } from '@aiao/rxdb-plugin-working-tree';
import { Check, ChevronDown, FileDiff, ListFilter, Search } from '@lucide/vue';
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { diffEntryKey, formatPatchSummary } from '../utils/diff-format';
import type { WorkingTreeContextMenuRequest } from '../utils/context-menu';
import { gdEntryPath, gdOpColor, gdOpIcon, gdPathColor, gdTableName } from '../utils/gd';

/** 变更类型筛选的四个档位。 */
const KINDS = [
  { value: 'all', label: 'All' },
  { value: 'insert', label: 'Added' },
  { value: 'update', label: 'Modified' },
  { value: 'delete', label: 'Deleted' }
] as const;

/**
 * 「更改」标签页的文件列表，模仿 GitHub Desktop 的 Changes 列表。
 *
 * @remarks
 * 一条实体记录在这里就是一个文件，路径为 `schema/表名/主键`（优先 @Entity 的 tableName，查不到回退实体名）。
 * 类型筛选和路径/补丁文本筛选只影响列表，不改变待提交内容。
 * 筛选栏是**一个组合盒子**（GitHub Desktop 形态）：左侧漏斗图标按钮打开类型菜单
 * （全部 / 新增 / 修改 / 删除），分隔线右侧是放大镜 + 文本输入。
 *
 * 行是**可选中**的（选中键 = `diffEntryKey`），右栏的详情区跟随选中项——
 * 这正是 GitHub Desktop「左边点文件、右边看 diff」的轴。选中行是 GitHub Desktop
 * 的签名样式：3px 蓝左边条 + 浅蓝底（`.gd-row` / `.gd-row-selected` 见 styles.css）。
 * 行用 `role="button"` 的 div 而不是 `<button>`：模板里没有嵌套按钮，但保持与
 * 历史列表同一种键盘形态（Enter 选中），让两个列表的 a11y 行为一致。
 *
 * 没有暂存区（v1 硬裁决），所以行上没有 GitHub Desktop 的勾选框——列表只做「看」，
 * 「提交哪些」由提交框那句「提交全部未提交改动」说清。
 */
const props = defineProps<{
  diffState: WorkingTreeQueryState<WorkingTreeDiff>;
  selectedKey: string | null;
}>();

const emit = defineEmits<{
  (e: 'selectEntry', entry: WorkingTreeDiffEntry): void;
  /** 行上右键；页面按条目拼菜单（复制 / 丢弃）。 */
  (e: 'menuRequest', request: WorkingTreeContextMenuRequest<WorkingTreeDiffEntry>): void;
}>();

const filter = ref('');
const operation = ref<'all' | WorkingTreeDiffEntry['operation']>('all');
const kindOpen = ref(false);
const kindContainer = ref<HTMLElement | null>(null);

/**
 * diff 重读（loading）期间保留上一轮条目（stale-while-revalidate）：
 * 挂载读与工具栏 Fetch 的两轮 diff 会先后落相位，loading 一瞬把列表清空的话，
 * 那一瞬点选 / 走查的行会消失；保留旧条目让列表不闪空，成功落定后再换新。
 */
const lastEntries = ref<readonly WorkingTreeDiffEntry[]>([]);
watch(
  () => props.diffState,
  state => {
    if (state.phase === 'success') lastEntries.value = state.value.entries;
  }
);

const filteredEntries = computed(() => {
  const state = props.diffState;
  const source =
    state.phase === 'success' ? state.value.entries
    : state.phase === 'loading' ? lastEntries.value
    : [];
  const needle = filter.value.trim().toLowerCase();
  return source.filter(
    entry =>
      (operation.value === 'all' || entry.operation === operation.value) &&
      `${gdEntryPath(entry)} ${formatPatchSummary(entry)}`.toLowerCase().includes(needle)
  );
});

/** 当前类型的展示名（漏斗按钮的 title 用）。 */
function kindLabel(): string {
  return KINDS.find(kind => kind.value === operation.value)?.label ?? 'All';
}

function setFilter(event: Event): void {
  filter.value = (event.target as HTMLInputElement).value;
}

function setOperation(value: 'all' | WorkingTreeDiffEntry['operation']): void {
  operation.value = value;
  kindOpen.value = false;
}

const onDocumentClick = (event: MouseEvent): void => {
  if (kindOpen.value && !kindContainer.value?.contains(event.target as Node)) {
    kindOpen.value = false;
  }
};

const closeKind = (event: KeyboardEvent): void => {
  if (event.key !== 'Escape' || !kindOpen.value) return;
  event.stopPropagation();
  kindOpen.value = false;
};

onMounted(() => {
  document.addEventListener('click', onDocumentClick);
  document.addEventListener('keydown', closeKind);
});
onBeforeUnmount(() => {
  document.removeEventListener('click', onDocumentClick);
  document.removeEventListener('keydown', closeKind);
});
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col">
    <div class="gd-filter-bar">
      <div class="gd-filter-combo">
        <div
          class="relative flex shrink-0"
          ref="kindContainer"
        >
          <button
            class="gd-filter-kind-btn"
            :aria-expanded="kindOpen"
            :title="'Change type: ' + kindLabel()"
            @click="kindOpen = !kindOpen"
            aria-haspopup="true"
            data-testid="wt-filter-kind"
            type="button"
          >
            <ListFilter :size="14" />
            <ChevronDown :size="10" />
          </button>
          <div
            class="gd-menu absolute top-full left-0 z-40 mt-1 w-36 py-1"
            v-if="kindOpen"
            aria-label="Change type"
            data-testid="wt-filter-kind-popup"
            role="menu"
          >
            <button
              class="gd-menu-row"
              v-for="kind in KINDS"
              :data-testid="'wt-filter-kind-' + kind.value"
              :key="kind.value"
              @click="setOperation(kind.value)"
              role="menuitem"
              type="button"
            >
              {{ kind.label }}
              <Check
                class="ml-auto shrink-0 text-[var(--gd-accent)]"
                v-if="operation === kind.value"
                :size="13"
              />
            </button>
          </div>
        </div>
        <label class="gd-filter-search">
          <Search :size="14" />
          <input
            :value="filter"
            @input="setFilter"
            aria-label="Filter changes"
            data-testid="wt-change-filter"
            placeholder="Filter"
            type="search"
          />
        </label>
      </div>
    </div>
    <div class="gd-files-count">{{ filteredEntries.length }} changed files</div>
    <div
      class="min-h-0 flex-1 overflow-y-auto"
      aria-live="polite"
      data-testid="wt-diff-result"
    >
      <!-- 相位是给 e2e / 读屏的读数，不是给眼睛的 UI：sr-only -->
      <span
        class="sr-only"
        data-testid="wt-diff-phase"
        >{{ diffState.phase }}</span
      >
      <div
        class="gd-empty py-10 text-xs"
        v-if="diffState.phase === 'empty'"
      >
        <FileDiff
          class="text-[var(--gd-line-num)]"
          :size="28"
        />
        <p>No local changes</p>
        <p class="text-xs">Data written on other pages (like Todo) shows up here as uncommitted changes</p>
      </div>
      <ul
        v-else-if="diffState.phase === 'success' || (diffState.phase === 'loading' && lastEntries.length > 0)"
        data-testid="wt-diff-list"
      >
        <li
          v-for="entry in filteredEntries"
          :key="diffEntryKey(entry)"
        >
          <div
            class="gd-row"
            :aria-current="selectedKey === diffEntryKey(entry) ? 'true' : null"
            :class="{ 'gd-row-selected': selectedKey === diffEntryKey(entry) }"
            :data-diff-key="diffEntryKey(entry)"
            @click="emit('selectEntry', entry)"
            @contextmenu="emit('menuRequest', { target: entry, event: $event })"
            @keydown.enter="emit('selectEntry', entry)"
            data-testid="wt-diff-item"
            role="button"
            tabindex="0"
          >
            <div
              class="flex min-w-0 items-center gap-2"
              :title="gdEntryPath(entry) + ' · ' + formatPatchSummary(entry)"
            >
              <!-- 路径中间省略（GitHub Desktop 的文件列表同款）：前缀段照常截断，id 尾部保留结尾 -->
              <span
                class="gd-file-name flex min-w-0 flex-1 items-center"
                :style="{ color: gdPathColor(entry.operation) }"
              >
                <!-- schema/实体 前缀永不省略（Todo 必须完整可见），只有 uuid 前段省略 -->
                <span class="shrink-0">{{ entry.namespace }}/{{ gdTableName(entry.entity) }}/</span>
                <span class="gd-truncate-tail min-w-0"
                  ><span>{{ entry.entityId }}</span></span
                >
              </span>
              <component
                class="shrink-0"
                :is="gdOpIcon(entry.operation)"
                :size="16"
                :style="{ color: gdOpColor(entry.operation) }"
              />
            </div>
          </div>
        </li>
        <li
          class="gd-empty py-8 text-xs"
          v-if="filteredEntries.length === 0"
        >
          No matching changes
        </li>
      </ul>
    </div>
  </div>
</template>
