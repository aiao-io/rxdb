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

describe('支付宝实测的错误文案（v2 探针，模拟器与 iOS）', () => {
  it('10022「文件不存在」「目录不存在」原文就能判为不存在', () => {
    expect(VFS_MISSING_FILE_PATTERN.test('文件不存在')).toBe(true);
    expect(VFS_MISSING_FILE_PATTERN.test('目录不存在')).toBe(true);
  });

  it('10025「有同名文件或目录」原文判不出已存在：包装层必须归一文案', () => {
    expect(vfsSaysAlreadyExists('有同名文件或目录')).toBe(false);
    expect(vfsSaysAlreadyExists('file already exists: 有同名文件或目录 (mkdirSync https://usr/x, error 10025)')).toBe(true);
  });

  it('10028 的文档原文判不出撞配额：包装层必须归一文案', () => {
    const raw = '写入文件单个超过 10M 或者写入文件夹超过 50M';
    expect(VFS_QUOTA_EXCEEDED_PATTERN.test(raw)).toBe(false);
    expect(VFS_QUOTA_EXCEEDED_PATTERN.test(`size limit exceeded: ${raw} (writeFileSync https://usr/x, error 10028)`)).toBe(true);
  });
});
