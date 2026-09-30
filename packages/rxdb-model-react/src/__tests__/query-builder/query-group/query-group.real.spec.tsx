/**
 * QueryGroup + QueryDragDropHandler —— **真实加载源码**（Angular `query-group.real.spec.ts` 的 React 移植）。
 *
 * 覆盖嵌套层级上限（US-210 AC#3）、组合器切换、折叠、递归嵌套、空态、
 * 拖拽状态类名渲染与拖拽事件链（dragstart / dragover / dragleave / drop 的边界分支）。
 * `QueryDragDropHandler` 保留类 API，状态经 useSyncExternalStore 驱动类名。
 */
import type { FieldMetadata } from '@aiao/rxdb-model';
import { act, fireEvent, render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryDragDropHandler, QueryGroup, type UIRuleGroup } from '../../../query-builder/query-group/query-group';

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
    expect(handler.getState().draggedItemId).toBe('r1');

    handler.end();
    expect(handler.getState().draggedItemId).toBeNull();
  });

  it('over 记录目标与放置模式，leave 清掉目标但保留被拖项', () => {
    const handler = new QueryDragDropHandler(() => undefined);
    handler.start('r1');
    handler.over('r2', 'before', true, 0);

    expect(handler.getState()).toMatchObject({ targetItemId: 'r2', dropMode: 'before', isValidTarget: true });

    handler.leave();
    expect(handler.getState().targetItemId).toBeNull();
    expect(handler.getState().draggedItemId).toBe('r1');
  });

  it('更深层的 over 优先：浅层事件不覆盖深层目标', () => {
    const handler = new QueryDragDropHandler(() => undefined);
    handler.start('r1');
    handler.over('deep', 'into', true, 2);
    handler.over('shallow', 'before', true, 0);

    expect(handler.getState().targetItemId).toBe('deep');
  });

  it('drop 调 moveItemFn 并复位', () => {
    const moved: unknown[] = [];
    const handler = new QueryDragDropHandler((...args) => moved.push(args));
    handler.start('r1');
    handler.drop('r1', 'g1', 2);

    expect(moved).toEqual([['r1', 'g1', 2]]);
    expect(handler.getState().draggedItemId).toBeNull();
  });

  it('moveItemFn 抛错（如循环嵌套被服务层拒绝）时静默复位，不冒泡', () => {
    const handler = new QueryDragDropHandler(() => {
      throw new Error('circular nesting');
    });
    handler.start('r1');

    expect(() => handler.drop('r1', 'g1', 0)).not.toThrow();
    expect(handler.getState().draggedItemId).toBeNull();
  });

  it('setMoveItemFn 后期绑定替换实现（React 服务 effect 期就绪）', () => {
    const moved: unknown[] = [];
    const handler = new QueryDragDropHandler();
    handler.setMoveItemFn((...args) => moved.push(args));
    handler.start('r1');
    handler.drop('r1', 'g1', 0);
    expect(moved).toEqual([['r1', 'g1', 0]]);
  });
});

