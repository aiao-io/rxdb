import type { FieldMetadata } from '@aiao/rxdb-model';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryDragDropHandler, QueryGroupComponent, type UIRuleGroup } from './query-group.component';

/**
 * QueryGroupComponent + QueryDragDropHandler —— **真实加载源码**（specs/027 T025a）。
 *
 * 拖拽路径此前零覆盖：`onItemDrop` 的索引调整（同组内向后拖要 -1）、
 * 「拖进子组」与「拖到前/后」两条分支都是真实缺陷高发区。
 */

const FIELDS: FieldMetadata[] = [
  { name: 'title', type: 'string' },
  { name: 'published', type: 'boolean' }
] as FieldMetadata[];

function group(over: Partial<UIRuleGroup> = {}): UIRuleGroup {
  return {
    id: 'root',
    combinator: 'and',
    rules: [],
    ...over
  } as UIRuleGroup;
}

function rule(id: string) {
  return { id, field: 'title', operator: '=', value: '' };
}

describe('QueryDragDropHandler（真实类）', () => {
  it('start 记录被拖项，end 复位', () => {
    const handler = new QueryDragDropHandler(() => undefined);
    handler.start('r1');
    expect(handler.state().draggedItemId).toBe('r1');

    handler.end();
    expect(handler.state().draggedItemId).toBeNull();
  });

  it('over 记录目标与放置模式，leave 清掉目标但保留被拖项', () => {
    const handler = new QueryDragDropHandler(() => undefined);
    handler.start('r1');
    handler.over('r2', 'before', true, 0);

    expect(handler.state()).toMatchObject({ targetItemId: 'r2', dropMode: 'before', isValidTarget: true });

    handler.leave();
    expect(handler.state().targetItemId).toBeNull();
    expect(handler.state().draggedItemId).toBe('r1');
  });

  it('更深层的 over 优先：浅层事件不覆盖深层目标', () => {
    const handler = new QueryDragDropHandler(() => undefined);
    handler.start('r1');
    handler.over('deep', 'into', true, 2);
    handler.over('shallow', 'before', true, 0);

    expect(handler.state().targetItemId).toBe('deep');
  });

  it('drop 调 moveItemFn 并复位', () => {
    const moved: unknown[] = [];
    const handler = new QueryDragDropHandler((...args) => moved.push(args));
    handler.start('r1');
    handler.drop('r1', 'g1', 2);

    expect(moved).toEqual([['r1', 'g1', 2]]);
    expect(handler.state().draggedItemId).toBeNull();
  });

  it('moveItemFn 抛错（如循环嵌套被服务层拒绝）时静默复位，不冒泡', () => {
    const handler = new QueryDragDropHandler(() => {
      throw new Error('circular nesting');
    });
    handler.start('r1');

    expect(() => handler.drop('r1', 'g1', 0)).not.toThrow();
    expect(handler.state().draggedItemId).toBeNull();
  });
});

