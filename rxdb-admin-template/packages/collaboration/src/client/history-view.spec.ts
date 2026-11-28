import { Window } from 'happy-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { unitsOf } from '../commit.testing.js';
import { CollaborationError, type Audit, type ChangeSet, type CommitContent, type Records } from '../model.js';
import { assetSchema } from '../schema.testing.js';
import type { CollaborationController } from './controller.js';
import type { Disclosures } from './disclosure.js';
import type { Perform } from './elements.js';
import { FormDrafts } from './form-drafts.js';
import { historyView } from './history-view.js';

const records = (name: string): Records => ({ c: { entity: 'AssetCategory', fields: { name } } });
const rename = (id: string): ChangeSet => ({
  namespace: 'assets',
  entity: 'AssetCategory',
  entityId: 'c',
  operation: 'update',
  patch: { name: `Name ${id}` },
  inversePatch: { name: 'Before' }
});
/** 共享分支上的合并提交：第一父是上一个共享头（第一次合并是根），第二父是被合并的任务头。 */
const commit = (id: string, parent: string): CommitContent => ({
  id,
  parentIds: [parent, `task-${id}`],
  kind: 'merge',
  authorId: 'u1',
  message: `Message ${id}`,
  createdAt: '2026-11-18T00:00:00.000Z',
  changes: unitsOf([rename(id)], id),
  records: records(`Name ${id}`)
});
const metadata = ({ id, parentIds, kind, authorId, message, createdAt }: CommitContent) => ({
  id,
  parentIds,
  kind,
  authorId,
  message,
  createdAt
});
const event = (id: number): Audit => ({
  id: `e${id}`,
  actorId: 'u1',
  action: 'task',
  operationId: `op${id}`,
  at: 1000 * id,
  details: { id: `task-${id}` }
});
beforeEach(() => {
  const window = new Window();
  vi.stubGlobal('document', window.document);
  vi.stubGlobal('Event', window.Event);
});
afterEach(() => {
  vi.unstubAllGlobals();
});
const flush = () => new Promise<void>(resolve => setTimeout(resolve, 0));

function setup(options: { permissions?: string[]; earlier?: boolean; commitsEarlier?: boolean } = {}) {
  const calls: string[] = [];
  const failures: unknown[] = [];
  const requested: string[] = [];
  const branches: unknown[] = [];
  const store = {
    commits: {} as Record<string, CommitContent>,
    failure: undefined as unknown,
    // 分页接口按从新到旧返回：b 的父提交是 a
    history: { commits: [metadata(commit('b', 'a')), metadata(commit('a', 'root'))], hasEarlier: false } as
      { commits: ReturnType<typeof metadata>[]; hasEarlier: boolean } | undefined
  };
  if (options.commitsEarlier) store.history!.hasEarlier = true;
  const open = new Set<string>();
  const reveal = vi.fn();
  const controller = {
    user: { id: 'u1', email: 'u1@example.test', verified: true },
    snapshot: {
      auditCount: 6,
      root: 'root',
      members: [{ id: 'u1', email: 'u1@example.test', permissions: options.permissions ?? ['read', 'edit'] }]
    },
    commitHistory: (branch: unknown) => {
      branches.push(branch);
      return store.history;
    },
    loadEarlierCommits: vi.fn(async (branch: unknown) => {
      calls.push(`earlier-commits:${JSON.stringify(branch)}`);
    }),
    auditEvents: () => [event(4), event(5), event(6)],
    hasEarlierAudit: () => options.earlier ?? true,
    loadEarlierAudit: vi.fn(async () => {
      calls.push('earlier');
    }),
    commitContent: (id: string) => {
      requested.push(id);
      return store.commits[id];
    },
    schema: () => assetSchema,
    loadCommit: vi.fn(async (id: string) => {
      calls.push(`load:${id}`);
      if (store.failure) throw store.failure;
      return store.commits[id] ?? commit(id, 'root');
    }),
    restoreVersion: vi.fn(async (id: string, name: string) => {
      calls.push(`restore:${id}:${name}`);
      if (store.failure) throw store.failure;
    })
  } as unknown as CollaborationController;
  const perform: Perform = async work => {
    try {
      await work();
    } catch (error) {
      failures.push(error);
    }
  };
  const draw = (disclosures: Disclosures = { isOpen: key => open.has(key), reveal }) =>
    historyView(controller, perform, disclosures);
  const details = (root: Element, key: string) =>
    [...root.querySelectorAll('details')].find(node => node.dataset['disclosureKey'] === key)!;
  const button = (root: Element, name: string) =>
    [...root.querySelectorAll('button')].find(node => node.textContent === name);
  return {
    controller,
    perform,
    draw,
    details,
    button,
    open,
    reveal,
    requested,
    branches,
    store,
    calls,
    failures
  };
}

