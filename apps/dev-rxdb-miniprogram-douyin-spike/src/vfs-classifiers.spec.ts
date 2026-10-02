import { DEFAULT_WASM_PATH } from '@aiao/rxdb-adapter-miniprogram';
import { readFileSync } from 'node:fs';
import {
  ADAPTER_DEFAULT_WASM_PATH,
  VFS_ALREADY_EXISTS_PATTERN,
  VFS_MISSING_FILE_PATTERN,
  VFS_QUOTA_EXCEEDED_PATTERN,
  vfsSaysAlreadyExists
} from './vfs-classifiers.js';

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
      `return !isMissingFileError(error) && ${VFS_ALREADY_EXISTS_PATTERN.toString()}.test(errorMessage(error));`
    );
    expect(vfsSource).toContain('if (!isAlreadyExistsError(error)) throw error;');
  });

  it('「撞配额」正则与 wechat-file-vfs.ts 相同', () => {
    expect(vfsSource).toContain(`return ${VFS_QUOTA_EXCEEDED_PATTERN.toString()}.test(errorMessage(error));`);
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
    expect(vfsSaysAlreadyExists('file already exists, mkdirSync ttfile://user/x')).toBe(true);
  });

  it('父目录不存在不算已存在', () => {
    expect(vfsSaysAlreadyExists('no such file or directory, mkdirSync ttfile://user/x')).toBe(false);
    expect(vfsSaysAlreadyExists('parent directory does not exist')).toBe(false);
  });

  it('模拟器与 iOS 实测的配额原文判为撞配额', () => {
    expect(VFS_QUOTA_EXCEEDED_PATTERN.test('writeFileSync:fail user dir saved file size limit exceeded')).toBe(true);
  });
});
