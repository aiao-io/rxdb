import type { BomViewCommands, BomViewState } from '@aiao/rxdb-plugin-bom';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { BomLineEditor, BomTree } from '../index.js';
import { editorState, viewCommands, viewNode, viewState } from './fixtures.js';

const mountTree = async (state: BomViewState, commands: BomViewCommands) => {
  const fixture = TestBed.createComponent(BomTree);
  fixture.componentRef.setInput('state', state);
  fixture.componentRef.setInput('commands', commands);
  await fixture.whenStable();
  return fixture;
};

const mountEditor = async (state: BomViewState, commands: BomViewCommands) => {
  const fixture = TestBed.createComponent(BomLineEditor);
  fixture.componentRef.setInput('state', state);
  fixture.componentRef.setInput('commands', commands);
  await fixture.whenStable();
  return fixture;
};

const element = (fixture: ComponentFixture<unknown>): HTMLElement => fixture.nativeElement as HTMLElement;
const key = (element: HTMLElement, value: string): void => {
  element.dispatchEvent(new KeyboardEvent('keydown', { key: value, bubbles: true, cancelable: true }));
};
const labeledInput = (root: HTMLElement, label: string): HTMLInputElement => {
  const element = Array.from(root.querySelectorAll('label')).find(element => element.textContent?.trim() === label);
  const input = element?.querySelector('input');
  if (input === undefined || input === null) throw new Error(`没有关联输入的标签：${label}`);
  expect(input.labels).toContain(element);
  return input;
};

