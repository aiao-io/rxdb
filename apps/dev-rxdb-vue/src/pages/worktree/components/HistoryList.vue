<script lang="ts" setup>
import type { CommitLogEntry, CommitLogPage, WorktreeQueryState } from '@aiao/rxdb-plugin-worktree';
import { History, MoreVertical } from '@lucide/vue';
import type { WorktreeContextMenuRequest } from '../utils/context-menu';
import { gdAvatarColor, gdAvatarInitial, gdRelativeTime } from '../utils/gd';

/**
 * 「历史记录」标签页的提交列表，模仿 GitHub Desktop 的 History 列表。
 *
 * @remarks
 * 第一行是提交标题，第二行是作者头像、作者与时间；选择后右侧显示文件与补丁。
 * 行可选中，右栏详情区跟随选中项，选中行是 3px 蓝左边条 + 浅蓝底（`.gd-row`）。
 * GitHub Desktop 的历史行上没有「恢复」按钮（右栏详情区也没有），恢复入口只在
 * 行的右键菜单里——行因此回到与变更列表同一种形态：`role="button"` 的 div + Enter。
 * 基线提交（`baseline` / `branch_baseline`）不可恢复——恢复它们的语义是把内容
 * 写回工作树，而基线不是用户提交。
 */
defineProps<{
  commitsState: WorktreeQueryState<CommitLogPage>;
  selectedCommitId: string | null;
}>();

/**
 * 触屏没有右键：行尾 ⋯ 按钮按自身位置合成一次 contextmenu 请求，
 * 打开与右键相同的菜单（桌面端按钮隐藏，仍走原生右键）。
 */
function onTouchMenu(event: MouseEvent, target: unknown): void {
  event.stopPropagation();
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
  emit('menuRequest', {
    target,
    event: new MouseEvent('contextmenu', { clientX: rect.left, clientY: rect.bottom, bubbles: true })
  } as never);
}

const emit = defineEmits<{
  (e: 'selectEntry', entry: CommitLogEntry): void;
  /** 行上右键；页面按条目拼菜单（复制 / 恢复）。 */
  (e: 'menuRequest', request: WorktreeContextMenuRequest<CommitLogEntry>): void;
}>();
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col">
    <div
      class="min-h-0 flex-1 overflow-y-auto"
      aria-live="polite"
      data-testid="wt-commits-result"
    >
      <!-- 相位是给 e2e / 读屏的读数，不是给眼睛的 UI：sr-only -->
      <span
        class="sr-only"
        data-testid="wt-commits-phase"
        >{{ commitsState.phase }}</span
      >
      <div
        class="gd-empty py-10 text-xs"
        v-if="commitsState.phase === 'empty'"
      >
        <History
          class="text-[var(--gd-line-num)]"
          :size="28"
        />
        <p>No commits on this branch yet</p>
      </div>
      <ol
        v-else-if="commitsState.phase === 'success'"
        data-testid="wt-commits-list"
      >
        <li
          v-for="entry in commitsState.value.entries"
          :key="entry.commitId"
        >
          <div class="flex items-center">
            <div
              class="gd-row gd-history-row min-w-0 flex-1"
              :aria-current="selectedCommitId === entry.commitId || undefined"
              :class="{ 'gd-row-selected': selectedCommitId === entry.commitId }"
              :data-commit-id="entry.commitId"
              @click="emit('selectEntry', entry)"
              @contextmenu="emit('menuRequest', { target: entry, event: $event })"
              @keydown.enter="emit('selectEntry', entry)"
              data-testid="wt-commit-item"
              role="button"
              tabindex="0"
            >
              <div class="min-w-0 flex-1">
                <div
                  class="min-w-0 truncate text-[13px] font-semibold"
                  :title="entry.message"
                >
                  {{ entry.message.split('\n', 1)[0] }}
                </div>
                <div
                  class="mt-1 flex items-center gap-1.5 text-[11px]"
                  :style="{ color: 'var(--gd-muted)' }"
                >
                  <span
                    class="gd-avatar text-[9px]"
                    :style="{ background: gdAvatarColor(entry.authorId ?? '?'), height: '14px', width: '14px' }"
                  >
                    {{ gdAvatarInitial(entry.authorId ?? '?') }}
                  </span>
                  <span class="min-w-0 truncate">{{ entry.authorId ?? 'No author' }}</span>
                  <span>·</span>
                  <!-- GitHub Desktop 的 TimeAgo：相对时间展示，完整时间戳留在悬停 title -->
                  <span
                    class="min-w-0 truncate"
                    :title="entry.createdAt.toLocaleString()"
                    >{{ gdRelativeTime(entry.createdAt) }}</span
                  >
                  <span
                    class="shrink-0 rounded-full border border-[var(--gd-border)] px-1.5 text-[10px]"
                    v-if="entry.kind === 'baseline' || entry.kind === 'branch_baseline'"
                    >Baseline</span
                  >
                  <span
                    class="shrink-0 rounded-full border border-[var(--gd-border)] px-1.5 text-[10px]"
                    v-if="entry.parentIds.length > 1"
                    >Merge</span
                  >
                </div>
              </div>
            </div>
            <!-- 触屏没有右键：行尾 ⋯ 打开同一菜单（桌面端隐藏） -->
            <button
              class="gd-btn-ghost hidden max-md:inline-flex pointer-coarse:inline-flex"
              @click="onTouchMenu($event, entry)"
              aria-label="更多操作"
              data-testid="wt-commit-more"
              title="更多操作（触屏）"
              type="button"
            >
              <MoreVertical :size="14" />
            </button>
          </div>
        </li>
      </ol>
    </div>
  </div>
</template>
