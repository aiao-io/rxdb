import { Window } from 'happy-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Audit, Candidate, CommitContent, Records, Thread } from '../model.js';
import type { CollaborationController } from './controller.js';
import type { Perform } from './elements.js';
import { PullRequestView } from './pr-view.js';
const records = (name: string): Records => ({ c: { entity: 'AssetCategory', fields: { name } } });
const commit = (id: string, parent: string | null, name: string): CommitContent => ({
  id,
  parent,
  authorId: 'u1',
  message: id,
  records: records(name)
});
const metadata = ({ id, parent, authorId, message }: CommitContent) => ({ id, parent, authorId, message });
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
  const base = options.base === undefined ? 'base' : options.base;
  const target = options.target === undefined ? 'target' : options.target;
  const failures: unknown[] = [];
  const run = vi.fn().mockResolvedValue({});
  const requested: string[] = [];
  const store = {
    commits: {} as Record<string, CommitContent>,
    candidates: {} as Record<string, Candidate>,
    shared: undefined as Records | undefined,
    threads: {} as Record<string, Audit[]>
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
    sharedRecords: () => {
      requested.push('shared');
      return store.shared;
    },
    threadEvents: (id: string) => {
      requested.push(`thread:${id}`);
      return store.threads[id];
    },
    snapshot: {
      head: target,
      policy: { version: 1, stages: [] },
      schemaVersion: 1,
      members: [
        { id: 'u1', email: 'u1@example.test', permissions: ['read', 'edit', 'merge', 'comment'], generation: 1 }
      ],
      tasks: [{ id: 't', name: 'Task', ownerId: 'u1', base, head: 'source', originTaskId: null }],
      commits: {
        base: metadata(commit('base', null, 'Base')),
        source: metadata(commit('source', 'base', 'Source')),
        target: metadata(commit('target', 'base', 'Target'))
      },
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
      candidates: options.candidate ? { cand: { ...candidateSummary, base, target } } : {},
      reviews: [],
      threads: [thread],
      governance: []
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
      base: commit('base', null, 'Base'),
      source: commit('source', 'base', 'Source'),
      target: commit('target', 'base', 'Target')
    };
    store.shared = records('Target');
    store.candidates = { cand: { ...candidateSummary, base, target, records: records('Final') } };
  };
  return { view, draw, run, failures, requested, store, open, reveal, buttons, loadAll };
}
const details = (root: Element, disclosure: string) =>
  [...root.querySelectorAll('details')].find(node => node.dataset['disclosureKey'] === disclosure)!;
const section = (root: Element, title: string) =>
  [...root.querySelectorAll('section')].find(node => node.querySelector('h2')?.textContent === title)!;
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
    store.commits['base'] = commit('base', null, 'Base');
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
    store.commits['base'] = commit('base', null, 'Base');
    store.commits['source'] = commit('source', 'base', 'Source');
    store.shared = records('Target');
    const root = draw();
    expect(root.textContent).toContain('来源提交变化（尚未形成最终候选）');
    expect(root.querySelectorAll('table')).toHaveLength(1);
    expect(root.querySelector('table')?.textContent).toContain('Source');
  });
  it('起点是空分支（没有任何提交）时不请求起点内容，直接按空记录比较', () => {
    const { draw, store, requested } = setup({ base: null });
    store.commits['source'] = commit('source', null, 'Source');
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
    expect(item.querySelector('summary')?.textContent).toBe('source · u1 · source');
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
    expect(section(root, '最终合并候选').querySelector('[data-loading]')).not.toBeNull();
    expect(buttons(root, '查看记录 c')).toHaveLength(0);
    store.candidates['cand'] = { ...candidateSummary, records: records('Final') };
    root = draw();
    expect(section(root, '最终合并候选').querySelector('[data-loading]')).not.toBeNull();
    store.commits['target'] = commit('target', 'base', 'Target');
    root = draw();
    expect(section(root, '最终合并候选').querySelector('[data-loading]')).toBeNull();
    expect(buttons(root, '查看记录 c')).toHaveLength(1);
    const diff = [...root.querySelectorAll('table')].find(table => table.textContent?.includes('合并前'))!;
    expect(diff.textContent).toContain('Target');
    expect(diff.textContent).toContain('Final');
  });
  it('检查页同样先显示检查结果，再等内容加载出记录导航', () => {
    const { draw, view, store, buttons } = setup({ candidate: true });
    view.tab = 'checks';
    let root = draw();
    expect(root.textContent).toContain('未解决冲突：0 · 检查错误：0');
    expect(buttons(root, '查看记录 c')).toHaveLength(0);
    store.candidates['cand'] = { ...candidateSummary, records: records('Final') };
    store.commits['target'] = commit('target', 'base', 'Target');
    root = draw();
    expect(buttons(root, '查看记录 c')).toHaveLength(1);
  });
  it('候选的目标是空分支时不请求目标提交，候选内容到齐即渲染', () => {
    const { draw, store, requested, buttons } = setup({ candidate: true, target: null });
    let root = draw();
    expect(requested).toContain('candidate:cand');
    expect(requested).not.toContain('commit:target');
    expect(requested).not.toContain('commit:null');
    expect(section(root, '最终合并候选').querySelector('[data-loading]')).not.toBeNull();
    store.candidates['cand'] = { ...candidateSummary, target: null, records: records('Final') };
    root = draw();
    expect(section(root, '最终合并候选').querySelector('[data-loading]')).toBeNull();
    expect(buttons(root, '查看记录 c')).toHaveLength(1);
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
    expect(details(root, 'thread-history:thread').querySelector('p')).toBeNull();
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
    const history = [...details(root, 'thread-history:thread').querySelectorAll('p')].map(node => node.textContent);
    expect(history).toHaveLength(2);
    expect(history[0]).toContain('u1 · reply');
    expect(history[1]).toContain('u1 · resolve_thread');
  });
});
