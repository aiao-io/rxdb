import { describe, expect, it, vi } from 'vitest';

import { MAX_DESKTOP_BACKUP_BYTES, decodeDesktopBackup, encodeDesktopBackup } from './desktop-backup-archive';

const fixture = () => ({
  schema: 123,
  createdAt: '2026-11-17T00:00:00.000Z',
  sourceOrigin: 'https://desktop.example',
  database: new Blob(['database snapshot']),
  files: [
    { path: ['blobs', '中文 🌏'], blob: new Blob([new Uint8Array([0, 255, 128, 42])]) },
    { path: ['blobs', 'empty'], blob: new Blob() }
  ]
});

/** 改清单但保留合法封装校验，模拟不可信来源构造的包。 */
async function rewriteManifest(blob: Blob, change: (manifest: Record<string, unknown>) => void): Promise<Blob> {
  const magic = new TextEncoder().encode('AIAO-DESKTOP-BACKUP/1\n');
  const prefix = new Uint8Array(await blob.slice(0, magic.length + 4).arrayBuffer());
  const length = new DataView(prefix.buffer).getUint32(magic.length, true);
  const manifest = JSON.parse(await blob.slice(prefix.length, prefix.length + length).text()) as Record<
    string,
    unknown
  >;
  change(manifest);
  const header = new TextEncoder().encode(JSON.stringify(manifest));
  new DataView(prefix.buffer).setUint32(magic.length, header.length, true);
  const digest = await crypto.subtle.digest('SHA-256', header);
  return new Blob([prefix, header, blob.slice(magic.length + 4 + length, blob.size - 32), digest]);
}

describe('完整桌面归档', () => {
  it('数据库、中文路径、二进制、零字节文件和来源元数据无损往返', async () => {
    const input = fixture();
    const archive = await encodeDesktopBackup(input);
    const restored = await decodeDesktopBackup(archive, 123);
    expect(restored.manifest).toMatchObject({
      schema: 123,
      sourceOrigin: 'https://desktop.example',
      createdAt: input.createdAt
    });
    expect(await restored.database.text()).toBe('database snapshot');
    expect(restored.files.map(file => file.path)).toEqual(input.files.map(file => file.path));
    expect(new Uint8Array(await restored.files[0].blob.arrayBuffer())).toEqual(new Uint8Array([0, 255, 128, 42]));
    expect(restored.files[1].blob.size).toBe(0);
    expect(archive.type).toBe('application/vnd.aiao.desktop-backup');
  });

  it('拒绝其他 schema 和其他归档格式，不猜测兼容性', async () => {
    const archive = await encodeDesktopBackup(fixture());
    await expect(decodeDesktopBackup(archive, 124)).rejects.toMatchObject({ code: 'incompatible_version' });
    await expect(decodeDesktopBackup(new Blob(['not a backup']), 123)).rejects.toMatchObject({
      code: 'invalid_archive'
    });
    const other = await rewriteManifest(archive, manifest => {
      manifest['formatVersion'] = 2;
    });
    await expect(decodeDesktopBackup(other, 123)).rejects.toMatchObject({ code: 'incompatible_version' });
  });

  it('任一数据库、文件体或清单字节损坏，以及截断和多余尾部都被拒绝', async () => {
    const archive = await encodeDesktopBackup(fixture());
    const bytes = new Uint8Array(await archive.arrayBuffer());
    for (const offset of [0, 40, bytes.length - 33, bytes.length - 1]) {
      const altered = bytes.slice();
      altered[offset] ^= 1;
      await expect(decodeDesktopBackup(new Blob([altered]), 123)).rejects.toMatchObject({ code: 'invalid_archive' });
    }
    for (const length of [1, 20, bytes.length - 1, bytes.length - 32])
      await expect(decodeDesktopBackup(archive.slice(0, length), 123)).rejects.toMatchObject({
        code: 'invalid_archive'
      });
    await expect(decodeDesktopBackup(new Blob([archive, 'trailing']), 123)).rejects.toMatchObject({
      code: 'invalid_archive'
    });
  });

  it('导出拒绝重复路径、穿越、控制字符、空段和空数据库', async () => {
    const base = fixture();
    for (const path of [[], ['..'], ['a/b'], ['a\\b'], [''], ['a\0b']])
      await expect(encodeDesktopBackup({ ...base, files: [{ path, blob: new Blob() }] })).rejects.toMatchObject({
        code: 'invalid_archive'
      });
    await expect(encodeDesktopBackup({ ...base, files: [base.files[0], base.files[0]] })).rejects.toMatchObject({
      code: 'invalid_archive'
    });
    await expect(
      encodeDesktopBackup({
        ...base,
        files: [
          { path: ['a'], blob: new Blob() },
          { path: ['a', 'b'], blob: new Blob() }
        ]
      })
    ).rejects.toMatchObject({ code: 'invalid_archive' });
    await expect(encodeDesktopBackup({ ...base, database: new Blob() })).rejects.toMatchObject({
      code: 'invalid_archive'
    });
  });

  it('导入独立验证清单，拒绝非法路径、重复项、错误大小、摘要、时间和来源', async () => {
    const archive = await encodeDesktopBackup(fixture());
    const changes: ((manifest: Record<string, unknown>) => void)[] = [
      manifest => {
        manifest['entries'] = [];
      },
      manifest => {
        const entries = manifest['entries'] as Record<string, unknown>[];
        entries[1]['path'] = ['files', '..', 'escape'];
      },
      manifest => {
        const entries = manifest['entries'] as Record<string, unknown>[];
        entries[2]['path'] = entries[1]['path'];
      },
      manifest => {
        (manifest['entries'] as Record<string, unknown>[])[1]['size'] = -1;
      },
      manifest => {
        (manifest['entries'] as Record<string, unknown>[])[0]['sha256'] = 'bad';
      },
      manifest => {
        manifest['createdAt'] = 'not a date';
      },
      manifest => {
        manifest['sourceOrigin'] = 'javascript:alert(1)';
      }
    ];
    for (const change of changes)
      await expect(decodeDesktopBackup(await rewriteManifest(archive, change), 123)).rejects.toMatchObject({
        code: 'invalid_archive'
      });
  });

  it('超限在读取全部内容前被拒绝，导出也不产生部分成功包', async () => {
    const oversized = new Blob();
    Object.defineProperty(oversized, 'size', { value: MAX_DESKTOP_BACKUP_BYTES + 1 });
    const read = vi.spyOn(oversized, 'arrayBuffer');
    await expect(decodeDesktopBackup(oversized, 123)).rejects.toMatchObject({ code: 'too_large' });
    await expect(encodeDesktopBackup({ ...fixture(), database: oversized })).rejects.toMatchObject({
      code: 'too_large'
    });
    expect(read).not.toHaveBeenCalled();
  });
});
