import type { BomViewCommands, BomViewState } from '@aiao/rxdb-plugin-bom';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { BomLineEditor, BomTree } from '../index.js';
import { editorState, viewCommands, viewNode, viewState } from './fixtures.js';

/** 在固定时区下运行，结束后恢复原时区；用于证明日期字段与运行机时区无关。 */
const inTimeZone = async (zone: string, run: () => Promise<void>): Promise<void> => {
  const previous = process.env['TZ'];
  process.env['TZ'] = zone;
  try {
    await run();
  } finally {
    if (previous === undefined) delete process.env['TZ'];
    else process.env['TZ'] = previous;
  }
};

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
const typeInto = (root: HTMLElement, label: string, value: string): void => {
  const input = labeledInput(root, label);
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
};
const submit = (root: HTMLElement): void => {
  root.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
};
const description = (root: HTMLElement, input: HTMLInputElement): string =>
  (input.getAttribute('aria-describedby') ?? '')
    .split(' ')
    .map(id => root.querySelector(`[id="${id}"]`)?.textContent ?? '')
    .join(' ');

describe('Angular BOM 树真实挂载', () => {
  it('忙碌状态只标在树区域外层，树本身不重复标注（三端同一结构）', async () => {
    const mounted = await mountTree(viewState({ phase: 'loading' }), viewCommands());
    const busy = [...element(mounted).querySelectorAll('[aria-busy]')];
    expect(busy.map(node => [node.tagName, node.getAttribute('aria-busy')])).toEqual([['SECTION', 'true']]);
  });

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

  it('行加载错误只属于发起时的那一版节点：编辑器与刷新标记不撤下，换输入（含加载态被合并）后撤下', async () => {
    const commands = viewCommands();
    commands.loadOccurrence.mockRejectedValue(Object.assign(new Error('发生项已删除'), { code: 'BOM_ROW_GONE' }));
    const loaded = viewState({ phase: 'success', nodes: [viewNode(['line'])] });
    const mounted = await mountTree(loaded, commands);
    const alerts = () => Array.from(element(mounted).querySelectorAll('[role=alert]')).map(alert => alert.textContent);
    element(mounted).querySelector<HTMLElement>('[role=treeitem]')!.click();
    await mounted.whenStable();
    expect(alerts().join()).toContain('BOM_ROW_GONE');
    // 同一批节点上的编辑器回写与后台刷新标记不撤下错误
    mounted.componentRef.setInput('state', {
      ...loaded,
      refreshing: true,
      editor: { ...loaded.editor, phase: 'error' }
    });
    await mounted.whenStable();
    expect(alerts().join()).toContain('BOM_ROW_GONE');
    // 绑定 setInput：共享状态回到加载态，随后给出新目标的节点
    mounted.componentRef.setInput('state', viewState({ phase: 'loading', nodes: [] }));
    await mounted.whenStable();
    expect(alerts()).toEqual([]);
    const next = viewState({ phase: 'success', nodes: [viewNode(['other'])] });
    mounted.componentRef.setInput('state', next);
    await mounted.whenStable();
    expect(alerts()).toEqual([]);
    // 热启动时加载态与结果同一轮发布、组件只看到最终节点，旧错误同样不残留
    element(mounted).querySelector<HTMLElement>('[role=treeitem]')!.click();
    await mounted.whenStable();
    expect(alerts().join()).toContain('BOM_ROW_GONE');
    mounted.componentRef.setInput('state', viewState({ phase: 'success', nodes: [viewNode(['other'])] }));
    await mounted.whenStable();
    expect(alerts()).toEqual([]);
  });

  it('换输入之前发起、之后才失败的行加载不把旧错误写到新树上', async () => {
    const commands = viewCommands();
    let fail: (error: unknown) => void = () => undefined;
    commands.loadOccurrence.mockImplementationOnce(
      () =>
        new Promise<void>((_, reject) => {
          fail = reject;
        })
    );
    const mounted = await mountTree(viewState({ phase: 'success', nodes: [viewNode(['line'])] }), commands);
    element(mounted).querySelector<HTMLElement>('[role=treeitem]')!.click();
    await mounted.whenStable();
    mounted.componentRef.setInput('state', viewState({ phase: 'success', nodes: [viewNode(['other'])] }));
    await mounted.whenStable();
    fail(Object.assign(new Error('旧查询的发生项读取失败'), { code: 'BOM_ROW_GONE' }));
    await new Promise(resolve => setTimeout(resolve, 0));
    await mounted.whenStable();
    expect(element(mounted).querySelector('[role=alert]')).toBeNull();
  });

  it('焦点按节点身份移动：同一轮重渲染插入展开的子节点时仍落在按键时的目标行', async () => {
    const commands = viewCommands();
    const nodes = [viewNode([]), viewNode(['assembly'], { hasChildren: true, expanded: false }), viewNode(['other'])];
    const mounted = await mountTree(viewState({ phase: 'success', nodes }), commands);
    const rows = Array.from(element(mounted).querySelectorAll<HTMLElement>('[role=treeitem]'));
    rows[1].focus();
    key(rows[1], 'ArrowDown');
    mounted.componentRef.setInput(
      'state',
      viewState({
        phase: 'success',
        nodes: [nodes[0], { ...nodes[1], expanded: true }, viewNode(['assembly', 'child']), nodes[2]]
      })
    );
    await mounted.whenStable();
    expect(document.activeElement).toBe(rows[2]);
    expect(document.activeElement?.getAttribute('data-path')).toBe('["other"]');
  });

  it('树节点的选中语义跟随当前编辑发生项并可清除', async () => {
    const commands = viewCommands();
    const nodes = [viewNode([]), viewNode(['occurrence-1']), viewNode(['occurrence-2'])];
    const initial = viewState({ phase: 'success', nodes });
    const mounted = await mountTree(initial, commands);
    const rows = Array.from(element(mounted).querySelectorAll<HTMLElement>('[role=treeitem]'));
    expect(rows.map(row => row.getAttribute('aria-selected'))).toEqual(['false', 'false', 'false']);
    rows[1].click();
    await mounted.whenStable();
    expect(commands.loadOccurrence).toHaveBeenCalledWith('occurrence-1');
    mounted.componentRef.setInput('state', { ...editorState(), nodes });
    await mounted.whenStable();
    expect(rows.map(row => row.getAttribute('aria-selected'))).toEqual(['false', 'true', 'false']);
    mounted.componentRef.setInput('state', initial);
    await mounted.whenStable();
    expect(rows.map(row => row.getAttribute('aria-selected'))).toEqual(['false', 'false', 'false']);
  });

  it('没有根节点的视图首行是 Tab 入口，焦点节点消失后入口回到首行', async () => {
    const commands = viewCommands();
    const nodes = [viewNode(['first']), viewNode(['second'])];
    const mounted = await mountTree(viewState({ phase: 'success', nodes }), commands);
    const tabIndexes = () =>
      Array.from(element(mounted).querySelectorAll<HTMLElement>('[role=treeitem]')).map(row => row.tabIndex);
    expect(tabIndexes()).toEqual([0, -1]);
    element(mounted).querySelectorAll<HTMLElement>('[role=treeitem]')[1].focus();
    await mounted.whenStable();
    expect(tabIndexes()).toEqual([-1, 0]);
    mounted.componentRef.setInput('state', viewState({ phase: 'success', nodes: [nodes[0]] }));
    await mounted.whenStable();
    expect(tabIndexes()).toEqual([0]);
  });

  it('没有父节点时 ArrowLeft 保持焦点不动（WAI-ARIA tree）', async () => {
    const commands = viewCommands();
    const nodes = [viewNode(['first']), viewNode(['second'])];
    const mounted = await mountTree(viewState({ phase: 'success', nodes }), commands);
    const rows = Array.from(element(mounted).querySelectorAll<HTMLElement>('[role=treeitem]'));
    rows[1].focus();
    key(rows[1], 'ArrowLeft');
    expect(document.activeElement).toBe(rows[1]);
    expect(commands.toggle).not.toHaveBeenCalled();
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
  it('输入控件按字段命名（三端同一表单语义）', async () => {
    const mounted = await mountEditor(editorState(), viewCommands());
    expect([...element(mounted).querySelectorAll('input')].map(input => input.name)).toEqual([
      'qty',
      'componentScrap',
      'operationSeq',
      'effectiveFrom',
      'effectiveTo'
    ]);
  });

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

  it('生效期字段声明 UTC 口径，东八区运行机上编辑仍按 UTC 往返', async () => {
    await inTimeZone('Asia/Shanghai', async () => {
      const commands = viewCommands();
      const mounted = await mountEditor(editorState(), commands);
      for (const label of ['生效起点', '生效终点']) {
        expect(description(element(mounted), labeledInput(element(mounted), label))).toContain('UTC');
      }
      expect(labeledInput(element(mounted), '用量').hasAttribute('aria-describedby')).toBe(false);
      expect(labeledInput(element(mounted), '生效起点').value).toBe('2099-01-01T00:00');
      typeInto(element(mounted), '生效起点', '2099-01-02T03:04');
      submit(element(mounted));
      await mounted.whenStable();
      expect(commands.saveOccurrence).toHaveBeenCalledWith(
        expect.objectContaining({ effectiveFrom: new Date('2099-01-02T03:04Z') })
      );
    });
  });

  it('共享字段校验失败与仓储拒绝都原样显示，切换目标重置表单', async () => {
    const commands = viewCommands();
    const mounted = await mountEditor(editorState(), commands);
    typeInto(element(mounted), '投料工序', '1.5');
    submit(element(mounted));
    await mounted.whenStable();
    expect(element(mounted).querySelector('[role=alert]')?.textContent).toContain('投料工序必须是正整数');
    expect(commands.saveOccurrence).not.toHaveBeenCalled();
    typeInto(element(mounted), '投料工序', '20');
    commands.saveOccurrence.mockRejectedValueOnce(
      Object.assign(new Error('保存原始错误'), { code: 'DOMAIN', payload: { id: 'occurrence-1' } })
    );
    submit(element(mounted));
    await mounted.whenStable();
    expect(element(mounted).querySelector('[role=alert]')?.textContent).toContain('保存原始错误');
    expect(element(mounted).querySelector('[role=alert]')?.textContent).toContain('DOMAIN');
    const next = editorState();
    mounted.componentRef.setInput('state', {
      ...next,
      editor: { ...next.editor, value: { ...next.editor.value!, occurrenceId: 'another', qty: '7' } }
    });
    await mounted.whenStable();
    expect(labeledInput(element(mounted), '用量').value).toBe('7');
    expect(element(mounted).querySelector('[role=alert]')).toBeNull();
    mounted.componentRef.setInput('state', { ...next, editor: { ...next.editor, saving: true } });
    await mounted.whenStable();
    submit(element(mounted));
    await mounted.whenStable();
    expect(commands.saveOccurrence).toHaveBeenCalledTimes(1);
  });

  it('切换发生项后忽略迟到的保存错误', async () => {
    const commands = viewCommands();
    let rejectSave!: (reason: unknown) => void;
    commands.saveOccurrence.mockImplementationOnce(
      () =>
        new Promise<void>((_, reject) => {
          rejectSave = reject;
        })
    );
    const mounted = await mountEditor(editorState(), commands);
    submit(element(mounted));
    const next = editorState();
    mounted.componentRef.setInput('state', {
      ...next,
      editor: { ...next.editor, value: { ...next.editor.value!, occurrenceId: 'another', qty: '7' } }
    });
    mounted.detectChanges();
    rejectSave(new Error('A 保存失败'));
    await mounted.whenStable();
    expect(element(mounted).querySelector('[role=alert]')).toBeNull();
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

  it('保存中的进度状态只在表单内出现，任一时刻至多一个 status 区域', async () => {
    const statuses = (mounted: ComponentFixture<unknown>) =>
      Array.from(element(mounted).querySelectorAll('[role=status]')).map(status => status.textContent?.trim());
    const mounted = await mountEditor(
      viewState({ editor: { phase: 'idle', value: null, saving: true, error: null } }),
      viewCommands()
    );
    expect(statuses(mounted)).toEqual(['请选择一条 BOM 行进行编辑']);
    const saving = editorState();
    mounted.componentRef.setInput('state', { ...saving, editor: { ...saving.editor, saving: true } });
    await mounted.whenStable();
    expect(statuses(mounted)).toEqual(['正在保存发生项…']);
    expect(element(mounted).querySelector('form [role=status]')).not.toBeNull();
  });
});
