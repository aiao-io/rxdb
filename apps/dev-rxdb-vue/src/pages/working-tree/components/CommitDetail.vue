<script lang="ts" setup>
import type { CommitChangeSetPage, CommitLogEntry, WorkingTreeQueryState } from '@aiao/rxdb-plugin-working-tree';
import { ChevronDown, ChevronUp, Copy, GitCommitHorizontal } from '@lucide/vue';
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { startDragResize } from '../utils/drag';
import {
  gdAvatarColor,
  gdAvatarInitial,
  gdEntryPath,
  gdOpColor,
  gdOpIcon,
  gdPathColor,
  gdTableName
} from '../utils/gd';
import DiffViewer from './DiffViewer.vue';

/** 一个变更单元的选中键：同一 commit 里的单元也互不相同。 */
const changeUnitKey = (unit: CommitChangeSetPage['entries'][number]): string =>
  `${unit.unitId}:${unit.namespace}:${unit.entity}:${unit.entityId}`;

/**
 * 右栏的提交详情，对应 GitHub Desktop 历史里选中提交后的右侧视图。
 *
 * @remarks
 * 提交元信息下方是文件列表与逐字段差异。`commitChanges()` 返回不可变变更单元，
 * 补丁字段与未提交 diff 同形，因此共用查看器；`diff()` 本身仍只比较 HEAD 和工作树。
 *
 * 没有「恢复」按钮（GitHub Desktop 的详情区也没有）：恢复入口只在历史行的右键菜单里。
 * 标题行右端的折叠 chevron 收的是**附加基本信息**（描述 + 作者 / 时间 / sha 元数据行），
 * 下面的文件列表与差异栏始终可见。文件列表右缘有可拖分隔条（GitHub Desktop 的同款可拖宽度）。
 */
const props = defineProps<{
  commit: CommitLogEntry | null;
  changesState: WorkingTreeQueryState<CommitChangeSetPage>;
}>();

let resetTimer: ReturnType<typeof setTimeout> | null = null;
/** SHA 的复制反馈；2s 后复位。 */
const copied = ref(false);
/** 左栏里选中的变更单元键。 */
const selectedUnitKey = ref<string | null>(null);
/** 内容区折叠（GitHub Desktop 的 diff 折叠 chevron）。 */
const collapsed = ref(false);
/** 文件列表宽度；右缘分隔条拖动调。 */
const filesWidth = ref(280);

/** 提交标题 = message 的第一行（GitHub Desktop 的大字标题位）。 */
const title = computed(() => props.commit?.message.split('\n', 1)[0] ?? '');
/** 描述 = message 第一行之后的全部（GitHub Desktop 的灰色描述段）。 */
const description = computed(() => {
  const message = props.commit?.message ?? '';
  const newline = message.indexOf('\n');
  return newline === -1 ? '' : message.slice(newline + 1).replace(/^\n+/, '');
});

/** 左栏当前选中的变更单元；没选中时回落到第一条（GitHub Desktop 默认展示第一个文件）。 */
const selectedUnit = computed(() => {
  const changes = props.changesState;
  if (changes.phase !== 'success' && changes.phase !== 'empty') return null;
  const entries = changes.value.entries;
  const key = selectedUnitKey.value;
  if (key !== null) return entries.find(unit => changeUnitKey(unit) === key) ?? null;
  return entries[0] ?? null;
});

// 换一个 commit 就清掉上一个的左栏选中与折叠态：两个 commit 的单元键可能撞上（都叫 u1）。
watch(
  () => props.commit,
  () => {
    selectedUnitKey.value = null;
    collapsed.value = false;
  }
);

onBeforeUnmount(() => {
  if (resetTimer !== null) clearTimeout(resetTimer);
});

async function copySha(sha: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(sha);
    copied.value = true;
  } catch {
    // 剪贴板不可用（非安全上下文等）：不假装成功
    return;
  }
  if (resetTimer !== null) clearTimeout(resetTimer);
  resetTimer = setTimeout(() => {
    copied.value = false;
  }, 2000);
}

/** 拖动文件列表右缘的分隔条调宽（公共拖拽样板，见 utils/drag）。 */
function startFilesResize(event: PointerEvent): void {
  startDragResize(event, {
    getWidth: () => filesWidth.value,
    setWidth: width => {
      filesWidth.value = width;
    },
    min: 140,
    max: 420
  });
}
</script>

