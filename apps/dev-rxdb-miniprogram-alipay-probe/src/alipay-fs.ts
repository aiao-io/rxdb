/**
 * @fileoverview 探针自己用的同步 FS：不分帧，读写与列目录看到的都是落盘原样。
 *
 * 交给 adapter 的是正式 host 的 FS（`host.getFileSystemManager()`，每个用户文件垫 1 字节帧头）；
 * 这一层只给探针清理实验目录、列库文件、测配额计费用。失败返回值转抛错与错误码归一复用正式 host 的
 * `unwrapAlipayFsResult`，写入一律走「base64 串 + `'base64'`」（v2 探针模拟器与 iOS 实测只有它两端字节一致）。
 */
import type { MiniProgramFileSystemManager } from '@aiao/rxdb-adapter-miniprogram/runtime';
import type { AlipayApi, AlipayRawFileSystem, AlipayStats } from './alipay-api.js';
import type { DatabaseFile } from './core-contract.js';
import { unwrapAlipayFsResult } from './official-host.js';

/** 探针的文件系统：adapter 契约之外，再加清理与列目录。 */
export interface AlipayProbeFileSystem extends MiniProgramFileSystemManager {
  rmdirSync(path: string, recursive?: boolean): void;
  statSync(path: string): AlipayStats;
  readdirSync(path: string): string[];
}

function typeTag(value: unknown): string {
  return Object.prototype.toString.call(value);
}

/** 从成功结果里取字段并核对类型；形状不对就报出实际形状，不猜。 */
function field(method: string, path: string, result: unknown, key: string, tag: string): unknown {
  const value: unknown = typeof result === 'object' && result !== null ? Reflect.get(result, key) : undefined;
  if (typeTag(value) !== tag) {
    throw new Error(`${method} ${path} 返回的 ${key} 是 ${typeTag(value)}，期望 ${tag}：${typeTag(result)}`);
  }
  return value;
}

function isStats(value: unknown): value is AlipayStats {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof Reflect.get(value, 'size') === 'number' &&
    typeof Reflect.get(value, 'isDirectory') === 'function'
  );
}

/** 包装原始 FS；`my` 只用来做 base64 转换。 */
export function wrapAlipayFileSystem(
  raw: AlipayRawFileSystem,
  my: Pick<AlipayApi, 'arrayBufferToBase64'>
): AlipayProbeFileSystem {
  const readBinarySync = (path: string): ArrayBuffer => {
    const result = unwrapAlipayFsResult('readFileSync', path, raw.readFileSync(path));
    // IDE 模拟器返回别的 realm 的 ArrayBuffer，instanceof 恒为假，只能看内部标签
    return field('readFileSync', path, result, 'data', '[object ArrayBuffer]') as ArrayBuffer;
  };
  return {
    accessSync: path => void unwrapAlipayFsResult('accessSync', path, raw.accessSync(path)),
    mkdirSync: (path, recursive) => void unwrapAlipayFsResult('mkdirSync', path, raw.mkdirSync(path, recursive)),
    readFileSync: path => my.arrayBufferToBase64(readBinarySync(path)),
    writeFileSync: (path, data) =>
      void unwrapAlipayFsResult('writeFileSync', path, raw.writeFileSync(path, my.arrayBufferToBase64(data), 'base64')),
    unlinkSync: path => void unwrapAlipayFsResult('unlinkSync', path, raw.unlinkSync(path)),
    rmdirSync: (path, recursive) => void unwrapAlipayFsResult('rmdirSync', path, raw.rmdirSync(path, recursive)),
    statSync: path => {
      const stats: unknown = Reflect.get(Object(unwrapAlipayFsResult('statSync', path, raw.statSync(path))), 'stats');
      if (!isStats(stats)) throw new Error(`statSync ${path} 返回的 stats 不是 Stats：${typeTag(stats)}`);
      return stats;
    },
    readdirSync: path => {
      const result = unwrapAlipayFsResult('readdirSync', path, raw.readdirSync(path));
      return (field('readdirSync', path, result, 'files', '[object Array]') as unknown[]).map(String);
    }
  };
}

/** 递归列出 `root` 下的文件与落盘大小；路径相对 `root`、以 `/` 开头（与抖音 `statSync(root, true)` 同形）。 */
export function listFiles(fileSystem: AlipayProbeFileSystem, root: string, prefix = ''): DatabaseFile[] {
  return fileSystem.readdirSync(`${root}${prefix}`).flatMap(name => {
    const relative = `${prefix}/${name}`;
    const stats = fileSystem.statSync(`${root}${relative}`);
    return stats.isDirectory() ? listFiles(fileSystem, root, relative) : [{ path: relative, size: stats.size }];
  });
}