describe('Angular BOM 树真实挂载', () => {
  it('四状态、后台刷新和错误重试可见', async () => {
    const commands = viewCommands();
    const mounted = await mountTree(viewState(), commands);
    expect(element(mounted).querySelector('[role=status]')?.textContent).toMatch(/加载/);
    mounted.componentRef.setInput('state', viewState({ phase: 'empty' }));
    await mounted.whenStable();
    expect(element(mounted).querySelector('[role=status]')?.textContent).toMatch(/没有|为空/);
    mounted.componentRef.setInput('state', viewState({ phase: 'error', error: new Error('真实查询失败') }));
    await mounted.whenStable();
    expect(element(mounted).querySelector('[role=alert]')?.textContent).toContain('真实查询失败');
    element(mounted).querySelector<HTMLButtonElement>('button')!.click();
    expect(commands.refresh).toHaveBeenCalledOnce();
    mounted.componentRef.setInput('state', viewState({ phase: 'success', nodes: [viewNode([])], refreshing: true }));
    await mounted.whenStable();
    expect(element(mounted).querySelector('[role=treeitem]')?.getAttribute('aria-level')).toBe('1');
    expect(element(mounted).querySelector('[role=status]')?.textContent).toMatch(/刷新/);
  });

  it('完整路径区分共享物料，更新一条数量时另一条真实 DOM 引用保持不变', async () => {
    const first = viewNode(['first']);
    const second = viewNode(['second']);
    const commands = viewCommands();
    const mounted = await mountTree(viewState({ phase: 'success', nodes: [viewNode([]), first, second] }), commands);
    const reference = element(mounted).querySelector('[data-path=\'["second"]\']');
    expect(reference).not.toBeNull();
    mounted.componentRef.setInput(
      'state',
      viewState({ phase: 'success', nodes: [viewNode([]), { ...first, quantity: { value: '9', uom: 'pcs' } }, second] })
    );
    await mounted.whenStable();
    expect(element(mounted).querySelector('[data-path=\'["second"]\']')).toBe(reference);
    expect(element(mounted).querySelectorAll('[data-testid=bom-node]')).toHaveLength(3);
    expect(element(mounted).querySelectorAll('[role=treeitem]')[1].getAttribute('aria-level')).toBe('2');
    expect(element(mounted).querySelectorAll('[role=treeitem]')[1].hasAttribute('aria-expanded')).toBe(false);
  });

  it('方向、Home/End、Enter 和 Space 操作可见前序与发生项，后代按状态惰性出现', async () => {
    const commands = viewCommands();
    const nodes = [viewNode([]), viewNode(['branch'], { hasChildren: true, expanded: false }), viewNode(['other'])];
    const mounted = await mountTree(viewState({ phase: 'success', nodes }), commands);
    const rows = Array.from(element(mounted).querySelectorAll<HTMLElement>('[role=treeitem]'));
    rows[0].focus();
    key(rows[0], 'ArrowDown');
    expect(document.activeElement).toBe(rows[1]);
    key(rows[1], 'ArrowRight');
    expect(commands.toggle).toHaveBeenCalledWith(['branch']);
    expect(rows[1].getAttribute('aria-expanded')).toBe('false');
    key(rows[1], 'End');
    expect(document.activeElement).toBe(rows[2]);
    key(rows[2], 'Home');
    expect(document.activeElement).toBe(rows[0]);
    key(rows[1], 'Enter');
    expect(commands.loadOccurrence).toHaveBeenCalledWith('branch');
    key(rows[0], ' ');
    expect(commands.toggle).toHaveBeenCalledWith([]);
    expect(element(mounted).querySelectorAll('[role=treeitem]')).toHaveLength(3);
  });

  it('叶子按 Space 不切换展开状态', async () => {
    const commands = viewCommands();
    const mounted = await mountTree(viewState({ phase: 'success', nodes: [viewNode(['leaf'])] }), commands);
    const row = element(mounted).querySelector<HTMLElement>('[role=treeitem]')!;
    row.focus();
    key(row, ' ');
    expect(commands.toggle).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(row);
  });

  it('左右方向进入子节点和返回父节点，叶子与边界导航保留可访问焦点', async () => {
    const commands = viewCommands();
    const nodes = [viewNode([], { hasChildren: true, expanded: true }), viewNode(['branch'])];
    const mounted = await mountTree(viewState({ phase: 'success', nodes }), commands);
    const rows = Array.from(element(mounted).querySelectorAll<HTMLElement>('[role=treeitem]'));
    rows[0].focus();
    key(rows[0], 'ArrowRight');
    expect(document.activeElement).toBe(rows[1]);
    key(rows[1], 'ArrowLeft');
    expect(document.activeElement).toBe(rows[0]);
    key(rows[0], 'ArrowUp');
    expect(document.activeElement).toBe(rows[0]);
    key(rows[0], 'ArrowLeft');
    expect(commands.toggle).toHaveBeenCalledWith([]);
    key(rows[1], 'ArrowRight');
    key(rows[1], 'Tab');
    key(rows[0], 'Enter');
    expect(commands.loadOccurrence).not.toHaveBeenCalled();
    rows[0].click();
    expect(commands.loadOccurrence).not.toHaveBeenCalled();
  });

  it('编辑加载失败原样可见，再次选择成功清除旧交互错误', async () => {
    const commands = viewCommands();
    const failure = Object.assign(new Error('发生项已删除'), { code: 'BOM_ROW_GONE' });
    vi.mocked(commands.loadOccurrence).mockRejectedValueOnce(failure);
    const mounted = await mountTree(
      viewState({ phase: 'success', nodes: [viewNode(['line'], { quantity: null })] }),
      commands
    );
    const row = element(mounted).querySelector<HTMLElement>('[role=treeitem]')!;
    row.click();
    await mounted.whenStable();
    expect(element(mounted).querySelector('[role=alert]')?.textContent).toContain('BOM_ROW_GONE');
    expect(element(mounted).querySelector('[data-testid=bom-quantity]')?.textContent).toBe('未解析');
    row.click();
    await mounted.whenStable();
    expect(element(mounted).querySelector('[role=alert]')).toBeNull();
    expect(commands.loadOccurrence).toHaveBeenCalledTimes(2);
  });

  it('候选、截断和数量拒绝保持可见，不自动裁决', async () => {
    const commands = viewCommands();
    const mounted = await mountTree(
      viewState({
        phase: 'success',
        nodes: [viewNode([])],
        unresolved: [
          {
            key: 'choice',
            kind: 'alternative',
            candidates: [
              { key: 'a', label: '备选 A' },
              { key: 'b', label: '备选 B' }
            ]
          }
        ],
        truncated: { reason: 'depth' },
        quantityError: new Error('不完整结构不能计算数量')
      }),
      commands
    );
    expect(element(mounted).textContent).toContain('备选 A');
    expect(element(mounted).textContent).toContain('备选 B');
    expect(element(mounted).querySelector('[role=note]')?.textContent).toContain('截断');
    expect(element(mounted).querySelector('[role=alert]')?.textContent).toContain('不完整结构不能计算数量');
    expect(commands.setInput).not.toHaveBeenCalled();
  });
});

