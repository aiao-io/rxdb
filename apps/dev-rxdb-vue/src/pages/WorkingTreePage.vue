<script lang="ts" setup>
import type { WorkingTreeCredentials, WorkingTreeQueryState, WorkingTreeStatus } from '@aiao/rxdb-plugin-working-tree';
import { useWorkingTree } from '@aiao/rxdb-plugin-working-tree-vue';
import { Todo } from '@aiao/rxdb-test/entities';
import { onMounted, ref, watch } from 'vue';

const AUTHOR_ID = 'demo-author';

const tree = useWorkingTree();
const message = ref('demo commit');
const title = ref('工作树里的一条 Todo');
const notice = ref<string | null>(null);
const firstVisibleMs = ref<number | null>(null);
const mountedAt = performance.now();

/**
 * 从最近一次成功的 `status()` 取出提交凭据（三个捕获位）。
 *
 * 读不到就返回 `null` 而不是补默认值：三个位里任何一个给默认值，都等于让这次
 * `commit()` 跳过一次并发比较（见 `WorkingTreeCredentials` 的 TSDoc）。
 */
const credentialsOf = (state: WorkingTreeQueryState<WorkingTreeStatus>): WorkingTreeCredentials | null => {
  if (state.phase !== 'success' && state.phase !== 'empty') return null;
  return {
    expectedBranch: { branchId: state.value.branchId, activationRevision: state.value.activationRevision },
    expectedHeadRevision: state.value.headRevision,
    expectedWorkingTreeRevision: state.value.workingTreeRevision
  };
};

// 面板挂载后主动读一次状态：入口自己不发 IO（见它的 TSDoc），而一个开着却说不出
// 「现在脏不脏」的面板，正是 SC-005 要防的那种「核心很快、UI 没反应」。
onMounted(() => {
  void tree.isEnabled().catch(() => undefined);
  void tree.status().catch(() => undefined);
});

watch(
  () => tree.statusState.value.phase,
  phase => {
    if (firstVisibleMs.value !== null) return;
    if (phase === 'idle' || phase === 'loading') return;
    firstVisibleMs.value = Math.round(performance.now() - mountedAt);
  }
);

const runCommit = async (): Promise<void> => {
  const credentials = credentialsOf(tree.statusState.value);
  if (credentials === null) {
    notice.value = '还没有读到一份 status，提交凭据无从谈起——先刷新状态。';
    return;
  }
  notice.value = null;
  await tree
    .commit(message.value, { ...credentials, authorId: AUTHOR_ID, operationId: crypto.randomUUID() })
    .catch(() => undefined);
  await tree.status().catch(() => undefined);
};

const runDiscard = async (): Promise<void> => {
  const credentials = credentialsOf(tree.statusState.value);
  if (credentials === null) {
    notice.value = '还没有读到一份 status，丢弃凭据无从谈起——先刷新状态。';
    return;
  }
  notice.value = null;
  await tree.discard(credentials).catch(() => undefined);
};

const writeTodo = async (): Promise<void> => {
  const todo = new Todo();
  todo.title = title.value;
  await todo.save();
  await tree.status().catch(() => undefined);
};

// `enable()` 自己会重读一次 status，但**不会**重读 isEnabled ——
// 不补这一句，成功启用之后「提交能力」那行仍然写着「未启用」。
const runEnable = async (): Promise<void> => {
  await tree.enable().catch(() => undefined);
  await tree.isEnabled().catch(() => undefined);
};
</script>

