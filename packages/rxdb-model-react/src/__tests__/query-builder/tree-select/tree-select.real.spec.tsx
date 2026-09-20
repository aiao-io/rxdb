/**
 * TreeSelect —— **真实组件源码**（Angular `tree-select.real.spec.ts` 的 React 移植）。
 *
 * happy-dom 无原生 Popover API，`showPopover`/`hidePopover` 需打桩；
 * 除此之外全部走真实的树展开 / 过滤 / 键盘导航实现（React 侧经 DOM 事件驱动，
 * 对应 Angular 侧 keyManager 的键盘导航语义）。
 */
import type { FieldTreeNode } from '@aiao/rxdb-model';
import { act, fireEvent, render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TreeSelect } from '../../../query-builder/tree-select/tree-select';

function node(over: Partial<FieldTreeNode> & Pick<FieldTreeNode, 'label' | 'value'>): FieldTreeNode {
  return {
    displayName: over.displayName ?? over.label,
    type: 'string',
    isRelation: false,
    ...over
  } as FieldTreeNode;
}

const NODES: FieldTreeNode[] = [
  node({ label: 'title', value: 'title', displayName: '标题' }),
  node({
    label: 'author',
    value: 'author',
    displayName: '作者',
    isRelation: true,
    children: [
      node({ label: 'name', value: 'author.name', displayName: '姓名' }),
      node({ label: 'email', value: 'author.email', displayName: '邮箱', description: '联系邮箱' })
    ]
  }),
  node({ label: 'views', value: 'views', displayName: '浏览量', type: 'number' } as Partial<FieldTreeNode> as never)
];

