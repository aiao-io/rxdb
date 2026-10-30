import { realpathSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import type { RxDBClientCLIentGeneratorOptions } from './cli.interface.js';

/**
 * 解析路径的物理形态：最近一个存在的祖先做 realpath，尚不存在的后续段原样拼回。
 *
 * @remarks
 * 输出目录首次生成前往往还不存在，对整条路径 realpath 必然失败；就此退回词法路径的话，
 * 经父目录软链的两个别名（`physical/generated` 与 `alias/generated`）得到两个不同的结果，
 * 而目录一旦建出来它们就是同一个物理目录。配置唯一性校验、按输出目录串行化的构建队列与
 * dev server 的 watcher 共用这一个判据：任何一处换成别的口径，同一组配置在
 * 「目录已存在 / 尚不存在」两种状态下就会得出不同结论。
 *
 * 用 `realpathSync.native`：大小写不敏感的文件系统上它给出磁盘上的规范大小写，已存在的
 * `Generated` 与 `generated` 才会落到同一个结果；尚不存在的后续段无从得知规范大小写，按原样保留。
 *
 * 悬空软链（条目在、目标不在）不展开，它与其后的段按词法保留：单独写进悬空软链时
 * `mkdirSync` 以 ENOENT 失败、不会落盘；要与另一个配置撞进同一目录，须刻意布置一条指向对方
 * outDir 的悬空链接，按配置错误处理，不为此在这里解析链接内容。
 *
 * @param filePath - 绝对路径，或相对 `process.cwd()` 的路径
 * @returns 规范化的绝对物理路径；整条链上没有可 realpath 的祖先时返回词法绝对路径
 */
export const resolvePhysicalPath = (filePath: string): string => {
  const absolute = resolve(filePath);
  const pendingSegments: string[] = [];
  let probe = absolute;
  for (;;) {
    try {
      return resolve(realpathSync.native(probe), ...pendingSegments);
    } catch {
      const parent = dirname(probe);
      // 到文件系统根仍不存在（如 Windows 上不存在的盘符）：没有可 realpath 的祖先
      if (parent === probe) return absolute;
      pendingSegments.unshift(basename(probe));
      probe = parent;
    }
  }
};

/**
 * 多配置入口的输出目录必须互不相同（按 {@link resolvePhysicalPath} 的物理路径比较）。
 *
 * @remarks
 * CLI 加载配置与 Vite 插件创建时调用，先于任何写入：两个配置落进同一物理目录时，
 * 后一个构建会读到前一个的 manifest，把对方的产物当陈旧文件删掉。
 *
 * @param configs - 已解析的生成配置
 * @throws {Error} 任意两个配置的 `outDir` 解析到同一物理目录
 */
export const validateUniqueConfigOutDirs = (configs: readonly RxDBClientCLIentGeneratorOptions[]): void => {
  const outDirs = new Map<string, number>();
  configs.forEach((configEntry, index) => {
    const key = resolvePhysicalPath(configEntry.outDir);
    const existing = outDirs.get(key);
    if (existing !== undefined) {
      throw new Error(
        'Config entries ' + existing + ' and ' + index + ' resolve to the same outDir: ' + configEntry.outDir
      );
    }
    outDirs.set(key, index);
  });
};
