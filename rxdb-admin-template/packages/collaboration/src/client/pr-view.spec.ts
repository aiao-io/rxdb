import { Window } from 'happy-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Audit, Candidate, CommitContent, PullRequestDetail, Records, Thread } from '../model.js';
import { assetSchema } from '../schema.testing.js';
import type { CollaborationController } from './controller.js';
import type { Perform } from './elements.js';
import { PullRequestView } from './pr-view.js';
const records = (name: string): Records => ({ c: { entity: 'AssetCategory', fields: { name } } });
/** 任务提交：唯一的父；`root` 是共享分支根（空分支时的共同起点）。 */
const commit = (id: string, parent: string, name: string): CommitContent => ({
  id,
  parentIds: [parent],
  kind: 'normal',
  authorId: 'u1',
  message: id,
  createdAt: '2026-11-18T00:00:00.000Z',
  changes: [],
  records: records(name)
});
const metadata = ({ id, parentIds, kind, authorId, message, createdAt }: CommitContent) => ({
  id,
  parentIds,
  kind,
  authorId,
  message,
  createdAt
});
const flush = () => new Promise<void>(resolve => setTimeout(resolve, 0));
beforeEach(() => {
  const window = new Window();
  vi.stubGlobal('document', window.document);
  vi.stubGlobal('Event', window.Event);
});
afterEach(() => {
  vi.unstubAllGlobals();
});
const candidateSummary = {
  id: 'cand',
  prId: 'pr',
  base: 'base',
  source: 'source',
  target: 'target',
  schemaVersion: 1,
  policyVersion: 1,
  resolutions: [],
  conflicts: [],
  checks: [],
  actorId: 'u1',
  at: 1
};
const thread: Thread = {
  id: 'thread',
  prId: 'pr',
  candidateId: 'cand',
  recordId: 'c',
  field: 'name',
  required: false,
  resolved: false,
  resolvedCandidateId: null,
  revision: 0,
  comments: [{ id: 'comment', authorId: 'u1', body: 'Check the name', deleted: false, revision: 0, at: 1 }]
};
const event: Audit = { id: 'event', actorId: 'u1', action: 'reply', operationId: 'op', at: 1, details: {} };

/**
 * 起点、来源、目标对同一字段各改一次，预览里恰有一个字段冲突 c/name。
 * 内容由 `store` 提供：没放进去的就是「尚未加载」，控制器的同步读取此时返回 undefined。
 */
