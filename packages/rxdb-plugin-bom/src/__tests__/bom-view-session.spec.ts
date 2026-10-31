import { RxDB, SyncType } from '@aiao/rxdb';
import { BehaviorSubject } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { handleBomTreeKey } from '../view-navigation.js';
import { createBomViewSession } from '../view-session.js';
import { initialBomViewState } from '../view-state.js';
import type { BomViewHandle, BomViewInput, BomViewNode } from '../view-types.js';

const input: BomViewInput = {
  context: { bomType: 'ebom', orgId: 'test', asOfDate: new Date('2026-01-01') },
  target: { parentItemId: 'root' },
  plannedQty: { value: '1', uom: 'pcs' }
};
const database = () => new RxDB({ dbName: crypto.randomUUID(), entities: [], sync: { type: SyncType.None } });
const probe = () => {
  const state = new BehaviorSubject(initialBomViewState());
  const handle: BomViewHandle = {
    state$: state,
    setInput: vi.fn(),
    refresh: vi.fn(),
    toggle: vi.fn(),
    loadOccurrence: vi.fn(),
    saveOccurrence: vi.fn(),
    calculate: vi.fn(),
    destroy: vi.fn()
  };
  return { state, handle };
};

describe('共享绑定会话', () => {
  it('命令和声明输入共享同一去重身份，换库与释放终止旧订阅', () => {
    const first = probe();
    const second = probe();
    const create = vi.fn().mockReturnValueOnce(first.handle).mockReturnValueOnce(second.handle);
    const publish = vi.fn();
    const session = createBomViewSession(create, publish);
    expect(() => session.commands.refresh()).toThrow(/尚未挂载/);
    const db = database();
    session.sync(db, input);
    expect(publish).toHaveBeenCalledWith(first.state.value);
    session.sync(db, structuredClone(input));
    expect(first.handle.setInput).not.toHaveBeenCalled();
    const changed = { ...input, plannedQty: { value: '2', uom: 'pcs' } };
    session.commands.setInput(changed);
    session.sync(db, structuredClone(changed));
    expect(first.handle.setInput).toHaveBeenCalledOnce();
    session.sync(db, structuredClone(input));
    expect(first.handle.setInput).toHaveBeenLastCalledWith(input);
    session.commands.refresh();
    session.commands.toggle(['line']);
    void session.commands.loadOccurrence('line');
    void session.commands.saveOccurrence({ qty: '2' });
    void session.commands.calculate();
    expect(first.handle.refresh).toHaveBeenCalledOnce();
    expect(first.handle.toggle).toHaveBeenCalledWith(['line']);
    expect(first.handle.loadOccurrence).toHaveBeenCalledWith('line');
    expect(first.handle.saveOccurrence).toHaveBeenCalledWith({ qty: '2' });
    expect(first.handle.calculate).toHaveBeenCalledOnce();
    session.sync(database(), input);
    expect(first.handle.destroy).toHaveBeenCalledOnce();
    publish.mockClear();
    first.state.next(initialBomViewState());
    expect(publish).not.toHaveBeenCalled();
    session.release();
    session.release();
    expect(second.handle.destroy).toHaveBeenCalledOnce();
    expect(() => session.commands.setInput(input)).toThrow(/已经卸载/);
  });
});

const node = (path: string[], options: Partial<BomViewNode> = {}): BomViewNode => ({
  path,
  key: JSON.stringify(path),
  depth: path.length,
  itemId: 'item',
  revisionId: 'revision',
  occurrenceId: path.at(-1) ?? null,
  qty: '1',
  lineNo: null,
  effectiveFrom: null,
  effectiveTo: null,
  itemNo: 'ITEM',
  description: null,
  quantity: null,
  hasChildren: false,
  expanded: false,
  ...options
});
const actions = () => ({ focus: vi.fn(), toggle: vi.fn(), edit: vi.fn() });

describe('共享树键盘导航', () => {
  const root = node([], { hasChildren: true, expanded: true });
  const branch = node(['a'], { hasChildren: true, expanded: true });
  const leaf = node(['a', 'b']);
  const nodes = [root, branch, leaf];
  it.each([
    ['ArrowDown', 2],
    ['ArrowUp', 0],
    ['Home', 0],
    ['End', 2]
  ])('%s 在可见行间移动', (key, expected) => {
    const calls = actions();
    expect(handleBomTreeKey(key, nodes, 1, calls)).toBe(true);
    expect(calls.focus).toHaveBeenCalledWith(expected);
  });
  it('首尾钳制，未知键与不存在的行不消费事件', () => {
    const calls = actions();
    handleBomTreeKey('ArrowUp', nodes, 0, calls);
    expect(calls.focus).toHaveBeenLastCalledWith(0);
    handleBomTreeKey('ArrowDown', nodes, 2, calls);
    expect(calls.focus).toHaveBeenLastCalledWith(2);
    expect(handleBomTreeKey('Tab', nodes, 0, calls)).toBe(false);
    expect(handleBomTreeKey('ArrowDown', [], 0, calls)).toBe(false);
  });
  it('左右键展开、进入子行、折叠与返回父行，根无父时保持焦点', () => {
    const calls = actions();
    handleBomTreeKey('ArrowRight', [node([], { hasChildren: true })], 0, calls);
    expect(calls.toggle).toHaveBeenLastCalledWith([]);
    handleBomTreeKey('ArrowRight', nodes, 1, calls);
    expect(calls.focus).toHaveBeenLastCalledWith(2);
    handleBomTreeKey('ArrowLeft', nodes, 1, calls);
    expect(calls.toggle).toHaveBeenLastCalledWith(['a']);
    handleBomTreeKey('ArrowLeft', nodes, 2, calls);
    expect(calls.focus).toHaveBeenLastCalledWith(1);
    calls.focus.mockClear();
    handleBomTreeKey('ArrowLeft', [node([])], 0, calls);
    handleBomTreeKey('ArrowRight', nodes, 2, calls);
    expect(calls.focus).not.toHaveBeenCalled();
  });
  it('空格只切换分支，回车选择当前行', () => {
    const calls = actions();
    handleBomTreeKey(' ', nodes, 2, calls);
    expect(calls.toggle).not.toHaveBeenCalled();
    handleBomTreeKey(' ', nodes, 1, calls);
    expect(calls.toggle).toHaveBeenCalledWith(['a']);
    handleBomTreeKey('Enter', nodes, 2, calls);
    expect(calls.edit).toHaveBeenCalledWith(leaf);
  });
});