describe('历史与审计视图', () => {
  it('折叠时只显示审计总数与提交摘要：不渲染事件，也不请求或渲染任何提交内容', () => {
    const { draw, details, requested, reveal } = setup();
    const root = draw();
    expect(root.querySelector('h2')?.textContent).toBe('共享分支历史');
    const audit = details(root, 'audit');
    expect(audit.querySelector('summary')?.textContent).toContain('6 条审计事件');
    expect(audit.querySelector('table')).toBeNull();
    expect(audit.querySelectorAll('button')).toHaveLength(0);
    for (const id of ['a', 'b']) {
      const item = details(root, `shared-commit:${id}`);
      expect(item.dataset['commitId']).toBe(id);
      // 摘要：提交消息、作者（成员邮箱）与短 ID；父提交是根时显示「空」
      const summary = item.querySelector('summary')?.textContent ?? '';
      expect(summary).toContain(`Message ${id}`);
      expect(summary).toContain('u1@example.test');
      expect(item.querySelector('summary code')?.textContent).toBe(id);
      expect(item.querySelector('table')).toBeNull();
      expect(item.querySelector('[data-loading]')).toBeNull();
    }
    expect(details(root, 'shared-commit:a').querySelector('summary')?.textContent).toContain('父提交：空');
    expect(details(root, 'shared-commit:b').querySelector('summary')?.textContent).toContain('父提交：a');
    expect(requested).toEqual([]);
    expect(root.querySelectorAll('table')).toHaveLength(0);
    expect(reveal).not.toHaveBeenCalled();
  });
  it('展开审计时间线后按时间正序列成表：操作者显示邮箱、动作显示中文名、详情原文可展开；有更早事件时提供「加载更早的审计事件」', async () => {
    const { draw, details, button, open, calls } = setup();
    open.add('audit');
    const audit = details(draw(), 'audit');
    const rows = [...audit.querySelectorAll<HTMLTableRowElement>('tbody tr')];
    expect(rows.map(row => row.dataset['auditId'])).toEqual(['e4', 'e5', 'e6']);
    expect(rows[0].children[1].textContent).toBe('u1@example.test');
    expect(rows[0].children[2].textContent).toBe('新建任务');
    expect(rows[0].querySelector('pre')?.textContent).toContain('"id": "task-4"');
    expect(rows[2].querySelector('pre')?.textContent).toContain('"id": "task-6"');
    const load = button(audit, '加载更早的审计事件')!;
    expect(audit.querySelector('summary')?.nextElementSibling?.firstElementChild).toBe(load);
    load.click();
    await flush();
    expect(calls).toEqual(['earlier']);
  });
  it('没有更早事件时不显示加载按钮', () => {
    const { draw, details, button, open } = setup({ earlier: false });
    open.add('audit');
    expect(button(details(draw(), 'audit'), '加载更早的审计事件')).toBeUndefined();
  });
  it('用户首次展开提交时通知重绘；恢复为展开的提交先显示占位，加载后渲染记录表', () => {
    const { draw, details, open, reveal, requested, store } = setup();
    const item = details(draw(), 'shared-commit:a');
    item.open = true;
    item.dispatchEvent(new Event('toggle'));
    expect(reveal).toHaveBeenCalledTimes(1);
    open.add('shared-commit:a');
    let root = draw();
    expect(details(root, 'shared-commit:a').querySelector('[data-loading]')).not.toBeNull();
    expect(details(root, 'shared-commit:b').querySelector('[data-loading]')).toBeNull();
    expect(requested).toEqual(['a']);
    store.commits['a'] = commit('a', 'root');
    root = draw();
    expect(details(root, 'shared-commit:a').querySelector('[data-loading]')).toBeNull();
    expect(details(root, 'shared-commit:a').querySelector('table')?.textContent).toContain('Name a');
    expect(details(root, 'shared-commit:b').querySelector('table')).toBeNull();
  });
  it('折叠的提交里也有恢复按钮；点击按这个提交恢复到新任务（平台 restore()），任务名取提交消息，不先读提交内容', async () => {
    const { draw, details, button, calls, failures } = setup();
    const restore = button(details(draw(), 'shared-commit:b'), '从此版本创建恢复草稿')!;
    expect(restore).toBeDefined();
    restore.click();
    await flush();
    expect(failures).toEqual([]);
    expect(calls).toEqual(['restore:b:恢复 Message b']);
  });
  it('恢复被拒（例如侧枝上的版本）时把原因交给统一的报错路径', async () => {
    const failed = setup();
    failed.store.failure = new CollaborationError('restore', '所选版本只在合并带进来的侧枝上，无法直接恢复');
    failed.button(failed.details(failed.draw(), 'shared-commit:a'), '从此版本创建恢复草稿')!.click();
    await flush();
    expect(failed.failures).toEqual([
      expect.objectContaining({ message: '所选版本只在合并带进来的侧枝上，无法直接恢复' })
    ]);
    expect(failed.calls).toEqual(['restore:a:恢复 Message a']);
  });
  it('共享历史按共享分支分页读取，新的在上', () => {
    const { draw, branches } = setup();
    const keys = [...draw().querySelectorAll('details')]
      .map(node => node.dataset['disclosureKey'])
      .filter(key => key?.startsWith('shared-commit:'));
    expect(keys).toEqual(['shared-commit:b', 'shared-commit:a']);
    expect(branches).toEqual([{ branch: 'shared' }]);
  });
  it('第一页还没读到时显示占位，不列出任何提交', () => {
    const { draw, store } = setup();
    store.history = undefined;
    const root = draw();
    expect(root.querySelector('[data-loading]')).not.toBeNull();
    expect([...root.querySelectorAll('details')].map(node => node.dataset['disclosureKey'])).toEqual(['audit']);
  });
  it('有更早的提交时在提交列表末尾提供「加载更早的提交」，点击读取下一页；没有时不显示', async () => {
    const { draw, details, button, calls } = setup({ commitsEarlier: true });
    const root = draw();
    const load = button(root, '加载更早的提交')!;
    expect(load).toBeDefined();
    expect(load.previousElementSibling?.lastElementChild).toBe(details(root, 'shared-commit:a'));
    load.click();
    await flush();
    expect(calls).toEqual(['earlier-commits:{"branch":"shared"}']);
    expect(button(setup().draw(), '加载更早的提交')).toBeUndefined();
  });
  it('展开后在记录表之外列出这个提交的字段级变更：变更类型、记录、字段、合并前、合并后', () => {
    const { draw, details, open, store } = setup();
    open.add('shared-commit:b');
    store.commits['b'] = commit('b', 'a');
    const tables = [...details(draw(), 'shared-commit:b').querySelectorAll('table')];
    expect(tables).toHaveLength(2);
    // 先是这个提交自身的变更（记录显示名称、字段显示清单里的标签），再是这个版本的完整数据
    const rows = [...tables[0].querySelectorAll('tr')].map(tr =>
      [...tr.querySelectorAll('th, td')].map(cell => cell.textContent)
    );
    expect(rows).toEqual([
      ['变更类型', '记录', '字段', '合并前', '合并后'],
      ['修改', 'Name b', '分类名', 'Before', 'Name b']
    ]);
    expect(tables[1].textContent).toContain('Name b');
  });
  it('没有编辑权限的成员看不到恢复按钮', () => {
    const { draw, details, button } = setup({ permissions: ['read'] });
    expect(button(details(draw(), 'shared-commit:a'), '从此版本创建恢复草稿')).toBeUndefined();
  });
});