function setup(options: { candidate?: boolean; base?: string | null; target?: string | null } = {}) {
  // null 表示空分支：共享分支根
  const base = options.base === undefined ? 'base' : (options.base ?? 'root');
  const target = options.target === undefined ? 'target' : (options.target ?? 'root');
  const failures: unknown[] = [];
  const run = vi.fn().mockResolvedValue({});
  const requested: string[] = [];
  const branches: unknown[] = [];
  const calls: string[] = [];
  const store = {
    // 分页接口按从新到旧返回 PR 来源任务在起点之后的提交
    history: { commits: [metadata(commit('source', 'base', 'Source'))], hasEarlier: false } as
      { commits: ReturnType<typeof metadata>[]; hasEarlier: boolean } | undefined,
    commits: {} as Record<string, CommitContent>,
    candidates: {} as Record<string, Candidate>,
    shared: undefined as Records | undefined,
    threads: {} as Record<string, Audit[]>,
    detail: {
      prId: 'pr',
      candidates: options.candidate ? { cand: { ...candidateSummary, base, target } } : {},
      reviews: [],
      threads: [thread],
      governance: { prId: 'pr', blockers: [], stages: [] }
    } as PullRequestDetail | undefined
  };
  const open = new Set<string>();
  const reveal = vi.fn();
  const controller = {
    user: { id: 'u1', email: 'u1@example.test', verified: true },
    draft: null,
    run,
    commitContent: (id: string) => {
      requested.push(`commit:${id}`);
      return store.commits[id];
    },
    candidateContent: (id: string) => {
      requested.push(`candidate:${id}`);
      return store.candidates[id];
    },
    schema: () => assetSchema,
    sharedRecords: () => {
      requested.push('shared');
      return store.shared;
    },
    threadEvents: (id: string) => {
      requested.push(`thread:${id}`);
      return store.threads[id];
    },
    commitHistory: (branch: unknown) => {
      branches.push(branch);
      return store.history;
    },
    loadEarlierCommits: vi.fn(async (branch: unknown) => {
      calls.push(`earlier-commits:${JSON.stringify(branch)}`);
    }),
    loadEarlierPrs: vi.fn(async () => {
      calls.push('earlier-prs');
    }),
    snapshot: {
      head: target,
      root: 'root',
      policy: { version: 1, stages: [] },
      schemaVersion: 1,
      members: [
        { id: 'u1', email: 'u1@example.test', permissions: ['read', 'edit', 'merge', 'comment'], generation: 1 }
      ],
      tasks: [{ id: 't', name: 'Task', ownerId: 'u1', base, head: 'source', originTaskId: null }],
      prs: [
        {
          id: 'pr',
          taskId: 't',
          authorId: 'u1',
          title: 'Rename',
          description: '',
          target: 'shared',
          status: 'review',
          revision: 3,
          candidateId: options.candidate ? 'cand' : null,
          subscribers: []
        }
      ],
      earlier: { prs: false, tasks: false, notices: false }
    },
    // 候选、审核与讨论是 PR 详情，按 PR 读取（ADMIN-US-219）
    prDetail: (prId: string) => {
      requested.push(`detail:${prId}`);
      return store.detail;
    }
  } as unknown as CollaborationController;
  const perform: Perform = async work => {
    try {
      await work();
    } catch (error) {
      failures.push(error);
    }
  };
  const view = new PullRequestView(controller, perform, () => undefined, {
    isOpen: key => open.has(key),
    reveal
  });
  view.selected = 'pr';
  const draw = () => view.view();
  const buttons = (root: Element, name: string) =>
    [...root.querySelectorAll('button')].filter(node => node.textContent === name);
  const loadAll = () => {
    store.commits = {
      base: commit('base', 'root', 'Base'),
      source: commit('source', 'base', 'Source'),
      target: commit('target', 'base', 'Target')
    };
    store.shared = records('Target');
    store.candidates = { cand: { ...candidateSummary, base, target, records: records('Final') } };
  };
  return { view, draw, run, failures, requested, branches, calls, store, open, reveal, buttons, loadAll };
}
const details = (root: Element, disclosure: string) =>
  [...root.querySelectorAll('details')].find(node => node.dataset['disclosureKey'] === disclosure)!;
/** 「数据变更」页签里最终候选的内容区（差异表、记录定位与完整数据）。 */
const content = (root: Element) => root.querySelector<HTMLElement>('[data-candidate]')!;
/** 记录定位的下拉：候选内容到齐之前不出现。 */
const picker = (root: Element) => root.querySelector<HTMLSelectElement>('select[aria-label="查看记录"]');
const candidate = (resolutions: unknown[]) => ({
  type: 'candidate',
  prId: 'pr',
  expectedRevision: 3,
  resolutions
});

