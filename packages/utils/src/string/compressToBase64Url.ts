import { base64Encode } from '../crypto/base64Encode.js';

/**
 * 压缩字符串到 URL 安全的 Base64
 * @param value 待压缩字符串
 * @param format 压缩格式
 * @returns URL 安全的 Base64 字符串
 */
export const compressToBase64Url = async (
  value: string,
  format: 'deflate' | 'deflate-raw' | 'gzip' = 'deflate'
): Promise<string> => {
  const CompressionStreamConstructor = globalThis.CompressionStream;
  if (typeof CompressionStreamConstructor !== 'function') {
    throw new Error('CompressionStream is not available in this environment');
  }

  const compressionStream = new CompressionStreamConstructor(format);

  // 必须**并发**地写入与读出：TransformStream 的内部队列有高水位，写满后 writer 会等读端泄压。
  // 先 `await writer.close()` 再 `getReader()` 的写法，在输出超过高水位时就是写端等读端、
  // 读端还没启动 —— 永久互等。`Response(stream.readable).arrayBuffer()` 内部并发抽干 readable，
  // 与写入同时进行；`Promise.all` 让写入错误也能正常传播（UTL-002）。
  const [compressedBuffer] = await Promise.all([
    new Response(compressionStream.readable).arrayBuffer(),
    (async () => {
      const writer = compressionStream.writable.getWriter();
      try {
        await writer.write(new TextEncoder().encode(value));
        await writer.close();
      } catch (error) {
        // 失败时主动 abort，否则 writable 永久持锁、readable 永不收到终止信号
        await writer.abort(error).catch(() => undefined);
        throw error;
      }
    })()
  ]);
  const compressedData = new Uint8Array(compressedBuffer);

  return base64Encode(compressedData).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
