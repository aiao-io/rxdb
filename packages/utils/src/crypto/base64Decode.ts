/**
 * base64 解码
 * @param value 字符串
 * @returns 解码后的字节
 */
export const base64Decode = /* @__PURE__ */ (value: string): Uint8Array<ArrayBuffer> => {
  const decode = globalThis.atob;
  if (typeof decode !== 'function') {
    throw new Error('Base64 decoding requires globalThis.atob');
  }
  const decoded = decode(value);
  const bytes = new Uint8Array(decoded.length);
  for (let index = 0; index < decoded.length; index++) {
    bytes[index] = decoded.charCodeAt(index);
  }
  return bytes;
};
