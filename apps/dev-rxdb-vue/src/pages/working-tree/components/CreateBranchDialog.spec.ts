import { mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import CreateBranchDialog, { type CreateBranchDialogState } from './CreateBranchDialog.vue';

/**
 * @fileoverview 「Create a branch」对话框（GitHub Desktop 的 `create-branch-dialog.tsx`）：History 右键从提交建，
 * 分支下拉的 New branch 从当前分支 HEAD 建，两处共用（Angular / React 端同名 spec 的移植）。
 */

const FROM_COMMIT: CreateBranchDialogState = {
  base: { commitId: '0123456789abcdef', summary: 'Add todos' },
  from: 'commit',
  availability: 'ok'
};

interface DialogProps {
  readonly dialog?: CreateBranchDialogState;
  readonly activeBranch?: string;
  readonly name?: string;
  readonly error?: string | null;
  readonly creating?: boolean;
}

const mounted: VueWrapper[] = [];

afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount();
});

/** 挂一个开着的对话框到 document 上：可读名要按 `aria-labelledby` 找标题、按 `<label for>` 找名字框的标签。 */
const mountDialog = (props: DialogProps = {}) => {
  const wrapper = mount(CreateBranchDialog, {
    attachTo: document.body,
    props: {
      dialog: props.dialog ?? FROM_COMMIT,
      activeBranch: props.activeBranch ?? 'main',
      name: props.name ?? '',
      error: props.error ?? null,
      creating: props.creating ?? false
    }
  });
  mounted.push(wrapper);
  return wrapper;
};

const confirmButton = (wrapper: VueWrapper) =>
  wrapper.get<HTMLButtonElement>('[data-testid="wt-create-branch-confirm"]');

describe('CreateBranchDialog', () => {
  it('关着时什么都不画', () => {
    const wrapper = mount(CreateBranchDialog, {
      props: { dialog: null, activeBranch: 'main', name: '', error: null, creating: false }
    });
    mounted.push(wrapper);

    expect(wrapper.find('[data-testid="wt-create-branch-dialog"]').exists()).toBe(false);
  });

  it('基于提交：以标题命名，名字框有可读名，写明基于哪个提交', () => {
    const wrapper = mountDialog();

    const titleId = wrapper.get('[data-testid="wt-create-branch-dialog"]').attributes('aria-labelledby') ?? '';
    expect(document.getElementById(titleId)?.textContent?.trim()).toBe('Create a branch');
    const input = wrapper.get<HTMLInputElement>('[data-testid="wt-create-branch-name"]').element;
    expect(input.labels?.[0]?.textContent?.trim()).toBe('Name');
    expect(wrapper.get('[data-testid="wt-create-branch-base"]').text()).toBe(
      "Your new branch will be based on the commit 'Add todos' (0123456) from your repository."
    );
  });

  it('基于当前分支：写明是当前分支；在默认分支上补一句它是默认分支', () => {
    const fromBranch: CreateBranchDialogState = { ...FROM_COMMIT, from: 'branch' };
    const onMain = mountDialog({ dialog: fromBranch, activeBranch: 'main' });
    expect(onMain.get('[data-testid="wt-create-branch-base"]').text()).toBe(
      'Your new branch will be based on your currently checked out branch (main). main is the default branch for your repository.'
    );

    const onFeature = mountDialog({ dialog: fromBranch, activeBranch: 'feature/x' });
    expect(onFeature.get('[data-testid="wt-create-branch-base"]').text()).toBe(
      'Your new branch will be based on your currently checked out branch (feature/x).'
    );
  });

  it('名字为空或全是空白：Create 置灰；有名字时点 Create 交出去掉首尾空白的名字', async () => {
    const empty = mountDialog({ name: '   ' });
    expect(confirmButton(empty).element.disabled).toBe(true);

    const wrapper = mountDialog({ name: '  feature/y ' });
    expect(confirmButton(wrapper).element.disabled).toBe(false);
    await confirmButton(wrapper).trigger('click');
    expect(wrapper.emitted('confirmRequested')).toEqual([['feature/y']]);
  });

  it('名字框里回车提交；输入法组字中的回车不提交', async () => {
    const wrapper = mountDialog({ name: 'feature/y' });
    const input = wrapper.get('[data-testid="wt-create-branch-name"]');

    await input.trigger('keydown', { key: 'Enter', isComposing: true });
    expect(wrapper.emitted('confirmRequested')).toBeUndefined();
    await input.trigger('keydown', { key: 'Enter' });
    expect(wrapper.emitted('confirmRequested')).toEqual([['feature/y']]);
  });

  it('预检还没回来：写着在检查，Create 置灰', () => {
    const wrapper = mountDialog({ dialog: { ...FROM_COMMIT, availability: 'checking' }, name: 'y' });

    expect(wrapper.get('[data-testid="wt-create-branch-checking"]').text()).toBe('Checking this commit…');
    expect(confirmButton(wrapper).element.disabled).toBe(true);
  });

  it('预检被拒：以 alert 写明原因，Create 置灰', () => {
    const wrapper = mountDialog({ dialog: { ...FROM_COMMIT, availability: 'history_rewritten' }, name: 'y' });

    const reason = wrapper.get('[data-testid="wt-create-branch-unavailable"]');
    expect(reason.attributes('role')).toBe('alert');
    expect(reason.text()).toBe(
      'Changes in this commit were undone or redone after it was made, so a branch based on it would not match it.'
    );
    expect(confirmButton(wrapper).element.disabled).toBe(true);
  });

  it('建分支报错：以 alert 写出来；进行中按钮置灰、写着 Creating…', () => {
    const failed = mountDialog({ name: 'main', error: 'Branch id (main) already exists' });
    const error = failed.get('[data-testid="wt-create-branch-error"]');
    expect([error.attributes('role'), error.text()]).toEqual(['alert', 'Branch id (main) already exists']);

    const creating = mountDialog({ name: 'y', creating: true });
    expect([confirmButton(creating).element.disabled, confirmButton(creating).text()]).toEqual([true, 'Creating…']);
  });

  it('名字框里组字中的 Escape 是输入法在取消候选词，不关对话框', async () => {
    const wrapper = mountDialog({ name: 'feature/y' });
    const input = wrapper.get('[data-testid="wt-create-branch-name"]');

    await input.trigger('keydown', { key: 'Escape', isComposing: true });
    expect(wrapper.emitted('closeRequested')).toBeUndefined();
    await input.trigger('keydown', { key: 'Escape' });
    expect(wrapper.emitted('closeRequested')).toHaveLength(1);
  });

  it('Cancel 与 Escape 都请求关闭', async () => {
    const wrapper = mountDialog();

    await wrapper.get('[data-testid="wt-create-branch-cancel"]').trigger('click');
    await wrapper.get('[data-testid="wt-create-branch-dialog"]').trigger('keydown', { key: 'Escape' });
    expect(wrapper.emitted('closeRequested')).toHaveLength(2);
  });
});
