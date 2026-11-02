import type { GitFileVersion } from './git-protocol.js';

/** 严格解码并保留 BOM、CRLF 和末尾换行；二进制只返回说明。 */
export function gitFileVersion(bytes: Uint8Array<ArrayBuffer> | undefined): GitFileVersion {
  if (!bytes) return { exists: false, binary: false, text: null, byteLength: 0 };
  try {
    const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
    if (!text.includes('\0')) return { exists: true, binary: false, text, byteLength: bytes.length };
  } catch {
    return { exists: true, binary: true, text: null, byteLength: bytes.length };
  }
  return { exists: true, binary: true, text: null, byteLength: bytes.length };
}
