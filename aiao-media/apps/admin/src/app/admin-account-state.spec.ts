import { describe, expect, it, vi } from 'vitest';
import { AdminAccountState } from './admin-account-state';
import { ProductRequestError } from './product-client';

const initial = {
  userId: 'owner',
  displayName: null,
  revision: 0,
  updatedAt: null,
  adminEnabled: true,
  accessDisabled: false
};
const saved = { ...initial, displayName: '新名称', revision: 1, updatedAt: '2026-11-15T00:00:00Z' };
function setup() {
  const client = { adminProfile: vi.fn(async () => initial), saveAdminProfile: vi.fn(async () => saved) };
  const state = new AdminAccountState(client);
  return { client, state };
}

describe('管理员资料状态', () => {
  it('读取旧账户并只在服务端确认保存后显示成功', async () => {
    const { state, client } = setup();
    await state.connect('owner');
    state.draft.set(' 新名称 ');
    await state.save();
    expect(client.saveAdminProfile).toHaveBeenCalledWith('新名称', 0, expect.any(String));
    expect(state.profile()).toEqual(saved);
    expect(state.draft()).toBe('新名称');
    expect(state.message()).toContain('已保存');
    expect(state.canSave()).toBe(false);
  });

  it('非法名称不发送请求', async () => {
    const { state, client } = setup();
    await state.connect('owner');
    state.draft.set(' \n ');
    await state.save();
    expect(client.saveAdminProfile).not.toHaveBeenCalled();
    expect(state.validation()).not.toBe('');
  });

  it.each([new ProductRequestError(409, 'conflict'), new Error('network')])(
    '冲突和未知结果要求重新读取，保留输入且不能盲目重试',
    async error => {
      const { state, client } = setup();
      await state.connect('owner');
      state.draft.set('新名称');
      client.saveAdminProfile.mockRejectedValueOnce(error);
      await state.save();
      expect(state.profile()).toEqual(initial);
      expect(state.draft()).toBe('新名称');
      expect(state.message()).not.toContain('已保存');
      expect(state.canSave()).toBe(false);
      await state.save();
      expect(client.saveAdminProfile).toHaveBeenCalledTimes(1);
      await state.reload();
      expect(state.draft()).toBe('');
      state.draft.set('重新修改');
      expect(state.canSave()).toBe(true);
    }
  );

  it('资料读取失败可重新读取，不影响登录身份', async () => {
    const { state, client } = setup();
    client.adminProfile.mockRejectedValueOnce(new Error('network'));
    await state.connect('owner');
    expect(state.profile()).toBeNull();
    expect(state.message()).toContain('资料');
    await state.reload();
    expect(state.profile()).toEqual(initial);
  });

  it('退出或切换账号时丢弃迟到的读取和保存回执', async () => {
    const { state, client } = setup();
    let resolveRead!: (value: typeof initial) => void;
    client.adminProfile.mockImplementationOnce(
      () =>
        new Promise(resolve => {
          resolveRead = resolve;
        })
    );
    const loading = state.connect('owner');
    await state.connect(null);
    resolveRead(initial);
    await loading;
    expect(state.profile()).toBeNull();
    await state.connect('owner');
    state.draft.set('新名称');
    let resolveSave!: (value: typeof saved) => void;
    client.saveAdminProfile.mockImplementationOnce(
      () =>
        new Promise(resolve => {
          resolveSave = resolve;
        })
    );
    const saving = state.save();
    await state.connect(null);
    resolveSave(saved);
    await saving;
    expect(state.profile()).toBeNull();
    expect(state.message()).toBe('');
  });
});