describe('三方合并预览的冲突处理', () => {
  function previewWithConflict() {
    const setupValue = setup();
    setupValue.loadAll();
    const root = setupValue.draw();
    const control = <T extends Element>(selector: string) => root.querySelector<T>(selector)!;
    return {
      ...setupValue,
      choice: control<HTMLSelectElement>('select[aria-label="冲突处理"]'),
      custom: control<HTMLInputElement>('input[aria-label="自定义结果（JSON 值）"]'),
      submit: setupValue.buttons(root, '生成合并候选并检查')[0]
    };
  }
  it('未处理的冲突不产生选择；采用来源与自定义值按所选方式提交', async () => {
    const { run, failures, choice, custom, submit } = previewWithConflict();
    submit.click();
    await flush();
    expect(run).toHaveBeenLastCalledWith(candidate([]));
    choice.value = 'source';
    submit.click();
    await flush();
    expect(run).toHaveBeenLastCalledWith(candidate([{ key: 'c/name', choice: 'source' }]));
    choice.value = 'custom';
    custom.value = '"Renamed"';
    submit.click();
    await flush();
    expect(run).toHaveBeenLastCalledWith(candidate([{ key: 'c/name', choice: 'custom', value: 'Renamed' }]));
    expect(failures).toEqual([]);
  });

  it('自定义值不是合法 JSON 时，错误进入统一的执行路径显示，且不发出请求', async () => {
    const { run, failures, choice, custom, submit } = previewWithConflict();
    choice.value = 'custom';
    custom.value = '{oops';
    submit.click();
    await flush();
    expect(run).not.toHaveBeenCalled();
    expect(failures).toEqual([expect.objectContaining({ code: 'invalid', message: 'JSON 格式错误' })]);
    custom.value = '';
    submit.click();
    await flush();
    expect(run).not.toHaveBeenCalled();
    expect(failures).toHaveLength(2);
    expect(failures[1]).toMatchObject({ code: 'invalid', message: '自定义冲突值不能为空' });
  });
});

describe('合并预览等内容加载完成再显示', () => {
  it('起点、来源与共享数据都到齐之前只显示占位，三份内容在第一次绘制时就一起发起加载', () => {
    const { draw, store, requested, buttons } = setup();
    let root = draw();
    expect(requested).toEqual(expect.arrayContaining(['commit:base', 'commit:source', 'shared']));
    expect(root.querySelector('[data-loading]')).not.toBeNull();
    expect(root.textContent).toContain('正在加载…');
    expect(buttons(root, '生成合并候选并检查')).toHaveLength(0);
    store.commits['base'] = commit('base', 'root', 'Base');
    store.commits['source'] = commit('source', 'base', 'Source');
    root = draw();
    expect(buttons(root, '生成合并候选并检查')).toHaveLength(0);
    store.shared = records('Target');
    root = draw();
    expect(buttons(root, '生成合并候选并检查')).toHaveLength(1);
    expect(root.querySelector('select[aria-label="冲突处理"]')).not.toBeNull();
  });
  it('尚无最终候选时，来源提交变化先显示占位，两个提交都加载后才画出差异表', () => {
    const { draw, store } = setup();
    expect(draw().querySelectorAll('table')).toHaveLength(0);
    store.commits['base'] = commit('base', 'root', 'Base');
    store.commits['source'] = commit('source', 'base', 'Source');
    store.shared = records('Target');
    const root = draw();
    expect(root.textContent).toContain('来源提交变化（尚未形成最终候选）');
    expect(root.querySelectorAll('table')).toHaveLength(1);
    expect(root.querySelector('table')?.textContent).toContain('Source');
  });
  it('起点是空分支（没有任何提交）时不请求起点内容，直接按空记录比较', () => {
    const { draw, store, requested } = setup({ base: null });
    store.commits['source'] = commit('source', 'root', 'Source');
    const root = draw();
    expect([...new Set(requested.filter(entry => entry.startsWith('commit:')))]).toEqual(['commit:source']);
    expect(root.querySelectorAll('table')).toHaveLength(1);
    expect(root.querySelector('table')?.textContent).toContain('新增');
  });
});

