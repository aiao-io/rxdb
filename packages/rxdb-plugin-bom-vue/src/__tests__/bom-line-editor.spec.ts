import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { BomLineEditor } from '../index.js';
import { commands, editableState, state } from './test-utils.js';

describe('Vue BomLineEditor', () => {
  it('四类字段有中文标签，十进制字符串经共享转换后原样保存', async () => {
    const actions = commands();
    const wrapper = mount(BomLineEditor, { props: { state: editableState(), commands: actions } });
    expect(wrapper.findAll('label').map(label => label.text())).toEqual([
      '用量',
      '组件损耗',
      '投料工序',
      '生效起点',
      '生效终点'
    ]);
    await wrapper.find('input[name="qty"]').setValue('0.000000000000000001');
    await wrapper.find('input[name="componentScrap"]').setValue('0.05');
    await wrapper.find('input[name="operationSeq"]').setValue('20');
    await wrapper.find('input[name="effectiveFrom"]').setValue('2099-02-01T12:30');
    await wrapper.find('input[name="effectiveTo"]').setValue('2099-03-01T12:30');
    await wrapper.find('form').trigger('submit');
    expect(actions.saveOccurrence).toHaveBeenCalledWith({
      qty: '0.000000000000000001',
      componentScrap: '0.05',
      operationSeq: 20,
      effectiveFrom: new Date('2099-02-01T12:30Z'),
      effectiveTo: new Date('2099-03-01T12:30Z')
    });
    wrapper.unmount();
  });

  it('已发布发生项显示只读原因，保存时显示进度并禁用控件', async () => {
    const value = editableState();
    if (!value.editor.value) throw new Error('编辑 fixture 缺值');
    value.editor.value.editable = false;
    value.editor.value.readOnlyReason = '已发布发生项只读';
    const wrapper = mount(BomLineEditor, { props: { state: value, commands: commands() } });
    expect(wrapper.text()).toContain('已发布发生项只读');
    expect(wrapper.find('button[type="submit"]').attributes('disabled')).toBeDefined();
    const saving = editableState();
    saving.editor.saving = true;
    await wrapper.setProps({ state: saving });
    expect(wrapper.find('button[type="submit"]').attributes('disabled')).toBeDefined();
    expect(wrapper.find('[role="status"]').text()).toMatch(/保存/);
    wrapper.unmount();
  });

  it('没有目标、加载和原始领域错误均有可访问提示', async () => {
    const wrapper = mount(BomLineEditor, { props: { state: state(), commands: commands() } });
    expect(wrapper.find('[role="status"]').text()).toMatch(/选择/);
    await wrapper.setProps({ state: state({ editor: { phase: 'loading', value: null, saving: false, error: null } }) });
    expect(wrapper.find('[role="status"]').text()).toMatch(/加载/);
    const failed = editableState();
    failed.editor.error = Object.assign(new Error('原始成环消息'), {
      code: 'BOM_CYCLE',
      payload: { occurrenceId: 'draft' }
    });
    await wrapper.setProps({ state: failed });
    expect(wrapper.find('[role="alert"]').text()).toContain('原始成环消息');
    wrapper.unmount();
  });

  it('共享字段校验失败与仓储拒绝都原样显示，切换目标重置表单', async () => {
    const actions = commands();
    const wrapper = mount(BomLineEditor, { props: { state: editableState(), commands: actions } });
    await wrapper.find('input[name="operationSeq"]').setValue('1.5');
    await wrapper.find('form').trigger('submit');
    expect(wrapper.find('[role="alert"]').text()).toContain('投料工序必须是正整数');
    expect(actions.saveOccurrence).not.toHaveBeenCalled();
    await wrapper.find('input[name="operationSeq"]').setValue('20');
    actions.saveOccurrence.mockRejectedValueOnce(
      Object.assign(new Error('保存原始错误'), { code: 'DOMAIN', payload: { id: 'draft' } })
    );
    await wrapper.find('form').trigger('submit');
    expect(wrapper.find('[role="alert"]').text()).toContain('保存原始错误');
    expect(wrapper.find('[role="alert"]').text()).toContain('DOMAIN');
    const next = editableState();
    if (!next.editor.value) throw new Error('编辑 fixture 缺值');
    next.editor.value.occurrenceId = 'another';
    next.editor.value.qty = '7';
    await wrapper.setProps({ state: next });
    expect((wrapper.find('input[name="qty"]').element as HTMLInputElement).value).toBe('7');
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
    next.editor.saving = true;
    await wrapper.setProps({ state: { ...next } });
    await wrapper.find('form').trigger('submit');
    expect(actions.saveOccurrence).toHaveBeenCalledTimes(1);
    wrapper.unmount();
  });
});