<template>
  <div
    class="flex h-full min-h-0 flex-col"
    v-if="commit !== null"
    data-testid="wt-commit-detail"
  >
    <div class="gd-commit-header shrink-0 px-4 py-2">
      <div class="flex items-center gap-2">
        <h2
          class="min-w-0 flex-1 truncate text-[15px] font-semibold"
          :title="title"
        >
          {{ title }}
        </h2>
        <span
          class="shrink-0 rounded-full border border-[var(--gd-border)] px-1.5 text-[10px]"
          v-if="commit.kind === 'baseline' || commit.kind === 'branch_baseline'"
          :style="{ color: 'var(--gd-muted)' }"
        >
          Baseline
        </span>
        <span
          class="shrink-0 rounded-full border border-[var(--gd-border)] px-1.5 text-[10px]"
          v-else
          :style="{ color: 'var(--gd-muted)' }"
        >
          Commit
        </span>
        <span
          class="shrink-0 rounded-full border border-[var(--gd-border)] px-1.5 text-[10px]"
          v-if="commit.parentIds.length > 1"
          :style="{ color: 'var(--gd-muted)' }"
        >
          Merge
        </span>
        <button
          class="gd-icon-btn shrink-0"
          :aria-expanded="!collapsed"
          :aria-label="collapsed ? 'Expand details' : 'Collapse details'"
          :title="collapsed ? 'Expand details' : 'Collapse details'"
          @click="collapsed = !collapsed"
          data-testid="wt-detail-collapse"
          type="button"
        >
          <ChevronDown
            v-if="collapsed"
            :size="15"
          />
          <ChevronUp
            v-else
            :size="15"
          />
        </button>
      </div>
      <template v-if="!collapsed">
        <p
          class="mt-1 text-sm whitespace-pre-wrap"
          v-if="description"
          :style="{ color: 'var(--gd-muted)' }"
        >
          {{ description }}
        </p>

        <div
          class="gd-commit-meta mt-1 flex items-center gap-2 text-xs"
          :style="{ color: 'var(--gd-muted)' }"
          :title="commit.createdAt.toLocaleString()"
        >
          <span
            class="gd-avatar text-[9px]"
            :style="{ background: gdAvatarColor(commit.authorId ?? '?'), height: '18px', width: '18px' }"
          >
            {{ gdAvatarInitial(commit.authorId ?? '?') }}
          </span>
          <span>{{ commit.authorId ?? '无作者' }}</span>
          <span class="gd-commit-time">committed on {{ commit.createdAt.toLocaleString() }}</span>
          <span
            class="min-w-0 truncate font-mono text-[11px]"
            :title="commit.commitId"
          >
            {{ commit.commitId.slice(0, 8) }}
          </span>
          <button
            class="gd-btn-ghost shrink-0"
            @click="copySha(commit.commitId)"
            data-testid="wt-commit-copy"
            title="Copy commit ID"
            type="button"
          >
            <Copy :size="12" />
            <span class="sr-only">{{ copied ? 'Copied' : 'Copy commit ID' }}</span>
          </button>
        </div>
      </template>
    </div>

    <!-- 提交列表之外的文件列表与差异栏；始终可见，折叠只收上面的附加信息。 -->
    <div
      class="gd-history-layout min-h-0 flex-1 border-t"
      :style="{ borderColor: 'var(--gd-border)' }"
      data-testid="wt-commit-changes"
    >
      <template v-if="changesState.phase === 'success' || changesState.phase === 'empty'">
        <div
          class="gd-history-files"
          :style="{ '--gd-files-w': filesWidth + 'px' }"
          data-testid="wt-history-files"
        >
          <div class="gd-files-count">{{ changesState.value.entries.length }} changed files</div>
          <ul
            class="min-h-0 flex-1 overflow-y-auto"
            data-testid="wt-commit-changes-list"
          >
            <li
              v-for="unit in changesState.value.entries"
              :key="changeUnitKey(unit)"
            >
              <div
                class="gd-row"
                :class="{ 'gd-row-selected': selectedUnit === unit }"
                :data-unit-key="changeUnitKey(unit)"
                @click="selectedUnitKey = changeUnitKey(unit)"
                @keydown.enter="selectedUnitKey = changeUnitKey(unit)"
                data-testid="wt-commit-change-item"
                role="button"
                tabindex="0"
              >
                <div
                  class="flex min-w-0 items-center gap-2"
                  :title="gdEntryPath(unit)"
                >
                  <!-- 路径中间省略（与更改列表同一形态） -->
                  <span
                    class="flex min-w-0 flex-1 items-center text-[13px]"
                    :style="{ color: gdPathColor(unit.operation) }"
                  >
                    <span class="shrink-0">{{ unit.namespace }}/{{ gdTableName(unit.entity) }}/</span>
                    <span class="gd-truncate-tail min-w-0"
                      ><span>{{ unit.entityId }}</span></span
                    >
                  </span>
                  <component
                    class="shrink-0"
                    :is="gdOpIcon(unit.operation)"
                    :size="16"
                    :style="{ color: gdOpColor(unit.operation) }"
                  />
                </div>
              </div>
            </li>
          </ul>
        </div>
        <!-- 文件列表右缘的分隔条：按住拖动调宽（GitHub Desktop 的同款可拖分隔）。 -->
        <div
          class="gd-resizer"
          @pointerdown="startFilesResize"
          aria-hidden="true"
        ></div>
        <div
          class="gd-history-diff min-w-0 flex-1"
          data-testid="wt-history-diff"
        >
          <DiffViewer :entry="selectedUnit" />
        </div>
      </template>
      <p
        class="py-6 text-center text-xs"
        v-else-if="changesState.phase === 'loading'"
        :style="{ color: 'var(--gd-muted)' }"
      >
        Loading changes…
      </p>
      <p
        class="py-6 text-center text-xs"
        v-else-if="changesState.phase === 'error'"
        :style="{ color: 'var(--gd-del-fg)' }"
      >
        {{ changesState.error.message }}
      </p>
    </div>
  </div>
  <div
    class="gd-empty h-full text-sm"
    v-else
  >
    <GitCommitHorizontal
      class="text-[var(--gd-line-num)]"
      :size="40"
    />
    <p>Select a commit from the left to see its details</p>
  </div>
</template>
