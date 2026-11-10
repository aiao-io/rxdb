/** 规整库里的扩展名：去掉前导点与首尾空白，空串视为没有扩展名（与 React 端 `file-name.ts` 同一口径）。 */
export function normalizeFileExtension(extension: string | null | undefined): string | null {
  const normalized = extension?.replace(/^\.+/, '').trim();
  return normalized || null;
}

/** 用户看到、也用来搜索与判重的完整文件名：库里的扩展名不带点，这里补一个。 */
export function formatFileName(name: string, extension: string | null | undefined): string {
  const normalized = normalizeFileExtension(extension);
  return normalized ? `${name}.${normalized}` : name;
}
