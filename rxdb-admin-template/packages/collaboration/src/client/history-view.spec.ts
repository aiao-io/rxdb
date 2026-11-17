import { Window } from 'happy-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CollaborationError, type Audit, type CommitContent, type Records } from '../model.js';
import type { CollaborationController } from './controller.js';
import type { Disclosures } from './disclosure.js';
import type { Perform } from './elements.js';
import { FormDrafts } from './form-drafts.js';
import { historyView } from './history-view.js';

const records = (name: string): Records => ({ c: { entity: 'AssetCategory', fields: { name } } });
const commit = (id: string, parent: string | null): CommitContent => ({
  id,
  parent,
  authorId: 'u1',
  message: `Message ${id}`,
  records: records(`Name ${id}`)
});
const metadata = ({ id, parent, authorId, message }: CommitContent) => ({ id, parent, authorId, message });
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

function setup(options: { permissions?: string[]; earlier?: boolean; dirty?: boolean } = {}) {
  const calls: string[] = [];
  const failures: unknown[] = [];
  const requested: string[] = [];
  const store = { commits: {} as Record<string, CommitContent>, failure: undefined as unknown };
  const open = new Set<string>();
  const reveal = vi.fn();
  const controller = {
    user: { id: 'u1', email: 'u1@example.test', verified: true },
    snapshot: {
      auditCount: 6,
      members: [{ id: 'u1', permissions: options.permissions ?? ['read', 'edit'] }],
      commits: { a: metadata(commit('a', null)), b: metadata(commit('b', 'a')) }
    },
    auditEvents: () => [event(4), event(5), event(6)],
    hasEarlierAudit: () => options.earlier ?? true,
    loadEarlierAudit: vi.fn(async () => {
      calls.push('earlier');
    }),
    commitContent: (id: string) => {
      requested.push(id);
      return store.commits[id];
    },
    loadCommit: vi.fn(async (id: string) => {
      calls.push(`load:${id}`);
      if (store.failure) throw store.failure;
      return store.commits[id] ?? commit(id, null);
    }),
    createTask: vi.fn(async (name: string) => {
      calls.push(`create:${name}`);
    }),
    save: vi.fn(async (saved: Records) => {
      calls.push(`save:${JSON.stringify(saved)}`);
    })
  } as unknown as CollaborationController;
  const perform: Perform = async work => {
    try {
      await work();
    } catch (error) {
      failures.push(error);
    }
  };
  const editor = { dirty: options.dirty ?? false, clear: vi.fn(() => calls.push('clear')) };
  const draw = (disclosures: Disclosures = { isOpen: key => open.has(key), reveal }) =>
    historyView(controller, perform, editor, disclosures);
  const details = (root: Element, key: string) =>
    [...root.querySelectorAll('details')].find(node => node.dataset['disclosureKey'] === key)!;
  const button = (root: Element, name: string) =>
    [...root.querySelectorAll('button')].find(node => node.textContent === name);
  return { controller, perform, editor, draw, details, button, open, reveal, requested, store, calls, failures };
}

describe('历史与审计视图', () => {
  it('折叠时只显示审计总数与提交摘要：不渲染事件，也不请求或渲染任何提交内容', () => {
    const { draw, details, requested, reveal } = setup();
    const root = draw();
    expect(root.querySelector('h2')?.textContent).toBe('历史与审计');
    const audit = details(root, 'audit');
    expect(audit.querySelector('summary')?.textContent).toBe('6 条审计事件');
    expect(audit.querySelectorAll('p')).toHaveLength(0);
    expect(audit.querySelectorAll('button')).toHaveLength(0);
    for (const id of ['a', 'b']) {
      const item = details(root, `shared-commit:${id}`);
      expect(item.querySelector('summary')?.textContent).toBe(`Message ${id} · u1 · ${id}`);
      expect(item.querySelector('table')).toBeNull();
      expect(item.querySelector('[data-loading]')).toBeNull();
    }
    expect(requested).toEqual([]);
    expect(root.querySelectorAll('table')).toHaveLength(0);
    expect(reveal).not.toHaveBeenCalled();
  });
  it('展开审计时间线后按时间正序列出事件，并在有更早事件时提供「加载更早的审计事件」', async () => {
    const { draw, details, button, open, calls } = setup();
    open.add('audit');
    const audit = details(draw(), 'audit');
    const lines = [...audit.querySelectorAll('p')].map(node => node.textContent ?? '');
    expect(lines).toHaveLength(3);
    expect(lines[0]).toContain('u1 · task · {"id":"task-4"}');
    expect(lines[2]).toContain('u1 · task · {"id":"task-6"}');
    const load = button(audit, '加载更早的审计事件')!;
    expect(audit.querySelector('summary')?.nextElementSibling).toBe(load);
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
    store.commits['a'] = commit('a', null);
    root = draw();
    expect(details(root, 'shared-commit:a').querySelector('[data-loading]')).toBeNull();
    expect(details(root, 'shared-commit:a').querySelector('table')?.textContent).toContain('Name a');
    expect(details(root, 'shared-commit:b').querySelector('table')).toBeNull();
  });
  it('折叠的提交里也有恢复按钮；点击先加载内容，再新建任务并保存该版本的记录', async () => {
    const { draw, details, button, calls, failures, editor, store } = setup();
    store.commits['b'] = commit('b', 'a');
    const restore = button(details(draw(), 'shared-commit:b'), '从此版本创建恢复草稿')!;
    expect(restore).toBeDefined();
    restore.click();
    await flush();
    expect(failures).toEqual([]);
    expect(calls).toEqual(['load:b', 'create:恢复 Message b', `save:${JSON.stringify(records('Name b'))}`, 'clear']);
    expect(editor.clear).toHaveBeenCalledTimes(1);
  });
  it('内容加载失败时不新建任务；编辑器有未保存输入时同样拒绝，且不发请求', async () => {
    const failed = setup();
    failed.store.failure = new CollaborationError('internal', '读取失败');
    failed.button(failed.details(failed.draw(), 'shared-commit:a'), '从此版本创建恢复草稿')!.click();
    await flush();
    expect(failed.failures).toEqual([expect.objectContaining({ message: '读取失败' })]);
    expect(failed.calls).toEqual(['load:a']);
    const dirty = setup({ dirty: true });
    dirty.button(dirty.details(dirty.draw(), 'shared-commit:a'), '从此版本创建恢复草稿')!.click();
    await flush();
    expect(dirty.failures).toEqual([expect.objectContaining({ message: '先保存当前输入' })]);
    expect(dirty.calls).toEqual([]);
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
    store.commits['a'] = commit('a', null);
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
