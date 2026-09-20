import type { FieldTreeNode } from '@aiao/rxdb-model';
import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import TreeSelect from '../../../query-builder/tree-select/TreeSelect.vue';

/**
 * TreeSelect —— **真实加载组件源码**（对齐 Angular 侧 specs/027 T025a）。
 *
 * happy-dom 无原生 Popover API，`showPopover`/`hidePopover` 需打桩；
 * 除此之外全部走真实的树展开 / 过滤 / 键盘导航实现（CDK KeyManager 由包内实现替代）。
 */

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

interface TreeKeyManagerLike {
  activeItemIndex: number;
  setActiveItem(index: number): void;
}

type TreeSelectVM = InstanceType<typeof TreeSelect> & {
  filterText: string;
  _activeIdx: number;
  keyManager: TreeKeyManagerLike;
  displayValue: string;
  selectedNode: FieldTreeNode | null;
  visibleItems: Array<{ node: FieldTreeNode; depth: number; isExpandable: boolean; isExpanded: boolean }>;
  activeItemId: string | null;
  onBeforeToggle(event: Event): void;
  onToggle(event: Event): void;
  onKeydown(event: KeyboardEvent): void;
  onItemClick(item: { node: FieldTreeNode }): void;
  scrollActiveIntoView(): void;
};

