<script lang="ts" setup>
import { MAIN_BRANCH_ID } from '@aiao/rxdb';
import type { WorkingTreeBranchFromCommitRejection } from '@aiao/rxdb-plugin-working-tree';
import { GitBranch } from '@lucide/vue';
import { computed, nextTick, ref, watch } from 'vue';
import { isImeComposing } from '../utils/ime';
import DialogShell from './DialogShell.vue';

/** 「Create a branch」对话框的状态；页面持有，本组件只做展示与转发。 */
export interface CreateBranchDialogState {
  /** 新分支基于的提交：History 右键点的那一个，或分支下拉 New branch 时当前分支的 HEAD */
  readonly base: {
    readonly commitId: string;
    /** 提交消息的第一行 */
    readonly summary: string;
  };
  /** 从哪打开：`commit` 是 History 的右键，`branch` 是分支下拉的 New branch——两者的说明文字不同 */
  readonly from: 'commit' | 'branch';
  /** 预检：`checking` 还在问，`ok` 能建，否则是建不了的原因 */
  readonly availability: 'checking' | 'ok' | WorkingTreeBranchFromCommitRejection;
}

/** 建不了的三种原因，写给用户看。 */
const UNAVAILABLE_REASONS: Readonly<Record<WorkingTreeBranchFromCommitRejection, (activeBranch: string) => string>> = {
  unreachable_target: activeBranch => `This commit is no longer in the history of ${activeBranch}.`,
  fork_point_unknown: () =>
    "This commit was made before branch points were recorded, so a branch can't be based on it.",
  history_rewritten: () =>
    'Changes in this commit were undone or redone after it was made, so a branch based on it would not match it.'
};

/**
 * 新建分支（GitHub Desktop 的「Create a branch」对话框，`create-branch/create-branch-dialog.tsx`）。
 *
 * @remarks
 * 两个入口共用：History 右键的「Create branch from commit」从那个提交建，分支下拉的「New branch」从当前分支 HEAD 建。
 * 新分支都是干净的，当前分支的未提交改动留在原地（GitHub Desktop 的「Leave my changes」）；建完页面接着切过去，
 * 有改动时弹「Switch branch」。GitHub Desktop 在非默认分支上还让人挑「基于默认分支 / 当前分支」，库里从提交建分支
 * 只认当前分支历史上的提交，这里只给后者。
 *
 * 打开时页面先问一句这个提交建不建得了分支（`checkBranchFromCommit`），建不了就写明原因、Create 置灰，
 * 不让人先填名字再碰壁。外壳见 `DialogShell.vue`。
 */
const props = defineProps<{
  dialog: CreateBranchDialogState | null;
  /** 当前分支 */
  activeBranch: string;
  /** 上一次建分支的报错（名字不可用、已存在）；没有时为 `null` */
  error: string | null;
  /** 建分支进行中：Create 置灰 */
  creating: boolean;
}>();

/** 名字框；页面双向持有，关了再开从空起 */
const name = defineModel<string>('name', { default: '' });

const emit = defineEmits<{
  /** 确认：交出去掉首尾空白的名字 */
  (e: 'confirmRequested', name: string): void;
  (e: 'closeRequested'): void;
}>();

const nameInput = ref<HTMLInputElement | null>(null);

/** 说明文字：基于哪个提交，或基于当前分支（在默认分支上补一句它是默认分支，同 GitHub Desktop） */
const baseText = computed(() => {
  const dialog = props.dialog;
  if (dialog === null) return '';
  if (dialog.from === 'commit') {
    return `Your new branch will be based on the commit '${dialog.base.summary}' (${dialog.base.commitId.slice(0, 7)}) from your repository.`;
  }
  const branch = props.activeBranch;
  const based = `Your new branch will be based on your currently checked out branch (${branch}).`;
  return branch === MAIN_BRANCH_ID ? `${based} ${branch} is the default branch for your repository.` : based;
});

const unavailableReason = computed(() => {
  const availability = props.dialog?.availability;
  if (availability === undefined || availability === 'checking' || availability === 'ok') return null;
  return UNAVAILABLE_REASONS[availability](props.activeBranch);
});

const canCreate = computed(() => props.dialog?.availability === 'ok' && name.value.trim() !== '' && !props.creating);

// 打开那一刻把焦点送进名字框（GitHub Desktop 的对话框自动聚焦第一个输入框）；只看开合，预检回来不再抢焦点。
// 等 nextTick：外壳挂上时先把焦点移进面板，名字框在那之后接过来。
watch(
  () => props.dialog !== null,
  open => {
    if (open) void nextTick(() => nameInput.value?.focus());
  },
  { immediate: true }
);

/** 名字框里的回车提交；组字中的回车是输入法在确认候选词，不提交。 */
function onNameEnter(event: KeyboardEvent): void {
  if (isImeComposing(event)) return;
  event.preventDefault();
  submit();
}

function submit(): void {
  if (!canCreate.value) return;
  emit('confirmRequested', name.value.trim());
}
</script>

<template>
  <DialogShell
    v-if="dialog !== null"
    @close-requested="emit('closeRequested')"
    labelled-by="wt-create-branch-title"
    test-id="wt-create-branch-dialog"
  >
    <div class="mb-4 flex items-center gap-2">
      <GitBranch
        class="text-[var(--gd-accent)]"
        :size="18"
        aria-hidden="true"
      />
      <h2
        class="text-[15px] font-semibold"
        id="wt-create-branch-title"
      >
        Create a branch
      </h2>
    </div>

    <label
      class="mb-1 block text-sm font-medium"
      for="wt-create-branch-name"
    >
      Name
    </label>
    <input
      class="gd-input mb-3 w-full"
      id="wt-create-branch-name"
      ref="nameInput"
      v-model="name"
      @keydown.enter="onNameEnter"
      autocomplete="off"
      data-testid="wt-create-branch-name"
      type="text"
    />

    <p
      class="mb-3 text-sm"
      data-testid="wt-create-branch-base"
    >
      {{ baseText }}
    </p>

    <div aria-live="polite">
      <p
        class="mb-3 text-xs"
        v-if="dialog.availability === 'checking'"
        :style="{ color: 'var(--gd-muted)' }"
        data-testid="wt-create-branch-checking"
      >
        Checking this commit…
      </p>
    </div>
    <p
      class="mb-3 text-sm"
      v-if="unavailableReason !== null"
      :style="{ color: 'var(--gd-del-fg)' }"
      data-testid="wt-create-branch-unavailable"
      role="alert"
    >
      {{ unavailableReason }}
    </p>
    <p
      class="mb-3 text-sm"
      v-if="error !== null"
      :style="{ color: 'var(--gd-del-fg)' }"
      data-testid="wt-create-branch-error"
      role="alert"
    >
      {{ error }}
    </p>

    <div class="flex justify-end gap-2">
      <button
        class="gd-btn-secondary"
        @click="emit('closeRequested')"
        data-testid="wt-create-branch-cancel"
        type="button"
      >
        Cancel
      </button>
      <button
        class="gd-btn-primary"
        :disabled="!canCreate"
        @click="submit"
        data-testid="wt-create-branch-confirm"
        type="button"
      >
        {{ creating ? 'Creating…' : 'Create branch' }}
      </button>
    </div>
  </DialogShell>
</template>