describe('提交历史按展开按需渲染', () => {
  const key = 'source-commit:source';
  it('折叠时只放摘要与父提交，不请求也不渲染记录表', () => {
    const { draw, view, requested, reveal } = setup();
    view.tab = 'commits';
    const root = draw();
    const item = details(root, key);
    // 摘要：提交消息、作者（成员邮箱）与短 ID
    expect(item.dataset['commitId']).toBe('source');
    expect(item.querySelector('summary')?.textContent).toContain('u1@example.test');
    expect(item.querySelector('summary code')?.textContent).toBe('source');
    expect(item.textContent).toContain('父提交：base');
    expect(item.querySelector('table')).toBeNull();
    expect(item.querySelector('[data-loading]')).toBeNull();
    expect(requested.filter(entry => entry.startsWith('commit:'))).toEqual([]);
    expect(reveal).not.toHaveBeenCalled();
  });
  it('用户首次展开时通知重绘；已经展开或重复触发不会再通知', () => {
    const { draw, view, reveal } = setup();
    view.tab = 'commits';
    const item = details(draw(), key);
    item.open = true;
    item.dispatchEvent(new Event('toggle'));
    item.dispatchEvent(new Event('toggle'));
    expect(reveal).toHaveBeenCalledTimes(1);
    const closed = details(draw(), key);
    closed.open = false;
    closed.dispatchEvent(new Event('toggle'));
    expect(reveal).toHaveBeenCalledTimes(1);
  });
  it('恢复为展开的提交立即发起加载并先显示占位，加载后渲染记录表；不为未展开的提交请求内容', () => {
    const { draw, view, open, requested, store } = setup();
    view.tab = 'commits';
    open.add(key);
    let item = details(draw(), key);
    expect(item.querySelector('[data-loading]')).not.toBeNull();
    expect(item.querySelector('table')).toBeNull();
    expect(requested.filter(entry => entry.startsWith('commit:'))).toEqual(['commit:source']);
    store.commits['source'] = commit('source', 'base', 'Source');
    item = details(draw(), key);
    expect(item.querySelector('[data-loading]')).toBeNull();
    expect(item.querySelector('table')?.textContent).toContain('Source');
    const reveal = vi.fn();
    item.addEventListener('toggle', reveal);
    expect(reveal).not.toHaveBeenCalled();
  });
  it('提交页签按 PR 分页读取来源任务的提交，从新到旧列出', () => {
    const { draw, view, store, branches } = setup();
    view.tab = 'commits';
    store.history = {
      commits: [metadata(commit('second', 'source', 'Second')), metadata(commit('source', 'base', 'Source'))],
      hasEarlier: false
    };
    const keys = [...draw().querySelectorAll('details')]
      .map(node => node.dataset['disclosureKey'])
      .filter(key => key?.startsWith('source-commit:'));
    expect(keys).toEqual(['source-commit:second', 'source-commit:source']);
    expect(branches).toContainEqual({ prId: 'pr' });
    expect(branches.every(branch => JSON.stringify(branch) === '{"prId":"pr"}')).toBe(true);
  });
  it('提交还没读到时显示占位，历史候选照常显示', () => {
    const { draw, view, store } = setup();
    view.tab = 'commits';
    store.history = undefined;
    const root = draw();
    const panel = root.querySelector('#pr-panel')!;
    expect(panel.querySelector('[data-loading]')).not.toBeNull();
    expect(panel.querySelector('details[data-disclosure-key^="source-commit:"]')).toBeNull();
    expect(details(root, 'candidate-history:pr')).toBeDefined();
  });
  it('有更早的提交时在提交列表末尾提供「加载更早的提交」，点击读取下一页', async () => {
    const { draw, view, store, buttons, calls } = setup();
    view.tab = 'commits';
    store.history = { ...store.history!, hasEarlier: true };
    const root = draw();
    const [load] = buttons(root, '加载更早的提交');
    expect(load).toBeDefined();
    expect(load.previousElementSibling?.lastElementChild).toBe(details(root, 'source-commit:source'));
    expect(load.nextElementSibling).toBe(details(root, 'candidate-history:pr'));
    load.click();
    await flush();
    expect(calls).toEqual(['earlier-commits:{"prId":"pr"}']);
    store.history = { ...store.history!, hasEarlier: false };
    expect(buttons(draw(), '加载更早的提交')).toHaveLength(0);
  });
  it('历史候选折叠时不生成子项；展开后每个候选按各自的展开状态加载内容', () => {
    const { draw, view, open, requested, store, loadAll } = setup({ candidate: true });
    view.tab = 'commits';
    const closed = draw();
    expect(details(closed, 'candidate-history:pr').querySelectorAll('details')).toHaveLength(0);
    open.add('candidate-history:pr');
    let root = draw();
    const item = details(root, 'candidate:cand');
    expect(item.querySelector('summary')?.textContent).toBe('cand · 策略 v1');
    expect(item.querySelector('table')).toBeNull();
    expect(requested.filter(entry => entry.startsWith('candidate:'))).toEqual([]);
    open.add('candidate:cand');
    root = draw();
    expect(details(root, 'candidate:cand').querySelector('[data-loading]')).not.toBeNull();
    expect(requested).toContain('candidate:cand');
    loadAll();
    root = draw();
    expect(details(root, 'candidate:cand').querySelector('table')?.textContent).toContain('Final');
    expect(store.candidates['cand']).toBeDefined();
  });
});

