/**
 * 将二进制字符串逐字符映射为字节 ArrayBuffer
 *
 * @param str
 */
export function stringToArrayBuffer(str: string) {
  const bytes = new Uint8Array(str.length);
  for (let index = 0; index < str.length; index += 1) {
    bytes[index] = str.charCodeAt(index);
  }
  return bytes.buffer;
}
