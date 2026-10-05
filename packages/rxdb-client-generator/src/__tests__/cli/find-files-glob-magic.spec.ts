import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import findFiles, { GLOB_MAGIC } from '../../cli/find-files.js';

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

  it('GLOB_MAGIC 与 plugins/vite.ts 共用同一判定，覆盖全部魔法字符', () => {
    // 这里直接断言正则字符集，防止两处判定（find-files 的「是否当 glob 处理」
    // 与 vite.ts 的 watch 根计算）未来被分别修改导致语义再次分叉（RV-064）。
    for (const magicChar of ['*', '?', '[', ']', '{', '}']) {
      expect(GLOB_MAGIC.test(`entity${magicChar}.ts`)).toBe(true);
    }
    expect(GLOB_MAGIC.test('entity.ts')).toBe(false);
  });
});