describe('最终候选与讨论的按需内容', () => {
  it('候选的摘要信息与合并按钮立即显示；差异表与记录导航等内容加载后才出现', () => {
    const { draw, store, buttons, requested } = setup({ candidate: true });
    let root = draw();
    expect(root.textContent).toContain('候选 cand · 策略 v1 · 当前版本');
    expect(root.textContent).toContain('未解决冲突：0 · 检查错误：0');
    expect(buttons(root, '合并到共享数据')).toHaveLength(1);
    expect(requested).toEqual(expect.arrayContaining(['candidate:cand', 'commit:target']));
    expect(content(root).querySelector('[data-loading]')).not.toBeNull();
    expect(picker(root)).toBeNull();
    store.candidates['cand'] = { ...candidateSummary, records: records('Final') };
    root = draw();
    expect(content(root).querySelector('[data-loading]')).not.toBeNull();
    store.commits['target'] = commit('target', 'base', 'Target');
    root = draw();
    expect(content(root).querySelector('[data-loading]')).toBeNull();
    expect([...picker(root)!.options].map(option => option.value)).toEqual(['', 'c']);
    const diff = [...root.querySelectorAll('table')].find(table => table.textContent?.includes('合并前'))!;
    expect(diff.textContent).toContain('Target');
    expect(diff.textContent).toContain('Final');
  });
  it('检查页同样先显示检查结果，再等内容加载出记录导航', () => {
    const { draw, view, store } = setup({ candidate: true });
    view.tab = 'checks';
    let root = draw();
    expect(root.textContent).toContain('未解决冲突：0 · 检查错误：0');
    expect(root.textContent).toContain('检查全部通过');
    expect(picker(root)).toBeNull();
    store.candidates['cand'] = { ...candidateSummary, records: records('Final') };
    store.commits['target'] = commit('target', 'base', 'Target');
    root = draw();
    expect(picker(root)).not.toBeNull();
  });
  it('候选的目标是空分支时不请求目标提交，候选内容到齐即渲染', () => {
    const { draw, store, requested, buttons } = setup({ candidate: true, target: null });
    let root = draw();
    expect(requested).toContain('candidate:cand');
    expect(requested).not.toContain('commit:target');
    expect(requested).not.toContain('commit:root');
    expect(content(root).querySelector('[data-loading]')).not.toBeNull();
    store.candidates['cand'] = { ...candidateSummary, target: 'root', records: records('Final') };
    root = draw();
    expect(content(root).querySelector('[data-loading]')).toBeNull();
    expect(picker(root)).not.toBeNull();
    expect(buttons(root, '合并到共享数据')).toHaveLength(1);
  });
  it('「查看最终完整数据」只在展开后渲染记录表', () => {
    const { draw, open, store, loadAll } = setup({ candidate: true });
    loadAll();
    const key = 'candidate-records:cand';
    expect(details(draw(), key).querySelector('table')).toBeNull();
    open.add(key);
    expect(details(draw(), key).querySelector('table')?.textContent).toContain('Final');
    store.candidates = {};
    expect(details(draw(), key).querySelector('[data-loading]')).not.toBeNull();
  });
  it('评论锚定版本与讨论处理历史折叠时不请求，展开后先占位、到齐后渲染', () => {
    const { draw, view, open, requested, store } = setup({ candidate: true });
    view.tab = 'discussion';
    let root = draw();
    expect(requested.filter(entry => entry.startsWith('thread:') || entry.startsWith('candidate:'))).toEqual([]);
    expect(details(root, 'thread-version:thread').querySelector('table')).toBeNull();
    expect(details(root, 'thread-history:thread').querySelector('li')).toBeNull();
    open.add('thread-version:thread');
    open.add('thread-history:thread');
    root = draw();
    expect(details(root, 'thread-version:thread').querySelector('[data-loading]')).not.toBeNull();
    expect(details(root, 'thread-history:thread').querySelector('[data-loading]')).not.toBeNull();
    expect(requested).toEqual(expect.arrayContaining(['candidate:cand', 'thread:thread']));
    store.candidates['cand'] = { ...candidateSummary, records: records('Final') };
    store.threads['thread'] = [event, { ...event, id: 'second', action: 'resolve_thread' }];
    root = draw();
    expect(details(root, 'thread-version:thread').textContent).toContain('Final');
    const history = [...details(root, 'thread-history:thread').querySelectorAll('li')].map(node => node.textContent);
    expect(history).toHaveLength(2);
    // 操作者显示成员邮箱，动作显示中文名
    expect(history[0]).toContain('u1@example.test · 回复讨论');
    expect(history[1]).toContain('u1@example.test · 处理讨论');
  });
});