describe('TreeSelect（真实组件）', () => {
  function render(inputs: Partial<{ nodes: FieldTreeNode[]; selected: string; placeholder: string }> = {}) {
    const wrapper = mount(TreeSelect, {
      props: {
        nodes: inputs.nodes ?? NODES,
        selected: inputs.selected ?? '',
        ...(inputs.placeholder ? { placeholder: inputs.placeholder } : {})
      }
    });
    const component = wrapper.vm as unknown as TreeSelectVM;

    // happy-dom 没有 Popover API
    const popover = wrapper.element.querySelector('[popover]') as HTMLElement;
    popover.hidePopover = vi.fn();
    popover.showPopover = vi.fn();

    return { wrapper, component, popover };
  }

  let host: ReturnType<typeof render>;

  beforeEach(() => {
    host = render();
  });

  it('未选中时显示 placeholder，选中后显示显示名路径', () => {
    expect(render({ placeholder: '请选择字段' }).component.displayValue).toBe('请选择字段');
    expect(render({ selected: 'author.name' }).component.displayValue).toContain('姓名');
  });

  it('selectedNode 按 value 定位到树中节点，未选中时为 null', () => {
    expect(host.component.selectedNode).toBeNull();
    expect(render({ selected: 'author.email' }).component.selectedNode?.displayName).toBe('邮箱');
  });

  it('默认只展示顶层节点，子节点收起', () => {
    const values = host.component.visibleItems.map(i => i.node.value);

    expect(values).toEqual(['title', 'author', 'views']);
    expect(host.component.visibleItems.find(i => i.node.value === 'author')?.isExpandable).toBe(true);
  });

  it('点击可展开节点只切换展开态，不 emit 选中', async () => {
    const authorItem = host.component.visibleItems.find(i => i.node.value === 'author')!;
    host.component.onItemClick(authorItem);
    await host.wrapper.vm.$nextTick();

    expect(host.component.visibleItems.map(i => i.node.value)).toEqual([
      'title',
      'author',
      'author.name',
      'author.email',
      'views'
    ]);
    expect(host.wrapper.emitted('selectChange')).toBeUndefined();

    // 再点一次收起
    host.component.onItemClick(host.component.visibleItems.find(i => i.node.value === 'author')!);
    await host.wrapper.vm.$nextTick();
    expect(host.component.visibleItems.map(i => i.node.value)).toEqual(['title', 'author', 'views']);
  });

  it('点击叶子节点 emit 值并关闭弹层', () => {
    const leaf = host.component.visibleItems.find(i => i.node.value === 'title')!;
    host.component.onItemClick(leaf);

    expect(host.wrapper.emitted('selectChange')).toEqual([['title']]);
    expect(host.popover.hidePopover).toHaveBeenCalled();
  });

  it('过滤命中子节点时自动展开其父节点', async () => {
    (host.wrapper.vm as unknown as { filterText: string }).filterText = '邮箱';
    await host.wrapper.vm.$nextTick();

    const values = host.component.visibleItems.map(i => i.node.value);
    expect(values).toContain('author');
    expect(values).toContain('author.email');
    expect(values).not.toContain('title');
  });

  it('过滤同时匹配 label / displayName / description', async () => {
    const byLabel = render();
    (byLabel.wrapper.vm as unknown as { filterText: string }).filterText = 'views';
    await byLabel.wrapper.vm.$nextTick();
    expect(byLabel.component.visibleItems.map(i => i.node.value)).toContain('views');

    const byDisplayName = render();
    (byDisplayName.wrapper.vm as unknown as { filterText: string }).filterText = '标题';
    await byDisplayName.wrapper.vm.$nextTick();
    expect(byDisplayName.component.visibleItems.map(i => i.node.value)).toContain('title');

    const byDescription = render();
    (byDescription.wrapper.vm as unknown as { filterText: string }).filterText = '联系';
    await byDescription.wrapper.vm.$nextTick();
    expect(byDescription.component.visibleItems.map(i => i.node.value)).toContain('author.email');
  });

  it('过滤无命中时可见项为空', async () => {
    (host.wrapper.vm as unknown as { filterText: string }).filterText = 'zzz-not-a-field';
    await host.wrapper.vm.$nextTick();
    expect(host.component.visibleItems).toEqual([]);
  });

  it('ArrowRight 展开当前项，ArrowLeft 收起', async () => {
    host.component.keyManager.setActiveItem(1); // author
    host.component.onKeydown(new KeyboardEvent('keydown', { key: 'ArrowRight', cancelable: true }));
    await host.wrapper.vm.$nextTick();
    expect(host.component.visibleItems.map(i => i.node.value)).toContain('author.name');

    host.component.onKeydown(new KeyboardEvent('keydown', { key: 'ArrowLeft', cancelable: true }));
    await host.wrapper.vm.$nextTick();
    expect(host.component.visibleItems.map(i => i.node.value)).not.toContain('author.name');
  });

  it('Enter 选中当前高亮项', () => {
    host.component.keyManager.setActiveItem(0); // title
    host.component.onKeydown(new KeyboardEvent('keydown', { key: 'Enter', cancelable: true }));

    expect(host.wrapper.emitted('selectChange')).toEqual([['title']]);
  });

  it('Escape 与 Tab 都关闭弹层', () => {
    host.component.onKeydown(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true }));
    expect(host.popover.hidePopover).toHaveBeenCalledTimes(1);

    host.component.onKeydown(new KeyboardEvent('keydown', { key: 'Tab', cancelable: true }));
    expect(host.popover.hidePopover).toHaveBeenCalledTimes(2);
  });

  it('未识别的按键不做任何事', () => {
    const event = new KeyboardEvent('keydown', { key: 'a', cancelable: true });
    host.component.onKeydown(event);

    expect(event.defaultPrevented).toBe(false);
    expect(host.wrapper.emitted('selectChange')).toBeUndefined();
  });

  it('关闭弹层时清空高亮索引，activeItemId 转 null', () => {
    (host.wrapper.vm as unknown as { _activeIdx: number })._activeIdx = 1;
    expect(host.component.activeItemId).not.toBeNull();

    host.component.onBeforeToggle(Object.assign(new Event('beforetoggle'), { newState: 'closed' }));
    expect(host.component.activeItemId).toBeNull();
  });
});

describe('TreeSelect（键盘导航收尾）', () => {
  function render() {
    const wrapper = mount(TreeSelect, {
      props: { nodes: NODES, selected: '' }
    });
    const popover = wrapper.element.querySelector('[popover]') as HTMLElement;
    popover.hidePopover = vi.fn();
    popover.showPopover = vi.fn();
    return { wrapper, component: wrapper.vm as unknown as TreeSelectVM };
  }

  it('ArrowDown / ArrowUp 移动高亮并滚动可见项', () => {
    const { wrapper, component } = render();
    void wrapper;

    const down = new KeyboardEvent('keydown', { key: 'ArrowDown', cancelable: true });
    component.onKeydown(down);
    expect(down.defaultPrevented).toBe(true);
    expect(component.keyManager.activeItemIndex).not.toBe(-1);

    const up = new KeyboardEvent('keydown', { key: 'ArrowUp', cancelable: true });
    component.onKeydown(up);
    expect(up.defaultPrevented).toBe(true);
  });

  it('无活动项时 scrollActiveIntoView 安全返回', () => {
    const { component } = render();

    component.keyManager.setActiveItem(-1);
    expect(() => component.scrollActiveIntoView()).not.toThrow();
  });
});
