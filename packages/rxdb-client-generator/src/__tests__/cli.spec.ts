import { realpathSync } from 'node:fs';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { isCliEntry, loadConfig, main, sameCliFileUrl } from '../cli/cli.js';

describe('rxdb-client-generator cli', () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map(dir => rm(dir, { force: true, recursive: true })));
    vi.restoreAllMocks();
  });

  it('loads ts config files and resolves paths relative to the config file', async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), 'rxdb-client-generator-'));
    tempDirs.push(tempDir);

    await mkdir(path.join(tempDir, 'entities'));
    const configPath = path.join(tempDir, 'rxdb.config.ts');

    await writeFile(
      configPath,
      [
        'export default [',
        '  {',
        "    entities: ['./entities/*.ts'],",
        "    outDir: './dist/generated',",
        '    relationQueryDeep: 10,',
        '    splitFiles: true',
        '  }',
        '];'
      ].join('\n')
    );

    const [config] = await loadConfig(configPath);

    expect(config.entities).toEqual([path.join(tempDir, 'entities', '*.ts')]);
    expect(config.outDir).toBe(path.join(tempDir, 'dist', 'generated'));
  });

  it('throws when config file is missing', async () => {
    await expect(loadConfig('/tmp/does-not-exist-rxdb.config.ts')).rejects.toThrow(/Config file not found/);
  });

  it('accepts single-object configs and named config exports', async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), 'rxdb-client-generator-'));
    tempDirs.push(tempDir);

    const singlePath = path.join(tempDir, 'single.config.ts');
    await writeFile(singlePath, `export default { entities: ['./a.ts'], outDir: './out' };`);
    const single = await loadConfig(singlePath);
    expect(single).toHaveLength(1);
    expect(single[0]!.entities[0]).toBe(path.join(tempDir, 'a.ts'));
    expect(single[0]!.outDir).toBe(path.join(tempDir, 'out'));

    const namedPath = path.join(tempDir, 'named.config.ts');
    await writeFile(
      namedPath,
      [
        'const config = {',
        "  entities: ['./b.ts'],",
        "  outDir: './named-out'",
        '};',
        'export { config };',
        'export default config;'
      ].join('\n')
    );
    const named = await loadConfig(namedPath);
    expect(named).toHaveLength(1);
    expect(named[0]!.entities[0]).toBe(path.join(tempDir, 'b.ts'));
    expect(named[0]!.outDir).toBe(path.join(tempDir, 'named-out'));
  });

  it('rejects empty arrays and invalid config shapes', async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), 'rxdb-client-generator-'));
    tempDirs.push(tempDir);

    const emptyPath = path.join(tempDir, 'empty.config.ts');
    await writeFile(emptyPath, 'export default [];');
    await expect(loadConfig(emptyPath)).rejects.toThrow(/empty array/);

    const badEntities = path.join(tempDir, 'bad-entities.config.ts');
    await writeFile(badEntities, `export default { entities: [1], outDir: './out' };`);
    await expect(loadConfig(badEntities)).rejects.toThrow(/entities must be a string array/);

    const badOutDir = path.join(tempDir, 'bad-outdir.config.ts');
    await writeFile(badOutDir, `export default { entities: ['./a.ts'], outDir: 1 };`);
    await expect(loadConfig(badOutDir)).rejects.toThrow(/outDir must be a string/);

    const nonObject = path.join(tempDir, 'non-object.config.ts');
    await writeFile(nonObject, `export default 'nope';`);
    await expect(loadConfig(nonObject)).rejects.toThrow(/must be an object/);
  });

  it('rejects configs that resolve to the same outDir', async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), 'rxdb-client-generator-'));
    tempDirs.push(tempDir);
    const configPath = path.join(tempDir, 'duplicate.config.ts');
    await writeFile(
      configPath,
      [
        'export default [',
        "  { entities: ['./a.ts'], outDir: './generated' },",
        "  { entities: ['./b.ts'], outDir: './generated' }",
        '];'
      ].join('\n')
    );

    await expect(loadConfig(configPath)).rejects.toThrow(/same outDir/);
  });

  it('rejects normalized and symlinked aliases of an output directory', async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), 'rxdb-client-generator-'));
    tempDirs.push(tempDir);
    const generatedDir = path.join(tempDir, 'generated');
    await mkdir(generatedDir);

    const normalizedConfigPath = path.join(tempDir, 'normalized-duplicate.config.ts');
    await writeFile(
      normalizedConfigPath,
      [
        'export default [',
        "  { entities: ['./a.ts'], outDir: './generated' },",
        "  { entities: ['./b.ts'], outDir: './nested/../generated' }",
        '];'
      ].join('\n')
    );
    await expect(loadConfig(normalizedConfigPath)).rejects.toThrow(/same outDir/);

    const symlinkPath = path.join(tempDir, 'generated-alias');
    await symlink(generatedDir, symlinkPath);
    const symlinkedConfigPath = path.join(tempDir, 'symlink-duplicate.config.ts');
    await writeFile(
      symlinkedConfigPath,
      [
        'export default [',
        "  { entities: ['./a.ts'], outDir: './generated' },",
        "  { entities: ['./b.ts'], outDir: './generated-alias' }",
        '];'
      ].join('\n')
    );
    await expect(loadConfig(symlinkedConfigPath)).rejects.toThrow(/same outDir/);
  });

  // 配置文件来自用户磁盘，是系统边界：`as` 强转会把 '3' / 0.5 / 'yes' 原样放进生成流程。
  it('rejects malformed relationQueryDeep and splitFiles in config files', async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), 'rxdb-client-generator-'));
    tempDirs.push(tempDir);

    const stringDeep = path.join(tempDir, 'string-deep.config.ts');
    await writeFile(stringDeep, `export default { entities: ['./a.ts'], outDir: './out', relationQueryDeep: '3' };`);
    await expect(loadConfig(stringDeep)).rejects.toThrow(/relationQueryDeep/);

    const fractionalDeep = path.join(tempDir, 'fractional-deep.config.ts');
    await writeFile(
      fractionalDeep,
      `export default { entities: ['./a.ts'], outDir: './out', relationQueryDeep: 0.5 };`
    );
    await expect(loadConfig(fractionalDeep)).rejects.toThrow(/relationQueryDeep/);

    const badSplit = path.join(tempDir, 'bad-split.config.ts');
    await writeFile(badSplit, `export default { entities: ['./a.ts'], outDir: './out', splitFiles: 'yes' };`);
    await expect(loadConfig(badSplit)).rejects.toThrow(/splitFiles/);

    // RCG-003：不校验的话字符串真值会绕过 fail-closed —— `allowEmpty: 'no'` 反而放行空构建
    const badAllowEmpty = path.join(tempDir, 'bad-allow-empty.config.ts');
    await writeFile(badAllowEmpty, `export default { entities: ['./a.ts'], outDir: './out', allowEmpty: 'no' };`);
    await expect(loadConfig(badAllowEmpty)).rejects.toThrow(/allowEmpty/);
  });

  // npm 安装后 node_modules/.bin/rxdb-client-generator 是软链；不解链就永远判不出入口，
  // CLI 跑完不报错也不生成任何文件。
  it('recognizes the CLI entry when invoked through a symlink', async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), 'rxdb-client-generator-'));
    tempDirs.push(tempDir);

    const realPath = path.join(tempDir, 'cli.js');
    const linkPath = path.join(tempDir, 'bin-link');
    await writeFile(realPath, '');
    await symlink(realPath, linkPath);

    // import.meta.url 永远是解链后的真实路径（macOS 上 /var 本身就是 /private/var 的软链）
    const realUrl = pathToFileURL(realpathSync(realPath)).href;
    expect(isCliEntry(realUrl, linkPath)).toBe(true);
    expect(isCliEntry(realUrl, realPath)).toBe(true);
    expect(isCliEntry(realUrl, undefined)).toBe(false);
    expect(isCliEntry(realUrl, path.join(tempDir, 'missing.js'))).toBe(false);
    expect(isCliEntry(pathToFileURL(path.join(tempDir, 'other.js')).href, linkPath)).toBe(false);
  });

  // Node ESM 在 Windows 上会把 import.meta.url 的盘符小写成 file:///d:/...，
  // pathToFileURL(realpathSync(argv[1])) 则保留 argv 的大写盘符 file:///D:/...。
  // 字符串全等会让 CLI 以 0 退出、不生成任何文件（windows-latest smoke 即此）。
  it('recognizes the CLI entry when import.meta.url only differs by drive-letter case', () => {
    const lower = 'file:///d:/a/rxdb/rxdb/packages/rxdb-client-generator/dist/cli.js';
    const upper = 'file:///D:/a/rxdb/rxdb/packages/rxdb-client-generator/dist/cli.js';
    const other = 'file:///D:/a/rxdb/rxdb/packages/rxdb-client-generator/dist/other.js';

    expect(sameCliFileUrl(lower, upper)).toBe(true);
    expect(sameCliFileUrl(upper, lower)).toBe(true);
    expect(sameCliFileUrl(lower, other)).toBe(false);
  });

  // Windows CI 上 `node D:\...\dist\cli.js` 的 import.meta.url 与
  // pathToFileURL(realpathSync(argv[1])).href 会因盘符大小写 / localhost 前缀而字符串不相等，
  // CLI 静默以 0 退出，rxdb-test closeBundle 等于没生成。
  it('recognizes the CLI entry when the file URL form differs from argv', async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), 'rxdb-client-generator-'));
    tempDirs.push(tempDir);

    const realPath = path.join(tempDir, 'cli.js');
    await writeFile(realPath, '');
    const realUrl = pathToFileURL(realpathSync(realPath)).href;
    const localhostUrl = realUrl.replace('file://', 'file://localhost');
    expect(localhostUrl).not.toBe(realUrl);
    expect(isCliEntry(localhostUrl, realPath)).toBe(true);

    const flippedDriveUrl = realUrl.replace(/^file:\/\/\/([A-Za-z]):/u, (_match, letter: string) => {
      const flipped = letter === letter.toLowerCase() ? letter.toUpperCase() : letter.toLowerCase();
      return `file:///${flipped}:`;
    });
    if (flippedDriveUrl !== realUrl) {
      expect(isCliEntry(flippedDriveUrl, realPath)).toBe(true);
    }
  });

  it('main prints usage and exits when no config path is provided', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`exit:${code}`);
    }) as never);
    const originalArgv = process.argv;
    process.argv = ['node', 'rxdb-client-generator'];

    await expect(main()).rejects.toThrow('exit:1');
    expect(errorSpy).toHaveBeenCalledWith('Usage: rxdb-client-generator <config-file>');
    expect(exitSpy).toHaveBeenCalledWith(1);

    process.argv = originalArgv;
  });

  it('main generates clients when a valid config path is provided', async () => {
    vi.resetModules();
    const buildMock = vi.fn(async () => undefined);
    vi.doMock('../cli/build-client-lib.js', () => ({ default: buildMock }));

    const tempDir = await mkdtemp(path.join(tmpdir(), 'rxdb-client-generator-'));
    tempDirs.push(tempDir);
    const configPath = path.join(tempDir, 'ok.config.ts');
    await writeFile(configPath, `export default { entities: ['./a.ts'], outDir: './out' };`);

    const { main: mainReloaded, loadConfig: loadReloaded } = await import('../cli/cli.js');
    // 确保配置仍可通过重新加载的模块加载。
    await expect(loadReloaded(configPath)).resolves.toHaveLength(1);

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const originalArgv = process.argv;
    process.argv = ['node', 'rxdb-client-generator', configPath];

    await mainReloaded();
    expect(buildMock).toHaveBeenCalledTimes(1);
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Generated 1 client(s)'));

    process.argv = originalArgv;
    vi.doUnmock('../cli/build-client-lib.js');
    vi.resetModules();
  });
});