describe('TreeSelect（真实组件）', () => {
  function renderTree(props: Partial<{ nodes: FieldTreeNode[]; selected: string; placeholder: string }> = {}) {
    const selected: string[] = [];
    const utils = render(
      <TreeSelect
        nodes={props.nodes ?? NODES}
        selected={props.selected ?? ''}
        placeholder={props.placeholder}
        onSelectChange={value => selected.push(value)}
      />
    );

    // happy-dom 没有 Popover API
    const popover = utils.container.querySelector('[popover]') as HTMLElement;
    popover.hidePopover = vi.fn();
    popover.showPopover = vi.fn();

    return { ...utils, popover, selected };
  }

  /** 打开弹层（beforetoggle + toggle open，与浏览器行为一致）。 */
  function openPopover(host: ReturnType<typeof renderTree>): void {
    act(() => {
      host.popover.dispatchEvent(Object.assign(new Event('beforetoggle'), { newState: 'open' }));
      host.popover.dispatchEvent(Object.assign(new Event('toggle'), { newState: 'open' }));
    });
  }

  let host: ReturnType<typeof renderTree>;

  beforeEach(() => {
    host = renderTree();
  });

  it('未选中时显示 placeholder，选中后显示显示名路径', () => {
    expect(
      (
        renderTree({ placeholder: '请选择字段' }).container.querySelector('button') as HTMLButtonElement
      ).textContent?.trim()
    ).toBe('请选择字段');
    expect(
      (
        renderTree({ selected: 'author.name' }).container.querySelector('button') as HTMLButtonElement
      ).textContent?.trim()
    ).toContain('姓名');
  });

  it('默认只展示顶层节点，子节点收起', () => {
    openPopover(host);
    const items = [...host.container.querySelectorAll('[role="treeitem"]')] as HTMLElement[];
    const texts = items.map(i => i.textContent ?? '');
    expect(texts.some(t => t.includes('标题'))).toBe(true);
    expect(texts.some(t => t.includes('作者'))).toBe(true);
    expect(texts.some(t => t.includes('浏览量'))).toBe(true);
    expect(items).toHaveLength(3);

    const authorBtn = items.find(i => i.textContent?.includes('作者'))!;
    expect(authorBtn.getAttribute('aria-expanded')).toBe('false');
  });

  it('点击可展开节点只切换展开态，不 emit 选中', () => {
    openPopover(host);
    const items = [...host.container.querySelectorAll('[role="treeitem"]')] as HTMLElement[];
    const authorBtn = items.find(i => i.textContent?.includes('作者'))!;

    fireEvent.click(authorBtn);

    const after = [...host.container.querySelectorAll('[role="treeitem"]')];
    expect(after.map(i => i.textContent)).toHaveLength(5);
    expect(host.selected).toEqual([]);

    // 再点一次收起
    fireEvent.click(after.find(i => i.textContent?.includes('作者'))!);
    expect(host.container.querySelectorAll('[role="treeitem"]')).toHaveLength(3);
  });

  it('点击叶子节点 emit 值并关闭弹层', () => {
    openPopover(host);
    const titleBtn = [...host.container.querySelectorAll('[role="treeitem"]')].find(i =>
      i.textContent?.includes('标题')
    )!;

    fireEvent.click(titleBtn);

    expect(host.selected).toEqual(['title']);
    expect(host.popover.hidePopover).toHaveBeenCalled();
  });

  it('过滤命中子节点时自动展开其父节点', () => {
    openPopover(host);
    fireEvent.change(host.container.querySelector('input[role="combobox"]')!, { target: { value: '邮箱' } });

    const texts = [...host.container.querySelectorAll('[role="treeitem"]')].map(i => i.textContent);
    expect(texts.some(t => t?.includes('作者'))).toBe(true);
    expect(texts.some(t => t?.includes('邮箱'))).toBe(true);
    expect(texts.some(t => t?.includes('标题'))).toBe(false);
  });

  it('过滤同时匹配 label / displayName / description', () => {
    const byLabel = renderTree();
    openPopover(byLabel);
    fireEvent.change(byLabel.container.querySelector('input[role="combobox"]')!, { target: { value: 'views' } });
    expect([...byLabel.container.querySelectorAll('[role="treeitem"]')].map(i => i.textContent)).toHaveLength(1);

    const byDisplayName = renderTree();
    openPopover(byDisplayName);
    fireEvent.change(byDisplayName.container.querySelector('input[role="combobox"]')!, {
      target: { value: '标题' }
    });
    expect(byDisplayName.container.querySelectorAll('[role="treeitem"]')).toHaveLength(1);

    const byDescription = renderTree();
    openPopover(byDescription);
    fireEvent.change(byDescription.container.querySelector('input[role="combobox"]')!, {
      target: { value: '联系' }
    });
    const texts = [...byDescription.container.querySelectorAll('[role="treeitem"]')].map(i => i.textContent);
    expect(texts.some(t => t?.includes('邮箱'))).toBe(true);
  });

  it('过滤无命中时可见项为空', () => {
    openPopover(host);
    fireEvent.change(host.container.querySelector('input[role="combobox"]')!, {
      target: { value: 'zzz-not-a-field' }
    });

    expect(host.container.querySelectorAll('[role="treeitem"]')).toHaveLength(0);
    expect(host.container.textContent).toContain('无匹配字段');
  });

  it('ArrowRight 展开当前项，ArrowLeft 收起', () => {
    openPopover(host);
    // 打开后高亮第一项（标题）；下移到「作者」
    fireEvent.keyDown(host.popover, { key: 'ArrowDown' });
    fireEvent.keyDown(host.popover, { key: 'ArrowRight' });
    expect(host.container.querySelectorAll('[role="treeitem"]')).toHaveLength(5);

    fireEvent.keyDown(host.popover, { key: 'ArrowLeft' });
    expect(host.container.querySelectorAll('[role="treeitem"]')).toHaveLength(3);
  });

  it('Enter 选中当前高亮项', () => {
    openPopover(host);
    // 打开后高亮第一项（标题）
    fireEvent.keyDown(host.popover, { key: 'Enter' });

    expect(host.selected).toEqual(['title']);
  });

  it('Escape 与 Tab 都关闭弹层', () => {
    openPopover(host);
    fireEvent.keyDown(host.popover, { key: 'Escape' });
    expect(host.popover.hidePopover).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(host.popover, { key: 'Tab' });
    expect(host.popover.hidePopover).toHaveBeenCalledTimes(2);
  });

  it('未识别的按键不做任何事', () => {
    openPopover(host);
    const event = new KeyboardEvent('keydown', { key: 'a', cancelable: true });
    fireEvent(host.popover, event);

    expect(event.defaultPrevented).toBe(false);
    expect(host.selected).toEqual([]);
  });

  it('关闭弹层时清空高亮索引（aria-activedescendant 移除）', () => {
    openPopover(host);
    expect(host.container.querySelector('input[role="combobox"]')?.getAttribute('aria-activedescendant')).toBeTruthy();

    act(() => {
      host.popover.dispatchEvent(Object.assign(new Event('beforetoggle'), { newState: 'closed' }));
    });
    expect(host.container.querySelector('input[role="combobox"]')?.getAttribute('aria-activedescendant')).toBeNull();
  });

  it('ArrowDown / ArrowUp 循环移动高亮', () => {
    openPopover(host);
    fireEvent.keyDown(host.popover, { key: 'ArrowDown' });
    expect(host.container.querySelector('.menu-focus')?.textContent).toContain('作者');

    fireEvent.keyDown(host.popover, { key: 'ArrowUp' });
    expect(host.container.querySelector('.menu-focus')?.textContent).toContain('标题');
  });
});