describe('QueryGroup（真实组件）', () => {
  function renderGroup(
    over: Partial<UIRuleGroup> = {},
    opts: { depth?: number; maxDepth?: number; handler?: QueryDragDropHandler; allowCollapse?: boolean } = {}
  ) {
    const events = {
      addRule: [] as unknown[],
      addGroup: [] as string[],
      removeItem: [] as string[],
      updateCombinator: [] as unknown[],
      updateRule: [] as unknown[]
    };
    const utils = render(
      <QueryGroup
        group={group(over)}
        fields={FIELDS}
        depth={opts.depth ?? 0}
        maxDepth={opts.maxDepth ?? 5}
        dragDropHandler={opts.handler}
        allowCollapse={opts.allowCollapse}
        onAddRule={e => events.addRule.push(e)}
        onAddGroup={e => events.addGroup.push(e)}
        onRemoveItem={e => events.removeItem.push(e)}
        onUpdateCombinator={e => events.updateCombinator.push(e)}
        onUpdateRule={e => events.updateRule.push(e)}
      />
    );
    return { ...utils, events };
  }

  /** 找到包含指定文本的按钮。 */
  function buttonByText(container: HTMLElement, text: string): HTMLButtonElement | undefined {
    return [...container.querySelectorAll('button')].find(b => b.textContent?.includes(text));
  }

  /** 找到指定 title 的按钮。 */
  function buttonByTitle(container: HTMLElement, title: string): HTMLButtonElement | undefined {
    return [...container.querySelectorAll('button')].find(b => b.title === title);
  }

  /** 构造真实 DragEvent 并按需覆盖只读属性（happy-dom dataTransfer 为 null，需注入）。 */
  function makeDragEvent(
    type: string,
    over: {
      dataTransfer?: unknown;
      clientX?: number;
      clientY?: number;
      relatedTarget?: Node | null;
    } = {}
  ): DragEvent {
    const event = new DragEvent(type, { bubbles: true, cancelable: true });
    if (over.dataTransfer !== undefined) {
      Object.defineProperty(event, 'dataTransfer', { value: over.dataTransfer });
    }
    if (over.clientX !== undefined) Object.defineProperty(event, 'clientX', { value: over.clientX });
    if (over.clientY !== undefined) Object.defineProperty(event, 'clientY', { value: over.clientY });
    if (over.relatedTarget !== undefined) {
      Object.defineProperty(event, 'relatedTarget', { value: over.relatedTarget });
    }
    return event;
  }

  /** 在目标元素上派发真实拖拽事件（currentTarget 由派发器写入）。 */
  function dispatchDrag(target: Element, event: DragEvent): DragEvent {
    target.dispatchEvent(event);
    return event;
  }

  describe('嵌套层级上限（US-210 AC#3）', () => {
    it('未达上限时「+ 分组」可用且无提示文案', () => {
      const { container } = renderGroup({}, { depth: 0, maxDepth: 5 });

      const addGroupBtn = buttonByText(container, '+ 分组');
      expect(addGroupBtn, '「+ 分组」按钮应存在').toBeTruthy();
      expect(addGroupBtn?.hasAttribute('disabled')).toBe(false);
      expect(container.textContent).not.toContain('已达最大嵌套层级');
    });

    it('达到上限时按钮保留但禁用，并给出可见原因（不再静默消失）', () => {
      const { container } = renderGroup({}, { depth: 4, maxDepth: 5 });

      const addGroupBtn = buttonByText(container, '+ 分组');
      expect(addGroupBtn, '按钮必须仍然存在，不能静默消失').toBeTruthy();
      expect(addGroupBtn?.hasAttribute('disabled')).toBe(true);
      expect(addGroupBtn?.getAttribute('aria-disabled')).toBe('true');
      expect(addGroupBtn?.getAttribute('title')).toContain('已达最大嵌套层级');

      const hint = container.querySelector('[role="status"]');
      expect(hint?.textContent, '应有可见的上限说明').toContain('已达最大嵌套层级（5 层）');
    });

    it('达到上限时程序化点击也不派发事件', () => {
      const { container, events } = renderGroup({}, { depth: 4, maxDepth: 5 });

      buttonByText(container, '+ 分组')!.click();
      expect(events.addGroup).toEqual([]);
    });

    it('提示文案跟随 maxDepth 变化', () => {
      const { container } = renderGroup({}, { depth: 2, maxDepth: 3 });

      expect(container.querySelector('[role="status"]')?.textContent).toContain('3 层');
    });
  });

  let host: ReturnType<typeof renderGroup>;

  beforeEach(() => {
    host = renderGroup();
  });

  it('折叠切换收起状态', () => {
    expect(host.container.querySelector('[title="收起"]')).toBeTruthy();
    fireEvent.click(host.container.querySelector('[title="收起"]')!);
    expect(host.container.querySelector('[title="展开"]')).toBeTruthy();
    fireEvent.click(host.container.querySelector('[title="展开"]')!);
    expect(host.container.querySelector('[title="收起"]')).toBeTruthy();
  });

  it('切到不同组合器才 emit，重复点当前值不 emit', () => {
    fireEvent.click(buttonByText(host.container, 'OR')!);
    expect(host.events.updateCombinator).toEqual([{ id: 'root', combinator: 'or' }]);

    // 组件不受控（父未回写 group），当前值仍是 and → 点击 AND 不 emit
    fireEvent.click(buttonByText(host.container, 'AND')!);
    expect(host.events.updateCombinator.length).toBe(1);
  });

  it('「+ 条件」用首个字段构造规则；boolean 默认 false、关系字段用 exists', () => {
    fireEvent.click(buttonByText(host.container, '+ 条件')!);
    expect(host.events.addRule).toEqual([{ parentId: 'root', rule: { field: 'title', operator: '=', value: '' } }]);

    const boolFirst = renderGroup();
    boolFirst.rerender(
      <QueryGroup
        group={group()}
        fields={[FIELDS[1], FIELDS[0]]}
        depth={0}
        maxDepth={5}
        onAddRule={e => boolFirst.events.addRule.push(e)}
      />
    );
    fireEvent.click(buttonByText(boolFirst.container, '+ 条件')!);
    expect(boolFirst.events.addRule[0]).toMatchObject({ rule: { field: 'published', value: false } });

    const relationFirst = renderGroup();
    relationFirst.rerender(
      <QueryGroup
        group={group()}
        fields={[{ name: 'author', type: 'string', isRelation: true } as FieldMetadata]}
        depth={0}
        maxDepth={5}
        onAddRule={e => relationFirst.events.addRule.push(e)}
      />
    );
    fireEvent.click(buttonByText(relationFirst.container, '+ 条件')!);
    expect(relationFirst.events.addRule[0]).toMatchObject({ rule: { operator: 'exists' } });
  });

  it('fields 为空时「+ 条件」是 no-op', () => {
    const empty = renderGroup();
    empty.rerender(
      <QueryGroup group={group()} fields={[]} depth={0} maxDepth={5} onAddRule={e => empty.events.addRule.push(e)} />
    );
    fireEvent.click(buttonByText(empty.container, '+ 条件')!);

    expect(empty.events.addRule).toEqual([]);
  });

  it('「+ 分组」/「✕」透传本组 id', () => {
    fireEvent.click(buttonByText(host.container, '+ 分组')!);
    expect(host.events.addGroup).toEqual(['root']);

    const deep = renderGroup({}, { depth: 1 });
    fireEvent.click(buttonByTitle(deep.container, '删除组')!);
    expect(deep.events.removeItem).toEqual(['root']);
  });

  it('规则列表与空态按内容切换', () => {
    const withRules = renderGroup({ rules: [rule('r1')] as never });
    expect(withRules.container.querySelector('.rxdb-query-rule')).toBeTruthy();
    expect(withRules.container.textContent).not.toContain('暂无条件');

    const empty = renderGroup({ rules: [] });
    expect(empty.container.textContent).toContain('暂无条件');
  });

  it('allowCollapse false 时不渲染收起按钮；删除组按钮只在 depth > 0 出现', () => {
    const noCollapse = renderGroup({}, { allowCollapse: false });

    expect(buttonByTitle(noCollapse.container, '收起')).toBeUndefined();
    expect(buttonByTitle(noCollapse.container, '展开')).toBeUndefined();
    expect(buttonByTitle(noCollapse.container, '删除组')).toBeUndefined();

    const deep = renderGroup({}, { depth: 1, allowCollapse: false });
    expect(buttonByTitle(deep.container, '删除组')).toBeTruthy();
  });

  it('收起后规则列表、操作按钮与删除组按钮全部隐藏，标题切换为「展开」', () => {
    const withRules = renderGroup({ rules: [rule('r1')] as never }, { depth: 1 });

    fireEvent.click(buttonByTitle(withRules.container, '收起')!);

    expect(withRules.container.querySelector('.rxdb-query-rule')).toBeNull();
    expect(buttonByText(withRules.container, '+ 条件')).toBeUndefined();
    expect(buttonByText(withRules.container, '+ 分组')).toBeUndefined();
    expect(buttonByTitle(withRules.container, '删除组')).toBeUndefined();
    expect(buttonByTitle(withRules.container, '展开')).toBeTruthy();

    fireEvent.click(buttonByTitle(withRules.container, '展开')!);
    expect(buttonByTitle(withRules.container, '收起')).toBeTruthy();
    expect(withRules.container.querySelector('.rxdb-query-rule')).toBeTruthy();
  });

  it('模板按钮点击：OR 切换组合器、+ 条件 / + 分组 / ✕ 透传事件', () => {
    const h = renderGroup({ rules: [rule('r1')] as never }, { depth: 1 });

    fireEvent.click(buttonByText(h.container, 'OR')!);
    expect(h.events.updateCombinator).toEqual([{ id: 'root', combinator: 'or' }]);

    fireEvent.click(buttonByText(h.container, '+ 条件')!);
    expect(h.events.addRule[0]).toMatchObject({
      parentId: 'root',
      rule: { field: 'title', operator: '=', value: '' }
    });

    fireEvent.click(buttonByText(h.container, '+ 分组')!);
    expect(h.events.addGroup).toEqual(['root']);

    fireEvent.click(buttonByText(h.container, '✕')!);
    expect(h.events.removeItem).toEqual(['root']);
  });

  it('嵌套子组经模板递归渲染', () => {
    const sub = group({ id: 'sub', combinator: 'or', rules: [rule('s1')] as never });
    const h = renderGroup({ rules: [rule('r1'), sub] as never });

    // 外层 + 内层共 2 个组容器
    expect(h.container.querySelectorAll('.rxdb-query-group').length).toBe(2);
  });

  it('onAddRule 首个字段为 keyValue 时默认 null 操作符', () => {
    const h = renderGroup();
    h.rerender(
      <QueryGroup
        group={group()}
        fields={[{ name: 'tags', type: 'keyValue' } as never]}
        depth={0}
        maxDepth={5}
        onAddRule={e => h.events.addRule.push(e)}
      />
    );

    fireEvent.click(buttonByText(h.container, '+ 条件')!);
    expect(h.events.addRule[0]).toMatchObject({ rule: { operator: 'null' } });
  });

  describe('拖拽状态类名渲染', () => {
    it('dragging / drop-target-before / drop-target-after 按 handler 状态渲染', () => {
      const handler = new QueryDragDropHandler(() => undefined);
      const h = renderGroup({ rules: [rule('r1'), rule('r2')] as never }, { handler });

      act(() => {
        handler.start('r1');
        handler.over('r2', 'before', true, 0);
      });
      const rows = [...h.container.querySelectorAll<HTMLElement>('.rxdb-drag-item')];
      expect(rows[0].classList.contains('dragging')).toBe(true);
      expect(rows[1].classList.contains('drop-target-before')).toBe(true);
      expect(rows[1].classList.contains('drop-target-after')).toBe(false);

      act(() => {
        handler.over('r2', 'after', true, 0);
      });
      const after = [...h.container.querySelectorAll<HTMLElement>('.rxdb-drag-item')];
      expect(after[1].classList.contains('drop-target-after')).toBe(true);
      expect(after[1].classList.contains('drop-target-before')).toBe(false);
    });

    it('drop-invalid 与 drop-target-into 类名', () => {
      const handler = new QueryDragDropHandler(() => undefined);
      const sub = group({ id: 'sub', rules: [] as never });
      const props = { rules: [rule('r1'), sub] as never };
      const h = renderGroup(props, { handler });

      act(() => {
        handler.start('r1');
        handler.over('r1', 'before', false, 0);
      });
      let rows = [...h.container.querySelectorAll<HTMLElement>('.rxdb-drag-item')];
      expect(rows[0].classList.contains('drop-invalid')).toBe(true);

      act(() => {
        handler.over('sub', 'into', true, 0);
      });
      rows = [...h.container.querySelectorAll<HTMLElement>('.rxdb-drag-item')];
      expect(rows[1].classList.contains('drop-target-into')).toBe(true);
    });
  });

  describe('拖拽事件链', () => {
    it('onItemDragStart：有 dataTransfer 时设置数据与拖拽图像并 start', () => {
      const handler = new QueryDragDropHandler(() => undefined);
      const h = renderGroup({ rules: [rule('r1')] as never }, { handler });
      const handle = h.container.querySelector('.rxdb-drag-item span[draggable="true"]') as HTMLElement;
      const dt = { effectAllowed: '', dropEffect: '', setData: vi.fn(), setDragImage: vi.fn() };

      act(() => {
        dispatchDrag(handle, makeDragEvent('dragstart', { dataTransfer: dt, clientX: 10, clientY: 20 }));
      });

      expect(dt.effectAllowed).toBe('move');
      expect(dt.setData).toHaveBeenCalledWith('text/plain', 'r1');
      expect(handler.getState().draggedItemId).toBe('r1');
    });

    it('onItemDragOver：按 clientY 计算 before / after 并写 dropEffect', () => {
      const handler = new QueryDragDropHandler(() => undefined);
      const props = { rules: [rule('r1'), rule('r2')] as never };
      const h = renderGroup(props, { handler });
      act(() => handler.start('r1'));
      const row = h.container.querySelectorAll('.rxdb-drag-item')[1] as HTMLElement;

      row.getBoundingClientRect = () =>
        ({ top: 0, bottom: 100, height: 100, left: 0, right: 0, width: 0, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;

      const dt = { dropEffect: '' };
      act(() => {
        dispatchDrag(row, makeDragEvent('dragover', { dataTransfer: dt, clientY: 10 }));
      });
      expect(handler.getState()).toMatchObject({ targetItemId: 'r2', dropMode: 'before', isValidTarget: true });
      expect(dt.dropEffect).toBe('move');

      act(() => {
        dispatchDrag(row, makeDragEvent('dragover', { dataTransfer: dt, clientY: 90 }));
      });
      expect(handler.getState().dropMode).toBe('after');
    });

    it('onItemDragOver：拖到自身时目标非法、dropEffect 为 none', () => {
      const handler = new QueryDragDropHandler(() => undefined);
      const props = { rules: [rule('r1')] as never };
      const h = renderGroup(props, { handler });
      act(() => handler.start('r1'));
      const row = h.container.querySelector('.rxdb-drag-item') as HTMLElement;
      row.getBoundingClientRect = () =>
        ({ top: 0, bottom: 100, height: 100, left: 0, right: 0, width: 0, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;

      const dt = { dropEffect: '' };
      act(() => {
        dispatchDrag(row, makeDragEvent('dragover', { dataTransfer: dt, clientY: 10 }));
      });

      expect(handler.getState().isValidTarget).toBe(false);
      expect(dt.dropEffect).toBe('none');
    });

    it('onItemDragLeave：relatedTarget 在内不清空，在外或为空清空', () => {
      const handler = new QueryDragDropHandler(() => undefined);
      const h = renderGroup({ rules: [rule('r1')] as never }, { handler });
      const row = h.container.querySelector('.rxdb-drag-item') as HTMLElement;
      act(() => {
        handler.start('r1');
        handler.over('r1', 'before', false, 0);
      });

      const inside = document.createElement('div');
      row.appendChild(inside);

      act(() => {
        dispatchDrag(row, makeDragEvent('dragleave', { relatedTarget: inside }));
      });
      expect(handler.getState().targetItemId).toBe('r1');

      act(() => {
        dispatchDrag(row, makeDragEvent('dragleave', { relatedTarget: null }));
      });
      expect(handler.getState().targetItemId).toBeNull();
    });

    it('onItemDrop：before 同组更靠后目标索引 -1；after 同组更靠前目标不加不减', () => {
      const moved: Array<[string, string, number]> = [];
      const handler = new QueryDragDropHandler((...args) => moved.push(args));
      const props = { rules: [rule('r1'), rule('r2'), rule('r3')] as never };
      const h = renderGroup(props, { handler });

      act(() => {
        handler.start('r1');
        handler.over('r3', 'before', true, 0);
      });
      const row3 = h.container.querySelectorAll('.rxdb-drag-item')[2] as HTMLElement;
      act(() => {
        dispatchDrag(row3, makeDragEvent('drop'));
      });
      // before + 同组被拖项在前 → 目标 2 - 1 = 1
      expect(moved).toEqual([['r1', 'root', 1]]);

      act(() => {
        handler.start('r3');
        handler.over('r1', 'after', true, 0);
      });
      const row1 = h.container.querySelectorAll('.rxdb-drag-item')[0] as HTMLElement;
      act(() => {
        dispatchDrag(row1, makeDragEvent('drop'));
      });
      // after + 被拖项在目标之后 → 不加不减，目标 0 + 1 = 1
      expect(moved.at(-1)).toEqual(['r3', 'root', 1]);
    });

    it('onItemDrop：into 且被拖项已在子组时索引落到末尾前一位', () => {
      const moved: Array<[string, string, number]> = [];
      const handler = new QueryDragDropHandler((...args) => moved.push(args));
      const sub = group({ id: 'sub', rules: [rule('a'), rule('r1')] as never });
      const props = { rules: [rule('r1'), sub] as never };
      const h = renderGroup(props, { handler });

      act(() => {
        handler.start('r1');
        handler.over('sub', 'into', true, 0);
      });
      const subRow = h.container.querySelectorAll('.rxdb-drag-item')[1] as HTMLElement;
      act(() => {
        dispatchDrag(subRow, makeDragEvent('drop'));
      });

      // r1 已在 sub 中 → rules.length - 1 = 1
      expect(moved).toEqual([['r1', 'sub', 1]]);
    });

    it('onItemDrop：未开始拖拽或无 handler 时只复位', () => {
      const moveItemFn = vi.fn();
      const handler = new QueryDragDropHandler(moveItemFn);
      const props = { rules: [rule('r1')] as never };
      const h = renderGroup(props, { handler });
      const row = h.container.querySelector('.rxdb-drag-item') as HTMLElement;

      act(() => {
        dispatchDrag(row, makeDragEvent('drop'));
      });
      expect(moveItemFn).not.toHaveBeenCalled();
      expect(handler.getState().draggedItemId).toBeNull();
    });

    it('dragStart 无 dataTransfer 时安全返回（不 start）', () => {
      // 浏览器 dragstart 的 dataTransfer 恒存在；无 dataTransfer 是防御分支
      // （对应 Angular 侧「无 handler 或无 dataTransfer 时安全返回」）。
      // 真实派发下 target 由派发器写入，Angular 侧「目标不在行内」分支不可经 DOM 构造，
      // 此处覆盖同一条守卫的另一半。
      const handler = new QueryDragDropHandler(() => undefined);
      const h = renderGroup({ rules: [rule('r1')] as never }, { handler });
      const handle = h.container.querySelector('.rxdb-drag-item span[draggable="true"]') as HTMLElement;

      act(() => {
        dispatchDrag(handle, makeDragEvent('dragstart', { dataTransfer: null }));
      });

      expect(handler.getState().draggedItemId).toBeNull();
    });
  });
});
