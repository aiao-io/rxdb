import { describe, expect, it, vi } from 'vitest';
import type { LocalImageInfo, LocalWorkSummary } from './browser-media';
import { scanImageSyncSelection } from './image-sync-selection';

const info: LocalImageInfo = {
  sha256: 'a'.repeat(64),
  bytes: 12,
  mimeType: 'image/png',
  width: 1,
  height: 1,
  providerInstanceId: 'provider'
};
const work = (index: number, patch: Partial<LocalWorkSummary> = {}): LocalWorkSummary => ({
  jobId: `10000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
  prompt: `本机作品 ${index}`,
  modelId: 'fixture',
  bytes: 12,
  status: 'saved',
  ...patch
});
describe('原图同步确认清单', () => {
  it('逐文件核对并冻结摘要，损坏、缺失和超限分别统计，不写设备或远端', async () => {
    const works = [work(1), work(2, { status: 'broken' }), work(3, { bytes: 17 * 1024 * 1024 }), work(4)];
    const sourceInfo = { ...info };
    const imageInfo = vi.fn(async (id: string) => {
      if (id === works[3].jobId) throw Object.assign(new Error('文件缺失'), { code: 'corrupt' });
      return sourceInfo;
    });
    const store = { list: vi.fn(async () => works), imageInfo };
    const progress = vi.fn();
    const preview = await scanImageSyncSelection(store, new AbortController().signal, progress);
    expect(preview).toMatchObject({
      count: 4,
      eligibleCount: 1,
      eligibleBytes: 12,
      unreadableCount: 2,
      oversizedCount: 1,
      bytes: 36 + 17 * 1024 * 1024
    });
    expect(preview.page(0).map(item => item.state)).toEqual(['eligible', 'unreadable', 'oversized', 'unreadable']);
    expect(imageInfo).toHaveBeenCalledTimes(2);
    expect(progress).toHaveBeenLastCalledWith({ checked: 4, total: 4 });
    works.push(work(5));
    sourceInfo.bytes = 13;
    expect(preview.count).toBe(4);
    expect(preview.page(0)[0].info?.bytes).toBe(12);
  });
  it('分页只显示当前页；检查文件串行执行，不保留 Blob 或预览 URL', async () => {
    const works = Array.from({ length: 55 }, (_, index) => work(index));
    let active = 0;
    let maximum = 0;
    const imageInfo = vi.fn(async () => {
      active++;
      maximum = Math.max(maximum, active);
      await Promise.resolve();
      active--;
      return info;
    });
    const preview = await scanImageSyncSelection({ list: async () => works, imageInfo }, new AbortController().signal);
    expect(preview.pageCount).toBe(3);
    expect(preview.page(0)).toHaveLength(24);
    expect(preview.page(1)).toHaveLength(24);
    expect(preview.page(2)).toHaveLength(7);
    expect(maximum).toBe(1);
    expect(JSON.stringify(preview)).not.toMatch(/blob:|access_token/);
    expect(() => preview.page(-1)).toThrow('分页');
    expect(() => preview.page(3)).toThrow('分页');
  });
  it('实际原图超限时按超限排除，不能信任旧元数据大小', async () => {
    const preview = await scanImageSyncSelection(
      { list: async () => [work(1)], imageInfo: async () => ({ ...info, bytes: 17 * 1024 * 1024 }) },
      new AbortController().signal
    );
    expect(preview).toMatchObject({ eligibleCount: 0, eligibleBytes: 0, oversizedCount: 1 });
    expect(preview.page(0)[0].info).toBeNull();
  });
  it('全局锁定或未知版本停止确认，不伪装成每张文件均不可读', async () => {
    const failure = Object.assign(new Error('数据版本过高'), { code: 'incompatible' });
    await expect(
      scanImageSyncSelection(
        {
          list: async () => [work(1)],
          imageInfo: async () => {
            throw failure;
          }
        },
        new AbortController().signal
      )
    ).rejects.toBe(failure);
  });
  it('取消核对后不继续读取其他文件，不返回可确认的清单', async () => {
    const abort = new AbortController();
    const imageInfo = vi.fn(async () => {
      abort.abort(new Error('已取消'));
      return info;
    });
    await expect(
      scanImageSyncSelection({ list: async () => [work(1), work(2)], imageInfo }, abort.signal)
    ).rejects.toThrow('已取消');
    expect(imageInfo).toHaveBeenCalledOnce();
  });
  it('空图库仍可确认仅以后范围，暂不可读的单图不阻断其他文件', async () => {
    const empty = await scanImageSyncSelection(
      { list: async () => [], imageInfo: vi.fn() },
      new AbortController().signal
    );
    expect(empty).toMatchObject({ count: 0, eligibleCount: 0, pageCount: 1 });
    expect(empty.page(0)).toEqual([]);
    const preview = await scanImageSyncSelection(
      {
        list: async () => [work(1), work(2)],
        imageInfo: vi.fn().mockRejectedValueOnce({ code: 'unavailable' }).mockResolvedValue(info)
      },
      new AbortController().signal
    );
    expect(preview).toMatchObject({ eligibleCount: 1, unreadableCount: 1 });
  });
});