describe('PR 详情按 PR 读取（ADMIN-US-219）', () => {
  it('详情读到之前各页签只显示占位，不渲染审核、讨论与候选，也不读取提交与候选内容', () => {
    const { draw, view, requested, store, buttons } = setup({ candidate: true });
    store.detail = undefined;
    for (const tab of ['discussion', 'commits', 'changes', 'checks'] as const) {
      view.tab = tab;
      const root = draw();
      expect(root.querySelector('#pr-panel [data-loading]'), tab).not.toBeNull();
      expect(buttons(root, '批准当前候选'), tab).toHaveLength(0);
      expect(buttons(root, '发表评论'), tab).toHaveLength(0);
    }
    expect(requested.filter(entry => entry.startsWith('candidate:') || entry.startsWith('commit:'))).toEqual([]);
    expect(requested).toContain('detail:pr');
  });
  it('团队页窗口之外还有更早的 PR 时提供加载入口', async () => {
    const { draw, buttons, calls, view } = setup();
    expect(buttons(draw(), '加载更早的 PR')).toHaveLength(0);
    const snapshot = (view as unknown as { controller: { snapshot: { earlier: { prs: boolean } } } }).controller
      .snapshot;
    snapshot.earlier.prs = true;
    const [load] = buttons(draw(), '加载更早的 PR');
    load.click();
    await flush();
    expect(calls).toContain('earlier-prs');
  });
});

