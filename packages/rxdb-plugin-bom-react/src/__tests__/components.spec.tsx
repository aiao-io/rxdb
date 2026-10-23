import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
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

afterEach(() => cleanup());

const description = (input: HTMLElement): string =>
  (input.getAttribute('aria-describedby') ?? '')
    .split(' ')
    .map(id => document.getElementById(id)?.textContent ?? '')
    .join(' ');

describe('React BOM 树真实挂载', () => {
  it('忙碌状态只标在树区域外层，树本身不重复标注（三端同一结构）', () => {
    const mounted = render(<BomTree state={viewState({ phase: 'loading' })} commands={viewCommands()} />);
    const busy = [...mounted.container.querySelectorAll('[aria-busy]')];
    expect(busy.map(element => [element.tagName, element.getAttribute('aria-busy')])).toEqual([['SECTION', 'true']]);
  });

  it('四状态与后台刷新有可见文本，查询失败可重试', () => {
    const commands = viewCommands();
    const mounted = render(<BomTree state={viewState()} commands={commands} />);
    expect(screen.getByRole('status').textContent).toMatch(/加载/);
    mounted.rerender(<BomTree state={viewState({ phase: 'empty' })} commands={commands} />);
    expect(screen.getByRole('status').textContent).toMatch(/没有|为空/);
    mounted.rerender(
      <BomTree state={viewState({ phase: 'error', error: new Error('真实查询失败') })} commands={commands} />
    );
    expect(screen.getByRole('alert').textContent).toContain('真实查询失败');
    fireEvent.click(screen.getByRole('button', { name: '重试' }));
    expect(commands.refresh).toHaveBeenCalledOnce();
    mounted.rerender(
      <BomTree state={viewState({ phase: 'success', nodes: [viewNode([])], refreshing: true })} commands={commands} />
    );
    expect(screen.getByRole('treeitem').getAttribute('aria-level')).toBe('1');
    expect(screen.getByRole('status').textContent).toMatch(/刷新/);
  });

  it('共享物料的两条路径保持独立，更新一条时另一条 DOM 引用不变', () => {
    const commands = viewCommands();
    const root = viewNode([]);
    const first = viewNode(['first']);
    const second = viewNode(['second']);
    const mounted = render(
      <BomTree state={viewState({ phase: 'success', nodes: [root, first, second] })} commands={commands} />
    );
    const reference = mounted.container.querySelector('[data-path=\'["second"]\']');
    expect(reference).not.toBeNull();
    mounted.rerender(
      <BomTree
        state={viewState({
          phase: 'success',
          nodes: [root, { ...first, quantity: { value: '9', uom: 'pcs' } }, second]
        })}
        commands={commands}
      />
    );
    expect(mounted.container.querySelector('[data-path=\'["second"]\']')).toBe(reference);
    expect(screen.getAllByTestId('bom-node')).toHaveLength(3);
    expect(screen.getAllByRole('treeitem')[1].getAttribute('aria-level')).toBe('2');
  });

  it('树节点的选中语义跟随当前编辑发生项并可清除', async () => {
    const commands = viewCommands();
    const nodes = [viewNode([]), viewNode(['occurrence-1']), viewNode(['occurrence-2'])];
    const initial = viewState({ phase: 'success', nodes });
    const mounted = render(<BomTree state={initial} commands={commands} />);
    const rows = screen.getAllByRole('treeitem');
    expect(rows.map(row => row.getAttribute('aria-selected'))).toEqual(['false', 'false', 'false']);

    await act(async () => {
      fireEvent.click(rows[1]);
    });
    expect(commands.loadOccurrence).toHaveBeenCalledWith('occurrence-1');
    mounted.rerender(<BomTree state={{ ...editorState(), nodes }} commands={commands} />);
    expect(rows.map(row => row.getAttribute('aria-selected'))).toEqual(['false', 'true', 'false']);

    mounted.rerender(<BomTree state={initial} commands={commands} />);
    expect(rows.map(row => row.getAttribute('aria-selected'))).toEqual(['false', 'false', 'false']);
  });

  it('方向键、Home/End 与 Enter 操作可见前序节点和当前发生项', () => {
    const commands = viewCommands();
    const nodes = [viewNode([]), viewNode(['branch'], { hasChildren: true, expanded: false }), viewNode(['other'])];
    render(<BomTree state={viewState({ phase: 'success', nodes })} commands={commands} />);
    const rows = screen.getAllByRole('treeitem');
    act(() => rows[0].focus());
    fireEvent.keyDown(rows[0], { key: 'ArrowDown' });
    expect(document.activeElement).toBe(rows[1]);
    fireEvent.keyDown(rows[1], { key: 'ArrowRight' });
    expect(commands.toggle).toHaveBeenCalledWith(['branch']);
    fireEvent.keyDown(rows[1], { key: 'End' });
    expect(document.activeElement).toBe(rows[2]);
    fireEvent.keyDown(rows[2], { key: 'Home' });
    expect(document.activeElement).toBe(rows[0]);
    fireEvent.keyDown(rows[1], { key: 'Enter' });
    expect(commands.loadOccurrence).toHaveBeenCalledWith('branch');
    fireEvent.keyDown(rows[2], { key: ' ' });
    expect(commands.toggle).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(rows[0], { key: ' ' });
    expect(commands.toggle).toHaveBeenCalledWith([]);
  });

  it('叶子按 Space 不切换展开状态', () => {
    const commands = viewCommands();
    render(<BomTree state={viewState({ phase: 'success', nodes: [viewNode(['leaf'])] })} commands={commands} />);
    const row = screen.getByRole('treeitem');
    act(() => row.focus());
    fireEvent.keyDown(row, { key: ' ' });
    expect(commands.toggle).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(row);
  });

  it('左右方向进入子节点和返回父节点，叶子与边界导航保留可访问焦点', () => {
    const commands = viewCommands();
    const nodes = [viewNode([], { hasChildren: true, expanded: true }), viewNode(['branch'])];
    render(<BomTree state={viewState({ phase: 'success', nodes })} commands={commands} />);
    const rows = screen.getAllByRole('treeitem');
    act(() => rows[0].focus());
    fireEvent.keyDown(rows[0], { key: 'ArrowRight' });
    expect(document.activeElement).toBe(rows[1]);
    fireEvent.keyDown(rows[1], { key: 'ArrowLeft' });
    expect(document.activeElement).toBe(rows[0]);
    fireEvent.keyDown(rows[0], { key: 'ArrowUp' });
    expect(document.activeElement).toBe(rows[0]);
    fireEvent.keyDown(rows[0], { key: 'ArrowLeft' });
    expect(commands.toggle).toHaveBeenCalledWith([]);
    fireEvent.keyDown(rows[1], { key: 'ArrowRight' });
    fireEvent.keyDown(rows[1], { key: 'Tab' });
    fireEvent.keyDown(rows[0], { key: 'Enter' });
    expect(commands.loadOccurrence).not.toHaveBeenCalled();
    fireEvent.click(rows[0]);
    expect(commands.loadOccurrence).not.toHaveBeenCalled();
  });

  it('编辑加载失败原样可见，再次选择成功清除旧交互错误', async () => {
    const commands = viewCommands();
    const failure = Object.assign(new Error('发生项已删除'), { code: 'BOM_ROW_GONE' });
    commands.loadOccurrence.mockRejectedValueOnce(failure);
    render(
      <BomTree
        state={viewState({ phase: 'success', nodes: [viewNode(['line'], { quantity: null })] })}
        commands={commands}
      />
    );
    const row = screen.getByRole('treeitem');
    await act(async () => {
      fireEvent.click(row);
    });
    expect(screen.getByRole('alert').textContent).toContain('BOM_ROW_GONE');
    expect(screen.getByTestId('bom-quantity').textContent).toBe('未解析');
    await act(async () => {
      fireEvent.click(row);
    });
    expect(screen.queryByRole('alert')).toBeNull();
    expect(commands.loadOccurrence).toHaveBeenCalledTimes(2);
  });

  it('行加载错误只属于发起时的那一版节点：编辑器与刷新标记不撤下，换输入（含加载态被合并）后撤下', async () => {
    const commands = viewCommands();
    commands.loadOccurrence.mockRejectedValue(Object.assign(new Error('发生项已删除'), { code: 'BOM_ROW_GONE' }));
    const loaded = viewState({ phase: 'success', nodes: [viewNode(['line'])] });
    const mounted = render(<BomTree state={loaded} commands={commands} />);
    const alerts = () => screen.queryAllByRole('alert').map(alert => alert.textContent);
    await act(async () => {
      fireEvent.click(screen.getByRole('treeitem'));
    });
    expect(alerts().join()).toContain('BOM_ROW_GONE');
    // 同一批节点上的编辑器回写与后台刷新标记不撤下错误
    mounted.rerender(
      <BomTree
        state={{ ...loaded, refreshing: true, editor: { ...loaded.editor, phase: 'error' } }}
        commands={commands}
      />
    );
    expect(alerts().join()).toContain('BOM_ROW_GONE');
    // 绑定 setInput：共享状态回到加载态，随后给出新目标的节点
    mounted.rerender(<BomTree state={viewState({ phase: 'loading', nodes: [] })} commands={commands} />);
    expect(alerts()).toEqual([]);
    mounted.rerender(
      <BomTree state={viewState({ phase: 'success', nodes: [viewNode(['other'])] })} commands={commands} />
    );
    expect(alerts()).toEqual([]);
    // 热启动时加载态与结果同一轮发布、组件只看到最终节点，旧错误同样不残留
    await act(async () => {
      fireEvent.click(screen.getByRole('treeitem'));
    });
    expect(alerts().join()).toContain('BOM_ROW_GONE');
    mounted.rerender(
      <BomTree state={viewState({ phase: 'success', nodes: [viewNode(['other'])] })} commands={commands} />
    );
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
    const mounted = render(
      <BomTree state={viewState({ phase: 'success', nodes: [viewNode(['line'])] })} commands={commands} />
    );
    await act(async () => {
      fireEvent.click(screen.getByRole('treeitem'));
    });
    mounted.rerender(
      <BomTree state={viewState({ phase: 'success', nodes: [viewNode(['other'])] })} commands={commands} />
    );
    await act(async () => {
      fail(Object.assign(new Error('旧查询的发生项读取失败'), { code: 'BOM_ROW_GONE' }));
    });
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('焦点按节点身份移动：同一轮重渲染插入展开的子节点时仍落在按键时的目标行', () => {
    const commands = viewCommands();
    const nodes = [viewNode([]), viewNode(['assembly'], { hasChildren: true, expanded: false }), viewNode(['other'])];
    const mounted = render(<BomTree state={viewState({ phase: 'success', nodes })} commands={commands} />);
    const rows = screen.getAllByRole('treeitem');
    act(() => rows[1].focus());
    fireEvent.keyDown(rows[1], { key: 'ArrowDown' });
    mounted.rerender(
      <BomTree
        state={viewState({
          phase: 'success',
          nodes: [nodes[0], { ...nodes[1], expanded: true }, viewNode(['assembly', 'child']), nodes[2]]
        })}
        commands={commands}
      />
    );
    expect(document.activeElement).toBe(rows[2]);
    expect(document.activeElement?.getAttribute('data-path')).toBe('["other"]');
  });

  it('没有根节点的视图首行是 Tab 入口，焦点节点消失后入口回到首行', () => {
    const commands = viewCommands();
    const nodes = [viewNode(['first']), viewNode(['second'])];
    const mounted = render(<BomTree state={viewState({ phase: 'success', nodes })} commands={commands} />);
    const tabIndexes = () => screen.getAllByRole('treeitem').map(row => row.tabIndex);
    expect(tabIndexes()).toEqual([0, -1]);
    act(() => screen.getAllByRole('treeitem')[1].focus());
    expect(tabIndexes()).toEqual([-1, 0]);
    mounted.rerender(<BomTree state={viewState({ phase: 'success', nodes: [nodes[0]] })} commands={commands} />);
    expect(tabIndexes()).toEqual([0]);
  });

  it('没有父节点时 ArrowLeft 保持焦点不动（WAI-ARIA tree）', () => {
    const commands = viewCommands();
    const nodes = [viewNode(['first']), viewNode(['second'])];
    render(<BomTree state={viewState({ phase: 'success', nodes })} commands={commands} />);
    const rows = screen.getAllByRole('treeitem');
    act(() => rows[1].focus());
    fireEvent.keyDown(rows[1], { key: 'ArrowLeft' });
    expect(document.activeElement).toBe(rows[1]);
    expect(commands.toggle).not.toHaveBeenCalled();
  });

  it('候选、截断与数量拒绝保持显式，不暗中选择候选', () => {
    const commands = viewCommands();
    render(
      <BomTree
        state={viewState({
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
        })}
        commands={commands}
      />
    );
    expect(screen.getByText(/未解析/)).toBeDefined();
    expect(screen.getByText('备选 A')).toBeDefined();
    expect(screen.getByText('备选 B')).toBeDefined();
    expect(screen.getByText(/截断/)).toBeDefined();
    expect(screen.getByText(/不完整结构不能计算数量/)).toBeDefined();
    expect(commands.setInput).not.toHaveBeenCalled();
  });
});

describe('React BOM 行编辑器真实挂载', () => {
  it('原生中文标签关联五个输入，保存使用规范 patch 与共享日期转换', async () => {
    const commands = viewCommands();
    render(<BomLineEditor state={editorState()} commands={commands} />);
    fireEvent.change(screen.getByLabelText('用量'), { target: { value: '3' } });
    fireEvent.change(screen.getByLabelText('组件损耗'), { target: { value: '0.1' } });
    fireEvent.change(screen.getByLabelText('投料工序'), { target: { value: '20' } });
    fireEvent.change(screen.getByLabelText('生效起点'), { target: { value: '2099-01-02T03:04' } });
    fireEvent.change(screen.getByLabelText('生效终点'), { target: { value: '2099-01-03T04:05' } });
    expect((screen.getByLabelText('生效起点') as HTMLInputElement).type).toBe('datetime-local');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '保存' }));
    });
    expect(commands.saveOccurrence).toHaveBeenCalledWith({
      qty: '3',
      componentScrap: '0.1',
      operationSeq: 20,
      effectiveFrom: new Date('2099-01-02T03:04Z'),
      effectiveTo: new Date('2099-01-03T04:05Z')
    });
  });

  it('输入控件按字段命名（三端同一表单语义）', () => {
    const mounted = render(<BomLineEditor state={editorState()} commands={viewCommands()} />);
    expect([...mounted.container.querySelectorAll('input')].map(input => input.name)).toEqual([
      'qty',
      'componentScrap',
      'operationSeq',
      'effectiveFrom',
      'effectiveTo'
    ]);
  });

  it('已发布发生项全部只读，提交表单不保存并显示真实原因', async () => {
    const commands = viewCommands();
    const mounted = render(<BomLineEditor state={editorState(false)} commands={commands} />);
    for (const label of ['用量', '组件损耗', '投料工序', '生效起点', '生效终点']) {
      expect((screen.getByLabelText(label) as HTMLInputElement).disabled).toBe(true);
    }
    expect((screen.getByRole('button', { name: '保存' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/已发布发生项只读/)).toBeDefined();
    await act(async () => {
      fireEvent.submit(mounted.container.querySelector('form')!);
    });
    expect(commands.saveOccurrence).not.toHaveBeenCalled();
  });

  it('保存中禁用表单且拒绝重复提交，原始领域错误展示 code、payload 与 message', async () => {
    const commands = viewCommands();
    const initial = editorState();
    const failure = Object.assign(new Error('检测到环 A → B → A'), {
      code: 'BOM_CYCLE',
      payload: { path: ['A', 'B', 'A'] }
    });
    const mounted = render(
      <BomLineEditor state={{ ...initial, editor: { ...initial.editor, saving: true } }} commands={commands} />
    );
    expect((screen.getByRole('button', { name: /保存/ }) as HTMLButtonElement).disabled).toBe(true);
    await act(async () => {
      fireEvent.submit(mounted.container.querySelector('form')!);
    });
    expect(commands.saveOccurrence).not.toHaveBeenCalled();
    mounted.rerender(
      <BomLineEditor
        state={{ ...initial, editor: { ...initial.editor, phase: 'error', error: failure } }}
        commands={commands}
      />
    );
    expect(screen.getByRole('alert').textContent).toContain(failure.message);
    expect(screen.getByRole('alert').textContent).toContain('BOM_CYCLE');
    expect(screen.getByRole('alert').textContent).toContain('"path"');
  });

  it('生效期字段声明 UTC 口径，东八区运行机上编辑仍按 UTC 往返', async () => {
    await inTimeZone('Asia/Shanghai', async () => {
      const commands = viewCommands();
      render(<BomLineEditor state={editorState()} commands={commands} />);
      for (const label of ['生效起点', '生效终点']) {
        expect(description(screen.getByLabelText(label))).toContain('UTC');
      }
      expect(screen.getByLabelText('用量').hasAttribute('aria-describedby')).toBe(false);
      expect((screen.getByLabelText('生效起点') as HTMLInputElement).value).toBe('2099-01-01T00:00');
      fireEvent.change(screen.getByLabelText('生效起点'), { target: { value: '2099-01-02T03:04' } });
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: '保存' }));
      });
      expect(commands.saveOccurrence).toHaveBeenCalledWith(
        expect.objectContaining({ effectiveFrom: new Date('2099-01-02T03:04Z') })
      );
    });
  });

  it('共享字段校验失败与仓储拒绝都原样显示，切换目标重置表单', async () => {
    const commands = viewCommands();
    const mounted = render(<BomLineEditor state={editorState()} commands={commands} />);
    fireEvent.change(screen.getByLabelText('投料工序'), { target: { value: '1.5' } });
    await act(async () => {
      fireEvent.submit(mounted.container.querySelector('form')!);
    });
    expect(screen.getByRole('alert').textContent).toContain('投料工序必须是正整数');
    expect(commands.saveOccurrence).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('投料工序'), { target: { value: '20' } });
    commands.saveOccurrence.mockRejectedValueOnce(
      Object.assign(new Error('保存原始错误'), { code: 'DOMAIN', payload: { id: 'occurrence-1' } })
    );
    await act(async () => {
      fireEvent.submit(mounted.container.querySelector('form')!);
    });
    expect(screen.getByRole('alert').textContent).toContain('保存原始错误');
    expect(screen.getByRole('alert').textContent).toContain('DOMAIN');
    const next = editorState();
    mounted.rerender(
      <BomLineEditor
        state={{
          ...next,
          editor: { ...next.editor, value: { ...next.editor.value!, occurrenceId: 'another', qty: '7' } }
        }}
        commands={commands}
      />
    );
    expect((screen.getByLabelText('用量') as HTMLInputElement).value).toBe('7');
    expect(screen.queryByRole('alert')).toBeNull();
    mounted.rerender(
      <BomLineEditor state={{ ...next, editor: { ...next.editor, saving: true } }} commands={commands} />
    );
    await act(async () => {
      fireEvent.submit(mounted.container.querySelector('form')!);
    });
    expect(commands.saveOccurrence).toHaveBeenCalledTimes(1);
  });

  it('未选择和加载发生项时都有状态，不伪造可编辑值', () => {
    const commands = viewCommands();
    const mounted = render(<BomLineEditor state={viewState()} commands={commands} />);
    expect(screen.queryByRole('button', { name: '保存' })).toBeNull();
    expect(screen.getByRole('status').textContent).toMatch(/选择/);
    mounted.rerender(
      <BomLineEditor
        state={viewState({ editor: { phase: 'loading', value: null, saving: false, error: null } })}
        commands={commands}
      />
    );
    expect(screen.getByRole('status').textContent).toMatch(/加载/);
  });

  it('保存中的进度状态只在表单内出现，任一时刻至多一个 status 区域', () => {
    const commands = viewCommands();
    const statuses = () => screen.queryAllByRole('status').map(status => status.textContent?.trim());
    const mounted = render(
      <BomLineEditor
        state={viewState({ editor: { phase: 'idle', value: null, saving: true, error: null } })}
        commands={commands}
      />
    );
    expect(statuses()).toEqual(['请选择一条 BOM 行进行编辑']);
    const saving = editorState();
    mounted.rerender(
      <BomLineEditor state={{ ...saving, editor: { ...saving.editor, saving: true } }} commands={commands} />
    );
    expect(statuses()).toEqual(['正在保存发生项…']);
    expect(mounted.container.querySelector('form [role=status]')).not.toBeNull();
  });
});
