/**
 * 将 UTF-8 文本编码为 ArrayBuffer
 *
 * @param str
 */
export function utf8StringToArrayBuffer(str: string) {
  const encoded = new TextEncoder().encode(str);
  return encoded.buffer.slice(encoded.byteOffset, encoded.byteOffset + encoded.byteLength);
}
