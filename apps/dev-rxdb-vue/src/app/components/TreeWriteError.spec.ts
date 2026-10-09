import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import TreeWriteError from './TreeWriteError.vue';

describe('TreeWriteError', () => {
  it('message 为 null 时不渲染', () => {
    const wrapper = mount(TreeWriteError, { props: { message: null } });

    expect(wrapper.find('[data-testid="tree-write-error"]').exists()).toBe(false);
  });

  it('有 message 时渲染 role=alert 的 alert-error，并显示文案', () => {
    const wrapper = mount(TreeWriteError, { props: { message: '新建失败：boom' } });
    const alert = wrapper.get('[data-testid="tree-write-error"]');

    expect(alert.element.tagName).toBe('DIV');
    expect(alert.classes()).toEqual(expect.arrayContaining(['alert', 'alert-error']));
    expect(alert.attributes('role')).toBe('alert');
    expect(alert.text()).toContain('新建失败：boom');
  });

  it('关闭按钮是 type=button 的可键盘操作按钮，点击触发 close', async () => {
    const wrapper = mount(TreeWriteError, { props: { message: '删除失败：x' } });
    const close = wrapper.get('button[aria-label="关闭错误提示"]');

    expect(close.element.tagName).toBe('BUTTON');
    expect(close.attributes('type')).toBe('button');
    await close.trigger('click');

    expect(wrapper.emitted('close')).toHaveLength(1);
  });
});
