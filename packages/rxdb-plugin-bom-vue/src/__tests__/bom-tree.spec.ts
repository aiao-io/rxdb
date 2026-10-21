import type { BomViewNode, BomViewState } from '@aiao/rxdb-plugin-bom';
import { flushPromises, mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { BomTree } from '../index.js';
import { editorState, viewCommands, viewNode, viewState } from './fixtures.js';

const defaultNodes = (): BomViewNode[] => [viewNode([]), viewNode(['assembly'], { hasChildren: true })];
const loaded = (overrides: Partial<BomViewState> = {}): BomViewState =>
  viewState({ phase: 'success', nodes: defaultNodes(), ...overrides });

describe('Vue BomTree', () => {
  it('忙碌状态只标在树区域外层，树本身不重复标注（三端同一结构）', () => {
    const wrapper = mount(BomTree, { props: { state: viewState({ phase: 'loading' }), commands: viewCommands() } });
    const busy = wrapper.findAll('[aria-busy]');
    expect(busy.map(node => [node.element.tagName, node.attributes('aria-busy')])).toEqual([['SECTION', 'true']]);
  });

  it('按完整路径挂载可见节点，携带层级、数量与展开语义', async () => {
    const actions = viewCommands();
    const wrapper = mount(BomTree, { props: { state: loaded(), commands: actions } });
    expect(wrapper.find('[role="tree"]').exists()).toBe(true);
    expect(wrapper.findAll('[role="treeitem"]')).toHaveLength(2);
    const rows = wrapper.findAll('[data-testid="bom-node"]');
    expect(rows[1].attributes('data-path')).toBe('["assembly"]');
    expect(rows[1].attributes('aria-level')).toBe('2');
    expect(rows[1].attributes('aria-expanded')).toBe('false');
    expect(rows[1].text()).toContain('2 pcs');
    await rows[1].trigger('keydown', { key: 'ArrowRight' });
    expect(actions.toggle).toHaveBeenCalledWith(['assembly']);
    wrapper.unmount();
  });

  it('刷新保留相同路径的真实元素，更新数量并显示可感知状态', async () => {
    const actions = viewCommands();
    const wrapper = mount(BomTree, { props: { state: loaded(), commands: actions } });
    const before = wrapper.findAll('[data-testid="bom-node"]')[1].element;
    await wrapper.setProps({ state: loaded({ refreshing: true }) });
    expect(wrapper.findAll('[data-testid="bom-node"]')[1].element).toBe(before);
    expect(wrapper.find('[role="status"]').text()).toMatch(/刷新/);
    await wrapper.setProps({
      state: loaded({ nodes: [viewNode([]), viewNode(['assembly'], { quantity: { value: '5', uom: 'pcs' } })] })
    });
    expect(wrapper.findAll('[data-testid="bom-node"]')[1].element).toBe(before);
    expect(wrapper.text()).toContain('5 pcs');
    wrapper.unmount();
  });

  it('树节点的选中语义跟随当前编辑发生项并可清除', async () => {
    const actions = viewCommands();
    const nodes = [viewNode([]), viewNode(['occurrence-1']), viewNode(['occurrence-2'])];
    const initial = viewState({ phase: 'success', nodes });
    const wrapper = mount(BomTree, { props: { state: initial, commands: actions } });
    const selected = () => wrapper.findAll('[role="treeitem"]').map(row => row.attributes('aria-selected'));
    expect(selected()).toEqual(['false', 'false', 'false']);
    await wrapper.findAll('[role="treeitem"]')[1].trigger('click');
    expect(actions.loadOccurrence).toHaveBeenCalledWith('occurrence-1');
    await wrapper.setProps({ state: { ...editorState(), nodes } });
    expect(selected()).toEqual(['false', 'true', 'false']);
    await wrapper.setProps({ state: initial });
    expect(selected()).toEqual(['false', 'false', 'false']);
    wrapper.unmount();
  });

  it('Home End 与方向键移动焦点，Enter 选择实际发生项', async () => {
    const actions = viewCommands();
    const wrapper = mount(BomTree, { attachTo: document.body, props: { state: loaded(), commands: actions } });
    const rows = wrapper.findAll('[role="treeitem"]');
    (rows[0].element as HTMLElement).focus();
    await rows[0].trigger('keydown', { key: 'End' });
    expect(document.activeElement).toBe(rows[1].element);
    await rows[1].trigger('keydown', { key: 'Home' });
    expect(document.activeElement).toBe(rows[0].element);
    await rows[0].trigger('keydown', { key: 'ArrowDown' });
    expect(document.activeElement).toBe(rows[1].element);
    await rows[1].trigger('keydown', { key: 'Enter' });
    expect(actions.loadOccurrence).toHaveBeenCalledWith('assembly');
    wrapper.unmount();
  });

  it('叶子按 Space 不切换展开状态', async () => {
    const actions = viewCommands();
    const wrapper = mount(BomTree, {
      attachTo: document.body,
      props: { state: viewState({ phase: 'success', nodes: [viewNode(['leaf'])] }), commands: actions }
    });
    const row = wrapper.get('[role="treeitem"]');
    (row.element as HTMLElement).focus();
    await row.trigger('keydown', { key: ' ' });
    expect(actions.toggle).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(row.element);
    wrapper.unmount();
  });

  it.each(['idle', 'loading', 'empty', 'error'] as const)('%s 状态有可访问文案', phase => {
    const wrapper = mount(BomTree, {
      props: {
        state: viewState({ phase, nodes: [], error: phase === 'error' ? new Error('数据库失败') : null }),
        commands: viewCommands()
      }
    });
    expect(wrapper.find(phase === 'error' ? '[role="alert"]' : '[role="status"]').text()).not.toBe('');
    wrapper.unmount();
  });

  it('展开后右键进入子节点，左键回父节点与折叠，空格切换当前路径', async () => {
    const actions = viewCommands();
    const wrapper = mount(BomTree, {
      attachTo: document.body,
      props: {
        state: viewState({
          phase: 'success',
          nodes: [
            viewNode([]),
            viewNode(['assembly'], { hasChildren: true, expanded: true }),
            viewNode(['assembly', 'child'])
          ]
        }),
        commands: actions
      }
    });
    let rows = wrapper.findAll('[role="treeitem"]');
    await rows[1].trigger('keydown', { key: 'ArrowRight' });
    expect(document.activeElement).toBe(rows[2].element);
    await rows[2].trigger('keydown', { key: 'ArrowLeft' });
    expect(document.activeElement).toBe(rows[1].element);
    await rows[1].trigger('keydown', { key: 'ArrowLeft' });
    expect(actions.toggle).toHaveBeenLastCalledWith(['assembly']);
    await rows[1].trigger('keydown', { key: ' ' });
    expect(actions.toggle).toHaveBeenCalledTimes(2);
    await rows[1].trigger('keydown', { key: 'ArrowUp' });
    expect(document.activeElement).toBe(rows[0].element);
    await rows[0].trigger('keydown', { key: 'ArrowUp' });
    await rows[2].trigger('keydown', { key: 'ArrowRight' });
    await rows[2].trigger('keydown', { key: ' ' });
    await rows[2].trigger('keydown', { key: 'Escape' });
    expect(actions.toggle).toHaveBeenCalledTimes(2);
    (rows[2].element as HTMLElement).focus();
    await wrapper.setProps({ state: viewState({ phase: 'success', nodes: [viewNode([], { expanded: false })] }) });
    rows = wrapper.findAll('[role="treeitem"]');
    expect(rows[0].attributes('tabindex')).toBe('0');
    wrapper.unmount();
  });

  it('没有根节点的视图首行是 Tab 入口，焦点节点消失后入口回到首行', async () => {
    const actions = viewCommands();
    const nodes = [viewNode(['first']), viewNode(['second'])];
    const wrapper = mount(BomTree, {
      attachTo: document.body,
      props: { state: viewState({ phase: 'success', nodes }), commands: actions }
    });
    const tabIndexes = () => wrapper.findAll('[role="treeitem"]').map(row => row.attributes('tabindex'));
    expect(tabIndexes()).toEqual(['0', '-1']);
    await wrapper.findAll('[role="treeitem"]')[1].trigger('focus');
    expect(tabIndexes()).toEqual(['-1', '0']);
    await wrapper.setProps({ state: viewState({ phase: 'success', nodes: [nodes[0]] }) });
    expect(tabIndexes()).toEqual(['0']);
    wrapper.unmount();
  });

  it('没有父节点时 ArrowLeft 保持焦点不动（WAI-ARIA tree）', async () => {
    const actions = viewCommands();
    const nodes = [viewNode(['first']), viewNode(['second'])];
    const wrapper = mount(BomTree, {
      attachTo: document.body,
      props: { state: viewState({ phase: 'success', nodes }), commands: actions }
    });
    const rows = wrapper.findAll('[role="treeitem"]');
    (rows[1].element as HTMLElement).focus();
    await rows[1].trigger('keydown', { key: 'ArrowLeft' });
    expect(document.activeElement).toBe(rows[1].element);
    expect(actions.toggle).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it('编辑加载失败原样可见，再次选择成功清除旧交互错误', async () => {
    const actions = viewCommands();
    actions.loadOccurrence.mockRejectedValueOnce(Object.assign(new Error('发生项已删除'), { code: 'BOM_ROW_GONE' }));
    const wrapper = mount(BomTree, {
      props: {
        state: viewState({ phase: 'success', nodes: [viewNode(['line'], { quantity: null })] }),
        commands: actions
      }
    });
    const row = wrapper.get('[role="treeitem"]');
    await row.trigger('click');
    await flushPromises();
    expect(wrapper.get('[role="alert"]').text()).toContain('BOM_ROW_GONE');
    expect(wrapper.get('[data-testid="bom-quantity"]').text()).toBe('未解析');
    await row.trigger('click');
    await flushPromises();
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
    expect(actions.loadOccurrence).toHaveBeenCalledTimes(2);
    wrapper.unmount();
  });

  it('行加载错误只属于发起时的那一版节点：编辑器与刷新标记不撤下，换输入（含加载态被合并）后撤下', async () => {
    const actions = viewCommands();
    actions.loadOccurrence.mockRejectedValue(Object.assign(new Error('发生项已删除'), { code: 'BOM_ROW_GONE' }));
    const state = viewState({ phase: 'success', nodes: [viewNode(['line'])] });
    const wrapper = mount(BomTree, { props: { state, commands: actions } });
    const alerts = () => wrapper.findAll('[role="alert"]').map(alert => alert.text());
    await wrapper.get('[role="treeitem"]').trigger('click');
    await flushPromises();
    expect(alerts().join()).toContain('BOM_ROW_GONE');
    // 同一批节点上的编辑器回写与后台刷新标记不撤下错误
    await wrapper.setProps({ state: { ...state, refreshing: true, editor: { ...state.editor, phase: 'error' } } });
    expect(alerts().join()).toContain('BOM_ROW_GONE');
    // 绑定 setInput：共享状态回到加载态，随后给出新目标的节点
    await wrapper.setProps({ state: viewState({ phase: 'loading', nodes: [] }) });
    expect(alerts()).toEqual([]);
    await wrapper.setProps({ state: viewState({ phase: 'success', nodes: [viewNode(['other'])] }) });
    expect(alerts()).toEqual([]);
    // 热启动时加载态与结果同一轮发布、组件只看到最终节点，旧错误同样不残留
    await wrapper.get('[role="treeitem"]').trigger('click');
    await flushPromises();
    expect(alerts().join()).toContain('BOM_ROW_GONE');
    await wrapper.setProps({ state: viewState({ phase: 'success', nodes: [viewNode(['other'])] }) });
    expect(alerts()).toEqual([]);
    wrapper.unmount();
  });

  it('换输入之前发起、之后才失败的行加载不把旧错误写到新树上', async () => {
    const actions = viewCommands();
    let fail: (error: unknown) => void = () => undefined;
    actions.loadOccurrence.mockImplementationOnce(
      () =>
        new Promise<void>((_, reject) => {
          fail = reject;
        })
    );
    const wrapper = mount(BomTree, {
      props: { state: viewState({ phase: 'success', nodes: [viewNode(['line'])] }), commands: actions }
    });
    await wrapper.get('[role="treeitem"]').trigger('click');
    await wrapper.setProps({ state: viewState({ phase: 'success', nodes: [viewNode(['other'])] }) });
    fail(Object.assign(new Error('旧查询的发生项读取失败'), { code: 'BOM_ROW_GONE' }));
    await flushPromises();
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('焦点按节点身份移动：同一轮重渲染插入展开的子节点时仍落在按键时的目标行', async () => {
    const actions = viewCommands();
    const nodes = [viewNode([]), viewNode(['assembly'], { hasChildren: true, expanded: false }), viewNode(['other'])];
    const wrapper = mount(BomTree, {
      attachTo: document.body,
      props: { state: viewState({ phase: 'success', nodes }), commands: actions }
    });
    const rows = wrapper.findAll('[role="treeitem"]');
    (rows[1].element as HTMLElement).focus();
    // 按键与展开后的重渲染落在同一轮：不等按键返回的 nextTick 就推送新节点
    void rows[1].trigger('keydown', { key: 'ArrowDown' });
    await wrapper.setProps({
      state: viewState({
        phase: 'success',
        nodes: [nodes[0], { ...nodes[1], expanded: true }, viewNode(['assembly', 'child']), nodes[2]]
      })
    });
    expect(document.activeElement).toBe(rows[2].element);
    expect(document.activeElement?.getAttribute('data-path')).toBe('["other"]');
    wrapper.unmount();
  });

  it('编辑与展开按钮独立，选择失败显示原始领域错误，错误状态可重试', async () => {
    const actions = viewCommands();
    const wrapper = mount(BomTree, { props: { state: loaded(), commands: actions } });
    const rows = wrapper.findAll('[role="treeitem"]');
    await rows[0].trigger('click');
    expect(actions.loadOccurrence).not.toHaveBeenCalled();
    await rows[1].find('button').trigger('click');
    expect(actions.toggle).toHaveBeenCalledWith(['assembly']);
    expect(actions.loadOccurrence).not.toHaveBeenCalled();
    actions.loadOccurrence.mockRejectedValueOnce(new Error('读取发生项失败'));
    await rows[1].findAll('button')[1].trigger('click');
    expect(wrapper.find('[role="alert"]').text()).toContain('读取发生项失败');
    await wrapper.setProps({ state: loaded({ phase: 'error', error: new Error('查询失败') }) });
    await wrapper
      .findAll('button')
      .find(button => button.text() === '重试')
      ?.trigger('click');
    expect(actions.refresh).toHaveBeenCalledOnce();
    wrapper.unmount();
  });

  it('未解析候选、截断和数量错误均保留可读的原因', () => {
    const actions = viewCommands();
    const wrapper = mount(BomTree, {
      props: {
        state: loaded({
          unresolved: [
            {
              key: 'manual',
              kind: 'manual',
              candidates: [
                { key: 'a', label: '候选甲' },
                { key: 'b', label: '候选乙' }
              ]
            }
          ],
          truncated: { reason: 'depth' },
          quantityError: new Error('完整计算需要裁决')
        }),
        commands: actions
      }
    });
    expect(wrapper.text()).toContain('候选甲');
    expect(wrapper.text()).toContain('候选乙');
    expect(wrapper.text()).toContain('depth');
    expect(wrapper.text()).toContain('完整计算需要裁决');
    expect(actions.setInput).not.toHaveBeenCalled();
    wrapper.unmount();
  });
});
