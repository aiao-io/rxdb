import { base64Decode } from './base64Decode.js';
import { getWebCrypto } from './getWebCrypto.js';

/**
 * 使用 AES-GCM 算法解密数据
 * @param cipherText - Base64 编码的密文字符串
 * @param keyString - Base64 编码的 AES 密钥字符串
 * @param ivString - Base64 编码的初始化向量字符串
 * @returns 解密后的明文字符串
 * @throws {Error} 当解密失败时抛出错误
 * @example
 * const plaintext = await aesDecrypt('encryptedData', 'keyInBase64', 'ivInBase64');
 * console.log(plaintext); // 输出解密后的明文
 * **注意：** 使用 Web Crypto API 进行 AES-GCM 解密
 * **注意：** 密钥长度为 256 位
 * **注意：** 所有输入参数都应为有效的 Base64 字符串
 */
export async function aesDecrypt(cipherText: string, keyString: string, ivString: string) {
  const cryptoApi = getWebCrypto('AES decryption');
  const key = await cryptoApi.subtle.importKey(
    'raw',
    base64Decode(keyString),
    {
      name: 'AES-GCM',
      length: 256
    },
    true,
    ['decrypt']
  );
  const iv = base64Decode(ivString);

  const plaintext = await cryptoApi.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv
    },
    key,
    base64Decode(cipherText)
  );
  return new TextDecoder().decode(plaintext);
}
