/** @fileoverview 真实 BOM 树的路径身份、状态、候选、DOM 保留与键盘交互。 */

import type { BomViewCandidate, BomViewState } from '@aiao/rxdb-plugin-bom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { h, nextTick, shallowRef } from 'vue';
import BomTree from '../BomTree.vue';
import { cleanupMounted, mountRender, pressKey, viewNode, viewState } from './fixtures.js';

const mountTree = (initial: BomViewState) => {
  const state = shallowRef(initial);
  const toggle = vi.fn<(path: readonly string[]) => void>();
  const edit = vi.fn<(occurrenceId: string) => void>();
  const host = mountRender(() => h(BomTree, { state: state.value, onToggle: toggle, onEdit: edit }));
  const update = async (next: BomViewState): Promise<void> => {
    state.value = next;
    await nextTick();
  };
  const items = (): HTMLElement[] => [...host.querySelectorAll<HTMLElement>('[role="treeitem"]')];
  return { host, state, toggle, edit, update, items };
};

const root = () => viewNode([], { itemId: 'root', itemNo: 'SC-100', hasChildren: true, expanded: true });

afterEach(cleanupMounted);

describe('BomTree（Vue）', () => {
  it('同一物料三条发生项分别显示数量，并按路径保持重排后的 DOM 身份', async () => {
    const first = viewNode(['one'], { quantity: { value: '2', uom: 'pcs' } });
    const second = viewNode(['two'], { quantity: { value: '3', uom: 'pcs' } });
    const third = viewNode(['three'], { quantity: { value: '1', uom: 'pcs' } });
    const initial = viewState({ phase: 'success', nodes: [root(), first, second, third] });
    const tree = mountTree(initial);
    expect(tree.host.querySelector('[role="tree"]')).not.toBeNull();
    const before = tree.items();
    expect(before).toHaveLength(4);
    expect(before[1].textContent).toContain('2');
    expect(before[2].textContent).toContain('3');
    expect(before[3].textContent).toContain('1');
    expect(before.slice(1).every(item => item.textContent?.includes('R10K'))).toBe(true);
    await tree.update({ ...initial, nodes: [root(), third, first, second] });
    expect(tree.items()[1]).toBe(before[3]);
    expect(tree.items()[2]).toBe(before[1]);
    expect(tree.items()[3]).toBe(before[2]);
    const edit = [...tree.items()[2].querySelectorAll('button')].find(button => button.textContent?.trim() === '编辑');
    expect(edit).toBeDefined();
    edit!.click();
    expect(tree.edit).toHaveBeenCalledWith('one');
    expect(tree.toggle).not.toHaveBeenCalled();
  });

  it('后台加载与刷新保留旧节点，替换一条路径时其它节点仍是原引用', async () => {
    const old = viewNode(['old']);
    const stable = viewNode(['stable'], { itemNo: 'WIRE' });
    const initial = viewState({ phase: 'success', nodes: [root(), old, stable] });
    const tree = mountTree(initial);
    const before = tree.items();
    await tree.update({ ...initial, phase: 'loading', refreshing: true });
    for (const [index, element] of before.entries()) expect(tree.items()[index]).toBe(element);
    expect(tree.host.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(tree.host.textContent).toMatch(/加载|刷新/);
    await tree.update({
      ...initial,
      nodes: [root(), viewNode(['new'], { quantity: { value: '5', uom: 'pcs' } }), { ...stable }]
    });
    expect(tree.items()[0]).toBe(before[0]);
    expect(tree.items()[2]).toBe(before[2]);
    expect(tree.items()[1]).not.toBe(before[1]);
    expect(before[1].isConnected).toBe(false);
    expect(tree.items()[1].textContent).toContain('5');
  });

  it('相同子装配的两条路径独立展开，只渲染 kernel 提供的可见后代', async () => {
    const left = viewNode(['left'], { itemNo: 'ASSY', hasChildren: true });
    const right = viewNode(['right'], { itemNo: 'ASSY', hasChildren: true });
    const initial = viewState({ phase: 'success', nodes: [root(), left, right] });
    const tree = mountTree(initial);
    expect(tree.items()).toHaveLength(3);
    expect(tree.items()[1].getAttribute('aria-level')).toBe('2');
    expect(tree.items()[1].getAttribute('aria-expanded')).toBe('false');
    expect(tree.items()[2].getAttribute('aria-expanded')).toBe('false');
    tree.items()[1].focus();
    await pressKey(tree.items()[1], 'ArrowRight');
    expect(tree.toggle).toHaveBeenCalledExactlyOnceWith(['left']);
    const rightElement = tree.items()[2];
    await tree.update({
      ...initial,
      nodes: [root(), { ...left, expanded: true }, viewNode(['left', 'leaf'], { itemNo: 'LEAF' }), right]
    });
    expect(tree.items()).toHaveLength(4);
    expect(tree.items()[1].getAttribute('aria-expanded')).toBe('true');
    expect(tree.items()[3]).toBe(rightElement);
    expect(rightElement.getAttribute('aria-expanded')).toBe('false');
    expect(tree.items()[2].hasAttribute('aria-expanded')).toBe(false);
  });

  it('上下与 Home/End 移动焦点，左右进入或返回父路径，Enter/Space 切换当前路径', async () => {
    const branch = viewNode(['branch'], { itemNo: 'ASSY', hasChildren: true, expanded: true });
    const tree = mountTree(
      viewState({ phase: 'success', nodes: [root(), branch, viewNode(['branch', 'leaf']), viewNode(['other'])] })
    );
    const items = tree.items();
    expect(items.filter(item => item.tabIndex === 0)).toHaveLength(1);
    items[0].focus();
    await pressKey(items[0], 'ArrowDown');
    expect(document.activeElement).toBe(items[1]);
    await pressKey(items[1], 'ArrowRight');
    expect(document.activeElement).toBe(items[2]);
    await pressKey(items[2], 'ArrowLeft');
    expect(document.activeElement).toBe(items[1]);
    await pressKey(items[1], 'End');
    expect(document.activeElement).toBe(items[3]);
    await pressKey(items[3], 'Home');
    expect(document.activeElement).toBe(items[0]);
    await pressKey(items[0], 'ArrowDown');
    await pressKey(items[1], 'ArrowUp');
    expect(document.activeElement).toBe(items[0]);
    items[1].focus();
    await pressKey(items[1], 'ArrowLeft');
    await pressKey(items[1], 'Enter');
    const space = await pressKey(items[1], ' ');
    expect(space.defaultPrevented).toBe(true);
    expect(tree.toggle.mock.calls.map(call => call[0])).toEqual([['branch'], ['branch'], ['branch']]);
  });

  it.each(['alternative', 'manual', 'unit', 'lot'] as const)(
    '展示 %s 候选、截断与独立的数量错误，不默认选候选',
    kind => {
      const group: BomViewCandidate = {
        key: 'unresolved-group',
        kind,
        candidates: [
          { key: 'a', label: '候选 A' },
          { key: 'b', label: '候选 B' }
        ]
      };
      const tree = mountTree(
        viewState({
          phase: 'success',
          nodes: [root(), viewNode(['part'], { quantity: null })],
          unresolved: [group],
          truncated: { reason: 'depth' },
          quantityError: new Error('数量不可消费：结构未解析')
        })
      );
      expect(tree.host.textContent).toContain('未解析');
      expect(tree.host.textContent).toContain('候选 A');
      expect(tree.host.textContent).toContain('候选 B');
      expect(tree.host.textContent).toContain('截断');
      expect(tree.host.textContent).toMatch(/depth|深度/);
      expect(tree.host.textContent).toContain('数量不可消费：结构未解析');
      expect(tree.toggle).not.toHaveBeenCalled();
      expect(tree.edit).not.toHaveBeenCalled();
    }
  );

  it('加载、空结果、错误均可见，错误保留原始业务消息', async () => {
    const tree = mountTree(viewState({ phase: 'loading' }));
    expect(tree.host.textContent).toMatch(/加载/);
    expect(tree.host.querySelector('[role="status"],[aria-live]')).not.toBeNull();
    await tree.update(viewState({ phase: 'empty' }));
    expect(tree.host.textContent).toMatch(/暂无|没有|无数据/);
    expect(tree.items()).toHaveLength(0);
    await tree.update(viewState({ phase: 'error', error: new Error('BOM 读取失败：组织不存在') }));
    expect(tree.host.textContent).toContain('BOM 读取失败：组织不存在');
    expect(tree.host.querySelector('[role="alert"]')).not.toBeNull();
  });
});
