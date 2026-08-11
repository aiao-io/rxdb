import { base64Decode } from '../crypto/base64Decode.js';

/**
 * 从 URL 安全的 Base64 解压字符串
 * @param value URL 安全的 Base64 字符串
 * @param format 压缩格式
 * @returns 解压后的字符串
 */
export const decompressFromBase64Url = async (
  value: string,
  format: 'deflate' | 'deflate-raw' | 'gzip' = 'deflate'
): Promise<string> => {
  const DecompressionStreamConstructor = globalThis.DecompressionStream;
  if (typeof DecompressionStreamConstructor !== 'function') {
    throw new Error('DecompressionStream is not available in this environment');
  }

  let base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  base64 += '='.repeat((4 - (base64.length % 4)) % 4);

  const decompressionStream = new DecompressionStreamConstructor(format);

  // 必须**并发**地写入与读出：TransformStream 的内部队列有高水位，写满后 writer 会等读端泄压。
  // 先 `await writer.close()` 再 `getReader()` 的写法，在输出超过高水位时就是写端等读端、
  // 读端还没启动 —— 永久互等。`Response(stream.readable).arrayBuffer()` 内部并发抽干 readable，
  // 与写入同时进行；`Promise.all` 让写入错误也能正常传播（UTL-002）。
  const [decompressedBuffer] = await Promise.all([
    new Response(decompressionStream.readable).arrayBuffer(),
    (async () => {
      const writer = decompressionStream.writable.getWriter();
      try {
        await writer.write(base64Decode(base64));
        await writer.close();
      } catch (error) {
        await writer.abort(error).catch(() => undefined);
        throw error;
      }
    })()
  ]);

  return new TextDecoder().decode(new Uint8Array(decompressedBuffer));
};
