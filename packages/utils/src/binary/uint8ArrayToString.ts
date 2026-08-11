let textDecoder: TextDecoder | undefined;

/**
 * 将Uint8Array转换为UTF-8字符串
 * 使用TextDecoder API进行解码，确保正确处理多字节字符
 *
 * @example
 * const bytes = new Uint8Array([72, 101, 108, 108, 111]);
 * uint8ArrayToString(bytes); // 返回 'Hello'
 * @param u8 - 要转换的Uint8Array实例
 * @returns 解码后的UTF-8字符串
 * **注意：** 使用默认的UTF-8编码，不支持其他字符编码
 */
export const uint8ArrayToString = (u8: Uint8Array) => (textDecoder ??= new TextDecoder()).decode(u8);
