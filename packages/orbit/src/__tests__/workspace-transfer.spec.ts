import { describe, expect, it, vi } from 'vitest';
import { copyValue } from '../payload.js';
import { workspaceReceiver, workspaceSender } from '../workspace-transfer.js';

describe('工作区分块会话', () => {
  it('超过单条消息的请求和结果各只执行一次，两个调用保持顺序', async () => {
    const execute = vi.fn(async (value: unknown) => ({ source: value }));
    const receive = workspaceReceiver(execute);
    const send = workspaceSender(async frame => copyValue(await receive(copyValue(frame))));
    const text = '保存 💾 \\"'.repeat(160000);
    expect(await Promise.all([send({ text }), send(2)])).toEqual([{ source: { text } }, { source: 2 }]);
    expect(execute).toHaveBeenCalledTimes(2);
  });
  it('拒绝缺失的前序分片，下一次独立请求仍可执行', async () => {
    const execute = vi.fn(async () => 'ok');
    const receive = workspaceReceiver(execute);
    await expect(receive({ offset: 4, part: 'null', last: true })).rejects.toThrow();
    expect(execute).not.toHaveBeenCalled();
    expect(await workspaceSender(receive)(null)).toBe('ok');
  });
});
