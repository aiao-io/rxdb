import { base64Decode } from './base64Decode.js';
import { getWebCrypto } from './getWebCrypto.js';

function importPrivateKey(privateKeyPem: string): Promise<CryptoKey> {
  const cryptoApi = getWebCrypto('RSA decryption');
  // 剥掉头尾标签后再去掉所有空白：PEM 正文按 RFC 7468 折成 64 列（UTL-026），
  // 不能只 trim 两端，也不依赖 atob 对内嵌空白的宽容度。
  const pemContents = privateKeyPem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  return cryptoApi.subtle.importKey(
    'pkcs8',
    base64Decode(pemContents),
    {
      name: 'RSA-OAEP',
      hash: 'SHA-256'
    },
    true,
    ['decrypt']
  );
}

/**
 * RSA 解密
 * @param cipherText Base64 编码密文
 * @param privateKeyPem PEM 格式私钥
 * @returns 解密后的明文
 */
export async function rsaDecrypt(cipherText: string, privateKeyPem: string): Promise<string> {
  const cryptoApi = getWebCrypto('RSA decryption');
  const privateKey = await importPrivateKey(privateKeyPem);
  const decrypted = await cryptoApi.subtle.decrypt(
    {
      name: 'RSA-OAEP'
    },
    privateKey,
    base64Decode(cipherText)
  );
  return new TextDecoder().decode(decrypted);
}
