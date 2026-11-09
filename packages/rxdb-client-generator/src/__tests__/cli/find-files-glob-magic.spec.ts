import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import findFiles, { getGlobWatchRoot, isGlobPattern } from '../../cli/find-files.js';

describe('实体模式使用完整 glob 语法（RV-064）', () => {
  let directory: string;

  beforeEach(async () => {
    directory = await mkdtemp(path.join(tmpdir(), 'review-parallel-glob-'));
    await Promise.all(['A.ts', 'B.ts'].map(file => writeFile(path.join(directory, file), 'export {};')));
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it.each(['[AB].ts', '{A,B}.ts'])('展开不含星号或问号的 %s', async pattern => {
    const actual = await findFiles([path.join(directory, pattern)]);
    expect(actual.sort()).toEqual(['A.ts', 'B.ts'].map(file => path.join(directory, file)).sort());
  });

  it('普通星号模式仍展开为实际文件', async () => {
    const actual = await findFiles([path.join(directory, '*.ts')]);
    expect(actual.sort()).toEqual(['A.ts', 'B.ts'].map(file => path.join(directory, file)).sort());
  });

  it.each(['[CD].ts', '{C,D}.ts'])('字符类/花括号零匹配时仍遵守 allowEmpty=false 的失败契约: %s', async pattern => {
    await expect(findFiles([path.join(directory, pattern)])).rejects.toThrow('No files matched the entity pattern');
  });

  it.each(['[CD].ts', '{C,D}.ts'])('字符类/花括号零匹配在 allowEmpty=true 时返回空数组: %s', async pattern => {
    const actual = await findFiles([path.join(directory, pattern)], { allowEmpty: true });
    expect(actual).toEqual([]);
  });

  it('不含任何 glob 魔法字符的路径仍按字面路径解析，不经过 glob', async () => {
    const literalPath = path.join(directory, 'plain-name.ts');
    const actual = await findFiles([literalPath]);
    expect(actual).toEqual([path.normalize(path.resolve(literalPath))]);
  });

  it.each([
    ['@(A|B).ts', ['A.ts', 'B.ts']],
    ['+(A|B).ts', ['A.ts', 'B.ts']],
    ['!(B).ts', ['A.ts']]
  ])('按 glob 语义展开 extglob 分组 %s', async (pattern, expected) => {
    const actual = await findFiles([path.join(directory, pattern)]);
    expect(actual.sort()).toEqual(expected.map(file => path.join(directory, file)).sort());
  });

  it('展开目录层级上的 extglob 分组', async () => {
    await Promise.all(['d1', 'd2'].map(dir => mkdir(path.join(directory, dir))));
    await writeFile(path.join(directory, 'd1', 'C.ts'), 'export {};');
    await writeFile(path.join(directory, 'd2', 'D.ts'), 'export {};');

    const actual = await findFiles([path.join(directory, '@(d1|d2)', '*.ts')]);
    expect(actual.sort()).toEqual([path.join(directory, 'd1', 'C.ts'), path.join(directory, 'd2', 'D.ts')].sort());
  });

  it('extglob 零匹配同样遵守 allowEmpty 契约', async () => {
    const pattern = path.join(directory, '@(C|D).ts');
    await expect(findFiles([pattern])).rejects.toThrow('No files matched the entity pattern');
    await expect(findFiles([pattern], { allowEmpty: true })).resolves.toEqual([]);
  });

  it.each(['plain(1).ts', 'file[1.ts'])('glob 不认作魔法的字面名 %s 按字面路径解析', async name => {
    const literalPath = path.join(directory, name);
    await writeFile(literalPath, 'export {};');
    expect(await findFiles([literalPath])).toEqual([path.normalize(path.resolve(literalPath))]);
  });

  // 文件发现与 vite watch 根共用同一套 glob 解析（RV-064）：watch 根只能落在真实存在的字面目录上
  it.each([
    ['@(A|B).ts', []],
    ['+(A|B).ts', []],
    ['*.ts', []],
    ['[AB].ts', []],
    ['{A,B}.ts', []],
    [path.join('@(d1|d2)', '*.ts'), []],
    [path.join('{a,b}', 'c', '*.ts'), []],
    [path.join('sub', '**', '*.ts'), ['sub']]
  ])('watch 根取 %s 第一个魔法段之前的字面目录', (pattern, literal) => {
    expect(getGlobWatchRoot(path.join(directory, pattern))).toBe(path.join(directory, ...literal));
  });

  it('不含魔法的模式以自身为 watch 根', () => {
    const literalPath = path.join(directory, 'plain(1).ts');
    expect(isGlobPattern(literalPath)).toBe(false);
    expect(getGlobWatchRoot(literalPath)).toBe(path.normalize(literalPath));
  });
});
