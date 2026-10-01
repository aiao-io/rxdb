import { DEFAULT_WASM_PATH } from '@aiao/rxdb-adapter-miniprogram';
import { readFileSync } from 'node:fs';
import { ADAPTER_DEFAULT_WASM_PATH, VFS_ALREADY_EXISTS_PATTERN, VFS_MISSING_FILE_PATTERN } from './vfs-classifiers.js';

const vfsSource = readFileSync(
  new URL('../../../packages/rxdb-adapter-miniprogram/src/wechat-file-vfs.ts', import.meta.url),
  'utf8'
);

describe('与 adapter 的判定逻辑逐字一致（防漂移）', () => {
  it('「文件不存在」正则与 wechat-file-vfs.ts 相同', () => {
    expect(vfsSource).toContain(`return ${VFS_MISSING_FILE_PATTERN.toString()}.test(`);
  });

  it('「目录已存在」正则与 wechat-file-vfs.ts 相同', () => {
    expect(vfsSource).toContain(
      `if (!${VFS_ALREADY_EXISTS_PATTERN.toString()}.test(errorMessage(error))) throw error;`
    );
  });

  it('默认 wasm 路径与 adapter 的 DEFAULT_WASM_PATH 相同', () => {
    expect(ADAPTER_DEFAULT_WASM_PATH).toBe(DEFAULT_WASM_PATH);
  });
});

describe('抖音文档里的错误文案', () => {
  it.each([
    'no such file or directory, accessSync ttfile://user/x',
    'no such file or directory, unlinkSync ttfile://user/x'
  ])('%s 判为不存在', errMsg => {
    expect(VFS_MISSING_FILE_PATTERN.test(errMsg)).toBe(true);
  });

  it('file already exists 判为已存在', () => {
    expect(VFS_ALREADY_EXISTS_PATTERN.test('file already exists, mkdirSync ttfile://user/x')).toBe(true);
  });
});