describe('QueryGroupComponent（真实组件）', () => {
  describe('嵌套层级上限（US-210 AC#3）', () => {
    it('未达上限时「+ 分组」可用且无提示文案', () => {
      const { fixture } = render({}, { depth: 0, maxDepth: 5 });
      fixture.detectChanges();
      const el = fixture.nativeElement as HTMLElement;

      const addGroupBtn = [...el.querySelectorAll('button')].find(b => b.textContent?.includes('+ 分组'));
      expect(addGroupBtn, '「+ 分组」按钮应存在').toBeTruthy();
      expect(addGroupBtn?.hasAttribute('disabled')).toBe(false);
      expect(el.textContent).not.toContain('已达最大嵌套层级');
    });

    it('达到上限时按钮保留但禁用，并给出可见原因（不再静默消失）', () => {
      // ⚠️ 这条钉住的是一个真实缺陷：此前用 `@if (canAddGroup())`，
      // 到达上限时按钮**直接消失**，页面上零解释文案——用户不知道发生了什么。
      const { fixture } = render({}, { depth: 4, maxDepth: 5 });
      fixture.detectChanges();
      const el = fixture.nativeElement as HTMLElement;

      const addGroupBtn = [...el.querySelectorAll('button')].find(b => b.textContent?.includes('+ 分组'));
      expect(addGroupBtn, '按钮必须仍然存在，不能静默消失').toBeTruthy();
      expect(addGroupBtn?.hasAttribute('disabled')).toBe(true);
      expect(addGroupBtn?.getAttribute('aria-disabled')).toBe('true');
      expect(addGroupBtn?.getAttribute('title')).toContain('已达最大嵌套层级');

      // 可见提示（不依赖 hover）
      const hint = el.querySelector('[role="status"]');
      expect(hint?.textContent, '应有可见的上限说明').toContain('已达最大嵌套层级（5 层）');
    });

    it('达到上限时程序化调用 onAddGroup 也不派发事件', () => {
      const { fixture, events } = render({}, { depth: 4, maxDepth: 5 });
      fixture.detectChanges();

      fixture.componentInstance.onAddGroup();
      expect(events.addGroup).toEqual([]);
    });

    it('提示文案跟随 maxDepth 变化', () => {
      const { fixture } = render({}, { depth: 2, maxDepth: 3 });
      fixture.detectChanges();
      const el = fixture.nativeElement as HTMLElement;

      expect(el.querySelector('[role="status"]')?.textContent).toContain('3 层');
    });
  });

  function render(
    over: Partial<UIRuleGroup> = {},
    opts: { depth?: number; maxDepth?: number; handler?: QueryDragDropHandler } = {}
  ) {
    const fixture = TestBed.createComponent(QueryGroupComponent);
    fixture.componentRef.setInput('group', group(over));
    fixture.componentRef.setInput('fields', FIELDS);
    fixture.componentRef.setInput('depth', opts.depth ?? 0);
    fixture.componentRef.setInput('maxDepth', opts.maxDepth ?? 5);
    if (opts.handler) fixture.componentRef.setInput('dragDropHandler', opts.handler);

    const events = {
      addRule: [] as unknown[],
      addGroup: [] as string[],
      removeItem: [] as string[],
      updateCombinator: [] as unknown[],
      updateRule: [] as unknown[]
    };
    fixture.componentInstance.addRule.subscribe(e => events.addRule.push(e));
    fixture.componentInstance.addGroup.subscribe(e => events.addGroup.push(e));
    fixture.componentInstance.removeItem.subscribe(e => events.removeItem.push(e));
    fixture.componentInstance.updateCombinator.subscribe(e => events.updateCombinator.push(e));
    fixture.componentInstance.updateRule.subscribe(e => events.updateRule.push(e));
    fixture.detectChanges();
    return { fixture, component: fixture.componentInstance, events };
  }

  let host: ReturnType<typeof render>;

  beforeEach(() => {
    host = render();
  });

  it('toggleCollapse 切换收起状态', () => {
    expect(host.component.collapsed()).toBe(false);
    host.component.toggleCollapse();
    expect(host.component.collapsed()).toBe(true);
    host.component.toggleCollapse();
    expect(host.component.collapsed()).toBe(false);
  });

  it('切到不同组合器才 emit，重复点当前值不 emit', () => {
    host.component.toggleCombinator('or');
    expect(host.events.updateCombinator).toEqual([{ id: 'root', combinator: 'or' }]);

    host.component.toggleCombinator('and');
    expect(host.events.updateCombinator.length).toBe(1);
  });

  it('canAddGroup 在还差一层到达 maxDepth 时转 false', () => {
    expect(render({}, { depth: 0, maxDepth: 5 }).component.canAddGroup()).toBe(true);
    expect(render({}, { depth: 3, maxDepth: 5 }).component.canAddGroup()).toBe(true);
    expect(render({}, { depth: 4, maxDepth: 5 }).component.canAddGroup()).toBe(false);
    expect(render({}, { depth: 5, maxDepth: 5 }).component.canAddGroup()).toBe(false);
  });

  it('onAddRule 用首个字段构造规则；boolean 默认 false、关系字段用 exists', () => {
    host.component.onAddRule();
    expect(host.events.addRule).toEqual([{ parentId: 'root', rule: { field: 'title', operator: '=', value: '' } }]);

    const boolFirst = render();
    boolFirst.fixture.componentRef.setInput('fields', [FIELDS[1], FIELDS[0]]);
    boolFirst.fixture.detectChanges();
    boolFirst.component.onAddRule();
    expect(boolFirst.events.addRule[0]).toMatchObject({ rule: { field: 'published', value: false } });

    const relationFirst = render();
    relationFirst.fixture.componentRef.setInput('fields', [{ name: 'author', type: 'string', isRelation: true }]);
    relationFirst.fixture.detectChanges();
    relationFirst.component.onAddRule();
    expect(relationFirst.events.addRule[0]).toMatchObject({ rule: { operator: 'exists' } });
  });

  it('fields 为空时 onAddRule 是 no-op', () => {
    const empty = render();
    empty.fixture.componentRef.setInput('fields', []);
    empty.fixture.detectChanges();
    empty.component.onAddRule();

    expect(empty.events.addRule).toEqual([]);
  });

  it('onAddGroup / onRemove 透传本组 id', () => {
    host.component.onAddGroup();
    host.component.onRemove();

    expect(host.events.addGroup).toEqual(['root']);
    expect(host.events.removeItem).toEqual(['root']);
  });

  it('isRuleGroup / asRuleGroup / asRule 按 rules 字段判别', () => {
    const child = group({ id: 'g1' });
    expect(host.component.isRuleGroup(child)).toBe(true);
    expect(host.component.isRuleGroup(rule('r1') as never)).toBe(false);
    expect(host.component.asRuleGroup(child).id).toBe('g1');
    expect(host.component.asRule(rule('r1') as never).id).toBe('r1');
  });

  it('无 dragDropHandler 时拖拽查询函数全部安全返回 false', () => {
    expect(host.component.isDragging('r1')).toBe(false);
    expect(host.component.isDropTarget('r1', 'before')).toBe(false);
    expect(host.component.isDropInvalid('r1')).toBe(false);
  });

  it('isDropTarget 要求目标 / 模式 / 有效性三者同时匹配', () => {
    const handler = new QueryDragDropHandler(() => undefined);
    const withHandler = render({}, { handler });
    handler.start('r1');
    handler.over('r2', 'before', true, 0);

    expect(withHandler.component.isDragging('r1')).toBe(true);
    expect(withHandler.component.isDropTarget('r2', 'before')).toBe(true);
    expect(withHandler.component.isDropTarget('r2', 'after')).toBe(false);
    expect(withHandler.component.isDropInvalid('r2')).toBe(false);
  });

  it('isDropInvalid 在目标非法且确有拖拽中的项时为真', () => {
    const handler = new QueryDragDropHandler(() => undefined);
    const withHandler = render({}, { handler });
    handler.start('r1');
    handler.over('r1', 'into', false, 0);

    expect(withHandler.component.isDropInvalid('r1')).toBe(true);
  });

  it('drop 到同组更靠后的位置时索引 -1（补偿被拖项移走后的位移）', () => {
    const moved: Array<[string, string, number]> = [];
    const handler = new QueryDragDropHandler((...args) => moved.push(args));
    const withHandler = render({ rules: [rule('r1'), rule('r2'), rule('r3')] as never }, { handler });

    handler.start('r1');
    handler.over('r3', 'after', true, 0);
    withHandler.component.onItemDrop(new DragEvent('drop'), rule('r3') as never, 2, false);

    // 目标 index 2 → 同组内 r1 在其前面，调整为 1，再因 after 加 1 → 2
    expect(moved).toEqual([['r1', 'root', 2]]);
  });

  it('drop 到子组时目标是子组 id，索引落到末尾', () => {
    const moved: Array<[string, string, number]> = [];
    const handler = new QueryDragDropHandler((...args) => moved.push(args));
    const subGroup = group({ id: 'sub', rules: [rule('a')] as never });
    const withHandler = render({ rules: [rule('r1'), subGroup] as never }, { handler });

    handler.start('r1');
    handler.over('sub', 'into', true, 0);
    withHandler.component.onItemDrop(new DragEvent('drop'), subGroup, 1, true);

    expect(moved).toEqual([['r1', 'sub', 1]]);
  });

  it('无有效放置目标时 drop 只复位，不调 moveItemFn', () => {
    const moveItemFn = vi.fn();
    const handler = new QueryDragDropHandler(moveItemFn);
    const withHandler = render({ rules: [rule('r1')] as never }, { handler });

    handler.start('r1');
    handler.over('r1', 'before', false, 0); // isValidTarget = false
    withHandler.component.onItemDrop(new DragEvent('drop'), rule('r1') as never, 0, false);

    expect(moveItemFn).not.toHaveBeenCalled();
    expect(handler.state().draggedItemId).toBeNull();
  });

  it('onItemDragEnd 复位 handler 状态', () => {
    const handler = new QueryDragDropHandler(() => undefined);
    const withHandler = render({}, { handler });
    handler.start('r1');

    withHandler.component.onItemDragEnd();
    expect(handler.state().draggedItemId).toBeNull();
  });
});
