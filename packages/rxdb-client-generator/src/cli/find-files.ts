/**
 * @fileoverview 文件查找工具
 * 支持 glob 模式匹配和路径规范化
 *
 * @module rxdb-client-generator/cli/find-files
 */

import { Glob, glob, hasMagic } from 'glob';
import { join, normalize, resolve } from 'node:path';

export interface FindFilesOptions {
  /** 允许某个 glob 模式零匹配。默认 `false`，零匹配即报错并指出是哪个模式（RCG-003）。 */
  allowEmpty?: boolean;
}

/** 与下面的 glob 调用同一套解析：花括号也算魔法（展开交给 glob），extglob 默认开启。 */
const GLOB_PARSE_OPTIONS = { magicalBraces: true, windowsPathsNoEscape: true } as const;

type GlobPattern = Glob<typeof GLOB_PARSE_OPTIONS>['patterns'][number];

/**
 * 模式是否需要交给 glob 展开。
 *
 * @remarks
 * 直接问 glob 自己的解析器，与 `plugins/vite.ts` 的 watch 根共用同一判定（RV-064）。
 * 自拟的字符表认不出 `@(A|B)`、`+(A|B)` 这类 extglob（被当成不存在的字面文件），
 * 又会把不成对的 `[` 误当魔法。
 */
export const isGlobPattern = (pattern: string): boolean => hasMagic(pattern, GLOB_PARSE_OPTIONS);

const literalSegments = (pattern: GlobPattern): string[] => {
  const segments: string[] = [];
  for (let current: GlobPattern | null = pattern; current?.hasMore() && current.isString(); current = current.rest()) {
    segments.push(current.pattern() as string);
  }
  return segments;
};

const sharedPrefix = (left: string[], right: string[]): string[] => {
  const length = left.findIndex((segment, index) => segment !== right[index]);
  return length === -1 ? left.slice(0, right.length) : left.slice(0, length);
};

/**
 * 模式第一个魔法段之前的字面目录；不含魔法时返回规范化后的模式本身。
 *
 * @remarks
 * 花括号可能展开出多个字面前缀，取公共目录：watch 根只能放宽，不能落到不存在的字面路径上。
 */
export const getGlobWatchRoot = (pattern: string): string => {
  if (!isGlobPattern(pattern)) return normalize(pattern);
  const [first = [], ...rest] = new Glob(pattern, GLOB_PARSE_OPTIONS).patterns.map(literalSegments);
  return normalize(join(...rest.reduce(sharedPrefix, first)));
};

/**
 * 查找匹配的文件
 * @param filePaths - 文件路径数组，支持 glob 模式
 * @param options - 查找选项
 * @returns 规范化后的绝对路径数组
 * @throws {Error} 某个 glob 模式零匹配且未开启 `allowEmpty`
 */
export default async (filePaths: string[], options: FindFilesOptions = {}): Promise<string[]> => {
  const allFiles: string[] = [];
  for (const filePath of filePaths) {
    if (!isGlobPattern(filePath)) {
      // 对于非 glob 路径，直接解析并规范化
      allFiles.push(normalize(resolve(filePath)));
      continue;
    }

    let files: string[];
    try {
      // 使用 glob 查找文件
      // Windows 兼容：glob 库会自动处理路径分隔符
      files = await glob(filePath, {
        absolute: true,
        // Windows 兼容：在 Windows 上也使用正斜杠
        windowsPathsNoEscape: true,
        ignore: ['**/node_modules/**', '**/dist/**', '**/build/**', '**/.git/**']
      });
    } catch (error) {
      console.error(`处理路径 ${filePath} 时出错:`, error);
      throw error;
    }

    // 零匹配几乎总是模式写错或目录结构变了。聚合成空集会让调用方看到
    // 「成功但没有实体」，进而删除上一次的正确产物（RCG-003）。
    // 校验放在 catch 之外：这不是「glob 处理出错」，不该套上那条日志。
    if (files.length === 0 && !options.allowEmpty) {
      throw new Error(`No files matched the entity pattern: ${filePath}`);
    }
    // 规范化所有找到的文件路径
    allFiles.push(...files.map(f => normalize(f)));
  }

  // 去重并返回
  return [...new Set(allFiles)];
};
