import type { WorkingTreeCredentials, WorkingTreeQueryState, WorkingTreeStatus } from '@aiao/rxdb-plugin-working-tree';
import { useWorkingTree } from '@aiao/rxdb-plugin-working-tree-react';
import { Todo } from '@aiao/rxdb-test/entities';
import { useCallback, useEffect, useRef, useState } from 'react';

const AUTHOR_ID = 'demo-author';

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

export default function WorkingTreePage(): React.JSX.Element {
  const tree = useWorkingTree();
  const [message, setMessage] = useState('demo commit');
  const [title, setTitle] = useState('工作树里的一条 Todo');
  const [notice, setNotice] = useState<string | null>(null);
  const [firstVisibleMs, setFirstVisibleMs] = useState<number | null>(null);
  // 起点在挂载副作用里取，不在渲染里取：`performance.now()` 是不纯的，
  // 渲染期间调用会随着组件重渲染而漂（react-hooks/purity）。
  const mountedAt = useRef(0);

  // 面板挂载后主动读一次状态：hook 自己不发 IO（见它的 TSDoc），而一个开着却说不出
  // 「现在脏不脏」的面板，正是 SC-005 要防的那种「核心很快、UI 没反应」。
  useEffect(() => {
    mountedAt.current = performance.now();
    void tree.isEnabled().catch(() => undefined);
    void tree.status().catch(() => undefined);
    // 入口对象每次 render 都是新的；这一轮只想在挂载时跑一次。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const statusPhase = tree.statusState.phase;
  useEffect(() => {
    if (firstVisibleMs !== null) return;
    if (statusPhase === 'idle' || statusPhase === 'loading') return;
    setFirstVisibleMs(Math.round(performance.now() - mountedAt.current));
  }, [statusPhase, firstVisibleMs]);

  // `enable()` 自己会重读一次 status，但**不会**重读 isEnabled ——
  // 不补这一句，成功启用之后「提交能力」那行仍然写着「未启用」。
  const runEnable = useCallback(async () => {
    await tree.enable().catch(() => undefined);
    await tree.isEnabled().catch(() => undefined);
  }, [tree]);

  const runCommit = useCallback(async () => {
    const credentials = credentialsOf(tree.statusState);
    if (credentials === null) {
      setNotice('还没有读到一份 status，提交凭据无从谈起——先刷新状态。');
      return;
    }
    setNotice(null);
    await tree
      .commit(message, { ...credentials, authorId: AUTHOR_ID, operationId: crypto.randomUUID() })
      .catch(() => undefined);
    await tree.status().catch(() => undefined);
  }, [tree, message]);

  const runDiscard = useCallback(async () => {
    const credentials = credentialsOf(tree.statusState);
    if (credentials === null) {
      setNotice('还没有读到一份 status，丢弃凭据无从谈起——先刷新状态。');
      return;
    }
    setNotice(null);
    await tree.discard(credentials).catch(() => undefined);
  }, [tree]);

  const writeTodo = useCallback(async () => {
    const todo = new Todo();
    todo.title = title;
    await todo.save();
    await tree.status().catch(() => undefined);
  }, [title, tree]);

  const status = tree.statusState;
  const diff = tree.diffState;
  const commits = tree.listCommitsState;

  return (
    <div className='container mx-auto max-w-3xl space-y-6 p-6' data-testid='working-tree-page'>
      <h1 className='text-2xl font-bold'>工作树与提交历史</h1>
      <p className='text-sm'>
        <strong>启用是数据库级的一次性开关</strong>：一次 <code>enable()</code> 之后整个库都按工作树语义运行， v1 没有{' '}
        <code>disable()</code>。
      </p>
      <p data-testid='wt-first-visible'>
        首次可见状态耗时：<span data-testid='wt-first-visible-ms'>{firstVisibleMs ?? ''}</span> ms
      </p>

      {notice !== null && (
        <div role='alert' className='alert alert-warning alert-soft' data-testid='wt-notice'>
          <span>{notice}</span>
        </div>
      )}

      <section aria-labelledby='wt-enable-heading' className='space-y-2'>
        <h2 className='text-lg font-semibold' id='wt-enable-heading'>
          提交能力
        </h2>
        <p data-testid='wt-enabled' role='status' aria-live='polite'>
          {tree.isEnabledState.phase === 'success' ?
            tree.isEnabledState.value ?
              '已启用'
            : '未启用'
          : tree.isEnabledState.phase}
        </p>
        <button className='btn btn-primary' data-testid='wt-enable' onClick={() => void runEnable()}>
          启用提交能力
        </button>
      </section>

      <section aria-labelledby='wt-status-heading' className='space-y-2'>
        <h2 className='text-lg font-semibold' id='wt-status-heading'>
          工作树状态
        </h2>
        <div data-testid='wt-status' role='status' aria-live='polite'>
          <span data-testid='wt-status-phase'>{status.phase}</span>
          {(status.phase === 'success' || status.phase === 'empty') && (
            <span>
              {' · 分支 '}
              <span data-testid='wt-status-branch'>{status.value.branchId}</span>
              {' · 未提交 '}
              <span data-testid='wt-status-entry-count'>{status.value.entryCount}</span>
              {' 条 · '}
              <span data-testid='wt-status-clean'>{status.value.clean ? '干净' : '有未提交改动'}</span>
              {' · 远端同步来源 '}
              <span data-testid='wt-status-remote-sync'>{status.value.byOrigin.remote_sync}</span>
              {' 条'}
            </span>
          )}
        </div>
        <button
          className='btn'
          data-testid='wt-refresh-status'
          onClick={() => void tree.status().catch(() => undefined)}
        >
          刷新状态
        </button>
      </section>

      <section aria-labelledby='wt-write-heading' className='space-y-2'>
        <h2 className='text-lg font-semibold' id='wt-write-heading'>
          制造一条未提交变更
        </h2>
        <label className='block' htmlFor='wt-todo-title'>
          Todo 标题
        </label>
        <input
          className='input input-bordered w-full'
          data-testid='wt-todo-title'
          id='wt-todo-title'
          onChange={event => setTitle(event.target.value)}
          value={title}
        />
        <button className='btn' data-testid='wt-write-todo' onClick={() => void writeTodo()}>
          写入一条 Todo
        </button>
      </section>

      <section aria-labelledby='wt-diff-heading' className='space-y-2'>
        <h2 className='text-lg font-semibold' id='wt-diff-heading'>
          未提交改动
        </h2>
        <button className='btn' data-testid='wt-diff' onClick={() => void tree.diff().catch(() => undefined)}>
          读取未提交改动
        </button>
        <div aria-live='polite' data-testid='wt-diff-result'>
          <span data-testid='wt-diff-phase'>{diff.phase}</span>
          {diff.phase === 'empty' && <span> · 没有未提交的改动</span>}
          {diff.phase === 'success' && (
            <ul>
              {diff.value.entries.map(entry => (
                <li key={entry.unitId}>
                  {entry.entity} · {entry.operation} · {entry.origin}
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section aria-labelledby='wt-commit-heading' className='space-y-2'>
        <h2 className='text-lg font-semibold' id='wt-commit-heading'>
          提交与丢弃
        </h2>
        <label className='block' htmlFor='wt-commit-message'>
          提交信息
        </label>
        <input
          className='input input-bordered w-full'
          data-testid='wt-commit-message'
          id='wt-commit-message'
          onChange={event => setMessage(event.target.value)}
          value={message}
        />
        <div className='flex gap-2'>
          <button className='btn btn-primary' data-testid='wt-commit' onClick={() => void runCommit()}>
            提交全部未提交改动
          </button>
          <button className='btn' data-testid='wt-discard' onClick={() => void runDiscard()}>
            丢弃全部未提交改动
          </button>
        </div>
        <div aria-live='polite' data-testid='wt-commit-result' role='status'>
          <span data-testid='wt-commit-phase'>{tree.commitState.phase}</span>
          {tree.commitState.phase === 'success' && (
            <span data-testid='wt-commit-outcome'>
              {tree.commitState.value.ok ? ' · 已提交' : ' · 并发冲突，可重试'}
            </span>
          )}
          {tree.commitState.phase === 'error' && (
            <span data-testid='wt-commit-error'> · {tree.commitState.error.message}</span>
          )}
        </div>
      </section>

      <section aria-labelledby='wt-commits-heading' className='space-y-2'>
        <h2 className='text-lg font-semibold' id='wt-commits-heading'>
          提交历史
        </h2>
        <button
          className='btn'
          data-testid='wt-list-commits'
          onClick={() => void tree.listCommits().catch(() => undefined)}
        >
          读取提交历史
        </button>
        <div aria-live='polite' data-testid='wt-commits-result'>
          <span data-testid='wt-commits-phase'>{commits.phase}</span>
          {commits.phase === 'empty' && <span> · 这条分支还没有提交</span>}
          {commits.phase === 'success' && (
            <ol data-testid='wt-commits-list'>
              {commits.value.entries.map(entry => (
                <li key={entry.commitId}>
                  {entry.message} · {entry.changeSetCount} 个单元
                </li>
              ))}
            </ol>
          )}
        </div>
      </section>
    </div>
  );
}
