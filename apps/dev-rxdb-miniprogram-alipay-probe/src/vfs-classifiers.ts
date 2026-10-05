/**
 * @fileoverview adapter 内部判定逻辑的副本，用来给实验 ③ 的原文与实验 ④ 的失败形态打分。
 *
 * 原件在 `packages/rxdb-adapter-miniprogram/src/wechat-file-vfs.ts`，不导出；
 * `vfs-classifiers.spec.ts` 逐字比对源码，原件一改这里就红。
 */

/** `isMissingFileError`：命中即当作「文件不存在」，VFS 返回 false 而不是报错。 */
export const VFS_MISSING_FILE_PATTERN =
  /no such|not exist|doesn['\u2019]?t exist|ENOENT|not found|\u4e0d\u5b58\u5728|\u627e\u4e0d\u5230/i;

/** `isAlreadyExistsError` 的正则；先排除缺失类，见 {@link vfsSaysAlreadyExists}。 */
export const VFS_ALREADY_EXISTS_PATTERN = /already exist|file exists|EEXIST|\u5df2\u5b58\u5728/i;

/** `isQuotaExceededError`：命中即当作撞配额，VFS 报 `SQLITE_FULL` 并把平台原文挂在错误的 cause 上。 */
export const VFS_QUOTA_EXCEEDED_PATTERN = /size limit exceeded|storage limit is exceeded/i;

/** `mkdirRecursive` 的判定：不是缺失类、且命中「已存在」才吞掉错误继续。 */
export function vfsSaysAlreadyExists(text: string): boolean {
  return !VFS_MISSING_FILE_PATTERN.test(text) && VFS_ALREADY_EXISTS_PATTERN.test(text);
}

/** adapter 的 `DEFAULT_WASM_PATH`；页面包不能引 adapter 主入口，只能照抄。 */
export const ADAPTER_DEFAULT_WASM_PATH = 'wa-sqlite/wa-sqlite.wasm';
