import type { FieldMetadata } from '@aiao/rxdb-model';
import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import QueryGroup from '../../../query-builder/query-group/QueryGroup.vue';
import { QueryDragDropHandler, type UIRuleGroup } from '../../../query-builder/query-group/query-drag-drop';

/**
 * QueryGroup + QueryDragDropHandler —— **真实加载源码**（对齐 Angular 侧）。
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
    expect(handler.state.value.draggedItemId).toBe('r1');

    handler.end();
    expect(handler.state.value.draggedItemId).toBeNull();
  });

  it('over 记录目标与放置模式，leave 清掉目标但保留被拖项', () => {
    const handler = new QueryDragDropHandler(() => undefined);
    handler.start('r1');
    handler.over('r2', 'before', true, 0);

    expect(handler.state.value).toMatchObject({ targetItemId: 'r2', dropMode: 'before', isValidTarget: true });

    handler.leave();
    expect(handler.state.value.targetItemId).toBeNull();
    expect(handler.state.value.draggedItemId).toBe('r1');
  });

  it('更深层的 over 优先：浅层事件不覆盖深层目标', () => {
    const handler = new QueryDragDropHandler(() => undefined);
    handler.start('r1');
    handler.over('deep', 'into', true, 2);
    handler.over('shallow', 'before', true, 0);

    expect(handler.state.value.targetItemId).toBe('deep');
  });

  it('drop 调 moveItemFn 并复位', () => {
    const moved: unknown[] = [];
    const handler = new QueryDragDropHandler((...args) => moved.push(args));
    handler.start('r1');
    handler.drop('r1', 'g1', 2);

    expect(moved).toEqual([['r1', 'g1', 2]]);
    expect(handler.state.value.draggedItemId).toBeNull();
  });

  it('moveItemFn 抛错（如循环嵌套被服务层拒绝）时静默复位，不冒泡', () => {
    const handler = new QueryDragDropHandler(() => {
      throw new Error('circular nesting');
    });
    handler.start('r1');

    expect(() => handler.drop('r1', 'g1', 0)).not.toThrow();
    expect(handler.state.value.draggedItemId).toBeNull();
  });
});

type QueryGroupVM = InstanceType<typeof QueryGroup> & {
  collapsed: boolean;
  canAddGroup: boolean;
  nestingLimitHint: string;
  toggleCollapse(): void;
  toggleCombinator(combinator: 'and' | 'or'): void;
  onAddRule(): void;
  onAddGroup(): void;
  onRemove(): void;
  onRuleUpdate(event: { id: string; updates: Partial<Record<string, unknown>> }): void;
  onRuleRemove(id: string): void;
  isRuleGroup(item: UIRuleGroup | Record<string, unknown>): boolean;
  asRuleGroup(item: UIRuleGroup | Record<string, unknown>): UIRuleGroup;
  asRule(item: UIRuleGroup | Record<string, unknown>): Record<string, unknown>;
  isDragging(itemId: string): boolean;
  isDropTarget(itemId: string, mode: 'before' | 'after' | 'into'): boolean;
  isDropInvalid(itemId: string): boolean;
  onItemDragStart(event: DragEvent, item: UIRuleGroup | Record<string, unknown>): void;
  onItemDragOver(event: DragEvent, item: UIRuleGroup | Record<string, unknown>, isGroup: boolean): void;
  onItemDragLeave(event: DragEvent): void;
  onItemDrop(event: DragEvent, item: UIRuleGroup | Record<string, unknown>, index: number, isGroup: boolean): void;
  onItemDragEnd(): void;
};

describe('QueryGroup（真实组件）', () => {
  describe('嵌套层级上限（US-210 AC#3）', () => {
    it('未达上限时「+ 分组」可用且无提示文案', () => {
      const { wrapper } = render({}, { depth: 0, maxDepth: 5 });
      const el = wrapper.element as HTMLElement;

      const addGroupBtn = [...el.querySelectorAll('button')].find(b => b.textContent?.includes('+ 分组'));
      expect(addGroupBtn, '「+ 分组」按钮应存在').toBeTruthy();
      expect(addGroupBtn?.hasAttribute('disabled')).toBe(false);
      expect(el.textContent).not.toContain('已达最大嵌套层级');
    });

    it('达到上限时按钮保留但禁用，并给出可见原因（不再静默消失）', () => {
      // 这条钉住的是一个真实缺陷：此前到达上限时按钮**直接消失**，页面上零解释文案
      const { wrapper } = render({}, { depth: 4, maxDepth: 5 });
      const el = wrapper.element as HTMLElement;

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
      const { vm, events } = render({}, { depth: 4, maxDepth: 5 });

      vm.onAddGroup();
      expect(events.addGroup()).toEqual([]);
    });

    it('提示文案跟随 maxDepth 变化', () => {
      const { wrapper } = render({}, { depth: 2, maxDepth: 3 });
      const el = wrapper.element as HTMLElement;

      expect(el.querySelector('[role="status"]')?.textContent).toContain('3 层');
    });
  });

  function render(
    over: Partial<UIRuleGroup> = {},
    opts: { depth?: number; maxDepth?: number; handler?: QueryDragDropHandler; allowCollapse?: boolean } = {}
  ) {
    const wrapper = mount(QueryGroup, {
      props: {
        group: group(over),
        fields: FIELDS,
        depth: opts.depth ?? 0,
        maxDepth: opts.maxDepth ?? 5,
        ...(opts.handler ? { dragDropHandler: opts.handler } : {}),
        ...(opts.allowCollapse !== undefined ? { allowCollapse: opts.allowCollapse } : {})
      }
    });
    const events = {
      addRule: () => wrapper.emitted('addRule') as Array<Array<Record<string, unknown>>> | undefined,
      addGroup: () => (wrapper.emitted('addGroup') as string[][] | undefined)?.flat() ?? [],
      removeItem: () => (wrapper.emitted('removeItem') as string[][] | undefined)?.flat() ?? [],
      updateCombinator: () => wrapper.emitted('updateCombinator') as unknown[] | undefined,
      updateRule: () => wrapper.emitted('updateRule') as unknown[] | undefined
    };
    return { wrapper, vm: wrapper.vm as unknown as QueryGroupVM, events };
  }

  let host: ReturnType<typeof render>;

  beforeEach(() => {
    host = render();
  });

  it('toggleCollapse 切换收起状态', () => {
    expect(host.vm.collapsed).toBe(false);
    host.vm.toggleCollapse();
    expect(host.vm.collapsed).toBe(true);
    host.vm.toggleCollapse();
    expect(host.vm.collapsed).toBe(false);
  });

  it('切到不同组合器才 emit，重复点当前值不 emit', () => {
    host.vm.toggleCombinator('or');
    expect(host.events.updateCombinator()).toEqual([[{ id: 'root', combinator: 'or' }]]);

    host.vm.toggleCombinator('and');
    expect(host.events.updateCombinator()).toHaveLength(1);
  });

  it('canAddGroup 在还差一层到达 maxDepth 时转 false', () => {
    expect(render({}, { depth: 0, maxDepth: 5 }).vm.canAddGroup).toBe(true);
    expect(render({}, { depth: 3, maxDepth: 5 }).vm.canAddGroup).toBe(true);
    expect(render({}, { depth: 4, maxDepth: 5 }).vm.canAddGroup).toBe(false);
    expect(render({}, { depth: 5, maxDepth: 5 }).vm.canAddGroup).toBe(false);
  });

  it('onAddRule 用首个字段构造规则；boolean 默认 false、关系字段用 exists', async () => {
    host.vm.onAddRule();
    expect(host.events.addRule()).toEqual([[{ parentId: 'root', rule: { field: 'title', operator: '=', value: '' } }]]);

    const boolFirst = render();
    await boolFirst.wrapper.setProps({ fields: [FIELDS[1], FIELDS[0]] });
    boolFirst.vm.onAddRule();
    expect(boolFirst.events.addRule()?.[0][0]).toMatchObject({ rule: { field: 'published', value: false } });

    const relationFirst = render();
    await relationFirst.wrapper.setProps({
      fields: [{ name: 'author', type: 'string', displayName: '作者', isRelation: true }]
    });
    relationFirst.vm.onAddRule();
    expect(relationFirst.events.addRule()?.[0][0]).toMatchObject({ rule: { operator: 'exists' } });
  });

  it('fields 为空时 onAddRule 是 no-op', async () => {
    const empty = render();
    await empty.wrapper.setProps({ fields: [] });
    empty.vm.onAddRule();

    expect(empty.events.addRule()).toBeUndefined();
  });

  it('onAddGroup / onRemove 透传本组 id', () => {
    host.vm.onAddGroup();
    host.vm.onRemove();

    expect(host.events.addGroup()).toEqual(['root']);
    expect(host.events.removeItem()).toEqual(['root']);
  });

  it('isRuleGroup / asRuleGroup / asRule 按 rules 字段判别', () => {
    const child = group({ id: 'g1' });
    expect(host.vm.isRuleGroup(child)).toBe(true);
    expect(host.vm.isRuleGroup(rule('r1') as never)).toBe(false);
    expect(host.vm.asRuleGroup(child).id).toBe('g1');
    expect(host.vm.asRule(rule('r1') as never).id).toBe('r1');
  });

  it('无 dragDropHandler 时拖拽查询函数全部安全返回 false', () => {
    expect(host.vm.isDragging('r1')).toBe(false);
    expect(host.vm.isDropTarget('r1', 'before')).toBe(false);
    expect(host.vm.isDropInvalid('r1')).toBe(false);
  });

  it('isDropTarget 要求目标 / 模式 / 有效性三者同时匹配', () => {
    const handler = new QueryDragDropHandler(() => undefined);
    const withHandler = render({}, { handler });
    handler.start('r1');
    handler.over('r2', 'before', true, 0);

    expect(withHandler.vm.isDragging('r1')).toBe(true);
    expect(withHandler.vm.isDropTarget('r2', 'before')).toBe(true);
    expect(withHandler.vm.isDropTarget('r2', 'after')).toBe(false);
    expect(withHandler.vm.isDropInvalid('r2')).toBe(false);
  });

  it('isDropInvalid 在目标非法且确有拖拽中的项时为真', () => {
    const handler = new QueryDragDropHandler(() => undefined);
    const withHandler = render({}, { handler });
    handler.start('r1');
    handler.over('r1', 'into', false, 0);

    expect(withHandler.vm.isDropInvalid('r1')).toBe(true);
  });

  it('drop 到同组更靠后的位置时索引 -1（补偿被拖项移走后的位移）', () => {
    const moved: Array<[string, string, number]> = [];
    const handler = new QueryDragDropHandler((...args) => moved.push(args));
    const withHandler = render({ rules: [rule('r1'), rule('r2'), rule('r3')] as never }, { handler });

    handler.start('r1');
    handler.over('r3', 'after', true, 0);
    withHandler.vm.onItemDrop(new DragEvent('drop'), rule('r3') as never, 2, false);

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
    withHandler.vm.onItemDrop(new DragEvent('drop'), subGroup, 1, true);

    expect(moved).toEqual([['r1', 'sub', 1]]);
  });

  it('无有效放置目标时 drop 只复位，不调 moveItemFn', () => {
    const moveItemFn = vi.fn();
    const handler = new QueryDragDropHandler(moveItemFn);
    const withHandler = render({ rules: [rule('r1')] as never }, { handler });

    handler.start('r1');
    handler.over('r1', 'before', false, 0); // isValidTarget = false
    withHandler.vm.onItemDrop(new DragEvent('drop'), rule('r1') as never, 0, false);

    expect(moveItemFn).not.toHaveBeenCalled();
    expect(handler.state.value.draggedItemId).toBeNull();
  });

  it('onItemDragEnd 复位 handler 状态', () => {
    const handler = new QueryDragDropHandler(() => undefined);
    const withHandler = render({}, { handler });
    handler.start('r1');

    withHandler.vm.onItemDragEnd();
    expect(handler.state.value.draggedItemId).toBeNull();
  });
});

/**
 * 补充分支：模板交互（AND/OR / 折叠 / 嵌套 / 空态）、拖拽事件链
 * （dragstart / dragover / dragleave / drop 的边界分支）与拖拽状态类名渲染。
 */
