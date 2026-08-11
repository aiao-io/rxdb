import { utf8StringToArrayBuffer } from '../string/utf8StringToArrayBuffer.js';
import { base64Decode } from './base64Decode.js';
import { base64Encode } from './base64Encode.js';
import { getWebCrypto } from './getWebCrypto.js';

export function importRsaPublicKey(publicKeyPem: string): Promise<CryptoKey> {
  const cryptoApi = getWebCrypto('RSA encryption');
  // 剥掉头尾标签后再去掉所有空白：PEM 正文按 RFC 7468 折成 64 列（UTL-026），
  // 不能只 trim 两端，也不依赖 atob 对内嵌空白的宽容度。
  const pemContents = publicKeyPem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  return cryptoApi.subtle.importKey(
    'spki',
    base64Decode(pemContents),
    {
      name: 'RSA-OAEP',
      hash: 'SHA-256'
    },
    true,
    ['encrypt']
  );
}

/**
 * RSA 加密
 * @param text 明文
 * @param publicKeyPem PEM 格式公钥
 * @returns Base64 编码密文
 */
export async function rsaEncrypt(text: string, publicKeyPem: string): Promise<string> {
  const cryptoApi = getWebCrypto('RSA encryption');
  const publicKey = await importRsaPublicKey(publicKeyPem);
  const encrypted = await cryptoApi.subtle.encrypt(
    {
      name: 'RSA-OAEP'
    },
    publicKey,
    utf8StringToArrayBuffer(text)
  );
  return base64Encode(encrypted);
}
