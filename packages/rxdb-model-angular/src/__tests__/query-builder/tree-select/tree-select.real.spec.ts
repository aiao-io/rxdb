import type { FieldTreeNode } from '@aiao/rxdb-model';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TreeSelectComponent } from '../../../query-builder/tree-select/tree-select.component';

/**
 * TreeSelectComponent —— **真实加载组件源码**（specs/027 T025a）。
 *
 * happy-dom 无原生 Popover API，`showPopover`/`hidePopover` 需打桩；
 * 除此之外全部走真实的树展开 / 过滤 / 键盘导航实现。
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

describe('TreeSelectComponent（真实组件）', () => {
  function render(inputs: Partial<{ nodes: FieldTreeNode[]; selected: string; placeholder: string }> = {}) {
    const fixture = TestBed.createComponent(TreeSelectComponent);
    fixture.componentRef.setInput('nodes', inputs.nodes ?? NODES);
    fixture.componentRef.setInput('selected', inputs.selected ?? '');
    if (inputs.placeholder) fixture.componentRef.setInput('placeholder', inputs.placeholder);
    fixture.detectChanges();

    // happy-dom 没有 Popover API
    const popover = fixture.nativeElement.querySelector('[popover]') as HTMLElement;
    popover.hidePopover = vi.fn();
    popover.showPopover = vi.fn();

    const selected: string[] = [];
    fixture.componentInstance.selectChange.subscribe(v => selected.push(v));
    return { fixture, component: fixture.componentInstance, popover, selected };
  }

  let host: ReturnType<typeof render>;

  beforeEach(() => {
    host = render();
  });

  it('未选中时显示 placeholder，选中后显示显示名路径', () => {
    expect(render({ placeholder: '请选择字段' }).component.displayValue()).toBe('请选择字段');
    expect(render({ selected: 'author.name' }).component.displayValue()).toContain('姓名');
  });

  it('selectedNode 按 value 定位到树中节点，未选中时为 null', () => {
    expect(host.component.selectedNode()).toBeNull();
    expect(render({ selected: 'author.email' }).component.selectedNode()?.displayName).toBe('邮箱');
  });

  it('默认只展示顶层节点，子节点收起', () => {
    const values = host.component.visibleItems().map(i => i.node.value);

    expect(values).toEqual(['title', 'author', 'views']);
    expect(host.component.visibleItems().find(i => i.node.value === 'author')?.isExpandable).toBe(true);
  });

  it('点击可展开节点只切换展开态，不 emit 选中', () => {
    const authorItem = host.component.visibleItems().find(i => i.node.value === 'author')!;
    host.component.onItemClick(authorItem);
    host.fixture.detectChanges();

    expect(host.component.visibleItems().map(i => i.node.value)).toEqual([
      'title',
      'author',
      'author.name',
      'author.email',
      'views'
    ]);
    expect(host.selected).toEqual([]);

    // 再点一次收起
    host.component.onItemClick(host.component.visibleItems().find(i => i.node.value === 'author')!);
    host.fixture.detectChanges();
    expect(host.component.visibleItems().map(i => i.node.value)).toEqual(['title', 'author', 'views']);
  });

  it('点击叶子节点 emit 值并关闭弹层', () => {
    const leaf = host.component.visibleItems().find(i => i.node.value === 'title')!;
    host.component.onItemClick(leaf);

    expect(host.selected).toEqual(['title']);
    expect(host.popover.hidePopover).toHaveBeenCalled();
  });

  it('过滤命中子节点时自动展开其父节点', () => {
    host.component['filterText'].set('邮箱');
    host.fixture.detectChanges();

    const values = host.component.visibleItems().map(i => i.node.value);
    expect(values).toContain('author');
    expect(values).toContain('author.email');
    expect(values).not.toContain('title');
  });

  it('过滤同时匹配 label / displayName / description', () => {
    const byLabel = render();
    byLabel.component['filterText'].set('views');
    expect(byLabel.component.visibleItems().map(i => i.node.value)).toContain('views');

    const byDisplayName = render();
    byDisplayName.component['filterText'].set('标题');
    expect(byDisplayName.component.visibleItems().map(i => i.node.value)).toContain('title');

    const byDescription = render();
    byDescription.component['filterText'].set('联系');
    expect(byDescription.component.visibleItems().map(i => i.node.value)).toContain('author.email');
  });

  it('过滤无命中时可见项为空', () => {
    host.component['filterText'].set('zzz-not-a-field');
    expect(host.component.visibleItems()).toEqual([]);
  });

  it('ArrowRight 展开当前项，ArrowLeft 收起', () => {
    host.component['keyManager'].setActiveItem(1); // author
    host.component.onKeydown(new KeyboardEvent('keydown', { key: 'ArrowRight', cancelable: true }));
    host.fixture.detectChanges();
    expect(host.component.visibleItems().map(i => i.node.value)).toContain('author.name');

    host.component.onKeydown(new KeyboardEvent('keydown', { key: 'ArrowLeft', cancelable: true }));
    host.fixture.detectChanges();
    expect(host.component.visibleItems().map(i => i.node.value)).not.toContain('author.name');
  });

  it('Enter 选中当前高亮项', () => {
    host.component['keyManager'].setActiveItem(0); // title
    host.component.onKeydown(new KeyboardEvent('keydown', { key: 'Enter', cancelable: true }));

    expect(host.selected).toEqual(['title']);
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
    expect(host.selected).toEqual([]);
  });

  it('关闭弹层时清空高亮索引，activeItemId 转 null', () => {
    host.component['_activeIdx'].set(1);
    expect(host.component.activeItemId()).not.toBeNull();

    host.component.onBeforeToggle(Object.assign(new Event('beforetoggle'), { newState: 'closed' }));
    expect(host.component.activeItemId()).toBeNull();
  });
});

describe('TreeSelectComponent（键盘导航收尾）', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
  });

  it('ArrowDown / ArrowUp 移动高亮并滚动可见项', () => {
    const fixture = TestBed.createComponent(TreeSelectComponent);
    const component = fixture.componentInstance;
    fixture.componentRef.setInput('nodes', NODES);
    fixture.componentRef.setInput('selected', '');
    fixture.detectChanges();

    const down = new KeyboardEvent('keydown', { key: 'ArrowDown', cancelable: true });
    component.onKeydown(down);
    expect(down.defaultPrevented).toBe(true);
    expect(component['keyManager'].activeItemIndex).not.toBeNull();

    const up = new KeyboardEvent('keydown', { key: 'ArrowUp', cancelable: true });
    component.onKeydown(up);
    expect(up.defaultPrevented).toBe(true);
  });

  it('无活动项时 scrollActiveIntoView 安全返回', () => {
    const fixture = TestBed.createComponent(TreeSelectComponent);
    const component = fixture.componentInstance;
    fixture.componentRef.setInput('nodes', NODES);
    fixture.componentRef.setInput('selected', '');
    fixture.detectChanges();

    component['keyManager'].setActiveItem(-1);
    expect(() => component['scrollActiveIntoView']()).not.toThrow();
  });
});
