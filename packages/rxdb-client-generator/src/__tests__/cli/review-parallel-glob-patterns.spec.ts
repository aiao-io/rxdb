import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import findFiles from '../../cli/find-files.js';

describe('实体模式使用完整 glob 语法', () => {
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
});
