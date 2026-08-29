import { describe, expect, it, vi } from 'vitest';
import {
  probeStorage,
  storageProbeContent,
  STORAGE_PROBE_BYTES,
  STORAGE_PROBE_FILE_NAME,
  type StorageProbeMeta,
  type StorageProbeSurface
} from './storage-probe';

/** 一份活在内存里的 `rxdb.storage` 替身，只实现探针用得到的那三个方法。 */
const surface = (
  seed?: { readonly bytes: Uint8Array }
): { storage: StorageProbeSurface; uploads: number; files: Map<string, Uint8Array> } => {
  const files = new Map<string, Uint8Array>();
  const metas: StorageProbeMeta[] = [];
  const box = { uploads: 0 };
  if (seed) {
    files.set('seeded', seed.bytes);
    metas.push({ id: 'seeded', opfsPath: STORAGE_PROBE_FILE_NAME });
  }
  return {
    files,
    get uploads() {
      return box.uploads;
    },
    storage: {
      list: () => Promise.resolve(metas),
      upload: async file => {
        box.uploads += 1;
        const id = `uploaded-${String(box.uploads)}`;
        files.set(id, new Uint8Array(await file.arrayBuffer()));
        const meta = { id, opfsPath: file.name };
        metas.push(meta);
        return meta;
      },
      read: fileId => {
        const bytes = files.get(fileId);
        if (!bytes) throw new Error(`no such file: ${fileId}`);
        return Promise.resolve(new Blob([bytes]));
      }
    }
  };
};

describe('storageProbeContent', () => {
  /**
   * 内容必须是**确定性**的：AC#3 的判据是「整个数据目录拷走之后，摘要不变」，
   * 而随机内容让「摘要不变」退化成「这次生成的和这次读回的一致」——
   * 一个每次启动都重新生成文件的实现照样能过。
   */
  it('每次生成的都是同一份 64 KiB 内容', () => {
    const first = storageProbeContent();
    expect(first.byteLength).toBe(STORAGE_PROBE_BYTES);
    expect(first).toEqual(storageProbeContent());
  });

  /** 全零填充下，「偏移错位」「首尾截断」这类损坏读回来仍然是全零，摘要照样对得上。 */
  it('内容与偏移量有关，不是一片全零', () => {
    const content = storageProbeContent();
    expect(new Set(content.slice(0, 256)).size).toBeGreaterThan(1);
  });
});

describe('probeStorage', () => {
  /** 首次启动：文件不存在 → 写一份、读回来，`existedBefore` 为假。 */
  it('文件不存在时写入并读回，报告 existedBefore=false', async () => {
    const context = surface();
    const result = await probeStorage(context.storage);

    expect(context.uploads).toBe(1);
    expect(result.existedBefore).toBe(false);
    expect(result.byteLength).toBe(STORAGE_PROBE_BYTES);
    expect(result.digest).toMatch(/^[0-9a-f]{64}$/);
  });

  /**
   * 幂等是这条探针的硬要求：每次启动都重写一份的话，AC#1「重启后内容还在」
   * 测的就成了「刚刚写的那一份还在」，而那在纯内存实现下也成立。
   */
  it('文件已存在时只读回，不重复写入，且摘要与首次一致', async () => {
    const first = await probeStorage(surface().storage);
    const context = surface({ bytes: storageProbeContent() });
    const second = await probeStorage(context.storage);

    expect(context.uploads).toBe(0);
    expect(second.existedBefore).toBe(true);
    expect(second.digest).toBe(first.digest);
  });

  /**
   * 读回的字节与写下去的对不上时必须**抛**，不能把一个错的摘要当结果报上去。
   *
   * 报上去的话，自检结论仍是 `ok`，e2e 侧要等到「磁盘上那个文件的 sha256 与报告
   * 对不上」才发现问题 —— 而那时报告里没有任何一句说明是哪一步坏了。
   */
  it('读回的内容被损坏时抛出，而不是报一个错的摘要', async () => {
    const corrupted = storageProbeContent();
    corrupted[0] ^= 0xff;
    await expect(probeStorage(surface({ bytes: corrupted }).storage)).rejects.toThrow(/digest/);
  });

  /** 长度不对是另一种损坏形态（截断），要在摘要之前就报出来。 */
  it('读回的长度不对时抛出', async () => {
    const truncated = storageProbeContent().slice(0, 1024);
    await expect(probeStorage(surface({ bytes: truncated }).storage)).rejects.toThrow(/1024/);
  });

  /**
   * 写入用的文件名要与查找用的路径**是同一个常量**：两处各写一份字面量的话，
   * 探针会每次启动都上传一份新文件，而上面那条幂等断言用的是替身、发现不了。
   */
  it('上传时用的文件名就是查找时用的那一个', async () => {
    const context = surface();
    const upload = vi.spyOn(context.storage, 'upload');
    await probeStorage(context.storage);
    expect(upload.mock.calls[0]?.[0].name).toBe(STORAGE_PROBE_FILE_NAME);
  });
});
