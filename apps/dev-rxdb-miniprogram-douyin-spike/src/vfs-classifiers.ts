/**
 * @fileoverview adapter 内部判定逻辑的副本，用来给实验 ③ 的原文打分。
 *
 * 原件在 `packages/rxdb-adapter-miniprogram/src/wechat-file-vfs.ts`，不导出；
 * `vfs-classifiers.spec.ts` 逐字比对源码，原件一改这里就红。
 */

/** `isMissingFileError`：命中即当作「文件不存在」，VFS 返回 false 而不是报错。 */
export const VFS_MISSING_FILE_PATTERN =
  /no such|not exist|doesn['\u2019]?t exist|ENOENT|not found|\u4e0d\u5b58\u5728|\u627e\u4e0d\u5230/i;

/** `mkdirRecursive`：命中即当作「目录已存在」，吞掉错误继续。 */
export const VFS_ALREADY_EXISTS_PATTERN = /exist|already/i;

/** adapter 的 `DEFAULT_WASM_PATH`；页面包不能引 adapter 主入口，只能照抄。 */
export const ADAPTER_DEFAULT_WASM_PATH = 'wa-sqlite/wa-sqlite.wasm';
