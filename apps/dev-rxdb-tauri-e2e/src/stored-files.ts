/**
 * 从应用数据目录里把「真的落在原生文件上」这件事查出来（US-505 AC#1 / AC#3 / AC#6）。
 *
 * @remarks
 * 两套用例都要做同一件事：到存储根下把普通文件捞出来算 sha256，与报告里的摘要对。
 * 各写一份的话，某天一边改了「要不要递归」或「算不算符号链接」，两边会给出不同的答案，
 * 而那种分歧会以「某个平台偶发地少一个文件」的形态出现。
 *
 * @module stored-files
 */

import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { FILE_STORAGE_DIR } from './packaged-app';

/**
 * 递归收集目录下的普通文件。
 *
 * @param dir - 起始目录
 * @returns 全部普通文件的绝对路径
 *
 * @remarks
 * 目录进去，符号链接等非普通项忽略 —— 存储插件不会造它们，出现了也不是文件内容。
 */
export const collectFiles = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return collectFiles(path);
    return entry.isFile() ? [path] : [];
  });

/**
 * 收集应用数据目录里全部的文件内容。
 *
 * @param dataDir - 应用数据根目录
 * @returns 存储根下全部普通文件的绝对路径
 *
 * @remarks
 * 只往下走到 {@link FILE_STORAGE_DIR} 这一层就开始递归收集，**不拼**更深的路径：
 * `rootDir`（`files/`）与物理文件名的编码方式都是存储插件的内部约定，写进用例就等于把
 * 实现细节钉进断言，改一次编码就红一次。
 */
export const collectStoredFiles = (dataDir: string): string[] => collectFiles(join(dataDir, FILE_STORAGE_DIR));

/**
 * 算一个文件内容的 sha256。
 *
 * @param path - 文件绝对路径
 * @returns 小写十六进制摘要，与 renderer 侧 `storage-probe.ts` 的 `sha256Hex` 同一口径
 */
export const sha256OfFile = (path: string): string => createHash('sha256').update(readFileSync(path)).digest('hex');
