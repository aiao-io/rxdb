/**
 * @fileoverview adapter 内部判定逻辑的副本，用来给实验 ③ 的原文与实验 ④ 的失败形态打分。
 *
 * 原件\u5728 `packages/rxdb-adapter-miniprogram/src/wechat-file-vfs.ts`，\u4e0d导出；
 * `vfs-classifiers.spec.ts` 逐字比对源码，原件一改这里就红。
 */

/** `isMissingFileError`：命中即当作「文件\u4e0d\u5b58\u5728」，VFS 返回 false 而\u4e0d是报错。 */
export const VFS_MISSING_FILE_PATTERN =
  /no such|not exist|doesn['\u2019]?t exist|ENOENT|not found|\u4e0d\u5b58\u5728|\u627e\u4e0d\u5230/i;

/** `isAlreadyExistsError` 的正则；先排除缺失类，见 {@link vfsSaysAlreadyExists}。 */
export const VFS_ALREADY_EXISTS_PATTERN = /already exist|file exists|EEXIST|\u5df2\u5b58\u5728/i;

/** `isQuotaExceededError`：命中即当作撞配额，VFS 报 `SQLITE_FULL` 并把平台原文挂\u5728错误的 cause 上。 */
export const VFS_QUOTA_EXCEEDED_PATTERN = /size limit exceeded|storage limit is exceeded/i;

/** `mkdirRecursive` 的判定：\u4e0d是缺失类、且命中「\u5df2\u5b58\u5728」才吞掉错误继续。 */
export function vfsSaysAlreadyExists(text: string): boolean {
  return !VFS_MISSING_FILE_PATTERN.test(text) && VFS_ALREADY_EXISTS_PATTERN.test(text);
}

/** adapter 的 `DEFAULT_WASM_PATH`；页面包\u4e0d能引 adapter 主入口，只能照抄。 */
export const ADAPTER_DEFAULT_WASM_PATH = 'wa-sqlite/wa-sqlite.wasm';
