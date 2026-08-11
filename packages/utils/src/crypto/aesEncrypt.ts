import { base64Encode } from './base64Encode.js';
import { getWebCrypto } from './getWebCrypto.js';

async function generateAesKey(cryptoApi: Crypto) {
  const key = await cryptoApi.subtle.generateKey(
    {
      name: 'AES-GCM',
      length: 256
    },
    true,
    ['encrypt', 'decrypt']
  );

  return key;
}

async function exportCryptoKey(cryptoApi: Crypto, key: CryptoKey) {
  const exported = await cryptoApi.subtle.exportKey('raw', key);
  return base64Encode(exported);
}

/**
 * AES 加密
 * @param text 明文
 * @returns 加密结果。返回的 key 必须与密文分开存储并独立保护
 */
export async function aesEncrypt(text: string) {
  const cryptoApi = getWebCrypto('AES encryption');
  const ec = new TextEncoder();
  const key = await generateAesKey(cryptoApi);
  const iv = cryptoApi.getRandomValues(new Uint8Array(12));
  const decrypted = await cryptoApi.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv
    },
    key,
    ec.encode(text)
  );
  return {
    key: await exportCryptoKey(cryptoApi, key),
    iv: base64Encode(iv),
    cipherText: base64Encode(decrypted)
  };
}
