import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { BomLineEditor, BomTree } from '../index.js';
import { editorState, viewCommands, viewNode, viewState } from './fixtures.js';

afterEach(() => cleanup());

describe('React BOM 树真实挂载', () => {
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
});