describe('Angular BOM 行编辑器真实挂载', () => {
  it('中文原生标签关联输入，保存经共享字段转换生成四字段 patch', async () => {
    const commands = viewCommands();
    const mounted = await mountEditor(editorState(), commands);
    for (const [label, value] of [
      ['用量', '3'],
      ['组件损耗', '0.1'],
      ['投料工序', '20'],
      ['生效起点', '2099-01-02T03:04'],
      ['生效终点', '2099-01-03T04:05']
    ]) {
      const input = labeledInput(element(mounted), label);
      input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
    expect(labeledInput(element(mounted), '生效起点').type).toBe('datetime-local');
    element(mounted)
      .querySelector('form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await mounted.whenStable();
    expect(commands.saveOccurrence).toHaveBeenCalledWith({
      qty: '3',
      componentScrap: '0.1',
      operationSeq: 20,
      effectiveFrom: new Date('2099-01-02T03:04Z'),
      effectiveTo: new Date('2099-01-03T04:05Z')
    });
  });

  it('已发布发生项禁用全部字段和保存，拦截直接提交并显示真实原因', async () => {
    const commands = viewCommands();
    const mounted = await mountEditor(editorState(false), commands);
    for (const label of ['用量', '组件损耗', '投料工序', '生效起点', '生效终点']) {
      expect(labeledInput(element(mounted), label).disabled).toBe(true);
    }
    expect(element(mounted).querySelector<HTMLButtonElement>('button[type=submit]')?.disabled).toBe(true);
    expect(element(mounted).querySelector('[role=note]')?.textContent).toContain('已发布发生项只读');
    element(mounted)
      .querySelector('form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await mounted.whenStable();
    expect(commands.saveOccurrence).not.toHaveBeenCalled();
  });

  it('保存时禁用表单并拦截直接提交，错误展示原始 code、payload、message', async () => {
    const initial = editorState();
    const commands = viewCommands();
    const failure = Object.assign(new Error('检测到环 A → B → A'), {
      code: 'BOM_CYCLE',
      payload: { path: ['A', 'B', 'A'] }
    });
    const mounted = await mountEditor({ ...initial, editor: { ...initial.editor, saving: true } }, commands);
    expect(element(mounted).querySelector<HTMLButtonElement>('button[type=submit]')?.disabled).toBe(true);
    element(mounted)
      .querySelector('form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await mounted.whenStable();
    expect(commands.saveOccurrence).not.toHaveBeenCalled();
    mounted.componentRef.setInput('state', {
      ...initial,
      editor: { ...initial.editor, phase: 'error', error: failure }
    });
    await mounted.whenStable();
    const message = element(mounted).querySelector('[role=alert]')?.textContent;
    expect(message).toContain(failure.message);
    expect(message).toContain('BOM_CYCLE');
    expect(message).toContain('"path"');
  });

  it('未选择与加载状态明确，不伪造发生项或可保存表单', async () => {
    const mounted = await mountEditor(viewState(), viewCommands());
    expect(element(mounted).querySelector('button[type=submit]')).toBeNull();
    expect(element(mounted).querySelector('[role=status]')?.textContent).toMatch(/选择/);
    mounted.componentRef.setInput(
      'state',
      viewState({ editor: { phase: 'loading', value: null, saving: false, error: null } })
    );
    await mounted.whenStable();
    expect(element(mounted).querySelector('[role=status]')?.textContent).toMatch(/加载/);
  });
});