describe('QueryGroup（模板与拖拽事件链补充）', () => {
  function render(
    over: Partial<UIRuleGroup> = {},
    opts: { depth?: number; maxDepth?: number; handler?: QueryDragDropHandler; allowCollapse?: boolean } = {}
  ) {
    const wrapper = mount(QueryGroup, {
      props: {
        group: group(over),
        fields: FIELDS,
        depth: opts.depth ?? 0,
        maxDepth: opts.maxDepth ?? 5,
        ...(opts.handler ? { dragDropHandler: opts.handler } : {}),
        ...(opts.allowCollapse !== undefined ? { allowCollapse: opts.allowCollapse } : {})
      }
    });
    const events = {
      addRule: () => wrapper.emitted('addRule') as Array<Array<Record<string, unknown>>> | undefined,
      addGroup: () => (wrapper.emitted('addGroup') as string[][] | undefined)?.flat() ?? [],
      removeItem: () => (wrapper.emitted('removeItem') as string[][] | undefined)?.flat() ?? [],
      updateCombinator: () => wrapper.emitted('updateCombinator') as unknown[] | undefined,
      updateRule: () => wrapper.emitted('updateRule') as unknown[] | undefined
    };
    return { wrapper, vm: wrapper.vm as unknown as QueryGroupVM, events };
  }

  /** 找到指定 title 的按钮。 */
  function buttonByTitle(el: HTMLElement, title: string): HTMLButtonElement | undefined {
    return [...el.querySelectorAll('button')].find(b => b.title === title);
  }

  /** 找到包含指定文本的按钮。 */
  function buttonByText(el: HTMLElement, text: string): HTMLButtonElement | undefined {
    return [...el.querySelectorAll('button')].find(b => b.textContent?.includes(text));
  }

  function dragEvent(over: {
    dataTransfer?: {
      effectAllowed?: string;
      dropEffect?: string;
      setData?: ReturnType<typeof vi.fn>;
      setDragImage?: ReturnType<typeof vi.fn>;
    };
    clientX?: number;
    clientY?: number;
    target?: EventTarget | null;
    currentTarget?: EventTarget | null;
    relatedTarget?: Node | null;
  }): DragEvent {
    return {
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      ...over
    } as unknown as DragEvent;
  }

  describe('模板渲染与交互', () => {
    it('规则列表与空态按内容切换', () => {
      const withRules = render({ rules: [rule('r1')] as never });
      const el = withRules.wrapper.element as HTMLElement;
      expect(el.querySelector('.rxdb-query-rule')).toBeTruthy();
      expect(el.textContent).not.toContain('暂无条件');

      const empty = render({ rules: [] });
      expect((empty.wrapper.element as HTMLElement).textContent).toContain('暂无条件');
    });

    it('allowCollapse false 时不渲染收起按钮；删除组按钮只在 depth > 0 出现', async () => {
      const noCollapse = render({}, { allowCollapse: false });
      const el = noCollapse.wrapper.element as HTMLElement;

      expect(buttonByTitle(el, '收起')).toBeUndefined();
      expect(buttonByTitle(el, '展开')).toBeUndefined();
      expect(buttonByTitle(el, '删除组')).toBeUndefined();

      await noCollapse.wrapper.setProps({ depth: 1 });
      expect(buttonByTitle(el, '删除组')).toBeTruthy();
    });

    it('收起后规则列表、操作按钮与删除组按钮全部隐藏，标题切换为「展开」', async () => {
      const withRules = render({ rules: [rule('r1')] as never }, { depth: 1 });
      const el = withRules.wrapper.element as HTMLElement;

      withRules.vm.toggleCollapse();
      await withRules.wrapper.vm.$nextTick();

      expect(el.querySelector('.rxdb-query-rule')).toBeNull();
      expect(buttonByText(el, '+ 条件')).toBeUndefined();
      expect(buttonByText(el, '+ 分组')).toBeUndefined();
      expect(buttonByTitle(el, '删除组')).toBeUndefined();
      expect(buttonByTitle(el, '展开')).toBeTruthy();

      withRules.vm.toggleCollapse();
      await withRules.wrapper.vm.$nextTick();
      expect(buttonByTitle(el, '收起')).toBeTruthy();
      expect(el.querySelector('.rxdb-query-rule')).toBeTruthy();
    });

    it('模板按钮点击：OR 切换组合器、+ 条件 / + 分组 / ✕ 透传事件', () => {
      const h = render({ rules: [rule('r1')] as never }, { depth: 1 });
      const el = h.wrapper.element as HTMLElement;

      buttonByText(el, 'OR')?.click();
      expect(h.events.updateCombinator()).toEqual([[{ id: 'root', combinator: 'or' }]]);

      buttonByText(el, '+ 条件')?.click();
      expect(h.events.addRule()?.[0][0]).toMatchObject({
        parentId: 'root',
        rule: { field: 'title', operator: '=', value: '' }
      });

      buttonByText(el, '+ 分组')?.click();
      expect(h.events.addGroup()).toEqual(['root']);

      buttonByText(el, '✕')?.click();
      expect(h.events.removeItem()).toEqual(['root']);
    });

    it('嵌套子组经模板递归渲染', () => {
      const sub = group({ id: 'sub', combinator: 'or', rules: [rule('s1')] as never });
      const h = render({ rules: [rule('r1'), sub] as never });
      const el = h.wrapper.element as HTMLElement;

      // Vue 的根元素自身就带 rxdb-query-group class（Angular 的自定义宿主不带），
      // 加上嵌套子组共 2 个
      const nested = el.querySelectorAll('.rxdb-query-group').length;
      expect(el.classList.contains('rxdb-query-group') ? nested + 1 : nested).toBe(2);
    });

    it('onAddRule 首个字段为 keyValue 时默认 null 操作符', async () => {
      const h = render();
      await h.wrapper.setProps({ fields: [{ name: 'tags', type: 'keyValue', displayName: '标签' }] });

      h.vm.onAddRule();
      expect(h.events.addRule()?.[0][0]).toMatchObject({ rule: { operator: 'null' } });
    });
  });

  describe('拖拽状态类名渲染', () => {
    it('dragging / drop-target-before / drop-target-after 按 handler 状态渲染', async () => {
      const handler = new QueryDragDropHandler(() => undefined);
      const h = render({ rules: [rule('r1'), rule('r2')] as never }, { handler });
      const el = h.wrapper.element as HTMLElement;
      const rows = [...el.querySelectorAll<HTMLElement>('.rxdb-drag-item')];

      handler.start('r1');
      handler.over('r2', 'before', true, 0);
      await h.wrapper.vm.$nextTick();
      expect(rows[0].classList.contains('dragging')).toBe(true);
      expect(rows[1].classList.contains('drop-target-before')).toBe(true);
      expect(rows[1].classList.contains('drop-target-after')).toBe(false);

      handler.over('r2', 'after', true, 0);
      await h.wrapper.vm.$nextTick();
      expect(rows[1].classList.contains('drop-target-after')).toBe(true);
      expect(rows[1].classList.contains('drop-target-before')).toBe(false);
    });

    it('drop-invalid 与 drop-target-into 类名', async () => {
      const handler = new QueryDragDropHandler(() => undefined);
      const sub = group({ id: 'sub', rules: [] as never });
      const h = render({ rules: [rule('r1'), sub] as never }, { handler });
      const el = h.wrapper.element as HTMLElement;
      const rows = [...el.querySelectorAll<HTMLElement>('.rxdb-drag-item')];

      handler.start('r1');
      handler.over('r1', 'before', false, 0);
      await h.wrapper.vm.$nextTick();
      expect(rows[0].classList.contains('drop-invalid')).toBe(true);

      handler.over('sub', 'into', true, 0);
      await h.wrapper.vm.$nextTick();
      expect(rows[1].classList.contains('drop-target-into')).toBe(true);
    });
  });

  describe('拖拽事件链', () => {
    it('onItemDragStart：有 dataTransfer 时设置数据与拖拽图像并 start', () => {
      const handler = new QueryDragDropHandler(() => undefined);
      const h = render({ rules: [rule('r1')] as never }, { handler });
      const el = h.wrapper.element as HTMLElement;
      const handle = el.querySelector('.rxdb-drag-item span[draggable="true"]') as HTMLElement;
      const dt = { effectAllowed: '', dropEffect: '', setData: vi.fn(), setDragImage: vi.fn() };

      const evt = dragEvent({ dataTransfer: dt, clientX: 10, clientY: 20, target: handle });
      h.vm.onItemDragStart(evt, rule('r1') as never);

      expect(evt.stopPropagation).toHaveBeenCalled();
      expect(dt.effectAllowed).toBe('move');
      expect(dt.setData).toHaveBeenCalledWith('text/plain', 'r1');
      expect(dt.setDragImage).toHaveBeenCalled();
      expect(handler.state.value.draggedItemId).toBe('r1');
    });

    it('onItemDragStart：无 handler 或无 dataTransfer 时安全返回', () => {
      const noHandler = render({ rules: [rule('r1')] as never });
      noHandler.vm.onItemDragStart(
        dragEvent({ dataTransfer: undefined, target: noHandler.wrapper.element }),
        rule('r1') as never
      );

      const handler = new QueryDragDropHandler(() => undefined);
      const withHandler = render({ rules: [rule('r1')] as never }, { handler });
      const evt = dragEvent({ dataTransfer: undefined, target: withHandler.wrapper.element });
      withHandler.vm.onItemDragStart(evt, rule('r1') as never);
      expect(evt.stopPropagation).not.toHaveBeenCalled();
      expect(handler.state.value.draggedItemId).toBeNull();
    });

    it('onItemDragOver：按 clientY 计算 before / after / into 并写 dropEffect', () => {
      const handler = new QueryDragDropHandler(() => undefined);
      const h = render({ rules: [rule('r1'), rule('r2')] as never }, { handler });
      handler.start('r1');

      const rect = (): DOMRect =>
        ({ top: 0, bottom: 100, height: 100, left: 0, right: 0, width: 0, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
      const makeEvt = (clientY: number): DragEvent =>
        dragEvent({
          dataTransfer: { dropEffect: '' },
          clientY,
          currentTarget: { getBoundingClientRect: rect } as unknown as EventTarget
        });

      let evt = makeEvt(10);
      h.vm.onItemDragOver(evt, rule('r2') as never, false);
      expect(handler.state.value).toMatchObject({ targetItemId: 'r2', dropMode: 'before', isValidTarget: true });
      expect(evt.dataTransfer?.dropEffect).toBe('move');

      evt = makeEvt(90);
      h.vm.onItemDragOver(evt, rule('r2') as never, false);
      expect(handler.state.value.dropMode).toBe('after');

      evt = makeEvt(50);
      h.vm.onItemDragOver(evt, rule('r2') as never, true);
      expect(handler.state.value.dropMode).toBe('into');
    });

    it('onItemDragOver：拖到自身时目标非法、dropEffect 为 none', () => {
      const handler = new QueryDragDropHandler(() => undefined);
      const h = render({ rules: [rule('r1')] as never }, { handler });
      handler.start('r1');

      const rect = (): DOMRect =>
        ({ top: 0, bottom: 100, height: 100, left: 0, right: 0, width: 0, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
      const evt = dragEvent({
        dataTransfer: { dropEffect: '' },
        clientY: 10,
        currentTarget: { getBoundingClientRect: rect } as unknown as EventTarget
      });
      h.vm.onItemDragOver(evt, rule('r1') as never, false);

      expect(handler.state.value.isValidTarget).toBe(false);
      expect(evt.dataTransfer?.dropEffect).toBe('none');
    });

    it('onItemDragOver：无 handler / 无 dataTransfer 时 preventDefault 后返回', () => {
      const h = render({ rules: [rule('r1')] as never });
      const evt = dragEvent({ dataTransfer: undefined, clientY: 10, currentTarget: h.wrapper.element });

      expect(() => h.vm.onItemDragOver(evt, rule('r1') as never, false)).not.toThrow();
      expect(evt.preventDefault).toHaveBeenCalled();
    });

    it('onItemDragLeave：relatedTarget 在内不清空，在外或为空清空', () => {
      const handler = new QueryDragDropHandler(() => undefined);
      const h = render({ rules: [rule('r1')] as never }, { handler });
      const el = h.wrapper.element as HTMLElement;
      handler.start('r1');
      handler.over('r1', 'before', false, 0);

      const inside = document.createElement('div');
      el.appendChild(inside);

      h.vm.onItemDragLeave(dragEvent({ currentTarget: el, relatedTarget: inside }));
      expect(handler.state.value.targetItemId).toBe('r1');

      h.vm.onItemDragLeave(dragEvent({ currentTarget: el, relatedTarget: null }));
      expect(handler.state.value.targetItemId).toBeNull();

      handler.over('r1', 'before', false, 0);
      h.vm.onItemDragLeave(dragEvent({ currentTarget: el, relatedTarget: document.createElement('div') }));
      expect(handler.state.value.targetItemId).toBeNull();
    });

    it('onItemDrop：before 同组更靠后目标索引 -1；after 同组更靠前目标不加不减', () => {
      const moved: Array<[string, string, number]> = [];
      const handler = new QueryDragDropHandler((...args) => moved.push(args));
      const h = render({ rules: [rule('r1'), rule('r2'), rule('r3')] as never }, { handler });

      handler.start('r1');
      handler.over('r3', 'before', true, 0);
      h.vm.onItemDrop(new DragEvent('drop'), rule('r3') as never, 2, false);
      // before + 同组被拖项在前 → 目标 2 - 1 = 1
      expect(moved).toEqual([['r1', 'root', 1]]);

      handler.start('r3');
      handler.over('r1', 'after', true, 0);
      h.vm.onItemDrop(new DragEvent('drop'), rule('r1') as never, 0, false);
      // after + 被拖项在目标之后 → 不加不减，目标 0 + 1 = 1
      expect(moved.at(-1)).toEqual(['r3', 'root', 1]);
    });

    it('onItemDrop：into 且被拖项已在子组时索引落到末尾前一位', () => {
      const moved: Array<[string, string, number]> = [];
      const handler = new QueryDragDropHandler((...args) => moved.push(args));
      const sub = group({ id: 'sub', rules: [rule('a'), rule('r1')] as never });
      const h = render({ rules: [rule('r1'), sub] as never }, { handler });

      handler.start('r1');
      handler.over('sub', 'into', true, 0);
      h.vm.onItemDrop(new DragEvent('drop'), sub, 1, true);

      // r1 已在 sub 中 → rules.length - 1 = 1
      expect(moved).toEqual([['r1', 'sub', 1]]);
    });

    it('onItemDrop：未开始拖拽或无 handler 时只复位', () => {
      const moveItemFn = vi.fn();
      const handler = new QueryDragDropHandler(moveItemFn);
      const h = render({ rules: [rule('r1')] as never }, { handler });

      h.vm.onItemDrop(new DragEvent('drop'), rule('r1') as never, 0, false);
      expect(moveItemFn).not.toHaveBeenCalled();
      expect(handler.state.value.draggedItemId).toBeNull();

      const noHandler = render({ rules: [rule('r1')] as never });
      expect(() => noHandler.vm.onItemDrop(new DragEvent('drop'), rule('r1') as never, 0, false)).not.toThrow();
    });
  });
});

/**
 * 补充分支（第二轮）：calculateDropMode 组模式 before/after、
 * dragStart 目标不在行内时跳过拖拽图像。
 */
describe('QueryGroup（拖拽分支收尾）', () => {
  function render(over: Partial<UIRuleGroup> = {}, opts: { depth?: number; handler?: QueryDragDropHandler } = {}) {
    const wrapper = mount(QueryGroup, {
      props: {
        group: group(over),
        fields: FIELDS,
        depth: opts.depth ?? 0,
        ...(opts.handler ? { dragDropHandler: opts.handler } : {})
      }
    });
    return { wrapper, vm: wrapper.vm as unknown as QueryGroupVM };
  }

  it('组模式 dragover：顶部 before、底部 after（calculateDropMode 组分支）', () => {
    const handler = new QueryDragDropHandler(() => undefined);
    const h = render({ rules: [rule('r1'), rule('r2')] as never }, { handler });
    handler.start('r1');

    const rect = (): DOMRect =>
      ({ top: 0, bottom: 100, height: 100, left: 0, right: 0, width: 0, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
    const makeEvt = (clientY: number): DragEvent =>
      ({
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
        dataTransfer: { dropEffect: '' },
        clientY,
        currentTarget: { getBoundingClientRect: rect } as unknown as EventTarget
      }) as unknown as DragEvent;

    h.vm.onItemDragOver(makeEvt(10), rule('r2') as never, true);
    expect(handler.state.value.dropMode).toBe('before');

    h.vm.onItemDragOver(makeEvt(90), rule('r2') as never, true);
    expect(handler.state.value.dropMode).toBe('after');
  });

  it('dragStart 目标不在 .rxdb-drag-item 内时跳过拖拽图像，仍 start', () => {
    const handler = new QueryDragDropHandler(() => undefined);
    const h = render({ rules: [rule('r1')] as never }, { handler });
    const dt = { effectAllowed: '', dropEffect: '', setData: vi.fn(), setDragImage: vi.fn() };

    const evt = {
      dataTransfer: dt,
      stopPropagation: vi.fn(),
      clientX: 10,
      clientY: 20,
      target: document.body // 不在任何行内
    } as unknown as DragEvent;
    h.vm.onItemDragStart(evt, rule('r1') as never);

    expect(dt.setData).toHaveBeenCalledWith('text/plain', 'r1');
    expect(dt.setDragImage).not.toHaveBeenCalled();
    expect(handler.state.value.draggedItemId).toBe('r1');
  });

  it('onRuleUpdate / onRuleRemove 透传事件', () => {
    const h = render({ rules: [rule('r1')] as never });

    h.vm.onRuleUpdate({ id: 'r1', updates: { value: 'x' } });
    h.vm.onRuleRemove('r1');

    expect(h.wrapper.emitted('updateRule')).toEqual([[{ id: 'r1', updates: { value: 'x' } }]]);
    expect(h.wrapper.emitted('removeItem')).toEqual([['r1']]);
  });
});
