import { describe, expect, it, vi } from 'vitest';
import { prepareClose } from './close.js';

describe('DESKTOP-US-104 全部同意后退出', () => {
  it('后一个取消不能先销毁前一个', async () => {
    const destroy = vi.fn();
    const participants = [
      { id: 'a', dirty: true, save: vi.fn(async () => true), destroy },
      { id: 'b', dirty: true, save: vi.fn(async () => true), destroy }
    ];
    const decide = vi.fn().mockResolvedValueOnce('discard').mockResolvedValueOnce('cancel');
    expect(await prepareClose(participants, decide)).toBe(false);
    expect(destroy).not.toHaveBeenCalled();
  });
  it('全部同意之前不能丢弃文档，确认后才丢弃并销毁', async () => {
    const discard = vi.fn(async () => undefined);
    const destroy = vi.fn();
    const participants = [
      { id: 'a', dirty: true, save: async () => true, discard, destroy },
      { id: 'b', dirty: true, save: async () => true, discard, destroy }
    ];
    const decide = vi.fn().mockResolvedValueOnce('discard').mockResolvedValueOnce('cancel');
    expect(await prepareClose(participants, decide)).toBe(false);
    expect(discard).not.toHaveBeenCalled();
    expect(await prepareClose(participants, async () => 'discard')).toBe(true);
    expect(discard).toHaveBeenCalledTimes(2);
    expect(destroy).toHaveBeenCalledTimes(2);
  });
  it('保存失败保留全部实例；成功保存后才全部销毁', async () => {
    const destroy = vi.fn();
    const save = vi.fn(async () => false);
    const participant = { id: 'a', dirty: true, save, destroy };
    expect(await prepareClose([participant], async () => 'save')).toBe(false);
    expect(destroy).not.toHaveBeenCalled();
    save.mockResolvedValue(true);
    expect(await prepareClose([participant], async () => 'save')).toBe(true);
    expect(destroy).toHaveBeenCalledOnce();
  });
  it('保存完成后、销毁之前提交恢复会话；取消不能提交', async () => {
    const steps: string[] = [];
    const participant = {
      id: 'a',
      dirty: true,
      save: async () => {
        steps.push('save');
        return true;
      },
      destroy: () => {
        steps.push('destroy');
      }
    };
    const commit = async () => {
      steps.push('session');
    };
    expect(await prepareClose([participant], async () => 'cancel', commit)).toBe(false);
    expect(steps).toEqual([]);
    expect(await prepareClose([participant], async () => 'save', commit)).toBe(true);
    expect(steps).toEqual(['save', 'session', 'destroy']);
  });
  it('会话提交失败不能销毁应用', async () => {
    const destroy = vi.fn();
    const participant = { id: 'a', dirty: false, save: async () => true, destroy };
    await expect(
      prepareClose(
        [participant],
        async () => 'save',
        async () => {
          throw new Error('QUOTA');
        }
      )
    ).rejects.toThrow('QUOTA');
    expect(destroy).not.toHaveBeenCalled();
  });
});
