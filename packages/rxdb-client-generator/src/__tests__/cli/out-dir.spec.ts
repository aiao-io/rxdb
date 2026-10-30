import { realpathSync } from 'node:fs';
import { mkdir, mkdtemp, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolvePhysicalPath } from '../../cli/out-dir.js';

// 配置唯一性校验、构建队列与 watcher 共用这一个物理路径判据：
// 同一个物理目录不论此刻存不存在、经不经软链别名，都必须得到同一个结果。
describe('resolvePhysicalPath', () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    vi.restoreAllMocks();
    await Promise.all(tempDirs.splice(0).map(dir => rm(dir, { force: true, recursive: true })));
  });

  const setup = async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), 'rxdb-client-generator-out-dir-'));
    tempDirs.push(tempDir);
    const physicalDir = path.join(tempDir, 'physical');
    const aliasDir = path.join(tempDir, 'alias');
    await mkdir(physicalDir);
    await symlink(physicalDir, aliasDir);
    return { aliasDir, physicalDir, realPhysicalDir: realpathSync.native(physicalDir) };
  };

  it('已存在的路径解开软链', async () => {
    const { aliasDir, realPhysicalDir } = await setup();

    expect(resolvePhysicalPath(aliasDir)).toBe(realPhysicalDir);
  });

  it('尚不存在的后续段拼回最近存在祖先的物理路径', async () => {
    const { aliasDir, physicalDir, realPhysicalDir } = await setup();
    const expected = path.join(realPhysicalDir, 'generated', 'nested');

    expect(resolvePhysicalPath(path.join(physicalDir, 'generated', 'nested'))).toBe(expected);
    expect(resolvePhysicalPath(path.join(aliasDir, 'generated', 'nested'))).toBe(expected);
  });

  it('整条链上没有可 realpath 的祖先时返回词法绝对路径', () => {
    vi.spyOn(realpathSync, 'native').mockImplementation(() => {
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    });

    expect(resolvePhysicalPath('relative/../generated')).toBe(path.resolve('generated'));
  });
});
