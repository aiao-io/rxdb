import { describe, expect, it } from 'vitest';
import { digest, encodeBytes } from './bytes.js';
import { DesktopTransfers } from './transfers.js';
import { DesktopTransport } from './transport.js';
import type { Json } from './types.js';

describe('DESKTOP-US-503/603 分块传输与 Orbit 1 MiB 边界', () => {
  it('超过 1 MiB 的备份/文件请求和响应可逐字节往返，底层消息不超限', async () => {
    const transfers = new DesktopTransfers();
    const calls: number[] = [];
    const client = new DesktopTransport(async (method, payload) => {
      calls.push(new TextEncoder().encode(JSON.stringify(payload)).length);
      if (method === 'transfer.begin') return transfers.begin('one', payload);
      if (method === 'transfer.append') {
        transfers.append('one', payload);
        return true;
      }
      if (method === 'transfer.commit') {
        const request = await transfers.collect('one', (payload as { id: string }).id);
        expect(request.method).toBe('backup.validate');
        return transfers.wrap('one', request.payload);
      }
      if (method === 'transfer.download') return transfers.download('one', payload);
      if (method === 'transfer.release') {
        transfers.release('one', (payload as { id: string }).id);
        return true;
      }
      return transfers.wrap('one', payload);
    });
    const input: Json = { backup: { bytes: '中文🌏'.repeat(300000) } };
    expect(await client.request('backup.validate', input)).toEqual(input);
    expect(Math.max(...calls)).toBeLessThan(1024 * 1024);
    expect(transfers.size).toBe(0);
  });
  it('篡改/乱序/越权分块拒绝，完成或销毁后不保留字节', async () => {
    const transfers = new DesktopTransfers();
    const bytes = new TextEncoder().encode('{"a":1}');
    const header = { method: 'backup.validate', size: bytes.length, sha256: await digest(bytes) };
    const { id } = transfers.begin('one', header);
    expect(() => transfers.append('other', { id, index: 0, chunk: encodeBytes(bytes) })).toThrow('DENIED');
    expect(() => transfers.append('one', { id, index: 1, chunk: encodeBytes(bytes) })).toThrow('INVALID');
    transfers.append('one', { id, index: 0, chunk: encodeBytes(new TextEncoder().encode('{"a":2}')) });
    await expect(transfers.collect('one', id)).rejects.toThrow('INTEGRITY');
    expect(transfers.size).toBe(0);
    transfers.begin('one', header);
    transfers.dispose('one');
    expect(transfers.size).toBe(0);
  });
  it('限制总大小并清理超时上传，短响应不改变数据结构', async () => {
    let now = 0;
    const transfers = new DesktopTransfers(100, () => now);
    expect(() => transfers.begin('one', { method: 'backup.validate', size: 101, sha256: 'a'.repeat(64) })).toThrow(
      'LIMIT'
    );
    expect(() => transfers.begin('one', { method: 'unknown', size: 10, sha256: 'a'.repeat(64) })).toThrow('INVALID');
    transfers.begin('one', { method: 'backup.validate', size: 10, sha256: 'a'.repeat(64) });
    now = 120001;
    expect(transfers.size).toBe(0);
    expect(await transfers.wrap('one', { type: 'download', id: '伪装的普通数据' })).toEqual({
      type: 'inline',
      value: { type: 'download', id: '伪装的普通数据' }
    });
  });
  it('普通业务值即使像下载声明也保持原样，异常传输释放缓冲区', async () => {
    const transfers = new DesktopTransfers();
    const ordinary = new DesktopTransport(async (_method, payload) => transfers.wrap('one', payload));
    const value = { type: 'download', id: '普通数据' };
    expect(await ordinary.request('storage.get', value)).toEqual(value);
    const big = 'A'.repeat(300000);
    const corrupted = new DesktopTransport(async (method, payload) => {
      if (method === 'transfer.download') {
        const response = transfers.download('one', payload) as { chunk: string };
        return { chunk: response.chunk.replace(/^./, 'B') };
      }
      if (method === 'transfer.release') {
        transfers.release('one', (payload as { id: string }).id);
        return true;
      }
      return transfers.wrap('one', big);
    });
    await expect(corrupted.request('storage.get', null)).rejects.toThrow('INTEGRITY');
    expect(transfers.size).toBe(0);
  });
  it('实例销毁中止校验后不重新登记下载；缓冲区和单实例数量均受限', async () => {
    const transfers = new DesktopTransfers();
    const signal = new AbortController();
    const pending = transfers.wrap('one', 'A'.repeat(300000), signal.signal);
    signal.abort();
    await expect(pending).rejects.toThrow('CANCELLED');
    expect(transfers.size).toBe(0);
    const quota = new DesktopTransfers(100);
    const header = { method: 'backup.validate', size: 20, sha256: 'a'.repeat(64) };
    for (let i = 0; i < 4; i++) quota.begin('one', header);
    expect(() => quota.begin('one', header)).toThrow('LIMIT');
    const { id } = quota.begin('other', header);
    expect(() => quota.begin('third', header)).toThrow('LIMIT');
    expect(() => quota.release('one', id)).toThrow('DENIED');
    quota.dispose('one');
    quota.dispose('other');
    expect(quota.size).toBe(0);
  });
});
