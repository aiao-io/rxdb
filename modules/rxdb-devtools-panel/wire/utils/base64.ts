/**
 * 二进制数据 / Base64 互转工具
 */

const CHUNK_SIZE = 8192;

/**
 * 将 Uint8Array 转为 base64 字符串（分块处理以避免 apply 参数过多）
 */
export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK_SIZE));
  }
  return btoa(binary);
}

/**
 * 将 base64 字符串解码为 Uint8Array（基于独立 ArrayBuffer，可直接用于 FileSystemWritableFileStream.write）
 */
export function base64ToBytes(base64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
