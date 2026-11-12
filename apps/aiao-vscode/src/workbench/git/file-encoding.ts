/** 文本文件路径的启发式判断，与工作台编辑器的可编辑范围保持一致。 */
const textPath =
  /(?:\.(?:[cm]?[jt]sx?|vue|html?|css|json|svg|md|txt|ya?ml|toml|lock)|(?:^|\/)(?:LICENSE|README|\.gitignore))$/i;

/** 按路径启发式把字节解码为编辑器文本；二进制或含 NUL 的字节保持原样。 */
export function decodeFileBytes(path: string, bytes: Uint8Array): string | Uint8Array<ArrayBuffer> {
  if (!textPath.test(path)) return new Uint8Array(bytes);
  try {
    const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
    return text.includes('\0') ? new Uint8Array(bytes) : text;
  } catch {
    return new Uint8Array(bytes);
  }
}

/** 编辑器文本（或二进制字节）的统一 UTF-8 编码。 */
export function encodeFileBytes(value: string | Uint8Array): Uint8Array {
  return typeof value === 'string' ? new TextEncoder().encode(value) : value;
}
