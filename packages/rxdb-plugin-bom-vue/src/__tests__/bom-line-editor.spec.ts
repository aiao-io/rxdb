import { mount, type VueWrapper } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { BomLineEditor } from '../index.js';
import { editorState, viewCommands, viewState } from './fixtures.js';

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

const description = (wrapper: VueWrapper, name: string): string =>
  (wrapper.get(`input[name="${name}"]`).attributes('aria-describedby') ?? '')
    .split(' ')
    .map(id => wrapper.find(`[id="${id}"]`).text())
    .join(' ');

describe('Vue BomLineEditor', () => {
  it('四类字段有中文标签，十进制字符串经共享转换后原样保存', async () => {
    const actions = viewCommands();
    const wrapper = mount(BomLineEditor, { props: { state: editorState(), commands: actions } });
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

  it('输入控件按字段命名（三端同一表单语义）', () => {
    const wrapper = mount(BomLineEditor, { props: { state: editorState(), commands: viewCommands() } });
    expect(wrapper.findAll('input').map(input => input.attributes('name'))).toEqual([
      'qty',
      'componentScrap',
      'operationSeq',
      'effectiveFrom',
      'effectiveTo'
    ]);
  });

  it('生效期字段声明 UTC 口径，东八区运行机上编辑仍按 UTC 往返', async () => {
    await inTimeZone('Asia/Shanghai', async () => {
      const actions = viewCommands();
      const wrapper = mount(BomLineEditor, { props: { state: editorState(), commands: actions } });
      for (const name of ['effectiveFrom', 'effectiveTo']) expect(description(wrapper, name)).toContain('UTC');
      expect(wrapper.get('input[name="qty"]').attributes('aria-describedby')).toBeUndefined();
      expect((wrapper.get('input[name="effectiveFrom"]').element as HTMLInputElement).value).toBe('2099-01-01T00:00');
      await wrapper.get('input[name="effectiveFrom"]').setValue('2099-01-02T03:04');
      await wrapper.get('form').trigger('submit');
      expect(actions.saveOccurrence).toHaveBeenCalledWith(
        expect.objectContaining({ effectiveFrom: new Date('2099-01-02T03:04Z') })
      );
      wrapper.unmount();
    });
  });

  it('已发布发生项禁用全部字段和保存并显示只读原因，保存时显示进度', async () => {
    const actions = viewCommands();
    const wrapper = mount(BomLineEditor, { props: { state: editorState(false), commands: actions } });
    expect(wrapper.text()).toContain('已发布发生项只读');
    for (const name of ['qty', 'componentScrap', 'operationSeq', 'effectiveFrom', 'effectiveTo']) {
      expect(wrapper.get(`input[name="${name}"]`).attributes('disabled')).toBeDefined();
    }
    expect(wrapper.find('button[type="submit"]').attributes('disabled')).toBeDefined();
    await wrapper.find('form').trigger('submit');
    expect(actions.saveOccurrence).not.toHaveBeenCalled();
    const saving = editorState();
    saving.editor.saving = true;
    await wrapper.setProps({ state: saving });
    expect(wrapper.find('button[type="submit"]').attributes('disabled')).toBeDefined();
    expect(wrapper.find('[role="status"]').text()).toMatch(/保存/);
    wrapper.unmount();
  });

  it('切换发生项后忽略迟到的保存错误', async () => {
    const actions = viewCommands();
    let rejectSave!: (reason: unknown) => void;
    actions.saveOccurrence.mockImplementationOnce(
      () => new Promise<void>((_, reject) => {
        rejectSave = reject;
      })
    );
    const wrapper = mount(BomLineEditor, { props: { state: editorState(), commands: actions } });
    wrapper.element.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    const next = editorState();
    if (!next.editor.value) throw new Error('编辑 fixture 缺值');
    next.editor.value.occurrenceId = 'another';
    next.editor.value.qty = '7';
    await wrapper.setProps({ state: next });
    rejectSave(new Error('A 保存失败'));
    await Promise.resolve();
    await wrapper.vm.$nextTick();
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('没有目标、加载和原始领域错误均有可访问提示', async () => {
    const wrapper = mount(BomLineEditor, { props: { state: viewState(), commands: viewCommands() } });
    expect(wrapper.find('button[type="submit"]').exists()).toBe(false);
    expect(wrapper.find('[role="status"]').text()).toMatch(/选择/);
    await wrapper.setProps({
      state: viewState({ editor: { phase: 'loading', value: null, saving: false, error: null } })
    });
    expect(wrapper.find('[role="status"]').text()).toMatch(/加载/);
    const failed = editorState();
    failed.editor.error = Object.assign(new Error('原始成环消息'), {
      code: 'BOM_CYCLE',
      payload: { path: ['A', 'B', 'A'] }
    });
    await wrapper.setProps({ state: failed });
    const message = wrapper.find('[role="alert"]').text();
    expect(message).toContain('原始成环消息');
    expect(message).toContain('BOM_CYCLE');
    expect(message).toContain('"path"');
    wrapper.unmount();
  });

  it('保存中的进度状态只在表单内出现，任一时刻至多一个 status 区域', async () => {
    const statuses = (wrapper: VueWrapper) => wrapper.findAll('[role="status"]').map(status => status.text());
    const wrapper = mount(BomLineEditor, {
      props: {
        state: viewState({ editor: { phase: 'idle', value: null, saving: true, error: null } }),
        commands: viewCommands()
      }
    });
    expect(statuses(wrapper)).toEqual(['请选择一条 BOM 行进行编辑']);
    const saving = editorState();
    saving.editor.saving = true;
    await wrapper.setProps({ state: saving });
    expect(statuses(wrapper)).toEqual(['正在保存发生项…']);
    expect(wrapper.find('form [role="status"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it('共享字段校验失败与仓储拒绝都原样显示，切换目标重置表单', async () => {
    const actions = viewCommands();
    const wrapper = mount(BomLineEditor, { props: { state: editorState(), commands: actions } });
    await wrapper.find('input[name="operationSeq"]').setValue('1.5');
    await wrapper.find('form').trigger('submit');
    expect(wrapper.find('[role="alert"]').text()).toContain('投料工序必须是正整数');
    expect(actions.saveOccurrence).not.toHaveBeenCalled();
    await wrapper.find('input[name="operationSeq"]').setValue('20');
    actions.saveOccurrence.mockRejectedValueOnce(
      Object.assign(new Error('保存原始错误'), { code: 'DOMAIN', payload: { id: 'occurrence-1' } })
    );
    await wrapper.find('form').trigger('submit');
    expect(wrapper.find('[role="alert"]').text()).toContain('保存原始错误');
    expect(wrapper.find('[role="alert"]').text()).toContain('DOMAIN');
    const next = editorState();
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
