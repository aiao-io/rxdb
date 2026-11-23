/** 导入归档被拒时给用户的提示：Git 工作台只能解码 ZIP（`git-archive.ts`），选 .tar 一定会被后端拒成 `invalid_archive`。 */
export const IMPORT_ARCHIVE_ERROR = '仅支持导入 .zip 仓库归档，请选择 .zip 文件';

const ZIP_EXTENSION = /\.zip$/i;

/** 导入归档得到的仓库名：去掉 `.zip` 扩展名；不是 `.zip` 返回 `null`，调用方据此提示而不是把文件交给后端去失败。 */
export function importedRepositoryName(fileName: string): string | null {
  if (!ZIP_EXTENSION.test(fileName)) return null;
  return fileName.replace(ZIP_EXTENSION, '') || 'Imported Repository';
}
