import { mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import SwitchBranchDialog from './SwitchBranchDialog.vue';

/**
 * @fileoverview 带着未提交改动切分支时的确认对话框（GitHub Desktop 的「Switch branch」，Angular / React 端同名 spec 的移植）。
 */

const mounted: VueWrapper[] = [];

afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount();
});

/** 挂一个开着的对话框到 document 上：可读名要按 `aria-labelledby` 在文档里找标题。 */
const mountDialog = (switching = false) => {
  const wrapper = mount(SwitchBranchDialog, {
    attachTo: document.body,
    props: { dialog: { targetBranchId: 'main' }, activeBranch: 'feature/x', switching }
  });
  mounted.push(wrapper);
  return wrapper;
};

describe('SwitchBranchDialog', () => {
  it('关着时什么都不画', () => {
    const wrapper = mount(SwitchBranchDialog, { props: { dialog: null, activeBranch: 'feature/x', switching: false } });
    mounted.push(wrapper);

    expect(wrapper.find('[data-testid="wt-switch-dialog"]').exists()).toBe(false);
  });

  it('问改动怎么办：只有「留在当前分支」一个选项，已选中；对话框以标题命名', () => {
    const wrapper = mountDialog();

    const titleId = wrapper.get('[data-testid="wt-switch-dialog"]').attributes('aria-labelledby') ?? '';
    expect(document.getElementById(titleId)?.textContent?.trim()).toBe('Switch branch');
    expect(wrapper.get('legend').text()).toBe('You have changes on this branch. What would you like to do with them?');
    expect(wrapper.get<HTMLInputElement>('[data-testid="wt-switch-leave"]').element.checked).toBe(true);
    expect(wrapper.get('[data-testid="wt-switch-leave-option"]').text()).toBe(
      'Leave my changes on feature/x Your in-progress work will stay on this branch for you to return to later'
    );
  });

  it('确认交出请求；Cancel 与 Escape 都请求关闭', async () => {
    const wrapper = mountDialog();

    await wrapper.get('[data-testid="wt-switch-confirm"]').trigger('click');
    expect(wrapper.emitted('confirmRequested')).toHaveLength(1);

    await wrapper.get('[data-testid="wt-switch-cancel"]').trigger('click');
    await wrapper.get('[data-testid="wt-switch-dialog"]').trigger('keydown', { key: 'Escape' });
    expect(wrapper.emitted('closeRequested')).toHaveLength(2);
  });

  it('切换进行中：确认按钮置灰，连点不会切两次', () => {
    const wrapper = mountDialog(true);

    const confirm = wrapper.get<HTMLButtonElement>('[data-testid="wt-switch-confirm"]');
    expect([confirm.element.disabled, confirm.text()]).toEqual([true, 'Switching…']);
  });
});