describe('PR 列表、创建与审核区', () => {
  it('列表里新的在上，每项的文字是「标题 · 状态」，选中的那项标为当前', () => {
    const { draw, view } = setup();
    const snapshot = (view as unknown as { controller: { snapshot: { prs: object[] } } }).controller.snapshot;
    snapshot.prs.push({ ...(snapshot.prs[0] as object), id: 'later', title: 'Later', status: 'draft' });
    const items = [...draw().querySelectorAll('ul.menu button')];
    expect(items.map(node => node.textContent)).toEqual(['Later · 草稿', 'Rename · 待审核']);
    expect(items.map(node => node.getAttribute('aria-current'))).toEqual([null, 'true']);
  });
  it('没有选中的 PR 时右侧提示先选一个', () => {
    const { draw, view } = setup();
    view.selected = null;
    expect(draw().textContent).toContain('选择一个数据 PR 查看详情');
  });
  it('创建 PR 对话框：按填写的标题、说明与目标分支建 PR，成功后关闭对话框并选中新 PR', async () => {
    const { view, run } = setup();
    const created = vi.fn();
    view.openCreate({ id: 't', name: 'Task', remoteHead: 'source' }, created);
    const dialog = document.querySelector('dialog')!;
    expect(dialog.querySelector<HTMLInputElement>('input[aria-label="PR 标题"]')!.value).toBe('Task');
    dialog.querySelector<HTMLTextAreaElement>('textarea[aria-label="PR 说明"]')!.value = 'Why';
    expect(dialog.querySelector<HTMLSelectElement>('select[aria-label="目标分支"]')!.value).toBe('shared');
    [...dialog.querySelectorAll('button')].find(node => node.textContent === '创建 PR')!.click();
    await vi.waitFor(() => expect(created).toHaveBeenCalledTimes(1));
    const command = run.mock.calls[0][0] as { id: string };
    expect(command).toMatchObject({ type: 'pr', title: 'Task', description: 'Why', target: 'shared', taskId: 't' });
    expect(created).toHaveBeenCalledWith(command.id);
    expect(view.selected).toBe(command.id);
    expect(document.querySelector('dialog')).toBeNull();
  });
  it('创建 PR 失败时对话框不关，原因显示在对话框里，同时交给统一的报错路径', async () => {
    const { view, run, failures } = setup();
    run.mockRejectedValueOnce(new Error('先同步任务变更再创建 PR'));
    const created = vi.fn();
    view.openCreate({ id: 't', name: 'Task', remoteHead: 'source' }, created);
    const dialog = document.querySelector('dialog')!;
    [...dialog.querySelectorAll('button')].find(node => node.textContent === '创建 PR')!.click();
    await vi.waitFor(() => expect(failures).toHaveLength(1));
    expect(dialog.isConnected).toBe(true);
    expect(dialog.querySelector('[role="status"]')?.textContent).toContain('先同步任务变更再创建 PR');
    expect(created).not.toHaveBeenCalled();
  });
  it('审核区的阻塞意见显示审核者的邮箱；阶段进度逐项列出', () => {
    const { draw, store, view } = setup({ candidate: true });
    const snapshot = (
      view as unknown as {
        controller: { snapshot: { members: { id: string; email: string; permissions: string[] }[] } };
      }
    ).controller.snapshot;
    snapshot.members.push({ id: 'r1', email: 'r1@example.test', permissions: ['read', 'review'] });
    store.detail = {
      ...store.detail!,
      governance: {
        prId: 'pr',
        blockers: [{ reviewerId: 'r1', reason: '请先确认采购范围' }],
        stages: [{ id: 'review', name: '审核', minimum: 1, approved: 0, complete: false }]
      } as unknown as PullRequestDetail['governance']
    };
    const root = draw();
    expect(root.textContent).toContain('要求修改：r1@example.test — 请先确认采购范围');
    expect(root.textContent).toContain('审核：0/1 待批准');
  });
  it('评论显示作者邮箱与正文；自己的评论可以展开编辑', () => {
    const { draw, view } = setup({ candidate: true });
    view.tab = 'discussion';
    const comment = draw().querySelector<HTMLElement>('[data-comment-id="comment"]')!;
    expect(comment.dataset['authorId']).toBe('u1');
    expect(comment.textContent).toContain('u1@example.test');
    expect(comment.textContent).toContain('Check the name');
    expect(comment.querySelector('details input[aria-label="编辑我的评论"]')).not.toBeNull();
  });
});
