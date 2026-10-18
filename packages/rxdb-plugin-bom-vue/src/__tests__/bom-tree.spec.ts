import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { BomTree } from '../index.js';
import { commands, node, state } from './test-utils.js';

describe('Vue BomTree', () => {
  it('按完整路径挂载可见节点，携带层级、数量与展开语义', async () => {
    const actions = commands();
    const wrapper = mount(BomTree, { props: { state: state(), commands: actions } });
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
    const actions = commands();
    const wrapper = mount(BomTree, { props: { state: state(), commands: actions } });
    const before = wrapper.findAll('[data-testid="bom-node"]')[1].element;
    await wrapper.setProps({ state: state({ refreshing: true }) });
    expect(wrapper.findAll('[data-testid="bom-node"]')[1].element).toBe(before);
    expect(wrapper.find('[role="status"]').text()).toMatch(/刷新/);
    await wrapper.setProps({
      state: state({
        nodes: [
          node([], { expanded: true }),
          node(['assembly'], {
            quantity: { value: '5', uom: 'pcs' }
          })
        ]
      })
    });
    expect(wrapper.findAll('[data-testid="bom-node"]')[1].element).toBe(before);
    expect(wrapper.text()).toContain('5 pcs');
    wrapper.unmount();
  });

  it('Home End 与方向键移动焦点，Enter 选择实际发生项', async () => {
    const actions = commands();
    const wrapper = mount(BomTree, { attachTo: document.body, props: { state: state(), commands: actions } });
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

  it.each(['idle', 'loading', 'empty', 'error'] as const)('%s 状态有可访问文案', phase => {
    const wrapper = mount(BomTree, {
      props: {
        state: state({ phase, nodes: [], error: phase === 'error' ? new Error('数据库失败') : null }),
        commands: commands()
      }
    });
    expect(wrapper.find(phase === 'error' ? '[role="alert"]' : '[role="status"]').text()).not.toBe('');
    wrapper.unmount();
  });

  it('展开后右键进入子节点，左键回父节点与折叠，空格切换当前路径', async () => {
    const actions = commands();
    const wrapper = mount(BomTree, {
      attachTo: document.body,
      props: {
        state: state({
          nodes: [
            node([], { hasChildren: true, expanded: true }),
            node(['assembly'], { hasChildren: true, expanded: true }),
            node(['assembly', 'child'])
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
    await wrapper.setProps({ state: state({ nodes: [node([], { hasChildren: true })] }) });
    rows = wrapper.findAll('[role="treeitem"]');
    expect(rows[0].attributes('tabindex')).toBe('0');
    wrapper.unmount();
  });

  it('编辑与展开按钮独立，选择失败显示原始领域错误，错误状态可重试', async () => {
    const actions = commands();
    const wrapper = mount(BomTree, { props: { state: state(), commands: actions } });
    const rows = wrapper.findAll('[role="treeitem"]');
    await rows[0].trigger('click');
    expect(actions.loadOccurrence).not.toHaveBeenCalled();
    await rows[1].find('button').trigger('click');
    expect(actions.toggle).toHaveBeenCalledWith(['assembly']);
    expect(actions.loadOccurrence).not.toHaveBeenCalled();
    actions.loadOccurrence.mockRejectedValueOnce(new Error('读取发生项失败'));
    await rows[1].findAll('button')[1].trigger('click');
    expect(wrapper.find('[role="alert"]').text()).toContain('读取发生项失败');
    await wrapper.setProps({ state: state({ phase: 'error', error: new Error('查询失败') }) });
    await wrapper
      .findAll('button')
      .find(button => button.text() === '重试')
      ?.trigger('click');
    expect(actions.refresh).toHaveBeenCalledOnce();
    wrapper.unmount();
  });

  it('未解析候选、截断和数量错误均保留可读的原因', () => {
    const wrapper = mount(BomTree, {
      props: {
        state: state({
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
        commands: commands()
      }
    });
    expect(wrapper.text()).toContain('候选甲');
    expect(wrapper.text()).toContain('候选乙');
    expect(wrapper.text()).toContain('depth');
    expect(wrapper.text()).toContain('完整计算需要裁决');
    wrapper.unmount();
  });
});