<template>
  <div
    class="container mx-auto max-w-3xl space-y-6 p-6"
    data-testid="working-tree-page"
  >
    <h1 class="text-2xl font-bold">工作树与提交历史</h1>
    <p class="text-sm">
      <strong>启用是数据库级的一次性开关</strong>：一次 <code>enable()</code> 之后整个库都按工作树语义运行，v1 没有
      <code>disable()</code>。
    </p>
    <p data-testid="wt-first-visible">
      首次可见状态耗时：<span data-testid="wt-first-visible-ms">{{ firstVisibleMs ?? '' }}</span> ms
    </p>

    <div
      class="alert alert-warning alert-soft"
      v-if="notice !== null"
      data-testid="wt-notice"
      role="alert"
    >
      <span>{{ notice }}</span>
    </div>

    <section
      class="space-y-2"
      aria-labelledby="wt-enable-heading"
    >
      <h2
        class="text-lg font-semibold"
        id="wt-enable-heading"
        >提交能力</h2
      >
      <p
        aria-live="polite"
        data-testid="wt-enabled"
        role="status"
      >
        <template v-if="tree.isEnabledState.value.phase === 'success'">
          {{ tree.isEnabledState.value.value ? '已启用' : '未启用' }}
        </template>
        <template v-else>{{ tree.isEnabledState.value.phase }}</template>
      </p>
      <button
        class="btn btn-primary"
        @click="runEnable"
        data-testid="wt-enable"
        >启用提交能力</button
      >
    </section>

    <section
      class="space-y-2"
      aria-labelledby="wt-status-heading"
    >
      <h2
        class="text-lg font-semibold"
        id="wt-status-heading"
        >工作树状态</h2
      >
      <div
        aria-live="polite"
        data-testid="wt-status"
        role="status"
      >
        <span data-testid="wt-status-phase">{{ tree.statusState.value.phase }}</span>
        <span v-if="tree.statusState.value.phase === 'success' || tree.statusState.value.phase === 'empty'">
          · 分支 <span data-testid="wt-status-branch">{{ tree.statusState.value.value.branchId }}</span> · 未提交
          <span data-testid="wt-status-entry-count">{{ tree.statusState.value.value.entryCount }}</span> 条 ·
          <span data-testid="wt-status-clean">{{ tree.statusState.value.value.clean ? '干净' : '有未提交改动' }}</span>
          · 远端同步来源
          <span data-testid="wt-status-remote-sync">{{ tree.statusState.value.value.byOrigin.remote_sync }}</span> 条
        </span>
      </div>
      <button
        class="btn"
        @click="tree.status().catch(() => undefined)"
        data-testid="wt-refresh-status"
        >刷新状态</button
      >
    </section>

    <section
      class="space-y-2"
      aria-labelledby="wt-write-heading"
    >
      <h2
        class="text-lg font-semibold"
        id="wt-write-heading"
        >制造一条未提交变更</h2
      >
      <label
        class="block"
        for="wt-todo-title"
        >Todo 标题</label
      >
      <input
        class="input input-bordered w-full"
        id="wt-todo-title"
        v-model="title"
        data-testid="wt-todo-title"
      />
      <button
        class="btn"
        @click="writeTodo"
        data-testid="wt-write-todo"
        >写入一条 Todo</button
      >
    </section>

    <section
      class="space-y-2"
      aria-labelledby="wt-diff-heading"
    >
      <h2
        class="text-lg font-semibold"
        id="wt-diff-heading"
        >未提交改动</h2
      >
      <button
        class="btn"
        @click="tree.diff().catch(() => undefined)"
        data-testid="wt-diff"
        >读取未提交改动</button
      >
      <div
        aria-live="polite"
        data-testid="wt-diff-result"
      >
        <span data-testid="wt-diff-phase">{{ tree.diffState.value.phase }}</span>
        <span v-if="tree.diffState.value.phase === 'empty'"> · 没有未提交的改动</span>
        <ul v-else-if="tree.diffState.value.phase === 'success'">
          <li
            v-for="entry in tree.diffState.value.value.entries"
            :key="entry.unitId"
          >
            {{ entry.entity }} · {{ entry.operation }} · {{ entry.origin }}
          </li>
        </ul>
      </div>
    </section>

    <section
      class="space-y-2"
      aria-labelledby="wt-commit-heading"
    >
      <h2
        class="text-lg font-semibold"
        id="wt-commit-heading"
        >提交与丢弃</h2
      >
      <label
        class="block"
        for="wt-commit-message"
        >提交信息</label
      >
      <input
        class="input input-bordered w-full"
        id="wt-commit-message"
        v-model="message"
        data-testid="wt-commit-message"
      />
      <div class="flex gap-2">
        <button
          class="btn btn-primary"
          @click="runCommit"
          data-testid="wt-commit"
          >提交全部未提交改动</button
        >
        <button
          class="btn"
          @click="runDiscard"
          data-testid="wt-discard"
          >丢弃全部未提交改动</button
        >
      </div>
      <div
        aria-live="polite"
        data-testid="wt-commit-result"
        role="status"
      >
        <span data-testid="wt-commit-phase">{{ tree.commitState.value.phase }}</span>
        <span
          v-if="tree.commitState.value.phase === 'success'"
          data-testid="wt-commit-outcome"
        >
          {{ tree.commitState.value.value.ok ? ' · 已提交' : ' · 并发冲突，可重试' }}
        </span>
        <span
          v-else-if="tree.commitState.value.phase === 'error'"
          data-testid="wt-commit-error"
        >
          · {{ tree.commitState.value.error.message }}
        </span>
      </div>
    </section>

    <section
      class="space-y-2"
      aria-labelledby="wt-commits-heading"
    >
      <h2
        class="text-lg font-semibold"
        id="wt-commits-heading"
        >提交历史</h2
      >
      <button
        class="btn"
        @click="tree.listCommits().catch(() => undefined)"
        data-testid="wt-list-commits"
      >
        读取提交历史
      </button>
      <div
        aria-live="polite"
        data-testid="wt-commits-result"
      >
        <span data-testid="wt-commits-phase">{{ tree.listCommitsState.value.phase }}</span>
        <span v-if="tree.listCommitsState.value.phase === 'empty'"> · 这条分支还没有提交</span>
        <ol
          v-else-if="tree.listCommitsState.value.phase === 'success'"
          data-testid="wt-commits-list"
        >
          <li
            v-for="entry in tree.listCommitsState.value.value.entries"
            :key="entry.commitId"
          >
            {{ entry.message }} · {{ entry.changeSetCount }} 个单元
          </li>
        </ol>
      </div>
    </section>
  </div>
</template>
