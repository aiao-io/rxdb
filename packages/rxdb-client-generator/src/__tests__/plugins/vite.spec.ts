import { mkdir, mkdtemp, readdir, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { Plugin } from 'vite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import buildClientLibrary from '../../cli/build-client-lib.js';
import type { RxDBClientCLIentGeneratorOptions } from '../../cli/cli.interface.js';
import { rxdbClientGeneratorVitePlugin } from '../../plugins/vite.js';

// Vite 没有配置文件概念，repositoryGenerators 的裸包/子路径/相对路径统一按宿主 cwd 解析
// （见 plugins/vite.ts 里的 repositoryGeneratorAnchor）——插件现在把这个锚点显式传给
// buildClientLibrary，不再指望 build-client-lib.ts 内部悄悄猜一个全局单例。
const EXPECTED_REPOSITORY_GENERATOR_ANCHOR = resolve(process.cwd(), 'rxdb-client-generator.js');

vi.mock('../../cli/build-client-lib.js', () => ({
  default: vi.fn()
}));

const runBuildStart = async (plugin: Plugin): Promise<void> => {
  const buildStart = plugin.buildStart;
  if (typeof buildStart !== 'function') {
    throw new Error('Expected buildStart to be a function hook');
  }
  await (buildStart as () => void | Promise<void>)();
};

describe('rxdbClientGeneratorVitePlugin', () => {
  const buildClientLibraryMock = vi.mocked(buildClientLibrary);
  const tempDirs: string[] = [];
  const first: RxDBClientCLIentGeneratorOptions = {
    entities: ['./entities/*.ts'],
    outDir: './generated/first'
  };
  const second: RxDBClientCLIentGeneratorOptions = {
    entities: ['./other/*.ts'],
    outDir: './generated/second'
  };

  beforeEach(() => {
    buildClientLibraryMock.mockReset();
  });

  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map(dir => rm(dir, { force: true, recursive: true })));
  });

  it('accepts one generator config', async () => {
    await runBuildStart(rxdbClientGeneratorVitePlugin(first));

    expect(buildClientLibraryMock).toHaveBeenCalledTimes(1);
    expect(buildClientLibraryMock).toHaveBeenCalledWith(first, EXPECTED_REPOSITORY_GENERATOR_ANCHOR);
  });

  it('keeps array input support', async () => {
    await runBuildStart(rxdbClientGeneratorVitePlugin([first, second]));

    expect(buildClientLibraryMock).toHaveBeenCalledTimes(2);
    expect(buildClientLibraryMock).toHaveBeenNthCalledWith(1, first, EXPECTED_REPOSITORY_GENERATOR_ANCHOR);
    expect(buildClientLibraryMock).toHaveBeenNthCalledWith(2, second, EXPECTED_REPOSITORY_GENERATOR_ANCHOR);
  });

  it('does not defer generation to closeBundle', () => {
    expect(rxdbClientGeneratorVitePlugin(first).closeBundle).toBeUndefined();
  });

  it('rejects configs that share an output directory', () => {
    expect(() => rxdbClientGeneratorVitePlugin([first, { ...second, outDir: first.outDir }])).toThrow(/same outDir/);
  });

  // 首次生成时输出目录往往还不存在：父目录软链的两个别名必须在插件创建时就被认出是同一个物理目录，
  // 否则两次构建先后写进同一目录，后一个按前一个的 manifest 把对方的产物当陈旧文件删掉。
  it.each([false, true])(
    'rejects parent-symlink aliases of an output directory at creation (outDir exists: %s)',
    async existing => {
      const tempDir = await mkdtemp(join(tmpdir(), 'rxdb-client-generator-vite-alias-'));
      tempDirs.push(tempDir);
      const physicalDir = join(tempDir, 'physical');
      const aliasDir = join(tempDir, 'alias');
      await mkdir(physicalDir);
      await symlink(physicalDir, aliasDir);
      if (existing) await mkdir(join(physicalDir, 'generated'));

      expect(() =>
        rxdbClientGeneratorVitePlugin([
          { entities: [join(tempDir, 'alpha.ts')], outDir: join(physicalDir, 'generated') },
          { entities: [join(tempDir, 'beta.ts')], outDir: join(aliasDir, 'generated') }
        ])
      ).toThrow(/same outDir/);
      expect(buildClientLibraryMock).not.toHaveBeenCalled();
      expect(await readdir(physicalDir)).toEqual(existing ? ['generated'] : []);
    }
  );
});
