<script lang="ts" setup>
import type { MergeStrategy } from '@aiao/rxdb';
import { AlertCircle, ChevronRight, GitMerge } from '@lucide/vue';

/** 合并对话框的草稿状态；页面持有，本组件只做展示与转发。 */
export interface MergeDialogState {
  sourceBranchId: string;
  strategy: MergeStrategy;
  deleteSource: boolean;
}

/**
 * 合并对话框（从旧页面整体搬出，行为不变，视觉改为 GitHub Desktop 对话框形态：
 * 白面板圆角描边、标题 15px 半粗、蓝底白字主按钮、白底灰边取消）。
 *
 * @remarks
 * 背板是 `role="button"` + `tabindex="0"` 的 div：点背板或按 Escape 关闭。
 * 不用 `<dialog>` 元素——旧实现的焦点与扫读行为已被 a11y 用例验证过，
 * 换容器形态等于把那条用例的结论作废重验。
 */
defineProps<{
  dialog: MergeDialogState | null;
  activeBranch?: string;
  error: string | null;
}>();

const emit = defineEmits<{
  (e: 'closeRequested'): void;
  (e: 'strategyChange', strategy: MergeStrategy): void;
  (e: 'deleteSourceChange', value: boolean): void;
  (e: 'confirm'): void;
}>();
</script>

<template>
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
    v-if="dialog !== null"
    @click="emit('closeRequested')"
    @keydown.escape="emit('closeRequested')"
    aria-label="Close dialog"
    role="button"
    tabindex="0"
  >
    <div
      class="w-full max-w-md rounded-md border border-[var(--gd-border)] p-5 shadow-2xl"
      :style="{ background: 'var(--gd-panel)' }"
      @click.stop
      @keydown.stop
      aria-modal="true"
      data-testid="wt-merge-dialog"
      role="dialog"
    >
      <div class="mb-4 flex items-center gap-2">
        <GitMerge
          class="text-[var(--gd-accent)]"
          :size="18"
        />
        <h2 class="text-[15px] font-semibold">Merge branch</h2>
      </div>

      <div
        class="mb-4 flex items-center gap-2 rounded border border-[var(--gd-border)] px-3 py-2 text-sm"
        :style="{ background: 'var(--gd-bg)' }"
      >
        <span class="min-w-0 truncate font-mono font-medium text-amber-700">{{ dialog.sourceBranchId }}</span>
        <ChevronRight
          class="shrink-0"
          :size="14"
          :style="{ color: 'var(--gd-muted)' }"
        />
        <span class="min-w-0 truncate font-mono font-medium text-green-700">{{ activeBranch }}</span>
      </div>

      <div class="mb-4">
        <span class="mb-1.5 block text-sm font-medium">Merge strategy</span>
        <div class="flex gap-2">
          <button
            class="flex-1 rounded border px-3 py-2 text-left text-sm transition-colors"
            :style="{
              background: dialog.strategy === 'squash' ? 'var(--gd-selected)' : 'var(--gd-panel)',
              borderColor: dialog.strategy === 'squash' ? 'var(--gd-accent)' : 'var(--gd-border)'
            }"
            @click="emit('strategyChange', 'squash')"
            data-testid="wt-merge-strategy-squash"
            type="button"
          >
            <div class="font-medium">Squash</div>
            <div
              class="mt-0.5 text-xs"
              :style="{ color: 'var(--gd-muted)' }"
            >
              Squash into a minimal change set, filtering ghost operations
            </div>
          </button>
          <button
            class="flex-1 rounded border px-3 py-2 text-left text-sm transition-colors"
            :style="{
              background: dialog.strategy === 'normal' ? 'var(--gd-selected)' : 'var(--gd-panel)',
              borderColor: dialog.strategy === 'normal' ? 'var(--gd-accent)' : 'var(--gd-border)'
            }"
            @click="emit('strategyChange', 'normal')"
            data-testid="wt-merge-strategy-normal"
            type="button"
          >
            <div class="font-medium">Normal</div>
            <div
              class="mt-0.5 text-xs"
              :style="{ color: 'var(--gd-muted)' }"
            >
              Apply each change separately, keeping individual change records
            </div>
          </button>
        </div>
      </div>

      <label class="mb-2 flex cursor-pointer items-center gap-3">
        <input
          class="checkbox checkbox-sm"
          :checked="dialog.deleteSource"
          @change="emit('deleteSourceChange', ($event.target as HTMLInputElement).checked)"
          data-testid="wt-merge-delete-source"
          type="checkbox"
        />
        <span class="text-sm">
          Delete source branch after merging
          <code class="text-xs opacity-70">{{ dialog.sourceBranchId }}</code>
        </span>
      </label>

      <p
        class="mb-4 text-xs"
        :style="{ color: 'var(--gd-muted)' }"
      >
        The result lands in the
        <strong>working tree</strong>
        of
        {{ activeBranch }}
        (like
        <code>git merge --no-commit</code>
        ) and enters history only after a commit.
      </p>

      <div
        class="mb-4 flex items-center gap-2 rounded border border-red-300 p-2 text-sm text-red-700"
        v-if="error !== null"
        data-testid="wt-merge-error"
      >
        <AlertCircle
          class="shrink-0"
          :size="15"
        />
        {{ error }}
      </div>

      <div class="flex justify-end gap-2">
        <button
          class="gd-btn-secondary"
          @click="emit('closeRequested')"
          data-testid="wt-merge-cancel"
          type="button"
        >
          Cancel
        </button>
        <button
          class="gd-btn-primary"
          @click="emit('confirm')"
          data-testid="wt-merge-confirm"
          type="button"
        >
          <GitMerge :size="13" />
          Merge
        </button>
      </div>
    </div>
  </div>
</template>