describe('与重绘循环的配合', () => {
  /** 与 mountCollaboration 相同的重绘顺序：先记住展开状态与焦点，重建内容，再恢复。 */
  function mounted() {
    const setupValue = setup();
    const host = document.createElement('div');
    document.body.append(host);
    const drafts = new FormDrafts(host);
    let renders = 0;
    const render = (): void => {
      renders++;
      drafts.rememberDisclosures();
      const focused = drafts.focusedDisclosure();
      host.replaceChildren(setupValue.draw({ isOpen: key => drafts.isOpen(key), reveal: render }));
      drafts.restore('context');
      if (focused) drafts.focusDisclosure(focused);
    };
    render();
    return { ...setupValue, host, render, renders: () => renders };
  }
  const item = (host: Element, key: string) =>
    [...host.querySelectorAll('details')].find(node => node.dataset['disclosureKey'] === key)!;
  it('展开折叠的提交只重绘一次，保持展开与焦点，并且重绘自己引起的 toggle 事件不会再触发重绘', () => {
    const { host, renders, store, render } = mounted();
    const first = item(host, 'shared-commit:a');
    const summary = first.querySelector('summary')!;
    summary.tabIndex = 0;
    summary.focus();
    first.open = true;
    first.dispatchEvent(new Event('toggle'));
    expect(renders()).toBe(2);
    const second = item(host, 'shared-commit:a');
    expect(second).not.toBe(first);
    expect(second.open).toBe(true);
    expect(second.querySelector('[data-loading]')).not.toBeNull();
    second.dispatchEvent(new Event('toggle'));
    second.dispatchEvent(new Event('toggle'));
    expect(renders()).toBe(2);
    store.commits['a'] = commit('a', 'root');
    render();
    const third = item(host, 'shared-commit:a');
    expect(third.open).toBe(true);
    expect(third.querySelector('table')?.textContent).toContain('Name a');
    third.dispatchEvent(new Event('toggle'));
    expect(renders()).toBe(3);
    expect(item(host, 'shared-commit:b').open).toBe(false);
    expect(item(host, 'shared-commit:b').querySelector('table')).toBeNull();
    host.remove();
  });
  it('重绘后键盘焦点留在刚展开的 summary 上', () => {
    const { host } = mounted();
    const first = item(host, 'shared-commit:b');
    const summary = first.querySelector('summary')!;
    summary.tabIndex = 0;
    summary.focus();
    expect(document.activeElement).toBe(summary);
    first.open = true;
    first.dispatchEvent(new Event('toggle'));
    const redrawn = item(host, 'shared-commit:b').querySelector('summary');
    expect(redrawn).not.toBe(summary);
    expect(document.activeElement).toBe(redrawn);
    host.remove();
  });
});
